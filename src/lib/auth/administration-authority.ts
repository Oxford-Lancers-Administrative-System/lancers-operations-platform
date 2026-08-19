import "server-only";

import { NotPermitted } from "@/lib/db";
import {
  capabilityRoleCodes,
  LEADERSHIP_TIER_SEATS,
  LEADERSHIP_TIERS,
  PROTECTED_LEADERSHIP_AUTHORITY,
  roleLabel,
  ROLE_LABELS,
  type LeadershipTier,
  type ProtectedLeadershipTier,
} from "./capabilities";
import { assertCapability, OPERATOR_REQUIRED_MESSAGE, OPERATOR_REQUIRED_RULE } from "./guards";
import { resolveOperatorAccess, type ResolvedOperator } from "./operator";

/**
 * Target-level authority for operator administration — LAN-129, mission
 * M-OPERATOR-ADMIN-WITHOUT-SQL, `REQ-role-management-authority` and
 * `REQ-final-admin-protection`.
 *
 * ## Why this is a second layer rather than more capability entries
 *
 * `./capabilities.ts` answers one question: **may this operator do X at all?**
 * It answers it from a flat table of role codes, with no conditionals and no
 * inheritance, which is what makes the authorization policy of this application
 * checkable by reading rather than by tracing.
 *
 * `REQ-final-admin-protection` asks a question that table cannot express:
 * **may this operator do X to *this particular target*?** The General Manager
 * may deactivate the President; the President may not deactivate the General
 * Manager; nobody may deactivate themselves. Those are relations between an
 * actor and a target, and every attempt to encode a relation in a grant list
 * ends the same way — the list stops being a list, `roleCodesPermit()` grows a
 * second argument, and the file nobody could misread becomes the file nobody
 * reads.
 *
 * So the two layers stay apart, and both stay short:
 *
 *   1. `requireCapability("role_management")` — the floor. Three seats hold it
 *      (`DEC-role-management-authority`), and everything in Administration,
 *      read and write, stands on it.
 *   2. the rules below — the target. A named case per protected seat, plus one
 *      self-action rule and one final-path rule.
 *
 * Every guard here calls layer 1 **first** and layer 2 second. A target rule is
 * never a way in: it can only refuse somebody the capability already admitted.
 * One check runs ahead of both, and it is not a third layer: a role-scoped
 * request that does not name its role is malformed, and is refused as malformed
 * rather than evaluated. It discloses nothing — the sentence is about the shape
 * of the request, not about the club or the target — and refusing it early is
 * what stops a missing seat being read as "no seat is involved".
 *
 * ## A protected seat is protected when it is *empty*, too
 *
 * The first version of this module derived protection entirely from what the
 * target **already holds**, and independent review found the hole that leaves
 * (LAN129-B1): `assign_role` could not name the role being conferred, so the
 * check was vacuous at exactly the moment a seat can be installed — when it is
 * vacant. An IT Officer could install themselves into the General Manager seat, or a
 * confederate into it, and thereby become unremovable by every seat in the catalogue,
 * because nobody may ordinarily administer a General Manager. A vacant General
 * Manager seat is the initial state of every environment including hosted, and
 * is precisely the state this mission exists to move out of.
 *
 * `REQ-final-admin-protection` names four verbs and **assign** is the first:
 * "President and IT Officer may not ordinarily *assign*, replace, end or
 * deactivate General Manager." Three were enforced; the fourth was not.
 *
 * So a decision about a role now carries the role. The three role-scoped
 * actions — `assign_role`, `replace_role_holder` and `end_role` — require a
 * `roleCode` in the type, not as an option a caller can forget, and the
 * protected tier is the strongest among **what the target holds and what the
 * decision confers or removes**. Installing the General Manager seat is
 * therefore refused to everybody, and installing the President seat to
 * everybody but the General Manager, whether or not anyone holds it today.
 *
 * Folding the role code in also hardens `end_role` against the one weakness
 * this module's inputs otherwise have: a caller that passes stale or empty
 * `target.roleCodes` no longer escapes the leadership rule, because the role
 * being ended is named separately and is considered on its own.
 *
 * ## Where the role codes are, and why they are not here
 *
 * `tests/capability-map-single-source.test.ts` makes `./capabilities.ts` the
 * only module in `src/` permitted to name a `roles.code`. This module honours
 * that and names none: it reads `LEADERSHIP_TIERS`,
 * `PROTECTED_LEADERSHIP_AUTHORITY` and `LEADERSHIP_TIER_SEATS` from there and
 * works in tiers throughout. The division is by kind of knowledge — that file
 * knows which seats, this file knows which rules — and each stays checkable by
 * reading on its own.
 *
 * ## What is protected, and what deliberately is not
 *
 * `REQ-final-admin-protection` protects exactly two seats:
 *
 *   * **General Manager** (`standing_continuity`) — "President and IT Officer
 *     may not ordinarily assign, replace, end or deactivate General Manager",
 *     and "General Manager replacement remains exceptional IT/service recovery
 *     outside this mission". Read with `DEC-no-self-removal`, which forbids a
 *     General Manager acting on their own account, that leaves **nobody** who
 *     may ordinarily administer the seat — so the management list for this tier
 *     is empty and everybody is refused. That is not a gap: the requirement
 *     puts the exceptional route outside the mission on purpose, and inventing
 *     an in-application override would be inventing the decision it defers.
 *
 *   * **President** (`presiding`) — "General Manager may assign, replace, end
 *     or deactivate President", and "IT Officer may not ordinarily assign,
 *     replace, end or deactivate President". So: the General Manager alone.
 *
 * The **IT Officer seat is not protected**, and that is a reading rather than
 * an oversight worth stating plainly: no approved source protects it. It is
 * "transitional technical administration" (`DEC-two-tier-operating-model`), and
 * both `REQ-final-admin-protection` and `REQ-rehome-email` enumerate their
 * protections and name only President and General Manager. A President may
 * therefore end an IT Officer's assignment, which is the two-tier model working
 * as described — the club's officers govern the technical seat, not the other
 * way round. `assertAdministrationPathSurvives` is what stops that being used
 * to lock the club out.
 *
 * ## The asymmetry that is easiest to get wrong
 *
 * **Recovery is permitted where management is not.** `DEC-no-self-removal`:
 * "IT Officer may perform technical email recovery for President or GM without
 * changing organizational authority." `REQ-rehome-email` says the same from the
 * other side: "General Manager may recover President; IT Officer may
 * technically recover President or General Manager without changing their
 * authority; President may not recover General Manager."
 *
 * The distinction is exactly what the two words mean. Re-homing an email
 * address restores a person's access to their own account and moves no
 * authority anywhere; ending an assignment moves authority. So the IT Officer —
 * whose whole tier is technical — may do the first to the two seats they may
 * not do the second to. Collapsing the two into one rule breaks a locked
 * decision in whichever direction it is collapsed: fold recovery into
 * management and a locked-out President stays locked out; fold management into
 * recovery and the IT Officer can depose the General Manager.
 *
 * ## One asymmetry between assignment and replacement (LAN129-R2-A8)
 *
 * `AdministrationTargetRequest` names the seat a decision concerns and the
 * person it is done to, and for a replacement that person is the **outgoing**
 * holder. The successor is modelled in `AdministrationPathEffect`, where the
 * final-path rule needs them, and not here — so the incoming half of a
 * replacement is not put through the leadership rule.
 *
 * The visible consequence: an IT Officer is refused `assign_role` of an
 * ordinary seat to a President, and permitted `replace_role_holder` of that
 * same ordinary seat where the successor happens to be that same President.
 *
 * This is an inconsistency and not an escalation, and it is recorded rather
 * than fixed because fixing the wrong half would be worse. No authority moves
 * toward the actor: the protected person gains an ordinary seat, and the seats
 * that make them protected are untouched. If anything the assignment side is
 * the over-strict half — refusing an IT Officer the right to make a President
 * the Kit Manager is protection of a seat that was never at risk. Narrowing
 * that is a decision about what "administer the President" means, which is
 * Brian's and not this module's to take in passing.
 *
 * ## What this module does not do
 *
 * It performs no administration. Invitation, assignment, replacement, ending,
 * deactivation, restoration and email re-homing belong to `WP-invitation` and
 * `WP-assignment`; this is the layer they call before they write anything, and
 * `src/lib/services/administration-events.ts` is the ledger they write to. It
 * also reads no database: every rule here is pure over an actor and a described
 * target, so a test can pose any actor and any target, including ones that
 * could not exist.
 */

