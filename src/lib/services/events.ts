import "server-only";

import {
  ConstraintViolated,
  InvalidTransition,
  NotFound,
  withTransaction,
  type Tx,
} from "@/lib/db";
import {
  deriveTermCoordinate,
  DRAFTABLE_EVENT_TYPES,
  OCCURRED_FILTER,
  OPERATOR_CREATED_ORIGIN,
  optional,
  toMinutePrecision,
  trimmed,
  UUID_PATTERN,
  type EventDeliveryMode,
  type EventDraftInput,
  type EventStatus,
  type TermWindow,
} from "./event-input";
import { recordAudit } from "./audit";
import { actorRequirement } from "./actor";
import { readCurrentSeasonIn, type Season } from "./seasons";
import { escapeLikePattern } from "./sql-text";
import { todayInClubZone } from "@/lib/club-time";

/**
 * The event aggregate — drafting, editing and reading one event. LAN-76, as
 * narrowed by LAN-151.
 *
 * ## What this module is responsible for, and what it is not
 *
 * The database owns what each *state* requires, and none of it is
 * re-implemented here:
 *
 *   * invariant E1a — an approval needs a date, an approver and a confirmed
 *     audience (`events_approval_requires_date_and_audience`). A draft may
 *     legitimately be incomplete, and this module never fills a gap in to make
 *     one look finished.
 *   * invariant P1 — an invitation cannot exist against a `draft` event, held
 *     by the cascading composite foreign key from `invitations`. Nothing here
 *     asserts it; `readEvent` *reads* the counts so a screen can state it as an
 *     observed fact.
 *   * invariant E4 — two or more events on one date is legal. There is
 *     deliberately no uniqueness check anywhere in this file, and a test proves
 *     two same-date drafts are both accepted.
 *
 * ## Why there are no status transitions here any more
 *
 * There were five, and LAN-151 removed all of them with the statuses they moved
 * between.
 *
 *   * `draft → withdrawn` (abandon) went with `withdrawn`. "Withdrawn" meant it
 *     never became an event, which is what a *deleted* draft means now (D29) —
 *     and the delete path is REQ-delete-draft's, in this mission's W4 work
 *     package rather than here. Until it lands, an abandoned draft simply stays
 *     a draft, which is exactly where the approved legacy mapping puts every
 *     previously-withdrawn row.
 *   * `approved → occurred`, `approved → not_held` and the two corrections went
 *     with the occurrence assertion itself. **Nothing asserts that an event
 *     occurred** (D30, REQ-occurrence-retired): the date passing without a
 *     cancellation is the whole of it, and `derivedEventState` in
 *     `./event-input` is where that is written down.
 *
 * Approval is `./event-approval`. Cancellation (W6) and amendment (W5) are this
 * mission's later work packages and are not here yet.
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
  derivedEventState,
  deriveTermCoordinate,
  DRAFTABLE_EVENT_TYPES,
  EVENT_DELIVERY_MODES,
  EVENT_ORIGINS,
  EVENT_STATUS_FILTERS,
  EVENT_STATUSES,
  OCCURRED_FILTER,
  EVENT_TYPES,
  hasOccurred,
  OPERATOR_CREATED_ORIGIN,
  validateEventDraft,
  type DerivedEventState,
  type EventDeliveryMode,
  type EventDraftInput,
  type EventDraftValidation,
  type EventStatus,
  type FieldIssue,
  type RawEventDraft,
  type TermCoordinate,
  type TermWindow,
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
  deliveryMode: EventDeliveryMode;
  /** An address when in person, a destination when online (D21). */
  venue: string | null;
  isMandatory: boolean;
  /** Rows in `event_audience_members`. Zero on every draft, by definition. */
  audienceCount: number;
  /** Rows in `invitations`. Structurally zero below `approved` — invariant P1. */
  invitationCount: number;
  /** Invitations carrying a current answer. */
  responseCount: number;
}

/** The event detail — UX-32 and UX-33. */
export interface EventDetail extends EventListEntry {
  /** D18. */
  description: string | null;
  /** D17. */
  requiredEquipment: string | null;
  /**
   * REQ-no-joining-url. Present on the operator tier only. Nothing public, no
   * subscription feed and no payload behind one may ever carry it.
   */
  joiningUrl: string | null;
  origin: string;
  termId: string | null;
  termLabel: string | null;
  weekNumber: number | null;
  /** Who entered the event, for the audit trail. Never a permission. */
  createdByName: string | null;
  decisionReason: string | null;
  seasonId: string;
}

