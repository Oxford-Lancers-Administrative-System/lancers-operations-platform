import "server-only";

import crypto from "node:crypto";

import {
  ConstraintViolated,
  InvalidTransition,
  isServiceError,
  withTransaction,
  type Tx,
} from "@/lib/db";
import {
  resolveDeliveryProvider,
  rsvpUrl,
  type DeliveryProvider,
  type Transport,
} from "@/lib/delivery";
import type { EnvironmentSource, OutboundConfig } from "@/lib/delivery/config";
import { RECIPIENT_NOT_PERMITTED_REASON, recipientPermitted } from "@/lib/delivery/allowlist";
import { NO_USABLE_NUMBER_REASON, selectMobileNumber } from "@/lib/delivery/phone";
import type { InvitationMessage, ProviderCallbackEvent } from "@/lib/delivery/provider";
import { recordAudit } from "./audit";
import { issueTokenIn, revokeTokensIn } from "./rsvp-tokens";

/**
 * Automated delivery. LAN-78.
 *
 * ## The shape, and why it is three transactions rather than one
 *
 * Sending is network I/O, and network I/O must never happen with a transaction
 * open — a provider that takes thirty seconds to time out would hold a
 * PostgreSQL connection and its row locks for thirty seconds, and the pool has
 * ten. So one attempt is:
 *
 *   1. **Claim.** Take the job, mint the token, write the attempt row. Commit.
 *   2. **Send.** No transaction, no locks.
 *   3. **Record.** Write what happened. Commit.
 *
 * A crash between 1 and 3 leaves a job `processing` with an attempt that was
 * requested and never concluded. That is deliberately visible rather than
 * silently reset: the migration's comment on `claimed_at` says a stuck job must
 * be visible, and the operator surface shows it as **Attempted**, which is
 * exactly what is true — we asked, and we do not know what happened.
 *
 * ## Why the token is minted at dispatch and not at approval
 *
 * The plaintext exists only in memory. Nothing can read it back, by design. So
 * the only moment a token can be issued is the moment it is about to be put
 * into a message — issuing at approval would produce a hash nobody could ever
 * turn into a link, and the dispatcher would have to supersede it and mint
 * another anyway.
 *
 * The practical guarantee LAN-78 asks for — every invitation created by
 * approval gets a link — is met because approval triggers dispatch
 * automatically, not because a row is written earlier. An invitation whose
 * dispatch has not run yet honestly has no token, and its operator state is
 * **Queued**.
 *
 * ## Why every repair is a reissue
 *
 * Retrying a failed delivery cannot resend the previous link, because nobody
 * holds it. Each attempt therefore issues a fresh token and supersedes its
 * predecessor, which is also precisely Brian's decided reissue behaviour and
 * keeps "at most one live token per invitation" true throughout.
 *
 * ## What this module cannot do, structurally
 *
 * It never inserts an `invitations` row and never touches
 * `event_audience_members`. Retry and reissue both take an existing job or an
 * existing invitation and act on it. There is no code path here through which a
 * late recipient could be added after approval, which is what LAN-77's audience
 * freeze requires and what this issue's acceptance criteria restate.
 *
 * And there is no manual path. No function here records a `manual` delivery,
 * no screen offers one, and `delivery_attempts` refuses the `manual` channel at
 * the database. A human phoning somebody remains recordable in
 * `delivery_results` by whatever later issue needs it — that is a record of a
 * person acting, not a delivery this system performed.
 */

/**
 * How many times one invitation may be attempted before it stops being
 * retryable and becomes a failure a human has to look at.
 *
 * Five. Not a club policy and not an owner decision — it is the point at which
 * "the provider is briefly unhappy" stops being the likely explanation. A
 * failure that survives five attempts needs somebody to read the reason, which
 * is what the **Failed** state is for.
 */
export const MAX_ATTEMPTS = 5;

/**
 * How long one approval's whole dispatch may take before the rest is left for
 * later.
 *
 * Ninety seconds — comfortably inside Cloud Run's default request limit, and
 * long enough that a healthy provider finishes an ordinary audience well within
 * it. What it bounds is the unhealthy case, where the per-call deadline alone
 * would multiply by the number of invitees.
 */
export const DISPATCH_BUDGET_MS = 90_000;

/** The audit actor for automated work. Never a person. */
export const DISPATCH_ACTOR_LABEL = "system: automated delivery";

/**
 * The value one dispatcher writes to `notification_jobs.claimed_by`.
 *
 * A **fencing token**, not a constant. It was the constant above, which meant
 * the guard on `recordDispatchFailure` — `claimed_by is null or claimed_by =
 * <constant>` — was true for every row the system can produce, because that
 * constant is the only non-null value anything ever writes there. The predicate
 * read like a concurrency guard and discriminated nothing.
 *
 * With a token per dispatch, a second worker's claim writes a different value,
 * the predicate stops matching, and the late failure write really is refused
 * rather than stamping `failed` over a send that is in flight.
 */
function dispatchClaim(): string {
  return `${DISPATCH_ACTOR_LABEL}:${crypto.randomUUID()}`;
}

export const JOB_NOT_RETRYABLE_RULE = "delivery_job_not_retryable";
export const JOB_NOT_FOUND_RULE = "delivery_job_not_found";

