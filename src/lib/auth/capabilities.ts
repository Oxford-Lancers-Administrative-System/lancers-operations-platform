/**
 * The capability map: every privileged action in the First Operational Vertical
 * Slice, and the club role codes permitted to perform it.
 *
 * LAN-73. This module is deliberately the **only** place that answer exists.
 * No page, no server action and no service module carries its own inline list
 * of role codes; each one names a capability and reads it from here. Widening
 * or narrowing access is therefore a change to one file, reviewable on its own,
 * rather than an archaeology exercise across ten screens.
 *
 * Three properties this file is built to have:
 *
 *   * **It grants nothing implicitly.** A capability whose `roleCodes` is empty
 *     is refused to everybody, including the President. Absence of a decision
 *     is never permission — see the three undecided entries below, each of
 *     which names the issue that owes the decision.
 *
 *   * **It is data, not code.** No conditionals, no inheritance between
 *     capabilities, no "admin implies everything". An operator holding
 *     `head_coach` receives exactly the capabilities that list `head_coach`,
 *     which is what makes LAN-110's narrow attendance-recorder boundary
 *     checkable by reading twenty lines.
 *
 *   * **It is frozen at runtime.** `Object.freeze` on the map, on each entry
 *     and on each role list, so no later module can push a code onto a grant.
 *
 * ## Where the role codes come from
 *
 * `public.roles.code`. The catalogue is created by `scripts/seed-local.mjs`
 * (its `ROLE_SPEC` table) and by nothing else — there is no migration, ADR or
 * document that defines it, which is a real gap recorded in LAN-73's production
 * handoff: **hosted Supabase has no `roles` rows at all**, so every capability
 * here keys on codes that do not exist in production until somebody creates
 * them. `tests/operator-capability-catalogue.test.ts` checks every code named
 * here against the real seeded `public.roles` table, so a typo fails a test
 * rather than silently denying a legitimate operator forever.
 *
 * ## The grants, and who decided them
 *
 * | Capability                | Roles                                          | Decided by         |
 * | ------------------------- | ---------------------------------------------- | ------------------ |
 * | Attendance recorder       | `head_coach`, `offence_coach`, `defence_coach` | Brian, 12 Aug 2026 |
 * | Membership activation     | the four offices, plus `general_manager`       | Lead, 12 Aug 2026  |
 * | Event calendar management | President, VP, Secretary, General Manager      | Brian, 12 Aug 2026 |
 * | Event approval            | President, VP, Secretary, General Manager      | Brian, 12 Aug 2026 |
 *
 * None of them is re-derived here, and none may be re-derived by a later
 * implementer: they are recorded owner and lead decisions on LAN-73 and LAN-77.
 */

/** The privileged actions this slice knows about. */
export type CapabilityKey =
  | "attendance_recorder"
  | "membership_activation"
  | "event_calendar_management"
  | "event_approval"
  | "role_management"
  | "delivery_administration"
  | "leadership_report";

export interface Capability {
  readonly key: CapabilityKey;
  /** What the capability permits, in the club's language. Used in refusals. */
  readonly action: string;
  /**
   * `public.roles.code` for every role permitted to perform it.
   *
   * Empty means **nobody**, deliberately. It is not a placeholder for whoever
   * next touches this file — `decision` names the issue that owes the answer,
   * and that issue is where it gets made.
   */
  readonly roleCodes: readonly string[];
  /** Provenance: who decided this grant and when, or which issue still owes it. */
  readonly decision: string;
}

/**
 * Display labels for the role codes this map uses.
 *
 * Presentation text owned by this module, mirroring `roles.name` in
 * `scripts/seed-local.mjs`. It exists so that a refusal can say "the President
 * role" rather than "the president role code", and it covers only the codes
 * named below — `describeRoles()` falls back to the raw code for anything
 * else, which is ugly on screen but never wrong.
 *
 * The club says "Offensive Coordinator" and "Defensive Coordinator" for the two
 * seats the catalogue calls `offence_coach` and `defence_coach`; Brian
 * confirmed on 12 August 2026 that these are those seats, and that no
 * assistant-coach role exists.
 */
const ROLE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  president: "President",
  vice_president: "Vice-President",
  secretary: "Secretary",
  treasurer: "Treasurer",
  general_manager: "General Manager",
  head_coach: "Head Coach",
  offence_coach: "Offence Coach",
  defence_coach: "Defence Coach",
});

function capability(entry: Capability): Capability {
  return Object.freeze({ ...entry, roleCodes: Object.freeze([...entry.roleCodes]) });
}

