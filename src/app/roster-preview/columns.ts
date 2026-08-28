/**
 * The board's column model — W5, `missions/intake/M-PEOPLE-AND-ROSTER`.
 *
 * This file is the whole reason the mockup exists. Everything the board does —
 * banding, pinning, sorting, filtering, which cells edit in place and which
 * bounce to the person record — is read from here rather than written into the
 * table markup, because that is how the real implementation should be built
 * too. Adding a nineteenth column should be one entry in `COLUMNS`, not a new
 * `<TableCell>` in four places.
 *
 * **This is a fidelity mockup, not the implementation.** The column set is
 * illustrative. Where it disagrees with `workflows/W5-work-this-seasons-roster.md`
 * or `field-inventory.md`, those win.
 */

/**
 * The three column groups, in the order Brian approved them on 2026-08-27.
 *
 * The recorded cost of this order, from `acceptance/W5.md`: Person-first puts
 * Status and Entry — the two columns an operator actually scans — off the
 * first screen. Approved as drawn, carried rather than settled. The mockup
 * keeps the approved order so the cost is visible rather than quietly fixed.
 */
export type Band = "person" | "onboarding" | "season";

export interface BandDef {
  readonly key: Band;
  readonly label: string;
  /** The band header's own colour. */
  readonly header: string;
  /** The wash behind every cell in the band. Deliberately faint. */
  readonly tint: string;
  /**
   * The same wash, flattened onto white and therefore **opaque**.
   *
   * The sticky header needs this rather than `tint`: a translucent sticky cell
   * lets the rows scrolling underneath show straight through it, which turns
   * the header into an unreadable double exposure the moment the board is
   * scrolled. Body cells keep `tint`, where translucency is harmless and keeps
   * the row-hover state visible underneath.
   */
  readonly solid: string;
}

/** The band row's exact height, shared by the row and the sticky offset below it. */
export const BAND_ROW_HEIGHT = 28;

/**
 * Colour never carries the meaning alone — every band is labelled, which is the
 * condition Brian attached when he asked for the grouping ("I want to have the
 * columns grouped together so that they're kind of color-coded").
 */
export const BANDS: readonly BandDef[] = Object.freeze([
  Object.freeze({
    key: "person" as const,
    label: "Person",
    header: "#455a64",
    tint: "rgba(69, 90, 100, 0.045)",
    solid: "#f4f5f6",
  }),
  Object.freeze({
    key: "onboarding" as const,
    label: "Onboarding",
    header: "#b26a00",
    tint: "rgba(178, 106, 0, 0.055)",
    solid: "#fbf6ef",
  }),
  Object.freeze({
    key: "season" as const,
    label: "Season",
    header: "#0b3d91",
    tint: "rgba(11, 61, 145, 0.04)",
    solid: "#f4f6fa",
  }),
]);

/**
 * How a cell is changed.
 *
 * The distinction is the person-versus-season test, and it is the single most
 * important thing this mockup demonstrates:
 *
 *   * `select` / `multiselect` / `text` — a **season** fact. One click opens the
 *     cell, the change commits on its own, there is no save button and no
 *     confirmation. A dropdown only where the value set is fixed; free entry
 *     where it is not, which today means the jersey numbers.
 *
 *   * `record` — a **person** fact. It renders here and opens the person
 *     record, where `W2`'s rules apply: a reason when a value is replaced,
 *     contacts superseding rather than overwriting. Brian: "anything that needs
 *     to be edited there needs to be edited in the people thing… you can't just
 *     willy-nilly change that, but you should show as much as you possibly can."
 *
 *   * `none` — derived or owned elsewhere. Contactability is computed from the
 *     contact points; the missing count is computed from the required set;
 *     onboarding belongs to Mission 7.
 */
export type EditKind = "none" | "record" | "select" | "multiselect" | "text";

export interface ColumnDef {
  readonly key: string;
  readonly label: string;
  readonly band: Band;
  readonly edit: EditKind;
  /** The fixed value set, where there is one. Absent means free entry. */
  readonly options?: readonly string[];
  /**
   * Fuller wording for an option, shown in the dropdown and the filter menu
   * while the cell keeps the short code. `QB` is what fits in a grid column;
   * `Quarterback` is what somebody who does not know the codes needs to read.
   */
  readonly optionLabels?: Readonly<Record<string, string>>;
  readonly width: number;
  readonly sortable: boolean;
  /** Whether the header carries a filter caret. */
  readonly filterable: boolean;
  /**
   * A capability the viewer must hold for this column to render. Undefined
   * means every four-role operator sees it.
   *
   * Column visibility is a function of the viewer's grants so that widening
   * access later drops restricted columns automatically rather than by special
   * case — and what is not granted is **absent from the DOM and the payload**,
   * never hidden in it (the LAN-75 contract).
   */
  readonly requires?: string;
}

