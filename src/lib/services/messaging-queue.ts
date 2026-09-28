/**
 * What makes a notification job **due** — one definition, in one place.
 *
 * LAN-394 extracted it and gave it a module of its own. It had one reader, the
 * sweep; it now has three — the sweep that dispatches due jobs, the Messaging
 * safety section that counts them, and the queue-age warning that alerts on the
 * oldest — and three readings of "due" that could drift apart would mean an
 * operator being warned about a backlog the scheduler was never going to touch.
 * That is not hypothetical: the page briefly carried a looser predicate of its
 * own and reported 645 due jobs on the seeded database, every one of them for
 * an event that had long since happened.
 *
 * ## Why a file with nothing else in it
 *
 * `messaging-scheduler.ts` imports the safety service, and the safety service's
 * status read needs this. Leaving it on the scheduler made that a cycle, and a
 * cycle whose consequence is a module-scope `ReferenceError` at build time
 * rather than anything a reader would predict. A leaf module that imports
 * nothing cannot be half of one.
 *
 * It is a SQL fragment rather than a view because it is parameterised by the
 * attempt ceiling, and because every reader applies it to
 * `public.notification_jobs` under that exact name — the correlated subquery on
 * `messaging_safety_scopes` refers to it.
 *
 * **`$1` is the attempt ceiling** (`MAX_ATTEMPTS`). A caller supplies it.
 *
 * LAN-433 adds lights-out through {@link lightsOutAdmitsSql}, which every reader
 * appends with its own parameter. Its one import is the pure lights-out module.
 */
import { LIGHTS_OUT_EXEMPT_JOB_TYPES } from "./messaging-schedule/lights-out";

