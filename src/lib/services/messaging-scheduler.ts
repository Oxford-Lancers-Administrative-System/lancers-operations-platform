import "server-only";

import { LEADERSHIP_TIER_SEATS } from "@/lib/auth/capabilities";
import { withTransaction, type Tx } from "@/lib/db";
import { resolveDeliveryProvider, type Transport } from "@/lib/delivery";
import type { EnvironmentSource } from "@/lib/delivery/config";
import { RECIPIENT_NOT_PERMITTED_REASON, recipientPermitted } from "@/lib/delivery/allowlist";
import {
  EMAIL_NOT_PERMITTED_REASON,
  NO_USABLE_EMAIL_REASON,
  emailPermitted,
} from "@/lib/delivery/email";
import { NO_USABLE_NUMBER_REASON, selectMobileNumber } from "@/lib/delivery/phone";

import { recordAudit } from "./audit";
import { DISPATCH_ACTOR_LABEL, MAX_ATTEMPTS, dispatchJob } from "./delivery";
import type { MessagingPlan } from "./messaging-schedule";

/**
 * The scheduler sweep. LAN-169.
 *
 * ## The absence this fills
 *
 * `notification_jobs.scheduled_for` has existed since the domain baseline and
 * **nothing has ever read it.** A job left pending after approval sat until a
 * human pressed Retry; `delivery.ts` said so itself, in terms, where the batch
 * loop explains that "there is no scheduler, cron or route behind it". That one
 * absence is why the club has no reminder ladder, no dispatch anchor and no
 * escalation — not three separate gaps, one.
 *
 * This module is the thing that reads it. It has three jobs and runs them in
 * this order on every tick:
 *
 *   1. **Raise what is overdue.** Cross the escalation threshold, flag every
 *      unanswered invitation once, and tell the President once.
 *   2. **Dispatch what is due.** Every rung whose moment has arrived, and every
 *      failed job whose backoff has elapsed.
 *   3. **Report what it did**, so a trigger can be observed rather than trusted.
 *
 * The order matters: raising first means an escalation created this tick is
 * dispatched this tick rather than waiting for the next one, which is what makes
 * "escalation fires N hours after the deadline" true to the tick interval rather
 * than to twice it.
 *
 * ## Why the sweep claims nothing itself
 *
 * Every actual send goes through `dispatchJob`, which claims with the same
 * `update … where status in (…)` two dispatchers race on. So running two sweeps
 * concurrently — a ticker and a trigger, two Cloud Run instances — produces one
 * message per job and not two, and that property is the existing dispatcher's
 * rather than a new one this file would have to get right a second time.
 *
 * ## There are no quiet hours
 *
 * `REQ-no-quiet-hours` is absolute and this is where it would be violated.
 * Nothing here reads the hour of day. A rung due at 03:00 is dispatched at
 * 03:00, and no batching, compression or recovery may delay or drop a message on
 * that basis.
 */

/** What one tick did. Returned so a trigger can be observed rather than trusted. */
export interface SweepSummary {
  /** Jobs whose moment had arrived and which were attempted. */
  readonly dispatched: number;
  readonly accepted: number;
  readonly refused: number;
  readonly skipped: number;
  /** Invitations flagged as unanswered past their threshold, this tick. */
  readonly flagsRaised: number;
  /** Escalations created, at most one per event. */
  readonly escalationsCreated: number;
  /** Events whose escalation was held because the President's office is vacant. */
  readonly escalationsHeld: number;
}

/**
 * How many jobs one tick may attempt.
 *
 * Bounded for the same reason `DISPATCH_BUDGET_MS` bounds an approval: the
 * trigger is an HTTP request with a platform timeout behind it, and a backlog
 * of four hundred must produce four ticks rather than one timeout. Work left
 * behind is not lost — it is still due on the next tick, which is the whole
 * difference between a sweep and a batch job.
 */
export const SWEEP_BATCH_LIMIT = 50;

export const SWEEP_ACTOR_LABEL = "system: messaging scheduler";

// ---------------------------------------------------------------------------
// Creating the ladder
// ---------------------------------------------------------------------------

/**
 * Writes every rung of one event's ladder, at approval.
 *
 * Called from `approveEvent`, inside its transaction, so "approval commits the
 * plan" is atomic with the approval itself — W1's settled decision, and the one
 * that changes what approval means. Approval no longer performs the send; it
 * freezes the audience, creates every job, and schedules the first one. The
 * audience freeze R4 protects is unchanged.
 *
 * ## Why the invitation rung is updated rather than inserted
 *
 * `approveEvent` already inserts one `invitation` job per invitee, and has since
 * LAN-78. Inserting a second here would produce two invitations per person; the
 * existing insert is left exactly as it is and this gives it its anchor and its
 * rung, so the change to a working path is two columns rather than a rewrite.
 *
 * ## Why the idempotency key carries the rung
 *
 * Invariant M1 keys a job on facts that do not change, so a retry of this
 * transaction cannot produce a second job for one invitee. The rung is such a
 * fact — reminder two is not reminder three — and without it every rung of one
 * person's ladder would collide on a single key and only the first would exist.
 */