/**
 * The administration actions that have a target, as a closed set.
 *
 * Closed, and deliberately not derived from `ADMINISTRATION_ACTIONS` in the
 * audit vocabulary, because those are *events* and these are *decisions*:
 * several events (a delivery failure, an activation at first login) have no
 * administrator behind them at all, and one decision here covers the two events
 * a replacement writes. The two agree where they overlap, and
 * `administration-authority.test.ts` asserts the self-action rules match the
 * `selfActionForbidden` flags on the corresponding events, so the ledger and
 * the guard cannot drift apart silently.
 *
 * Adding an action is deliberately a change to this file: an action nobody
 * classified would otherwise fall through to whatever a caller passed.
 */
export type AdministrationTargetAction =
  | "assign_role"
  | "replace_role_holder"
  | "end_role"
  | "deactivate_account"
  | "restore_account"
  | "resend_invitation"
  | "correct_invitation"
  | "recover_email";

/**
 * What one action is, for the two rules that read it.
 *
 * `kind` selects the leadership rule — management moves authority, recovery
 * restores access without moving any. `selfForbidden` is `DEC-no-self-removal`.
 */
export interface AdministrationTargetRule {
  readonly action: AdministrationTargetAction;
  readonly kind: "management" | "recovery";
  readonly selfForbidden: boolean;
  /**
   * Whether this decision is about a particular role, and therefore carries a
   * `roleCode` that the leadership rule considers alongside the target's own
   * seats. LAN129-B1: without it, `assign_role` cannot express which seat is
   * being installed and a vacant protected seat is unguarded.
   */
  readonly roleScoped: boolean;
  /** Club-facing verb phrase, for the refusal sentence. */
  readonly phrase: string;
}