export const CAPABILITIES: Readonly<Record<CapabilityKey, Capability>> = Object.freeze({
  /**
   * LAN-110's narrow attendance-recorder capability, and only that.
   *
   * This is *not* the general "an authorized operator records attendance" path
   * in `docs/ux/slice-ux.md` § 8 — that one resolves to "authorized operator",
   * not to role codes, and LAN-80 owns it. Gating general attendance on this
   * capability would lock out the Exec, which is why the two stay separate.
   *
   * It carries no roster editing, no activation, no approval, no role
   * management, no delivery, no report, no contact details and no availability
   * or injury data. That is proved by calling every other action with a coach
   * actor, not asserted here.
   */
  attendance_recorder: capability({
    key: "attendance_recorder",
    action: "record attendance for an occurred event",
    roleCodes: ["head_coach", "offence_coach", "defence_coach"],
    decision:
      "Brian, 12 August 2026 (LAN-108/LAN-110): the Head Coach, Offensive Coordinator " +
      "and Defensive Coordinator seats only. Assistant coaches do not hold them, and no " +
      "assistant role exists in the catalogue.",
  }),

  /**
   * Membership activation — "Exec/GM only" in the frozen model and in
   * `slice-ux.md` § 8.
   *
   * "Exec" is read as the executive committee: the four constitutional offices
   * (`is_constitutional_office` in the catalogue), plus the General Manager,
   * whom § 8 names explicitly. Recorded as a lead assumption on LAN-73 and
   * cheap to narrow — narrowing it is an edit to one array in this file.
   */
  membership_activation: capability({
    key: "membership_activation",
    action: "activate a season membership",
    roleCodes: ["president", "vice_president", "secretary", "treasurer", "general_manager"],
    decision:
      "Lead, 12 August 2026: 'Exec' = the four constitutional offices, plus the General " +
      "Manager, whom slice-ux.md § 8 names for this transition. Stated as an assumption " +
      "on LAN-73.",
  }),

  /**
   * Managing the club calendar: creating, editing, submitting, withdrawing and
   * abandoning event drafts.
   *
   * Brian's LAN-76 clarification, 12 August 2026: "The club calendar is managed
   * only by these four operator roles — President, Vice President, Secretary,
   * General Manager." It is deliberately **not** every linked operator, which
   * is what LAN-76 assumed before the clarification and what a first
   * implementation shipped; and it is deliberately not inferred from being able
   * to reach another part of the application.
   *
   * Two things this capability is not:
   *
   *   * It is not *reading* the calendar. `/operate/events` stays an ordinary
   *     operator surface — `slice-ux.md` § 3 and § 8, and LAN-73's destination
   *     map, both make Events open to any linked active operator — so an
   *     operator without this capability sees the club's events and is refused
   *     every action on them. Hiding the list would be a change to an approved
   *     contract; refusing the actions is what the clarification asks for.
   *
   *   * It is not approval. The four calendar roles prepare an event and submit
   *     it for the pre-publication safety review; `event_approval` below is who
   *     performs that review, and that is still the President alone.
   *
   * There is no ownership term anywhere in it. A calendar operator may edit or
   * withdraw a draft another calendar operator created — the club calendar is
   * the club's, not its typist's, and the creator is recorded for audit rather
   * than for permission. That is the clarification's "do not describe the club
   * calendar or event as personally owned by its creator", made concrete.
   */
  event_calendar_management: capability({
    key: "event_calendar_management",
    action: "create, edit, submit or withdraw an event draft",
    roleCodes: ["president", "vice_president", "secretary", "general_manager"],
    decision:
      "Brian, 12 August 2026 (LAN-76 owner clarification): the club calendar is managed by " +
      "the President, Vice-President, Secretary and General Manager only. The Treasurer is " +
      "deliberately not included, and no coaching seat is.",
  }),

  /**
   * Event approval — the designated approver.
   *
   * This entry previously read `["president"]`, as a lead assumption that
   * recorded the gap and deferred it to LAN-77. LAN-77 is where Brian answered
   * it, and this is that answer: the same four calendar roles that may create,
   * edit and abandon an event may also approve one, and "for the MVP, any one
   * of those four authorized operators may approve an event they created."
   *
   * So approval and calendar management now carry the **same** role list, which
   * invites the obvious question of why they are still two capabilities. They
   * stay separate because they are two different decisions that merely agree
   * today: approval is the pre-invitation safety gate and is the only action in
   * the slice that releases automated messages to real people. Separation of
   * duties — an approver who is not the author — is explicitly named as
   * something that "may be added later", and adding it means narrowing this one
   * list rather than disentangling approval from drafting across five screens.
   *
   * What this closes is the residual risk the previous entry carried: with a
   * President-only grant, the club could not approve anything while the
   * President was unavailable, which for a student club between terms is not a
   * hypothetical.
   */
  event_approval: capability({
    key: "event_approval",
    action: "approve an event and release its invitations",
    roleCodes: ["president", "vice_president", "secretary", "general_manager"],
    decision:
      "Brian, 12 August 2026 (LAN-77 owner clarification): the President, Vice-President, " +
      "Secretary and General Manager are each authorized for the approval workflow, and an " +
      "authorized operator may approve their own draft in the MVP. Supersedes the lead's " +
      "President-only assumption recorded on LAN-73.",
  }),

  /**
   * Undecided, and therefore refused to everyone.
   *
   * Operator-account and role administration is explicitly out of this slice
   * (`docs/ux/tickets/LAN-73-shell-and-access.md`, "Explicitly not in this
   * ticket"). The capability is named here so that the map enumerates every
   * privileged action the slice can refuse, and so that an attendance recorder
   * can be *proved* to be refused it. Whoever builds it decides who holds it —
   * with Brian, not in passing.
   */
  role_management: capability({
    key: "role_management",
    action: "manage operator accounts and role assignments",
    roleCodes: [],
    decision: "Undecided. Out of scope for the slice; no role holds it. Owner decision required.",
  }),

  /**
   * Undecided, and therefore refused to everyone. LAN-78 owns delivery, and is
   * blocked behind the LAN-92 decision gate.
   */
  delivery_administration: capability({
    key: "delivery_administration",
    action: "administer WhatsApp delivery, retries and revocation",
    roleCodes: [],
    decision: "Undecided. LAN-78 owns delivery and is blocked behind the LAN-92 gate.",
  }),

  /**
   * Undecided, and therefore refused to everyone.
   *
   * `slice-ux.md` § 8 restricts the report to an "authorized report operator"
   * without saying which roles that is. Naming them is an owner decision that
   * LAN-81 owes; until it is made, `/operate/report` refuses everybody rather
   * than guessing. Fail-closed is the correct direction for an authorization
   * boundary, and an empty grant that is visible in the interface is better
   * than one hidden in a comment.
   */
  leadership_report: capability({
    key: "leadership_report",
    action: "read the Monday exception and action report",
    roleCodes: [],
    decision: "Undecided. LAN-81 owes the 'authorized report operator' definition.",
  }),
});