/** The provider-neutral vocabulary LAN-90 fixed. Exactly these five. */
export type DeliveryState = "queued" | "attempted" | "delivered" | "failed" | "retryable";

export interface DispatchSummary {
  readonly attempted: number;
  readonly accepted: number;
  readonly refused: number;
  /** Jobs another worker already held, or that had exhausted their attempts. */
  readonly skipped: number;
}

/** Everything one attempt needs, read once inside the claiming transaction. */
interface ClaimedAttempt {
  readonly jobId: string;
  readonly invitationId: string;
  readonly attemptId: string;
  readonly attemptNumber: number;
  readonly message: InvitationMessage;
}

type ClaimOutcome =
  | { readonly claimed: true; readonly attempt: ClaimedAttempt }
  | { readonly claimed: false; readonly reason: "unavailable" }
  | { readonly claimed: false; readonly reason: "undeliverable"; readonly detail: string };

/**
 * Claims one job and prepares its message, or explains why it cannot.
 *
 * The `update … where status in (…)` is the concurrency control. Two instances
 * dispatching the same event race here, one wins the row, and the loser sees
 * `rowCount === 0` and moves on — which is what makes running this twice
 * produce one message rather than two, alongside the idempotency key that
 * stopped a second *job* ever existing.
 */
async function claimJobIn(
  tx: Tx,
  jobId: string,
  config: OutboundConfig,
  provider: DeliveryProvider,
  claim: string,
): Promise<ClaimOutcome> {
  const claimed = await tx.query<{
    id: string;
    invitation_id: string | null;
    attempt_count: number;
  }>(
    `update public.notification_jobs
        set status = 'processing',
            claimed_at = now(),
            claimed_by = $2,
            attempt_count = attempt_count + 1,
            -- Cleared, because it describes the attempt that just ended and a
            -- new one has begun. Leaving it meant the repair screen rendered
            -- "Latest result: Attempted" directly above the *previous*
            -- failure's reason, for a message the provider had just accepted:
            -- a wrong diagnostic on the one screen that exists to give an
            -- operator a true one, reached by the commonest repair path.
            last_error = null,
            updated_at = now()
      where id = $1
        and status in ('pending', 'ready', 'failed')
        and attempt_count < $3
        and invitation_id is not null
      returning id, invitation_id, attempt_count`,
    [jobId, claim, MAX_ATTEMPTS],
  );

  const job = claimed.rows[0];
  if (!job || !job.invitation_id) return { claimed: false, reason: "unavailable" };

  const details = await tx.query<{
    invitation_id: string;
    event_id: string;
    event_name: string;
    when_label: string;
    given_name: string;
    known_as: string | null;
    person_id: string;
  }>(
    `select i.id as invitation_id,
            e.id as event_id,
            e.name as event_name,
            to_char(
              (e.scheduled_on + coalesce(e.starts_at, '00:00'::time)) at time zone 'Europe/London'
                at time zone 'Europe/London',
              'FMDay FMDD FMMonth, HH24:MI') as when_label,
            p.id as person_id, p.given_name, p.known_as
       from public.invitations i
       join public.events e on e.id = i.event_id
       left join public.season_memberships m on m.id = i.season_membership_id
       join public.people p on p.id = coalesce(i.person_id, m.person_id)
      where i.id = $1`,
    [job.invitation_id],
  );

  const detail = details.rows[0];
  if (!detail) return { claimed: false, reason: "undeliverable", detail: NO_USABLE_NUMBER_REASON };

  const contacts = await tx.query<{
    kind: string;
    raw_value: string;
    normalised_value: string | null;
    is_preferred: boolean;
  }>(
    // Ordered, because `selectMobileNumber` promises "the contact the club
    // marked preferred, then the most recently recorded current one" and an
    // unordered read makes the second half whatever PostgreSQL happens to
    // return. Sending to an arbitrary one of somebody's two numbers is the kind
    // of wrong that looks like working software.
    `select kind::text as kind, raw_value, normalised_value, is_preferred
       from public.contact_points
      where person_id = $1
        and valid_from <= current_date
        and (valid_until is null or valid_until > current_date)
      order by is_preferred desc, valid_from desc, created_at desc, id`,
    [detail.person_id],
  );

  const recipient = selectMobileNumber(
    contacts.rows.map((row) => ({
      kind: row.kind,
      rawValue: row.raw_value,
      normalisedValue: row.normalised_value,
      isPreferred: row.is_preferred,
    })),
    config.defaultCallingCode,
  );

  // Refused before a token is minted. Issuing a link that cannot be sent would
  // supersede a previous, possibly working one for nothing.
  if (!recipient)
    return { claimed: false, reason: "undeliverable", detail: NO_USABLE_NUMBER_REASON };

  // LAN-124. Also before a token is minted, and for a stronger reason: a person
  // this deployment may not message must not have a live RSVP link in existence
  // at all. Refusing at the send would leave a working link that had been
  // issued, recorded and superseded whatever came before it.
  if (!recipientPermitted(recipient, config.recipientAllowlist, config.defaultCallingCode)) {
    return { claimed: false, reason: "undeliverable", detail: RECIPIENT_NOT_PERMITTED_REASON };
  }

  const token = await issueTokenIn(tx, job.invitation_id, { actorLabel: DISPATCH_ACTOR_LABEL });

  const attempt = await tx.query<{ id: string }>(
    `insert into public.delivery_attempts
       (notification_job_id, attempt_number, channel, provider, rsvp_access_token_id)
     values ($1, $2, $3, $4, $5)
     returning id`,
    [jobId, job.attempt_count, provider.channel, provider.name, token.tokenId],
  );

  const known = detail.known_as?.trim();

  return {
    claimed: true,
    attempt: {
      jobId,
      invitationId: job.invitation_id,
      attemptId: attempt.rows[0].id,
      attemptNumber: job.attempt_count,
      message: {
        recipient,
        inviteeName: known && known !== "" ? known : detail.given_name,
        eventName: detail.event_name,
        whenLabel: detail.when_label.replace(/\s+/g, " ").trim(),
        // The one place the plaintext token becomes a URL, and the last place
        // it exists at all.
        rsvpUrl: rsvpUrl(config.appBaseUrl, token.token),
      },
    },
  };
}