function rule(entry: AdministrationTargetRule): AdministrationTargetRule {
  return Object.freeze(entry);
}

export const ADMINISTRATION_TARGET_RULES: Readonly<
  Record<AdministrationTargetAction, AdministrationTargetRule>
> = Object.freeze({
  /**
   * Self-assignment is **not** forbidden, and that is a recorded consequence
   * rather than an omission. `DEC-no-self-removal` forbids three things —
   * deactivating yourself, removing your own role, re-homing your own email —
   * and assignment is not among them. `capabilities.ts` has recorded since
   * LAN-124 that whoever holds `role_management` can grant themselves anything
   * else; a rule here that pretended otherwise would be theatre, because the
   * same actor could assign the seat to a second account they also control.
   * The mitigation is attribution, not prevention: every assignment writes an
   * append-only audit event naming the actor and the authority they held.
   */
  assign_role: rule({
    action: "assign_role",
    kind: "management",
    selfForbidden: false,
    roleScoped: true,
    phrase: "assign this role",
  }),
  /**
   * Replacement ends the outgoing holder's assignment and creates the
   * successor's (`REQ-effective-dated-role-history`). The target of *this*
   * decision is the outgoing holder, because ending their assignment is the
   * half that removes authority — so it carries `end_role`'s self rule, and an
   * actor may not replace themselves.
   */
  replace_role_holder: rule({
    action: "replace_role_holder",
    kind: "management",
    selfForbidden: true,
    roleScoped: true,
    phrase: "replace the holder of this role",
  }),
  end_role: rule({
    action: "end_role",
    kind: "management",
    selfForbidden: true,
    roleScoped: true,
    phrase: "end this role assignment",
  }),
  deactivate_account: rule({
    action: "deactivate_account",
    kind: "management",
    selfForbidden: true,
    roleScoped: false,
    phrase: "deactivate this operator's access",
  }),
  /**
   * Restoration is management, and it is protected symmetrically with
   * deactivation on purpose. `REQ-final-admin-protection` names four verbs and
   * not this one, but a seat only the General Manager may deactivate must be a
   * seat only the General Manager may restore — otherwise the IT Officer
   * reinstates a President the General Manager stood down, and the protection
   * is one step of indirection away from nothing.
   *
   * `selfForbidden` is `false` and unreachable: a deactivated operator cannot
   * sign in, so nobody restores their own access. Marking it `true` would
   * record a rule no source states, for a case that cannot occur.
   *
   * ## The neighbouring case that is not unreachable (LAN129-A3)
   *
   * Independent review asked about the order "deactivate a person, then give
   * them a protected seat": the seat's management list then decides whether
   * they can be restored, and the General Manager's is empty, so such a person
   * could never sign in again.
   *
   * LAN129-B1's fix is most of the answer. Installing the General Manager seat
   * is now refused to **everybody** in the application, so that order cannot be
   * produced through any Administration surface. The President half is
   * reachable — a General Manager may assign the President seat to a
   * deactivated person — and is not a trap, because the same General Manager
   * may restore them: one tier, one authority, both directions.
   *
   * What remains is a General Manager seat created outside the application, by
   * the owner-run bootstrap or by a migration, on a person whose account is
   * deactivated. That state is repaired the way it was made, and
   * `REQ-final-admin-protection` already says so: "General Manager replacement
   * remains exceptional IT/service recovery outside this mission." Reclassifying
   * restoration as recovery would let the IT Officer reinstate a President the
   * General Manager stood down, which is a real hole traded for a state the
   * application can no longer create. Both halves are pinned by test.
   */
  restore_account: rule({
    action: "restore_account",
    kind: "management",
    selfForbidden: false,
    roleScoped: false,
    phrase: "restore this operator's access",
  }),
  /**
   * Resending and correcting an invitation are classified as management, which
   * is the conservative reading. No source ranks them, and both send a
   * credential-establishing link to an address the administrator may change.
   * Neither is self-reachable: an operator with a pending invitation has no
   * session.
   *
   * ## What that classification does and does not buy (LAN129-R2-A9)
   *
   * An earlier version of this note said "whoever may not assign a seat may
   * not re-issue the invitation that confers it either", as though it were
   * enforced. It is not, and independent review confirmed it by execution: an
   * IT Officer is permitted `resend_invitation` against a target holding
   * nothing at all.
   *
   * The reason is that these two are **not role-scoped**. They are judged on
   * the seats the target currently holds, so an invitation to somebody who
   * already sits in a protected seat is protected, and an invitation carrying
   * an initial protected role for a Person with no seats yet is not.
   *
   * What that would cost, stated plainly so nobody has to reconstruct it:
   * `correct_invitation` exists to change the address an invitation was sent to
   * and send it again. An administrator who may correct a pending invitation
   * can therefore redirect the credential link that invitation carries. If a
   * pending invitation conferred a protected seat and the target held no seat
   * yet, whoever could correct it could take that seat.
   *
   * It is left as it is, deliberately, because the precondition does not exist
   * on the path the approved requirements describe. Since LAN129-B1 the seat in
   * question can only be President — installing General Manager is refused to
   * everybody — and only a General Manager can have created that invitation,
   * since only they may assign it. The remaining question is whether the role
   * assignment is materialised when the invitation is sent or only when it is
   * accepted, and `REQ-deactivate-and-reinstate` answers it the safe way: a
   * successor "may remain Invitation pending without capabilities until
   * activation", which describes an assignment that exists while the account
   * does not. An assignment effective today puts the seat in
   * `target.roleCodes`, and the leadership rule then protects the invitation
   * exactly as it protects the holder.
   *
   * So this depends on a precondition `WP-invitation` creates or avoids, and it
   * is carried in that package's brief rather than pre-solved here. If that
   * package ever defers materialising the assignment, the fix is the one
   * LAN129-B1 applied: make these two role-scoped.
   */
  resend_invitation: rule({
    action: "resend_invitation",
    kind: "management",
    selfForbidden: false,
    roleScoped: false,
    phrase: "resend this invitation",
  }),
  correct_invitation: rule({
    action: "correct_invitation",
    kind: "management",
    selfForbidden: false,
    roleScoped: false,
    phrase: "correct and resend this invitation",
  }),
  /**
   * The administrator email re-home flow — `REQ-rehome-email`. Recovery, not
   * management: see the module note on the asymmetry.
   *
   * Self-forbidden by `DEC-no-self-removal` ("nobody may … administrator-rehome
   * their own email"), which is not redundant with password self-service: an
   * operator who still holds their mailbox uses forgotten-password, and an
   * administrator moving *their own* login to a new address is the exact move
   * that turns a stolen session into a permanent one.
   */
  recover_email: rule({
    action: "recover_email",
    kind: "recovery",
    selfForbidden: true,
    roleScoped: false,
    phrase: "recover this operator's email access",
  }),
});