export interface EventListFilters {
  /** Free text over name and venue. */
  search?: string | null;
  /**
   * One of `EVENT_STATUS_FILTERS`, or `null` for all.
   *
   * Three of the four are `event_status` values compared against the column.
   * The fourth, `occurred`, is derived and never stored (D30) — see the query.
   */
  status?: string | null;
  /** An `event_type` value, or `null` for all. */
  eventType?: string | null;
  /** One of `EVENT_SORT_COLUMNS`. Anything else falls back to the date. */
  sort?: string | null;
  /** `"asc"` or `"desc"`. Anything else falls back to the column's default. */
  direction?: string | null;
  /**
   * Today in the club's zone, `YYYY-MM-DD`. Defaults to the real one.
   *
   * An argument so that "has this event occurred?" can be asked at a stated
   * date, which is what makes the derived filter testable at all: the answer is
   * a function of the clock, and a test that could only ask it *now* would be
   * asserting today's weather.
   */
  today?: string;
}

/**
 * The columns an operator may sort the list by, and the SQL each one means.
 *
 * A whitelist rather than interpolation: `sort` arrives in the query string,
 * and the only safe way to put a caller's word in an `order by` is to look it
 * up in a list written here. An unrecognised value is the default, never an
 * error and never the caller's text.
 *
 * `status` sorts by the lifecycle's own order rather than alphabetically —
 * `event_status` is an enum, so PostgreSQL already sorts it draft, approved,
 * cancelled, and an operator scanning for what needs attention wants that
 * rather than "approved, cancelled, draft".
 */
export const EVENT_SORT_COLUMNS: Readonly<
  Record<string, { sql: string; default: "asc" | "desc" }>
> = Object.freeze({
  date: Object.freeze({ sql: "e.scheduled_on", default: "desc" as const }),
  name: Object.freeze({ sql: "e.name", default: "asc" as const }),
  venue: Object.freeze({ sql: "e.venue", default: "asc" as const }),
  status: Object.freeze({ sql: "e.status", default: "asc" as const }),
});

export const DEFAULT_EVENT_SORT = "date";

/** The `order by` for a requested sort, resolved against the whitelist. */
function orderBy(sort: string | null, direction: string | null): string {
  const column = EVENT_SORT_COLUMNS[sort ?? ""] ?? EVENT_SORT_COLUMNS[DEFAULT_EVENT_SORT];
  const dir = direction === "asc" || direction === "desc" ? direction : column.default;
  // `nulls last` on both directions: an event with no date yet, or no venue, is
  // incomplete rather than earliest, and burying it at the top of a descending
  // list would put the least finished events in front of the operator first.
  return `${column.sql} ${dir === "asc" ? "asc" : "desc"} nulls last, e.created_at desc`;
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
  delivery_mode: EventDeliveryMode;
  venue: string | null;
  is_mandatory: boolean;
  audience_count: string;
  invitation_count: string;
  response_count: string;
}

interface EventDetailRow extends EventRow {
  description: string | null;
  required_equipment: string | null;
  joining_url: string | null;
  origin: string;
  term_id: string | null;
  term_name: string | null;
  term_academic_year: string | null;
  week_number: number | null;
  created_by_name: string | null;
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
    deliveryMode: row.delivery_mode,
    venue: row.venue,
    isMandatory: row.is_mandatory,
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

    // `%` and `_` are LIKE syntax, and an operator typing either means the
    // character. Escaped here rather than in the SQL so the pattern the
    // database receives is exactly what was searched for. Not an injection
    // concern — the value is a parameter either way — just a wrong result.
    const search = escapeLikePattern(optional(filters.search));
    const status = optional(filters.status);
    const eventType = optional(filters.eventType);
    const today = filters.today ?? todayInClubZone();