/** Marks a job failed without having attempted a send — no number, no event. */
async function recordUndeliverableIn(
  tx: Tx,
  jobId: string,
  detail: string,
  provider: DeliveryProvider,
): Promise<void> {
  const job = await tx.query<{ attempt_count: number; invitation_id: string | null }>(
    `update public.notification_jobs
        set status = 'failed', last_error = $2, claimed_at = null, claimed_by = null,
            updated_at = now()
      where id = $1
      returning attempt_count, invitation_id`,
    [jobId, detail],
  );

  const row = job.rows[0];
  if (!row) return;

  await tx.query(
    `insert into public.delivery_attempts
       (notification_job_id, attempt_number, channel, provider, requested_at,
        concluded_at, failure_reason)
     values ($1, $2, $3, $4, now(), now(), $5)
     on conflict (notification_job_id, attempt_number) do nothing`,
    [jobId, row.attempt_count, provider.channel, provider.name, detail],
  );

  await tx.query(
    `insert into public.delivery_results
       (notification_job_id, attempt_number, outcome, channel, provider, detail)
     values ($1, $2, 'failed', $3, $4, $5)
     on conflict (notification_job_id, attempt_number) do nothing`,
    [jobId, row.attempt_count, provider.channel, provider.name, detail],
  );

  await recordAudit(tx, {
    actorLabel: DISPATCH_ACTOR_LABEL,
    action: "delivery.failed",
    entityTable: "notification_jobs",
    entityId: jobId,
    reason: detail,
    context: { attemptNumber: row.attempt_count, provider: provider.name },
  });
}

/**
 * Dispatches one job: claim, send, record.
 *
 * Returns what happened so a caller can summarise. Never throws for a delivery
 * failure — a refusal is a recorded outcome, and a caller that had just
 * committed an approval must not have it unwound because Meta was unhappy.
 */
