import "server-only";

import { NotFound, withTransaction, type Tx } from "@/lib/db";
import {
  OCCURRED_FILTER,
  optional,
  UUID_PATTERN,
  type EventDeliveryMode,
  type EventStatus,
} from "../event-input";
import { readEventQuestionsIn, type EventQuestion } from "../event-questions";
import { SHOWED_PRESENCES } from "../attendance-vocabulary";
import { requireEventOperatorTier } from "@/lib/auth/event-tier";
import { readCurrentSeasonIn, type Season } from "../seasons";
import { safeUri } from "../safe-uri";
import { escapeLikePattern, personDisplayNameSql } from "../sql-text";
import { todayInClubZone } from "@/lib/club-time";
import {
  asDate,
  asTime,
  EVENT_NOT_FOUND_MESSAGE,
  orderBy,
  TEMPLATE_COLUMNS,
  TEMPLATE_JOIN,
  type EventDetail,
  type EventListEntry,
} from "./shared";

/**
 * The operator tier's reads — the season list (LAN-153's `REQ-three-tiers`
 * guard), one event, and the row lock `lockEventIn` documents. LAN-300 split
 * of `events.ts`; see `./index`.
 */

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
  /**
   * A template id, or `null` for all — LAN-265.
   *
   * The filter used to be an `event_type`, when the type was the template and
   * the seven values were the seven things an operator could think of. It
   * selects by template now for the same reason the column shows a template's
   * name: the operator picks the word they see, and two templates may share a
   * class. An id that matches no template matches no rows, which is what an
   * unknown filter should do.
   */
  templateId?: string | null;
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
  template_id: string;
  template_name: string;
  template_colour: string;
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

function toListEntry(row: EventRow): EventListEntry {
  return {
    id: row.id,
    name: row.name,
    templateId: row.template_id,
    templateName: row.template_name,
    templateColour: row.template_colour,
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
    const templateId = optional(filters.templateId);
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
      `select e.id, e.name, ${TEMPLATE_COLUMNS}, e.event_type::text as event_type,
              e.status::text as status,
              e.scheduled_on, e.starts_at::text as starts_at, e.ends_at::text as ends_at,
              e.delivery_mode::text as delivery_mode, e.venue, e.is_mandatory,
              ${COUNT_COLUMNS}
         from public.events e
         ${TEMPLATE_JOIN}
         ${participationJoins("p.season_id = $1")}
        where e.season_id = $1
          and ($2::text is null or e.name ilike '%' || $2 || '%'
                                or coalesce(e.venue, '') ilike '%' || $2 || '%')
          and ($3::text is null
                or case
                     when e.status = 'approved' and e.scheduled_on < $6::date then $5
                     else e.status::text
                   end = $3)
          -- Compared as text, not cast to uuid: the value arrives in a query
          -- string, and a hand-typed ?template=chalk must match nothing rather
          -- than raise an invalid-input error the list has no way to render.
          and ($4::text is null or e.template_id::text = $4)
        order by ${orderBy(optional(filters.sort), optional(filters.direction))}`,
      [season.id, search, status, templateId, OCCURRED_FILTER, today],
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
    `select e.id, e.name, ${TEMPLATE_COLUMNS}, e.event_type::text as event_type,
            e.status::text as status,
            e.scheduled_on, e.starts_at::text as starts_at, e.ends_at::text as ends_at,
            e.delivery_mode::text as delivery_mode, e.venue, e.is_mandatory,
            e.description, e.required_equipment, e.joining_url, e.origin::text as origin,
            e.term_id, term.name::text as term_name, term.academic_year as term_academic_year,
            e.week_number, e.decision_reason, e.season_id,
            ${personDisplayNameSql("o")} as created_by_name,
            ${COUNT_COLUMNS}
       from public.events e
       ${TEMPLATE_JOIN}
       left join public.terms term on term.id = e.term_id
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
    joiningUrl: safeUri(row.joining_url),
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
