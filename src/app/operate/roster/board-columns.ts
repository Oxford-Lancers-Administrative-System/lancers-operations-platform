import { roleCodesPermit } from "@/lib/auth/capabilities";
import { allowedItemStates } from "@/lib/services/onboarding-item-shapes";
import type { PositionOptions, RosterBoardRow } from "@/lib/services/roster-board";
import { MEMBERSHIP_STATUS_LABELS } from "./presentation";

// LAN-225: the three bands take the club palette from the kit — tokens only, no board behaviour change.
import { BAND_COLOURS } from "@/components/section";
/**
 * The board's column model — LAN-186. What `chore/roster-fidelity-mockup`'s
 * `columns.ts` demonstrated, built for real: every column is one entry here,
 * driving banding, pinning, sorting, filtering, which cells edit in place and
 * which route to the person record — never a fifth `<TableCell>` copied around
 * the file.
 *
 * ## `Four-role only, for the grid and every column on it` (REQ-authority)
 *
 * The whole surface is gated on `person_record_authority` before this module
 * is ever reached — `page.tsx` refuses an operator who does not hold it, the
 * same capability LAN-183 built `person-authority.ts` against. What this
 * module adds is the mechanism the issue calls "moot while four-role — build
 * it anyway": every column carries a `requires` capability, and
 * `visibleColumns()` drops one a viewer's role codes do not hold **before** a
 * row is ever built into a payload. Every column reads the same capability as
 * the page today, so nothing is actually narrowed yet — but narrowing later,
 * exactly as `person-authority.ts`'s categories do for the person record, is
 * an edit to one column's `requires`, not a rewrite of this file.
 *
 * `this repository has no `availability_read` capability of its own — Q-4's
 * decision and LAN-124's administrative-seat rule both resolve to the same
 * four offices `person_record_authority` already names, and inventing a new,
 * narrower grant with nobody yet excluded from it would be a capability-map
 * change this package does not own (`src/lib/auth/**` is LAN-183's). The
 * mechanism is real and column-scoped; the grant it currently reads is shared
 * with the page's own gate.
 */

export type Band = "person" | "onboarding" | "season";

export interface BandDef {
  readonly key: Band;
  readonly label: string;
  readonly header: string;
  readonly tint: string;
  readonly solid: string;
}

export const BAND_ROW_HEIGHT = 28;

/**
 * The left inset every band header's label sits at — one rule so a fourth
 * band inherits it rather than each band cell carrying its own padding (or
 * not). Brian's walkthrough of the built board: PERSON sat with this inset,
 * ONBOARDING sat flush against its band's left edge with none at all — an
 * artifact of the label's `position: sticky` doing double duty as the
 * *static* inset too, which only ever worked for the band immediately after
 * the pinned Player column. This is the actual, explicit inset; the sticky
 * offset below still uses it too, so the two never drift apart.
 */
export const BAND_LABEL_INSET_PX = 16;

export const BANDS: readonly BandDef[] = Object.freeze([
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

/**
 * `record` — a person fact: renders and routes to the person record, W2's
 * rules apply there. `select` / `multiselect` / `jersey` — a season fact,
 * edits in the cell, commits on its own, audited, no reason asked. `none` is
 * derived or owned elsewhere.
 *
 * Status used to be its own kind, gated by a legal-transition table
 * `membership.ts` owned. LAN-186's owner walkthrough removed that table
 * entirely (`Q-12`: "We can flip to whatever status we want to go in."), so
 * Status is now an ordinary `select` column like every other season fact —
 * the one in-cell dropdown Brian asked for, in place of the three bespoke
 * controls the board used to render for it.
 */
/**
 * `onboarding` joined under correction round 2, item 5
 * (`WP-operator-record`, LAN-217): one of the seven operator-ticked
 * onboarding items, cloning the record page's own asymmetric row. D-002
 * (correction round 6) collapsed the closed cell's displayed status and the
 * open cell's offered choices into one list, `allowedItemStates(itemCode)` —
 * there is no separate resolution vocabulary any more, and no `reopen`: the
 * open dropdown offers exactly the states the closed cell can show.
 */
export type EditKind = "none" | "record" | "select" | "multiselect" | "jersey" | "onboarding";

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
/**
 * The Status column's own label map — the same words `presentation.ts` fixes
 * for the rest of the roster, so the board's dropdown, its filter chip and the
 * player page's status control never invent a second wording for one value.
 */
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
export const BPS_VALUES = Object.freeze(["Yes", "No"]);

export const PLAYER_COLUMN_WIDTH = 200;

/**
 * The non-player columns: nineteen from LAN-186, BPS and seven onboarding
 * item columns from `WP-operator-record` (LAN-217, correction round 2, item
 * 5) — twenty-seven, twenty-eight with `Player`, which is rendered
 * separately because it is pinned and carries no band.
 *
 * Position options are threaded in at call time because they are read from
 * the season's own vocabulary (S3) rather than fixed here.
 */
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
    // Correction round 2, item 5 — the seven operator-ticked items, cloning
    // the record page's own Onboarding section into the board an operator
    // already works from. The two derived items
    // (`contact_academic_details`, `season_welcome_consent`) are not columns
    // of their own here — nothing an operator ticks — and stay covered by
    // the summary column above; see the package receipt.
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
    // Brian, 2026-09-05: BPS sits immediately before Availability, and
    // Availability is the last column on the board (`WP-operator-record`,
    // LAN-217, correction round 5).
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

/**
 * The columns this viewer's role codes may see. `REQ-authority`: absent from
 * the DOM and the payload, not hidden in it — the caller filters `rows` down
 * to these keys too (`board-data.ts`'s `redactRow`), so a column dropped here
 * never has its value carried across the wire at all.
 */
export function visibleColumns(
  columns: readonly ColumnDef[],
  roleCodes: readonly string[],
): readonly ColumnDef[] {
  return columns.filter((column) => roleCodesPermit(roleCodes, column.requires));
}

/**
 * Which `RosterBoardRow` fields a column key exposes.
 *
 * A column's display key and the row's own field names diverge in several
 * places — `matriculation` shows `matriculationYear`, `contactable` is derived
 * from two booleans, `onboarding` from three counts — so redaction cannot
 * match on the string alone. This is the explicit map that closes the gap,
 * analogous to `PERSON_RECORD_FIELD_CATEGORY` in `person-authority.ts`: every
 * field a row carries belongs to exactly one column here, and a field named in
 * no entry is never carried into a redacted row regardless of what columns are
 * granted — absence of a decision is never permission.
 */
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
    // Carried unconditionally alongside `displayName`, never as a column of its
    // own (LAN186-F1): search has to find a player by an alias regardless of
    // which columns this viewer's role grants, exactly as it already finds one
    // by display name — an alias is identity data, not a restricted field.
    aliases: row.aliases,
    // Carried unconditionally, never as a column: the one functional exception
    // the workflow itself asks for (voice call, phone's condensed-view-only
    // quick action). See the field's own doc comment in `roster-board.ts`.
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