export async function scheduleEventLadderIn(
  tx: Tx,
  eventId: string,
  plan: MessagingPlan,
): Promise<{ invitations: number; reminders: number }> {
  const invitationRung = plan.rungs.find((rung) => rung.kind === "invitation");

  // The anchor. `max(now, event start − lead)`, already resolved by the plan.
  // Until this existed, an invitation job carried no `scheduled_for` at all and
  // approval dispatched it immediately whatever the event's lead said.
  const anchored = await tx.query(
    `update public.notification_jobs
        set scheduled_for = $2::timestamptz,
            ladder_rung = 0,
            updated_at = now()
      where event_id = $1 and job_type = 'invitation'`,
    [eventId, invitationRung?.at ?? plan.invitationAt],
  );

  let reminders = 0;

  for (const rung of plan.rungs) {
    if (rung.kind !== "reminder") continue;

    const created = await tx.query(
      `insert into public.notification_jobs
         (idempotency_key, job_type, status, invitation_id, event_id, person_id,
          channel, scheduled_for, ladder_rung, template_variables)
       select 'event:' || i.event_id::text || ':reminder:' || i.capacity::text
                || ':' || i.participant_id::text || ':' || $2::text,
              'reminder', 'pending', i.id, i.event_id,
              coalesce(i.person_id, m.person_id),
              $3::public.notification_channel, $4::timestamptz, $2::smallint, '{}'::jsonb
         from public.invitations i
         left join public.season_memberships m on m.id = i.season_membership_id
        where i.event_id = $1
       on conflict (idempotency_key) do nothing`,
      [eventId, rung.rung, rung.channel, rung.at],
    );

    reminders += created.rowCount ?? 0;
  }

  return { invitations: anchored.rowCount ?? 0, reminders };
}

// ---------------------------------------------------------------------------
// Escalation
// ---------------------------------------------------------------------------

/**
 * The current holder of the President's office, or null where it is vacant.
 *
 * Resolved **by office**, never by person (`T03-escalation-office`): committee
 * turnover changes the recipient with no configuration change and no forgotten
 * setting. Mission decision Q-6 settles that this needs no schema of its own —
 * `public.roles` holds the constitutional offices, `public.role_assignments`
 * binds the holder under invariant I3's exclusion constraint, and
 * `operator_accounts` deliberately has no role column.
 *
 * The currentness predicate is bounded at both ends and is the same one
 * `src/lib/auth/operator.ts` documents: a seat recorded at the AGM to begin
 * later confers nothing until its date, and one whose last day has passed is
 * over. Expressed in SQL here rather than read through that module because this
 * runs with no session and resolves a person rather than an operator's
 * capabilities.
 */
export async function currentPresidentIn(tx: Tx): Promise<string | null> {
  const result = await tx.query<{ person_id: string }>(
    `select a.person_id
       from public.role_assignments a
       join public.roles r on r.id = a.role_id
      where r.code = $1
        and a.effective_from <= current_date
        and (a.effective_to is null or a.effective_to > current_date)
      order by a.effective_from desc
      limit 1`,
    // The code arrives from the capability map rather than as a literal here.
    // `tests/capability-map-single-source.test.ts` enforces that across `src/`
    // and the reason is exactly this file's kind of mistake: a second copy of a
    // role code is invisible until the two disagree, and a divergent one here
    // would send the club's escalations to a seat nobody holds.
    [LEADERSHIP_TIER_SEATS.presiding],
  );
  return result.rows[0]?.person_id ?? null;
}

/**
 * Raises the escalation threshold for every event that has crossed it.
 *
 * ## Idempotent because the database says so, not because this checks first
 *
 * `nonresponse_flags` carries `unique (invitation_id, threshold)` and this
 * inserts with `on conflict do nothing`. A check-then-insert could not be
 * idempotent: two sweeps can cross the threshold concurrently on two instances,
 * both read "no flag", and both write one. Only the database can adjudicate
 * that, which is why the guarantee lives in the constraint and this statement
 * is written to lean on it.
 *
 * The same reasoning covers the escalation message. One per event, keyed on
 * `notification_jobs.idempotency_key`, so rerunning the scheduler — after a
 * crash, over a backlog, or twice by accident — sends one escalation and not a
 * second. That is W5's acceptance criterion stated as a constraint.
 *
 * ## A vacant office holds the escalation visibly
 *
 * If nobody currently holds the President's seat, the flags are still raised and
 * no job is created, so `nonresponse_flags.escalation_job_id` is null. W5
 * requires exactly that: held and visibly unsent, never dropped and never sent
 * to a stale holder. It is not an error and it does not stop the sweep.
 */
