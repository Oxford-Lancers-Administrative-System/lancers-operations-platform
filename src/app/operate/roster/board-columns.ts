import { BAND_COLOURS } from "@/components/section";
import { roleCodesPermit } from "@/lib/auth/capabilities";
import { allowedItemStates } from "@/lib/services/onboarding-item-shapes";
import type { PositionOptions, RosterBoardRow } from "@/lib/services/roster-board";
// Straight from the vocabulary module, never through the service index: that
// index re-exports `server-only` code, and these column definitions are client.
import {
  COACHING_GROUP_VALUES,
  DEFENSIVE_POSITION_GROUP_VALUES,
  FORMALWEAR_ITEM_KEYS,
  OFFENSIVE_POSITION_GROUP_VALUES,
} from "@/lib/services/roster-board/vocabulary";
import { MEMBERSHIP_STATUS_LABELS } from "./presentation";

// The board's column model — LAN-186. Every column is one entry here, driving
// banding, pinning, sorting, filtering, edit-in-place and routing — never a
// `<TableCell>` copied around the file. Each carries a `requires` capability
// (REQ-authority) so `visibleColumns()` can narrow later without a rewrite.

/**
 * LAN-387 — the board's groups, in the order Brian and Stewart settled on the
 * call of 2026-09-16. `season` became `membership`; everything after it is new.
 */
export type Band =
  | "person"
  | "onboarding"
  | "membership"
  | "coaching"
  | "offensive"
  | "defensive"
  | "specialTeams"
  | "kit";

export interface BandDef {
  readonly key: Band;
  readonly label: string;
  readonly header: string;
  readonly tint: string;
  readonly solid: string;
}

export const BAND_ROW_HEIGHT = 28;

/** The left inset every band header's label sits at — one rule, explicit rather than per-band. */
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
    key: "membership" as const,
    label: "Membership",
    ...BAND_COLOURS.membership,
  }),
  Object.freeze({
    key: "coaching" as const,
    label: "Coaching assignments",
    ...BAND_COLOURS.coaching,
  }),
  Object.freeze({
    key: "offensive" as const,
    label: "Offensive assignments",
    ...BAND_COLOURS.offensive,
  }),
  Object.freeze({
    key: "defensive" as const,
    label: "Defensive assignments",
    ...BAND_COLOURS.defensive,
  }),
  Object.freeze({
    key: "specialTeams" as const,
    label: "Special teams assignments",
    ...BAND_COLOURS.specialTeams,
  }),
  Object.freeze({
    key: "kit" as const,
    label: "Kit",
    ...BAND_COLOURS.kit,
  }),
]);

/** Every band, in order — the board's group strip and the record's section order are the same list. */
export const BAND_ORDER: readonly Band[] = Object.freeze(BANDS.map((band) => band.key));

/** Groups the board and the record open collapsed. The long tail, not the facts an operator came for. */
export const COLLAPSED_BY_DEFAULT: ReadonlySet<Band> = Object.freeze(
  new Set<Band>(["specialTeams", "kit"]),
);

export function bandOf(key: Band): BandDef {
  const found = BANDS.find((band) => band.key === key);
  if (!found) throw new Error(`Unknown band: ${key}`);
  return found;
}

// `record` routes to the person record; `select`/`multiselect`/`jersey` edit
// in the cell; `none` is derived elsewhere; `onboarding` is one of the seven
// operator-ticked items (LAN-217), via `allowedItemStates(itemCode)`.
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
  /** Not a column: the one narrow cell a collapsed group leaves behind (LAN-387). */
  readonly placeholder?: true;
}

/** The single cell a collapsed group occupies — the band header still names it, and one click brings the columns back. */
export function collapsedPlaceholder(band: Band): ColumnDef {
  return Object.freeze({
    key: `group:${band}`,
    label: "",
    band,
    edit: "none",
    width: 28,
    sortable: false,
    filterable: false,
    requires: "person_record_authority",
    placeholder: true,
  });
}

/** The columns actually drawn: a collapsed group contributes one placeholder instead of its own columns. */
export function displayColumns(
  columns: readonly ColumnDef[],
  collapsed: ReadonlySet<Band>,
): readonly ColumnDef[] {
  const drawn: ColumnDef[] = [];
  for (const band of BAND_ORDER) {
    const inBand = columns.filter((column) => column.band === band);
    if (inBand.length === 0) continue;
    if (collapsed.has(band)) drawn.push(collapsedPlaceholder(band));
    else drawn.push(...inBand);
  }
  return drawn;
}

