import "server-only";

import { NotFound, withTransaction, type Tx } from "@/lib/db";
import { requireCapability, requireGeneralOperator } from "@/lib/auth/guards";

import { isAttendancePresence, type AttendancePresence } from "./attendance-vocabulary";
import {
  deriveClubLinkToken,
  issueClubLinkIn,
  recordClubLinkUse,
  resolveClubLinkIn,
  type ClubLinkResolution,
  type EnvSource,
  type IssuedClubLink,
} from "./club-link";
import {
  DELIVERY_LATEST_RESULT_JOIN,
  DELIVERY_STATE_EXPRESSION,
  type DeliveryState,
} from "./delivery";
import { readEventIn } from "./events";
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
 * The participation table and its three tiers — W7, REQ-participation-table,
 * REQ-club-link, REQ-three-tiers. LAN-157.
 *
 * ## The question this module answers
 *
 * *Who was asked, what did they say, and did they come?* One row per person,
 * carrying the invitation, the answer, the reason behind a no, the attendance
 * and one column per event question — plus, at the operator tier and nowhere
 * else, whether the invitation reached them (D3, D65).
 *
 * ## Authorisation is here, not on the route
 *
 * REQ-three-tiers says so in as many words, and the reason is that a route is
 * a URL somebody can type. There are exactly three entry points below and each
 * one resolves its own actor:
 *
 *   * `readOperatorParticipation` resolves the operator from the verified
 *     session — `requireGeneralOperator()`, which is the floor with the narrow
 *     coaching assignment removed (LAN-110). It takes no actor argument.
 *   * `readClubLinkParticipation` resolves the **token**, and takes no session
 *     at all. It cannot return an operator payload: the type it returns has no
 *     delivery field and no joining URL.
 *   * there is no third. The public tier reads events through
 *     `./events.ts` and never reaches this module, which is what makes "a
 *     public request reaches no person, no answer and no attendance record"
 *     true by construction rather than by a filter somebody has to remember.
 *
 * ## The two payloads are built by two queries, not one query and a filter
 *
 * `PARTICIPANT_QUERY` is assembled per tier, and the club-link tier's version
 * **does not select delivery at all** — no lateral join to `notification_jobs`,
 * no state expression, no column. The event facts are the same story: the
 * club-link shape has no `joiningUrl` key for a value to be assigned to.
 *
 * A column that is never selected cannot reach a payload. A column selected
 * and then deleted in TypeScript is one refactor from the DOM, and this is the
 * mission's most sensitive surface.
 *
 * **And the types are not what enforce it — R157-B5.** The two payload shapes
 * stop a component printing a column it does not hold, which is worth having.
 * They do not stop *this* file widening the tier: TypeScript's excess-property
 * check applies to fresh object literals, and freshness is lost through the
 * `.map()` in `buildClubLinkParticipationIn`, so adding
 * `delivery: person.delivery` there type-checks and ships. The query above and
 * the field-by-field reassembly below are the boundary; the payload assertions
 * in `./participation.test.ts` are the proof, and are the only thing that
 * fails when somebody widens the literal.
 *
 * ## What this module does not do
 *
 * **Write anything about attendance or RSVP.** It reads two authoritative
 * records and marks where they disagree; `discrepancyFor` is a pure function
 * of the pair and there is no path from here to `attendance_records` or
 * `rsvp_responses`. D64's "never auto-reconciled" is therefore structural.
 *
 * **Take the register.** That is Task 04's, on Task 04's surface, and the
 * buffer that opens it is `./attendance-window.ts`'s.
 *
 * **Show delivery detail.** The operator tier carries the five-state column and
 * a link out to the delivery screen; the diagnostics behind it are Mission 4's.
 */

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

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
}

/**
 * The delivery column, at the operator tier only.
 *
 * A lateral over the invitation's most recent job rather than a plain join:
 * `notification_jobs` has no unique constraint on `invitation_id`, and a second
 * job for one invitee — a reissue, a second channel — would otherwise duplicate
 * that person's row in the table.
 *
 * The `j.id is null` guard is load-bearing. `DELIVERY_STATE_EXPRESSION` ends in
 * `else 'failed'`, which is right for a job and very wrong for the absence of
 * one: without it, every invitee nobody has queued anything for would read
 * **Failed**.
 */
