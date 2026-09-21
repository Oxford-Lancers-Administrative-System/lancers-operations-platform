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
  KIT_ITEMS,
  kitCellKey,
  parseSpecialTeamsCellKey,
  SPECIAL_TEAMS_SLOTS,
  SPECIAL_TEAMS_SQUADS,
  specialTeamsCellKey,
  WARMUP_SMALL_GROUP_KEY,
  WARMUP_SMALL_GROUP_VALUES,
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
  | "warmup"
  | "kit";

export interface BandDef {
  readonly key: Band;
  readonly label: string;
  readonly header: string;
  readonly tint: string;
  readonly solid: string;
}

export const BAND_ROW_HEIGHT = 28;

/**
 * The strip kept clear down the right-hand edge of a board's scroll container,
 * so the vertical scrollbar has somewhere of its own to be — LAN-395, from
 * Brian's visual pass on PR 191: the bar was painted over the rightmost
 * folded-up band (Kit), hiding half its chevron and half its sideways name.
 *
 * Two rules are needed because there are two kinds of scrollbar and only one of
 * them is reachable from CSS. Where the platform lays scrollbars out in flow,
 * `scrollbar-gutter: stable` reserves the width and the bar sits in it. Where
 * the platform *overlays* them — macOS with a trackpad, which is what Brian
 * reported — the bar has zero layout width, `scrollbar-gutter` reserves
 * nothing by definition, and the only thing that moves the last column out
 * from under the bar is real padding at the end of the scrollable area. This
 * is that padding: wide enough for the widest overlay bar macOS draws.
 */
export const BOARD_SCROLLBAR_GUTTER_PX = 16;

/** The left inset every band header's label sits at — one rule, explicit rather than per-band. */
export const BAND_LABEL_INSET_PX = 16;

/**
 * The height of one board row, and of every state of every cell in it — Brian's
 * visual pass of 2026-09-17, items 3 and 4.
 *
 * Measured before the change: 57px a row, on a board whose cells hold one word.
 * The cause was the Player cell's link, which was a `Button` and so carried the
 * 44px touch target the theme gives every medium button. The board is drawn
 * only from `md` up, where the pointer is a mouse and a 44px target buys
 * nothing, so the name is a plain link now and the row is this token instead.
 *
 * It is one exported number rather than a value repeated in three files because
 * of item 4: "a row must not change height when a cell is edited or just after
 * a pick". A row grows when one cell's editor is taller than its display state,
 * and the way to be sure none is, is for all of them to be told the same height
 * from the same place. `board-screens.test.tsx` measures exactly that, on a
 * rendered row and on the same row with one of its cells open.
 */
export const BOARD_ROW_HEIGHT = 32;

/**
 * What a cell's own control gets inside `BOARD_ROW_HEIGHT`: the row, less the
 * 1px rule under it, less 2px of air above and below so a focused outline is
 * not clipped. Every editor and every pill in a cell is drawn at this height.
 */
export const BOARD_CELL_CONTROL_HEIGHT = 26;

/**
 * The rule between one special-teams squad's four columns and the next —
 * Brian's visual pass, item 5. Inside a group the columns had no vertical rule
 * at all, so twenty-four special-teams columns read as one undivided run.
 * Darker than the white seam that separates two groups, because this divides
 * within a group rather than between them.
 */
export const SQUAD_BOUNDARY_BORDER = "2px solid rgba(33, 29, 28, 0.38)";

/**
 * How far down its column a folded-up group's name may run — Brian's visual
 * pass, item 2.
 *
 * The name is written vertically, so its length is the header's height, and
 * "Special teams assignments" set on one vertical line made the sticky header
 * 160px tall before a single row was drawn. It wraps instead: two short lines
 * down the column rather than one long one, which costs width the cell already
 * has (a wrapped vertical line is 12px wide, and the cell is 28px) and buys the
 * header back. Nothing is clipped at this length.
 */