export async function dispatchJob(
  jobId: string,
  options: { source?: EnvironmentSource; transport?: Transport; claim?: string } = {},
): Promise<"accepted" | "refused" | "skipped"> {
  const resolution = resolveDeliveryProvider(options.source ?? process.env, options.transport);

  if (!resolution.ok) {
    // Unconfigured. The job is failed with a reason naming the missing settings
    // and nothing else, and stays retryable until the attempt ceiling — so
    // configuring the deployment and pressing Retry is a complete repair.
    await withTransaction(async (tx) => {
      // `attempt_count` is deliberately NOT incremented. Nothing was attempted:
      // no provider was called and no message could have been sent. Counting it
      // meant five approvals before the club's administrator set the secrets
      // left every job permanently `failed` with no operator path back — the
      // attempt ceiling consumed by a condition no operator caused and no retry
      // could clear.
      //
      // The ceiling is still *read*, though. Every caller that reaches here
      // guards it already, so the predicate is unreachable today — and it stays
      // because a later caller that does not would otherwise overwrite a
      // genuinely exhausted job's real failure with the configuration
      // sentence, losing the reason a human needs.
      const claimed = await tx.query<{ attempt_count: number }>(
        `update public.notification_jobs
            set status = 'failed', last_error = $2, updated_at = now()
          where id = $1 and status in ('pending', 'ready', 'failed')
            and attempt_count < $3
          returning attempt_count`,
        [jobId, resolution.reason, MAX_ATTEMPTS],
      );
      if (claimed.rowCount === 0) return;
      await recordAudit(tx, {
        actorLabel: DISPATCH_ACTOR_LABEL,
        action: "delivery.failed",
        entityTable: "notification_jobs",
        entityId: jobId,
        reason: resolution.reason,
        context: { attemptsUsed: claimed.rows[0].attempt_count, configured: false },
      });
    });
    return "refused";
  }

  const { provider, config } = resolution;

  // One token for this dispatch, and the caller may supply it.
  //
  // That matters because `recordDispatchFailure` guards on it, and the guard is
  // only meaningful if it names the token this dispatch actually wrote to
  // `claimed_by`. The batch loop previously minted a *second* token for the
  // guard, so the predicate named a value nothing had ever written and the
  // disjunct was unreachable — the guard reduced to `claimed_by is null`, which
  // is what it had been before the fencing token was introduced at all.
  const claimToken = options.claim ?? dispatchClaim();

  const claim = await withTransaction(async (tx) => {
    const outcome = await claimJobIn(tx, jobId, config, provider, claimToken);
    if (!outcome.claimed && outcome.reason === "undeliverable") {
      await recordUndeliverableIn(tx, jobId, outcome.detail, provider);
    }
    return outcome;
  });

  if (!claim.claimed) return claim.reason === "undeliverable" ? "refused" : "skipped";

  const outcome = await provider.send(claim.attempt.message);

  await withTransaction(async (tx) => {
    if (outcome.status === "accepted") {
      await tx.query(
        `update public.delivery_attempts
            set accepted_at = now(), provider_message_id = $2
          where id = $1`,
        [claim.attempt.attemptId, outcome.providerMessageId],
      );

      // The job stays `processing`. Meta accepting a message is not Meta
      // delivering it — proven on 13 August 2026, when an accepted message was
      // never delivered — so the operator sees **Attempted** until a callback
      // says otherwise. Marking this `completed` would report an undelivered
      // message as delivered, which is the exact defect that test found.
      await recordAudit(tx, {
        actorLabel: DISPATCH_ACTOR_LABEL,
        action: "delivery.attempted",
        entityTable: "notification_jobs",
        entityId: claim.attempt.jobId,
        context: {
          attemptNumber: claim.attempt.attemptNumber,
          provider: provider.name,
          channel: provider.channel,
          // The identifier, never the message and never the link.
          providerMessageId: outcome.providerMessageId,
        },
      });
      return;
    }

    await tx.query(
      `update public.delivery_attempts
          set concluded_at = now(), failure_reason = $2
        where id = $1`,
      [claim.attempt.attemptId, outcome.reason],
    );

    await tx.query(
      `insert into public.delivery_results
         (notification_job_id, attempt_number, outcome, channel, provider, detail)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (notification_job_id, attempt_number) do nothing`,
      [
        claim.attempt.jobId,
        claim.attempt.attemptNumber,
        // `rejected` is the provider declining; `failed` is it not working.
        // The distinction is what the operator's retryable/terminal split reads.
        outcome.retryable ? "failed" : "rejected",
        provider.channel,
        provider.name,
        outcome.reason,
      ],
    );

    await tx.query(
      `update public.notification_jobs
          set status = 'failed', last_error = $2, claimed_at = null, claimed_by = null,
              updated_at = now()
        where id = $1`,
      [claim.attempt.jobId, outcome.reason],
    );

    await recordAudit(tx, {
      actorLabel: DISPATCH_ACTOR_LABEL,
      action: "delivery.failed",
      entityTable: "notification_jobs",
      entityId: claim.attempt.jobId,
      reason: outcome.reason,
      context: {
        attemptNumber: claim.attempt.attemptNumber,
        provider: provider.name,
        retryable: outcome.retryable,
      },
    });
  });

  return outcome.status === "accepted" ? "accepted" : "refused";
}

/**
 * Records a dispatch that threw, so the invitee shows a reason rather than a
 * silence, and returns.
 *
 * Deliberately swallows its own failure: it runs on the path where something
 * has already gone wrong, and a second fault here must not stop the remaining
 * invitations being attempted.
 */
async function recordDispatchFailure(jobId: string, error: unknown, claim: string): Promise<void> {
  // Deliberately does NOT say "nothing was sent". This runs on the path where
  // `dispatchJob` threw, and one of those throws comes from the transaction
  // that records an outcome *after* the provider already accepted the message.
  // Asserting that nothing was sent would then be false, and would invite a
  // retry that duplicates an invitation somebody has already received.
  const reason = isServiceError(error)
    ? error.message
    : "This invitation could not be completed, and its outcome is unknown. Check with the " +
      "person before retrying.";

  try {
    await withTransaction(async (tx) => {
      // Guarded on the claim this dispatcher holds. Between a failed claim
      // rolling back and this write, another worker can legitimately claim the
      // same job — and stamping it `failed` underneath them would strand a send
      // that is actually in flight, with nothing to correct it until a callback
      // arrives, which no deployment receives yet.
      await tx.query(
        `update public.notification_jobs
            set status = 'failed', last_error = $2, claimed_at = null, claimed_by = null,
                updated_at = now()
          where id = $1
            and (claimed_by is null or claimed_by = $3)`,
        [jobId, reason, claim],
      );
      await recordAudit(tx, {
        actorLabel: DISPATCH_ACTOR_LABEL,
        action: "delivery.failed",
        entityTable: "notification_jobs",
        entityId: jobId,
        reason,
      });
    });
  } catch {
    // Nothing further can be done for this job, and the rest of the audience
    // still has to be attempted.
  }
}

/**
 * Dispatches every invitation job an approved event has waiting.
 *
 * Called immediately after approval, so that "approval automatically queues or
 * initiates one WhatsApp invitation per approved audience member" is what
 * actually happens rather than what a scheduler might eventually do. Also
 * callable on its own, which is what a scheduled sweep would use for jobs that
 * were left behind by a crash.
 *
 * Sequential rather than concurrent, deliberately. Forty invitations is a
 * handful of seconds, provider rate limits are per-account, and forty parallel
 * transactions against a pool of ten is a self-inflicted outage.
 */
