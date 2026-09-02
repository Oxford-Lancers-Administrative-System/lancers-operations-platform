import "server-only";

import { withTransaction, InvalidTransition, NotFound, type Tx } from "@/lib/db";
import { todayInClubZone } from "@/lib/club-time";
import { recordAudit } from "./audit";
import { derivedEventState, type DerivedEventState, type EventStatus } from "./event-input";
import {
  readSeasonMessagingConsentIn,
  type SeasonMessagingConsentState,
} from "./messaging-consent";
import { declareRecruitmentCycleJobsIn, type RecruitmentCycleStepName } from "./recruitment-cycle";
import { generateOnboardingItems } from "./membership";
import { readSeasonLabelIn } from "./seasons";
import {
  QUESTIONNAIRE_B_CODE,
  EXIT_STATUSES,
  type AttendanceValue,
  type ProspectStatus,
  type RsvpValue,
} from "./recruitment-vocabulary";

/**
 * `/operate/recruitment/[prospectId]` — `W2`'s record, `W13`'s exits and
 * `W14`'s flip. LAN-204.
 *
 * ## Where the send machinery lives
 *
 * {@link sendRecruitmentQuestionnaireIn} is a thin wrapper around
 * `declareRecruitmentCycleJobsIn` (LAN-203) — the amendment of 2026-09-01 is
 * explicit that this package calls that function rather than writing a
 * second one. It is not track-selective on its own (it declares whichever of
 * the welcome/questionnaire tracks are still incomplete, in one call), so
 * this wrapper reports only the steps relevant to the questionnaire the
 * operator actually pressed — the underlying call is identical either way,
 * and idempotent, so a second press once a track is already declared creates
 * nothing further. That idempotency is what makes "send or resend" safe to
 * expose as one action: there is no way through this path to create a third
 * message for either track, which is the two-ask cap `recruitment-cycle.ts`
 * already builds structurally.
 *
 * ## What "sent" and "last sent" mean here
 *
 * Never `recruitment_prospects`' own optimistic field — there is none —
 * and never `notification_jobs.status` alone, which this package was told
 * not to read the completion semantics of. `delivery_attempts.accepted_at`
 * is the one fact that means a message actually reached the provider: it is
 * set only from `dispatchRecruitmentCycleJob`'s own accepted branch, after
 * the sweep has claimed the job and the local sink (or Meta) has returned
 * success. Reading it here, rather than `notification_jobs` alone, is what
 * satisfies the amendment's "must reflect real sends… read from the job or
 * delivery record."
 */

const SENT_STEP_KEYS: Readonly<
  Record<"personal" | "recruitment", readonly RecruitmentCycleStepName[]>
> = Object.freeze({
  personal: ["welcome", "details_reminder"],
  recruitment: ["interest_ask", "interest_reminder"],
});

export type RecruitmentQuestionnaireTrack = "personal" | "recruitment";

export interface RecruitmentQuestionnaireSendState {
  readonly lastSentAt: string | null;
}

export interface RecruitmentProspectNote {
  readonly id: string;
  readonly note: string;
  readonly authorLabel: string;
  readonly createdAt: string;
}

export interface RecruitmentProspectStatusEvent {
  readonly id: string;
  readonly fromStatus: ProspectStatus | null;
  readonly toStatus: ProspectStatus;
  readonly occurredAt: string;
  readonly actorLabel: string;
  readonly reason: string | null;
}

export interface RecruitmentProspectEvent {
  readonly eventId: string;
  readonly name: string;
  readonly date: string | null;
  readonly rsvp: RsvpValue | null;
  readonly attendance: AttendanceValue | null;
  readonly eventStatus: DerivedEventState;
}

export interface RecruitmentQuestionnaireAnswers {
  readonly playedBefore: RsvpValue | null;
  readonly watchedBefore: RsvpValue | null;
  readonly positionInterest: string | null;
  readonly gearOwned: string | null;
  readonly howTheyHeard: string | null;
  readonly anythingElse: string | null;
}

