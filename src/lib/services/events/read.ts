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

/** The operator tier's reads — the season list (LAN-153's `REQ-three-tiers` guard), one event, and the row lock `lockEventIn` documents. LAN-300 split of `events.ts`; see `./index`. */

export interface EventListFilters {
  /** Free text over name and venue. */
  search?: string | null;
  /** One of `EVENT_STATUS_FILTERS`, or `null` for all. `occurred` is derived, never stored (D30). */
  status?: string | null;
  /** A template id, or `null` for all (LAN-265); an unmatched id matches no rows. Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE */
  templateId?: string | null;
  /** One of `EVENT_SORT_COLUMNS`. Anything else falls back to the date. */
  sort?: string | null;
  /** `"asc"` or `"desc"`. Anything else falls back to the column's default. */
  direction?: string | null;
  /** Today in the club's zone, `YYYY-MM-DD`; defaults to the real one (kept a parameter so the derived filter is testable). */
  today?: string;
}

export interface EventList {
  season: Season;
  events: EventListEntry[];
  /** Events in the season before any filter was applied. */
  totalInSeason: number;
}

/** `'present', 'late'` — the presences counting as showed up, from `SHOWED_PRESENCES`. Interpolated (a frozen literal array, never caller text), not parameterised, since it's spliced into two differently-numbered queries. */
const SHOWED_PRESENCE_LITERALS = SHOWED_PRESENCES.map((presence) => `'${presence}'`).join(", ");

/** The participation counts — operator tier only, named beside `participationJoins()` so `PARTICIPATION_TABLES` catches a new one. `coalesce`d since the joins are outer. */
const COUNT_COLUMNS = `
  coalesce(audience.audience_count, 0) as audience_count,
  coalesce(invited.invitation_count, 0) as invitation_count,
  coalesce(invited.response_count, 0) as response_count,
  coalesce(invited.said_yes_count, 0) as said_yes_count,
  coalesce(attended.showed_count, 0) as showed_count,
  coalesce(attended.register_saved, false) as register_saved`;

/** The three grouped reads those counts come from, joined to `e` once (LAN-228). `scope` is the caller's own required `where` — season list passes the season, single-event read passes the event; alias is `p`. Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE */
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

/** The tables the public tier must never read from; the `PUBLIC_EVENT_COLUMNS` test checks against this list. */
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

/** The current season's events, newest first, optionally filtered; `totalInSeason` lets a screen tell "no events yet" from "your filter matched none". */
export async function listCurrentSeasonEvents(filters: EventListFilters = {}): Promise<EventList> {
  return withTransaction(async (tx) => {
    const season = await readCurrentSeasonIn(tx);

    // `%`/`_` are LIKE syntax; escaped so a typed one means the literal character.
    const search = escapeLikePattern(optional(filters.search));
    const status = optional(filters.status);
    const templateId = optional(filters.templateId);
    const today = filters.today ?? todayInClubZone();

    // Q-6: selects the derived column's word (mirrors statusLabel), not raw e.status; today is a
    // parameter, not current_date. Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE
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

/** The same list, behind the operator tier's own guard (LAN-153, `REQ-three-tiers`) — the third of three independent refusals, not a replacement for `/operate`'s gate or the layout check. Floor: LAN-76's linked, active operator. */
export async function listEventsForOperator(filters: EventListFilters = {}): Promise<EventList> {
  await requireEventOperatorTier();
  return listCurrentSeasonEvents(filters);
}

/** The questions this event asks, in order. A read of its own rather than a field on `EventDetail`, since the list screen never shows one. */
export async function readEventQuestions(eventId: string): Promise<EventQuestion[]> {
  return withTransaction(async (tx) => readEventQuestionsIn(tx, eventId));
}

/** One event, with everything the detail screen states as fact. */
export async function readEvent(eventId: string): Promise<EventDetail> {
  return withTransaction(async (tx) => readEventIn(tx, eventId));
}

/** Event read under a row lock (`select … for update`) held to transaction end, closing a read-then-write race plain READ COMMITTED does not. Every writer takes this lock first; returns the event read after the lock. Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE */
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

/** The same read inside a caller's transaction — exported for `./event-approval`. Takes no lock; a caller that will write based on what it reads wants `lockEventIn` instead. */
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
