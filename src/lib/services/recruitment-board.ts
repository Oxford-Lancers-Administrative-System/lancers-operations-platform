import "server-only";

import { withTransaction, type Tx } from "@/lib/db";
import type { SeasonMessagingConsentState } from "./messaging-consent";
import { readCurrentSeasonIn, type Season } from "./seasons";
import {
  QUESTIONNAIRE_B_CODE,
  type AttendanceValue,
  type ProspectStatus,
  type RsvpValue,
} from "./recruitment-vocabulary";

/**
 * `/operate/recruitment` — `W1`, LAN-204. The board's own read: one line per
 * recruit in the open season, banded Person · Recruitment · one pair per
 * recruitment event, on the same "read everything, filter in the browser"
 * shape `roster-board.ts` already uses (`DEC-w1-12`: the season holds dozens
 * of rows, not thousands).
 *
 * The status ladder, its labels, the consent vocabulary, the RSVP/attendance
 * labels and the Questionnaire B codebook all live in
 * `./recruitment-vocabulary.ts` — a plain module with no `"server-only"` tag
 * — because client components under `../../app/operate/recruitment/**` need
 * the same words this file's queries use, and a module tagged `"server-only"`
 * cannot be imported by value from one (see that file's own comment).
 *
 * Re-exported here so a caller already importing this file for
 * `RecruitmentBoardRow` finds the whole board vocabulary in one place too —
 * every re-export below is either a **type** (erased at compile time, so it
 * carries none of the `"server-only"` restriction across) or reads through to
 * the same shared module a client component would import directly.
 */
export type { ProspectStatus, RsvpValue, AttendanceValue } from "./recruitment-vocabulary";
export {
  PROSPECT_STATUS_ORDER,
  PROSPECT_STATUS_LABELS,
  EXIT_STATUSES,
  CONSENT_LABELS,
  RSVP_LABEL,
  ATTENDANCE_LABEL,
  QUESTIONNAIRE_B_CODE,
} from "./recruitment-vocabulary";

export interface RecruitmentEventColumn {
  readonly eventId: string;
  readonly name: string;
  readonly date: string | null;
}

export interface RecruitmentEventCell {
  readonly rsvp: RsvpValue | null;
  readonly attendance: AttendanceValue | null;
}

export interface RecruitmentBoardRow {
  readonly prospectId: string;
  readonly personId: string;
  readonly displayName: string;
  readonly aliases: readonly string[];

  // Person — read-only here; corrected on the person record.
  readonly college: string | null;
  readonly matriculationYear: number | null;
  readonly expectedGraduationYear: number | null;
  readonly degreeField: string | null;
  readonly hasMobile: boolean;
  readonly hasEmail: boolean;

  // Recruitment.
  readonly status: ProspectStatus;
  readonly source: string | null;
  readonly firstContactOn: string | null;
  readonly personalSent: boolean;
  readonly recruitmentSent: boolean;
  readonly consent: SeasonMessagingConsentState;
  readonly playedBefore: RsvpValue | null;
  readonly watchedBefore: RsvpValue | null;
  readonly positionInterest: string | null;
  readonly gearOwned: string | null;
  readonly howTheyHeard: string | null;
  readonly anythingElse: string | null;

  // Events — one cell pair per column in `RecruitmentBoardData.events`, keyed by event id.
  readonly events: Readonly<Record<string, RecruitmentEventCell>>;
  readonly attendedAnyEvent: boolean;
}

export interface RecruitmentBoardData {
  readonly season: Season;
  readonly rows: readonly RecruitmentBoardRow[];
  readonly events: readonly RecruitmentEventColumn[];
  readonly totalInSeason: number;
}

const SENT_STEP_KEYS = Object.freeze({
  personal: ["welcome", "details_reminder"] as const,
  recruitment: ["interest_ask", "interest_reminder"] as const,
});

function yesNo(value: string | null): RsvpValue | null {
  return value === "yes" || value === "no" ? value : null;
}

