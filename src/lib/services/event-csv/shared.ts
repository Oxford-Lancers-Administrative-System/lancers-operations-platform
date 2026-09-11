import {
  EVENT_TYPES,
  trimmed,
  type EventDeliveryMode,
  type EventDraftInput,
  type EventStatus,
} from "../event-input";

/**
 * The column set, the template vocabulary, and the plan's shared shapes —
 * LAN-155, LAN-265. Decision history: docs/ux/tickets/LAN-155-csv-import.md.
 */

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

/**
 * The two the export adds and the import ignores.
 *
 * `status` so the operator can see what they are editing, and `term_week` so
 * they can orient themselves against the term card they are working from.
 * Both are read-only: an import makes drafts and derives the term from the
 * date, so neither is the operator's to set.
 */
const READ_ONLY_EXPORT_COLUMNS = ["status", "term_week"] as const;

/** The export is the import template, populated. There is no second format. */
export const EXPORT_COLUMNS: readonly string[] = Object.freeze([
  ...IMPORT_COLUMNS,
  ...READ_ONLY_EXPORT_COLUMNS,
]);

/**
 * What the header must name for the file to be one this importer reads.
 *
 * Not all eleven, deliberately — an absent column is read as blank, and blank
 * already means "leave it alone". These four are the ones without which a
 * row has no meaning: `id` decides create-or-update, and a new row is
 * nothing without a name, a type and a date to place it on.
 */
export const REQUIRED_HEADER_COLUMNS: readonly ImportColumn[] = Object.freeze([
  "id",
  "name",
  "type",
  "date",
]);

/**
 * The delegated dialect limits (Mission Lead delegation: "exact CSV dialect,
 * encoding, delimiter and size limits"). Both limits refuse the file **whole
 * and before any row is read**: the confirmation screen holds the file's
 * text in the form while the operator reads it, and an unbounded file would
 * be echoed back through the browser.
 */
export const MAX_IMPORT_BYTES = 1_048_576;
export const MAX_IMPORT_ROWS = 2_000;

/**
 * The seven types, in the words the file uses — Brian's own list from `W3`.
 * Deliberately not `TYPE_LABELS`, which is the club's word for a *screen*.
 */
const CSV_TYPE_TOKENS: Readonly<Record<string, string>> = Object.freeze({
  practice: "Practice",
  strength_and_conditioning: "S&C",
  chalk: "Chalk",
  game: "Game",
  social: "Social",
  recruitment: "Recruitment",
  meeting: "Meeting",
});

/** Every spelling of a type this importer accepts, normalised. */
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

/** One spelling of a name or a token, compared the way a person would. */
function normaliseTypeToken(value: string): string {
  return trimmed(value).toLowerCase().replace(/\s+/g, " ");
}

/**
 * A template the file's `type` column may name — LAN-265.
 *
 * `eventType` is still here as the second pass: a club that renamed "Chalk"
 * to "Film Review" has a file somewhere that still says `Chalk`, and that
 * file should go on meaning the template it always meant.
 */
export interface ImportableTemplate {
  id: string;
  name: string;
  eventType: string;
}

/**
 * The template a `type` cell names — LAN-265.
 *
 * Two passes, in this order: **by name** (what an operator can actually
 * write after LAN-265's per-template vocabulary), then **by class token**
 * (`Practice`, `S&C`, … — Brian's own `W3` vocabulary, still accepted so a
 * file written last term still imports after a rename). Name first, so a
 * template actually called "Practice" wins over the class token that
 * happens to spell the same word. `null` where the cell matches neither.
 */
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

/**
 * The seven shipped tokens, as the refusal sentence and the prompt list them.
 * Decision history: docs/ux/tickets/LAN-155-csv-import.md.
 */
export const TYPE_TOKEN_LIST = EVENT_TYPES.map((type) => CSV_TYPE_TOKENS[type]).join(", ");

/** What a `type` cell may say, in the words a refusal uses. */
export const TYPE_CELL_EXPECTATION = `It must be one of your template names, or one of ${TYPE_TOKEN_LIST}.`;

/** `yes` and `no`, and the spellings a spreadsheet substitutes for them. */
export const YES = new Set(["yes", "y", "true", "1"]);
export const NO = new Set(["no", "n", "false", "0"]);

export interface ImportableEvent {
  id: string;
  name: string;
  /** LAN-265. What the row is compared and rewritten against. */
  templateId: string;
  /** The word the `type` column prints and the file may name it by. */
  templateName: string;
  eventType: string;
  status: EventStatus;
  scheduledOn: string | null;
  startsAt: string | null;
  endsAt: string | null;
  deliveryMode: EventDeliveryMode;
  venue: string | null;
  description: string | null;
  requiredEquipment: string | null;
  /**
   * Never a column: read so a row turning an online event in person can be
   * refused, and carried through an update untouched.
   */
  joiningUrl: string | null;
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
  /** The value being replaced, on a changed cell only. */
  previous: string | null;
}

export interface PlannedRow {
  /** The line in the file, counting the header as line 1. */
  line: number;
  outcome: RowOutcome;
  /** What to call the row: the event's name, or the file's. */
  name: string;
  /** The event this row matched, when it matched one. */
  eventId: string | null;
  /** "Draft", "Approved", "Cancelled", or "—" for a row that matched nothing. */
  status: string;
  cells: Readonly<Record<ImportColumn, PlanCell>>;
  changes: readonly FieldChange[];
  /** Why the row was refused. Empty for every other outcome. */
  reasons: readonly string[];
  /** What applying this row does. `null` for unchanged and refused rows. */
  write: PlannedWrite | null;
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
  /** New plus updated — what the Apply button counts. */
  applicableCount: number;
  /**
   * A fingerprint of exactly what applying would write.
   *
   * The confirmation is a proposal computed at one moment and applied at
   * another, and the season can move in between. `./event-import.ts`
   * recomputes the plan inside the apply transaction and refuses when this
   * no longer matches, so what is written is always what the operator read.
   */
  digest: string;
}

/** The totals an applied import produced, as the screen reports them. */
export interface ImportApplied {
  created: number;
  updated: number;
  unchanged: number;
  refused: number;
}

export type ImportPlanResult =
  | { ok: true; plan: ImportPlan }
  /** The file is refused whole, before any row is read. */
  | { ok: false; reason: string };

export interface PlanImportOptions {
  csvText: string;
  fileName?: string | null;
  /** Every event in the open season, cancelled ones included. */
  events: readonly ImportableEvent[];
  /** Every template the club has — what the `type` column may name (LAN-265). */
  templates: readonly ImportableTemplate[];
}