async function raiseDueEscalations(): Promise<{
  flagsRaised: number;
  escalationsCreated: number;
  escalationsHeld: number;
}> {
  return withTransaction(async (tx) => {
    // A late-approved event never escalates (`REQ-late-approval`), and the plan
    // records that as a null `escalation_at` rather than as a boolean somebody
    // has to remember to read — so the predicate below excludes it without
    // naming it.
    const due = await tx.query<{ event_id: string }>(
      `select p.event_id
         from public.event_messaging_plans p
         join public.events e on e.id = p.event_id
        where p.escalation_at is not null
          and p.escalation_at <= now()
          and e.status = 'approved'
        order by p.escalation_at
        limit $1`,
      [SWEEP_BATCH_LIMIT],
    );

    let flagsRaised = 0;
    let escalationsCreated = 0;
    let escalationsHeld = 0;

    const president = await currentPresidentIn(tx);

    for (const { event_id: eventId } of due.rows) {
      // `nonresponse_queue` is the shipped view and it is the definition of who
      // has not answered — awaiting a response or expired without one, on an
      // approved event. Reading it rather than reimplementing the predicate is
      // what keeps the chase queue an operator sees and the escalation the
      // President receives counting the same people.
      const raised = await tx.query<{ invitation_id: string }>(
        `insert into public.nonresponse_flags (invitation_id, threshold)
         select q.invitation_id, 'escalation'::public.nonresponse_threshold
           from public.nonresponse_queue q
          where q.event_id = $1 and q.invitation_id is not null
         on conflict (invitation_id, threshold) do nothing
         returning invitation_id`,
        [eventId],
      );

      flagsRaised += raised.rowCount ?? 0;

      // Counted from the open flags rather than from the ones just raised. A
      // rerun raises none and must still be able to say how many people the
      // escalation is about, and an escalation whose count came from
      // `raised.rowCount` would read "0 people have not answered" on the second
      // tick after a crash.
      const outstanding = await tx.query<{ count: number }>(
        `select count(*)::int as count
           from public.nonresponse_flags f
           join public.invitations i on i.id = f.invitation_id
          where i.event_id = $1 and f.threshold = 'escalation' and f.resolved_at is null`,
        [eventId],
      );

      const count = outstanding.rows[0]?.count ?? 0;
      if (count === 0) continue;

      if (president === null) {
        // Held and visibly unsent. The flags carry no job, which is the state
        // the follow-up queue reads as "escalation held: no President in post".
        escalationsHeld += 1;
        await recordAudit(tx, {
          actorLabel: SWEEP_ACTOR_LABEL,
          action: "delivery.escalation_held",
          entityTable: "events",
          entityId: eventId,
          reason:
            "The President's office is vacant, so this escalation is held rather than sent to " +
            "a former holder.",
          context: { outstanding: count },
        });
        continue;
      }

      // Every mention of `$1` is cast explicitly, and that is load-bearing
      // rather than decorative: PostgreSQL infers exactly one type per
      // parameter, so `'event:' || $1::text` alone would fix `$1` as text and
      // the `event_id` column — a uuid — would then refuse the same value.
      const job = await tx.query<{ id: string }>(
        `insert into public.notification_jobs
           (idempotency_key, job_type, status, event_id, person_id, channel,
            scheduled_for, template_variables)
         values ('event:' || $1::uuid::text || ':escalation', 'escalation', 'pending',
                 $1::uuid, $2::uuid, 'whatsapp', now(), $3::jsonb)
         on conflict (idempotency_key) do nothing
         returning id`,
        [eventId, president, JSON.stringify({ outstanding: count })],
      );

      const jobId = job.rows[0]?.id ?? null;
      if (jobId !== null) escalationsCreated += 1;

      // Linked whether or not this tick created the job, so a flag raised on a
      // later tick — somebody who answered and then withdrew — still names the
      // escalation the club actually sent for that event.
      const existing =
        jobId ??
        (
          await tx.query<{ id: string }>(
            `select id from public.notification_jobs
              where idempotency_key = 'event:' || $1::uuid::text || ':escalation'`,
            [eventId],
          )
        ).rows[0]?.id ??
        null;

      if (existing !== null) {
        await tx.query(
          `update public.nonresponse_flags f
              set escalation_job_id = $2
             from public.invitations i
            where i.id = f.invitation_id
              and i.event_id = $1
              and f.threshold = 'escalation'
              and f.escalation_job_id is null`,
          [eventId, existing],
        );
      }

      if (jobId !== null) {
        await recordAudit(tx, {
          actorLabel: SWEEP_ACTOR_LABEL,
          action: "delivery.escalation_raised",
          entityTable: "events",
          entityId: eventId,
          context: { outstanding: count, notificationJobId: jobId },
        });
      }
    }

    return { flagsRaised, escalationsCreated, escalationsHeld };
  });
}

