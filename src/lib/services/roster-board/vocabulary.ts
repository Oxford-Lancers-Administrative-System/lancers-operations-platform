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
