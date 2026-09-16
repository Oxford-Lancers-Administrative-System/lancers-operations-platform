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
  | "braces_1"
  | "braces_2"
  | "socks";

export interface KitItemDef {
  readonly item: KitItemCode;
  readonly label: string;
  /** Clint's own words, spellings included. Mirrored by `kit_item_options`; `tests/` proves the two agree. */
  readonly values: readonly string[];
}

/** Braces 1 and Braces 2 share one list and are two plain single-selects — no count field anywhere (Brian, 2026-09-16). */
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
    item: "braces_1" as const,
    label: "Braces 1",
    values: BRACE_VALUES,
  }),
  Object.freeze({
    item: "braces_2" as const,
    label: "Braces 2",
    values: BRACE_VALUES,
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