// ---------------------------------------------------------------------------
// Dispatching what is due
// ---------------------------------------------------------------------------

/**
 * Every job whose moment has arrived.
 *
 * Two quite different kinds of "due" in one predicate, and the distinction is
 * the whole of `REQ-retries-have-no-actor`:
 *
 *   * A **rung** is due when `scheduled_for` has passed. That is the ladder.
 *   * A **failed** job is due when `next_attempt_at` has passed. That is the
 *     backoff, and a failed job with no `next_attempt_at` is deliberately never
 *     picked up — it was refused terminally (a dead credential, an unroutable
 *     number, a rejected template) and retrying it automatically would burn the
 *     ceiling and hide the cause behind "failed 5 times".
 *
 * `held_at is null` is here as well as in `claimJobIn`, so a held job is not
 * even counted as attempted. LAN-156's hold means the event was amended after
 * the job was queued; sending it would deliver a superseded venue.
 */
async function readDueJobs(limit: number): Promise<readonly { id: string; jobType: string }[]> {
  return withTransaction(async (tx) => {
    const result = await tx.query<{ id: string; job_type: string }>(
      `select id, job_type::text as job_type
         from public.notification_jobs
        where held_at is null
          -- The rungs this package schedules, the escalation it raises, and
          -- OWNER-LAN173-03's two notices.
          --
          -- Named as an allow-list rather than an exclusion so a seventh job
          -- type is not silently swept the day somebody adds one.
          and job_type in (
            'invitation', 'reminder', 'escalation',
            'schedule_change_notice', 'cancellation_notice'
          )
          -- A player-facing rung whose event has already begun is
          -- undispatchable, and this predicate is what stops the sweep
          -- discovering that forever.
          --
          -- issueTokenIn refuses to mint a token for an event that has started
          -- — the link would be dead on arrival — and that refusal travels out
          -- through the claim transaction, which rolls back. So attempt_count
          -- never increments, the job never exhausts its ceiling, and every
          -- tick from now on claims it, fails, and rolls back. Observed on the
          -- seeded database, where a synthetic event with a past date carries
          -- pending rungs.
          --
          -- Three job types are exempt from this check, for three different
          -- reasons:
          --
          --   * escalation mints no token, is addressed to a committee
          --     officer rather than a player, and an event whose start has
          --     passed with nobody having answered is exactly when the
          --     President most needs telling.
          --   * cancellation_notice's event is cancelled by definition -- that
          --     is the only reason the job exists -- so e.status = 'approved'
          --     could never hold for it. Dispatched by dispatchNoticeJob
          --     below, which mints no token either, for the identical reason
          --     escalation does not: issueTokenIn refuses a cancelled
          --     event's token every time, and that refusal rolling back the
          --     claim inside one transaction is what would turn this into the
          --     unbounded retry readDueJobs's own history already documents
          --     for a started event's player rungs, reached here by a
          --     different door.
          --   * schedule_change_notice is deliberately NOT exempt. Its event
          --     is ordinarily still approved and future when the notice is
          --     dispatched (it is created in the same transaction as the
          --     amendment that leaves the event that way), so it takes the
          --     same dispatchJob/claimJobIn path invitation and reminder
          --     do, minting a real, working link. The rare case where the
          --     event became cancelled or started before dispatch is not a
          --     special case to detect -- this same predicate already excludes
          --     it, exactly as it does for a stale invitation, so the notice
          --     simply is not selected rather than being claimed and thrown
          --     against.
          --
          -- The status test excludes a cancelled event's rungs too. cancelEvent
          -- already cancels them, so this is belt and braces rather than the
          -- mechanism — but it costs nothing, and it means a job that escaped
          -- that path is not chased about an event that is not happening.
          and (
            job_type = 'escalation'
            or job_type = 'cancellation_notice'
            or exists (
              select 1
                from public.events e
               where e.id = notification_jobs.event_id
                 and e.status = 'approved'
                 and (e.scheduled_on + coalesce(e.starts_at, '00:00'::time))
                       at time zone 'Europe/London' > now()
            )
          )
          and attempt_count < $1
          and (
            (status in ('pending', 'ready') and coalesce(scheduled_for, created_at) <= now())
            or (status = 'failed' and next_attempt_at is not null and next_attempt_at <= now())
          )
        order by coalesce(next_attempt_at, scheduled_for, created_at)
        limit $2`,
      [MAX_ATTEMPTS, limit],
    );
    return result.rows.map((row) => ({ id: row.id, jobType: row.job_type }));
  });
}

/**
 * One tick.
 *
 * Returns what it did rather than logging it, so the trigger endpoint can
 * answer with evidence and a test can assert on the numbers instead of on a
 * side effect.
 */
