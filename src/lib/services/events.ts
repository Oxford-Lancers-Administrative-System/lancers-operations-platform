import "server-only";

import {
  ConstraintViolated,
  InvalidTransition,
  NotFound,
  withTransaction,
  type Tx,
} from "@/lib/db";
import {
  DRAFTABLE_EVENT_TYPES,
  EVENT_ORIGINS,
  EVENT_TRANSITIONS,
  optional,
  toMinutePrecision,
  trimmed,
  UUID_PATTERN,
  type EventDraftInput,
  type EventStatus,
  type EventTransition,
} from "./event-input";
import { recordAudit } from "./audit";
import { readCurrentSeasonIn, type Season } from "./seasons";

/**
 * The event aggregate — drafting, editing and the three status changes this
 * slice owns. LAN-76.
 *
 * ## What this module is responsible for, and what it is not
 *
 * `docs/architecture/data-model.md` § _Rules deliberately left to TypeScript_
 * puts **legal state transitions** and **who may trigger them** above the
 * database on purpose: a transition table is workflow, and encoding it in
 * check constraints would make a migration the way club policy changes. So the
 * transitions below are the first implementation of that rule, and they are
 * data — a table of `{ from, to }` — rather than a chain of `if`s.
 *
 * The database still owns what each *state* requires, and none of it is
 * re-implemented here:
 *
 *   * invariant E1a — an approval needs a date, an approver and a confirmed
 *     audience (`events_approval_requires_date_and_audience`). A draft may
 *     legitimately be incomplete, and this module never fills a gap in to make
 *     one look finished.
 *   * invariant P1 — an invitation cannot exist against a `draft` or
 *     `pending_approval` event, held by the cascading composite foreign key
 *     from `invitations`. Nothing here asserts it; `readEvent` *reads* the
 *     counts so a screen can state it as an observed fact.
 *   * invariant E4 — two or more events on one date is legal. There is
 *     deliberately no uniqueness check anywhere in this file, and a test
 *     proves two same-date drafts are both accepted.
 *   * invariant E6 — no solicitation means no deadline and no reminders. This
 *     slice records neither, so the constraint is satisfied by never writing
 *     them; the flag is still an explicit operator choice, never a default.
 *
 * ## Approval is not here
 *
 * `approved`, `rejected`, `cancelled`, `occurred` and `not_held` are LAN-77 and
 * later. A transition this module does not name is refused, which is why the
 * table is a whitelist: an unlisted pair is an `InvalidTransition`, not an
 * unhandled case.
 */

// ---------------------------------------------------------------------------
// The vocabulary and the form rules
// ---------------------------------------------------------------------------

/**
 * Re-exported from `./event-input`, which is pure and is what the client-side
 * form imports. A server caller imports everything from here and does not have
 * to know the split exists; see that module's header for why it exists.
 */
export {
  DRAFTABLE_EVENT_TYPES,
  EVENT_ORIGINS,
  EVENT_TRANSITIONS,
  validateEventDraft,
  type EventDraftInput,
  type EventDraftValidation,
  type EventStatus,
  type EventTransition,
  type FieldIssue,
  type RawEventDraft,
} from "./event-input";

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** One row of the event list — UX-30. */
export interface EventListEntry {
  id: string;
  name: string;
  eventType: string;
  status: EventStatus;
  scheduledOn: string | null;
  startsAt: string | null;
  endsAt: string | null;
  venue: string | null;
  isMandatory: boolean;
  solicitsResponse: boolean;
  /** Rows in `event_audience_members`. Zero on every draft, by definition. */
  audienceCount: number;
  /** Rows in `invitations`. Structurally zero below `approved` — invariant P1. */
  invitationCount: number;
  /** Invitations carrying a current answer. */
  responseCount: number;
}

/** The event detail — UX-32 and UX-33. */
export interface EventDetail extends EventListEntry {
  origin: string;
  termId: string | null;
  termLabel: string | null;
  weekNumber: number | null;
  ownerName: string | null;
  decisionReason: string | null;
  seasonId: string;
}

export interface EventListFilters {
  /** Free text over name and venue. */
  search?: string | null;
  /** An `event_status` value, or `null` for all. */
  status?: string | null;
  /** An `event_type` value, or `null` for all. */
  eventType?: string | null;
}

export interface EventList {
  season: Season;
  events: EventListEntry[];
  /** Events in the season before any filter was applied. */
  totalInSeason: number;
}

