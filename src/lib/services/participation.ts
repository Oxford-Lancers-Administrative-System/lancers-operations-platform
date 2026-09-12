import "server-only";

import { NotFound, withTransaction, type Tx } from "@/lib/db";
import { requireCapability, requireGeneralOperator } from "@/lib/auth/guards";
import { NO_USABLE_EMAIL_REASON } from "@/lib/delivery/email";
import { NO_USABLE_NUMBER_REASON } from "@/lib/delivery/phone";

import { isAttendancePresence, type AttendancePresence } from "./attendance-vocabulary";
import { chasePositionLabel, type ChaseJobFact } from "./chase-position";
import {
  deriveClubLinkToken,
  issueClubLinkIn,
  resolveClubLinkIn,
  type ClubLinkResolution,
  type EnvSource,
  type IssuedClubLink,
} from "./club-link";
import {
  DELIVERY_LATEST_RESULT_JOIN,
  DELIVERY_STATE_EXPRESSION,
  EMAIL_FALLBACK_SUFFIX,
  NOTIFICATION_JOB_RECENCY_ORDER,
  type DeliveryState,
} from "./delivery";
import { readEventIn } from "./events";
import { JOB_CANCELLED_REASON } from "./rsvp";
import { personDisplayNameSql as displayName } from "./sql-text";
import {
  discrepancyFor,
  type ClubLinkParticipation,
  type OperatorParticipation,
  type OperatorParticipationPerson,
  type ParticipationHeadline,
  type ParticipationPerson,
  type ParticipationQuestion,
  type ParticipationTier,
} from "./participation-view";

/**
 * The participation table and its three tiers — W7, REQ-three-tiers, LAN-157.
 * One row per person: invitation, answer, attendance, question answers, plus
 * (operator tier only) delivery state. Each entry point resolves its own actor.
 */

interface PersonRow {
  invitation_id: string | null;
  attendance_id: string | null;
  capacity: string;
  season_membership_id: string | null;
  person_id: string | null;
  display_name: string | null;
  issued_at: Date | string | null;
  rsvp: string | null;
  reason: string | null;
  presence: string | null;
  delivery_state: DeliveryState | null;
  delivery_channel: string | null;
  delivery_failure_reason: string | null;
  delivery_fallback_status: string | null;
  /** LAN-296. The recorded reason, where this invitee's answer stopped a reminder. */
  reminders_stopped_reason: string | null;
}

/**
 * A reminder this invitee's own answer made unnecessary — LAN-296.
 *
 * Two writers leave this row and both write the identical sentence, which is
 * why it is compared rather than guessed at: `stopChasingIn` cancels the
 * queued rungs when the answer is recorded, and `claimJobIn` withholds one
 * whose answer arrived after the job was created (LAN-292).
 */
const REMINDER_STOPPED_BY_ANSWER = `
  j.status = 'cancelled'
    and j.job_type = 'reminder'
    and j.cancelled_reason = $2`;

/**
 * The delivery column, operator tier only — a lateral over the most recent
 * job (`notification_jobs` has no unique constraint on `invitation_id`).
 * `j.id is null` guard keeps a never-queued invitee from reading as Failed.
 *
 * ## Why a reminder the answer stopped is not a candidate — LAN-296
 *
 * Brian read a **Cancelled** chip beside a recorded **Yes** and could not tell
 * what had been cancelled. The chip was right about the row it found and wrong
 * about the question the column asks. `NOTIFICATION_JOB_RECENCY_ORDER` breaks
 * the ladder's `created_at` tie on `scheduled_for desc`, so the invitee's
 * *last* reminder rung wins — and the moment they answer, that rung is
 * cancelled. The person's invitation had been delivered; the column said
 * Cancelled; and nothing on the row said which of the invitation, the answer,
 * the reminder or the event that referred to.
 *
 * So the Delivery column answers the question it is asked — did the club's
 * message reach this person — from the jobs that are evidence about that, and
 * a reminder cancelled *because they answered* is not one: it is the record of
 * a message deliberately not sent. It comes back beside the chip instead, as
 * `reminders_stopped_reason`, in the club's own recorded words.
 *
 * An event cancellation is untouched by this and still reads **Cancelled**:
 * `cancelEvent` cancels the invitation job too, with its own different reason,
 * and that job is still a candidate here.
 *
 * `follow-ups.ts`'s lateral deliberately keeps the unnarrowed set — its queue
 * lists people who have *not* answered, so the row this excludes cannot arise
 * there. The shared recency order is unchanged; only this one caller's
 * candidate set is.
 */