async function listRecruitmentBoardIn(tx: Tx): Promise<RecruitmentBoardData> {
  const season = await readCurrentSeasonIn(tx);

  const prospects = await tx.query<{
    prospect_id: string;
    person_id: string;
    status: string;
    source: string | null;
    first_contact_on: string | null;
    given_name: string;
    family_name: string | null;
  }>(
    `select rp.id as prospect_id, rp.person_id, rp.status::text as status, rp.source,
            to_char(rp.first_contact_on, 'YYYY-MM-DD') as first_contact_on,
            p.given_name, p.family_name
       from public.recruitment_prospects rp
       join public.people p on p.id = rp.person_id
      where rp.season_id = $1::uuid
      order by p.given_name, p.family_name`,
    [season.id],
  );

  const totalInSeason = prospects.rowCount ?? prospects.rows.length;
  if (prospects.rows.length === 0) {
    return { season, rows: [], events: [], totalInSeason: 0 };
  }

  const personIds = prospects.rows.map((row) => row.person_id);
  const prospectIds = prospects.rows.map((row) => row.prospect_id);

  const [people, aliasRows, consentRows, answerRows, sentRows, eventRows, invitationRows] =
    await Promise.all([
      tx.query<{
        id: string;
        college: string | null;
        matriculation_year: number | null;
        expected_graduation_year: number | null;
        degree_field: string | null;
        has_mobile: boolean;
        has_email: boolean;
      }>(
        `select id, college, matriculation_year, expected_graduation_year, degree_field,
              exists (
                select 1 from public.contact_points c
                 where c.person_id = people.id and c.kind = 'phone' and c.valid_until is null
              ) as has_mobile,
              exists (
                select 1 from public.contact_points c
                 where c.person_id = people.id and c.kind = 'email' and c.valid_until is null
              ) as has_email
         from public.people people
        where id = any($1::uuid[])`,
        [personIds],
      ),
      tx.query<{ person_id: string; alias: string }>(
        `select person_id, alias from public.person_aliases where person_id = any($1::uuid[])`,
        [personIds],
      ),
      tx.query<{ person_id: string; state: string }>(
        `select person_id, state::text as state from public.season_messaging_consents
        where season_id = $1::uuid and person_id = any($2::uuid[])`,
        [season.id, personIds],
      ),
      tx.query<{
        prospect_id: string;
        question_code: string;
        answer_text: string | null;
        answer_choice: string | null;
        answer_boolean: boolean | null;
      }>(
        `select prospect_id, question_code, answer_text, answer_choice, answer_boolean
         from public.recruitment_questionnaire_responses
        where questionnaire = 'football_background' and superseded_at is null
          and prospect_id = any($1::uuid[])`,
        [prospectIds],
      ),
      tx.query<{ person_id: string; idempotency_key: string; accepted_at: Date }>(
        `select nj.person_id, nj.idempotency_key, max(da.accepted_at) as accepted_at
         from public.notification_jobs nj
         join public.delivery_attempts da on da.notification_job_id = nj.id
        where nj.idempotency_key like 'recruit-cycle:%'
          and nj.person_id = any($1::uuid[])
          and da.accepted_at is not null
        group by nj.person_id, nj.idempotency_key`,
        [personIds],
      ),
      tx.query<{ event_id: string; name: string; date: string | null }>(
        `select distinct e.id as event_id, e.name, to_char(e.scheduled_on, 'YYYY-MM-DD') as date
         from public.events e
         join public.invitations i on i.event_id = e.id
        where e.season_id = $1::uuid and e.event_type = 'recruitment' and i.capacity = 'recruit'
        order by date nulls last, name`,
        [season.id],
      ),
      tx.query<{
        event_id: string;
        person_id: string;
        rsvp: string | null;
        presence: string | null;
      }>(
        `select i.event_id, i.person_id, cr.response::text as rsvp, ar.presence::text as presence
         from public.invitations i
         left join public.current_rsvp cr on cr.invitation_id = i.id
         left join public.attendance_records ar
           on ar.event_id = i.event_id and ar.person_id = i.person_id
        where i.season_id = $1::uuid and i.capacity = 'recruit' and i.person_id = any($2::uuid[])`,
        [season.id, personIds],
      ),
    ]);

  const personById = new Map(people.rows.map((row) => [row.id, row]));
  const aliasesByPerson = new Map<string, string[]>();
  for (const row of aliasRows.rows) {
    const list = aliasesByPerson.get(row.person_id) ?? [];
    list.push(row.alias);
    aliasesByPerson.set(row.person_id, list);
  }
  const consentByPerson = new Map(
    consentRows.rows.map((row) => [row.person_id, row.state as SeasonMessagingConsentState]),
  );
  const answersByProspect = new Map<string, typeof answerRows.rows>();
  for (const row of answerRows.rows) {
    const list = answersByProspect.get(row.prospect_id) ?? [];
    list.push(row);
    answersByProspect.set(row.prospect_id, list);
  }
  const sentByPerson = new Map<string, Set<string>>();
  for (const row of sentRows.rows) {
    const set = sentByPerson.get(row.person_id) ?? new Set<string>();
    // idempotency_key = 'recruit-cycle:<step>:<personId>:<seasonId>'
    const step = row.idempotency_key.split(":")[1];
    set.add(step);
    sentByPerson.set(row.person_id, set);
  }
  const events: RecruitmentEventColumn[] = eventRows.rows.map((row) => ({
    eventId: row.event_id,
    name: row.name,
    date: row.date,
  }));
  const invitationsByPerson = new Map<string, typeof invitationRows.rows>();
  for (const row of invitationRows.rows) {
    const list = invitationsByPerson.get(row.person_id) ?? [];
    list.push(row);
    invitationsByPerson.set(row.person_id, list);
  }

  function answerFor(prospectId: string, code: string): string | null {
    const answer = (answersByProspect.get(prospectId) ?? []).find(
      (row) => row.question_code === code,
    );
    if (!answer) return null;
    if (answer.answer_boolean !== null) return answer.answer_boolean ? "yes" : "no";
    return answer.answer_choice ?? answer.answer_text ?? null;
  }

  const rows: RecruitmentBoardRow[] = prospects.rows.map((prospect) => {
    const person = personById.get(prospect.person_id);
    const displayName = [prospect.given_name, prospect.family_name].filter(Boolean).join(" ");
    const sentSteps = sentByPerson.get(prospect.person_id) ?? new Set<string>();
    const eventCells: Record<string, RecruitmentEventCell> = {};
    let attendedAnyEvent = false;
    for (const invite of invitationsByPerson.get(prospect.person_id) ?? []) {
      const attendance =
        invite.presence === "present" ||
        invite.presence === "late" ||
        invite.presence === "excused" ||
        invite.presence === "absent"
          ? invite.presence
          : null;
      if (attendance === "present" || attendance === "late") attendedAnyEvent = true;
      eventCells[invite.event_id] = { rsvp: yesNo(invite.rsvp), attendance };
    }

    return {
      prospectId: prospect.prospect_id,
      personId: prospect.person_id,
      displayName,
      aliases: aliasesByPerson.get(prospect.person_id) ?? [],
      college: person?.college ?? null,
      matriculationYear: person?.matriculation_year ?? null,
      expectedGraduationYear: person?.expected_graduation_year ?? null,
      degreeField: person?.degree_field ?? null,
      hasMobile: person?.has_mobile ?? false,
      hasEmail: person?.has_email ?? false,
      status: prospect.status as ProspectStatus,
      source: prospect.source,
      firstContactOn: prospect.first_contact_on,
      personalSent: SENT_STEP_KEYS.personal.some((step) => sentSteps.has(step)),
      recruitmentSent: SENT_STEP_KEYS.recruitment.some((step) => sentSteps.has(step)),
      consent: consentByPerson.get(prospect.person_id) ?? "never_asked",
      playedBefore: yesNo(answerFor(prospect.prospect_id, QUESTIONNAIRE_B_CODE.playedBefore)),
      watchedBefore: yesNo(answerFor(prospect.prospect_id, QUESTIONNAIRE_B_CODE.watchedBefore)),
      positionInterest: answerFor(prospect.prospect_id, QUESTIONNAIRE_B_CODE.positionInterest),
      gearOwned: answerFor(prospect.prospect_id, QUESTIONNAIRE_B_CODE.gearOwned),
      howTheyHeard: answerFor(prospect.prospect_id, QUESTIONNAIRE_B_CODE.howTheyHeard),
      anythingElse: answerFor(prospect.prospect_id, QUESTIONNAIRE_B_CODE.anythingElse),
      events: eventCells,
      attendedAnyEvent,
    } satisfies RecruitmentBoardRow;
  });

  return { season, rows, events, totalInSeason };
}

/** The whole board: every recruit in the open season, `W1`. */
export async function listRecruitmentBoard(): Promise<RecruitmentBoardData> {
  return withTransaction((tx) => listRecruitmentBoardIn(tx));
}