    /*
      Q-6, and the one filter value that is not a column.

      `occurred` is derived and never stored (D30), so it cannot be compared
      against `e.status` — it is the same three-part rule `derivedEventState`
      applies in TypeScript and `public.rsvp_attendance_mismatches` applies in
      SQL, written here a third time only because a `where` clause cannot call
      either. Today is a parameter rather than `current_date` so that the club's
      zone decides which day it is, exactly as it does on every screen: at 00:30
      in Oxford in June, `current_date` at UTC is still yesterday.

      The stored branch is unchanged, and a value that is neither is compared
      against the enum and matches nothing — which is what an unknown filter
      should do.
    */
    const result = await tx.query<EventRow>(
      `select e.id, e.name, e.event_type::text as event_type, e.status::text as status,
              e.scheduled_on, e.starts_at::text as starts_at, e.ends_at::text as ends_at,
              e.delivery_mode::text as delivery_mode, e.venue, e.is_mandatory,
              ${COUNT_COLUMNS}
         from public.events e
        where e.season_id = $1
          and ($2::text is null or e.name ilike '%' || $2 || '%'
                                or coalesce(e.venue, '') ilike '%' || $2 || '%')
          and ($3::text is null
                or ($3 = $5 and e.status = 'approved' and e.scheduled_on < $6::date)
                or ($3 <> $5 and e.status::text = $3))
          and ($4::text is null or e.event_type::text = $4)
        order by ${orderBy(optional(filters.sort), optional(filters.direction))}`,
      [season.id, search, status, eventType, OCCURRED_FILTER, today],
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

/**
 * Deliberately says only that the event is gone.
 *
 * An earlier draft added "or it belongs to a season this club is not
 * operating", which `readEventIn` does not check — it reads by id alone, and an
 * event from any season resolves. A refusal that describes a rule the code does
 * not apply teaches the reader something false about the system.
 */
export const EVENT_NOT_FOUND_MESSAGE = "That event no longer exists.";

/** One event, with everything the detail screen states as fact. */
export async function readEvent(eventId: string): Promise<EventDetail> {
  return withTransaction(async (tx) => readEventIn(tx, eventId));
}

/**
 * The event, read under a row lock that is held until the transaction ends.
 *
 * ## What this is for, and the bug that produced it
 *
 * `withTransaction` opens a plain `begin`, so the isolation level is READ
 * COMMITTED. That is the right default and it is not enough on its own for a
 * read-then-write across *several* tables: two transactions can each read a
 * consistent picture, each decide it is safe to proceed, and each be right about
 * a state that no longer exists by the time they write.
 *
 * Independent review proved exactly that against LAN-77's approval path, with
 * three real connections. `approveEvent` read the audience, then flipped the
 * status; `saveEventAudience` checked the status with a plain `select`, which
 * does not block on another transaction's uncommitted `update`, and deleted the
 * audience rows underneath it. The committed result was an **approved event with
 * no audience and no invitations** — precisely the state invariant E1b exists to
 * prevent, and one `uninvited_audience_members` cannot even report, because
 * there are no audience rows left to report on.
 *
 * `select … for update` closes it: the second transaction blocks here until the
 * first commits or rolls back, and then sees the truth rather than a memory of
 * it. Every path that reads an event and then writes rows that depend on the
 * event's state takes this lock **first**, before reading anything it will make
 * a decision from.
 *
 * The guarded `update … where status = 'draft'` stays where it is. It is still
 * the thing that makes a double submission safe, and it now has a lock in front
 * of it rather than instead of it.
 *
 * ## Why it returns the event rather than just locking
 *
 * So that a caller cannot take the lock and then act on a copy it read before
 * taking it — which is the bug in miniature. The returned detail is read after
 * the lock is held, so it is authoritative for the rest of the transaction.
 */
export async function lockEventIn(tx: Tx, eventId: string): Promise<EventDetail> {
  if (!UUID_PATTERN.test(eventId)) {
    throw new NotFound(EVENT_NOT_FOUND_MESSAGE, { rule: "event_not_found" });
  }

  const locked = await tx.query<{ id: string }>(
    "select id from public.events where id = $1 for update",
    [eventId],
  );
  if (locked.rowCount === 0) {
    throw new NotFound(EVENT_NOT_FOUND_MESSAGE, { rule: "event_not_found" });
  }

  return readEventIn(tx, eventId);
}

/**
 * The same read, inside a caller's transaction.
 *
 * Exported for `./event-approval`, which has to read the event, resolve an
 * audience and write all five tables as one unit — reading through `readEvent`
 * would open a second transaction and defeat the point.
 *
 * Takes no lock. A caller that will *write* based on what it reads wants
 * `lockEventIn` instead; this one is for reads that only display.
 */
export async function readEventIn(tx: Tx, eventId: string): Promise<EventDetail> {
  if (!UUID_PATTERN.test(eventId)) {
    throw new NotFound(EVENT_NOT_FOUND_MESSAGE, { rule: "event_not_found" });
  }

  const result = await tx.query<EventDetailRow>(
    `select e.id, e.name, e.event_type::text as event_type, e.status::text as status,
            e.scheduled_on, e.starts_at::text as starts_at, e.ends_at::text as ends_at,
            e.delivery_mode::text as delivery_mode, e.venue, e.is_mandatory,
            e.description, e.required_equipment, e.joining_url, e.origin::text as origin,
            e.term_id, t.name::text as term_name, t.academic_year as term_academic_year,
            e.week_number, e.decision_reason, e.season_id,
            case
              when o.id is null then null
              when o.family_name is null then coalesce(nullif(btrim(o.known_as), ''), o.given_name)
              else coalesce(nullif(btrim(o.known_as), ''), o.given_name) || ' ' || o.family_name
            end as created_by_name,
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
    description: row.description,
    requiredEquipment: row.required_equipment,
    joiningUrl: row.joining_url,
    origin: row.origin,
    termId: row.term_id,
    termLabel:
      row.term_name && row.term_academic_year ? `${row.term_name} ${row.term_academic_year}` : null,
    weekNumber: row.week_number,
    createdByName: row.created_by_name,
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
    // Derived, not chosen: the date the operator entered decides both.
    const term = deriveTermCoordinate(input.scheduledOn, await listTermWindows(tx));

    const inserted = await tx.query<{ id: string }>(
      `insert into public.events
         (season_id, name, event_type, origin, status, scheduled_on, starts_at, ends_at,
          delivery_mode, venue, description, required_equipment, joining_url,
          term_id, week_number, is_mandatory, owner_person_id)
       values ($1, $2, $3::public.event_type, $4::public.event_origin, 'draft',
               $5, $6::time, $7::time, $8::public.event_delivery_mode, $9, $10, $11, $12,
               $13, $14, $15, $16)
       returning id`,
      [
        season.id,
        input.name,
        input.eventType,
        OPERATOR_CREATED_ORIGIN,
        input.scheduledOn,
        input.startsAt,
        input.endsAt,
        input.deliveryMode,
        input.venue,
        input.description,
        input.requiredEquipment,
        input.joiningUrl,
        term.termId,
        term.weekNumber,
        input.isMandatory,
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
        deliveryMode: input.deliveryMode,
        isMandatory: input.isMandatory,
        origin: OPERATOR_CREATED_ORIGIN,
        weekNumber: term.weekNumber,
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
    const term = deriveTermCoordinate(input.scheduledOn, await listTermWindows(tx));

    // `origin` is deliberately absent from this statement. An event that came
    // from somewhere else — a BUCS fixture, a negotiated slot — keeps the
    // provenance it arrived with, and editing its name here must not quietly
    // reclassify it as the club's own. Nothing in this slice creates such an
    // event; the schema does, and later issues will.
    const updated = await tx.query<{ id: string }>(
      `update public.events
          set name = $2, event_type = $3::public.event_type,
              scheduled_on = $4, starts_at = $5::time, ends_at = $6::time,
              delivery_mode = $7::public.event_delivery_mode, venue = $8,
              description = $9, required_equipment = $10, joining_url = $11,
              term_id = $12, week_number = $13, is_mandatory = $14,
              updated_at = now()
        where id = $1 and status = 'draft'
       returning id`,
      [
        eventId,
        input.name,
        input.eventType,
        input.scheduledOn,
        input.startsAt,
        input.endsAt,
        input.deliveryMode,
        input.venue,
        input.description,
        input.requiredEquipment,
        input.joiningUrl,
        term.termId,
        term.weekNumber,
        input.isMandatory,
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
        deliveryMode: input.deliveryMode,
        isMandatory: input.isMandatory,
        weekNumber: term.weekNumber,
      },
    });

    return readEventIn(tx, eventId);
  });
}

// ---------------------------------------------------------------------------
// Shared refusals
// ---------------------------------------------------------------------------

const STATE_NAMES: Readonly<Record<EventStatus, string>> = Object.freeze({
  draft: "a draft",
  approved: "approved",
  cancelled: "cancelled",
});

/** "This event is approved." — the half of a refusal that says why. */
function describeState(status: EventStatus): string {
  return `This event is ${STATE_NAMES[status] ?? status}.`;
}

/**
 * Every term, in the shape the derivation needs.
 *
 * Read inside the caller's transaction so that a create and its derived
 * coordinate see one consistent calendar — a term edited between the two would
 * otherwise produce a week number that disagrees with the term it names.
 */
async function listTermWindows(tx: Tx): Promise<TermWindow[]> {
  const result = await tx.query<{
    id: string;
    name: string;
    academic_year: string;
    starts_on: Date | string;
    ends_on: Date | string;
    first_week: number;
    last_week: number;
  }>(
    `select id, name::text as name, academic_year, starts_on, ends_on, first_week, last_week
       from public.terms
      order by starts_on desc`,
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    academicYear: row.academic_year,
    startsOn: asDate(row.starts_on) ?? "",
    endsOn: asDate(row.ends_on) ?? "",
    firstWeek: row.first_week,
    lastWeek: row.last_week,
  }));
}

const requireActor = actorRequirement("An event change has to name the operator who made it.");

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
  if (input.startsAt !== null && input.endsAt !== null && input.endsAt <= input.startsAt) {
    throw new ConstraintViolated("The event has to end after it starts.", {
      rule: "events_times_ordered",
    });
  }
}