const DELIVERY_LATERAL = `
  left join lateral (
    select case when j.id is null then null else ${DELIVERY_STATE_EXPRESSION} end as state,
           j.channel::text as channel,
           j.last_error as failure_reason,
           (select f.status::text
              from public.notification_jobs f
             where f.idempotency_key = j.idempotency_key || '${EMAIL_FALLBACK_SUFFIX}'
             limit 1) as fallback_status
      from public.notification_jobs j
      ${DELIVERY_LATEST_RESULT_JOIN}
     where j.invitation_id = inv.invitation_id
       and j.idempotency_key not like '%${EMAIL_FALLBACK_SUFFIX}'
       and not (${REMINDER_STOPPED_BY_ANSWER})
     ${NOTIFICATION_JOB_RECENCY_ORDER}
     limit 1
  ) delivery on true`;

/** The recorded reason, where this invitee's own answer stopped a reminder — LAN-296. */
const REMINDERS_STOPPED_LATERAL = `
  left join lateral (
    select j.cancelled_reason as reason
      from public.notification_jobs j
     where j.invitation_id = inv.invitation_id
       and (${REMINDER_STOPPED_BY_ANSWER})
     order by j.ladder_rung desc nulls last, j.id desc
     limit 1
  ) stopped on true`;

/** Every invitee and walk-up, one list, via the same `full outer join` as `./attendance.ts` (invariant P8). Not gated on the register window. */
function participantQuery(tier: ParticipationTier): string {
  const operator = tier === "operator";
  return `
  with invited as (
    select i.id as invitation_id,
           i.capacity::text as capacity,
           i.season_membership_id,
           i.person_id,
           coalesce(i.season_membership_id, i.person_id) as anchor_id,
           coalesce(i.person_id, m.person_id) as subject_person_id,
           i.issued_at
      from public.invitations i
      left join public.season_memberships m on m.id = i.season_membership_id
     where i.event_id = $1
  ),
  recorded as (
    select a.id as attendance_id,
           a.capacity::text as capacity,
           a.season_membership_id,
           a.person_id,
           coalesce(a.season_membership_id, a.person_id) as anchor_id,
           a.presence::text as presence,
           coalesce(a.person_id, m.person_id) as subject_person_id
      from public.attendance_records a
      left join public.season_memberships m on m.id = a.season_membership_id
     where a.event_id = $1
  )
  select inv.invitation_id,
         rec.attendance_id,
         coalesce(inv.capacity, rec.capacity) as capacity,
         coalesce(inv.season_membership_id, rec.season_membership_id) as season_membership_id,
         coalesce(inv.person_id, rec.person_id) as person_id,
         ${displayName("p")} as display_name,
         inv.issued_at,
         r.response::text as rsvp,
         r.reason,
         rec.presence${
           operator
             ? ",\n         delivery.state as delivery_state" +
               ",\n         delivery.channel as delivery_channel" +
               ",\n         delivery.failure_reason as delivery_failure_reason" +
               ",\n         delivery.fallback_status as delivery_fallback_status" +
               ",\n         stopped.reason as reminders_stopped_reason"
             : ""
         }
    from invited inv
    full outer join recorded rec on rec.anchor_id = inv.anchor_id
    left join public.people p
      on p.id = coalesce(inv.subject_person_id, rec.subject_person_id)
    left join public.current_rsvp r on r.invitation_id = inv.invitation_id${
      operator ? DELIVERY_LATERAL + REMINDERS_STOPPED_LATERAL : ""
    }
   order by display_name, coalesce(inv.capacity, rec.capacity)`;
}

interface QuestionRow {
  id: string;
  prompt: string;
  answer_type: string;
  sort_order: number;
  applies_to_capacities: string[];
  choices: string[] | null;
  is_required: boolean;
}

interface AnswerRow {
  invitation_id: string;
  event_question_id: string;
  answer_text: string | null;
  answer_boolean: boolean | null;
  answer_choice: string | null;
}

/** One stored answer, as the table prints it — reads whichever of the three columns the check constraint left set; a boolean prints Yes/No, not `true`. */
function answerText(row: AnswerRow): string {
  if (row.answer_boolean !== null) return row.answer_boolean ? "Yes" : "No";
  if (row.answer_choice !== null) return row.answer_choice;
  return row.answer_text ?? "";
}