const DELIVERY_LATERAL = `
  left join lateral (
    select case when j.id is null then null else ${DELIVERY_STATE_EXPRESSION} end as state
      from public.notification_jobs j
      ${DELIVERY_LATEST_RESULT_JOIN}
     where j.invitation_id = inv.invitation_id
     order by j.created_at desc
     limit 1
  ) delivery on true`;

/**
 * Every invitee and every walk-up, in one list — the same `full outer join`
 * `./attendance.ts` uses, and for the same reason: the people who appear on one
 * side and not the other are the point of the screen.
 *
 * Both sides carry an `anchor_id` because invariant P8 puts the anchor in one
 * of two columns and PostgreSQL will not accept a disjunction of equalities as
 * a `full outer join` condition. See `./attendance.ts` for the long version.
 *
 * Deliberately **not** gated on the register window. The board asks "may this
 * be opened?" and answers no for an event a fortnight away; this table answers
 * "who is coming?", which is exactly the question a fortnight out.
 */
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
         rec.presence${operator ? ",\n         delivery.state as delivery_state" : ""}
    from invited inv
    full outer join recorded rec on rec.anchor_id = inv.anchor_id
    left join public.people p
      on p.id = coalesce(inv.subject_person_id, rec.subject_person_id)
    left join public.current_rsvp r on r.invitation_id = inv.invitation_id${
      operator ? DELIVERY_LATERAL : ""
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

/**
 * One stored answer, as the table prints it.
 *
 * `question_responses` holds exactly one of three columns per row — the check
 * constraint enforces it — so this reads whichever is set. A boolean question
 * is the dominant real case ("Transport to Cambridge?") and reads **Yes** or
 * **No**, which is what the answer means; printing `true` would be printing the
 * storage.
 */
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
    // Present only for a `choice` question — the constraint the table already
    // carries (`event_questions_choices_match_type`) makes `null` here mean
    // exactly what it means in storage, never "not read yet".
    choices: row.choices,
    // OWNER-LAN170-08: required of the player, never of the operator
    // recording it — `RecordAnswerControl` reads this to word the field so
    // that fact is never misstated as "optional for the player" either.
    isRequired: row.is_required,
  }));
}

/**
 * The three headline numbers, for whichever tier is reading.
 *
 * The same five counts `readEventAttendanceSummary` computes, in this
 * transaction rather than a second one — UX standard 7 is about two surfaces
 * agreeing, and the surest way is one SQL definition. `attendance.test.ts`
 * already pins that definition to `summariseAttendance` over the board's rows;
 * `participation.test.ts` pins this reader to the same function.
 */
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