export const COLLAPSED_LABEL_MAX_HEIGHT = 88;

/** The vertical label's own line box — two of them fit the collapsed cell's width. */
export const COLLAPSED_LABEL_LINE_HEIGHT = 12;

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
    key: "warmup" as const,
    label: "Warmup assignments",
    ...BAND_COLOURS.warmup,
  }),
  Object.freeze({
    key: "kit" as const,
    label: "Kit",
    ...BAND_COLOURS.kit,
  }),
]);

/** Every band, in order — the board's group strip and the record's section order are the same list. */
const BAND_ORDER: readonly Band[] = Object.freeze(BANDS.map((band) => band.key));

/** Groups the board and the record open collapsed when this operator has never said otherwise. The long tail, not the facts an operator came for. Read only through `collapsedBandsFrom`, so nothing can consult the default without first consulting the account. */
const COLLAPSED_BY_DEFAULT: ReadonlySet<Band> = Object.freeze(
  new Set<Band>(["specialTeams", "warmup", "kit"]),
);

function isBand(key: string): key is Band {
  return (BAND_ORDER as readonly string[]).includes(key);
}

/**
 * Which groups this operator has folded away — LAN-387, Brian's visual pass,
 * item 1. `undefined` is "they have never touched it", which is the board's own
 * default, and is deliberately not the same as a stored empty list: an operator
 * who has opened everything gets everything open, on every device.
 *
 * Anything stored that is not a group is dropped rather than refused. The names
 * here are presentation and may be renamed by a later release; a preference
 * pointing at a group that no longer exists is a stale setting, not an error.
 */
export function collapsedBandsFrom(stored: readonly string[] | undefined): ReadonlySet<Band> {
  if (stored === undefined) return COLLAPSED_BY_DEFAULT;
  return new Set(stored.filter(isBand));
}

/**
 * The membership record's own sections — LAN-403. Stewart, on the call of
 * 2026-09-21: "I cannot collapse his personal record. I cannot collapse
 * onboarding." Every section on the record folds, so the four that are not one
 * of the board's groups need names in the same setting.
 *
 * They are kept in the one `rosterCollapsedGroups` list rather than a second
 * one, because they are the same operator answering the same question about
 * the same screen family. `collapsedBandsFrom` already drops what it does not
 * recognise, so the board simply never sees them.
 */
type RecordSection = "activity" | "attendance" | "otherSeasons" | "statusHistory";
export type RecordGroup = Band | RecordSection;

const RECORD_SECTIONS: readonly RecordSection[] = Object.freeze([
  "activity",
  "attendance",
  "otherSeasons",
  "statusHistory",
]);

/**
 * What the record closes for an operator who has never said otherwise: the
 * board's own three, plus the record's four, which are the long tail by the
 * same rule — a log, a term's attendance, previous seasons and the status
 * history are none of them what a reader opened this record for. Person,
 * Onboarding and Membership stay open.
 */
const RECORD_COLLAPSED_BY_DEFAULT: ReadonlySet<RecordGroup> = Object.freeze(
  new Set<RecordGroup>([...COLLAPSED_BY_DEFAULT, ...RECORD_SECTIONS]),
);

function isRecordGroup(key: string): key is RecordGroup {
  return isBand(key) || (RECORD_SECTIONS as readonly string[]).includes(key);
}

/** Which of the record's sections this operator has folded away — `collapsedBandsFrom`'s rule, over the wider list. */
export function recordCollapsedGroupsFrom(
  stored: readonly string[] | undefined,
): ReadonlySet<RecordGroup> {
  if (stored === undefined) return RECORD_COLLAPSED_BY_DEFAULT;
  return new Set(stored.filter(isRecordGroup));
}

/**
 * Stored keys the *board* has no opinion about — the record's own sections.
 * The board writes the whole list every time, so without this a fold made on a
 * record would be erased by the next fold made on the board.
 */
