import { BAND_COLOURS } from "@/components/section";
import { roleCodesPermit } from "@/lib/auth/capabilities";
import { allowedItemStates } from "@/lib/services/onboarding-item-shapes";
import type { PositionOptions, RosterBoardRow } from "@/lib/services/roster-board";
import { MEMBERSHIP_STATUS_LABELS } from "./presentation";

// The board's column model — LAN-186. Every column is one entry here, driving
// banding, pinning, sorting, filtering, edit-in-place and routing — never a
// `<TableCell>` copied around the file. Each carries a `requires` capability
// (REQ-authority) so `visibleColumns()` can narrow later without a rewrite.
// Decision history: docs/ux/tickets/LAN-186-roster-board.md · missions/intake/M-PEOPLE-AND-ROSTER/decision-history.md · docs/ux/tickets/LAN-217-operator-record.md.

export type Band = "person" | "onboarding" | "season";

export interface BandDef {
  readonly key: Band;
  readonly label: string;
  readonly header: string;
  readonly tint: string;
  readonly solid: string;
}

export const BAND_ROW_HEIGHT = 28;

/** The left inset every band header's label sits at — one rule, explicit rather than per-band. Decision history: docs/ux/tickets/LAN-186-roster-board.md · missions/intake/M-PEOPLE-AND-ROSTER/decision-history.md · docs/ux/tickets/LAN-217-operator-record.md. */
export const BAND_LABEL_INSET_PX = 16;

const BANDS: readonly BandDef[] = Object.freeze([
  Object.freeze({
    key: "person" as const,
    label: "Person",
    ...BAND_COLOURS.person,
  }),
  Object.freeze({
    key: "onboarding" as const,
    label: "Onboarding",
    ...BAND_COLOURS.onboarding,
  }),
  Object.freeze({
    key: "season" as const,
    label: "Season",
    ...BAND_COLOURS.season,
  }),
]);

export function bandOf(key: Band): BandDef {
  const found = BANDS.find((band) => band.key === key);
  if (!found) throw new Error(`Unknown band: ${key}`);
  return found;
}

// `record` routes to the person record; `select`/`multiselect`/`jersey` edit
// in the cell; `none` is derived elsewhere; `onboarding` is one of the seven
// operator-ticked items (LAN-217), via `allowedItemStates(itemCode)`.
// Decision history: docs/ux/tickets/LAN-186-roster-board.md · missions/intake/M-PEOPLE-AND-ROSTER/decision-history.md · docs/ux/tickets/LAN-217-operator-record.md.
type EditKind = "none" | "record" | "select" | "multiselect" | "jersey" | "onboarding";

export interface ColumnDef {
  readonly key: string;
  readonly label: string;
  readonly band: Band;
  readonly edit: EditKind;
  readonly options?: readonly string[];
  readonly optionLabels?: Readonly<Record<string, string>>;
  readonly kit?: "blue" | "white";
  /** `edit: "onboarding"` only — the `onboarding_item_types.code` this column edits, keying `row.onboardingItems`. */
  readonly itemCode?: string;
  readonly width: number;
  readonly sortable: boolean;
  readonly filterable: boolean;
  /** The capability a viewer must hold for this column to render at all. */
  readonly requires: "person_record_authority";
}