/** Every target action, for exhaustive iteration and for tests. */
export const ADMINISTRATION_TARGET_ACTIONS: readonly AdministrationTargetAction[] = Object.freeze(
  Object.keys(ADMINISTRATION_TARGET_RULES) as AdministrationTargetAction[],
);

/**
 * Who the action is being performed on.
 *
 * `roleCodes` is the target's **currently-effective** assignments, resolved the
 * same way `resolveOperator()` resolves the actor's — a seat that has not
 * started, or that has ended, protects nobody. The caller supplies it because
 * this module reads no database; supplying a stale or empty set is the one way
 * to weaken these rules, so `WP-assignment` reads it inside the same
 * transaction as the write.
 *
 * A target with no operator account at all still has a `personId`: assigning a
 * role to a Person who has never signed in is an ordinary administration
 * action, and the leadership rules protect the seat, not the account.
 */
export interface AdministrationSubject {
  readonly personId: string;
  readonly roleCodes: readonly string[];
}

/**
 * The three decisions that are about a particular role rather than about an
 * account. Each one carries the `roleCode` it concerns.
 */
export type RoleScopedAdministrationAction = "assign_role" | "replace_role_holder" | "end_role";

/**
 * One target decision, complete.
 *
 * A discriminated union rather than three positional arguments, and that is the
 * whole point of LAN129-B1's correction: for a role-scoped action the compiler
 * **requires** `roleCode`, so a caller cannot ask "may I do this to this
 * person" while leaving out the seat that makes the answer no. The previous
 * signature accepted a subject alone, which meant a caller doing everything
 * right still could not enforce the assignment half of
 * `REQ-final-admin-protection`.
 *
 * `roleCode` is a `public.roles.code`. For `assign_role` it is the seat being
 * conferred; for `end_role` the seat being ended; for `replace_role_holder` the
 * seat changing hands, which is the same seat on both sides of the replacement.
 */
