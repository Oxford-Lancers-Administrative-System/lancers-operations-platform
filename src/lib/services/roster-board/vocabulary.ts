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