export interface RecruitmentProspectRecord {
  readonly prospectId: string;
  readonly personId: string;
  readonly seasonId: string;
  readonly seasonLabel: string;
  readonly displayName: string;
  readonly status: ProspectStatus;
  readonly source: string | null;
  readonly firstContactOn: string | null;
  readonly committedOn: string | null;
  readonly convertedMembershipId: string | null;
  readonly consent: SeasonMessagingConsentState;
  readonly personal: RecruitmentQuestionnaireSendState;
  readonly recruitment: RecruitmentQuestionnaireSendState;
  readonly answers: RecruitmentQuestionnaireAnswers;
  readonly events: readonly RecruitmentProspectEvent[];
  readonly notes: readonly RecruitmentProspectNote[];
  readonly statusHistory: readonly RecruitmentProspectStatusEvent[];
}

function yesNo(value: string | null): RsvpValue | null {
  return value === "yes" || value === "no" ? value : null;
}

async function readSendStateIn(
  tx: Tx,
  personId: string,
  seasonId: string,
): Promise<{
  personal: RecruitmentQuestionnaireSendState;
  recruitment: RecruitmentQuestionnaireSendState;
}> {
  const keys = [
    ...SENT_STEP_KEYS.personal.map((step) => `recruit-cycle:${step}:${personId}:${seasonId}`),
    ...SENT_STEP_KEYS.recruitment.map((step) => `recruit-cycle:${step}:${personId}:${seasonId}`),
  ];
  const result = await tx.query<{ idempotency_key: string; accepted_at: Date }>(
    `select nj.idempotency_key, max(da.accepted_at) as accepted_at
       from public.notification_jobs nj
       join public.delivery_attempts da on da.notification_job_id = nj.id
      where nj.idempotency_key = any($1::text[]) and da.accepted_at is not null
      group by nj.idempotency_key`,
    [keys],
  );
  const acceptedByStep = new Map<string, Date>();
  for (const row of result.rows) {
    const step = row.idempotency_key.split(":")[1];
    acceptedByStep.set(step, row.accepted_at);
  }
  const latest = (steps: readonly string[]): string | null => {
    const dates = steps
      .map((step) => acceptedByStep.get(step))
      .filter((d): d is Date => Boolean(d));
    if (dates.length === 0) return null;
    return new Date(Math.max(...dates.map((d) => d.getTime()))).toISOString();
  };
  return {
    personal: { lastSentAt: latest(SENT_STEP_KEYS.personal) },
    recruitment: { lastSentAt: latest(SENT_STEP_KEYS.recruitment) },
  };
}