export const STATUSES = Object.freeze(["onboarding", "active", "inactive", "departed", "archived"]);
/** The same words `presentation.ts` fixes for the rest of the roster — one wording everywhere. */
export const STATUS_OPTION_LABELS: Readonly<Record<string, string>> = MEMBERSHIP_STATUS_LABELS;
export const ENTRIES = Object.freeze(["new", "returning"]);
/** Stewart's own spellings, uncapped multi-selects (LAN-387). The service holds the vocabulary; these are the same list, imported not retyped. */
export const COACHING_GROUPS = COACHING_GROUP_VALUES;
export const OFFENSIVE_POSITION_GROUPS = OFFENSIVE_POSITION_GROUP_VALUES;
export const DEFENSIVE_POSITION_GROUPS = DEFENSIVE_POSITION_GROUP_VALUES;
export const FORMALWEAR_ITEMS = FORMALWEAR_ITEM_KEYS;
export const FORMALWEAR_LABELS: Readonly<Record<string, string>> = Object.freeze({
  tie: "Tie",
  bowtie: "Bow tie",
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
    // Correction round 2, item 5: the seven operator-ticked items (LAN-217).
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
    // ------------------------------------------------------------ Membership --
    // Renamed from Season (LAN-387); the facts and their order are Brian's own
    // list from the call: Status, Entry, Blue #, White #, Blues, Eligibility,
    // BPS, Availability.
    {
      key: "status",
      label: "Status",
      band: "membership",
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
      band: "membership",
      edit: "select",
      options: ENTRIES,
      width: 116,
      sortable: true,
      filterable: true,
      requires: "person_record_authority",
    },
    {
      key: "blueNumbers",
      label: "Blue #",
      band: "membership",
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
      band: "membership",
      edit: "jersey",
      kit: "white",
      width: 120,
      sortable: true,
      filterable: true,
      requires: "person_record_authority",
    },
    {
      key: "blues",
      label: "Blues",
      band: "membership",
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
      band: "membership",
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
      band: "membership",
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
      band: "membership",
      edit: "select",
      options: AVAILABILITY_VALUES,
      optionLabels: AVAILABILITY_LABELS,
      width: 128,
      sortable: true,
      filterable: true,
      requires: "person_record_authority",
    },
    // ---------------------------------------------- Coaching assignments --
    // Three uncapped multi-selects (LAN-387). A player may be in every group
    // on the list; Stewart's sheet has several who are.
    {
      key: "coachingGroups",
      label: "Coaching group",
      band: "coaching",
      edit: "multiselect",
      options: COACHING_GROUPS,
      width: 190,
      sortable: true,
      filterable: true,
      requires: "person_record_authority",
    },
    {
      key: "offensivePositionGroups",
      label: "Offensive position group",
      band: "coaching",
      edit: "multiselect",
      options: OFFENSIVE_POSITION_GROUPS,
      width: 210,
      sortable: true,
      filterable: true,
      requires: "person_record_authority",
    },
    {
      key: "defensivePositionGroups",
      label: "Defensive position group",
      band: "coaching",
      edit: "multiselect",
      options: DEFENSIVE_POSITION_GROUPS,
      width: 210,
      sortable: true,
      filterable: true,
      requires: "person_record_authority",
    },
    // --------------------------------------------- Offensive assignments --
    // The primary/backup pair. Both draw on the season's offence vocabulary
    // (invariant S3) and nothing says they differ.
    {
      key: "offencePosition",
      label: "Primary position",
      band: "offensive",
      edit: "select",
      options: positionOptions.offence.map((option) => option.code),
      optionLabels: positionOptionLabels(positionOptions.offence),
      width: 150,
      sortable: true,
      filterable: true,
      requires: "person_record_authority",
    },
    {
      key: "offenceBackupPosition",
      label: "Backup position",
      band: "offensive",
      edit: "select",
      options: positionOptions.offence.map((option) => option.code),
      optionLabels: positionOptionLabels(positionOptions.offence),
      width: 150,
      sortable: true,
      filterable: true,
      requires: "person_record_authority",
    },
    // --------------------------------------------- Defensive assignments --
    {
      key: "defencePosition",
      label: "Primary position",
      band: "defensive",
      edit: "select",
      options: positionOptions.defence.map((option) => option.code),
      optionLabels: positionOptionLabels(positionOptions.defence),
      width: 150,
      sortable: true,
      filterable: true,
      requires: "person_record_authority",
    },
    {
      key: "defenceBackupPosition",
      label: "Backup position",
      band: "defensive",
      edit: "select",
      options: positionOptions.defence.map((option) => option.code),
      optionLabels: positionOptionLabels(positionOptions.defence),
      width: 150,
      sortable: true,
      filterable: true,
      requires: "person_record_authority",
    },
    // ----------------------------------------- Special teams assignments --
    // LAN-374 fills this group; LAN-387 only puts it in the order.
    // ------------------------------------------------------------------ Kit --
    // LAN-375 fills this group. Formalwear moves here from Season and keeps
    // Tie and Bow tie; the club's blue game socks are a Kit item of their own.
    {
      key: "formalwear",
      label: "Formalwear",
      band: "kit",
      edit: "multiselect",
      options: [...FORMALWEAR_ITEMS],
      optionLabels: FORMALWEAR_LABELS,
      width: 150,
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
    offenceBackupPosition: ["offenceBackupPosition"],
    defencePosition: ["defencePosition"],
    defenceBackupPosition: ["defenceBackupPosition"],
    blueNumbers: ["blueNumbers"],
    whiteNumbers: ["whiteNumbers"],
    coachingGroups: ["coachingGroups"],
    offensivePositionGroups: ["offensivePositionGroups"],
    defensivePositionGroups: ["defensivePositionGroups"],
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