export async function runMessagingSweep(
  options: {
    source?: EnvironmentSource;
    transport?: Transport;
    limit?: number;
  } = {},
): Promise<SweepSummary> {
  const raised = await raiseDueEscalations();

  const due = await readDueJobs(options.limit ?? SWEEP_BATCH_LIMIT);

  let accepted = 0;
  let refused = 0;
  let skipped = 0;

  for (const job of due) {
    try {
      const outcome =
        job.jobType === "escalation"
          ? await dispatchEscalationJob(job.id, options)
          : job.jobType === "cancellation_notice"
            ? await dispatchNoticeJob(job.id, options)
            : await dispatchJob(job.id, { ...options, automatic: true });

      if (outcome === "accepted") accepted += 1;
      else if (outcome === "refused") refused += 1;
      else skipped += 1;
    } catch {
      // Per job, for the reason the approval loop is: one job that throws must
      // not stop the other forty-nine. The failure is already durable on the
      // job row — `dispatchJob` records it — and what is discarded here is a
      // summary nobody reads.
      refused += 1;
    }
  }

  return {
    dispatched: accepted + refused,
    accepted,
    refused,
    skipped,
    flagsRaised: raised.flagsRaised,
    escalationsCreated: raised.escalationsCreated,
    escalationsHeld: raised.escalationsHeld,
  };
}

// ---------------------------------------------------------------------------
// The escalation's own dispatch
// ---------------------------------------------------------------------------

/**
 * Sends one escalation, to an office holder, about an event.
 *
 * A separate path from `dispatchJob` and deliberately so. Every assumption that
 * function is built on is false here: an escalation has no invitation, mints no
 * RSVP token, is addressed to a committee officer rather than an invitee, and
 * must carry **no player personal data** at all. Threading those four
 * exceptions through `claimJobIn` would have put an "if this is an escalation"
 * branch on the path that runs on every event approval, which is the working
 * code this package was warned not to endanger.
 *
 * What it shares is the shape — claim, send, record — and the claim's
 * concurrency control, so two sweeps produce one escalation.
 */