/** `null` when no such prospect exists. */
export async function readRecruitmentProspectIn(
  tx: Tx,
  prospectId: string,
): Promise<RecruitmentProspectRecord | null> {
  const prospect = await tx.query<{
    id: string;
    person_id: string;
    season_id: string;
    status: string;
    source: string | null;
    first_contact_on: string | null;
    committed_on: string | null;
    converted_membership_id: string | null;
    given_name: string;
    family_name: string | null;
  }>(
    `select rp.id, rp.person_id, rp.season_id, rp.status::text as status, rp.source,
            to_char(rp.first_contact_on, 'YYYY-MM-DD') as first_contact_on,
            to_char(rp.committed_on, 'YYYY-MM-DD') as committed_on,
            rp.converted_membership_id, p.given_name, p.family_name
       from public.recruitment_prospects rp
       join public.people p on p.id = rp.person_id
      where rp.id = $1::uuid`,
    [prospectId],
  );
  const row = prospect.rows[0];
  if (!row) return null;

  const [seasonLabel, consent, sendState, answers, events, notes, history] = await Promise.all([
    readSeasonLabelIn(tx, row.season_id),
    readSeasonMessagingConsentIn(tx, row.person_id, row.season_id),
    readSendStateIn(tx, row.person_id, row.season_id),
    tx.query<{
      question_code: string;
      answer_text: string | null;
      answer_choice: string | null;
      answer_boolean: boolean | null;
    }>(
      `select question_code, answer_text, answer_choice, answer_boolean
         from public.recruitment_questionnaire_responses
        where prospect_id = $1::uuid and questionnaire = 'football_background'
          and superseded_at is null`,
      [prospectId],
    ),
    tx.query<{
      event_id: string;
      name: string;
      date: string | null;
      rsvp: string | null;
      presence: string | null;
      status: string;
    }>(
      `select i.event_id, e.name, to_char(e.scheduled_on, 'YYYY-MM-DD') as date,
              cr.response::text as rsvp, ar.presence::text as presence, e.status::text as status
         from public.invitations i
         join public.events e on e.id = i.event_id
         left join public.current_rsvp cr on cr.invitation_id = i.id
         left join public.attendance_records ar
           on ar.event_id = i.event_id and ar.person_id = i.person_id
        where i.person_id = $1::uuid and i.capacity = 'recruit' and i.season_id = $2::uuid
        order by e.scheduled_on asc nulls last, e.name`,
      [row.person_id, row.season_id],
    ),
    tx.query<{
      id: string;
      note: string;
      author_label: string | null;
      author_person_id: string | null;
      created_at: Date;
      given_name: string | null;
      family_name: string | null;
    }>(
      `select n.id, n.note, n.author_label, n.author_person_id, n.created_at, p.given_name, p.family_name
         from public.recruitment_prospect_notes n
         left join public.people p on p.id = n.author_person_id
        where n.prospect_id = $1::uuid
        order by n.created_at desc`,
      [prospectId],
    ),
    tx.query<{
      id: string;
      from_status: string | null;
      to_status: string;
      occurred_at: Date;
      actor_label: string | null;
      actor_person_id: string | null;
      reason: string | null;
      given_name: string | null;
      family_name: string | null;
    }>(
      `select e.id, e.from_status::text as from_status, e.to_status::text as to_status,
              e.occurred_at, e.actor_label, e.actor_person_id, e.reason, p.given_name, p.family_name
         from public.recruitment_prospect_status_events e
         left join public.people p on p.id = e.actor_person_id
        where e.prospect_id = $1::uuid
        order by e.occurred_at desc`,
      [prospectId],
    ),
  ]);

  const answerFor = (code: string) => {
    const answer = answers.rows.find((a) => a.question_code === code);
    if (!answer) return null;
    if (answer.answer_boolean !== null) return answer.answer_boolean ? "yes" : "no";
    return answer.answer_choice ?? answer.answer_text ?? null;
  };

  const personLabel = (givenName: string | null, familyName: string | null): string | null =>
    givenName ? [givenName, familyName].filter(Boolean).join(" ") : null;

  return {
    prospectId: row.id,
    personId: row.person_id,
    seasonId: row.season_id,
    seasonLabel: seasonLabel ?? "",
    displayName: [row.given_name, row.family_name].filter(Boolean).join(" "),
    status: row.status as ProspectStatus,
    source: row.source,
    firstContactOn: row.first_contact_on,
    committedOn: row.committed_on,
    convertedMembershipId: row.converted_membership_id,
    consent: consent?.state ?? "never_asked",
    personal: sendState.personal,
    recruitment: sendState.recruitment,
    answers: {
      playedBefore: yesNo(answerFor(QUESTIONNAIRE_B_CODE.playedBefore)),
      watchedBefore: yesNo(answerFor(QUESTIONNAIRE_B_CODE.watchedBefore)),
      positionInterest: answerFor(QUESTIONNAIRE_B_CODE.positionInterest),
      gearOwned: answerFor(QUESTIONNAIRE_B_CODE.gearOwned),
      howTheyHeard: answerFor(QUESTIONNAIRE_B_CODE.howTheyHeard),
      anythingElse: answerFor(QUESTIONNAIRE_B_CODE.anythingElse),
    },
    events: events.rows.map((event) => ({
      eventId: event.event_id,
      name: event.name,
      date: event.date,
      rsvp: yesNo(event.rsvp),
      attendance:
        event.presence === "present" ||
        event.presence === "late" ||
        event.presence === "excused" ||
        event.presence === "absent"
          ? event.presence
          : null,
      eventStatus: derivedEventState(
        { status: event.status as EventStatus, scheduledOn: event.date },
        todayInClubZone(),
      ),
    })),
    notes: notes.rows.map((note) => ({
      id: note.id,
      note: note.note,
      authorLabel: personLabel(note.given_name, note.family_name) ?? note.author_label ?? "Unknown",
      createdAt: note.created_at.toISOString(),
    })),
    statusHistory: history.rows.map((event) => ({
      id: event.id,
      fromStatus: event.from_status as ProspectStatus | null,
      toStatus: event.to_status as ProspectStatus,
      occurredAt: event.occurred_at.toISOString(),
      actorLabel:
        personLabel(event.given_name, event.family_name) ?? event.actor_label ?? "Unknown",
      reason: event.reason,
    })),
  };
}

