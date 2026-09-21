/**
 * The roster board's closed vocabularies — LAN-387, from Stewart's assignments
 * sheet, spellings as written.
 *
 * Deliberately not in `read.ts`: that module is `server-only`, and the board's
 * column definitions are a client module. One list, imported by both, rather
 * than the same words typed twice.
 */

/** LAN-387: Formalwear moves into the Kit group and keeps Tie and Bow tie. The club's blue game socks are a Kit item of their own (LAN-375), not formalwear. */
export type FormalwearItemKey = "tie" | "bowtie";
export const FORMALWEAR_ITEM_KEYS: readonly FormalwearItemKey[] = Object.freeze(["tie", "bowtie"]);

/** The coaching groups a player trains with. Several per player, uncapped. */
export const COACHING_GROUP_VALUES: readonly string[] = Object.freeze([
  "Offense",
  "Defense",
  "Special Teams",
]);

/** The position groups, per side. Same rule: several per player, uncapped. */
export const OFFENSIVE_POSITION_GROUP_VALUES: readonly string[] = Object.freeze([
  "Offensive Line",
  "Quarterbacks",
  "Runningbacks",
  "Wide Receivers",
]);
export const DEFENSIVE_POSITION_GROUP_VALUES: readonly string[] = Object.freeze([
  "Defensive Line",
  "Linebackers",
  "Defensive Backs",
]);

// ---------------------------------------------------------------------------
// Special teams — LAN-374, Stewart's Special Teams Assignments tab
// ---------------------------------------------------------------------------

export type SpecialTeamsSquad =
  "kick_return" | "kickoff" | "punt" | "punt_return" | "field_goal" | "field_goal_block";

export type SpecialTeamsSlot = "starting" | "backup_1" | "backup_2" | "backup_3";

export interface SpecialTeamsSquadDef {
  readonly squad: SpecialTeamsSquad;
  readonly label: string;
  /** Exactly the sheet's words, in the sheet's order. Mirrored by `special_teams_squad_positions`; `tests/` proves the two agree. */
  readonly positions: readonly string[];
}

/** The four cells every squad carries, in order. Not a depth chart: no rule ties them to each other. */
export const SPECIAL_TEAMS_SLOTS: readonly { slot: SpecialTeamsSlot; label: string }[] =
  Object.freeze([
    Object.freeze({ slot: "starting" as const, label: "Starting Position" }),
    Object.freeze({ slot: "backup_1" as const, label: "Backup Position 1" }),
    Object.freeze({ slot: "backup_2" as const, label: "Backup Position 2" }),
    Object.freeze({ slot: "backup_3" as const, label: "Backup Position 3" }),
  ]);

export const SPECIAL_TEAMS_SQUADS: readonly SpecialTeamsSquadDef[] = Object.freeze([
  Object.freeze({
    squad: "kick_return" as const,
    label: "Kick Return",
    positions: Object.freeze([
      "Left Tackle",
      "Right Tackle",
      "Left Guard",
      "Right Guard",
      "Center",
      "Left Upback",
      "Middle Upback",
      "Right Upback",
      "Left Returner",
      "Middle Returner",
      "Right Returner",
    ]),
  }),
  Object.freeze({
    squad: "kickoff" as const,
    label: "Kickoff",
    positions: Object.freeze([
      "1 Gunner",
      "2 Gunner",
      "3 Heavy",
      "4 Heavy",
      "5 Heavy",
      "6 Attacker",
      "7 Attacker",
      "8 Linebacker",
      "9 Gunner",
      "10 Linebacker",
      "Kicker",
    ]),
  }),
  Object.freeze({
    squad: "punt" as const,
    label: "Punt",
    positions: Object.freeze([
      "Left Tackle",
      "Right Tackle",
      "Left Guard",
      "Right Guard",
      "Longsnapper",
      "Left Wing",
      "Right Wing",
      "Left Wall",
      "Right Wall",
      "Middle Wall",
      "Punter",
    ]),
  }),
  Object.freeze({
    squad: "punt_return" as const,
    label: "Punt Return",
    // "DEF ON FIELD" is a plain value today — the sheet's own words, meaning
    // nothing to the schema beyond being one this squad allows.
    positions: Object.freeze(["Returner", "DEF ON FIELD"]),
  }),
  Object.freeze({
    squad: "field_goal" as const,
    label: "Field Goal",
    positions: Object.freeze([
      "Left Tackle",
      "Right Tackle",
      "Left Guard",
      "Right Guard",
      "Longsnapper",
      "Left TE",
      "Right TE",
      "Left Wing",
      "Right Wing",
      "Holder",
      "Kicker",
    ]),
  }),
  Object.freeze({
    squad: "field_goal_block" as const,
    label: "Field Goal Block",
    positions: Object.freeze(["DEF ON FIELD"]),
  }),
]);

