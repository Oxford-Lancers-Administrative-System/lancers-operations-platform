import "server-only";

import { withTransaction, type Tx } from "@/lib/db";
import { todayInClubZone } from "@/lib/club-time";
import { derivedEventState, type DerivedEventState, type EventStatus } from "../event-input";
import {
  readSeasonMessagingConsentIn,
  type SeasonMessagingConsentSource,
  type SeasonMessagingConsentState,
} from "../messaging-consent";
import { readSeasonLabelIn } from "../seasons";
import {
  QUESTIONNAIRE_B_CODE,
  type AttendanceValue,
  type ProspectStatus,
  type RsvpValue,
} from "../recruitment-vocabulary";
import { SENT_STEP_KEYS } from "./shared";

/**
 * `/operate/recruitment/[prospectId]`'s own read — `W2`'s record. LAN-204.
 * See `relocations.md` for where "sent"/"last sent" come from and why.
 */

interface RecruitmentQuestionnaireSendState {
  readonly lastSentAt: string | null;
  /** V-6: the soonest not-yet-accepted `scheduled_for` for this track. `null` once `lastSentAt` is set, or when no job exists. */
  readonly queuedFor: string | null;
}

export interface RecruitmentProspectNote {
  readonly id: string;
  readonly note: string;
  readonly authorLabel: string;
  readonly createdAt: string;
}

interface RecruitmentProspectStatusEvent {
  readonly id: string;
  readonly fromStatus: ProspectStatus | null;
  readonly toStatus: ProspectStatus;
  readonly occurredAt: string;
  readonly actorLabel: string;
  readonly reason: string | null;
}

interface RecruitmentProspectEvent {
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
  /** `null` unless `consent` is `granted` — the door the grant came through. A touchline grant does not authorise the recruitment SEND button; only `qr_self_entry` does. */
  readonly consentSource: SeasonMessagingConsentSource | null;
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

  // V-6: the soonest still-outstanding job's scheduled_for, per track.
  const queued = await tx.query<{ idempotency_key: string; scheduled_for: Date }>(
    `select nj.idempotency_key, nj.scheduled_for
       from public.notification_jobs nj
      where nj.idempotency_key = any($1::text[])
        and nj.status in ('pending', 'ready', 'processing')
        and not exists (
          select 1 from public.delivery_attempts da
           where da.notification_job_id = nj.id and da.accepted_at is not null
        )`,
    [keys],
  );
  const queuedByStep = new Map<string, Date>();
  for (const row of queued.rows) {
    const step = row.idempotency_key.split(":")[1];
    queuedByStep.set(step, row.scheduled_for);
  }
  const soonestQueued = (steps: readonly string[]): string | null => {
    const dates = steps.map((step) => queuedByStep.get(step)).filter((d): d is Date => Boolean(d));
    if (dates.length === 0) return null;
    return new Date(Math.min(...dates.map((d) => d.getTime()))).toISOString();
  };

  return {
    personal: {
      lastSentAt: latest(SENT_STEP_KEYS.personal),
      queuedFor: soonestQueued(SENT_STEP_KEYS.personal),
    },
    recruitment: {
      lastSentAt: latest(SENT_STEP_KEYS.recruitment),
      queuedFor: soonestQueued(SENT_STEP_KEYS.recruitment),
    },
  };
}

/** `null` when no such prospect exists. The seven detail reads run one at a time: they share one transaction client, which `pg` serialises anyway (LAN-227's shape, made explicit by LAN-301). */
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

  const seasonLabel = await readSeasonLabelIn(tx, row.season_id);
  const consent = await readSeasonMessagingConsentIn(tx, row.person_id, row.season_id);
  const sendState = await readSendStateIn(tx, row.person_id, row.season_id);
  const answers = await tx.query<{
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
  );
  const events = await tx.query<{
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
  );
  const notes = await tx.query<{
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
  );
  const history = await tx.query<{
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
  );

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
    consentSource: consent?.state === "granted" ? consent.source : null,
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
