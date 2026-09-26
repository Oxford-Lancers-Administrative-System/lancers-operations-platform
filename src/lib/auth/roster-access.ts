import {
  grantAtLeast,
  type CategoryLevel,
  type GrantRule,
  type OperatorGrants,
  type RecruitingCategory,
  type RosterCategory,
} from "./grants";

/**
 * Which roster or recruiting category each part of the roster, the person
 * record and the recruit record belongs to — LAN-432, W3 of mission
 * M-GRANULAR-ROLES-AND-PERMISSIONS (LAN-423).
 *
 * Pure: no database, no framework, safe in a client bundle. The board, the
 * player record, the People pages and the recruitment pages all ask this one
 * module, so a board column and the record section that shows the same fact
 * can never answer differently ("board and record are congruent").
 *
 * ## The three levels, as a surface reads them
 *
 * - `none` — the column is absent; the record section stays in its place,
 *   locked, and its contents are never sent to the browser.
 * - `view` — the values are text; nothing opens an editor.
 * - `edit` — as before LAN-423; the write re-checks `edit` on the server.
 */

/**
 * Who reaches the roster, its records, People and Missing data: any roster
 * category at `view`. The sidebar entry and every one of those pages ask this
 * one rule, so the sidebar never offers a page that then refuses.
 */
export const ROSTER_REACH: GrantRule = Object.freeze({ anyOf: "roster", minimum: "view" });

/** Who reaches Recruitment and its records: any recruiting category at `view`. */
export const RECRUITING_REACH: GrantRule = Object.freeze({
  anyOf: "recruiting",
  minimum: "view",
});

/** May add to the roster — Add players, and the pages and actions behind it. */
export const ADD_TO_ROSTER: GrantRule = Object.freeze({
  subject: Object.freeze({ kind: "switch", key: "add_to_roster" }),
  minimum: "yes",
}) as GrantRule;

/** May add recruits — Add recruit and QR code, and the pages and actions behind them. */
export const ADD_RECRUITS: GrantRule = Object.freeze({
  subject: Object.freeze({ kind: "switch", key: "add_recruits" }),
  minimum: "yes",
}) as GrantRule;

/**
 * Merge two people into one — LAN-432. A merge rewrites a whole person: every
 * fact on the record, their memberships and their recruitment together, so it
 * asks for the whole record at its maximum: every roster category at `edit`
 * and every recruiting category at its own maximum. On the seeded matrix that
 * is exactly the seats that merged before LAN-423 (the four offices and the IT
 * Officer); narrowing any one line of a seat takes merge away, never the
 * reverse.
 */
export const WHOLE_RECORD_AUTHORITY: GrantRule = Object.freeze({
  all: Object.freeze([
    Object.freeze({ everyOf: "roster", minimum: "edit" }),
    Object.freeze({ everyOf: "recruiting", minimum: "edit" }),
  ]),
}) as GrantRule;

/** The ten roster groups as the board names them (`Band` in `board-columns.ts`). */
export type RosterBoardBand =
  | "person"
  | "onboarding"
  | "membership"
  | "availability"
  | "coaching"
  | "offensive"
  | "defensive"
  | "specialTeams"
  | "warmup"
  | "kit";

/** A board group's roster category. Only Special teams is spelled differently. */
export function categoryOfBand(band: RosterBoardBand): RosterCategory {
  return band === "specialTeams" ? "special_teams" : band;
}

/** The four position slots, as `write-position.ts` names them. */
type PositionSlot = "offence" | "offenceBackup" | "defence" | "defenceBackup";

/** Offensive assignments hold the two offence slots; Defensive assignments the two defence slots. */
export function categoryOfPosition(column: PositionSlot): RosterCategory {
  return column === "offence" || column === "offenceBackup" ? "offensive" : "defensive";
}

/** The level a snapshot holds on one roster category. */
export function rosterLevel(grants: OperatorGrants, category: RosterCategory): CategoryLevel {
  return grants.roster[category] ?? "none";
}

/** The level a snapshot holds on one recruiting category. */
export function recruitingLevel(
  grants: OperatorGrants,
  category: RecruitingCategory,
): CategoryLevel {
  return grants.recruiting[category] ?? "none";
}

/** Whether a roster category is readable (`view` or `edit`). */
export function mayViewRoster(grants: OperatorGrants, category: RosterCategory): boolean {
  return grantAtLeast(grants, { kind: "roster", key: category }, "view");
}

/** Whether a roster category is editable. */
export function mayEditRoster(grants: OperatorGrants, category: RosterCategory): boolean {
  return grantAtLeast(grants, { kind: "roster", key: category }, "edit");
}

/** Whether a recruiting category is readable. */
export function mayViewRecruiting(grants: OperatorGrants, category: RecruitingCategory): boolean {
  return grantAtLeast(grants, { kind: "recruiting", key: category }, "view");
}

/** Whether a recruiting category is editable (`recruit_events` never is). */
export function mayEditRecruiting(grants: OperatorGrants, category: RecruitingCategory): boolean {
  return grantAtLeast(grants, { kind: "recruiting", key: category }, "edit");
}

/**
 * What a record section is, for the lock: its level, or `open` for a section
 * outside the access list.
 */
export type SectionAccess = CategoryLevel | "open";

/** Whether a section's contents may be sent and drawn. */
export function sectionIsOpen(access: SectionAccess): boolean {
  return access !== "none";
}