export async function dispatchEscalationJob(
  jobId: string,
  options: { source?: EnvironmentSource; transport?: Transport } = {},
): Promise<"accepted" | "refused" | "skipped"> {
  const resolution = resolveDeliveryProvider(options.source ?? process.env, options.transport);

  if (!resolution.ok) {
    await withTransaction(async (tx) => {
      await tx.query(
        `update public.notification_jobs
            set status = 'failed', last_error = $2, updated_at = now()
          where id = $1 and status in ('pending', 'ready', 'failed')`,
        [jobId, resolution.reason],
      );
    });
    return "refused";
  }

  const context = resolution.context;

  const claim = await withTransaction(async (tx) => {
    const claimed = await tx.query<{
      id: string;
      event_id: string;
      person_id: string;
      attempt_count: number;
    }>(
      `update public.notification_jobs
          set status = 'processing', claimed_at = now(), claimed_by = $2,
              attempt_count = attempt_count + 1, last_error = null, updated_at = now()
        where id = $1
          and job_type = 'escalation'
          and status in ('pending', 'ready', 'failed')
          and held_at is null
          and attempt_count < $3
          and event_id is not null
          and person_id is not null
        returning id, event_id, person_id, attempt_count`,
      [jobId, `${SWEEP_ACTOR_LABEL}:${jobId}`, MAX_ATTEMPTS],
    );

    const job = claimed.rows[0];
    if (!job) return null;

    const details = await tx.query<{
      event_name: string;
      when_label: string;
      deadline_label: string | null;
      outstanding: number;
    }>(
      `select e.name as event_name,
              to_char(
                (e.scheduled_on + coalesce(e.starts_at, '00:00'::time))
                  at time zone 'Europe/London' at time zone 'Europe/London',
                'FMDay FMDD FMMonth, HH24:MI') as when_label,
              to_char(
                p.response_deadline_at at time zone 'Europe/London',
                'FMDay FMDD FMMonth, HH24:MI') as deadline_label,
              (select count(*)::int
                 from public.nonresponse_flags f
                 join public.invitations i on i.id = f.invitation_id
                where i.event_id = e.id and f.threshold = 'escalation'
                  and f.resolved_at is null) as outstanding
         from public.events e
         left join public.event_messaging_plans p on p.event_id = e.id
        where e.id = $1`,
      [job.event_id],
    );

    const detail = details.rows[0];
    if (!detail) return null;

    // The office holder's own contact details, read the same way an invitee's
    // are. This is the one personal datum an escalation touches, and it is the
    // recipient's rather than a player's.
    const contacts = await tx.query<{
      kind: string;
      raw_value: string;
      normalised_value: string | null;
      is_preferred: boolean;
    }>(
      `select kind::text as kind, raw_value, normalised_value, is_preferred
         from public.contact_points
        where person_id = $1
          and valid_from <= current_date
          and (valid_until is null or valid_until > current_date)
        order by is_preferred desc, valid_from desc, created_at desc, id`,
      [job.person_id],
    );

    const rows = contacts.rows.map((row) => ({
      kind: row.kind,
      rawValue: row.raw_value,
      normalisedValue: row.normalised_value,
      isPreferred: row.is_preferred,
    }));

    const recipient =
      context.channel === "email"
        ? (rows.find((row) => row.kind === "email")?.normalisedValue ??
          rows.find((row) => row.kind === "email")?.rawValue ??
          null)
        : selectMobileNumber(rows, context.defaultCallingCode);

    if (!recipient) {
      await failClaimTerminallyIn(
        tx,
        jobId,
        context.channel === "email" ? NO_USABLE_EMAIL_REASON : NO_USABLE_NUMBER_REASON,
        job.attempt_count,
        context.channel,
        context.provider.name,
      );
      return null;
    }

    const permitted =
      context.channel === "email"
        ? emailPermitted(recipient, context.emailAllowlist)
        : recipientPermitted(recipient, context.recipientAllowlist, context.defaultCallingCode);

    if (!permitted) {
      await failClaimTerminallyIn(
        tx,
        jobId,
        context.channel === "email" ? EMAIL_NOT_PERMITTED_REASON : RECIPIENT_NOT_PERMITTED_REASON,
        job.attempt_count,
        context.channel,
        context.provider.name,
      );
      return null;
    }

    const attempt = await tx.query<{ id: string }>(
      `insert into public.delivery_attempts
         (notification_job_id, attempt_number, channel, provider)
       values ($1, $2, $3, $4)
       returning id`,
      [jobId, job.attempt_count, context.channel, context.provider.name],
    );

    return {
      attemptId: attempt.rows[0].id,
      attemptNumber: job.attempt_count,
      message: {
        kind: "escalation" as const,
        recipient,
        // Deliberately not a name. The escalation template declares no name
        // parameter at all — see `templates.ts` — and these two fields exist
        // only because they are on the shared message type. A template with a
        // name slot is a template something can later put a player's name into.
        inviteeName: "",
        eventName: detail.event_name,
        whenLabel: detail.when_label.replace(/\s+/g, " ").trim(),
        deadlineLabel: detail.deadline_label?.replace(/\s+/g, " ").trim() ?? null,
        outstandingCount: detail.outstanding,
        // The queue, not the names. The club login is the boundary that decides
        // who reads a roster, and this message travels outside it.
        queueUrl: `${context.appBaseUrl}/operate/follow-ups`,
        // Empty, and not a URL. An escalation is a message *about* players, to
        // a committee officer; there is nothing here for anybody to answer, and
        // the escalation template declares no link parameter. Building a
        // `/rsvp/` URL with no token would put a dead link on a message object
        // that something later might decide to render.
        rsvpUrl: "",
      },
    };
  });

  if (claim === null) return "skipped";

  const outcome = await context.provider.send(claim.message);

  await withTransaction(async (tx) => {
    if (outcome.status === "accepted") {
      await tx.query(
        `update public.delivery_attempts
            set accepted_at = now(), provider_message_id = $2 where id = $1`,
        [claim.attemptId, outcome.providerMessageId],
      );
      await tx.query("update public.notification_jobs set next_attempt_at = null where id = $1", [
        jobId,
      ]);
      await recordAudit(tx, {
        actorLabel: DISPATCH_ACTOR_LABEL,
        action: "delivery.attempted",
        entityTable: "notification_jobs",
        entityId: jobId,
        context: {
          attemptNumber: claim.attemptNumber,
          provider: context.provider.name,
          channel: context.channel,
          providerMessageId: outcome.providerMessageId,
        },
      });
      return;
    }

    await tx.query(
      "update public.delivery_attempts set concluded_at = now(), failure_reason = $2 where id = $1",
      [claim.attemptId, outcome.reason],
    );
    await tx.query(
      `insert into public.delivery_results
         (notification_job_id, attempt_number, outcome, channel, provider, detail)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (notification_job_id, attempt_number) do nothing`,
      [
        jobId,
        claim.attemptNumber,
        outcome.retryable ? "failed" : "rejected",
        context.channel,
        context.provider.name,
        outcome.reason,
      ],
    );
    // W5: "The escalation itself fails to send — it is a delivery failure like
    // any other and appears in W6, never silently discarded."
    await tx.query(
      `update public.notification_jobs
          set status = 'failed', last_error = $2, claimed_at = null, claimed_by = null,
              next_attempt_at = case when $3 then now() + interval '15 minutes' else null end,
              automatic_attempts = automatic_attempts + 1,
              updated_at = now()
        where id = $1`,
      [jobId, outcome.reason, outcome.retryable],
    );
  });

  return outcome.status === "accepted" ? "accepted" : "refused";
}

/**
 * Records a claim that could not be attempted at all — no usable route, or
 * one this deployment may not message. Shared by the escalation dispatcher
 * and {@link dispatchNoticeJob} below; nothing in it is escalation-specific.
 */