export type AdministrationTargetRequest =
  | {
      readonly action: RoleScopedAdministrationAction;
      readonly target: AdministrationSubject;
      readonly roleCode: string;
    }
  | {
      readonly action: Exclude<AdministrationTargetAction, RoleScopedAdministrationAction>;
      readonly target: AdministrationSubject;
    };

/** Programmatic rule names, so a caller never matches on message text. */
export const SELF_ACTION_RULE = "administration_self_action_forbidden";
export const LEADERSHIP_TARGET_RULE = "administration_leadership_target";
export const UNKNOWN_ACTION_RULE = "administration_action_unknown";
export const MISSING_ROLE_CODE_RULE = "administration_role_code_required";
export const UNKNOWN_ROLE_CODE_RULE = "administration_role_code_unknown";
export const FINAL_ADMINISTRATION_PATH_RULE = "administration_final_path";

/** The first sentence of every refusal in this module. Matches UX-05's heading. */
const REFUSAL_HEADLINE = "You do not have access to this action.";

/**
 * How strongly each tier protects its holder, so that a target holding several
 * is protected by the **strongest**.
 *
 * That direction is the only safe one: a person holding both the General
 * Manager and the President seat must be as hard to administer as a General
 * Manager, not as easy as a President. `technical_administration` scores lowest
 * and is filtered out entirely below — it is a tier, not a protection.
 */
const TIER_STRENGTH: Readonly<Record<LeadershipTier, number>> = Object.freeze({
  standing_continuity: 3,
  presiding: 2,
  technical_administration: 1,
});

function isProtectedTier(tier: LeadershipTier): tier is ProtectedLeadershipTier {
  return tier !== "technical_administration";
}

/**
 * Which tier protects this target, or `null` for the ordinary case.
 *
 * A role code the catalogue does not have — a typo, an invented seat — protects
 * nobody, which is the fail-closed direction here: an unknown code that granted
 * protection would let anyone shield a target by inventing a string.
 */
export function protectedTierOf(roleCodes: readonly string[]): ProtectedLeadershipTier | null {
  let strongest: ProtectedLeadershipTier | null = null;

  for (const code of roleCodes) {
    const tier = leadershipTierOf(code);
    if (!tier || !isProtectedTier(tier)) continue;
    if (!strongest || TIER_STRENGTH[tier] > TIER_STRENGTH[strongest]) strongest = tier;
  }

  return strongest;
}

/**
 * The tier a role code sits in, reading only the map's **own** keys.
 *
 * `LEADERSHIP_TIERS[code]` alone is not safe on an arbitrary string, and
 * independent review found it (LAN129-R2-A7): every JavaScript object inherits
 * `constructor`, `toString`, `__proto__` and the rest, so
 * `LEADERSHIP_TIERS["constructor"]` is the `Object` function rather than
 * `undefined`. That value is not `"technical_administration"`, so it passed the
 * protected-tier test, and the authority lookup keyed on it then threw a
 * `TypeError` — fail-*closed*, in that nothing was permitted, but a broken
 * contract: this module promises to return the operator or throw
 * `NotPermitted`, and a `TypeError` reaches an operator as "something went
 * wrong" rather than as a refusal. Once a role code arrives from a form, that is
 * a 500 instead of a refusal.
 *
 * `Object.hasOwn` is the whole fix, and it is used for every map keyed by role
 * code in this module.
 */
function leadershipTierOf(code: string): LeadershipTier | null {
  return Object.hasOwn(LEADERSHIP_TIERS, code) ? LEADERSHIP_TIERS[code] : null;
}

