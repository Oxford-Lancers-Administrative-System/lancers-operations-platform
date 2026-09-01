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
  playerAnswerUrl,
  resolveDeliveryProvider,
  rsvpUrl,
  type DeliveryContext,
  type Transport,
} from "@/lib/delivery";
import type { EnvironmentSource } from "@/lib/delivery/config";
import { RECIPIENT_NOT_PERMITTED_REASON, recipientPermitted } from "@/lib/delivery/allowlist";
import {
  EMAIL_NOT_PERMITTED_REASON,
  NO_USABLE_EMAIL_REASON,
  emailPermitted,
} from "@/lib/delivery/email";
import { NO_USABLE_NUMBER_REASON, selectMobileNumber } from "@/lib/delivery/phone";
import type { MessageKind, OutboundMessage, ProviderCallbackEvent } from "@/lib/delivery/provider";
import { recordAudit } from "./audit";
import { hasGrantedSeasonMessagingConsentIn } from "./messaging-consent";
import { issueAnswerTokenIn } from "./player-answer-tokens";
import { issueTokenIn, revokeTokensIn } from "./rsvp-tokens";
import { personDisplayAliasSql } from "./sql-text";

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

/**
 * How long to wait before each automatic re-attempt. LAN-169.
 *
 * One entry per attempt already made, so a job that has failed once waits five
 * minutes, twice fifteen, and so on to the fifth and last. Read by index rather
 * than computed, because an exponent is a number somebody tunes without
 * noticing that attempt five moved from an hour to a day.
 *
 * ## Why these numbers
 *
 * The failures this backs off from are a provider being briefly unhappy — a
 * 429, a 5xx, a timeout. Five minutes is long enough that a rate limit has
 * lifted and short enough that a practice invited three days out is not
 * materially later; four hours at the end is the point past which "the provider
 * is briefly unhappy" has stopped being the likely explanation and the job is
 * about to become a **Failed** somebody reads.
 *
 * ## There are no quiet hours in it
 *
 * `REQ-no-quiet-hours` is absolute, and a backoff is exactly the kind of place
 * one gets reintroduced by accident — "wait until 8am" looks like politeness
 * and is a rule that drops a message for eight hours. Nothing here reads the
 * hour of day, and a retry due at 03:00 is attempted at 03:00.
 */
export const BACKOFF_MINUTES: readonly number[] = Object.freeze([5, 15, 60, 240, 240]);

/**
 * When the next automatic attempt becomes due, given the attempt just made.
 *
 * The last entry is reused for anything beyond the table, which cannot happen
 * while `MAX_ATTEMPTS` is five but stops a future ceiling change turning this
 * into an `undefined` that schedules a retry for the epoch.
 */
export function backoffFrom(attemptNumber: number, from: Date = new Date()): Date {
  const index = Math.max(0, Math.min(attemptNumber - 1, BACKOFF_MINUTES.length - 1));
  return new Date(from.getTime() + BACKOFF_MINUTES[index] * 60_000);
}

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

/** REQ-amend-hold, LAN-156 — what an operator is told when they retry a held message. */
export const JOB_HELD_RULE = "delivery_job_held";
export const JOB_HELD_MESSAGE = "This message is on hold after a change to the event.";

/**
 * `held` is LAN-156's, and it is a **read** state the write paths already had.
 *
 * `claimJobIn` and `retryDelivery` have refused a held job since the amendment
 * hold landed, but nothing on the delivery screen knew the column existed: a
 * held job rendered as **Queued** — or as **Failed** with a live **Retry**
 * button — which is the one state that surface exists to make visible. An
 * operator who amends an event and then opens Delivery is asking exactly this
 * question, and was being answered with the state the job had before the hold.
 */
export type DeliveryState =
  "queued" | "attempted" | "delivered" | "failed" | "retryable" | "held" | "cancelled";

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
  readonly message: OutboundMessage;
}

/**
 * Which of the six messages a job carries. LAN-169.
 *
 * `job_type` is the frozen model's vocabulary and `MessageKind` is the template
 * registry's, and they are deliberately not the same list: the model has no
 * `nudge` and the registry has no `other`. This is the one place the two are
 * mapped, so a template can never be chosen from a job type by a second reading
 * somewhere else.
 *
 * `other` maps to the nudge because that is what the club uses it for — a
 * player who said yes and has not finished the event's questions — and W5 is
 * explicit that such a person is *answered* and never reaches the nonresponse
 * queue. It is not a chase, so it is not a reminder.
 *
 * `capacity` is LAN-203's own addition, read alongside `jobType` for exactly
 * one case: a `reminder` job on a `recruit`-capacity invitation is the
 * recruit ladder's one follow-up, not a rung of the player chase, and it
 * carries a different Meta template (`recruit_event_followup`) with
 * different copy — never "please respond now, your answer affects numbers,
 * transport and coaching plans," which is squarely the player-escalation
 * tone `REQ-never-harsh` exists to keep away from a recruit. The recruit's
 * own invitation is deliberately NOT special-cased here: it reuses
 * `event_invitation`, the one template Meta has already approved and the
 * same message every audience gets for a first invitation.
 */
function messageKindFor(jobType: string, capacity?: string): MessageKind {
  switch (jobType) {
    case "invitation":
      return "invitation";
    case "reminder":
      return capacity === "recruit" ? "recruit_event_followup" : "reminder";
    case "escalation":
      return "escalation";
    case "schedule_change_notice":
      return "change_notice";
    case "cancellation_notice":
      return "cancellation";
    default:
      return "nudge";
  }
}

