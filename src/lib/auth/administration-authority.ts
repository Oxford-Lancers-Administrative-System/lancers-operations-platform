import "server-only";

import { NotPermitted } from "@/lib/db";
import {
  capabilityRoleCodes,
  LEADERSHIP_TIER_SEATS,
  LEADERSHIP_TIERS,
  PROTECTED_LEADERSHIP_AUTHORITY,
  roleLabel,
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
    phrase: "replace the holder of this role",
  }),
  end_role: rule({
    action: "end_role",
    kind: "management",
    selfForbidden: true,
    phrase: "end this role assignment",
  }),
  deactivate_account: rule({
    action: "deactivate_account",
    kind: "management",
    selfForbidden: true,
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
   */
  restore_account: rule({
    action: "restore_account",
    kind: "management",
    selfForbidden: false,
    phrase: "restore this operator's access",
  }),
  /**
   * Resending and correcting an invitation are classified as management, which
   * is the conservative reading. No source ranks them, and both send a
   * credential-establishing link to an address the administrator may change —
   * so whoever may not assign a seat may not re-issue the invitation that
   * confers it either. Neither is self-reachable: an operator with a pending
   * invitation has no session.
   */
  resend_invitation: rule({
    action: "resend_invitation",
    kind: "management",
    selfForbidden: false,
    phrase: "resend this invitation",
  }),
  correct_invitation: rule({
    action: "correct_invitation",
    kind: "management",
    selfForbidden: false,
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

/** Programmatic rule names, so a caller never matches on message text. */
export const SELF_ACTION_RULE = "administration_self_action_forbidden";
export const LEADERSHIP_TARGET_RULE = "administration_leadership_target";
export const UNKNOWN_ACTION_RULE = "administration_action_unknown";
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
    const tier = LEADERSHIP_TIERS[code];
    if (!tier || !isProtectedTier(tier)) continue;
    if (!strongest || TIER_STRENGTH[tier] > TIER_STRENGTH[strongest]) strongest = tier;
  }

  return strongest;
}

/** The refusal for a protected target. Names the requirement, never the reader. */
function protectedRefusal(
  tier: ProtectedLeadershipTier,
  kind: "management" | "recovery",
  phrase: string,
): string {
  const permitted = PROTECTED_LEADERSHIP_AUTHORITY[tier][kind];
  const seat = roleLabel(LEADERSHIP_TIER_SEATS[tier]);

  if (permitted.length === 0) {
    return (
      `${REFUSAL_HEADLINE} No club role may ${phrase} for the ${seat}. Changing that ` +
      "seat is an exceptional service-recovery procedure performed outside the application."
    );
  }

  const roles = permitted.map((code) => roleLabel(code));
  const list =
    roles.length === 1
      ? `${roles[0]} role`
      : `${roles.slice(0, -1).join(", ")} or ${roles[roles.length - 1]} roles`;
  return `${REFUSAL_HEADLINE} Only the ${list} may ${phrase} for the ${seat}.`;
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
  action: AdministrationTargetAction,
  target: AdministrationSubject,
): ResolvedOperator {
  if (!operator) {
    throw new NotPermitted(OPERATOR_REQUIRED_MESSAGE, { rule: OPERATOR_REQUIRED_RULE });
  }

  const definition = ADMINISTRATION_TARGET_RULES[action];
  if (!definition) {
    // An action nobody classified is refused rather than permitted. Unreachable
    // from TypeScript; reachable from a JavaScript caller, from `JSON.parse`, or
    // from a widened union that forgot this table.
    throw new NotPermitted(`${REFUSAL_HEADLINE} This administration action is not recognized.`, {
      rule: UNKNOWN_ACTION_RULE,
    });
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

  // Layer 2b — REQ-final-admin-protection and REQ-rehome-email.
  const tier = protectedTierOf(target.roleCodes);
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
  action: AdministrationTargetAction,
  target: AdministrationSubject,
): Promise<ResolvedOperator> {
  const access = await resolveOperatorAccess();
  return assertAdministrationTarget(
    access.state === "active" ? access.operator : null,
    action,
    target,
  );
}

/**
 * Does this operator hold target-level authority? For deciding what to
 * **render**, never what to permit — a hidden control is a courtesy, and the
 * action behind it still guards.
 */
export function canAdministerTarget(
  operator: ResolvedOperator | null,
  action: AdministrationTargetAction,
  target: AdministrationSubject,
): boolean {
  try {
    assertAdministrationTarget(operator, action, target);
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
 * Only two actions can remove a path, and this projects each. It is arithmetic
 * over the caller's own snapshot rather than a database read: `WP-assignment`
 * holds the transaction, so it holds the truth about what the rows will be.
 */
export type AdministrationPathEffect =
  | { readonly kind: "deactivate_account"; readonly personId: string }
  | { readonly kind: "end_role"; readonly personId: string; readonly roleCode: string };

export function remainingAdministrationPaths(
  paths: readonly AdministrationPath[],
  effect: AdministrationPathEffect,
): readonly AdministrationPath[] {
  return paths.map((path) => {
    if (path.personId !== effect.personId) return path;
    if (effect.kind === "deactivate_account") return { ...path, usable: false };
    return { ...path, roleCodes: path.roleCodes.filter((code) => code !== effect.roleCode) };
  });
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