/** The five stored membership statuses — `20260828120000_person_substrate.sql`. */
export const STATUSES = Object.freeze([
  "Onboarding",
  "Active",
  "Inactive",
  "Departed",
  "Archived",
]);

/**
 * The ladder has six rungs and only five of them are membership statuses:
 * `Recruit` lives on the prospect record and never holds a membership, so it
 * cannot appear on a board of this season's squad. It filters usefully on
 * People, where the population is mixed.
 */
export const ENTRIES = Object.freeze(["Returning", "New"]);

/**
 * The club's own position vocabulary, split by side.
 *
 * This is **`VOCAB_2026`** from `scripts/seed-local.mjs` — the OULAFC list of
 * the term-card era, adopted 2026-08-01, which is the vocabulary the 2026-27
 * season carries. Not invented here: invariant S3 makes a position's
 * vocabulary a foreign key to the season's own, so a board for this season can
 * only ever offer this list.
 *
 * Codes rather than names in the cell, because eight characters of "Wide
 * Receiver" is most of a column; the dropdown carries both.
 *
 * Two things a reader should know rather than discover:
 *
 *   * `scripts/production/showcase/plan.mjs` carries a slightly different set —
 *     it adds `FB` Full Back and writes Nose Tackle as `N/T`. That is the
 *     production showcase's reference data, not this season's vocabulary.
 *
 *   * The special-teams slots were measured at 0% populated in the 2023
 *     workbook (SDA §11.1). They are offered anyway, deliberately: the model
 *     tolerates anticipated-but-unused vocabulary, and a column that cannot be
 *     filled is how it stays that way.
 */
export const OFFENCE_POSITIONS = Object.freeze(["WR", "TE", "WB", "T", "G", "C", "QB", "RB"]);
export const DEFENCE_POSITIONS = Object.freeze(["CB", "NT", "LB", "E", "S"]);
export const SPECIAL_TEAMS_POSITIONS = Object.freeze(["KO", "KR", "PUNT", "FG"]);

export const POSITION_LABELS: Readonly<Record<string, string>> = Object.freeze({
  WR: "Wide Receiver",
  TE: "Tight End",
  WB: "Wing Back",
  T: "Tackle",
  G: "Guard",
  C: "Centre",
  QB: "Quarterback",
  RB: "Running Back",
  CB: "Cornerback",
  NT: "Nose Tackle",
  LB: "Linebacker",
  E: "End",
  S: "Safety",
  KO: "Kickoff",
  KR: "Kick Return",
  PUNT: "Punt",
  FG: "Field Goal",
});

export const COACH_GROUPS = Object.freeze(["Offense", "Defense", "Special teams"]);
export const FORMALWEAR = Object.freeze(["Tie", "Bowtie", "Socks"]);
export const BLUES = Object.freeze(["Full", "Half", "None"]);
export const ELIGIBILITY = Object.freeze(["Eligible", "Pending", "Ineligible"]);
export const AVAILABILITY = Object.freeze(["Green", "Orange", "Red"]);

/**
 * Twenty columns, Player included and pinned.
 *
 * Six Person, one Onboarding, twelve Season. W5's approved set was eighteen,
 * with one `Positions` column; Brian split it into Offence, Defence and Special
 * teams on 2026-08-28 so a side can be ticked without opening a combined list.
 *
 * The Onboarding group is deliberately near-empty: Mission 7 adds the rest of
 * it, and drawing a lonely group now is what makes room for them later without
 * a second redesign.
 */
export const PLAYER_COLUMN_WIDTH = 200;

