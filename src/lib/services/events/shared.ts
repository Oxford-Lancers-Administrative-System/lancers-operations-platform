// Types, columns and helpers read.ts, public-tier.ts and write.ts share. LAN-300 split of events.ts.
import { type EventDeliveryMode, type EventStatus, toMinutePrecision } from "../event-input";

export interface EventListEntry {
  id: string; // one row of the event list — UX-30
  name: string;
  templateId: string; // LAN-265: source template id; templateName is what's rendered
  templateName: string; // read live from the template — a rename is retroactive
  templateColour: string; // template's colour key (LAN-276 R1), read live like templateName
  eventType: string; // public.event_type — closed vocabulary for audience/report rules; never shown
  status: EventStatus;
  scheduledOn: string | null;
  startsAt: string | null;
  endsAt: string | null;
  deliveryMode: EventDeliveryMode;
  venue: string | null; // address in person, destination online (D21)
  isMandatory: boolean;
  registerSaved: boolean; // anything recorded yet (D72); backs isRegisterAvailable
  audienceCount: number; // rows in event_audience_members; zero on every draft
  invitationCount: number; // rows in invitations; structurally zero below approved (P1)
  responseCount: number; // invitations carrying a current answer
  saidYesCount: number; // invitations whose standing answer is yes — intent, not observation
  showedCount: number; // present/late attendance; meaningless without registerSaved (D74)
}

export interface EventDetail extends EventListEntry {
  description: string | null; // event detail — UX-32/UX-33; D18
  requiredEquipment: string | null; // D17
  joiningUrl: string | null; // public since LAN-284 (reversed REQ-no-joining-url)
  origin: string;
  termId: string | null;
  termLabel: string | null;
  weekNumber: number | null;
  createdByName: string | null; // audit trail only, never a permission
  decisionReason: string | null;
  seasonId: string;
}

// Whitelisted columns; an unrecognised sort falls back to DEFAULT_EVENT_SORT.
export const EVENT_SORT_COLUMNS: Readonly<
  Record<string, { sql: string; default: "asc" | "desc" }>
> = Object.freeze({
  date: Object.freeze({ sql: "e.scheduled_on", default: "asc" as const }), // soonest first (D84, LAN-153)
  term: Object.freeze({ sql: "e.scheduled_on", default: "asc" as const }), // REQ-list-shape: same SQL as date
  name: Object.freeze({ sql: "e.name", default: "asc" as const }),
  venue: Object.freeze({ sql: "e.venue", default: "asc" as const }),
  status: Object.freeze({ sql: "e.status", default: "asc" as const }),
  type: Object.freeze({ sql: "lower(tpl.name)", default: "asc" as const }), // by template name (LAN-265), not the enum order
  invited: Object.freeze({ sql: "invitation_count", default: "desc" as const }),
  said_yes: Object.freeze({ sql: "said_yes_count", default: "desc" as const }),
  showed: Object.freeze({ sql: "showed_count", default: "desc" as const }), // sorts by what was recorded; unrecorded sorts with the zeroes
});

export const DEFAULT_EVENT_SORT = "date";

export function orderBy(sort: string | null, direction: string | null): string {
  const column = EVENT_SORT_COLUMNS[sort ?? ""] ?? EVENT_SORT_COLUMNS[DEFAULT_EVENT_SORT];
  const dir = direction === "asc" || direction === "desc" ? direction : column.default;
  return `${column.sql} ${dir === "asc" ? "asc" : "desc"} nulls last, e.created_at desc`; // incomplete events sort last, not first
}

export const TEMPLATE_JOIN = "join public.event_templates tpl on tpl.id = e.template_id"; // inner join is safe: template_id is not-null, on-delete-restrict (LAN-265)

export const TEMPLATE_COLUMNS = // colour_key public since LAN-276 R1
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

export const EVENT_NOT_FOUND_MESSAGE = "That event no longer exists."; // says only "gone" — readEventIn does not check season membership