export async function dispatchEventInvitations(
  eventId: string,
  options: { source?: EnvironmentSource; transport?: Transport } = {},
): Promise<DispatchSummary> {
  const due = await withTransaction(async (tx) =>
    tx.query<{ id: string }>(
      `select id
         from public.notification_jobs
        where event_id = $1
          and job_type = 'invitation'
          and status in ('pending', 'ready')
          and attempt_count < $2
        order by created_at`,
      [eventId, MAX_ATTEMPTS],
    ),
  );

  let accepted = 0;
  let refused = 0;
  let skipped = 0;

  // A total budget, not only a per-call one.
  //
  // Approval awaits this, sequentially, inside a Server Action. One unreachable
  // host costs `PROVIDER_TIMEOUT_MS` per invitee, so forty invitees could hold
  // the request open past Cloud Run's own limit and hand the operator a
  // platform timeout instead of a confirmation.
  //
  // What happens to a job left undispatched, stated exactly, because an earlier
  // version of this comment claimed a sweep that does not exist: it stays
  // `pending`, shows on the delivery screen as **Queued** with Retry offered,
  // and **nothing picks it up automatically**. `dispatchEventInvitations` has
  // exactly one caller — `approveEventAction` — and there is no scheduler, cron
  // or route behind it. Recovery is real but manual and per-invitee until
  // something schedules this. That is disclosed in the pull request rather than
  // implied here.
  const deadline = Date.now() + DISPATCH_BUDGET_MS;

  for (const job of due.rows) {
    if (Date.now() >= deadline) {
      skipped += 1;
      continue;
    }

    // Per job, because `dispatchJob` can throw despite its name: `issueTokenIn`
    // refuses an event that has started or been cancelled, and that refusal
    // travels out through the claim transaction. Without this, one such
    // invitation ended the loop, every later invitee was never attempted and
    // recorded nothing, and `approveEventAction`'s deliberate `catch {}`
    // swallowed the reason. A failure that stops forty other people being
    // invited has to be one of forty failures, not one silence.
    // The token this iteration claims with AND guards on. One value, so the
    // guard can recognise its own claim.
    const claimToken = dispatchClaim();

    try {
      const outcome = await dispatchJob(job.id, { ...options, claim: claimToken });
      if (outcome === "accepted") accepted += 1;
      else if (outcome === "refused") refused += 1;
      else skipped += 1;
    } catch (error) {
      refused += 1;
      await recordDispatchFailure(job.id, error, claimToken);
    }
  }

  return { attempted: accepted + refused, accepted, refused, skipped };
}

/**
 * The operator's Retry. One job, by identity, guarded on being retryable.
 *
 * Idempotent in the way that matters: it claims through the same `update …
 * where status in (…)` as any other attempt, so a double-click produces one
 * additional attempt, and the second press finds the job already `processing`
 * and is told nothing further happened.
 */