async function readPeopleIn(
  tx: Tx,
  eventId: string,
  tier: ParticipationTier,
  questions: readonly ParticipationQuestion[],
): Promise<OperatorParticipationPerson[]> {
  const rows = await tx.query<PersonRow>(participantQuery(tier), [eventId]);

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

    return {
      key: participantKey(row.capacity, row.season_membership_id, row.person_id),
      displayName: row.display_name ?? "Unnamed participant",
      capacity: row.capacity,
      isWalkUp,
      invitedAt: asIsoString(row.issued_at),
      // LAN-170: the invitation to record an answer against. `null` for a
      // walk-up, who was never invited and has nothing `RecordAnswerControl`
      // could write to.
      invitationId: row.invitation_id,
      answer,
      // Invariant P3 makes a reason mandatory on a "no", so a reason attached
      // to anything else is a stored value that no longer describes the
      // standing answer. It is not shown against a Yes.
      reason: answer === "no" ? row.reason : null,
      presence,
      discrepancy: discrepancyFor({ answer, presence, isWalkUp }),
      answers: row.invitation_id ? (answersByInvitation.get(row.invitation_id) ?? {}) : {},
      delivery: row.delivery_state ?? null,
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

/**
 * The operator's participation table — every column, delivery included.
 *
 * The floor is `requireGeneralOperator()` rather than a capability, and that is
 * a decision worth stating: reading who is coming to an event is not gated on
 * being able to change the event, so an operator who can open the event page at
 * all can read its table. What the floor does remove is LAN-110's narrow
 * coaching assignment, whose one operator surface is the register — a coach
 * reads this table through the club link, which is why the tier exists.
 */
export async function readOperatorParticipation(eventId: string): Promise<OperatorParticipation> {
  await requireGeneralOperator();
  return withTransaction((tx) => buildOperatorParticipationIn(tx, eventId));
}

/**
 * The operator payload, without the guard.
 *
 * Exported so the suite can assert what the two tiers carry without staging a
 * session — and so the guard above has exactly one job, which a second test
 * asserts on its own by making it throw.
 */
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

  // Assembled field by field rather than spread from the operator row, so that
  // adding a column to `PersonRow` cannot silently widen this tier.
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
 * The club-link tier — W7, D2, D81.
 *
 * No session is consulted, and none is needed: the signed token is the
 * authorisation, exactly as it is on the RSVP page. The three internal
 * resolutions stay distinct inside `./club-link.ts` for logs and tests and are
 * collapsed to one `unavailable` here, so a stranger cannot learn which of them
 * they are holding.
 *
 * A **draft** event resolves to `unavailable` even with a live token. A draft
 * carries no invitations (invariant P1), so there is nothing to show — and a
 * link issued against an approved event that was later returned to draft must
 * not keep opening.
 */
export async function readClubLinkParticipation(
  token: string,
  options: { env?: EnvSource } = {},
): Promise<ClubLinkPage> {
  // W157-R1. Two phases, and the split is the whole fix.
  //
  // The read below takes no lock on `club_link_tokens`, so any number of people
  // may open the *same* link at once without queueing behind each other. That
  // used not to be true: resolution stamped `use_count` in this transaction, so
  // every reader of one link took that link's row lock and held it, and its
  // pooled connection with it, until the participation read committed. Forty
  // simultaneous readers of one token filled the pool with waiters and were
  // served Next's own error page — see `./club-link.ts`.
  //
  // The stamp then happens on its own, after the commit, and cannot fail this
  // call: `recordClubLinkUse` swallows its own errors, and its `skip locked`
  // means it never waits for anybody either.
  const read = await withTransaction(async (tx) => {
    const resolution: ClubLinkResolution = await resolveClubLinkIn(tx, token, options);
    if (resolution.state !== "live") return { page: { state: "unavailable" } as ClubLinkPage };

    let participation: ClubLinkParticipation;
    try {
      participation = await buildClubLinkParticipationIn(tx, resolution.eventId);
    } catch (error) {
      if (error instanceof NotFound) {
        return { page: { state: "unavailable" } as ClubLinkPage, linkId: resolution.linkId };
      }
      throw error;
    }
    const page: ClubLinkPage =
      participation.event.status === "draft"
        ? { state: "unavailable" }
        : { state: "live", participation };

    return { page, linkId: resolution.linkId };
  });

  // Counted whenever the *token* opened, which is what it counted before: a
  // live link whose event has since gone back to draft was still presented, and
  // Q2 is asking whether links are still being reached at all.
  if (read.linkId !== undefined) await recordClubLinkUse(read.linkId);

  return read.page;
}

// ---------------------------------------------------------------------------
// Issuing the link
// ---------------------------------------------------------------------------

/**
 * Issue — or return — this event's club link. §4.15, inventory amendment 1.
 *
 * Gated on `event_calendar_management`: the four calendar roles administer
 * events, and handing an event's participation table to somebody without an
 * account is an act of event administration. It is deliberately not the
 * ordinary operator floor, and deliberately not `event_approval` — approving is
 * a decision about whether the event happens, and this is not.
 */
export async function issueEventClubLink(
  eventId: string,
  options: { env?: EnvSource } = {},
): Promise<IssuedClubLink> {
  const operator = await requireCapability("event_calendar_management");
  return withTransaction((tx) =>
    issueClubLinkIn(tx, eventId, { actorPersonId: operator.personId, env: options.env }),
  );
}

/**
 * The live link for an event, without creating one. `null` when none has been
 * issued.
 *
 * The share dialog reads this so that opening it is not itself an act: an
 * operator looking at what they already shared should not mint a token, and a
 * page render should never write.
 */
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