/**
 * Is this string a role code the approved catalogue actually has?
 *
 * Checked against `ROLE_LABELS`, which covers exactly the twenty catalogue
 * codes and is pinned character-for-character against `public.roles` by
 * `tests/operator-capability-catalogue.test.ts`. Reading it here keeps this
 * module free of role codes, which `tests/capability-map-single-source.test.ts`
 * requires.
 *
 * `Object.hasOwn` again, and for the same reason as above: `ROLE_LABELS`
 * inherits `constructor` too, so a truthiness test would accept it.
 */
function isCatalogueRoleCode(code: string): boolean {
  return Object.hasOwn(ROLE_LABELS, code);
}

/**
 * The refusal for a protected target. Names the requirement, never the reader.
 *
 * The seat comes first in the sentence because since LAN129-B1 the seat is not
 * necessarily one the target already sits in — it may be the one they are being
 * put into. "This action affects the General Manager" is true either way, where
 * "for the General Manager" read as though somebody already held it.
 */
function protectedRefusal(
  tier: ProtectedLeadershipTier,
  kind: "management" | "recovery",
  phrase: string,
): string {
  const permitted = PROTECTED_LEADERSHIP_AUTHORITY[tier][kind];
  const seat = roleLabel(LEADERSHIP_TIER_SEATS[tier]);

  if (permitted.length === 0) {
    return (
      `${REFUSAL_HEADLINE} This action affects the ${seat}. No club role may ${phrase} ` +
      "for that seat — changing it is an exceptional service-recovery procedure performed " +
      "outside the application."
    );
  }

  const roles = permitted.map((code) => roleLabel(code));
  const list =
    roles.length === 1
      ? `${roles[0]} role`
      : `${roles.slice(0, -1).join(", ")} or ${roles[roles.length - 1]} roles`;
  return (
    `${REFUSAL_HEADLINE} This action affects the ${seat}. Only the ${list} may ${phrase} ` +
    "for that seat."
  );
}

/**
 * Every role code this decision is about: the seats the target holds, plus the
 * seat the decision itself names.
 *
 * The union, and the union is the correction LAN129-B1 asked for. Protection
 * must not depend on somebody already sitting in the seat, because installing a
 * General Manager into a vacant seat is the escalation the requirement's first
 * verb forbids.
 */
function decisionRoleCodes(request: AdministrationTargetRequest): readonly string[] {
  return "roleCode" in request
    ? [...request.target.roleCodes, request.roleCode]
    : request.target.roleCodes;
}

/**
 * Pure: this operator may take this action against this target, or a refusal.
 *
 * The order is the design. Capability first, so a target rule can only narrow
 * what `role_management` admitted; then the self rule, which holds whatever the
 * target's seats are; then the leadership rule.
 *
 * Refusals name the **requirement**, never the actor's holdings — the rule
 * `guards.ts` establishes, for the same reason. They do name the *seat* being
 * protected, which is not a disclosure: the reader has already opened that
 * target's Administration page, and "only the General Manager may do this" is a
 * statement about the club's constitution rather than about a person.
 */
