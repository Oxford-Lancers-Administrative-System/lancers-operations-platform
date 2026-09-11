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

/**
 * The public event tier — LAN-153, `REQ-public-calendar`. No session, no
 * count, no status; `isCancelled` is the one bit a cancelled event keeps
 * visible (D57, correction C1). LAN-300 split of `events.ts`; see `./index`.
 */

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
  /** LAN-265. What the public filter and the type legend select by. */
  templateId: string;
  /** The word a reader sees for this kind of event. See `EventListEntry`. */
  templateName: string;
  /** The template's own colour. See `EventListEntry.templateColour`. */
  templateColour: string;
  /**
   * The behavioural class. Public because it always was — a handful of rules
   * still key off it — and because it says nothing about anybody. The
   * calendar colours its tiles by `templateColour` now (LAN-276 correction
   * round 1); the word beside the colour is `templateName`.
   */
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
  /**
   * The online event's link, published — LAN-284, reversing the never-public
   * rule (Brian, 2026-09-09). `null` on an in-person event, which the schema
   * guarantees: `events_joining_url_is_for_online_events`.
   *
   * On the **detail** and in the feed only. The public *list* has no column for
   * it and does not want one — a list row says what and where, and a page of
   * thirty join links is not a calendar.
   */
  joiningUrl: string | null;
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
 * `joining_url` **is** among them, and that reverses what this comment used to
 * say — LAN-284, Brian, 2026-09-09. The calendar stays public: there is no
 * password gate on `/calendar`, no token on the feed, and no change to the
 * three access tiers. The protection moved to where it can actually work,
 * which is the meeting itself — a Teams meeting requires its passcode, shared
 * privately, on top of the Oxford-domain approval — so publishing the link is
 * safe because the link alone admits nobody. Stated once because it is the
 * accepted cost: nothing in this application can verify that a given meeting
 * has a passcode set, so an operator who publishes an open meeting publishes it
 * to the world. The control is operator discipline, and the editor warns them.
 *
 * Every participation table in `PARTICIPATION_TABLES` is still absent, which is
 * `REQ-public-calendar`'s "a public event page renders without touching
 * participation data at all" — not hidden after loading, never read. The public
 * tier gained exactly one column and no other boundary moved.
 *
 * `TEMPLATE_COLUMNS` folded in `tpl.colour_key` for LAN-276 correction round 1,
 * which reaches here too: a template's colour is exactly as public as its
 * name, and the public calendar has always coloured its tiles.
 */
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

/** What the public tier may narrow the list by. No status: it has none to show. */
export interface PublicEventListFilters {
  /** Free text over name and venue. */
  search?: string | null;
  /** A template id, or `null` for all — LAN-265, as on the operator's list. */
  templateId?: string | null;
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
      // The public tier never hands a reader a value it could not publish.
      joiningUrl: safeUri(row.joining_url),
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
  /**
   * The online event's link — LAN-284. Same value `readPublicEvent` returns,
   * and the feed carries it for the same reason it carries the other two: the
   * subscriber should not have to tap through to the page for a detail the page
   * publishes. `calendar-feed.ts` puts it in `URL`, never in `DESCRIPTION`.
   */
  joiningUrl: string | null;
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
 * has always returned. `joining_url` joined them under LAN-284 (Brian,
 * 2026-09-09), reversing "never will be"; nothing from `PARTICIPATION_TABLES`
 * ever does.
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
