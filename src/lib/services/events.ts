import "server-only";

import {
  ConstraintViolated,
  InvalidTransition,
  NotFound,
  withTransaction,
  type Tx,
} from "@/lib/db";
import { listAudienceCatalogueIn, resolveSelection } from "./event-audience";
import {
  readTemplateInheritanceIn,
  templateAudienceKeys,
  type NewEventInheritance,
} from "./event-templates";
import {
  readEventQuestionsIn,
  writeEventQuestionsIn,
  type EventQuestion,
  type EventQuestionInput,
} from "./event-questions";
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
import { SHOWED_PRESENCES } from "./attendance-vocabulary";
import { requireEventOperatorTier } from "@/lib/auth/event-tier";
import { readCurrentSeasonIn, type Season } from "./seasons";
import { escapeLikePattern, personDisplayNameSql } from "./sql-text";
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
 *     never became an event, which is what a *deleted* draft means now (D29).
 *     `deleteEventDraft` below is that path, added by LAN-154: there is no
 *     status to move to, because the row goes.
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

/**
 * The question vocabulary, re-exported for the same reason as the event's own:
 * `./event-questions-input` is pure and is what the form imports, and a server
 * caller should not have to know that the module is split in two.
 */
export {
  describeQuestionAnswer,
  describeQuestionCount,
  joinQuestionChoices,
  QUESTION_ANSWER_TYPE_LABELS,
  QUESTION_ANSWER_TYPES,
  splitQuestionChoices,
  validateEventQuestions,
  type EventQuestion,
  type EventQuestionInput,
  type QuestionAnswerType,
  type QuestionIssue,
  type RawEventQuestion,
} from "./event-questions";

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
  /**
   * Whether anything at all has been recorded against this event — D72.
   *
   * On the list because the coach's own card has to ask the same question the
   * register asks, and `isRegisterAvailable` needs it: a register with anything
   * in it has already been opened, so the buffer cannot take it back. Without
   * it the card would answer a different question from the two surfaces either
   * side of it, which is finding W-F1.
   *
   * An `exists`, not a count. Nothing displays how many rows there are, and a
   * count over a table that grows with every session recorded would be read as
   * though it meant something.
   */
  registerSaved: boolean;
  /** Rows in `event_audience_members`. Zero on every draft, by definition. */
  audienceCount: number;
  /** Rows in `invitations`. Structurally zero below `approved` — invariant P1. */
  invitationCount: number;
  /** Invitations carrying a current answer. */
  responseCount: number;
  /** Invitations whose standing answer is yes. Intent, never observation. */
  saidYesCount: number;
  /**
   * Attendance rows recorded `present` or `late` — the club's "showed".
   *
   * Meaningless on its own, and never rendered on its own: it is zero both for
   * a session nobody attended and for a session nobody has recorded, and D74
   * requires those to be distinguishable at a glance. `registerSaved` is what
   * separates them, and `formatShowedAgainstInvited` is the one formatter that
   * consults both.
   */
  showedCount: number;
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
  /**
   * Soonest first by default, since LAN-153.
   *
   * It was newest-first while the list rendered the whole season in one run and
   * the useful end was the recent past. The list now **opens on what is
   * upcoming** (D84), and the useful end of an upcoming list is the near future
   * — an operator scanning before the Monday meeting wants Wednesday's practice
   * at the top, not last June's.
   */
  date: Object.freeze({ sql: "e.scheduled_on", default: "asc" as const }),
  /**
   * Term and week — **the same SQL as the date**, which is the requirement
   * rather than an optimisation.
   *
   * `REQ-list-shape`: "Term and week sorting identically to Date". The Oxford
   * coordinate is derived from the date and nothing else (`./oxford-year`), so
   * ordering by the coordinate and ordering by the date are the same ordering —
   * and writing it as the same expression is what makes them provably the same
   * rather than two orderings that agree today. Sorting by the stored
   * `week_number` would not: it is null outside term, so a vacation event would
   * sort to one end of the list instead of into its own week.
   */
  term: Object.freeze({ sql: "e.scheduled_on", default: "asc" as const }),
  name: Object.freeze({ sql: "e.name", default: "asc" as const }),
  venue: Object.freeze({ sql: "e.venue", default: "asc" as const }),
  status: Object.freeze({ sql: "e.status", default: "asc" as const }),
  type: Object.freeze({ sql: "e.event_type", default: "asc" as const }),
  invited: Object.freeze({ sql: "invitation_count", default: "desc" as const }),
  said_yes: Object.freeze({ sql: "said_yes_count", default: "desc" as const }),
  /**
   * Showed against invited sorts by what was actually recorded.
   *
   * An event with no register sorts with the zeroes and not above them: it has
   * no number, and inventing an ordering for "not recorded" would put the
   * sessions nobody has assessed either first or last for a reason no operator
   * asked for. The column still *reads* "—" for them, which is the fact.
   */
  showed: Object.freeze({ sql: "showed_count", default: "desc" as const }),
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