export async function readRecruitmentProspect(
  prospectId: string,
): Promise<RecruitmentProspectRecord | null> {
  return withTransaction((tx) => readRecruitmentProspectIn(tx, prospectId));
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

export async function addRecruitmentProspectNoteIn(
  tx: Tx,
  actorPersonId: string,
  prospectId: string,
  note: string,
): Promise<void> {
  const trimmed = note.trim();
  if (trimmed === "") {
    throw new InvalidTransition("A note needs some text.", { rule: "recruitment_note_not_blank" });
  }
  const exists = await tx.query(`select 1 from public.recruitment_prospects where id = $1::uuid`, [
    prospectId,
  ]);
  if (!exists.rows[0])
    throw new NotFound("That recruit could not be found.", {
      rule: "recruitment_prospect_not_found",
    });

  await tx.query(
    `insert into public.recruitment_prospect_notes (prospect_id, note, author_person_id)
     values ($1::uuid, $2, $3::uuid)`,
    [prospectId, trimmed, actorPersonId],
  );
}

export async function addRecruitmentProspectNote(
  actorPersonId: string,
  prospectId: string,
  note: string,
): Promise<void> {
  return withTransaction((tx) => addRecruitmentProspectNoteIn(tx, actorPersonId, prospectId, note));
}

// ---------------------------------------------------------------------------
// The exits — `W13`. `joined` is refused here; `flipRecruitmentProspectToJoinedIn` owns it.
// ---------------------------------------------------------------------------

export interface UpdateRecruitmentStatusOptions {
  readonly reason?: string | null;
}

const JOINED_THROUGH_FLIP_RULE = "recruitment_prospect_joined_through_flip";

/**
 * Every status change except `joined` — the three exits and re-engagement —
 * `W13`: one status control each, no confirmation, no callout. Cancels every
 * queued cycle job on an exit (`declined`, `disengaged`, `void`): "nothing is
 * sent to them" has to mean a queued ask does not go out five minutes later
 * because the sweep had already claimed it before this ran, so this cancels
 * `pending`/`ready`/`failed` rows outright rather than relying on
 * `dispatchRecruitmentCycleJob`'s own re-check to catch every one of them in
 * time.
 */
export async function updateRecruitmentProspectStatusIn(
  tx: Tx,
  actorPersonId: string,
  prospectId: string,
  toStatus: Exclude<ProspectStatus, "joined">,
  options: UpdateRecruitmentStatusOptions = {},
): Promise<void> {
  // Belt and braces against a server action called directly with a raw
  // payload: the type parameter excludes `joined` at compile time, but a
  // request that bypasses TypeScript entirely must still be refused here,
  // in words, rather than falling through to
  // `recruitment_prospects_conversion_matches_status`'s raw constraint error.
  assertNotJoinedThroughStatusControl(toStatus);

  const current = await tx.query<{ person_id: string; season_id: string; status: string }>(
    `select person_id, season_id, status::text as status
       from public.recruitment_prospects where id = $1::uuid for update`,
    [prospectId],
  );
  const row = current.rows[0];
  if (!row)
    throw new NotFound("That recruit could not be found.", {
      rule: "recruitment_prospect_not_found",
    });

  if ((row.status as ProspectStatus) === toStatus) {
    throw new InvalidTransition(`This recruit is already ${toStatus}.`, {
      rule: "recruitment_prospect_status_is_a_change",
    });
  }

  const reason = options.reason?.trim() || null;
  if (toStatus === "void" && !reason) {
    throw new InvalidTransition(
      "Voiding a record needs a reason — the record was a mistake, and this says why.",
      {
        rule: "recruitment_prospect_status_events_void_is_explained",
      },
    );
  }

  // `Q-every-status-reachable` (Brian, 2026-09-02): "It shouldn't stop me" —
  // the service supplies what the two constraints need rather than gating the
  // control on them. `recruitment_prospects_commitment_is_dated` needs
  // `committed_on` the moment `status` becomes `committed`;
  // `Q-committed-on-is-derived` (same walkthrough) is explicit that this is
  // always today's date on the write that makes it committed, never a second
  // field an operator flips themselves. `recruitment_prospects_conversion_matches_status`
  // needs `converted_membership_id` cleared the moment a `joined` recruit is
  // moved to any other status through this same free-select control — the
  // membership the earlier flip created is left exactly as it is; only the
  // prospect's own back-reference to it is cleared, so the constraint reads
  // consistently either way and no transition through this control is ever
  // refused by a constraint the write itself could have satisfied.
  await tx.query(
    `update public.recruitment_prospects
        set status = $2::public.prospect_status,
            committed_on = case
              when $2::public.prospect_status = 'committed' then $3::date
              else committed_on
            end,
            converted_membership_id = case
              when $4::boolean then null
              else converted_membership_id
            end,
            updated_at = now()
      where id = $1::uuid`,
    [prospectId, toStatus, todayInClubZone(), row.status === "joined"],
  );

  await tx.query(
    `insert into public.recruitment_prospect_status_events
       (prospect_id, from_status, to_status, actor_person_id, reason)
     values ($1::uuid, $2::public.prospect_status, $3::public.prospect_status, $4::uuid, $5)`,
    [prospectId, row.status, toStatus, actorPersonId, reason],
  );

  await recordAudit(tx, {
    actorPersonId,
    action: "recruitment_prospect.status_changed",
    entityTable: "recruitment_prospects",
    entityId: prospectId,
    fromState: row.status,
    toState: toStatus,
    reason,
  });

  if (EXIT_STATUSES.includes(toStatus)) {
    await tx.query(
      `update public.notification_jobs
          set status = 'cancelled', cancelled_reason = $2, claimed_at = null, claimed_by = null,
              updated_at = now()
        where person_id = $1::uuid
          and idempotency_key like 'recruit-cycle:%'
          and status in ('pending', 'ready', 'failed')`,
      [row.person_id, `Recruit moved to ${toStatus}.`],
    );
  }
}

export async function updateRecruitmentProspectStatus(
  actorPersonId: string,
  prospectId: string,
  toStatus: Exclude<ProspectStatus, "joined">,
  options: UpdateRecruitmentStatusOptions = {},
): Promise<void> {
  return withTransaction((tx) =>
    updateRecruitmentProspectStatusIn(tx, actorPersonId, prospectId, toStatus, options),
  );
}

/** Refuses `joined` explicitly, naming the flip, rather than writing a status nobody can reach this way. */
export function assertNotJoinedThroughStatusControl(toStatus: string): void {
  if (toStatus === "joined") {
    throw new InvalidTransition(
      "Joined is not a status you can set directly — it flips the recruit onto the roster. Use the confirmation for that.",
      { rule: JOINED_THROUGH_FLIP_RULE },
    );
  }
}

// ---------------------------------------------------------------------------
// The flip — `W14`
// ---------------------------------------------------------------------------

export interface FlipToJoinedResult {
  readonly membershipId: string;
}

/**
 * One transaction: prospect → `joined`, a season membership created in
 * `onboarding`, that membership's own onboarding items generated, status
 * history and one audit row written. All of it, or none of it.
 *
 * `season_memberships_one_per_person_per_season` is the invariant that
 * refuses a second flip — `src/lib/db/errors.ts` already carries a named,
 * operator-readable mapping for it, so this function does not duplicate that
 * check before writing; it lets the constraint do the refusing and the
 * mapping do the wording.
 *
 * `entry` is `'new'`: every recruit this mission tracks is a person who has
 * never held a membership before now (a past member returning for another
 * season is `roster/new`'s own returner intake, not this path).
 */
export async function flipRecruitmentProspectToJoinedIn(
  tx: Tx,
  actorPersonId: string,
  prospectId: string,
): Promise<FlipToJoinedResult> {
  const prospect = await tx.query<{
    person_id: string;
    season_id: string;
    status: string;
    committed_on: string | null;
  }>(
    `select person_id, season_id, status::text as status, to_char(committed_on, 'YYYY-MM-DD') as committed_on
       from public.recruitment_prospects where id = $1::uuid for update`,
    [prospectId],
  );
  const row = prospect.rows[0];
  if (!row)
    throw new NotFound("That recruit could not be found.", {
      rule: "recruitment_prospect_not_found",
    });
  if (row.status === "joined") {
    throw new InvalidTransition("This recruit has already joined.", {
      rule: "recruitment_prospect_already_joined",
    });
  }

  const committedOn = row.committed_on ?? todayInClubZone();

  const membership = await tx.query<{ id: string }>(
    `insert into public.season_memberships (person_id, season_id, status, entry, confirmed_on)
     values ($1::uuid, $2::uuid, 'onboarding', 'new', $3::date)
     returning id`,
    [row.person_id, row.season_id, committedOn],
  );
  const membershipId = membership.rows[0].id;

  await tx.query(
    `insert into public.season_membership_status_events
       (season_membership_id, from_status, to_status, actor_person_id, reason)
     values ($1::uuid, null, 'onboarding', $2::uuid, 'Flipped from the recruit board.')`,
    [membershipId, actorPersonId],
  );

  await generateOnboardingItems(tx, membershipId, row.season_id);

  await tx.query(
    `update public.recruitment_prospects
        set status = 'joined', committed_on = $2::date, converted_membership_id = $3::uuid, updated_at = now()
      where id = $1::uuid`,
    [prospectId, committedOn, membershipId],
  );

  await tx.query(
    `insert into public.recruitment_prospect_status_events
       (prospect_id, from_status, to_status, actor_person_id, reason)
     values ($1::uuid, $2::public.prospect_status, 'joined', $3::uuid, 'Flipped to joined.')`,
    [prospectId, row.status, actorPersonId],
  );

  // The transition's own typed home is the two status-event tables above;
  // this one `audit_events` row is `W14`'s "writes one audit row" — the
  // whole action, in the club-wide trail, naming the membership it created.
  await recordAudit(tx, {
    actorPersonId,
    action: "recruitment_prospect.joined",
    entityTable: "recruitment_prospects",
    entityId: prospectId,
    fromState: row.status,
    toState: "joined",
    context: { seasonMembershipId: membershipId, seasonId: row.season_id },
  });

  return { membershipId };
}

export async function flipRecruitmentProspectToJoined(
  actorPersonId: string,
  prospectId: string,
): Promise<FlipToJoinedResult> {
  return withTransaction((tx) => flipRecruitmentProspectToJoinedIn(tx, actorPersonId, prospectId));
}

// ---------------------------------------------------------------------------
// The send machinery — the 2026-09-01 amendment
// ---------------------------------------------------------------------------

export interface SendRecruitmentQuestionnaireResult {
  readonly created: readonly RecruitmentCycleStepName[];
  readonly reason: "not_consented" | "not_eligible" | "already_complete" | null;
}

/**
 * `W2`'s two SEND buttons, both routed through the one declaration path the
 * amendment names — `declareRecruitmentCycleJobsIn`, called and never
 * duplicated. See the module comment for what "created" and "reason" mean
 * when only one of the two tracks was requested.
 */
export async function sendRecruitmentQuestionnaireIn(
  tx: Tx,
  actorPersonId: string,
  prospectId: string,
  track: RecruitmentQuestionnaireTrack,
): Promise<SendRecruitmentQuestionnaireResult> {
  const prospect = await tx.query<{ person_id: string; season_id: string }>(
    `select person_id, season_id from public.recruitment_prospects where id = $1::uuid`,
    [prospectId],
  );
  const row = prospect.rows[0];
  if (!row)
    throw new NotFound("That recruit could not be found.", {
      rule: "recruitment_prospect_not_found",
    });

  const result = await declareRecruitmentCycleJobsIn(tx, row.person_id, row.season_id);
  const relevantSteps = SENT_STEP_KEYS[track];
  const created = result.created.filter((step) => relevantSteps.includes(step));

  await recordAudit(tx, {
    actorPersonId,
    action:
      track === "personal"
        ? "recruitment_prospect.personal_questionnaire_send_requested"
        : "recruitment_prospect.recruitment_questionnaire_send_requested",
    entityTable: "recruitment_prospects",
    entityId: prospectId,
    context: { created, declaredReason: result.reason },
  });

  return { created, reason: created.length > 0 ? null : result.reason };
}

export async function sendRecruitmentQuestionnaire(
  actorPersonId: string,
  prospectId: string,
  track: RecruitmentQuestionnaireTrack,
): Promise<SendRecruitmentQuestionnaireResult> {
  return withTransaction((tx) =>
    sendRecruitmentQuestionnaireIn(tx, actorPersonId, prospectId, track),
  );
}