export function nonBandCollapsedKeys(stored: readonly string[] | undefined): readonly string[] {
  return (stored ?? []).filter((key) => !isBand(key));
}

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
  /** The bold line above an italic `label` — LAN-374's six squad sub-headings. */
  readonly groupHeading?: string;
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

/** The single cell a collapsed group occupies — its column header writes the group's name down it, and one click brings the columns back. */
function collapsedPlaceholder(band: Band): ColumnDef {
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

/**
 * The last column of each special-teams squad's four — Brian's visual pass,
 * item 5. Computed from the drawn columns rather than hard-coded, so a squad
 * that is filtered, reordered or removed takes its own seam with it.
 */
export function squadBoundaryKeys(columns: readonly ColumnDef[]): ReadonlySet<string> {
  const keys = new Set<string>();
  columns.forEach((column, index) => {
    const cell = parseSpecialTeamsCellKey(column.key);
    if (!cell) return;
    const next = columns[index + 1];
    const nextCell = next ? parseSpecialTeamsCellKey(next.key) : null;
    if (nextCell?.squad !== cell.squad) keys.add(column.key);
  });
  return keys;
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
/** LAN-401, Stewart's eight names in his order. Same list the service holds, imported not retyped. */
export const WARMUP_SMALL_GROUPS = WARMUP_SMALL_GROUP_VALUES;
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
    // LAN-375: derived from the kit issued, never typed. It stays the red flag
    // it was; `edit: "none"` is what stops it opening a control.
    {
      key: "kitDistributed",
      label: "Kit Distributed",
      band: "onboarding",
      edit: "none",
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
    // LAN-374: six squads, four cells each, twenty-four columns. Each is one
    // pick from that squad's own list; no rule ties any two of them together.
    ...SPECIAL_TEAMS_SQUADS.flatMap((squad) =>
      SPECIAL_TEAMS_SLOTS.map((slot) => ({
        key: specialTeamsCellKey(squad.squad, slot.slot),
        label: slot.label,
        groupHeading: squad.label,
        band: "specialTeams" as const,
        edit: "select" as const,
        options: squad.positions,
        width: 176,
        sortable: true,
        filterable: true,
        requires: "person_record_authority" as const,
      })),
    ),
    // ------------------------------------------ Warmup assignments --
    // LAN-401: one column, one pick from Stewart's eight names or blank.
    {
      key: WARMUP_SMALL_GROUP_KEY,
      label: "Small Group Assignment",
      band: "warmup",
      edit: "select",
      options: WARMUP_SMALL_GROUP_VALUES,
      width: 190,
      sortable: true,
      filterable: true,
      requires: "person_record_authority",
    },
    // ------------------------------------------------------------------ Kit --
    // LAN-375: eleven issued-kit items from Clint's sheet. Nine are a single
    // select; Braces L and Braces R take the multi-select Formalwear already
    // uses (LAN-409), at the same width. Formalwear moved here from Season and
    // keeps Tie and Bow tie; the club's blue game socks are a Kit item of
    // their own.
    ...KIT_ITEMS.map((item) => ({
      key: kitCellKey(item.item),
      label: item.label,
      band: "kit" as const,
      edit: (item.multi ? "multiselect" : "select") as "multiselect" | "select",
      options: item.values,
      width: 190,
      sortable: true,
      filterable: true,
      requires: "person_record_authority" as const,
    })),
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
    [WARMUP_SMALL_GROUP_KEY]: ["warmupSmallGroup"],
    ...Object.fromEntries(KIT_ITEMS.map((item) => [kitCellKey(item.item), ["kit"] as const])),
    ...Object.fromEntries(
      SPECIAL_TEAMS_SQUADS.flatMap((squad) =>
        SPECIAL_TEAMS_SLOTS.map((slot) => [
          specialTeamsCellKey(squad.squad, slot.slot),
          ["specialTeams"] as const,
        ]),
      ),
    ),
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