/**
 * `'present', 'late'` — the presences the club counts as having showed up.
 *
 * Built from `SHOWED_PRESENCES` rather than typed into the SQL, because
 * `attendance-vocabulary.ts` owns which presences mean somebody turned up and
 * two answers to that question is exactly what `docs/ux/standards.md` rule 7
 * exists to stop. Interpolated rather than parameterised because the counts are
 * spliced into two queries whose placeholders are numbered differently; the
 * values are a frozen literal array in this repository and never anything a
 * caller supplied, so there is no user text anywhere near this string.
 */
const SHOWED_PRESENCE_LITERALS = SHOWED_PRESENCES.map((presence) => `'${presence}'`).join(", ");

/**
 * The participation counts — the operator tier's, and nobody else's.
 *
 * Every one of these reads a table the public tier may not see, which is why
 * they are one named pair — this select list and `participationJoins()` below —
 * rather than six lines inside a query: the public reads further down are
 * proved to be free of them by a test that reads `PARTICIPATION_TABLES`, and a
 * seventh count added here is covered by that test on the day it is written
 * rather than on the day somebody remembers.
 *
 * `coalesce` on every one because the joins are outer: an event nobody has been
 * invited to has no row in the invitation group at all, and the count it should
 * report is zero rather than null. `register_saved` is `false` by the same rule
 * — no attendance group is exactly "no register has been saved".
 */
const COUNT_COLUMNS = `
  coalesce(audience.audience_count, 0) as audience_count,
  coalesce(invited.invitation_count, 0) as invitation_count,
  coalesce(invited.response_count, 0) as response_count,
  coalesce(invited.said_yes_count, 0) as said_yes_count,
  coalesce(attended.showed_count, 0) as showed_count,
  coalesce(attended.register_saved, false) as register_saved`;

/**
 * The three grouped reads those counts come from, joined to `e` once. LAN-228.
 *
 * ## Why grouped rather than correlated
 *
 * These were six correlated subqueries on `e.id` until LAN-227 measured them
 * and LAN-228 replaced them: 591–846 ms of CPU and 742 680 buffer hits to
 * return one season's 110 events on the local seed. `current_rsvp` is a
 * `distinct on (invitation_id)` view over the whole of `rsvp_responses`, and
 * correlating it on `i.event_id` gives the planner nothing to push down — so it
 * re-derived the club's every standing answer **once per event row**, and did it
 * twice, for `response_count` and again for `said_yes_count`. The cost was
 * linear in events and linear in answers at the same time, which is quadratic
 * across a season that is filling up.
 *
 * Grouped once and joined once, the view is derived a single time whatever the
 * row count. Measured on the same seed, the same statement went from 591–846 ms
 * to 6–8 ms. No index was missing and none was added; the shape was the whole
 * cost.
 *
 * ## Why the scope is a parameter
 *
 * `scope` is the caller's own `where` on the participation row, and it is
 * required rather than optional. Without it each group would aggregate every
 * invitation, every audience row and every attendance record the club has ever
 * recorded, in every season, to answer a question about one season or one
 * event — which trades a per-row cost for an unbounded one and gets slower
 * every year as the seasons pile up behind it. The season list
 * passes the season; the single-event read passes the event. It is SQL written
 * in this file, never anything a caller supplied, and the values it compares
 * against stay parameters.
 *
 * The season list scopes on `p.season_id` rather than on a subquery over
 * `events`, and the two are the same set rather than nearly the same one: all
 * three tables carry the season denormalised behind a composite foreign key
 * (`invitations_event_same_season`, `attendance_records_event_same_season`,
 * `event_audience_members_event_same_season`, each
 * `(event_id, season_id) references events (id, season_id)`), so a row's season
 * cannot disagree with its event's. The database enforces the equality; this
 * only spends it.
 *
 * The alias inside each group is `p` — participation — so one scope string fits
 * all three.
 */