export async function retryDelivery(
  actorPersonId: string,
  jobId: string,
  options: { source?: EnvironmentSource; transport?: Transport } = {},
): Promise<"accepted" | "refused"> {
  const eligible = await withTransaction(async (tx) => {
    // `job_type` is constrained, not assumed. The identifier arrives from a
    // form, and every job is an invitation today only because nothing else
    // creates one yet — LAN-79's reminders would make an unconstrained retry a
    // way to fire an unrelated job from the delivery screen.
    const result = await tx.query<{ status: string; attempt_count: number }>(
      `select status::text as status, attempt_count
         from public.notification_jobs
        where id = $1 and job_type = 'invitation'`,
      [jobId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new ConstraintViolated("That delivery no longer exists.", { rule: JOB_NOT_FOUND_RULE });
    }
    if (row.attempt_count >= MAX_ATTEMPTS) {
      throw new InvalidTransition(
        `This invitation has already been attempted ${MAX_ATTEMPTS} times and will not be ` +
          "retried automatically. Somebody needs to read the reason it failed and fix that first.",
        { rule: JOB_NOT_RETRYABLE_RULE },
      );
    }
    if (!["pending", "ready", "failed"].includes(row.status)) {
      throw new InvalidTransition(
        "This invitation is not waiting to be retried — it is already in progress or finished.",
        { rule: JOB_NOT_RETRYABLE_RULE },
      );
    }

    await recordAudit(tx, {
      actorPersonId,
      action: "delivery.retry_requested",
      entityTable: "notification_jobs",
      entityId: jobId,
      context: { previousAttempts: row.attempt_count },
    });
    return true;
  });

  if (!eligible) return "refused";

  const outcome = await dispatchJob(jobId, options);
  return outcome === "accepted" ? "accepted" : "refused";
}

/**
 * The operator's **Revoke and reissue link**.
 *
 * Withdraws every live token for the invitation and immediately attempts a
 * fresh delivery, which mints a new one. Creates no invitation and touches no
 * audience row: it takes the invitation it was given and nothing else.
 */
export async function revokeAndReissue(
  actorPersonId: string,
  invitationId: string,
  reason: string,
  options: { source?: EnvironmentSource; transport?: Transport } = {},
): Promise<"accepted" | "refused"> {
  const jobId = await withTransaction(async (tx) => {
    const revoked = await revokeTokensIn(tx, invitationId, reason);

    const job = await tx.query<{ id: string; attempt_count: number }>(
      `select id, attempt_count
         from public.notification_jobs
        where invitation_id = $1 and job_type = 'invitation'
        order by created_at
        limit 1`,
      [invitationId],
    );

    const row = job.rows[0];
    if (!row) {
      throw new ConstraintViolated("There is no invitation delivery to reissue for this person.", {
        rule: JOB_NOT_FOUND_RULE,
      });
    }
    if (row.attempt_count >= MAX_ATTEMPTS) {
      throw new InvalidTransition(
        `This invitation has already been attempted ${MAX_ATTEMPTS} times. Reissuing the link ` +
          "will not send it again until somebody has fixed why it was failing.",
        { rule: JOB_NOT_RETRYABLE_RULE },
      );
    }

    // The job has to become sendable again, or the reissued link would never
    // leave the building. Guarded on the same states a retry accepts.
    await tx.query(
      `update public.notification_jobs
          set status = 'pending', claimed_at = null, claimed_by = null, updated_at = now()
        where id = $1 and status in ('processing', 'failed', 'completed')`,
      [row.id],
    );

    await recordAudit(tx, {
      actorPersonId,
      action: "delivery.token_revoked_and_reissued",
      entityTable: "invitations",
      entityId: invitationId,
      reason,
      context: { tokensRevoked: revoked, previousAttempts: row.attempt_count },
    });

    return row.id;
  });

  const outcome = await dispatchJob(jobId, options);
  return outcome === "accepted" ? "accepted" : "refused";
}

// ---------------------------------------------------------------------------
// Inbound callbacks
// ---------------------------------------------------------------------------

export type CallbackApplication =
  | "applied"
  | "duplicate"
  | "unmatched"
  | "not_applicable"
  /** The attempt already had a terminal result, which stays authoritative. */
  | "superseded";

/**
 * Applies one verified provider callback, exactly once.
 *
 * Deduplication is the `on conflict do nothing` on
 * `delivery_callbacks (provider, provider_event_id)`, not a check-then-act: two
 * copies of the same callback can arrive concurrently on two instances, and
 * only the database can adjudicate that. If the insert returns no row, this
 * callback has been seen and nothing further happens.
 *
 * The caller must have verified the signature already. This function refuses to
 * store anything otherwise, and the table's own check refuses it too.
 */
export async function applyProviderCallback(
  provider: string,
  event: ProviderCallbackEvent,
  options: { signatureVerified: boolean },
): Promise<CallbackApplication> {
  if (!options.signatureVerified) {
    throw new ConstraintViolated(
      "A provider callback is only ever recorded after its signature has been verified.",
      { rule: "delivery_callbacks_are_verified_before_they_are_stored" },
    );
  }

  return withTransaction(async (tx) => {
    const attempt = event.providerMessageId
      ? await tx.query<{ id: string; notification_job_id: string; attempt_number: number }>(
          `select id, notification_job_id, attempt_number
             from public.delivery_attempts
            where provider = $1 and provider_message_id = $2`,
          [provider, event.providerMessageId],
        )
      : null;

    const matched = attempt?.rows[0] ?? null;

    // Whether this callback *can* be applied is decided before the row is
    // written, because the row records its own verdict and is written once.
    //
    // "Can" is not "will", and the difference matters: the attempt may already
    // carry a terminal result, in which case `delivery_results` — authoritative
    // under invariant M4 — refuses the second one and this callback applies
    // nothing. Writing the row first and discovering that afterwards produced a
    // stored verdict of `applied_at` set and `ignored_reason` null for a
    // callback that moved nothing, which is precisely the durable, auditable
    // evidence this table exists to be. So the conflict is established here,
    // before the verdict is committed.
    // `for update` on the attempt, so two callbacks for one attempt serialise
    // here rather than both reading `concluded = false` and both writing a
    // verdict. Without it the reorder above narrows the window and does not
    // close it: the loser would still commit a `delivery_callbacks` row saying
    // it applied something, while correctly moving nothing.
    const concluded =
      matched === null
        ? false
        : await (async () => {
            await tx.query("select 1 from public.delivery_attempts where id = $1 for update", [
              matched.id,
            ]);
            const existing = await tx.query(
              `select 1 from public.delivery_results
                where notification_job_id = $1 and attempt_number = $2`,
              [matched.notification_job_id, matched.attempt_number],
            );
            return (existing.rowCount ?? 0) > 0;
          })();

    const application: CallbackApplication = !matched
      ? "unmatched"
      : event.outcome === null
        ? "not_applicable"
        : concluded
          ? "superseded"
          : "applied";

    const ignoredReason =
      application === "unmatched"
        ? "No delivery attempt matches this provider message identifier."
        : application === "not_applicable"
          ? `The provider status "${event.providerStatus ?? "unknown"}" has no delivery outcome in this system.`
          : application === "superseded"
            ? "This attempt already has a recorded outcome, which stays authoritative."
            : null;

    const stored = await tx.query<{ id: string }>(
      `insert into public.delivery_callbacks
         (provider, provider_event_id, provider_message_id, provider_status,
          delivery_attempt_id, signature_verified, applied_at, ignored_reason)
       values ($1, $2, $3, $4, $5, true, $6, $7)
       on conflict (provider, provider_event_id) do nothing
       returning id`,
      [
        provider,
        event.providerEventId,
        event.providerMessageId,
        event.providerStatus,
        matched?.id ?? null,
        application === "applied" ? new Date() : null,
        ignoredReason,
      ],
    );

    if (stored.rowCount === 0) return "duplicate";
    if (application !== "applied" || !matched || event.outcome === null) return application;

    await tx.query(
      `update public.delivery_attempts
          set concluded_at = now(),
              failure_reason = case when $2::text = 'delivered' then failure_reason else $3::text end
        where id = $1`,
      [matched.id, event.outcome, event.detail],
    );

    const written = await tx.query(
      `insert into public.delivery_results
         (notification_job_id, attempt_number, outcome, channel, provider, provider_message_id, detail)
       select $1::uuid, $2::integer, $3::public.delivery_outcome, a.channel, a.provider,
              a.provider_message_id, $4::text
         from public.delivery_attempts a
        where a.id = $5
       on conflict (notification_job_id, attempt_number) do nothing`,
      [
        matched.notification_job_id,
        matched.attempt_number,
        event.outcome,
        event.detail,
        matched.id,
      ],
    );

    // Belt and braces. `concluded` above already refused this case before the
    // callback row was written, so reaching here means another transaction
    // inserted the result in between — and the job must still not move, because
    // `delivery_results` is authoritative under invariant M4.
    if (written.rowCount === 0) return "superseded";

    // Only the **current** attempt may move the job.
    //
    // An operator whose delivery is stuck at Attempted cannot retry it — the
    // service refuses a job that is not pending — so the documented repair is
    // Revoke and reissue, which returns the job to `pending` and dispatches
    // attempt 2. Attempt 1's callback then arrives late. Updating
    // unconditionally let it stamp the job `failed` and clear attempt 2's
    // fencing claim, so the screen offered Retry on a delivery the provider had
    // already accepted — pressing it sends the same person a third invitation.
    // The `delivered` variant is worse in its own way: the job reads Delivered
    // from an attempt whose token has just been revoked.
    //
    // `delivery_results` was always right per attempt (invariant M4). This is
    // the job row catching up with it.
    const moved = await tx.query(
      `update public.notification_jobs
          set status = $2::public.notification_job_status,
              last_error = case when $2 = 'completed' then null else $3::text end,
              claimed_at = null, claimed_by = null,
              updated_at = now()
        where id = $1
          and attempt_count = $4`,
      [
        matched.notification_job_id,
        event.outcome === "delivered" ? "completed" : "failed",
        event.detail,
        matched.attempt_number,
      ],
    );

    if (moved.rowCount === 0) {
      // The result is recorded against its own attempt and stays authoritative;
      // the job belongs to a later one.
      return "superseded";
    }

    await recordAudit(tx, {
      actorLabel: `channel: ${provider} callback`,
      action: event.outcome === "delivered" ? "delivery.delivered" : "delivery.failed",
      entityTable: "notification_jobs",
      entityId: matched.notification_job_id,
      reason: event.detail,
      context: {
        attemptNumber: matched.attempt_number,
        providerStatus: event.providerStatus,
        provider,
      },
    });

    return "applied";
  });
}

// ---------------------------------------------------------------------------
// The operator's read model — UX-50, UX-51 and UX-52
// ---------------------------------------------------------------------------

export interface DeliveryCounts {
  readonly audience: number;
  readonly queued: number;
  readonly attempted: number;
  readonly delivered: number;
  readonly failed: number;
  readonly retryable: number;
}

export interface DeliveryRow {
  readonly jobId: string;
  readonly invitationId: string;
  readonly inviteeName: string;
  readonly channel: string;
  readonly state: DeliveryState;
  readonly lastAttemptAt: Date | null;
  readonly attemptCount: number;
  /** Safe, provider-neutral. Never raw provider text. */
  readonly failureReason: string | null;
  readonly tokenState: "live" | "revoked" | "none";
  readonly responseState: string;
  readonly retryable: boolean;
}

export interface EventDelivery {
  readonly eventId: string;
  readonly eventName: string;
  readonly eventStatus: string;
  readonly counts: DeliveryCounts;
  readonly rows: readonly DeliveryRow[];
}

/**
 * One SQL expression, used twice, so the summary tiles and the per-invitee
 * table can never disagree.
 *
 * The mapping from the six job states to LAN-90's five operator states is the
 * whole of the provider neutrality on this screen: `processing` is
 * **Attempted** because we asked and do not yet know, and `failed` splits on
 * the attempt ceiling into **Retryable** and **Failed**.
 *
 * Exported for LAN-157, whose participation table carries the same **Delivery**
 * column at the operator tier. UX standard 7: two surfaces answering "did it
 * reach them?" answer it identically, and the surest way is one definition
 * rather than two readings pinned together after the fact.
 */
export const DELIVERY_STATE_EXPRESSION = `
  case
    when j.status = 'completed' then 'delivered'
    when j.status = 'processing' then 'attempted'
    when j.status in ('pending', 'ready') then 'queued'
    -- A refusal the provider will never accept — a dead credential, a number
    -- that is not on WhatsApp, an unapproved template — is recorded as
    -- \`rejected\` rather than \`failed\`, and it is terminal however many attempts
    -- remain. Reading the ceiling alone reported those as **Retryable**, which
    -- tells an operator to press the button again on something that cannot
    -- succeed until a human fixes the cause.
    when j.status = 'failed' and latest.outcome = 'rejected' then 'failed'
    when j.status = 'failed' and j.attempt_count < ${MAX_ATTEMPTS} then 'retryable'
    else 'failed'
  end`;

/**
 * The most recent recorded outcome for a job, joined laterally.
 *
 * Separate from the state expression so both the row and its counts read one
 * definition, and so \`delivery_results\` stays the authority on what happened —
 * invariant M4 — rather than the job's status becoming a second copy of it.
 */
export const DELIVERY_LATEST_RESULT_JOIN = `
  left join lateral (
    select r.outcome::text as outcome
      from public.delivery_results r
     where r.notification_job_id = j.id
     order by r.attempt_number desc
     limit 1
  ) latest on true`;

export async function readEventDelivery(eventId: string): Promise<EventDelivery> {
  return withTransaction(async (tx) => {
    const event = await tx.query<{
      id: string;
      name: string;
      status: string;
      audience_count: number;
    }>(
      `select e.id, e.name, e.status::text as status,
              (select count(*)::int from public.event_audience_members a where a.event_id = e.id)
                as audience_count
         from public.events e
        where e.id = $1`,
      [eventId],
    );

    const found = event.rows[0];
    if (!found) {
      throw new ConstraintViolated("That event no longer exists.", { rule: "event_not_found" });
    }

    const rows = await tx.query<{
      job_id: string;
      invitation_id: string;
      given_name: string;
      family_name: string | null;
      known_as: string | null;
      channel: string | null;
      state: DeliveryState;
      attempt_count: number;
      last_attempt_at: Date | null;
      failure_reason: string | null;
      token_state: "live" | "revoked" | "none";
      response_state: string | null;
    }>(
      `select j.id as job_id,
              j.invitation_id,
              p.given_name, p.family_name, p.known_as,
              j.channel::text as channel,
              ${DELIVERY_STATE_EXPRESSION} as state,
              j.attempt_count,
              (select max(a.requested_at) from public.delivery_attempts a
                where a.notification_job_id = j.id) as last_attempt_at,
              j.last_error as failure_reason,
              case
                when exists (
                  select 1 from public.rsvp_access_tokens t
                   where t.invitation_id = j.invitation_id
                     and t.revoked_at is null and t.superseded_at is null) then 'live'
                when exists (
                  select 1 from public.rsvp_access_tokens t
                   where t.invitation_id = j.invitation_id
                     and t.revoked_at is not null) then 'revoked'
                else 'none'
              end as token_state,
              s.response_state
         from public.notification_jobs j
         ${DELIVERY_LATEST_RESULT_JOIN}
         join public.invitations i on i.id = j.invitation_id
         left join public.season_memberships m on m.id = i.season_membership_id
         join public.people p on p.id = coalesce(i.person_id, m.person_id)
         left join public.invitation_response_state s on s.invitation_id = i.id
        where j.event_id = $1 and j.job_type = 'invitation'
        order by p.family_name nulls last, p.given_name`,
      [eventId],
    );

    const mapped = rows.rows.map((row): DeliveryRow => {
      const known = row.known_as?.trim();
      const first = known && known !== "" ? known : row.given_name;
      return {
        jobId: row.job_id,
        invitationId: row.invitation_id,
        inviteeName: row.family_name ? `${first} ${row.family_name}` : first,
        channel: row.channel ?? "whatsapp",
        state: row.state,
        lastAttemptAt: row.last_attempt_at,
        attemptCount: row.attempt_count,
        failureReason: row.failure_reason,
        tokenState: row.token_state,
        responseState: row.response_state ?? "not_solicited",
        // Independent of `state`, and deliberately so: UX-51 shows Result and
        // Retry as separate columns because a **Failed** delivery whose cause a
        // human has since fixed is still worth one more attempt.
        //
        // `attempted` is excluded because `retryDelivery` refuses any job that
        // is not pending, ready or failed. Offering a control that can only
        // ever answer "this is already in progress" is worse than offering
        // none — the repair for a send that never concluded is **Revoke and
        // reissue link**, which returns the job to `pending` first.
        retryable:
          row.attempt_count < MAX_ATTEMPTS &&
          row.state !== "delivered" &&
          row.state !== "attempted",
      };
    });

    const count = (state: DeliveryState) => mapped.filter((row) => row.state === state).length;

    return {
      eventId: found.id,
      eventName: found.name,
      eventStatus: found.status,
      counts: {
        audience: found.audience_count,
        queued: count("queued"),
        attempted: count("attempted"),
        delivered: count("delivered"),
        failed: count("failed"),
        retryable: count("retryable"),
      },
      rows: mapped,
    };
  });
}