function asIsoString(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/** `capacity:anchorId`, matching the attendance board's key exactly. */
function participantKey(capacity: string, membershipId: string | null, personId: string | null) {
  return `${capacity}:${membershipId ?? personId ?? ""}`;
}

async function readQuestionsIn(tx: Tx, eventId: string): Promise<ParticipationQuestion[]> {
  const result = await tx.query<QuestionRow>(
    `select id, prompt, answer_type::text as answer_type, sort_order,
            applies_to_capacities::text[] as applies_to_capacities, choices, is_required
       from public.event_questions
      where event_id = $1
      order by sort_order, prompt`,
    [eventId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    prompt: row.prompt,
    answerType: row.answer_type,
    sortOrder: row.sort_order,
    appliesToCapacities: row.applies_to_capacities,
    // choices: null means unset in storage, not "not read yet" (event_questions_choices_match_type).
    choices: row.choices,
    // isRequired: of the player, never the operator recording it. LAN-170.
    isRequired: row.is_required,
  }));
}

/** The three headline numbers. Same counts as `readEventAttendanceSummary`, one SQL definition (UX standard 7); pinned by `participation.test.ts` and `attendance.test.ts`. */
async function readHeadlineIn(tx: Tx, eventId: string): Promise<ParticipationHeadline> {
  const result = await tx.query<{
    invited: string;
    said_yes: string;
    showed: string;
    recorded: string;
  }>(
    `with invited as (
       select i.id, coalesce(i.season_membership_id, i.person_id) as anchor_id
         from public.invitations i where i.event_id = $1
     ),
     recorded as (
       select a.id, a.presence::text as presence
         from public.attendance_records a where a.event_id = $1
     )
     select (select count(*) from invited)::text as invited,
            (select count(*) from public.current_rsvp r
               join invited iv on iv.id = r.invitation_id
              where r.response = 'yes')::text as said_yes,
            (select count(*) from recorded
              where presence in ('present', 'late'))::text as showed,
            (select count(*) from recorded)::text as recorded`,
    [eventId],
  );

  const row = result.rows[0];
  const recorded = Number(row.recorded);
  return {
    invited: Number(row.invited),
    saidYes: Number(row.said_yes),
    showed: Number(row.showed),
    registerSaved: recorded > 0,
  };
}

interface ChaseJobRow {
  invitation_id: string;
  job_type: string;
  channel: string;
  ladder_rung: number | null;
  status: string;
  scheduled_for: Date | null;
}

/** Every invitation/reminder/escalation job, keyed by invitation — W4's raw material for `chasePositionLabel`. Fallback shadow job excluded, as in `DELIVERY_LATERAL`. */
async function readChaseJobsIn(tx: Tx, eventId: string): Promise<Map<string, ChaseJobFact[]>> {
  const rows = await tx.query<ChaseJobRow>(
    `select invitation_id, job_type::text as job_type, channel::text as channel,
            ladder_rung, status::text as status, scheduled_for
       from public.notification_jobs
      where event_id = $1
        and invitation_id is not null
        and job_type in ('invitation', 'reminder', 'escalation')
        and idempotency_key not like '%${EMAIL_FALLBACK_SUFFIX}'`,
    [eventId],
  );

  const byInvitation = new Map<string, ChaseJobFact[]>();
  for (const row of rows.rows) {
    const list = byInvitation.get(row.invitation_id) ?? [];
    list.push({
      jobType: row.job_type as ChaseJobFact["jobType"],
      channel: row.channel,
      ladderRung: row.ladder_rung,
      status: row.status,
      scheduledFor: row.scheduled_for,
    });
    byInvitation.set(row.invitation_id, list);
  }
  return byInvitation;
}

/** Invitations with an unresolved escalation flag (W5), mapped to that event's escalation job status (F-B1, mechanism 4; keyed via `nonresponse_flags.escalation_job_id`). */
async function readEscalationStatusByInvitationIn(
  tx: Tx,
  eventId: string,
): Promise<Map<string, string | null>> {
  const rows = await tx.query<{ invitation_id: string; status: string | null }>(
    `select f.invitation_id, j.status::text as status
       from public.nonresponse_flags f
       join public.invitations i on i.id = f.invitation_id
       left join public.notification_jobs j on j.id = f.escalation_job_id
      where i.event_id = $1 and f.threshold = 'escalation' and f.resolved_at is null`,
    [eventId],
  );
  const byInvitation = new Map<string, string | null>();
  for (const row of rows.rows) byInvitation.set(row.invitation_id, row.status);
  return byInvitation;
}