/** `st:<squad>:<slot>` — one board column key, one record field key, one import column suffix. */
export function specialTeamsCellKey(squad: SpecialTeamsSquad, slot: SpecialTeamsSlot): string {
  return `st:${squad}:${slot}`;
}

/** The reverse, for a board column that has to say which cell it commits. */
export function parseSpecialTeamsCellKey(
  key: string,
): { squad: SpecialTeamsSquad; slot: SpecialTeamsSlot } | null {
  const parts = key.split(":");
  if (parts.length !== 3 || parts[0] !== "st") return null;
  const squad = SPECIAL_TEAMS_SQUADS.find((entry) => entry.squad === parts[1]);
  const slot = SPECIAL_TEAMS_SLOTS.find((entry) => entry.slot === parts[2]);
  if (!squad || !slot) return null;
  return { squad: squad.squad, slot: slot.slot };
}

// ---------------------------------------------------------------------------
// Issued kit — LAN-375, Clint's kit sheet
// ---------------------------------------------------------------------------

export type KitItemCode =
  | "helmet"
  | "shoulder_pads"
  | "lower_pads"
  | "lowers"
  | "practice_jersey"
  | "loaner_cleats"
  | "team_mouthguard"
  | "team_gloves"
  | "braces_left"
  | "braces_right"
  | "socks";

export interface KitItemDef {
  readonly item: KitItemCode;
  readonly label: string;
  /** Clint's own words, spellings included. Mirrored by `kit_item_options`; `tests/` proves the two agree. */
  readonly values: readonly string[];
  /**
   * Whether the item holds a set rather than one value — LAN-409. Only Braces
   * L and Braces R do: a player may wear a left ankle brace and a left knee
   * brace at once, which the two unsided single-pick slots could not record.
   */
  readonly multi?: true;
}

/** Braces L and Braces R share one list, each holding any number of it — Stewart's ask, Brian's decision of 2026-09-21 (LAN-409). */
const BRACE_VALUES: readonly string[] = Object.freeze([
  "Ankle - S",
  "Ankle - M",
  "Ankle - L",
  "Ankle - XL",
  "Knee - S",
  "Knee - M",
  "Knee - L",
  "Knee - XL",
  "Knee - XXL",
  "Knee - XXXL",
  "Knee - XXXXL",
  "Shoulder",
]);

export const KIT_ITEMS: readonly KitItemDef[] = Object.freeze([
  Object.freeze({
    item: "helmet" as const,
    label: "Helmet",
    values: Object.freeze([
      "Speedflex M",
      "Speedflex L",
      "Speedflex XL",
      "Veng Pro L",
      "Veng Pro XL",
      "Air M",
      "Air L",
      "Air XL",
      "Xenith XL",
    ]),
  }),
  Object.freeze({
    item: "shoulder_pads" as const,
    label: "Shoulder Pads",
    values: Object.freeze([
      "Riddell OL/DL 2XL",
      "Riddell OL/DL XL",
      "Riddell Skill L",
      "Riddell Skill M",
      "Riddell All purpose M",
      "Schutt OL/DL 2XL",
      "Schutt Skill L",
      "Schutt All purpose L",
      "Schutt Skill M",
      "Schutt All purpose M",
      "Schutt skill S",
      "Williams OL/DL 2XL",
      "Xenith OL/DL 2XL",
      "Bike RB/DB XL",
      "Douglas OL/DL XL",
      "Douglas Skill L",
      "Douglas Female S",
      "Douglas Female XL",
      "Shields OL/DL XL",
      "Shields all purpose L",
      "Shields all purpose M",
      "XTECH Skill XL",
      "Champro SKILL L",
      "Champro all porpose L",
      "Champro Skill M",
      "Champro Skill S",
      "Rawlings all purpose L",
    ]),
  }),
  Object.freeze({
    item: "lower_pads" as const,
    label: "Lower Pads",
    values: Object.freeze(["7 Pad Girdle", "5 Pad Girdle + Knee", "Set of pads"]),
  }),
  Object.freeze({
    item: "lowers" as const,
    label: "Lowers",
    values: Object.freeze(["Yes - Solid Blue", "Yes - Blue with Gold Stripe", "No", "Other"]),
  }),
  Object.freeze({
    item: "practice_jersey" as const,
    label: "Practice Jersey",
    values: Object.freeze(["Blue", "White", "Red"]),
  }),
  Object.freeze({
    item: "loaner_cleats" as const,
    label: "Loaner Cleats",
    values: Object.freeze(["Yes", "No"]),
  }),
  Object.freeze({
    item: "team_mouthguard" as const,
    label: "Team Mouthguard",
    values: Object.freeze(["Yes", "No"]),
  }),
  Object.freeze({
    item: "team_gloves" as const,
    label: "Team Gloves",
    values: Object.freeze(["Yes - OL/DL", "Yes - Skill", "No"]),
  }),
  Object.freeze({
    item: "braces_left" as const,
    label: "Braces L",
    values: BRACE_VALUES,
    multi: true as const,
  }),
  Object.freeze({
    item: "braces_right" as const,
    label: "Braces R",
    values: BRACE_VALUES,
    multi: true as const,
  }),
  Object.freeze({
    item: "socks" as const,
    label: "Socks",
    values: Object.freeze(["Yes", "No"]),
  }),
]);