export function assertAdministrationTarget(
  operator: ResolvedOperator | null,
  request: AdministrationTargetRequest,
): ResolvedOperator {
  if (!operator) {
    throw new NotPermitted(OPERATOR_REQUIRED_MESSAGE, { rule: OPERATOR_REQUIRED_RULE });
  }

  const { action, target } = request;
  const definition = ADMINISTRATION_TARGET_RULES[action];
  if (!definition) {
    // An action nobody classified is refused rather than permitted. Unreachable
    // from TypeScript; reachable from a JavaScript caller, from `JSON.parse`, or
    // from a widened union that forgot this table.
    throw new NotPermitted(`${REFUSAL_HEADLINE} This administration action is not recognized.`, {
      rule: UNKNOWN_ACTION_RULE,
    });
  }

  // A role-scoped decision must name a role, and must name one the catalogue
  // really has. Both halves are refusals rather than evaluations.
  //
  // The first half is LAN129-B1: a missing seat must never mean "no seat is
  // involved", which is the reading that left a vacant General Manager
  // installable by anybody. TypeScript makes `roleCode` mandatory for these
  // three actions, so it is unreachable from typed code and checked anyway.
  //
  // The second half is LAN129-R2-A6, and it is the same defect wearing a
  // different hat. `protectedTierOf` treats an unrecognised code as
  // *unprotected*, which is right for the seats a target **holds** — an unknown
  // code granting protection would let anyone shield a target by inventing a
  // string — and exactly backwards for the code the decision itself names,
  // where unrecognised has to mean refused. Independent review executed the
  // bypass: " general_manager ", "GENERAL_MANAGER", "General Manager",
  // "general-manager" and a code with a zero-width space appended were all
  // permitted, because none of them is a catalogue key.
  //
  // The two directions are deliberately asymmetric, and that asymmetry is the
  // point rather than an inconsistency: held seats fail open into "not
  // protected", named seats fail closed into "refused".
  //
  // Nothing is normalised on the way through. A caller passing
  // " general_manager " is refused rather than trimmed, because trimming is
  // this module guessing what a caller meant about the most dangerous seat in
  // the club. An exact `public.roles.code` is the contract, and it is now
  // enforced instead of assumed — the compensating control the alternative
  // needed was "WP-invitation and WP-assignment remember to pass an exact
  // code", and depending on a future caller remembering is the dependency
  // LAN129-B1 already proved unsafe.
  if (definition.roleScoped) {
    const named = "roleCode" in request ? request.roleCode : undefined;
    if (typeof named !== "string" || named.trim() === "") {
      throw new NotPermitted(`${REFUSAL_HEADLINE} This action must name the role it concerns.`, {
        rule: MISSING_ROLE_CODE_RULE,
      });
    }
    if (!isCatalogueRoleCode(named)) {
      // The message names no role and echoes nothing the caller sent: a
      // refusal is not a place to reflect input back, and "which strings are
      // real role codes" is not a question this surface answers.
      throw new NotPermitted(
        `${REFUSAL_HEADLINE} This action names a club role that does not exist.`,
        { rule: UNKNOWN_ROLE_CODE_RULE },
      );
    }
  }

  // Layer 1. Three seats hold `role_management`; everybody else stops here,
  // including the Vice-President and the Secretary, whatever the target is.
  assertCapability(operator, "role_management");

  // Layer 2a — DEC-no-self-removal.
  if (definition.selfForbidden && operator.personId === target.personId) {
    throw new NotPermitted(
      `${REFUSAL_HEADLINE} You cannot ${definition.phrase} for your own account. ` +
        "Ask another administrator to make this change.",
      { rule: SELF_ACTION_RULE },
    );
  }

  // Layer 2b — REQ-final-admin-protection and REQ-rehome-email. Over the seats
  // the target holds *and* the seat this decision names — see `decisionRoleCodes`.
  const tier = protectedTierOf(decisionRoleCodes(request));
  if (tier) {
    const permitted = PROTECTED_LEADERSHIP_AUTHORITY[tier][definition.kind];
    const held = operator.roleCodes.some((code) => permitted.includes(code));
    // The `permitted.length === 0` term is redundant with `some` returning
    // false on an empty list, and is kept for the reason `guards.ts` keeps its
    // twin: the rewrite that reads just as plausibly — `permitted.every(...)` —
    // turns an empty list into "anyone", and the empty list here is the seat
    // nobody may touch.
    if (permitted.length === 0 || !held) {
      throw new NotPermitted(protectedRefusal(tier, definition.kind, definition.phrase), {
        rule: LEADERSHIP_TARGET_RULE,
      });
    }
  }

  return operator;
}

/**
 * The current request's operator, permitted to take this action against this
 * target, or `NotPermitted`.
 *
 * The one call an Administration server action makes. Like every guard in
 * `guards.ts` it resolves the actor from the verified session rather than
 * accepting one, so the browser cannot nominate who it is. The *target* is an
 * argument, because the target is what the request is about — and it is the
 * caller's job to have read that target's role codes from the database rather
 * than from the form.
 */
export async function requireAdministrationTarget(
  request: AdministrationTargetRequest,
): Promise<ResolvedOperator> {
  const access = await resolveOperatorAccess();
  return assertAdministrationTarget(access.state === "active" ? access.operator : null, request);
}

/**
 * Does this operator hold target-level authority? For deciding what to
 * **render**, never what to permit — a hidden control is a courtesy, and the
 * action behind it still guards.
 */
export function canAdministerTarget(
  operator: ResolvedOperator | null,
  request: AdministrationTargetRequest,
): boolean {
  try {
    assertAdministrationTarget(operator, request);
    return true;
  } catch {
    return false;
  }
}

/**
 * One person's standing as a route into Administration.
 *
 * `REQ-final-admin-protection`: "No action may eliminate every usable
 * administration path." Deciding that needs three facts about each candidate,
 * and `usable` is the one worth being pedantic about — an administrator who
 * cannot sign in is not a path. It is false for a deactivated account, for an
 * invitation that has never been accepted, and for a Person with no operator
 * account at all.
 */
export interface AdministrationPath {
  readonly personId: string;
  readonly roleCodes: readonly string[];
  /** Can this person sign in today and reach Administration? */
  readonly usable: boolean;
}

