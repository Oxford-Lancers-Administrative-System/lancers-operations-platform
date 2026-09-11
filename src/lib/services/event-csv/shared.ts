import {
  EVENT_TYPES,
  trimmed,
  type EventDeliveryMode,
  type EventDraftInput,
  type EventStatus,
} from "../event-input";

// The column set, the template vocabulary, and the plan's shared shapes — LAN-155, LAN-265.
// Decision history: docs/ux/tickets/LAN-155-csv-import.md.

/** The columns an import reads, in the order the template writes them. */
export const IMPORT_COLUMNS = [
  "id",
  "name",
  "type",
  "date",
  "start",
  "end",
  "online",
  "venue",
  "description",
  "required_equipment",
  "mandatory",
] as const;

export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

const READ_ONLY_EXPORT_COLUMNS = ["status", "term_week"] as const; // read-only: an import makes drafts and derives the term from the date

/** The export is the import template, populated. There is no second format. */
export const EXPORT_COLUMNS: readonly string[] = Object.freeze([
  ...IMPORT_COLUMNS,
  ...READ_ONLY_EXPORT_COLUMNS,
]);

// Not all eleven — an absent column is read as blank, which already means "leave it alone".
export const REQUIRED_HEADER_COLUMNS: readonly ImportColumn[] = Object.freeze([
  "id",
  "name",
  "type",
  "date",
]);

// Delegated dialect limits (Mission Lead delegation). Both refuse the file whole, before any row
// is read — the confirmation screen holds the file's text while the operator reads it.
export const MAX_IMPORT_BYTES = 1_048_576;
export const MAX_IMPORT_ROWS = 2_000;

const CSV_TYPE_TOKENS: Readonly<Record<string, string>> = Object.freeze({
  practice: "Practice",
  strength_and_conditioning: "S&C",
  chalk: "Chalk",
  game: "Game",
  social: "Social",
  recruitment: "Recruitment",
  meeting: "Meeting",
});

const TYPE_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  practice: "practice",
  "s&c": "strength_and_conditioning",
  sc: "strength_and_conditioning",
  "s and c": "strength_and_conditioning",
  "s+c": "strength_and_conditioning",
  "strength and conditioning": "strength_and_conditioning",
  strength_and_conditioning: "strength_and_conditioning",
  chalk: "chalk",
  game: "game",
  social: "social",
  recruitment: "recruitment",
  meeting: "meeting",
});

function normaliseTypeToken(value: string): string {
  return trimmed(value).toLowerCase().replace(/\s+/g, " ");
}

/** A template the file's `type` column may name — LAN-265. */
export interface ImportableTemplate {
  id: string;
  name: string;
  eventType: string;
}

// Two passes: by name (LAN-265's per-template vocabulary), then by class token (Brian's W3
// vocabulary). Name wins when both match. null where the cell matches neither.
export function resolveTemplate(
  token: string,
  templates: readonly ImportableTemplate[],
): ImportableTemplate | null {
  const key = normaliseTypeToken(token);
  if (key === "") return null;

  const byName = templates.find((template) => normaliseTypeToken(template.name) === key);
  if (byName) return byName;

  const eventType = TYPE_ALIASES[key];
  if (!eventType) return null;
  return templates.find((template) => template.eventType === eventType) ?? null;
}

export const TYPE_TOKEN_LIST = EVENT_TYPES.map((type) => CSV_TYPE_TOKENS[type]).join(", ");

/** What a `type` cell may say, in the words a refusal uses. */
export const TYPE_CELL_EXPECTATION = `It must be one of your template names, or one of ${TYPE_TOKEN_LIST}.`;

export const YES = new Set(["yes", "y", "true", "1"]);
export const NO = new Set(["no", "n", "false", "0"]);

export interface ImportableEvent {
  id: string;
  name: string;
  templateId: string; // LAN-265: what the row is compared and rewritten against
  templateName: string; // the word the type column prints and the file may name it by
  eventType: string;
  status: EventStatus;
  scheduledOn: string | null;
  startsAt: string | null;
  endsAt: string | null;
  deliveryMode: EventDeliveryMode;
  venue: string | null;
  description: string | null;
  requiredEquipment: string | null;
  joiningUrl: string | null; // never a column; read so an online-to-in-person row can be refused, carried through updates untouched
  isMandatory: boolean;
}

export type RowOutcome = "new" | "updated" | "unchanged" | "refused";

/** One field an update row changes, named as the file names it. */
export interface FieldChange {
  column: ImportColumn;
  from: string;
  to: string;
}

/** One cell as the confirmation renders it: the value, and what it replaces. */
export interface PlanCell {
  value: string;
  previous: string | null; // the value being replaced, on a changed cell only
}

export interface PlannedRow {
  line: number; // the line in the file, counting the header as line 1
  outcome: RowOutcome;
  name: string; // what to call the row: the event's name, or the file's
  eventId: string | null; // the event this row matched, when it matched one
  status: string; // "Draft", "Approved", "Cancelled", or "—" for a row that matched nothing
  cells: Readonly<Record<ImportColumn, PlanCell>>;
  changes: readonly FieldChange[];
  reasons: readonly string[]; // why the row was refused; empty for every other outcome
  write: PlannedWrite | null; // what applying this row does; null for unchanged and refused rows
}

export type PlannedWrite =
  | { kind: "create"; input: EventDraftInput }
  | { kind: "update"; eventId: string; input: EventDraftInput };

interface ImportTotals {
  new: number;
  updated: number;
  unchanged: number;
  refused: number;
}

export interface ImportPlan {
  fileName: string | null;
  rowCount: number;
  totals: ImportTotals;
  rows: readonly PlannedRow[];
  applicableCount: number; // new plus updated — what the Apply button counts
  digest: string; // fingerprint of what applying would write; event-import.ts refuses if it no longer matches (see relocations.md)
}

/** The totals an applied import produced, as the screen reports them. */
export interface ImportApplied {
  created: number;
  updated: number;
  unchanged: number;
  refused: number;
}

export type ImportPlanResult = { ok: true; plan: ImportPlan } | { ok: false; reason: string }; // the file is refused whole, before any row is read

export interface PlanImportOptions {
  csvText: string;
  fileName?: string | null;
  events: readonly ImportableEvent[]; // every event in the open season, cancelled ones included
  templates: readonly ImportableTemplate[]; // every template the club has (LAN-265)
}