async function failClaimTerminallyIn(
  tx: Tx,
  jobId: string,
  reason: string,
  attemptNumber: number,
  channel: string,
  provider: string,
): Promise<void> {
  await tx.query(
    `update public.notification_jobs
        set status = 'failed', last_error = $2, claimed_at = null, claimed_by = null,
            next_attempt_at = null, updated_at = now()
      where id = $1`,
    [jobId, reason],
  );
  await tx.query(
    `insert into public.delivery_results
       (notification_job_id, attempt_number, outcome, channel, provider, detail)
     values ($1, $2, 'failed', $3, $4, $5)
     on conflict (notification_job_id, attempt_number) do nothing`,
    [jobId, attemptNumber, channel, provider, reason],
  );
}

// ---------------------------------------------------------------------------
// The cancellation notice's own dispatch — OWNER-LAN173-03
// ---------------------------------------------------------------------------

/**
 * Fixed, generic, and never `events.decision_reason`.
 *
 * W8's `D76` is a hard boundary: the internal reason an operator records for
 * cancelling an event stays behind the operator login, in
 * `events.decision_reason` and in the audit trail, and goes nowhere near a
 * recipient-facing payload. This sentence is what a cancellation notice says
 * instead — true of every cancellation, and no operator's actual words.
 */
export const CANCELLATION_NOTICE_SAFE_REASON = "The club has cancelled this event.";

/**
 * Sends one cancellation notice, with no RSVP token minted. OWNER-LAN173-03.
 *
 * A cancellation notice's event is cancelled by definition — that is the only
 * reason `recordNoticesOwedIn` ever writes one — so the ordinary claim
 * (`claimJobIn`, in `./delivery`, used by every invitation and reminder) is
 * the wrong tool for it: it mints an RSVP token through `issueTokenIn`, which
 * refuses a cancelled event's token every time. That refusal rolls back the
 * claim's own `attempt_count` increment inside the same transaction, so a job
 * that hit it would be reclaimed and rethrown by every following sweep tick,
 * forever, without ever reaching its attempt ceiling — the identical
 * unbounded-retry failure `readDueJobs`'s own history above documents for a
 * started event's player rungs, reached here by a different door.
 *
 * Modelled on `dispatchEscalationJob`'s shape for the same reason that
 * function exists: claim, send, record — no token, no invitation lookup, no
 * ladder rung. `schedule_change_notice` does not need this: its event is
 * ordinarily still approved when the notice is dispatched, so it takes the
 * normal `dispatchJob` path and gets a real, working link (see the comment on
 * `readDueJobs`'s job-type filter above).
 */