async function readPeopleIn(
  tx: Tx,
  eventId: string,
  tier: ParticipationTier,
  questions: readonly ParticipationQuestion[],
): Promise<OperatorParticipationPerson[]> {
  const operator = tier === "operator";

  // `$2` exists only in the operator tier's two delivery laterals, and
  // PostgreSQL refuses a bind carrying a parameter the statement never names,
  // so the list is built the same way the projection is.
  const rows = await tx.query<PersonRow>(
    participantQuery(tier),
    operator ? [eventId, JOB_CANCELLED_REASON] : [eventId],
  );

  const chaseJobsByInvitation = operator
    ? await readChaseJobsIn(tx, eventId)
    : new Map<string, ChaseJobFact[]>();
  const escalationStatusByInvitation = operator
    ? await readEscalationStatusByInvitationIn(tx, eventId)
    : new Map<string, string | null>();

  const answersByInvitation = new Map<string, Record<string, string>>();
  if (questions.length > 0) {
    const answers = await tx.query<AnswerRow>(
      `select invitation_id, event_question_id, answer_text, answer_boolean, answer_choice
         from public.question_responses
        where event_id = $1`,
      [eventId],
    );
    for (const row of answers.rows) {
      const bucket = answersByInvitation.get(row.invitation_id) ?? {};
      bucket[row.event_question_id] = answerText(row);
      answersByInvitation.set(row.invitation_id, bucket);
    }
  }

  return rows.rows.map((row) => {
    const answer = row.rsvp === "yes" || row.rsvp === "no" ? row.rsvp : null;
    const presence: AttendancePresence | null = isAttendancePresence(row.presence)
      ? row.presence
      : null;
    const isWalkUp = row.invitation_id === null;

    // W6, REQ-no-channel-backstop: a roster fix, not a retry.
    const noUsableRoute =
      row.delivery_state === "failed" &&
      (row.delivery_failure_reason === NO_USABLE_NUMBER_REASON ||
        row.delivery_failure_reason === NO_USABLE_EMAIL_REASON);
    const whatsappUnresponsive =
      row.delivery_channel === "whatsapp" &&
      row.delivery_state === "failed" &&
      row.delivery_fallback_status === "completed";

    // W4's exceptions: nothing to chase for a walk-up or an unreached person.
    const chaseResponseState =
      answer === "yes" ? "responded_yes" : answer === "no" ? "responded_no" : "awaiting_response";
    const chasePosition =
      isWalkUp || row.invitation_id === null || noUsableRoute
        ? null
        : chasePositionLabel({
            responseState: chaseResponseState,
            isWalkUp: false,
            escalated: escalationStatusByInvitation.has(row.invitation_id),
            escalationJobStatus: escalationStatusByInvitation.get(row.invitation_id) ?? null,
            jobs: chaseJobsByInvitation.get(row.invitation_id) ?? [],
          });

    return {
      key: participantKey(row.capacity, row.season_membership_id, row.person_id),
      displayName: row.display_name ?? "Unnamed participant",
      capacity: row.capacity,
      isWalkUp,
      invitedAt: asIsoString(row.issued_at),
      // LAN-170: null for a walk-up, who has nothing to record an answer against.
      invitationId: row.invitation_id,
      answer,
      // Invariant P3: reason is mandatory on a "no" only, so never shown against a Yes.
      reason: answer === "no" ? row.reason : null,
      presence,
      discrepancy: discrepancyFor({ answer, presence, isWalkUp }),
      answers: row.invitation_id ? (answersByInvitation.get(row.invitation_id) ?? {}) : {},
      delivery: row.delivery_state ?? null,
      noUsableRoute,
      whatsappUnresponsive,
      chasePosition,
      // LAN-296. Beside the delivery chip, never instead of it.
      remindersStoppedReason: row.reminders_stopped_reason ?? null,
    };
  });
}

/** The event facts both tiers show. The joining URL is added by one of them. */
async function readEventFactsIn(tx: Tx, eventId: string) {
  const event = await readEventIn(tx, eventId);
  return {
    detail: event,
    facts: {
      id: event.id,
      name: event.name,
      status: event.status,
      templateName: event.templateName,
      eventType: event.eventType,
      scheduledOn: event.scheduledOn,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      venue: event.venue,
      deliveryMode: event.deliveryMode,
      description: event.description,
      requiredEquipment: event.requiredEquipment,
      isMandatory: event.isMandatory,
      termLabel: event.termLabel,
      weekNumber: event.weekNumber,
    },
  };
}