export const STATUSES = Object.freeze(["onboarding", "active", "inactive", "departed", "archived"]);
/** The same words `presentation.ts` fixes for the rest of the roster — one wording everywhere. */
export const STATUS_OPTION_LABELS: Readonly<Record<string, string>> = MEMBERSHIP_STATUS_LABELS;
export const ENTRIES = Object.freeze(["new", "returning"]);
export const COACH_GROUPS = Object.freeze(["Offense", "Defense", "Special teams"]);
export const FORMALWEAR_ITEMS = Object.freeze(["tie", "bowtie", "socks"] as const);
export const FORMALWEAR_LABELS: Readonly<Record<string, string>> = Object.freeze({
  tie: "Tie",
  bowtie: "Bowtie",
  socks: "Socks",
});
export const BLUES_VALUES = Object.freeze(["Full", "Half", "None"]);
export const ELIGIBILITY_VALUES = Object.freeze(["eligible", "pending", "ineligible", "expired"]);
export const ELIGIBILITY_LABELS: Readonly<Record<string, string>> = Object.freeze({
  eligible: "Eligible",
  pending: "Pending",
  ineligible: "Ineligible",
  expired: "Expired",
});
export const AVAILABILITY_VALUES = Object.freeze(["green", "orange", "red"]);
export const AVAILABILITY_LABELS: Readonly<Record<string, string>> = Object.freeze({
  green: "Green",
  orange: "Orange",
  red: "Red",
});
/** BPS — a plain yes/no, `WP-operator-record` (LAN-217). The value and its label are the same word, like eligibility and availability. */
const BPS_VALUES = Object.freeze(["Yes", "No"]);

export const PLAYER_COLUMN_WIDTH = 200;