/**
 * Those paths that really are paths: usable, and holding `role_management`.
 *
 * The grant is read from the capability map on every call rather than copied
 * into a constant here, so that removing the IT Officer's transitional share —
 * one string, one array, one file — narrows this calculation in the same edit.
 * A copy would keep counting a seat that no longer administers anything, and
 * would report a surviving path that does not exist.
 */
export function usableAdministrationPaths(
  paths: readonly AdministrationPath[],
): readonly AdministrationPath[] {
  const administrators = capabilityRoleCodes("role_management");
  return paths.filter(
    (path) => path.usable && path.roleCodes.some((code) => administrators.includes(code)),
  );
}

/**
 * The effect one pending action would have on the set of administration paths.
 *
 * Three actions change the set, and this projects each. It is arithmetic over
 * the caller's own snapshot rather than a database read: `WP-assignment` holds
 * the transaction, so it holds the truth about what the rows will be.
 *
 * **Replacement is modelled here rather than decomposed by the caller**
 * (LAN129-A1). It is the one action that both removes a path and adds one, and
 * leaving a caller to take it apart invites the mistake this whole type exists
 * to prevent: counting the successor as a surviving administrator while their
 * invitation is still pending. `successor.usable` is the field that decides
 * that, and `REQ-invitation-states` is unambiguous that Invitation pending and
 * Delivery failed are not Active — a successor who has never signed in cannot
 * administer anything, and a replacement that ended the club's last usable
 * administrator must be refused even though a name now sits in the seat.
 */
export type AdministrationPathEffect =
  | { readonly kind: "deactivate_account"; readonly personId: string }
  | { readonly kind: "end_role"; readonly personId: string; readonly roleCode: string }
  | {
      readonly kind: "replace_role_holder";
      /** The outgoing holder, who loses `roleCode`. */
      readonly personId: string;
      readonly roleCode: string;
      /**
       * The incoming holder **as they will be**, including `roleCode`.
       *
       * Supplied whole rather than as an id because the successor may be a
       * Person who has no path in the snapshot at all — a brand-new operator
       * created by the same invitation. `usable` is the caller's honest answer
       * to "can this person sign in today", which for a pending invitation is
       * `false`.
       */
      readonly successor: AdministrationPath;
    };

export function remainingAdministrationPaths(
  paths: readonly AdministrationPath[],
  effect: AdministrationPathEffect,
): readonly AdministrationPath[] {
  const withoutOutgoing = paths.map((path) => {
    if (path.personId !== effect.personId) return path;
    if (effect.kind === "deactivate_account") return { ...path, usable: false };
    return { ...path, roleCodes: path.roleCodes.filter((code) => code !== effect.roleCode) };
  });

  if (effect.kind !== "replace_role_holder") return withoutOutgoing;

  const { successor } = effect;
  const existing = withoutOutgoing.find((path) => path.personId === successor.personId);

  if (!existing) return [...withoutOutgoing, successor];

  // The successor already has a path. Union the seats, and take `usable` as the
  // conjunction: a replacement hands somebody a role and never restores an
  // account, so it must not turn a deactivated or pending operator into a
  // usable administrator. Fail-closed, in the one direction that matters.
  return withoutOutgoing.map((path) =>
    path.personId === successor.personId
      ? {
          ...path,
          roleCodes: [...new Set([...path.roleCodes, ...successor.roleCodes])],
          usable: path.usable && successor.usable,
        }
      : path,
  );
}

/**
 * Pure: at least one usable administration path survives, or a refusal.
 *
 * Called with the **projected** set — what the paths would be after the action
 * — so a caller composes it with `remainingAdministrationPaths()`. Splitting it
 * that way keeps the rule testable against states that would be laborious to
 * build in a database, including the one that matters: exactly one
 * administrator, acting on the account that is the only route back in.
 *
 * This is the club's last line, and it is deliberately about *the club* rather
 * than about the actor. It fires even when the leadership rules permitted the
 * action and even when the actor is not the target — a General Manager ending
 * the President's assignment is legitimate right up to the moment that
 * President was the last usable administrator.
 */
export function assertAdministrationPathSurvives(
  projected: readonly AdministrationPath[],
): readonly AdministrationPath[] {
  const surviving = usableAdministrationPaths(projected);

  if (surviving.length === 0) {
    throw new NotPermitted(
      `${REFUSAL_HEADLINE} This would leave the club with nobody able to administer ` +
        "operator accounts and roles. Give somebody else an administration role first, " +
        "then make this change.",
      { rule: FINAL_ADMINISTRATION_PATH_RULE },
    );
  }

  return surviving;
}