/** Every capability key, for tests and for exhaustive iteration. */
export const CAPABILITY_KEYS: readonly CapabilityKey[] = Object.freeze(
  Object.keys(CAPABILITIES) as CapabilityKey[],
);

/** The role codes permitted to exercise a capability. Never widened here. */
export function capabilityRoleCodes(key: CapabilityKey): readonly string[] {
  return CAPABILITIES[key].roleCodes;
}

/**
 * Display form of a set of role codes: "President", or "President, Secretary
 * or General Manager". Used only to tell a refused operator what the action
 * needs — never to say what they hold.
 */
export function describeRoles(codes: readonly string[]): string {
  const labels = codes.map((code) => ROLE_LABELS[code] ?? code);
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(", ")} or ${labels[labels.length - 1]}`;
}

/**
 * One sentence naming what an action requires. This is the half of a refusal
 * that is safe to show: it describes the action's requirement, and says nothing
 * whatever about the person reading it.
 */
export function describeRoleRequirement(codes: readonly string[]): string {
  if (codes.length === 0) {
    return "No club role is currently authorized to perform this action.";
  }
  if (codes.length === 1) {
    return `This action requires the ${describeRoles(codes)} role.`;
  }
  return `This action requires one of these roles: ${describeRoles(codes)}.`;
}

/** The same sentence, for a named capability. */
export function capabilityRequirement(key: CapabilityKey): string {
  return describeRoleRequirement(CAPABILITIES[key].roleCodes);
}

/**
 * Does this set of currently-effective role codes include one the capability
 * permits?
 *
 * Pure, and deliberately takes role codes rather than a session: the same
 * decision has to be checkable from a test with an arbitrary actor, from a
 * server action and from a page, without any of them differing.
 */
export function roleCodesPermit(roleCodes: readonly string[], key: CapabilityKey): boolean {
  const permitted = CAPABILITIES[key].roleCodes;
  if (permitted.length === 0) return false;
  return roleCodes.some((code) => permitted.includes(code));
}
