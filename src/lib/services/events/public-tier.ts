import "server-only";

import { NotFound, withTransaction } from "@/lib/db";
import { optional, UUID_PATTERN, type EventDeliveryMode } from "../event-input";
import { readCurrentSeasonIn, type Season } from "../seasons";
import { safeUri } from "../safe-uri";
import { escapeLikePattern } from "../sql-text";
import {
  asDate,
  asTime,
  DEFAULT_EVENT_SORT,
  EVENT_NOT_FOUND_MESSAGE,
  orderBy,
  TEMPLATE_COLUMNS,
  TEMPLATE_JOIN,
} from "./shared";

// The public event tier — LAN-153, REQ-public-calendar (LAN-300 split of events.ts; see ./index).
// No session, no count, no status.

// One row of the **public** event list. What is absent is the point: no joiningUrl, no status, no
// count, no registerSaved. isCancelled is not a status — see relocations.md.
export interface PublicEventListEntry {
  id: string;
  name: string;
  templateId: string; // LAN-265: what the public filter and the type legend select by
  templateName: string; // the word a reader sees — see EventListEntry
  templateColour: string; // the template's own colour — see EventListEntry.templateColour
  eventType: string; // public because it always was; a handful of rules still key off it (LAN-276 R1)
  scheduledOn: string | null;
  startsAt: string | null;
  endsAt: string | null;
  deliveryMode: EventDeliveryMode;
  venue: string | null; // an address in person; online events say "Online" and stop there
  isMandatory: boolean;
  isCancelled: boolean; // D57, correction C1 — one bit, not the status column
}

export interface PublicEventDetail extends PublicEventListEntry {
  description: string | null; // D18
  requiredEquipment: string | null; // D17
  joiningUrl: string | null; // published (LAN-284); null on an in-person event; detail and feed only — see relocations.md
}

export interface PublicEventList {
  season: Season;
  events: PublicEventListEntry[];
  totalInSeason: number; // events in the season before any filter — tells the two empty states apart
}

// Every column the public tier reads, and there are no others (exported so a test can assert on
// it). PARTICIPATION_TABLES stays absent (REQ-public-calendar). See relocations.md.
export const PUBLIC_EVENT_COLUMNS = `e.id, e.name, ${TEMPLATE_COLUMNS},
            e.event_type::text as event_type,
            e.scheduled_on, e.starts_at::text as starts_at, e.ends_at::text as ends_at,
            e.delivery_mode::text as delivery_mode, e.venue, e.is_mandatory,
            e.joining_url,
            (e.status = 'cancelled') as is_cancelled`;

interface PublicEventRow {
  id: string;
  name: string;
  template_id: string;
  template_name: string;
  template_colour: string;
  event_type: string;
  scheduled_on: Date | string | null;
  starts_at: string | null;
  ends_at: string | null;
  delivery_mode: EventDeliveryMode;
  venue: string | null;
  is_mandatory: boolean;
  joining_url: string | null;
  is_cancelled: boolean;
}

function toPublicEntry(row: PublicEventRow): PublicEventListEntry {
  return {
    id: row.id,
    name: row.name,
    templateId: row.template_id,
    templateName: row.template_name,
    templateColour: row.template_colour,
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

export interface PublicEventListFilters {
  search?: string | null; // free text over name and venue
  templateId?: string | null; // a template id, or null for all — LAN-265
  sort?: string | null; // one of EVENT_SORT_COLUMNS that the public tier offers
  direction?: string | null;
}

// The columns the public list may be sorted by — REQ-list-shape's public row.
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

// The open season's events, at the public tier — no session, no token, no cookie, no write
// (REQ-public-calendar). D5: every event is here, drafts included — narrowed in what it says, not which events it shows.
export async function listPublicSeasonEvents(
  filters: PublicEventListFilters = {},
): Promise<PublicEventList> {
  return withTransaction(async (tx) => {
    const season = await readCurrentSeasonIn(tx);

    const search = escapeLikePattern(optional(filters.search));
    const templateId = optional(filters.templateId);

    const result = await tx.query<PublicEventRow>(
      `select ${PUBLIC_EVENT_COLUMNS}
         from public.events e
         ${TEMPLATE_JOIN}
        where e.season_id = $1
          and ($2::text is null or e.name ilike '%' || $2 || '%'
                                or coalesce(e.venue, '') ilike '%' || $2 || '%')
          and ($3::text is null or e.template_id::text = $3)
        order by ${publicOrderBy(optional(filters.sort), optional(filters.direction))}`,
      [season.id, search, templateId],
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

// One event, at the public tier — scoped to the open season, unlike readEventIn (REQ-one-open-season).
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
         ${TEMPLATE_JOIN}
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
      joiningUrl: safeUri(row.joining_url), // never hands a reader a value it could not publish
    };
  });
}

// One public event row plus description/required_equipment (Q-29) and updated_at (LAN-158, W2) — the whole of what /calendar/feed.ics reads.
export interface FeedEventEntry extends PublicEventListEntry {
  description: string | null; // D18, Q-29
  requiredEquipment: string | null; // D17, Q-29
  joiningUrl: string | null; // LAN-284 — same value readPublicEvent returns
  updatedAt: string; // ISO 8601 instant
}

/** `Date` from the driver, or the string PostgreSQL sent — either becomes ISO. */
function toIsoInstant(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

// Every event in the open season, unfiltered and unpaginated, at the public tier plus its revision
// clock (LAN-158, W2). No search/type/sort — a feed has no reader to filter for. See relocations.md.
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
         ${TEMPLATE_JOIN}
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
        joiningUrl: safeUri(row.joining_url),
        updatedAt: toIsoInstant(row.updated_at),
      })),
    };
  });
}