type ClaimOutcome =
  | { readonly claimed: true; readonly attempt: ClaimedAttempt }
  | { readonly claimed: false; readonly reason: "unavailable" }
  | { readonly claimed: false; readonly reason: "undeliverable"; readonly detail: string }
  // F-C1. Distinct from "undeliverable": the event itself has no start time,
  // so no channel and no retry would fix it, and it must never be a
  // WhatsApp-to-email fallback trigger the way an unreachable recipient is.
  | { readonly claimed: false; readonly reason: "unschedulable"; readonly detail: string }
  // LAN-203. Distinct from "undeliverable" for the identical reason
  // "unschedulable" already is: a recruit with no granted consent this
  // season is not a channel problem — falling back to email would still
  // reach someone who has not consented to being contacted at all, on any
  // channel, which is the one thing this refusal exists to prevent.
  | { readonly claimed: false; readonly reason: "not_consented"; readonly detail: string };

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
  context: DeliveryContext,
  claim: string,
): Promise<ClaimOutcome> {
  const claimed = await tx.query<{
    id: string;
    invitation_id: string | null;
    attempt_count: number;
    job_type: string;
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
        -- REQ-amend-hold, LAN-156. The single chokepoint through which every
        -- delivery in this file passes — dispatch, the operator's Retry, and
        -- Revoke and reissue all claim here. A held job is one whose event was
        -- amended after the job was queued, so sending it would deliver a
        -- superseded venue, date or time; the hold is released by Mission 4,
        -- which decides whether the message resumes as it was, resumes
        -- corrected, or is replaced. Putting the condition here rather than in
        -- each caller is what makes "no held message is dispatched" a property
        -- of the code rather than of three separate queries agreeing.
        and held_at is null
        and attempt_count < $3
        and invitation_id is not null
      returning id, invitation_id, attempt_count, job_type::text as job_type`,
    [jobId, claim, MAX_ATTEMPTS],
  );

  const job = claimed.rows[0];
  if (!job || !job.invitation_id) return { claimed: false, reason: "unavailable" };

  const details = await tx.query<{
    invitation_id: string;
    event_id: string;
    event_name: string;
    event_starts_at_set: boolean;
    when_label: string;
    deadline_label: string | null;
    venue: string | null;
    attending_count: number;
    given_name: string;
    display_alias: string | null;
    person_id: string;
    capacity: string;
    season_id: string;
    changed_name: boolean | null;
    changed_scheduled_on: boolean | null;
    changed_starts_at: boolean | null;
    changed_ends_at: boolean | null;
    changed_venue: boolean | null;
  }>(
    `select i.id as invitation_id,
            i.capacity::text as capacity,
            e.id as event_id,
            e.season_id,
            e.name as event_name,
            (e.starts_at is not null) as event_starts_at_set,
            to_char(
              (e.scheduled_on + coalesce(e.starts_at, '00:00'::time)) at time zone 'Europe/London'
                at time zone 'Europe/London',
              'FMDay FMDD FMMonth, HH24:MI') as when_label,
            -- LAN-169. The response deadline, as the player reads it. Rendered
            -- in the club's zone for the reason every other instant is: an
            -- invitation that quotes a UTC deadline is an hour wrong for seven
            -- months of the year.
            to_char(
              i.expires_at at time zone 'Europe/London',
              'FMDay FMDD FMMonth, HH24:MI') as deadline_label,
            e.venue,
            -- The dispatch-time snapshot the approved W2-02 chase carries.
            -- Counted here, inside the claiming transaction, so the number in
            -- the message is the number at the moment it was sent rather than
            -- one read earlier and gone stale. This invitation is excluded from
            -- its own count: "18 others are attending" has to mean others.
            (select count(*)::int
               from public.current_rsvp r
               join public.invitations o on o.id = r.invitation_id
              where o.event_id = e.id and o.id <> i.id and r.response = 'yes')
              as attending_count,
            p.id as person_id, p.given_name,
            ${personDisplayAliasSql("p")} as display_alias,
            -- OWNER-LAN173-03. change_notice's only extra ingredient: which
            -- of a schedule change's fields actually moved, read from the
            -- most recent schedule_changes row for this event so the
            -- summary names what changed without restating the internal
            -- reason (there is none to restate -- this table has no reason
            -- column) or a raw date (when_label/venue above already carry
            -- the current values, formatted).
            sc.previous_name is distinct from sc.new_name as changed_name,
            sc.previous_scheduled_on is distinct from sc.new_scheduled_on as changed_scheduled_on,
            sc.previous_starts_at is distinct from sc.new_starts_at as changed_starts_at,
            sc.previous_ends_at is distinct from sc.new_ends_at as changed_ends_at,
            sc.previous_venue is distinct from sc.new_venue as changed_venue
       from public.invitations i
       join public.events e on e.id = i.event_id
       left join public.season_memberships m on m.id = i.season_membership_id
       join public.people p on p.id = coalesce(i.person_id, m.person_id)
       left join lateral (
         select previous_name, new_name, previous_scheduled_on, new_scheduled_on,
                previous_starts_at, new_starts_at, previous_ends_at, new_ends_at,
                previous_venue, new_venue
           from public.schedule_changes
          where event_id = e.id
          order by changed_at desc
          limit 1
       ) sc on true
      where i.id = $1`,
    [job.invitation_id],
  );

  const detail = details.rows[0];
  if (!detail) {
    return {
      claimed: false,
      reason: "undeliverable",
      detail: context.channel === "email" ? NO_USABLE_EMAIL_REASON : NO_USABLE_NUMBER_REASON,
    };
  }

  const kind = messageKindFor(job.job_type, detail.capacity);

  // F-C1. `starts_at` is nullable, and `approveEvent`'s new guard (Q-31) is
  // forward-only — it cannot reach an event that was approved, or slipped
  // through some earlier code path, before it existed. `when_label` above is
  // still computed with `coalesce(e.starts_at, '00:00'::time)` — every reader
  // of this event's start shares that expression — but a fabricated midnight
  // must never be the thing this claim then sends as fact. Deliberately its
  // own `ClaimOutcome` reason rather than `"undeliverable"`: a different
  // channel would fail identically, so — unlike an unreachable recipient —
  // this must never trigger `scheduleWhatsAppFallbackIn`.
  if (!detail.event_starts_at_set) {
    return { claimed: false, reason: "unschedulable", detail: EVENT_HAS_NO_START_TIME_REASON };
  }

  // LAN-203, Amendment 4 — the LAN-202 seam (`messaging-consent.ts`).
  // Recruit-capacity only: this is deliberately not extended to `player`,
  // `coach` or `committee` invitations, whose consent behaviour is
  // unchanged by this package — `season_messaging_consents` is a new,
  // recruit-facing table and every existing player invitation in this
  // dataset predates it. Checked here, at the moment of an actual send,
  // rather than at job creation: `approveEvent` already creates one
  // invitation job per audience member regardless of capacity (LAN-77,
  // unmodified by this package), so this is the one place a recruit's own
  // invitation — as opposed to their follow-up, which `scheduleEventLadderIn`
  // never creates for an unconsented recruit in the first place — can still
  // be refused.
  if (detail.capacity === "recruit") {
    const consented = await hasGrantedSeasonMessagingConsentIn(
      tx,
      detail.person_id,
      detail.season_id,
    );
    if (!consented) {
      return { claimed: false, reason: "not_consented", detail: NO_CONSENT_REASON };
    }
  }

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

  // The one branch this function grew for LAN-169's email channel, and it is
  // deliberately the only one. Everything below — the token, the attempt row,
  // the message — is identical on both channels, because a rung carried by
  // email is the same message as the rung carried by WhatsApp. What differs is
  // only what counts as a usable route and which allowlist governs it.
  const route =
    context.channel === "email"
      ? selectEmailAddress(contacts.rows, context)
      : selectWhatsAppRoute(contacts.rows, context);

  // Refused before a token is minted. Issuing a link that cannot be sent would
  // supersede a previous, possibly working one for nothing.
  //
  // `REQ-no-channel-backstop` is what this refusal becomes on the surface: a
  // person with no usable route reads "Not dispatched — no channel", is
  // counted, and links to their record. It is the only delivery state that
  // requires a person, and what it requires is a roster fix rather than a
  // retry.
  if (!route.ok) return { claimed: false, reason: "undeliverable", detail: route.reason };

  const token = await issueTokenIn(tx, job.invitation_id, { actorLabel: DISPATCH_ACTOR_LABEL });

  // LAN-172, Q-11: the two player-facing rungs also carry a Yes and a No
  // one-time answer token each — independent of, and in addition to, the
  // `rsvp_access_tokens` row above, which `delivery_attempts` still keys its
  // own bookkeeping on. Neither token supersedes the other; they are two
  // different credentials serving two different mechanisms.
  //
  // `recruit_event_followup` (LAN-203) needs exactly the same pair, for the
  // same reason: a recruit's one follow-up is still answered by tapping Yes
  // or No, and lands on the same shipped `/rsvp/[token]` saved page a
  // player's answer does.
  let yesUrl: string | null = null;
  let noUrl: string | null = null;
  if (kind === "invitation" || kind === "reminder" || kind === "recruit_event_followup") {
    const [yes, no] = await Promise.all([
      issueAnswerTokenIn(tx, job.invitation_id, "yes"),
      issueAnswerTokenIn(tx, job.invitation_id, "no"),
    ]);
    yesUrl = playerAnswerUrl(context.appBaseUrl, yes.token);
    noUrl = playerAnswerUrl(context.appBaseUrl, no.token);
  }

  const attempt = await tx.query<{ id: string }>(
    `insert into public.delivery_attempts
       (notification_job_id, attempt_number, channel, provider, rsvp_access_token_id)
     values ($1, $2, $3, $4, $5)
     returning id`,
    [jobId, job.attempt_count, context.channel, context.provider.name, token.tokenId],
  );

  const known = detail.display_alias?.trim();

  return {
    claimed: true,
    attempt: {
      jobId,
      invitationId: job.invitation_id,
      attemptId: attempt.rows[0].id,
      attemptNumber: job.attempt_count,
      message: {
        kind,
        recipient: route.recipient,
        inviteeName: known && known !== "" ? known : detail.given_name,
        eventName: detail.event_name,
        whenLabel: detail.when_label.replace(/\s+/g, " ").trim(),
        venue: detail.venue,
        deadlineLabel: detail.deadline_label?.replace(/\s+/g, " ").trim() ?? null,
        // Suppressed on the first contact. The approved W2-01 note is explicit
        // that there is "no social proof: first contact is a plain invitation",
        // and the count only appears on the chase that follows it.
        attendingCount: kind === "invitation" ? null : detail.attending_count,
        // OWNER-LAN173-03. Only `change_notice` reads this; every other kind
        // gets `undefined`, exactly as before.
        changeSummary: kind === "change_notice" ? describeScheduleChange(detail) : undefined,
        // The one place the plaintext token becomes a URL, and the last place
        // it exists at all.
        rsvpUrl: rsvpUrl(context.appBaseUrl, token.token),
        yesUrl,
        noUrl,
      },
    },
  };
}

/**
 * OWNER-LAN173-03. What a `schedule_change_notice` says changed, in the
 * club's own field names — never the raw before/after values, which
 * `whenLabel`/`venue` already carry, formatted, for the event's *current*
 * state. A person reads "The date and venue have changed", then the current
 * date and venue below it, not a diff.
 *
 * Falls back to one generic sentence when no `schedule_changes` row joined at
 * all (the lateral join found none) or somehow named nothing — a notice job
 * exists, so something is owed, and `required()` in `templates.ts` refuses a
 * blank `changeSummary` outright. Silence is not the honest fallback for
 * "changed, but I cannot say how"; this sentence is.
 */
function describeScheduleChange(detail: {
  changed_name: boolean | null;
  changed_scheduled_on: boolean | null;
  changed_starts_at: boolean | null;
  changed_ends_at: boolean | null;
  changed_venue: boolean | null;
}): string {
  const labels: string[] = [];
  if (detail.changed_scheduled_on) labels.push("the date");
  if (detail.changed_starts_at || detail.changed_ends_at) labels.push("the time");
  if (detail.changed_venue) labels.push("the venue");
  if (detail.changed_name) labels.push("the name");

  if (labels.length === 0) return "Some details of this event have changed.";

  const joined =
    labels.length === 1
      ? labels[0]
      : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
  return `${joined.charAt(0).toUpperCase()}${joined.slice(1)} ${labels.length === 1 ? "has" : "have"} changed.`;
}

/** One contact row, as both selectors read it. */
interface ContactRow {
  kind: string;
  raw_value: string;
  normalised_value: string | null;
  is_preferred: boolean;
}

type RouteOutcome =
  | { readonly ok: true; readonly recipient: string }
  | { readonly ok: false; readonly reason: string };

function selectWhatsAppRoute(rows: readonly ContactRow[], context: DeliveryContext): RouteOutcome {
  const recipient = selectMobileNumber(
    rows.map((row) => ({
      kind: row.kind,
      rawValue: row.raw_value,
      normalisedValue: row.normalised_value,
      isPreferred: row.is_preferred,
    })),
    context.defaultCallingCode,
  );

  if (!recipient) return { ok: false, reason: NO_USABLE_NUMBER_REASON };

  // LAN-124. Before a token is minted, and for a stronger reason than tidiness:
  // a person this deployment may not message must not have a live RSVP link in
  // existence at all. Refusing at the send would leave a working link that had
  // been issued, recorded and superseded whatever came before it.
  if (!recipientPermitted(recipient, context.recipientAllowlist, context.defaultCallingCode)) {
    return { ok: false, reason: RECIPIENT_NOT_PERMITTED_REASON };
  }

  return { ok: true, recipient };
}

/**
 * The email address this person is reachable at, or why they are not.
 *
 * The ordering is the query's — preferred first, then most recently recorded —
 * and it is the same rule `selectMobileNumber` documents for the same reason:
 * sending to an arbitrary one of somebody's two addresses is the kind of wrong
 * that looks like working software.
 */
function selectEmailAddress(rows: readonly ContactRow[], context: DeliveryContext): RouteOutcome {
  const candidate = rows.find(
    (row) => row.kind === "email" && (row.normalised_value ?? row.raw_value).trim() !== "",
  );

  if (!candidate) return { ok: false, reason: NO_USABLE_EMAIL_REASON };

  const recipient = (candidate.normalised_value ?? candidate.raw_value).trim().toLowerCase();

  if (!emailPermitted(recipient, context.emailAllowlist)) {
    return { ok: false, reason: EMAIL_NOT_PERMITTED_REASON };
  }

  return { ok: true, recipient };
}

/**
 * F-C1. What an operator is told when an event's dispatch was refused
 * because the event itself carries no start time — `NO_USABLE_NUMBER_REASON`
 * and `NO_USABLE_EMAIL_REASON`'s sibling for a fact missing from the event
 * rather than from the recipient. Q-31's approval guard is forward-only, so
 * this is the dispatch path's own half of the same decision: a row that
 * slipped through before the guard existed, or was approved by an older code
 * path, is refused here instead of stating a fabricated midnight as fact.
 */
export const EVENT_HAS_NO_START_TIME_REASON =
  "This event has no start time recorded, so no message can state one as fact. Add a start " +
  "time, then retry.";

/**
 * LAN-203. What an operator is told when a recruit invitation's dispatch was
 * refused because there is no granted `season_messaging_consents` record for
 * that person, that season — the LAN-202 seam's own refusal, restated in the
 * club's words for the delivery surface (`docs/ux/standards.md` rule 5: name
 * what is missing, not what failed). Not retryable automatically — granting
 * consent is the fix, and nothing here can do that on its own.
 */
export const NO_CONSENT_REASON =
  "No recorded consent to message this recruit for this season, so nothing was sent.";

/**
 * Marks a job failed without having attempted a send — no number, no email.
 *
 * `outcome` is `'rejected'`, not `'failed'`: nothing was ever offered to a
 * provider for it to be unhappy about, and a missing route is never fixed by
 * trying again. `DELIVERY_STATE_EXPRESSION`'s `attempt_count < MAX_ATTEMPTS`
 * arm exists for a provider that is briefly unhappy — before `'rejected'` was
 * written here, a permanently unroutable person read **Retryable** for the
 * whole of their remaining attempt ceiling, which is the opposite of
 * `REQ-no-channel-backstop`'s "counted and visible", not "counted and
 * retried".
 */
async function recordUndeliverableIn(
  tx: Tx,
  jobId: string,
  detail: string,
  context: DeliveryContext,
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
    [jobId, row.attempt_count, context.channel, context.provider.name, detail],
  );

  await tx.query(
    `insert into public.delivery_results
       (notification_job_id, attempt_number, outcome, channel, provider, detail)
     values ($1, $2, 'rejected', $3, $4, $5)
     on conflict (notification_job_id, attempt_number) do nothing`,
    [jobId, row.attempt_count, context.channel, context.provider.name, detail],
  );

  await recordAudit(tx, {
    actorLabel: DISPATCH_ACTOR_LABEL,
    action: "delivery.failed",
    entityTable: "notification_jobs",
    entityId: jobId,
    reason: detail,
    context: { attemptNumber: row.attempt_count, provider: context.provider.name },
  });
}

/**
 * The suffix that marks a job as the automatic email carrier for a WhatsApp
 * failure, rather than a rung of the ladder in its own right.
 *
 * A naming convention rather than a column, because `notification_jobs` has no
 * spare foreign key for "carries the same message as", and this mission adds no
 * migration. Every read that must not double-count a person's row —
 * `readEventDelivery`'s per-invitee listing, `participation.ts`'s "most recent
 * job" lateral — excludes `idempotency_key like '%' || EMAIL_FALLBACK_SUFFIX`,
 * so a fallback is visible in diagnostics (every attempt, every channel) and
 * invisible everywhere a person is counted once.
 */
export const EMAIL_FALLBACK_SUFFIX = ":email-fallback";

/**
 * REQ-fallback-is-automatic, REQ-whatsapp-outage-visible — W6.
 *
 * Called from `dispatchJob`'s two failure paths the moment a WhatsApp-channel
 * job becomes **terminal**: no usable route at all, or the attempt that just
 * exhausted its ceiling or was refused outright. Neither case is one more
 * automatic retry of the same channel — `REQ-no-quiet-hours`'s neighbour,
 * `REQ-fallback-is-automatic`, is that the *other* channel carries the message
 * without anybody pressing anything.
 *
 * The new job is a shadow of the one that failed — same invitee, same content
 * (`messageKindFor` reads `job_type`, which this copies), one channel over —
 * keyed so a second sweep, or a second call from a retried transaction, creates
 * it once. Dispatch is attempted inline, in the same call, so "the person was
 * reached" is true by the time this function returns rather than true on the
 * next tick: an operator who opens Delivery a second after the failure sees
 * the fallback already under way, not a gap `REQ-whatsapp-outage-visible`
 * would otherwise leave unexplained for one sweep interval.
 *
 * Returns the new job's id, or `null` where none was created — the job that
 * failed was not a WhatsApp job, or a fallback for it already exists. The
 * caller dispatches it once this function's transaction has committed: network
 * I/O must never happen with a transaction open, the module header's own rule
 * for every send in this file, and inserting here rather than sending here is
 * what keeps that rule intact for this new path too.
 *
 * A fallback that itself fails is a delivery failure like any other — W6's
 * exceptions state the identical rule one channel over, for the escalation's
 * own send — and is recorded by the ordinary failure path `dispatchJob` takes
 * for it. There is deliberately no second fallback from an email failure:
 * email is the last rung this function ever reaches for.
 */
async function scheduleWhatsAppFallbackIn(tx: Tx, jobId: string): Promise<string | null> {
  const created = await tx.query<{ id: string }>(
    `insert into public.notification_jobs
       (idempotency_key, job_type, status, invitation_id, event_id, person_id,
        channel, scheduled_for, ladder_rung, template_variables)
     select j.idempotency_key || '${EMAIL_FALLBACK_SUFFIX}', j.job_type, 'pending',
            j.invitation_id, j.event_id, j.person_id,
            'email'::public.notification_channel, now(), j.ladder_rung, '{}'::jsonb
       from public.notification_jobs j
      where j.id = $1 and j.invitation_id is not null and j.channel = 'whatsapp'
     on conflict (idempotency_key) do nothing
     returning id`,
    [jobId],
  );

  return created.rows[0]?.id ?? null;
}

/**
 * Dispatches a just-created fallback job, swallowing its own failure.
 *
 * Called after the transaction that created it has committed, so the fallback
 * row is real by the time anything tries to send it. Failure is swallowed for
 * `recordDispatchFailure`'s own reason: this runs on a path where the original
 * WhatsApp send has already failed, the fallback's outcome is already durable
 * on its own job row by the time `dispatchJob` returns, and a caller mid-sweep
 * or mid-approval must not have the rest of its batch stopped by one message.
 */
async function dispatchFallbackBestEffort(
  fallbackId: string,
  options: { source?: EnvironmentSource; transport?: Transport },
): Promise<void> {
  try {
    await dispatchJob(fallbackId, { ...options, automatic: true });
  } catch {
    // See the doc comment above.
  }
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
  options: {
    source?: EnvironmentSource;
    transport?: Transport;
    claim?: string;
    /** LAN-169. Set by the scheduler, so a retry's backoff is recorded as automatic. */
    automatic?: boolean;
  } = {},
): Promise<"accepted" | "refused" | "skipped"> {
  // LAN-169. Read before the provider is resolved, because the provider is
  // chosen by the job's own channel: `REQ-ladder-order` fixes the sequence
  // WhatsApp, WhatsApp again, email, and the scheduler writes the rung's
  // channel onto the job when it creates it. Resolving a provider first and
  // discovering the channel afterwards would mean the email rung went out over
  // WhatsApp — a duplicate, not a fallback.
  const routed = await withTransaction(async (tx) =>
    tx.query<{ channel: string | null }>(
      "select channel::text as channel from public.notification_jobs where id = $1",
      [jobId],
    ),
  );

  const channel = routed.rows[0]?.channel === "email" ? "email" : "whatsapp";

  const resolution = resolveDeliveryProvider(
    options.source ?? process.env,
    options.transport,
    channel,
  );

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

  const context = resolution.context;
  const provider = context.provider;

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
    const outcome = await claimJobIn(tx, jobId, context, claimToken);
    let fallbackId: string | null = null;
    if (!outcome.claimed && outcome.reason === "undeliverable") {
      await recordUndeliverableIn(tx, jobId, outcome.detail, context);
      // A no-route refusal is terminal by construction — there is no ceiling
      // to exhaust and nothing to retry — so it is a fallback trigger on its
      // first and only failure, not merely on some later exhaustion.
      if (channel === "whatsapp") fallbackId = await scheduleWhatsAppFallbackIn(tx, jobId);
    } else if (!outcome.claimed && outcome.reason === "unschedulable") {
      // F-C1. Recorded the same visible, retryable way as "undeliverable" —
      // an operator fixes the event's start time, then presses Retry — but
      // never a fallback trigger: the email channel would fail identically,
      // since the fact missing is the event's, not the recipient's.
      await recordUndeliverableIn(tx, jobId, outcome.detail, context);
    } else if (!outcome.claimed && outcome.reason === "not_consented") {
      // LAN-203. Same visible, retryable recording — an operator sees "no
      // consent recorded" and a granted consent record then makes Retry
      // succeed — but never a fallback trigger. `scheduleWhatsAppFallbackIn`
      // exists for an unreachable *channel*; withholding consent is not
      // that, and falling back to email would still message someone who has
      // not agreed to being contacted at all.
      await recordUndeliverableIn(tx, jobId, outcome.detail, context);
    }
    return { outcome, fallbackId };
  });

  if (claim.fallbackId) await dispatchFallbackBestEffort(claim.fallbackId, options);

  if (!claim.outcome.claimed) {
    return claim.outcome.reason === "undeliverable" ||
      claim.outcome.reason === "unschedulable" ||
      claim.outcome.reason === "not_consented"
      ? "refused"
      : "skipped";
  }
  const claimedAttempt = claim.outcome.attempt;

  const outcome = await provider.send(claimedAttempt.message);

  const secondFallbackId = await withTransaction(async (tx) => {
    if (outcome.status === "accepted") {
      await tx.query(
        `update public.delivery_attempts
            set accepted_at = now(), provider_message_id = $2
          where id = $1`,
        [claimedAttempt.attemptId, outcome.providerMessageId],
      );

      // LAN-169. No automatic attempt is pending against an accepted message.
      // Leaving a stale `next_attempt_at` behind would make the sweep claim a
      // job the provider had just taken and send the same person a second copy
      // — the failure mode the whole of `claimJobIn`'s concurrency control
      // exists to prevent, reintroduced through a column rather than a race.
      await tx.query(
        `update public.notification_jobs
            set next_attempt_at = null,
                automatic_attempts = automatic_attempts + $2::integer
          where id = $1`,
        [claimedAttempt.jobId, options.automatic ? 1 : 0],
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
        entityId: claimedAttempt.jobId,
        context: {
          attemptNumber: claimedAttempt.attemptNumber,
          provider: provider.name,
          channel: provider.channel,
          // The identifier, never the message and never the link.
          providerMessageId: outcome.providerMessageId,
        },
      });
      return null;
    }

    await tx.query(
      `update public.delivery_attempts
          set concluded_at = now(), failure_reason = $2
        where id = $1`,
      [claimedAttempt.attemptId, outcome.reason],
    );

    await tx.query(
      `insert into public.delivery_results
         (notification_job_id, attempt_number, outcome, channel, provider, detail)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (notification_job_id, attempt_number) do nothing`,
      [
        claimedAttempt.jobId,
        claimedAttempt.attemptNumber,
        // `rejected` is the provider declining; `failed` is it not working.
        // The distinction is what the operator's retryable/terminal split reads.
        outcome.retryable ? "failed" : "rejected",
        provider.channel,
        provider.name,
        outcome.reason,
      ],
    );

    // LAN-169. Time-based backoff, which is the second thing this file never
    // had: `MAX_ATTEMPTS` and the retryable/terminal split existed, but nothing
    // decided *when* an automatic re-attempt became due, so a failed job waited
    // for a person to press Retry.
    //
    // `next_attempt_at` is null for a terminal refusal — a dead credential, an
    // unroutable number, a rejected template. Those need a human to fix
    // something first, and scheduling an automatic retry for them would burn
    // the ceiling and hide the real problem behind "failed 5 times", which is
    // exactly what `SendOutcome.retryable` exists to prevent.
    const nextAttemptAt = outcome.retryable ? backoffFrom(claimedAttempt.attemptNumber) : null;

    // W6, `REQ-fallback-is-automatic`. Terminal exactly when there is nothing
    // further this channel will do on its own: the provider refused outright,
    // or this was the attempt that reached the ceiling.
    const terminal = !outcome.retryable || claimedAttempt.attemptNumber >= MAX_ATTEMPTS;

    await tx.query(
      `update public.notification_jobs
          set status = 'failed', last_error = $2, claimed_at = null, claimed_by = null,
              next_attempt_at = $3::timestamptz,
              automatic_attempts = automatic_attempts + $4::integer,
              updated_at = now()
        where id = $1`,
      [claimedAttempt.jobId, outcome.reason, nextAttemptAt, options.automatic ? 1 : 0],
    );

    await recordAudit(tx, {
      actorLabel: DISPATCH_ACTOR_LABEL,
      action: "delivery.failed",
      entityTable: "notification_jobs",
      entityId: claimedAttempt.jobId,
      reason: outcome.reason,
      context: {
        attemptNumber: claimedAttempt.attemptNumber,
        provider: provider.name,
        retryable: outcome.retryable,
        // `REQ-retries-have-no-actor`: the delivery surface shows the attempt
        // and the next due time and offers nothing to press. This is where that
        // time comes from.
        nextAttemptAt: nextAttemptAt?.toISOString() ?? null,
      },
    });

    return terminal && channel === "whatsapp"
      ? await scheduleWhatsAppFallbackIn(tx, claimedAttempt.jobId)
      : null;
  });

  if (secondFallbackId) await dispatchFallbackBestEffort(secondFallbackId, options);

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
          -- LAN-156. Held jobs are not due: the claim below refuses them
          -- anyway, and counting them here would report an attempt against a
          -- message nothing tried to send.
          and held_at is null
          -- LAN-169, and this one line is what makes REQ-dispatch-anchor true.
          -- Approval used to dispatch every invitation job it found, because
          -- nothing had ever written a scheduled_for and every job was due the
          -- instant it existed. Now the plan writes the anchor, and an event
          -- approved four weeks out with a two-week lead sends nothing today:
          -- the sweep collects it when its moment arrives.
          --
          -- The guarantee an approver depends on survives in the arithmetic
          -- rather than here. max(now, event start - lead) means an event
          -- closer than its own lead has an anchor of *now*, so it passes this
          -- predicate on the approval path and goes immediately, which is
          -- exactly what W1 promises in those words.
          and coalesce(scheduled_for, created_at) <= now()
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
  // What happens to a job left undispatched, restated for LAN-169 because the
  // previous version of this comment was accurate and is no longer: it stays
  // `pending` and **the sweep picks it up on its next tick**.
  // `src/lib/services/messaging-scheduler.ts` reads `scheduled_for` and
  // `next_attempt_at`, and `/api/scheduler/messaging` triggers it. Recovery is
  // no longer manual and no longer per-invitee.
  //
  // The budget therefore bounds a single approval's synchronous work rather
  // than deciding whether an invitation is ever sent, which is a much smaller
  // thing for it to be responsible for.
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
    const result = await tx.query<{ status: string; attempt_count: number; held: boolean }>(
      `select status::text as status, attempt_count, held_at is not null as held
         from public.notification_jobs
        where id = $1 and job_type = 'invitation'`,
      [jobId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new ConstraintViolated("That delivery no longer exists.", { rule: JOB_NOT_FOUND_RULE });
    }
    // LAN-156. `claimJobIn` refuses a held job regardless, and would report it
    // as "unavailable" — which on this screen reads as "somebody else is
    // sending it". Said plainly here instead, so the operator who pressed Retry
    // is told what state the message is actually in.
    if (row.held) {
      throw new InvalidTransition(JOB_HELD_MESSAGE, { rule: JOB_HELD_RULE });
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
    const job = await tx.query<{ id: string; attempt_count: number; held: boolean }>(
      `select id, attempt_count, held_at is not null as held
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
    // LAN-156 (R156-B1). Checked, and the reason a live token still exists to
    // revoke, before anything is revoked. A held job's link is the one still
    // reaching the invitee's last confirmed state; revoking it first and then
    // finding `claimJobIn` refuses the held row left the invitee with a dead
    // link, no message, and no `last_error` naming the cause. The message this
    // throws matches `retryDelivery`'s, so both controls tell the operator the
    // same true thing about a held row.
    if (row.held) {
      throw new InvalidTransition(JOB_HELD_MESSAGE, { rule: JOB_HELD_RULE });
    }
    if (row.attempt_count >= MAX_ATTEMPTS) {
      throw new InvalidTransition(
        `This invitation has already been attempted ${MAX_ATTEMPTS} times. Reissuing the link ` +
          "will not send it again until somebody has fixed why it was failing.",
        { rule: JOB_NOT_RETRYABLE_RULE },
      );
    }

    const revoked = await revokeTokensIn(tx, invitationId, reason);

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
  /** LAN-156. Messages an amendment stopped, and the number the amend screen quotes. */
  readonly held: number;
}

export interface DeliveryRow {
  readonly jobId: string;
  readonly invitationId: string;
  readonly inviteeName: string;
  readonly channel: string;
  readonly state: DeliveryState;
  readonly lastAttemptAt: Date | null;
  /**
   * W6, `REQ-retries-have-no-actor`. When the next automatic retry is due,
   * for a `retryable` row — `null` for every other state, including a
   * terminal `failed`, which by definition has none scheduled.
   */
  readonly nextAttemptAt: Date | null;
  readonly attemptCount: number;
  /** Safe, provider-neutral. Never raw provider text. */
  readonly failureReason: string | null;
  readonly tokenState: "live" | "revoked" | "none";
  readonly responseState: string;
  readonly retryable: boolean;
  /**
   * `REQ-no-channel-backstop`, W6. `state` is still `failed` — nothing about
   * the provider-neutral vocabulary changes — this is the one fact that turns
   * a generic failure into **Not dispatched — no channel**: there was never a
   * route to try, so nothing here is a candidate for a retry or a fallback.
   */
  readonly noUsableRoute: boolean;
  /**
   * W6, `REQ-whatsapp-outage-visible`. True only when this WhatsApp-channel
   * job is terminally `failed` **and** the automatic email fallback it
   * triggered has since delivered — the person was reached, and the club's
   * primary channel still failed, which is a fact the club must see rather
   * than a silent substitution.
   */
  readonly whatsappUnresponsive: boolean;
  /** Where **Open their record** goes for `noUsableRoute`. `null` for a walk-up. */
  readonly seasonMembershipId: string | null;
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
    -- LAN-156, and FIRST, because a hold outranks whatever the job was doing
    -- when it was placed. A completed job is never held — \`amendApprovedEvent\`
    -- holds only pending, ready and failed — so this arm cannot hide a
    -- delivery that actually happened.
    when j.held_at is not null then 'held'
    -- LAN-156 (R156-B2). \`cancelEvent\` moves every unsent job straight to
    -- 'cancelled', a status none of the arms below matched, so it fell to the
    -- \`else\` and read as the club's own stand-down having failed to send —
    -- with a Retry button that then refused it, because \`retryDelivery\` only
    -- accepts 'pending', 'ready' or 'failed'. A cancelled job is never
    -- completed or processing, so this arm cannot hide a delivery that
    -- actually happened either.
    when j.status = 'cancelled' then 'cancelled'
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

/**
 * The deterministic ordering every "this invitee's most recent job" reader
 * shares — OWNER-LAN173-06 (correction round 2).
 *
 * ## The defect this replaces
 *
 * `notification_jobs.created_at` defaults to `now()`, which in PostgreSQL is
 * the *transaction's* start time, not the statement's. `scheduleEventLadderIn`
 * creates the invitation anchor and every reminder rung for a whole event
 * inside `approveEvent`'s own transaction, so in real use — not only in a
 * fixture — every job belonging to one invitee's ladder carries the identical
 * `created_at`. A caller ordering by `created_at desc limit 1` alone therefore
 * has no tiebreaker at all: PostgreSQL is free to return any one of the tied
 * rows, and `EXPLAIN` showed it doing so deterministically but arbitrarily
 * under the query's own plan — consistently the invitee's original
 * `invitation` job, because a `Bitmap Heap Scan` visits rows in the order they
 * were physically inserted, and the invitation row is the first one
 * `approveEvent` writes. `DELIVERY_STATE_EXPRESSION` checks `held_at` first and
 * was never the problem — it was simply never handed the held row to check.
 *
 * This stayed invisible because it only changes the *answer* when the tied
 * jobs map to different delivery states. A ladder every one of whose rungs
 * ends up `completed` reads `delivered` whichever tied row wins; a rung the
 * club held while a later one had already gone out is the case where the
 * choice is visible, and it was found in a correction round
 * (OWNER-LAN173-06), not by review — verifying the fix for a held reminder's
 * `person_id` on event `5a0af9b1-179e-42b9-a2b6-d8b4dbc820b7` led straight to
 * this, five deterministic `EXPLAIN`ed runs of the tied query in a row.
 *
 * ## Why this fixes it without changing which rows are read
 *
 * `created_at desc` stays the primary key, so nothing about ordering *across*
 * approvals changes. The tie is then broken on the ladder's own sequence —
 * `scheduled_for desc`, then `ladder_rung desc nulls last` for the rare case
 * two rows share a `scheduled_for` too (the invitation anchor and rung 1 can,
 * depending on the lead time) — and `id` last, as a total order so the same
 * inputs can never return a different row on a different day, plan, or
 * PostgreSQL version. No job is added to or removed from what a caller already
 * selects; only which of the rows already selected is treated as "the" one
 * changes.
 *
 * ## The two callers that shared the bug
 *
 * `participation.ts`'s `DELIVERY_LATERAL` and `follow-ups.ts`'s per-invitation
 * delivery lateral both had exactly this shape — `order by j.created_at desc
 * limit 1`, no further key — and both use this constant now, so the two
 * cannot drift back apart the way the un-shared copies already had.
 * `readEventDelivery` above does not: it filters straight to `job_type =
 * 'invitation'`, one row per invitee by construction, with no "most recent
 * of several" question to answer.
 */
export const NOTIFICATION_JOB_RECENCY_ORDER = `
     order by j.created_at desc, j.scheduled_for desc, j.ladder_rung desc nulls last, j.id desc`;

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
      display_alias: string | null;
      channel: string | null;
      state: DeliveryState;
      attempt_count: number;
      last_attempt_at: Date | null;
      next_attempt_at: Date | null;
      failure_reason: string | null;
      token_state: "live" | "revoked" | "none";
      response_state: string | null;
      fallback_status: string | null;
      season_membership_id: string | null;
    }>(
      `select j.id as job_id,
              j.invitation_id,
              p.given_name, p.family_name,
              ${personDisplayAliasSql("p")} as display_alias,
              j.channel::text as channel,
              ${DELIVERY_STATE_EXPRESSION} as state,
              j.attempt_count,
              (select max(a.requested_at) from public.delivery_attempts a
                where a.notification_job_id = j.id) as last_attempt_at,
              j.next_attempt_at,
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
              s.response_state,
              i.season_membership_id,
              -- W6. The fallback job this one's failure triggered, if any —
              -- named by convention (EMAIL_FALLBACK_SUFFIX), never a second
              -- foreign key. Its own status decides WhatsApp unresponsive.
              (select f.status::text
                 from public.notification_jobs f
                where f.idempotency_key = j.idempotency_key || '${EMAIL_FALLBACK_SUFFIX}'
                limit 1) as fallback_status
         from public.notification_jobs j
         ${DELIVERY_LATEST_RESULT_JOIN}
         join public.invitations i on i.id = j.invitation_id
         left join public.season_memberships m on m.id = i.season_membership_id
         join public.people p on p.id = coalesce(i.person_id, m.person_id)
         left join public.invitation_response_state s on s.invitation_id = i.id
        where j.event_id = $1 and j.job_type = 'invitation'
          and j.idempotency_key not like '%${EMAIL_FALLBACK_SUFFIX}'
        order by p.family_name nulls last, p.given_name`,
      [eventId],
    );

    const mapped = rows.rows.map((row): DeliveryRow => {
      const known = row.display_alias?.trim();
      const first = known && known !== "" ? known : row.given_name;
      const noUsableRoute =
        row.state === "failed" &&
        (row.failure_reason === NO_USABLE_NUMBER_REASON ||
          row.failure_reason === NO_USABLE_EMAIL_REASON);
      return {
        jobId: row.job_id,
        invitationId: row.invitation_id,
        inviteeName: row.family_name ? `${first} ${row.family_name}` : first,
        channel: row.channel ?? "whatsapp",
        state: row.state,
        lastAttemptAt: row.last_attempt_at,
        nextAttemptAt: row.next_attempt_at,
        attemptCount: row.attempt_count,
        failureReason: row.failure_reason,
        tokenState: row.token_state,
        responseState: row.response_state ?? "not_solicited",
        noUsableRoute,
        whatsappUnresponsive:
          row.channel === "whatsapp" &&
          row.state === "failed" &&
          row.fallback_status === "completed",
        seasonMembershipId: row.season_membership_id,
        // Independent of `state`, and deliberately so: UX-51 shows Result and
        // Retry as separate columns because a **Failed** delivery whose cause a
        // human has since fixed is still worth one more attempt.
        //
        // `attempted` is excluded because `retryDelivery` refuses any job that
        // is not pending, ready or failed. Offering a control that can only
        // ever answer "this is already in progress" is worse than offering
        // none — the repair for a send that never concluded is **Revoke and
        // reissue link**, which returns the job to `pending` first.
        //
        // `held` is excluded for the same reason and it is the stronger case:
        // `retryDelivery` throws `JOB_HELD_MESSAGE` at a held job, so the
        // button was offered, pressed, and refused. `docs/ux/standards.md`
        // rule 4 says a control that cannot act is not offered.
        //
        // `cancelled` (R156-B2) is excluded for the identical reason: the
        // event is terminal, `retryDelivery` only accepts a job that is
        // 'pending', 'ready' or 'failed', and a 'cancelled' job is none of
        // those — so a Retry button here would be offered, pressed and
        // refused, exactly like a held one.
        //
        // A `rejected` outcome — including `noUsableRoute` below — stays
        // retryable up to the ceiling, on purpose: "still offered, because a
        // human may have corrected the roster [or the cause] since" is this
        // file's own settled answer, proved by
        // `delivery.test.ts`'s "records a terminal refusal as Failed even
        // with attempts remaining". A roster fix for **Not dispatched — no
        // channel** is exactly this shape: fix the record, then press Retry.
        retryable:
          row.attempt_count < MAX_ATTEMPTS &&
          row.state !== "delivered" &&
          row.state !== "attempted" &&
          row.state !== "held" &&
          row.state !== "cancelled",
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
        held: count("held"),
      },
      rows: mapped,
    };
  });
}

// ---------------------------------------------------------------------------
// Diagnostics — W6, "View diagnostics"
// ---------------------------------------------------------------------------

/** One send attempt, on one channel, for one person. R15's evidence. */
export interface DiagnosticsAttempt {
  readonly attemptId: string;
  readonly inviteeName: string;
  readonly channel: string;
  readonly attemptNumber: number;
  readonly requestedAt: Date;
  /** `'delivered' | 'failed' | 'rejected' | 'attempted' | 'sent'` — never a guess. */
  readonly outcome: string;
  /** Never a phone number, a template id, or a message body. */
  readonly providerReference: string | null;
}

/**
 * Every attempt, on every channel, for one event — the individual detail
 * behind the summary counts, and the evidence `R15`'s "documented recovery
 * procedure" asks be checkable rather than asserted.
 *
 * Unlike `readEventDelivery`, this reads every job type, not only
 * `invitation` — W6 acceptance #8 names "the fallback email that carried a
 * failed WhatsApp" as a row this page must show, and a fallback is never a
 * `job_type = 'invitation'` row `readEventDelivery` would count twice. Nothing
 * here excludes the fallback shadow job the way the summary screens do; a
 * shadow job is exactly the kind of attempt this page exists to make visible.
 *
 * One row per `delivery_attempts` row, which is already deduplicated at
 * storage — `delivery_results`' `on conflict (notification_job_id,
 * attempt_number) do nothing` is what makes a provider reporting the same
 * result twice appear once, so this reader adds no deduplication of its own.
 *
 * `j.person_id` rather than a join through `invitations` — every job, escalation
 * included, already carries the person it is about (`scheduleEventLadderIn`,
 * the approval insert, and the escalation dispatch all set it), so one join
 * covers every job type rather than three different paths to a name.
 */
export async function readEventDeliveryDiagnostics(
  eventId: string,
): Promise<readonly DiagnosticsAttempt[]> {
  return withTransaction(async (tx) => {
    const rows = await tx.query<{
      attempt_id: string;
      given_name: string;
      family_name: string | null;
      display_alias: string | null;
      channel: string;
      attempt_number: number;
      requested_at: Date;
      recorded_outcome: string | null;
      accepted_at: Date | null;
      concluded_at: Date | null;
      provider_message_id: string | null;
    }>(
      `select a.id as attempt_id,
              p.given_name, p.family_name,
              ${personDisplayAliasSql("p")} as display_alias,
              a.channel::text as channel,
              a.attempt_number,
              a.requested_at,
              r.outcome::text as recorded_outcome,
              a.accepted_at,
              a.concluded_at,
              a.provider_message_id
         from public.notification_jobs j
         join public.delivery_attempts a on a.notification_job_id = j.id
         left join public.delivery_results r
           on r.notification_job_id = j.id and r.attempt_number = a.attempt_number
         join public.people p on p.id = j.person_id
        where j.event_id = $1
        order by p.family_name nulls last, p.given_name, a.requested_at`,
      [eventId],
    );

    return rows.rows.map((row): DiagnosticsAttempt => {
      const known = row.display_alias?.trim();
      const first = known && known !== "" ? known : row.given_name;
      const outcome =
        row.recorded_outcome ??
        (row.accepted_at ? "attempted" : row.concluded_at ? "failed" : "sent");
      return {
        attemptId: row.attempt_id,
        inviteeName: row.family_name ? `${first} ${row.family_name}` : first,
        channel: row.channel,
        attemptNumber: row.attempt_number,
        requestedAt: row.requested_at,
        outcome,
        providerReference: row.provider_message_id,
      };
    });
  });
}