/**
 * The five items Kit Distributed reads — Brian, 2026-09-16. Team Mouthguard is
 * deliberately not among them. The rule itself lives in the database trigger
 * `refresh_kit_distributed`; this is the same list, for the screens that
 * explain which items the flag is waiting on.
 */
export const KIT_DISTRIBUTED_ITEMS: readonly KitItemCode[] = Object.freeze([
  "helmet",
  "shoulder_pads",
  "lower_pads",
  "lowers",
  "practice_jersey",
]);

/** `kit:<item>` — one board column key, one record field key, one import column suffix. */
export function kitCellKey(item: KitItemCode): string {
  return `kit:${item}`;
}

export function parseKitCellKey(key: string): KitItemCode | null {
  if (!key.startsWith("kit:")) return null;
  const item = KIT_ITEMS.find((entry) => entry.item === key.slice(4));
  return item ? item.item : null;
}

/**
 * One kit cell's chosen values, whatever shape the screen sent — LAN-409.
 * A single select sends a string (or `""` for "blank this"), a multi-select
 * sends the whole list, and a service action takes one list either way.
 */
export function kitValuesOf(
  value: string | readonly string[] | null | undefined,
): readonly string[] {
  if (value === null || value === undefined) return [];
  if (typeof value === "string") return value === "" ? [] : [value];
  return value.filter((entry) => entry !== "");
}

/** Whether this item holds a set — LAN-409. True for Braces L and Braces R, false for the other nine. */
export function isMultiValueKitItem(item: KitItemCode): boolean {
  return KIT_ITEMS.find((entry) => entry.item === item)?.multi === true;
}

/**
 * How a multi-value kit cell separates its values in an imported file —
 * LAN-409. A semicolon, because the file's own delimiter is the comma and
 * every brace value already carries a hyphen inside it ("Ankle - M"). This is
 * the roster import's first multi-value cell; there was no convention to
 * follow.
 */
export const KIT_IMPORT_VALUE_SEPARATOR = ";";

// ---------------------------------------------------------------------------
// Warmup assignments — LAN-401, Stewart's list
// ---------------------------------------------------------------------------

/**
 * The eight warmup small groups, Stewart's own words in his own order (via
 * Brian, 2026-09-21). Mirrored by `warmup_small_groups`; `tests/` proves the
 * two agree.
 *
 * A player is in one of them or in none. Nothing is derived from it and no
 * rule ties it to a position, a coaching group or a special-teams squad: a
 * warmup small group is where somebody warms up, and says nothing about what
 * they play.
 */
export const WARMUP_SMALL_GROUP_VALUES: readonly string[] = Object.freeze([
  "Kings",
  "Raider",
  "Bear",
  "Phoenix",
  "Cavalier",
  "Blue",
  "Gold",
  "Lancer",
]);

/** The one board column key, record field key and `RosterBoardRow` field the group has. */
export const WARMUP_SMALL_GROUP_KEY = "warmupSmallGroup";

/** The import column's header, in the same `<group>_<cell>` shape `st_` and `kit_` use. */
export const WARMUP_SMALL_GROUP_IMPORT_COLUMN = "warmup_small_group";