/** The operator's participation table — every column, delivery included. Floor is `requireGeneralOperator()`, not a capability; a coach reads it via the club link instead (LAN-110). */
export async function readOperatorParticipation(eventId: string): Promise<OperatorParticipation> {
  await requireGeneralOperator();
  return withTransaction((tx) => buildOperatorParticipationIn(tx, eventId));
}

/** The operator payload, without the guard — exported so tests can assert tier shape without staging a session. */
export async function buildOperatorParticipationIn(
  tx: Tx,
  eventId: string,
): Promise<OperatorParticipation> {
  const { detail, facts } = await readEventFactsIn(tx, eventId);
  const questions = await readQuestionsIn(tx, eventId);
  const people = await readPeopleIn(tx, eventId, "operator", questions);
  const headline = await readHeadlineIn(tx, eventId);
  return {
    tier: "operator",
    event: { ...facts, joiningUrl: detail.joiningUrl },
    questions,
    people,
    headline,
  };
}

/** The club-link payload, without the token. See above. */
export async function buildClubLinkParticipationIn(
  tx: Tx,
  eventId: string,
): Promise<ClubLinkParticipation> {
  const { facts } = await readEventFactsIn(tx, eventId);
  const questions = await readQuestionsIn(tx, eventId);
  const people = await readPeopleIn(tx, eventId, "club_link", questions);
  const headline = await readHeadlineIn(tx, eventId);

  // Field by field, not spread, so a new `PersonRow` column can't silently widen this tier.
  const visible: ParticipationPerson[] = people.map((person) => ({
    key: person.key,
    displayName: person.displayName,
    capacity: person.capacity,
    isWalkUp: person.isWalkUp,
    invitedAt: person.invitedAt,
    answer: person.answer,
    reason: person.reason,
    presence: person.presence,
    discrepancy: person.discrepancy,
    answers: person.answers,
  }));

  return { tier: "club_link", event: facts, questions, people: visible, headline };
}

export type ClubLinkPage =
  | { readonly state: "live"; readonly participation: ClubLinkParticipation }
  /** Unknown, revoked, or pointing at an event that no longer exists. */
  | { readonly state: "unavailable" };

/**
 * The club-link tier — W7, D2, D81. Signed token is the authorisation, no
 * session. Draft events also resolve `unavailable` (invariant P1).
 */
export async function readClubLinkParticipation(
  token: string,
  options: { env?: EnvSource } = {},
): Promise<ClubLinkPage> {
  // Pure read, no stamp — see `recordClubLinkUseByToken` for the use-count side effect. LAN-269.
  return withTransaction(async (tx) => {
    const resolution: ClubLinkResolution = await resolveClubLinkIn(tx, token, options);
    if (resolution.state !== "live") return { state: "unavailable" };

    let participation: ClubLinkParticipation;
    try {
      participation = await buildClubLinkParticipationIn(tx, resolution.eventId);
    } catch (error) {
      if (error instanceof NotFound) return { state: "unavailable" };
      throw error;
    }

    return participation.event.status === "draft"
      ? { state: "unavailable" }
      : { state: "live", participation };
  });
}

/** Issue — or return — this event's club link. §4.15, inventory amendment 1. Gated on `event_calendar_management`, not the ordinary operator floor or `event_approval`. */
export async function issueEventClubLink(
  eventId: string,
  options: { env?: EnvSource } = {},
): Promise<IssuedClubLink> {
  const operator = await requireCapability("event_calendar_management");
  return withTransaction((tx) =>
    issueClubLinkIn(tx, eventId, { actorPersonId: operator.personId, env: options.env }),
  );
}

/** The live link for an event, without creating one; `null` when none issued. The share dialog reads this so opening it is never itself a write. */
export async function readEventClubLink(
  eventId: string,
  options: { env?: EnvSource } = {},
): Promise<{ readonly linkId: string; readonly token: string } | null> {
  await requireCapability("event_calendar_management");
  return withTransaction(async (tx) => {
    const live = await tx.query<{ id: string }>(
      `select id from public.club_link_tokens
        where event_id = $1 and revoked_at is null`,
      [eventId],
    );
    const row = live.rows[0];
    if (!row) return null;
    return { linkId: row.id, token: deriveClubLinkToken(eventId, row.id, options.env) };
  });
}