const COUNT_COLUMNS = `
  (select count(*) from public.event_audience_members a where a.event_id = e.id) as audience_count,
  (select count(*) from public.invitations i where i.event_id = e.id) as invitation_count,
  (select count(*)
     from public.invitations i
     join public.current_rsvp r on r.invitation_id = i.id
    where i.event_id = e.id) as response_count`;

interface EventRow {
  id: string;
  name: string;
  event_type: string;
  status: EventStatus;
  scheduled_on: Date | string | null;
  starts_at: string | null;
  ends_at: string | null;
  venue: string | null;
  is_mandatory: boolean;
  solicits_response: boolean;
  audience_count: string;
  invitation_count: string;
  response_count: string;
}

interface EventDetailRow extends EventRow {
  origin: string;
  term_id: string | null;
  term_name: string | null;
  term_academic_year: string | null;
  week_number: number | null;
  owner_name: string | null;
  decision_reason: string | null;
  season_id: string;
}

function asDate(value: Date | string | null): string | null {
  if (value === null) return null;
  if (typeof value === "string") return value.slice(0, 10);
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function asTime(value: string | null): string | null {
  return value === null ? null : toMinutePrecision(value);
}

function toListEntry(row: EventRow): EventListEntry {
  return {
    id: row.id,
    name: row.name,
    eventType: row.event_type,
    status: row.status,
    scheduledOn: asDate(row.scheduled_on),
    startsAt: asTime(row.starts_at),
    endsAt: asTime(row.ends_at),
    venue: row.venue,
    isMandatory: row.is_mandatory,
    solicitsResponse: row.solicits_response,
    audienceCount: Number(row.audience_count),
    invitationCount: Number(row.invitation_count),
    responseCount: Number(row.response_count),
  };
}

/**
 * The current season's events, newest first, optionally filtered.
 *
 * `totalInSeason` comes back alongside so a screen can tell the two empty
 * states apart — "this season has no events yet" and "your filter matched
 * none" need different recovery, and the shared state contract requires them
 * to be distinguished.
 */
export async function listCurrentSeasonEvents(filters: EventListFilters = {}): Promise<EventList> {
  return withTransaction(async (tx) => {
    const season = await readCurrentSeasonIn(tx);

    const search = optional(filters.search);
    const status = optional(filters.status);
    const eventType = optional(filters.eventType);

    const result = await tx.query<EventRow>(
      `select e.id, e.name, e.event_type::text as event_type, e.status::text as status,
              e.scheduled_on, e.starts_at::text as starts_at, e.ends_at::text as ends_at,
              e.venue, e.is_mandatory, e.solicits_response,
              ${COUNT_COLUMNS}
         from public.events e
        where e.season_id = $1
          and ($2::text is null or e.name ilike '%' || $2 || '%'
                                or coalesce(e.venue, '') ilike '%' || $2 || '%')
          and ($3::text is null or e.status::text = $3)
          and ($4::text is null or e.event_type::text = $4)
        order by e.scheduled_on desc nulls first, e.created_at desc`,
      [season.id, search, status, eventType],
    );

    const total = await tx.query<{ count: string }>(
      "select count(*)::text as count from public.events where season_id = $1",
      [season.id],
    );

    return {
      season,
      events: result.rows.map(toListEntry),
      totalInSeason: Number(total.rows[0].count),
    };
  });
}

export const EVENT_NOT_FOUND_MESSAGE =
  "That event no longer exists, or it belongs to a season this club is not operating.";

/** One event, with everything the detail screen states as fact. */
export async function readEvent(eventId: string): Promise<EventDetail> {
  return withTransaction(async (tx) => readEventIn(tx, eventId));
}

async function readEventIn(tx: Tx, eventId: string): Promise<EventDetail> {
  if (!UUID_PATTERN.test(eventId)) {
    throw new NotFound(EVENT_NOT_FOUND_MESSAGE, { rule: "event_not_found" });
  }

  const result = await tx.query<EventDetailRow>(
    `select e.id, e.name, e.event_type::text as event_type, e.status::text as status,
            e.scheduled_on, e.starts_at::text as starts_at, e.ends_at::text as ends_at,
            e.venue, e.is_mandatory, e.solicits_response, e.origin::text as origin,
            e.term_id, t.name::text as term_name, t.academic_year as term_academic_year,
            e.week_number, e.decision_reason, e.season_id,
            case
              when o.id is null then null
              when o.family_name is null then coalesce(nullif(btrim(o.known_as), ''), o.given_name)
              else coalesce(nullif(btrim(o.known_as), ''), o.given_name) || ' ' || o.family_name
            end as owner_name,
            ${COUNT_COLUMNS}
       from public.events e
       left join public.terms t on t.id = e.term_id
       left join public.people o on o.id = e.owner_person_id
      where e.id = $1`,
    [eventId],
  );

  const row = result.rows[0];
  if (!row) {
    throw new NotFound(EVENT_NOT_FOUND_MESSAGE, { rule: "event_not_found" });
  }

  return {
    ...toListEntry(row),
    origin: row.origin,
    termId: row.term_id,
    termLabel:
      row.term_name && row.term_academic_year ? `${row.term_name} ${row.term_academic_year}` : null,
    weekNumber: row.week_number,
    ownerName: row.owner_name,
    decisionReason: row.decision_reason,
    seasonId: row.season_id,
  };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Creates the draft, in the current season, owned by the operator who created
 * it — model §2.3, "created as `draft` by the event owner".
 *
 * The status is a literal `'draft'` rather than a defaulted column, so that
 * reading this function tells you what state the row is in without knowing the
 * schema's default.
 */
export async function createEventDraft(
  actorPersonId: string,
  input: EventDraftInput,
): Promise<EventDetail> {
  requireActor(actorPersonId);
  requireValid(input);

  return withTransaction(async (tx) => {
    const season = await readCurrentSeasonIn(tx);

    const inserted = await tx.query<{ id: string }>(
      `insert into public.events
         (season_id, name, event_type, origin, status, scheduled_on, starts_at, ends_at,
          venue, term_id, week_number, is_mandatory, solicits_response, owner_person_id)
       values ($1, $2, $3::public.event_type, $4::public.event_origin, 'draft',
               $5, $6::time, $7::time, $8, $9, $10, $11, $12, $13)
       returning id`,
      [
        season.id,
        input.name,
        input.eventType,
        input.origin,
        input.scheduledOn,
        input.startsAt,
        input.endsAt,
        input.venue,
        input.termId,
        input.weekNumber,
        input.isMandatory,
        input.solicitsResponse,
        actorPersonId,
      ],
    );

    const id = inserted.rows[0].id;

    await recordAudit(tx, {
      actorPersonId,
      action: "event.drafted",
      entityTable: "events",
      entityId: id,
      toState: "draft",
      context: {
        eventType: input.eventType,
        solicitsResponse: input.solicitsResponse,
        isMandatory: input.isMandatory,
      },
    });

    return readEventIn(tx, id);
  });
}

export const EDIT_REFUSAL_MESSAGE = "Only a draft can be edited.";

/**
 * Edits a draft.
 *
 * The `where … and status = 'draft'` is the guard, not a preceding read: a read
 * followed by an update is two decisions with a gap between them, and the gap
 * is where a concurrent submission gets overwritten. Zero rows updated means
 * the event was not a draft when the statement ran, and that is reported as an
 * `InvalidTransition` naming the state it is actually in.
 */
export async function updateEventDraft(
  actorPersonId: string,
  eventId: string,
  input: EventDraftInput,
): Promise<EventDetail> {
  requireActor(actorPersonId);
  requireValid(input);

  return withTransaction(async (tx) => {
    const before = await readEventIn(tx, eventId);

    const updated = await tx.query<{ id: string }>(
      `update public.events
          set name = $2, event_type = $3::public.event_type, origin = $4::public.event_origin,
              scheduled_on = $5, starts_at = $6::time, ends_at = $7::time, venue = $8,
              term_id = $9, week_number = $10, is_mandatory = $11, solicits_response = $12,
              updated_at = now()
        where id = $1 and status = 'draft'
       returning id`,
      [
        eventId,
        input.name,
        input.eventType,
        input.origin,
        input.scheduledOn,
        input.startsAt,
        input.endsAt,
        input.venue,
        input.termId,
        input.weekNumber,
        input.isMandatory,
        input.solicitsResponse,
      ],
    );

    if (updated.rowCount === 0) {
      throw new InvalidTransition(`${EDIT_REFUSAL_MESSAGE} ${describeState(before.status)}`, {
        rule: "event_edit_requires_draft",
      });
    }

    await recordAudit(tx, {
      actorPersonId,
      action: "event.draft_updated",
      entityTable: "events",
      entityId: eventId,
      fromState: "draft",
      toState: "draft",
      context: {
        eventType: input.eventType,
        solicitsResponse: input.solicitsResponse,
        isMandatory: input.isMandatory,
      },
    });

    return readEventIn(tx, eventId);
  });
}

/**
 * Moves an event through one of the transitions this slice owns, and writes the
 * audit row in the same transaction.
 *
 * One implementation for all three, because the difference between them is
 * data. The alternative — three near-identical functions — is three places for
 * the audit row to be forgotten in.
 */
async function applyTransition(
  actorPersonId: string,
  eventId: string,
  transition: EventTransition,
  reason: string | null,
): Promise<EventDetail> {
  requireActor(actorPersonId);
  const rule = EVENT_TRANSITIONS[transition];

  const trimmedReason = optional(reason);
  if (rule.requiresReason && trimmedReason === null) {
    // `events_negative_decisions_are_explained` says the same thing. Refusing
    // here first means the operator gets the sentence, not the constraint.
    throw new ConstraintViolated("Say why this event is being abandoned.", {
      rule: "events_negative_decisions_are_explained",
    });
  }

  return withTransaction(async (tx) => {
    const before = await readEventIn(tx, eventId);

    const updated = await tx.query<{ id: string }>(
      `update public.events
          set status = $3::public.event_status,
              decision_reason = case when $4::text is null then decision_reason else $4 end,
              updated_at = now()
        where id = $1 and status = $2::public.event_status
       returning id`,
      [eventId, rule.from, rule.to, trimmedReason],
    );

    if (updated.rowCount === 0) {
      throw new InvalidTransition(`${rule.refusal} ${describeState(before.status)}`, {
        rule: `event_transition:${transition}`,
      });
    }

    await recordAudit(tx, {
      actorPersonId,
      action: rule.action,
      entityTable: "events",
      entityId: eventId,
      fromState: rule.from,
      toState: rule.to,
      reason: trimmedReason,
    });

    return readEventIn(tx, eventId);
  });
}

/** `draft → pending_approval`. Nothing is distributed; approval is LAN-77. */
export async function submitEventForApproval(
  actorPersonId: string,
  eventId: string,
): Promise<EventDetail> {
  return applyTransition(actorPersonId, eventId, "submit", null);
}

/** `pending_approval → draft` — UX-33's "Withdraw submission". */
export async function withdrawEventSubmission(
  actorPersonId: string,
  eventId: string,
): Promise<EventDetail> {
  return applyTransition(actorPersonId, eventId, "withdraw_submission", null);
}

/** `draft → withdrawn` — the candidate the owner abandons. Needs a reason. */
export async function abandonEventDraft(
  actorPersonId: string,
  eventId: string,
  reason: string,
): Promise<EventDetail> {
  return applyTransition(actorPersonId, eventId, "abandon", reason);
}

// ---------------------------------------------------------------------------
// Shared refusals
// ---------------------------------------------------------------------------

const STATE_NAMES: Readonly<Record<EventStatus, string>> = Object.freeze({
  draft: "a draft",
  pending_approval: "awaiting approval",
  approved: "approved",
  occurred: "recorded as having happened",
  not_held: "recorded as not held",
  cancelled: "cancelled",
  rejected: "rejected",
  withdrawn: "withdrawn",
});

/** "This event is approved." — the half of a refusal that says why. */
function describeState(status: EventStatus): string {
  return `This event is ${STATE_NAMES[status] ?? status}.`;
}

function requireActor(actorPersonId: string): void {
  if (trimmed(actorPersonId) === "") {
    throw new ConstraintViolated("An event change has to name the operator who made it.", {
      rule: "audit_events_has_an_actor",
    });
  }
}

/**
 * A defensive re-check of what `validateEventDraft` already proved.
 *
 * Not redundant: `createEventDraft` is exported, and a later caller that builds
 * an `EventDraftInput` by hand — a migration script, a test, LAN-77 — would
 * otherwise reach the database with a name of spaces or a type this slice has
 * no form for. The database catches the first and not the second.
 */
function requireValid(input: EventDraftInput): void {
  if (trimmed(input.name) === "") {
    throw new ConstraintViolated("Give the event a name.", { rule: "events_name_not_blank" });
  }
  if (!DRAFTABLE_EVENT_TYPES.includes(input.eventType)) {
    throw new ConstraintViolated("That is not an event type this form can record.", {
      rule: "event_type_not_draftable",
    });
  }
  if (!EVENT_ORIGINS.includes(input.origin)) {
    throw new ConstraintViolated("That is not a recorded event origin.", {
      rule: "event_origin_unknown",
    });
  }
  if (input.startsAt !== null && input.endsAt !== null && input.endsAt <= input.startsAt) {
    throw new ConstraintViolated("The event has to end after it starts.", {
      rule: "events_times_ordered",
    });
  }
}
