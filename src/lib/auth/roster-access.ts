import {
  grantAtLeast,
  grantRuleHolds,
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

/**
 * May move recruits to Joined — LAN-505. The status control's Joined option and
 * `flipRecruitmentProspectAction` behind it. On its own: no recruiting category
 * is needed alongside it.
 */
export const MOVE_TO_JOINED: GrantRule = Object.freeze({
  subject: Object.freeze({ kind: "switch", key: "move_recruits_to_joined" }),
  minimum: "yes",
}) as GrantRule;

/**
 * Who reaches Recruitment and its records: any recruiting category at `view`,
 * or May move recruits to Joined (LAN-505: the switch alone reaches the status
 * it moves, so it can never be granted in a state where it does nothing). An
 * `either` of two grant rules, the shape `./access.ts` reads.
 */
export const RECRUITING_REACH: { readonly either: readonly GrantRule[] } = Object.freeze({
  either: Object.freeze([
    Object.freeze({ anyOf: "recruiting", minimum: "view" }) as GrantRule,
    MOVE_TO_JOINED,
  ]),
});

/** Whether a snapshot holds May move recruits to Joined. */
export function mayMoveToJoined(grants: OperatorGrants): boolean {
  return grantRuleHolds(grants, MOVE_TO_JOINED);
}

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
 * May send Messages — LAN-520 (Brian, 31 October 2026). The Messages
 * destination, the sent history, each Message's page, New message, the
 * attachment upload and the send action. It replaced `delivery_administration`
 * for Messages alone; the messaging settings and the Messaging queue keep it.
 */
export const SEND_MESSAGES: GrantRule = Object.freeze({
  subject: Object.freeze({ kind: "switch", key: "send_messages" }),
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

/** The board's groups as it names them (`Band` in `board-columns.ts`): the ten roster groups and, since LAN-457, Attendance. */
export type RosterBoardBand =
  | "person"
  | "onboarding"
  | "membership"
  | "availability"
  | "attendance"
  | "coaching"
  | "offensive"
  | "defensive"
  | "specialTeams"
  | "warmup"
  | "kit";

/** A board group's roster category. Only Special teams is spelled differently; Attendance is the Attendance line (LAN-457). */
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