export async function dispatchNoticeJob(
  jobId: string,
  options: { source?: EnvironmentSource; transport?: Transport } = {},
): Promise<"accepted" | "refused" | "skipped"> {
  const resolution = resolveDeliveryProvider(options.source ?? process.env, options.transport);

  if (!resolution.ok) {
    await withTransaction(async (tx) => {
      await tx.query(
        `update public.notification_jobs
            set status = 'failed', last_error = $2, updated_at = now()
          where id = $1 and status in ('pending', 'ready', 'failed')`,
        [jobId, resolution.reason],
      );
    });
    return "refused";
  }

  const context = resolution.context;

  const claim = await withTransaction(async (tx) => {
    const claimed = await tx.query<{
      id: string;
      invitation_id: string;
      event_id: string;
      person_id: string;
      attempt_count: number;
    }>(
      // No `issueTokenIn` call anywhere in this claim — that is the whole of
      // what makes this dispatcher safe against a cancelled event. `held_at`
      // is still checked: an amendment that held this job's siblings before
      // the event was ever cancelled should not have this one slip past that
      // hold through a different door.
      `update public.notification_jobs
          set status = 'processing', claimed_at = now(), claimed_by = $2,
              attempt_count = attempt_count + 1, last_error = null, updated_at = now()
        where id = $1
          and job_type = 'cancellation_notice'
          and status in ('pending', 'ready', 'failed')
          and held_at is null
          and attempt_count < $3
          and invitation_id is not null
        returning id, invitation_id, event_id, person_id, attempt_count`,
      [jobId, `${SWEEP_ACTOR_LABEL}:${jobId}`, MAX_ATTEMPTS],
    );

    const job = claimed.rows[0];
    if (!job) return null;

    const details = await tx.query<{
      event_name: string;
      when_label: string;
      given_name: string;
      known_as: string | null;
    }>(
      `select e.name as event_name,
              to_char(
                (e.scheduled_on + coalesce(e.starts_at, '00:00'::time)) at time zone 'Europe/London',
                'FMDay FMDD FMMonth, HH24:MI') as when_label,
              p.given_name, p.known_as
         from public.invitations i
         join public.events e on e.id = i.event_id
         left join public.season_memberships m on m.id = i.season_membership_id
         join public.people p on p.id = coalesce(i.person_id, m.person_id)
        where i.id = $1`,
      [job.invitation_id],
    );

    const detail = details.rows[0];
    if (!detail) return null;

    const contacts = await tx.query<{
      kind: string;
      raw_value: string;
      normalised_value: string | null;
      is_preferred: boolean;
    }>(
      `select kind::text as kind, raw_value, normalised_value, is_preferred
         from public.contact_points
        where person_id = $1
          and valid_from <= current_date
          and (valid_until is null or valid_until > current_date)
        order by is_preferred desc, valid_from desc, created_at desc, id`,
      [job.person_id],
    );

    const rows = contacts.rows.map((row) => ({
      kind: row.kind,
      rawValue: row.raw_value,
      normalisedValue: row.normalised_value,
      isPreferred: row.is_preferred,
    }));

    const recipient =
      context.channel === "email"
        ? (rows.find((row) => row.kind === "email")?.normalisedValue ??
          rows.find((row) => row.kind === "email")?.rawValue ??
          null)
        : selectMobileNumber(rows, context.defaultCallingCode);

    if (!recipient) {
      await failClaimTerminallyIn(
        tx,
        jobId,
        context.channel === "email" ? NO_USABLE_EMAIL_REASON : NO_USABLE_NUMBER_REASON,
        job.attempt_count,
        context.channel,
        context.provider.name,
      );
      return null;
    }

    const permitted =
      context.channel === "email"
        ? emailPermitted(recipient, context.emailAllowlist)
        : recipientPermitted(recipient, context.recipientAllowlist, context.defaultCallingCode);

    if (!permitted) {
      await failClaimTerminallyIn(
        tx,
        jobId,
        context.channel === "email" ? EMAIL_NOT_PERMITTED_REASON : RECIPIENT_NOT_PERMITTED_REASON,
        job.attempt_count,
        context.channel,
        context.provider.name,
      );
      return null;
    }

    const attempt = await tx.query<{ id: string }>(
      `insert into public.delivery_attempts
         (notification_job_id, attempt_number, channel, provider)
       values ($1, $2, $3, $4)
       returning id`,
      [jobId, job.attempt_count, context.channel, context.provider.name],
    );

    const known = detail.known_as?.trim();

    return {
      attemptId: attempt.rows[0].id,
      attemptNumber: job.attempt_count,
      message: {
        kind: "cancellation" as const,
        recipient,
        inviteeName: known && known !== "" ? known : detail.given_name,
        eventName: detail.event_name,
        whenLabel: detail.when_label.replace(/\s+/g, " ").trim(),
        // D76/D59. Fixed and generic — never the operator's own recorded
        // reason. See `CANCELLATION_NOTICE_SAFE_REASON`.
        cancellationReason: CANCELLATION_NOTICE_SAFE_REASON,
        // No token was minted and none is offered. `CANCELLATION`'s own
        // template has no rsvpUrl parameter at all — there is nothing left to
        // answer, and the wireframe rule against a control that cannot act
        // applies to a link exactly as it does to a button.
        rsvpUrl: "",
      },
    };
  });

  if (claim === null) return "skipped";

  const outcome = await context.provider.send(claim.message);

  await withTransaction(async (tx) => {
    if (outcome.status === "accepted") {
      await tx.query(
        `update public.delivery_attempts
            set accepted_at = now(), provider_message_id = $2 where id = $1`,
        [claim.attemptId, outcome.providerMessageId],
      );
      await tx.query("update public.notification_jobs set next_attempt_at = null where id = $1", [
        jobId,
      ]);
      await recordAudit(tx, {
        actorLabel: DISPATCH_ACTOR_LABEL,
        action: "delivery.attempted",
        entityTable: "notification_jobs",
        entityId: jobId,
        context: {
          attemptNumber: claim.attemptNumber,
          provider: context.provider.name,
          channel: context.channel,
          providerMessageId: outcome.providerMessageId,
        },
      });
      return;
    }

    await tx.query(
      "update public.delivery_attempts set concluded_at = now(), failure_reason = $2 where id = $1",
      [claim.attemptId, outcome.reason],
    );
    await tx.query(
      `insert into public.delivery_results
         (notification_job_id, attempt_number, outcome, channel, provider, detail)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (notification_job_id, attempt_number) do nothing`,
      [
        jobId,
        claim.attemptNumber,
        outcome.retryable ? "failed" : "rejected",
        context.channel,
        context.provider.name,
        outcome.reason,
      ],
    );
    await tx.query(
      `update public.notification_jobs
          set status = 'failed', last_error = $2, claimed_at = null, claimed_by = null,
              next_attempt_at = case when $3 then now() + interval '15 minutes' else null end,
              automatic_attempts = automatic_attempts + 1,
              updated_at = now()
        where id = $1`,
      [jobId, outcome.reason, outcome.retryable],
    );
  });

  return outcome.status === "accepted" ? "accepted" : "refused";
}