export const DUE_JOB_PREDICATE = `held_at is null
          -- LAN-394. Two cheap exclusions, before the limit rather than after
          -- it, and they are what stops a blocked recipient filling every page.
          --
          -- A job the guard deferred carries its own not-before; until that
          -- passes there is no point claiming it only to be deferred again. And
          -- a job held back by a scope that is still paused or latched is not a
          -- candidate at all — an operator's resume is what makes it one, and
          -- that resume clears these columns itself.
          and (safety_retry_at is null or safety_retry_at <= now())
          and not exists (
            select 1 from public.messaging_safety_scopes s
             where s.id = notification_jobs.safety_block_scope_id
               and (s.paused_at is not null or s.latched_at is not null)
          )
          -- The rungs this package schedules, the escalation it raises,
          -- OWNER-LAN173-03's two notices, LAN-367's question-change re-ask,
          -- and LAN-203's own recruitment cycle messages.
          --
          -- Named as an allow-list rather than an exclusion so a seventh job
          -- type is not silently swept the day somebody adds one.
          -- 'other' is not the seventh: it is the sixth, already declared
          -- and unused everywhere else in this codebase (a grep confirms
          -- it), and only the recruit-cycle: idempotency-key shape admitted
          -- here is new — see declareRecruitmentCycleJobsIn
          -- (recruitment-cycle.ts) for why 'other' was the safe value to
          -- adopt rather than a migrated seventh.
          --
          -- 'question_change_notice' (LAN-367) was declared by
          -- declareQuestionReAskIn (event-question-changes.ts) but omitted
          -- here when that job type was added, leaving every such job stuck
          -- at pending forever -- readDueJobs is the only query
          -- runMessagingSweep uses to discover work. Admitted on the
          -- identical reasoning schedule_change_notice already has directly
          -- below: it carries a real event_id, so it takes the ordinary
          -- dispatchJob/claimJobIn path and falls through the
          -- approved-and-future exists(...) guard rather than needing an
          -- exemption from it.
          and (
            job_type in (
              'invitation', 'reminder', 'escalation',
              'schedule_change_notice', 'cancellation_notice',
              'question_change_notice'
            )
            or (job_type = 'other' and idempotency_key like 'recruit-cycle:%')
            -- LAN-215. emitOnboardingOpenedWelcomeIn's own idempotency-key
            -- shape, admitted here on the identical "other, adopted rather
            -- than migrated" reasoning declareRecruitmentCycleJobsIn used
            -- first.
            or (job_type = 'other' and idempotency_key like 'onboarding-welcome:%')
            -- LAN-218. The automated chase, an operator's own nudge, and the
            -- one-per-cohort exhaustion escalation -- three more shapes of the
            -- identical idiom. onboarding-chase-exhausted: (the per-membership
            -- marker) is deliberately NOT admitted here: it is never dispatched,
            -- only ever inserted as a ledger row, status = 'completed' from
            -- the moment it is written.
            or (job_type = 'other' and idempotency_key like 'onboarding-chase:%')
            or (job_type = 'other' and idempotency_key like 'onboarding-nudge:%')
            or (job_type = 'other' and idempotency_key like 'onboarding-chase-escalation:%')
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
          --   * question_change_notice is deliberately NOT exempt either, for
          --     the identical reason schedule_change_notice is not:
          --     declareQuestionReAskIn (event-question-changes.ts) only
          --     writes it inside the same transaction as the question edit
          --     that leaves the event approved and future, so it takes the
          --     ordinary dispatchJob/claimJobIn path and mints a real
          --     answer-page link, and a save that somehow left the event
          --     cancelled or started is excluded by this same predicate
          --     rather than needing a special case.
          --
          -- The status test excludes a cancelled event's rungs too. cancelEvent
          -- already cancels them, so this is belt and braces rather than the
          -- mechanism — but it costs nothing, and it means a job that escaped
          -- that path is not chased about an event that is not happening.
          and (
            job_type = 'escalation'
            or job_type = 'cancellation_notice'
            -- LAN-203. A cycle job carries no event at all — event_id is
            -- always null — so it is exempt from the event-approved-and-
            -- future check for the identical reason escalation is: there is
            -- no event lifecycle to check against.
            or (job_type = 'other' and idempotency_key like 'recruit-cycle:%')
            -- LAN-215. Same reasoning again: an onboarding welcome carries
            -- no event at all.
            or (job_type = 'other' and idempotency_key like 'onboarding-welcome:%')
            -- LAN-218. Same reasoning a third time: none of the chase, the
            -- nudge or its escalation carries an event either.
            or (job_type = 'other' and idempotency_key like 'onboarding-chase:%')
            or (job_type = 'other' and idempotency_key like 'onboarding-nudge:%')
            or (job_type = 'other' and idempotency_key like 'onboarding-chase-escalation:%')
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
          )`;

const EXEMPT_JOB_TYPES_SQL = LIGHTS_OUT_EXEMPT_JOB_TYPES.map((type) => `'${type}'`).join(", ");

/**
 * LAN-433. Lights-out's share of "due", for every reader of
 * {@link DUE_JOB_PREDICATE}: while the window is on, only the three exempt
 * notices are due. `param` is the caller's own boolean placeholder, bound to
 * `isLightsOut(lightsOutNow())` — decided in the application, not by the
 * database's clock, so a test can pin the hour.
 */
export function lightsOutAdmitsSql(param: string): string {
  return `(not ${param}::boolean or job_type::text in (${EXEMPT_JOB_TYPES_SQL}))`;
}

/**
 * LAN-433. The moment a due job became sendable, for the queue-age warning: a
 * held job counts from the last 07:00 release rather than from its rung, so the
 * morning's released pile is not reported as a nine-hour backlog. `param` is
 * bound to `lastLightsOutReleaseAt(lightsOutNow())`.
 */
export function sendableSinceSql(param: string): string {
  const due = "coalesce(next_attempt_at, scheduled_for, created_at)";
  return `case when job_type::text in (${EXEMPT_JOB_TYPES_SQL}) then ${due}
               else greatest(${due}, ${param}::timestamptz) end`;
}