/** The non-player columns (LAN-186, LAN-217). Position options are threaded in at call time — read from the season's own vocabulary (S3). */
export function buildColumns(positionOptions: PositionOptions): readonly ColumnDef[] {
  const positionOptionLabels = (options: PositionOptions[keyof PositionOptions]) =>
    Object.fromEntries(options.map((option) => [option.code, option.label]));

  return Object.freeze([
    // ---------------------------------------------------------------- Person --
    {
      key: "college",
      label: "College",
      band: "person",
      edit: "record",
      width: 132,
      sortable: true,
      filterable: true,
      requires: "person_record_authority",
    },
    {
      key: "matriculation",
      label: "Matric",
      band: "person",
      edit: "record",
      width: 104,
      sortable: true,
      filterable: true,
      requires: "person_record_authority",
    },
    {
      key: "graduation",
      label: "Grad",
      band: "person",
      edit: "record",
      width: 100,
      sortable: true,
      filterable: true,
      requires: "person_record_authority",
    },
    {
      key: "degree",
      label: "Degree",
      band: "person",
      edit: "record",
      width: 148,
      sortable: true,
      filterable: true,
      requires: "person_record_authority",
    },
    {
      key: "contactable",
      label: "Contactable",
      band: "person",
      edit: "none",
      width: 132,
      sortable: true,
      filterable: true,
      requires: "person_record_authority",
    },
    {
      key: "missing",
      label: "Missing",
      band: "person",
      edit: "none",
      width: 108,
      sortable: true,
      filterable: true,
      requires: "person_record_authority",
    },
    // ------------------------------------------------------------ Onboarding --
    {
      key: "onboarding",
      label: "Onboarding",
      band: "onboarding",
      edit: "none",
      width: 190,
      sortable: true,
      filterable: true,
      requires: "person_record_authority",
    },
    // Correction round 2, item 5: the seven operator-ticked items (LAN-217). Decision history: docs/ux/tickets/LAN-186-roster-board.md · missions/intake/M-PEOPLE-AND-ROSTER/decision-history.md · docs/ux/tickets/LAN-217-operator-record.md.
    {
      key: "subsInvoiced",
      label: "Sub invoiced",
      band: "onboarding",
      edit: "onboarding",
      itemCode: "subs_invoiced",
      options: allowedItemStates("subs_invoiced"),
      width: 132,
      sortable: true,
      filterable: true,
      requires: "person_record_authority",
    },
    {
      key: "subsPaid",
      label: "Sub paid",
      band: "onboarding",
      edit: "onboarding",
      itemCode: "subs_paid",
      options: allowedItemStates("subs_paid"),
      width: 132,
      sortable: true,
      filterable: true,
      requires: "person_record_authority",
    },
    {
      key: "kitDistributed",
      label: "Kit Distributed",
      band: "onboarding",
      edit: "onboarding",
      itemCode: "kit_sorted",
      options: allowedItemStates("kit_sorted"),
      width: 120,
      sortable: true,
      filterable: true,
      requires: "person_record_authority",
    },
    {
      key: "bucsPlay",
      label: "BUCS Play",
      band: "onboarding",
      edit: "onboarding",
      itemCode: "bucs_play",
      options: allowedItemStates("bucs_play"),
      width: 132,
      sortable: true,
      filterable: true,
      requires: "person_record_authority",
    },
    {
      key: "hudlAccess",
      label: "Hudl access",
      band: "onboarding",
      edit: "onboarding",
      itemCode: "hudl_access",
      options: allowedItemStates("hudl_access"),
      width: 132,
      sortable: true,
      filterable: true,
      requires: "person_record_authority",
    },
    {
      key: "squadPhoto",
      label: "Squad photo",
      band: "onboarding",
      edit: "onboarding",
      itemCode: "photo",
      options: allowedItemStates("photo"),
      width: 132,
      sortable: true,
      filterable: true,
      requires: "person_record_authority",
    },
    {
      key: "commsGroup",
      label: "Comms group",
      band: "onboarding",
      edit: "onboarding",
      itemCode: "comms_groups",
      options: allowedItemStates("comms_groups"),
      width: 140,
      sortable: true,
      filterable: true,
      requires: "person_record_authority",
    },
    // ---------------------------------------------------------------- Season --
    {
      key: "status",
      label: "Status",
      band: "season",
      edit: "select",
      options: STATUSES,
      optionLabels: STATUS_OPTION_LABELS,
      width: 128,
      sortable: true,
      filterable: true,
      requires: "person_record_authority",
    },
    {
      key: "entry",
      label: "Entry",
      band: "season",
      edit: "select",
      options: ENTRIES,
      width: 116,
      sortable: true,
      filterable: true,
      requires: "person_record_authority",
    },
    {
      key: "offencePosition",
      label: "Offence",
      band: "season",
      edit: "select",
      options: positionOptions.offence.map((option) => option.code),
      optionLabels: positionOptionLabels(positionOptions.offence),
      width: 128,
      sortable: true,
      filterable: true,
      requires: "person_record_authority",
    },
    {
      key: "defencePosition",
      label: "Defence",
      band: "season",
      edit: "select",
      options: positionOptions.defence.map((option) => option.code),
      optionLabels: positionOptionLabels(positionOptions.defence),
      width: 128,
      sortable: true,
      filterable: true,
      requires: "person_record_authority",
    },
    {
      key: "specialTeamsPosition",
      label: "Special teams",
      band: "season",
      edit: "select",
      options: positionOptions.specialTeams.map((option) => option.code),
      optionLabels: positionOptionLabels(positionOptions.specialTeams),
      width: 168,
      sortable: true,
      filterable: true,
      requires: "person_record_authority",
    },
    {
      key: "blueNumbers",
      label: "Blue #",
      band: "season",
      edit: "jersey",
      kit: "blue",
      width: 120,
      sortable: true,
      filterable: true,
      requires: "person_record_authority",
    },
    {
      key: "whiteNumbers",
      label: "White #",
      band: "season",
      edit: "jersey",
      kit: "white",
      width: 120,
      sortable: true,
      filterable: true,
      requires: "person_record_authority",
    },
    {
      key: "coachGroup",
      label: "Coach group",
      band: "season",
      edit: "select",
      options: COACH_GROUPS,
      width: 140,
      sortable: true,
      filterable: true,
      requires: "person_record_authority",
    },
    {
      key: "formalwear",
      label: "Formalwear",
      band: "season",
      edit: "multiselect",
      options: [...FORMALWEAR_ITEMS],
      optionLabels: FORMALWEAR_LABELS,
      width: 150,
      sortable: true,
      filterable: true,
      requires: "person_record_authority",
    },
    {
      key: "blues",
      label: "Blues",
      band: "season",
      edit: "select",
      options: BLUES_VALUES,
      width: 116,
      sortable: true,
      filterable: true,
      requires: "person_record_authority",
    },
    {
      key: "eligibility",
      label: "Eligibility",
      band: "season",
      edit: "select",
      options: ELIGIBILITY_VALUES,
      optionLabels: ELIGIBILITY_LABELS,
      width: 128,
      sortable: true,
      filterable: true,
      requires: "person_record_authority",
    },
    // Brian, 2026-09-05: BPS immediately before Availability, which is last (LAN-217, round 5).
    {
      key: "bps",
      label: "BPS",
      band: "season",
      edit: "select",
      options: BPS_VALUES,
      width: 96,
      sortable: true,
      filterable: true,
      requires: "person_record_authority",
    },
    {
      key: "availability",
      label: "Availability",
      band: "season",
      edit: "select",
      options: AVAILABILITY_VALUES,
      optionLabels: AVAILABILITY_LABELS,
      width: 128,
      sortable: true,
      filterable: true,
      requires: "person_record_authority",
    },
  ]) satisfies readonly ColumnDef[];
}