export const COLUMNS: readonly ColumnDef[] = Object.freeze([
  // ---------------------------------------------------------------- Person --
  {
    key: "college",
    label: "College",
    band: "person",
    edit: "record",
    width: 132,
    sortable: true,
    filterable: true,
  },
  {
    key: "matriculation",
    label: "Matric",
    band: "person",
    edit: "record",
    width: 104,
    sortable: true,
    filterable: true,
  },
  {
    key: "graduation",
    label: "Grad",
    band: "person",
    edit: "record",
    width: 100,
    sortable: true,
    filterable: true,
  },
  {
    key: "degree",
    label: "Degree",
    band: "person",
    edit: "record",
    width: 148,
    sortable: true,
    filterable: true,
  },
  {
    // Task 08 §5 puts contactability indicators on the grid, not contact
    // values. Replacing the shipped Email and Phone columns with this one is a
    // deliberate narrowing of what a routine screen discloses.
    key: "contactable",
    label: "Contactable",
    band: "person",
    edit: "none",
    width: 132,
    sortable: true,
    filterable: true,
  },
  {
    // The count is on the column; the filter is binary. Brian, 2026-08-27:
    // "who is incomplete" is the question, "who is incomplete by exactly two
    // things" is not.
    key: "missing",
    label: "Missing",
    band: "person",
    edit: "none",
    width: 108,
    sortable: true,
    filterable: true,
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
  },
  // ---------------------------------------------------------------- Season --
  {
    key: "status",
    label: "Status",
    band: "season",
    edit: "select",
    options: STATUSES,
    width: 128,
    sortable: true,
    filterable: true,
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
  },
  {
    key: "offencePositions",
    label: "Offence",
    band: "season",
    edit: "multiselect",
    options: OFFENCE_POSITIONS,
    optionLabels: POSITION_LABELS,
    width: 156,
    sortable: true,
    filterable: true,
  },
  {
    key: "defencePositions",
    label: "Defence",
    band: "season",
    edit: "multiselect",
    options: DEFENCE_POSITIONS,
    optionLabels: POSITION_LABELS,
    width: 148,
    sortable: true,
    filterable: true,
  },
  {
    key: "specialTeams",
    label: "Special teams",
    band: "season",
    edit: "multiselect",
    options: SPECIAL_TEAMS_POSITIONS,
    optionLabels: POSITION_LABELS,
    width: 168,
    sortable: true,
    filterable: true,
  },
  {
    // Free entry, not a dropdown: the numbers are not a fixed set. The model is
    // provisional — two kits, several numbers per player in one kit for about
    // 8%, and numbers that are not unique. The fuller editor is on player
    // detail; Mission 9 owns what a jersey number means.
    key: "blueNumber",
    label: "Blue #",
    band: "season",
    edit: "text",
    width: 104,
    sortable: true,
    filterable: true,
  },
  {
    key: "whiteNumber",
    label: "White #",
    band: "season",
    edit: "text",
    width: 110,
    sortable: true,
    filterable: true,
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
  },
  {
    key: "formalwear",
    label: "Formalwear",
    band: "season",
    edit: "multiselect",
    options: FORMALWEAR,
    width: 150,
    sortable: true,
    filterable: true,
  },
  {
    key: "blues",
    label: "Blues",
    band: "season",
    edit: "select",
    options: BLUES,
    width: 116,
    sortable: true,
    filterable: true,
  },
  {
    key: "eligibility",
    label: "Eligibility",
    band: "season",
    edit: "select",
    options: ELIGIBILITY,
    width: 122,
    sortable: true,
    filterable: true,
  },
  {
    // The one grant-gated column on the board. While the roster is four-role
    // this is moot, and the mechanism is built anyway — it is what makes
    // grant-driven column visibility real rather than theoretical.
    key: "availability",
    label: "Availability",
    band: "season",
    edit: "select",
    options: AVAILABILITY,
    width: 128,
    sortable: true,
    filterable: true,
    requires: "availability_read",
  },
]);

/**
 * Date of birth and emergency contact are **not** in `COLUMNS` and cannot be
 * added to it. Task 08 §6 keeps both off every list, this one included. Under
 * 18 is available as a filter, derived from the date of birth, without the
 * value ever reaching the board — which is the distinction worth making
 * deliberately rather than assuming.
 */
export const NEVER_ON_A_LIST = Object.freeze(["Date of birth", "Emergency contact"]);

export function visibleColumns(grants: readonly string[]): readonly ColumnDef[] {
  return COLUMNS.filter((column) => !column.requires || grants.includes(column.requires));
}

export function bandOf(key: Band): BandDef {
  const found = BANDS.find((band) => band.key === key);
  if (!found) throw new Error(`Unknown band: ${key}`);
  return found;
}
