/**
 * Types, columns and helpers `read.ts`, `public-tier.ts` and `write.ts` all
 * need. LAN-300 split of `events.ts`; see `index.ts` for the module's own
 * header.
 */
import { type EventDeliveryMode, type EventStatus, toMinutePrecision } from "../event-input";

/** One row of the event list — UX-30. */
export interface EventListEntry {
  id: string;
  name: string;
  /**
   * The template this event was created from — LAN-265.
   *
   * Carried on every entry because it is what the Template filter selects by and
   * what the event page links to. Never rendered: `templateName` is.
   */
  templateId: string;
  /**
   * What the club calls this kind of event, read from the template.
   *
   * The single source of the word, everywhere — this list, the event page, the
   * public calendar, the ICS feed, the RSVP page and the Monday report. Read at
   * render time from the template rather than stored on the event, which is what
   * makes a rename retroactive: rename "Chalk" to "Film Review" and last term's
   * sessions read "Film Review", with no row in `events` rewritten (Brian,
   * 2026-09-09).
   */
  templateName: string;
  /**
   * The template's own colour — LAN-276 correction round 1. A key into
   * `TEMPLATE_COLOUR_PALETTE`, read from the template exactly as
   * `templateName` is, and for the same reason: the calendar and every event
   * list colour a tile by the template rather than by its class, so a rename
   * or a colour change reaches every past and future event of it with no row
   * in `events` rewritten.
   */
  templateColour: string;
  /**
   * The behavioural class, `public.event_type`.
   *
   * Kept on the entry because a handful of rules genuinely need a closed
   * vocabulary — the recruitment audience, the Monday report's buckets, coach
   * attendance — and none of them can key off a name an operator may change.
   * Never shown to anybody: the word a reader sees is `templateName`.
   */
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
   * The online event's link. Published — LAN-284 reversed REQ-no-joining-url —
   * so `PublicEventDetail` and the subscription feed carry it too. This is the
   * operator's own copy, shown with the warning that it is public.
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
  /**
   * By the template's **name**, since LAN-265, and no longer by the enum's own
   * declared order.
   *
   * The column reads "Chalk" or "Kicking Clinic", and a sort that ordered by
   * `e.event_type` would now group a club's own templates by a class nobody is
   * shown — every operator-created template sitting together under `practice`,
   * in an order the screen gives no account of. Sorting by what the column
   * prints is the only ordering a reader can check.
   */
  type: Object.freeze({ sql: "lower(tpl.name)", default: "asc" as const }),
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
export function orderBy(sort: string | null, direction: string | null): string {
  const column = EVENT_SORT_COLUMNS[sort ?? ""] ?? EVENT_SORT_COLUMNS[DEFAULT_EVENT_SORT];
  const dir = direction === "asc" || direction === "desc" ? direction : column.default;
  // `nulls last` on both directions: an event with no date yet, or no venue, is
  // incomplete rather than earliest, and burying it at the top of a descending
  // list would put the least finished events in front of the operator first.
  return `${column.sql} ${dir === "asc" ? "asc" : "desc"} nulls last, e.created_at desc`;
}

/**
 * The template join every event read carries — LAN-265.
 *
 * An inner join, and safe as one: `events.template_id` is `not null` and
 * `events_template_fkey` is `on delete restrict`, so an event without a template
 * row cannot exist. Written once here because eight queries need the name and a
 * ninth written by hand would be the surface that quietly kept showing the old
 * word after a rename.
 */
export const TEMPLATE_JOIN = "join public.event_templates tpl on tpl.id = e.template_id";

/**
 * The template columns every projection selects, public tier included.
 *
 * `colour_key` joined LAN-276 correction round 1: the calendar and every
 * event list colour a tile by the template's own colour now, not by
 * `event_type`, and it is exactly as public as `template_name` — a colour
 * says nothing about anybody.
 */
export const TEMPLATE_COLUMNS =
  "e.template_id, tpl.name as template_name, tpl.colour_key as template_colour";

export function asDate(value: Date | string | null): string | null {
  if (value === null) return null;
  if (typeof value === "string") return value.slice(0, 10);
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function asTime(value: string | null): string | null {
  return value === null ? null : toMinutePrecision(value);
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