/** The columns this viewer's role codes may see — absent from the payload, not hidden (`REQ-authority`). */
export function visibleColumns(
  columns: readonly ColumnDef[],
  roleCodes: readonly string[],
): readonly ColumnDef[] {
  return columns.filter((column) => roleCodesPermit(roleCodes, column.requires));
}

/** Which `RosterBoardRow` fields a column key exposes — explicit, since display keys and field names diverge. A field in no entry is never carried, regardless of columns granted. */
const COLUMN_ROW_FIELDS: Readonly<Record<string, readonly (keyof RosterBoardRow)[]>> =
  Object.freeze({
    college: ["college"],
    matriculation: ["matriculationYear"],
    graduation: ["expectedGraduationYear"],
    degree: ["degreeField"],
    contactable: ["hasMobile", "hasEmail"],
    missing: ["missingCount"],
    onboarding: ["itemsTotal", "itemsResolved", "requiredOutstanding"],
    status: ["status"],
    entry: ["entry"],
    offencePosition: ["offencePosition"],
    defencePosition: ["defencePosition"],
    specialTeamsPosition: ["specialTeamsPosition"],
    blueNumbers: ["blueNumbers"],
    whiteNumbers: ["whiteNumbers"],
    coachGroup: ["coachGroup"],
    formalwear: ["formalwear"],
    blues: ["blues"],
    eligibility: ["eligibility"],
    availability: ["availability"],
    bps: ["bps"],
    subsInvoiced: ["onboardingItems"],
    subsPaid: ["onboardingItems"],
    kitDistributed: ["onboardingItems"],
    bucsPlay: ["onboardingItems"],
    hudlAccess: ["onboardingItems"],
    squadPhoto: ["onboardingItems"],
    commsGroup: ["onboardingItems"],
  });

/** Redacts a row to exactly the columns this viewer may see, plus identity fields. */
export function redactRow(
  row: RosterBoardRow,
  columns: readonly ColumnDef[],
): Partial<RosterBoardRow> {
  const redacted: Partial<RosterBoardRow> = {
    membershipId: row.membershipId,
    personId: row.personId,
    displayName: row.displayName,
    // Carried unconditionally, never as a column: aliases are identity data
    // (LAN186-F1); phoneForCall is the one functional exception (voice call).
    // Decision history: docs/ux/tickets/LAN-186-roster-board.md · missions/intake/M-PEOPLE-AND-ROSTER/decision-history.md · docs/ux/tickets/LAN-217-operator-record.md.
    aliases: row.aliases,
    phoneForCall: row.phoneForCall,
  };
  const target = redacted as unknown as Record<string, unknown>;
  for (const column of columns) {
    for (const field of COLUMN_ROW_FIELDS[column.key] ?? []) {
      target[field] = row[field];
    }
  }
  return redacted;
}