function participationJoins(scope: string): string {
  return `
       left join (
         select p.event_id, count(*) as audience_count
           from public.event_audience_members p
          where ${scope}
          group by p.event_id
       ) audience on audience.event_id = e.id
       left join (
         select p.event_id,
                count(*) as invitation_count,
                count(r.invitation_id) as response_count,
                count(*) filter (where r.response = 'yes') as said_yes_count
           from public.invitations p
           left join public.current_rsvp r on r.invitation_id = p.id
          where ${scope}
          group by p.event_id
       ) invited on invited.event_id = e.id
       left join (
         select p.event_id,
                count(*) filter (where p.presence in (${SHOWED_PRESENCE_LITERALS})) as showed_count,
                true as register_saved
           from public.attendance_records p
          where ${scope}
          group by p.event_id
       ) attended on attended.event_id = e.id`;
}

/**
 * The tables the public tier must never read from.
 *
 * Named here, beside the joins that do read them, so the test that proves
 * `PUBLIC_EVENT_COLUMNS` mentions none of them has one list to check against.
 */
export const PARTICIPATION_TABLES: readonly string[] = Object.freeze([
  "event_audience_members",
  "invitations",
  "current_rsvp",
  "attendance_records",
  "rsvp_responses",
]);

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
  said_yes_count: string;
  showed_count: string;
  register_saved: boolean;
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
    registerSaved: row.register_saved,
    audienceCount: Number(row.audience_count),
    invitationCount: Number(row.invitation_count),
    responseCount: Number(row.response_count),
    saidYesCount: Number(row.said_yes_count),
    showedCount: Number(row.showed_count),
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
      Q-6. The Status filter selects the rows whose Status column reads the word
      that was chosen — which is not the same as comparing `e.status`.

      `occurred` is derived and never stored (D30): an approved event whose date
      has passed. The list shows that word in the column, so the filter has to
      mean the same thing, or choosing **Approved** returns rows visibly
      labelled *Occurred* and choosing **Occurred** misses none of them but
      overlaps the other — two controls answering one question two ways, which
      is what `docs/ux/standards.md` rule 7 exists to stop. Brian asked to
      "easily be able to tell which ones happened versus not", and two filter
      values that both match the same evening do not.

      So the expression below is `statusLabel` in `src/app/operate/events/page.tsx`,
      in SQL, and the four values partition the season. Today is a parameter
      rather than `current_date` so the club's zone decides which day it is: at
      00:30 in Oxford in June, `current_date` at UTC is still yesterday.

      A value that is none of the four matches nothing, which is what an unknown
      filter should do.
    */
    const result = await tx.query<EventRow>(
      `select e.id, e.name, e.event_type::text as event_type, e.status::text as status,
              e.scheduled_on, e.starts_at::text as starts_at, e.ends_at::text as ends_at,
              e.delivery_mode::text as delivery_mode, e.venue, e.is_mandatory,
              ${COUNT_COLUMNS}
         from public.events e
         ${participationJoins("p.season_id = $1")}
        where e.season_id = $1
          and ($2::text is null or e.name ilike '%' || $2 || '%'
                                or coalesce(e.venue, '') ilike '%' || $2 || '%')
          and ($3::text is null
                or case
                     when e.status = 'approved' and e.scheduled_on < $6::date then $5
                     else e.status::text
                   end = $3)
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
 * The same list, behind the operator tier's own guard. LAN-153.
 *
 * `REQ-three-tiers` puts authorisation in the service layer and never in route
 * visibility, and this is where that is true for the elevated projection: every
 * operator surface reads events through here, and the guard runs before the
 * query rather than beside it on a page. A page that forgot its gate would still
 * be refused; `/operate`'s gate and the layout's check remain, and this is the
 * third of three independent refusals rather than a replacement for either.
 *
 * The floor is a linked, active operator — the floor `/operate/events` has stood
 * on since LAN-76. Nothing here widens it, and a coaching assignment passes it
 * exactly as before and then gets its own narrowed list.
 */
export async function listEventsForOperator(filters: EventListFilters = {}): Promise<EventList> {
  await requireEventOperatorTier();
  return listCurrentSeasonEvents(filters);
}

// ---------------------------------------------------------------------------
// The public tier
// ---------------------------------------------------------------------------

/**
 * One row of the **public** event list. LAN-153, `REQ-public-calendar`.
 *
 * ## What is not here is the point
 *
 * There is no `joiningUrl`, no `status`, no count of any kind and no
 * `registerSaved`. Not withheld — **absent**: this type has no field for one, so
 * a screen cannot render one by accident and a payload cannot carry one by
 * accident. The query below reads the same way, so there is nothing in memory to
 * leak either.
 *
 * ## Except `isCancelled`, which is not a status
 *
 * Correction C1 to `W1`: a cancelled event stays on the public list, marked
 * cancelled. D57 keeps it visible with its history, and `W2` keeps it in the
 * subscription feed marked cancelled — so hiding it here would make two public
 * surfaces disagree, and an event that silently disappears from somebody's
 * calendar reads as a sync failure.
 *
 * That needs one bit, not the status column. A reader learns whether the event
 * is off; they do not learn whether it is a draft, which is the operator tier's
 * (`W1`'s tier table, Brian 20 August 2026).
 */
export interface PublicEventListEntry {
  id: string;
  name: string;
  eventType: string;
  scheduledOn: string | null;
  startsAt: string | null;
  endsAt: string | null;
  deliveryMode: EventDeliveryMode;
  /** An address when in person. Online events say "Online" and stop there. */
  venue: string | null;
  isMandatory: boolean;
  /** D57 and correction C1. One bit, and not the status column. */
  isCancelled: boolean;
}

/** The public event page — the whole record, and nothing about people. */
export interface PublicEventDetail extends PublicEventListEntry {
  /** D18. */
  description: string | null;
  /** D17. */
  requiredEquipment: string | null;
}

export interface PublicEventList {
  season: Season;
  events: PublicEventListEntry[];
  /** Events in the season before any filter. Tells the two empty states apart. */
  totalInSeason: number;
}

/**
 * Every column the public tier reads, and there are no others.
 *
 * Exported so a test can assert on it directly. Reading the columns is the
 * strongest statement available about what a payload can contain: a test that
 * only inspected a returned object would pass on a season whose events all
 * happen to be in person, and this one cannot.
 *
 * `joining_url` is absent, which is `REQ-no-joining-url`. Every participation
 * table in `PARTICIPATION_TABLES` is absent, which is `REQ-public-calendar`'s
 * "a public event page renders without touching participation data at all" —
 * not hidden after loading, never read.
 */
export const PUBLIC_EVENT_COLUMNS = `e.id, e.name, e.event_type::text as event_type,
            e.scheduled_on, e.starts_at::text as starts_at, e.ends_at::text as ends_at,
            e.delivery_mode::text as delivery_mode, e.venue, e.is_mandatory,
            (e.status = 'cancelled') as is_cancelled`;

interface PublicEventRow {
  id: string;
  name: string;
  event_type: string;
  scheduled_on: Date | string | null;
  starts_at: string | null;
  ends_at: string | null;
  delivery_mode: EventDeliveryMode;
  venue: string | null;
  is_mandatory: boolean;
  is_cancelled: boolean;
}

function toPublicEntry(row: PublicEventRow): PublicEventListEntry {
  return {
    id: row.id,
    name: row.name,
    eventType: row.event_type,
    scheduledOn: asDate(row.scheduled_on),
    startsAt: asTime(row.starts_at),
    endsAt: asTime(row.ends_at),
    deliveryMode: row.delivery_mode,
    venue: row.venue,
    isMandatory: row.is_mandatory,
    isCancelled: row.is_cancelled,
  };
}

/** What the public tier may narrow the list by. No status: it has none to show. */
export interface PublicEventListFilters {
  /** Free text over name and venue. */
  search?: string | null;
  /** An `event_type` value, or `null` for all. */
  eventType?: string | null;
  /** One of `EVENT_SORT_COLUMNS` that the public tier offers. */
  sort?: string | null;
  direction?: string | null;
}

/**
 * The columns the public list may be sorted by — `REQ-list-shape`'s public row.
 *
 * The operator's whitelist minus the columns the public tier has no data for. A
 * public reader asking for `?sort=said_yes` gets the default, which is the same
 * thing an unrecognised value has always got: never an error, and never a hint
 * that the column exists.
 */
export const PUBLIC_EVENT_SORT_COLUMNS: readonly string[] = Object.freeze([
  "date",
  "term",
  "name",
  "type",
  "venue",
]);

function publicOrderBy(sort: string | null, direction: string | null): string {
  const key = sort !== null && PUBLIC_EVENT_SORT_COLUMNS.includes(sort) ? sort : DEFAULT_EVENT_SORT;
  return orderBy(key, direction);
}

/**
 * The open season's events, at the public tier. No session, no token, no cookie.
 *
 * ## It writes nothing, and cannot
 *
 * One `select`, inside the shared read transaction, and no call to anything that
 * writes. `REQ-public-calendar`: "reading is free of side effects for traffic
 * carrying no session". LAN-114 already required that no audience, invitation,
 * RSVP, attendance or automation record is created merely by viewing, and D1
 * widens it to requests with no session at all —
 * `tests/public-calendar-side-effects.test.ts` asserts it by counting the rows
 * in all five tables either side of a render, rather than by inspection.
 *
 * ## There are no private or hidden events
 *
 * D5. Every event in the season is here, drafts included (D4) and committee
 * meetings included. The public tier is narrowed in *what it says about* an
 * event, never in which events it shows — a calendar that quietly omitted rows
 * would be a second, disagreeing answer to "what is on".
 */
export async function listPublicSeasonEvents(
  filters: PublicEventListFilters = {},
): Promise<PublicEventList> {
  return withTransaction(async (tx) => {
    const season = await readCurrentSeasonIn(tx);

    const search = escapeLikePattern(optional(filters.search));
    const eventType = optional(filters.eventType);

    const result = await tx.query<PublicEventRow>(
      `select ${PUBLIC_EVENT_COLUMNS}
         from public.events e
        where e.season_id = $1
          and ($2::text is null or e.name ilike '%' || $2 || '%'
                                or coalesce(e.venue, '') ilike '%' || $2 || '%')
          and ($3::text is null or e.event_type::text = $3)
        order by ${publicOrderBy(optional(filters.sort), optional(filters.direction))}`,
      [season.id, search, eventType],
    );

    const total = await tx.query<{ count: string }>(
      "select count(*)::text as count from public.events where season_id = $1",
      [season.id],
    );

    return {
      season,
      events: result.rows.map(toPublicEntry),
      totalInSeason: Number(total.rows[0].count),
    };
  });
}

/**
 * One event, at the public tier.
 *
 * Scoped to the open season, unlike `readEventIn`. `REQ-one-open-season`: one
 * season is open and the mission knows no other, so a public address that
 * resolved an event from a season the club is not operating would be a way to
 * reach a different season — the one thing no surface here offers. An event
 * outside it reads as gone, in the same words as an id that never existed.
 */
export async function readPublicEvent(eventId: string): Promise<PublicEventDetail> {
  if (!UUID_PATTERN.test(eventId)) {
    throw new NotFound(EVENT_NOT_FOUND_MESSAGE, { rule: "event_not_found" });
  }

  return withTransaction(async (tx) => {
    const season = await readCurrentSeasonIn(tx);

    const result = await tx.query<
      PublicEventRow & { description: string | null; required_equipment: string | null }
    >(
      `select ${PUBLIC_EVENT_COLUMNS}, e.description, e.required_equipment
         from public.events e
        where e.id = $1 and e.season_id = $2`,
      [eventId, season.id],
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFound(EVENT_NOT_FOUND_MESSAGE, { rule: "event_not_found" });
    }

    return {
      ...toPublicEntry(row),
      description: row.description,
      requiredEquipment: row.required_equipment,
    };
  });
}

/**
 * One public event row, plus `description` and `required_equipment` — the two
 * columns `readPublicEvent` already selects and this feed withheld until
 * Q-29 — and the one column only the subscription feed reads, `updated_at`.
 * LAN-158, `W2`.
 *
 * Extends `PublicEventListEntry` rather than adding a field to it: no public
 * screen imports this type or reads this interface, only
 * `/calendar/feed.ics` does, through `listPublicSeasonEventsForFeed` below.
 * `updated_at` is never rendered — `calendar-feed.ts` reads it only to derive
 * `SEQUENCE`.
 */
export interface FeedEventEntry extends PublicEventListEntry {
  /** D18. Same value `readPublicEvent` returns; Q-29 lets the feed carry it too. */
  description: string | null;
  /** D17. Same value `readPublicEvent` returns; Q-29 lets the feed carry it too. */
  requiredEquipment: string | null;
  /** ISO 8601 instant. */
  updatedAt: string;
}

/** `Date` from the driver, or the string PostgreSQL sent — either becomes ISO. */
function toIsoInstant(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/**
 * Every event in the open season, unfiltered and unpaginated, at the public
 * tier plus its revision clock — the whole of what `W2`'s subscription feed
 * reads. LAN-158.
 *
 * The same projection as `listPublicSeasonEvents` — same columns
 * (`PUBLIC_EVENT_COLUMNS`), same guarantee that no participation table is
 * touched — with `description`, `required_equipment` and `updated_at` added
 * and no search, type or sort applied: a feed has no reader to filter for, and
 * a provider that fetched it once with a filter would keep re-fetching that
 * filter forever. Ordered by date so the emitted document is stable and
 * readable, though `UID` rather than order is what a subscribed calendar
 * actually keys on.
 *
 * `description` and `required_equipment` are the same two columns
 * `readPublicEvent` already selects for the public event page — Q-29 is the
 * decision that the feed may carry them too, matching what `readPublicEvent`
 * has always returned. `joining_url` is not among them and never will be
 * (`REQ-no-joining-url`); neither is anything from `PARTICIPATION_TABLES`.
 *
 * `readCurrentSeasonIn` throws when no season is open — the same refusal
 * `listPublicSeasonEvents` propagates today. The route handler decides what a
 * machine consumer does with that; this function's contract does not change to
 * accommodate it.
 */
export async function listPublicSeasonEventsForFeed(): Promise<{
  season: Season;
  events: FeedEventEntry[];
}> {
  return withTransaction(async (tx) => {
    const season = await readCurrentSeasonIn(tx);

    const result = await tx.query<
      PublicEventRow & {
        description: string | null;
        required_equipment: string | null;
        updated_at: Date | string;
      }
    >(
      `select ${PUBLIC_EVENT_COLUMNS}, e.description, e.required_equipment, e.updated_at
         from public.events e
        where e.season_id = $1
        order by e.scheduled_on asc nulls last, e.starts_at asc nulls last, e.id asc`,
      [season.id],
    );

    return {
      season,
      events: result.rows.map((row) => ({
        ...toPublicEntry(row),
        description: row.description,
        requiredEquipment: row.required_equipment,
        updatedAt: toIsoInstant(row.updated_at),
      })),
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
 * The questions this event asks, in the order a player will be asked them.
 *
 * A read of its own rather than a field on `EventDetail`, because the list
 * screen draws thirty events and none of them shows a question. The detail, the
 * editor and the approval review each ask for them, and all three get the same
 * rows in the same order.
 */
export async function readEventQuestions(eventId: string): Promise<EventQuestion[]> {
  return withTransaction(async (tx) => readEventQuestionsIn(tx, eventId));
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
            ${personDisplayNameSql("o")} as created_by_name,
            ${COUNT_COLUMNS}
       from public.events e
       left join public.terms t on t.id = e.term_id
       left join public.people o on o.id = e.owner_person_id
       ${participationJoins("p.event_id = $1")}
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
  questions?: readonly EventQuestionInput[],
): Promise<EventDetail> {
  requireActor(actorPersonId);
  requireValid(input);

  return withTransaction(async (tx) => {
    const season = await readCurrentSeasonIn(tx);
    // Read before the event exists, so the questions and the default audience a
    // new draft inherits come from one template rather than from whatever it
    // said between three separate reads.
    const inherited = await readTemplateInheritanceIn(tx, input.eventType);
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

    // D42, amendment W4-A1. The form posts the questions it is showing, which
    // already include the template's; a caller with nothing to say about them
    // gets the template's, which is what "they arrive with any event created
    // from that template" means.
    await writeEventQuestionsIn(tx, id, questions ?? inherited.questions);

    const audienceSize = await applyTemplateAudienceIn(
      tx,
      id,
      season.id,
      input,
      inherited,
      actorPersonId,
    );

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
        questionCount: (questions ?? inherited.questions).length,
        // D47. Recorded because the audience arriving from the template is a
        // decision the club made once, and the audit should say when it was the
        // template speaking rather than an approver choosing.
        templateAudienceGroups: inherited.audienceGroups,
        templateAudienceSize: audienceSize,
      },
    });

    return readEventIn(tx, id);
  });
}

/**
 * D47 — the type's template supplies a default audience, which arrives with the
 * event already set, visible and editable.
 *
 * This reverses LAN-77's shipped "the audience begins empty", and the reversal
 * is narrow and worth stating precisely: what the *system* still never does is
 * imply an audience nobody chose. A default audience is a choice the club made
 * once, deliberately, on the template — so the approver checks it rather than
 * rebuilding the same thirty-two names every Wednesday. ADR 0012's rule that the
 * stored audience is an explicit resolved list is untouched, and is the reason
 * this resolves the groups to people here rather than storing a live query.
 *
 * Returns how many people it wrote, for the audit. Zero when the template names
 * no groups, which is the ordinary case for a type the club has not configured.
 */
async function applyTemplateAudienceIn(
  tx: Tx,
  eventId: string,
  seasonId: string,
  input: EventDraftInput,
  inherited: NewEventInheritance,
  actorPersonId: string,
): Promise<number> {
  if (inherited.audienceGroups.length === 0) return 0;

  const catalogue = await listAudienceCatalogueIn(tx, seasonId, input.scheduledOn);
  const resolution = resolveSelection(
    catalogue.candidates,
    templateAudienceKeys(catalogue.candidates, inherited.audienceGroups),
  );
  // A group that resolves to nobody — a Recruitment template in a season with no
  // prospects yet — is an empty audience, not an error. Approval still refuses
  // it under invariant E1b, which is the right place for that to bite.
  if (!resolution.ok) return 0;

  await tx.query(
    `insert into public.event_audience_members
       (event_id, season_id, capacity, season_membership_id, person_id, added_at,
        added_by_person_id)
     select $1, $2, member.capacity::public.invitation_capacity,
            case when member.capacity = 'player' then member.anchor_id::uuid end,
            case when member.capacity <> 'player' then member.anchor_id::uuid end,
            now(), $5
       from unnest($3::text[], $4::text[]) as member(capacity, anchor_id)`,
    [
      eventId,
      seasonId,
      resolution.members.map((member) => member.capacity),
      resolution.members.map((member) => member.anchorId),
      actorPersonId,
    ],
  );

  return resolution.members.length;
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
  questions?: readonly EventQuestionInput[],
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

    // Only when the caller has something to say about them. `undefined` means
    // "this edit was not about the questions" — a caller that posted no question
    // fields would otherwise silently clear the lot.
    if (questions !== undefined) await writeEventQuestionsIn(tx, eventId, questions);

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
        ...(questions === undefined ? {} : { questionCount: questions.length }),
      },
    });

    return readEventIn(tx, eventId);
  });
}

export const DELETE_REFUSAL_MESSAGE = "Only a draft can be deleted.";

export const DELETE_REFUSAL_RULE = "event_delete_requires_draft";

/**
 * Deletes a draft, permanently — REQ-delete-draft, D29.
 *
 * ## Why deleting is the right verb, and the only one
 *
 * "Withdrawn" used to mean *it never became an event*, and LAN-151 removed the
 * status because that is not a state an event is in — it is an event that should
 * not exist. So an abandoned draft is removed, and a `cancelled` event is
 * something quite different: one that *was* approved, that people were told
 * about, and that was called off. They are not two flavours of one thing.
 *
 * ## Only a draft, and the refusal is where somebody meets it
 *
 * An approved event is cancelled (`W6`), never deleted, because people have been
 * told about it — and by then invitations, RSVPs and attendance hang off it, so
 * deleting it would destroy answers real people gave. The guard is the
 * `and status = 'draft'` below rather than a preceding read, for the same reason
 * every other write in this module guards that way: a read and a delete are two
 * decisions with a gap between them.
 *
 * Brian, 2026-08-21, on where the rule is stated: "That warning should pop up if
 * you try to delete an approved event ... I don't think it needs to be called out
 * there specifically." So the confirmation on a draft says what deleting *that
 * draft* does, and this sentence appears only to somebody who tried it on
 * something else.
 *
 * ## The audit row is written first, and survives
 *
 * `audit_events` is deliberately polymorphic and deliberately not a foreign key,
 * precisely so a record can outlive its subject. Writing it before the delete, in
 * the same transaction, means a rolled-back delete takes the audit row with it
 * and a committed one leaves the only remaining evidence that the event ever
 * existed.
 */
export async function deleteEventDraft(
  actorPersonId: string,
  eventId: string,
): Promise<{ id: string; name: string }> {
  requireActor(actorPersonId);

  return withTransaction(async (tx) => {
    const before = await lockEventIn(tx, eventId);

    if (before.status !== "draft") {
      throw new InvalidTransition(
        `${DELETE_REFUSAL_MESSAGE} ${describeState(before.status)} ${CANCEL_INSTEAD_MESSAGE}`,
        { rule: DELETE_REFUSAL_RULE },
      );
    }

    await recordAudit(tx, {
      actorPersonId,
      action: "event.draft_deleted",
      entityTable: "events",
      entityId: eventId,
      fromState: "draft",
      context: {
        name: before.name,
        eventType: before.eventType,
        scheduledOn: before.scheduledOn,
        // Both are structurally zero on a draft — invariant P1 — and are
        // recorded so the audit row proves it rather than asserting it.
        invitationCount: before.invitationCount,
        audienceCount: before.audienceCount,
      },
    });

    const deleted = await tx.query<{ id: string }>(
      "delete from public.events where id = $1 and status = 'draft' returning id",
      [eventId],
    );

    if (deleted.rowCount === 0) {
      throw new InvalidTransition(
        `${DELETE_REFUSAL_MESSAGE} ${describeState(before.status)} ${CANCEL_INSTEAD_MESSAGE}`,
        { rule: DELETE_REFUSAL_RULE },
      );
    }

    return { id: eventId, name: before.name };
  });
}

/**
 * The half of the refusal that says what to do instead.
 *
 * `docs/ux/standards.md` rule 5 in its general form: a refusal names the route
 * out rather than stating a constraint and stopping. Cancellation is `W6` and is
 * not built yet, so this names the act rather than linking to a screen that does
 * not exist — which is honest, and becomes a link when that work package lands.
 */
export const CANCEL_INSTEAD_MESSAGE =
  "People have been told about it, so it is cancelled rather than deleted.";

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
