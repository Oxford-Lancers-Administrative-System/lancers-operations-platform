import "server-only";

import { NotPermitted } from "@/lib/db";
import {
  capabilityRoleCodes,
  describeRoleRequirement,
  isNarrowAttendanceRecorder,
  roleCodesPermit,
  type CapabilityKey,
} from "./capabilities";
import { accessRuleKey, describeAccessRule, holdsAccess, type AccessRule } from "./access";
import {
  grantAtLeast,
  type GrantLevel,
  type GrantRule,
  type GrantSubject,
  type LevelFor,
} from "./grants";
import { resolveOperatorAccess, type OperatorAccess, type ResolvedOperator } from "./operator";

/**
 * The authorization guards. LAN-73.
 *
 * ## The shape, and why it is two layers
 *
 * Every guard here is a thin request-bound wrapper around a **pure** assertion:
 *
 *   * `assertOperator(access)` and `assertCapability(operator, key)` take the
 *     actor as an argument. They can be called from a test with any actor at
 *     all, including ones that could not exist — an operator holding a role
 *     code nobody has, an operator holding none, a `null` operator.
 *
 *   * `requireOperator()`, `requireRole(codes)` and `requireCapability(key)`
 *     resolve the actor from the **verified session** and then call the pure
 *     assertion. They take no actor argument, and that is deliberate: a server
 *     action that accepted "who am I" as a parameter would accept whatever the
 *     browser sent. The actor is never an input to a privileged action.
 *
 * ## What a refusal is
 *
 * Always a `NotPermitted` — the `ServiceError` member built for exactly this
 * (`src/lib/db/errors.ts`), carrying `kind: "not_permitted"`. Never `null`,
 * never `false`, never a bare `Error`. A guard that returned a falsy value
 * would be ignorable by a caller that forgot to check it; one that threw an
 * anonymous `Error` would be indistinguishable from a bug and would get
 * rendered to the operator as "something went wrong" instead of as a refusal.
 *
 * ## What a refusal says
 *
 * The **requirement**, never the holdings. "This action requires the President
 * role" tells a refused operator what would fix it. Listing the roles they do
 * hold would tell an attacker who had taken the session exactly what the
 * account is worth, and listing who holds the missing role would expose the
 * committee's composition to anyone who can reach a screen. Neither ever
 * appears in a message here, and a test asserts it.
 *
 * The three unresolved causes — no session, unlinked, deactivated — produce one
 * identical message, because `requireOperator()` is called from privileged
 * paths where the distinction is nobody's business. The account-state screens
 * do distinguish them, from `resolveOperatorAccess()`, for the account's own
 * holder; see that function's note.
 */

/** The first sentence of every role refusal. Matches UX-05's heading. */
const REFUSAL_HEADLINE = "You do not have access to this action.";

/** Programmatic rule name on a refusal that had no operator at all. */
export const OPERATOR_REQUIRED_RULE = "operator_required";

/** One message for all three unresolved causes. Says nothing about which. */
export const OPERATOR_REQUIRED_MESSAGE =
  "This action needs an active Lancers operator profile. Sign in with the account " +
  "connected to your operator profile, or contact the club administrator.";

/** `rule` on a capability refusal, so callers never match on message text. */
export function capabilityRule(key: CapabilityKey): string {
  return `capability:${key}`;
}

/**
 * Pure: the resolved access, or a refusal.
 *
 * Takes the access union rather than fetching it, so a test can pass any of the
 * four outcomes without a session, a database or a mock of either.
 */
export function assertOperator(access: OperatorAccess): ResolvedOperator {
  if (access.state !== "active") {
    throw new NotPermitted(OPERATOR_REQUIRED_MESSAGE, { rule: OPERATOR_REQUIRED_RULE });
  }
  return access.operator;
}

/**
 * Pure: the operator holds one of `codes`, or a refusal naming what was needed.
 *
 * `null` is accepted and refused rather than rejected by the type system alone,
 * because the realistic mistake is a caller passing through a resolution that
 * returned nothing.
 */
export function assertRole(
  operator: ResolvedOperator | null,
  codes: readonly string[],
  options: { rule?: string; requirement?: string } = {},
): ResolvedOperator {
  const requirement = options.requirement ?? describeRoleRequirement(codes);

  if (!operator) {
    throw new NotPermitted(OPERATOR_REQUIRED_MESSAGE, { rule: OPERATOR_REQUIRED_RULE });
  }

  const held = operator.roleCodes.some((code) => codes.includes(code));

  // The `codes.length === 0` term is redundant *today* and is kept on purpose:
  // with `some`, an empty required-role list already yields `false`, so the
  // refusal happens either way. It stays because the failure it guards against
  // is silent and one refactor away — rewrite this as `codes.every(...)`, which
  // reads just as plausibly, and an empty list becomes `true` and hands the
  // action to everybody. A guard called with no required role is a guard whose
  // requirement was never decided, and that must never resolve to "anyone".
  if (codes.length === 0 || !held) {
    throw new NotPermitted(`${REFUSAL_HEADLINE} ${requirement}`, { rule: options.rule });
  }

  return operator;
}

/** Pure: the operator may exercise `key`, or a refusal naming what it needs. */
export function assertCapability(
  operator: ResolvedOperator | null,
  key: CapabilityKey,
): ResolvedOperator {
  if (!operator) {
    throw new NotPermitted(OPERATOR_REQUIRED_MESSAGE, { rule: OPERATOR_REQUIRED_RULE });
  }

  if (!roleCodesPermit(operator.roleCodes, key)) {
    const requirement = describeRoleRequirement(capabilityRoleCodes(key));
    throw new NotPermitted(`${REFUSAL_HEADLINE} ${requirement}`, { rule: capabilityRule(key) });
  }

  return operator;
}

/**
 * The current request's operator, or `NotPermitted`.
 *
 * This is the floor every `/operate` page and every privileged server action
 * stands on: a linked, active operator. It says nothing about roles — an
 * operator holding no seat at all passes it, opens the shell, and is refused
 * each privileged action individually, which is what LAN-73 requires.
 */
export async function requireOperator(): Promise<ResolvedOperator> {
  return assertOperator(await resolveOperatorAccess());
}

/** `rule` on a refusal of a general operator action to a coaching assignment. */
export const GENERAL_OPERATOR_RULE = "general_operator_required";

/** What a coach is told when a general operator action is not theirs. */
export const GENERAL_OPERATOR_MESSAGE =
  `${REFUSAL_HEADLINE} Attendance recording is the only operator surface open to a ` +
  "coaching assignment. This action requires a club role that carries general operator " +
  "access.";

/**
 * Pure: an operator who is not a narrow attendance recorder, or a refusal.
 * LAN-110.
 *
 * ## The hole this fills
 *
 * Some actions in the slice are correctly open to *any* linked active operator
 * — entering a returning player, ticking off an onboarding item. They have no
 * capability, because no decision has ever restricted them, and
 * `requireOperator()` is the right floor for them.
 *
 * It is not the right floor for a coach. LAN-110's fixed boundaries say
 * "coaches cannot edit the roster, membership, recruitment/onboarding state,
 * roles, event approval, delivery administration or leadership reports", and an
 * action guarded by the ordinary floor admits a coaching assignment exactly as
 * it admits the Social Secretary. Hiding the screen does not help: LAN-110 is
 * explicit that "the service layer enforces every read and write. Hidden
 * navigation or controls are not an authorization boundary", and a server
 * action is a POST endpoint anybody with a session can call.
 *
 * So this is the floor with the coach removed, and it is the service-layer twin
 * of the `/operate` gate's default. It narrows one actor and nobody else: every
 * operator who could call these actions yesterday still can.
 *
 * It is deliberately **not** a capability. A capability would mean deciding who
 * may enter a returning player, and nobody has — see
 * `NARROW_RECORDER_CAPABILITIES` for why that decision is not this ticket's to
 * take.
 */
export function assertGeneralOperator(operator: ResolvedOperator | null): ResolvedOperator {
  if (!operator) {
    throw new NotPermitted(OPERATOR_REQUIRED_MESSAGE, { rule: OPERATOR_REQUIRED_RULE });
  }

  if (isNarrowAttendanceRecorder(operator.roleCodes, operator.grants)) {
    throw new NotPermitted(GENERAL_OPERATOR_MESSAGE, { rule: GENERAL_OPERATOR_RULE });
  }

  return operator;
}

/**
 * The current request's operator, not being a narrow attendance recorder, or
 * `NotPermitted`.
 *
 * The floor for an action that is open to operators generally and that LAN-110
 * closes to a coaching assignment. Prefer `requireCapability()` wherever a
 * capability exists; use this only where the ordinary floor was already the
 * right answer for everybody else.
 */
export async function requireGeneralOperator(): Promise<ResolvedOperator> {
  return assertGeneralOperator(await resolveOperatorAccess().then(toOperatorOrNull));
}

/** The active operator, or `null` for each of the three unresolved causes. */
function toOperatorOrNull(access: OperatorAccess): ResolvedOperator | null {
  return access.state === "active" ? access.operator : null;
}

/**
 * The current request's operator, holding one of `codes`, or `NotPermitted`.
 *
 * Prefer `requireCapability()`. This exists for the case a later issue has
 * genuinely no capability for — and when it is used, the codes still come from
 * `capabilities.ts`, never from a literal at the call site.
 */
export async function requireRole(
  codes: readonly string[],
  options: { rule?: string; requirement?: string } = {},
): Promise<ResolvedOperator> {
  const access = await resolveOperatorAccess();
  return assertRole(access.state === "active" ? access.operator : null, codes, options);
}

/**
 * The current request's operator, permitted to exercise `key`, or
 * `NotPermitted`.
 *
 * The one call a privileged page or server action makes. It resolves the actor
 * from the verified session itself, so deleting a guard somewhere else cannot
 * grant it, and it reads the role codes from the capability map, so no call
 * site carries a policy of its own.
 */
export async function requireCapability(key: CapabilityKey): Promise<ResolvedOperator> {
  const access = await resolveOperatorAccess();
  return assertCapability(access.state === "active" ? access.operator : null, key);
}

/**
 * Does this operator hold the capability? For deciding what to *render*, never
 * for deciding what to permit — a hidden control is a courtesy, and the action
 * behind it still guards.
 */
export function operatorHasCapability(
  operator: ResolvedOperator | null,
  key: CapabilityKey,
): boolean {
  return operator ? roleCodesPermit(operator.roleCodes, key) : false;
}

// ---------------------------------------------------------------------------
// Grants — LAN-429
// ---------------------------------------------------------------------------

/**
 * The same check as {@link assertCapability}, for a grant: throws
 * `NotPermitted` unless the operator holds `subject` at `minimum` or above.
 * Takes either one line and its minimum, or a whole {@link GrantRule}.
 */
export function assertGrant<S extends GrantSubject>(
  operator: ResolvedOperator | null,
  subject: S,
  minimum: LevelFor<S>,
): ResolvedOperator;
export function assertGrant(operator: ResolvedOperator | null, rule: GrantRule): ResolvedOperator;
export function assertGrant(
  operator: ResolvedOperator | null,
  subjectOrRule: GrantSubject | GrantRule,
  minimum?: GrantLevel,
): ResolvedOperator {
  return assertAccess(operator, toGrantRule(subjectOrRule, minimum));
}

/**
 * Require the verified operator to hold a grant — the `requireCapability` of
 * grants, and the call every enforcement package makes at the top of a server
 * action:
 *
 * ```ts
 * const operator = await requireGrant({ kind: "roster", key: "kit" }, "edit");
 * const operator = await requireGrant({ kind: "template", templateId }, "manage");
 * const operator = await requireGrant({ kind: "switch", key: "add_recruits" }, "yes");
 * const operator = await requireGrant({ anyOf: "template", minimum: "manage" });
 * ```
 *
 * Refuses with `NotPermitted` — `operator_required` when there is no active
 * operator, otherwise a `grant:…` rule naming what was missing.
 */
export async function requireGrant<S extends GrantSubject>(
  subject: S,
  minimum: LevelFor<S>,
): Promise<ResolvedOperator>;
export async function requireGrant(rule: GrantRule): Promise<ResolvedOperator>;
export async function requireGrant(
  subjectOrRule: GrantSubject | GrantRule,
  minimum?: GrantLevel,
): Promise<ResolvedOperator> {
  const access = await resolveOperatorAccess();
  return assertAccess(
    access.state === "active" ? access.operator : null,
    toGrantRule(subjectOrRule, minimum),
  );
}

/**
 * Any {@link AccessRule} — a capability, a grant rule, or `{ either: [...] }`
 * of them — asserted against one operator. `gateShellPage` and the two grant
 * guards above all reduce to this.
 */
export function assertAccess(
  operator: ResolvedOperator | null,
  rule: AccessRule,
): ResolvedOperator {
  if (!operator) {
    throw new NotPermitted(OPERATOR_REQUIRED_MESSAGE, { rule: OPERATOR_REQUIRED_RULE });
  }
  if (typeof rule === "string") return assertCapability(operator, rule);
  if (!holdsAccess(operator, rule)) {
    throw new NotPermitted(`${REFUSAL_HEADLINE} ${describeAccessRule(rule)}`, {
      rule: accessRuleKey(rule),
    });
  }
  return operator;
}

/**
 * Does this operator hold the grant? For deciding what to *render* — the
 * action behind a control still calls `requireGrant`.
 */
export function operatorHoldsGrant<S extends GrantSubject>(
  operator: ResolvedOperator | null,
  subject: S,
  minimum: LevelFor<S>,
): boolean {
  return operator ? grantAtLeast(operator.grants, subject, minimum) : false;
}

/** Does this operator satisfy the rule? For rendering; see {@link operatorHoldsGrant}. */
export function operatorHoldsAccess(operator: ResolvedOperator | null, rule: AccessRule): boolean {
  return holdsAccess(operator, rule);
}

function toGrantRule(subjectOrRule: GrantSubject | GrantRule, minimum?: GrantLevel): GrantRule {
  if ("kind" in subjectOrRule) {
    if (minimum === undefined) {
      throw new Error("requireGrant(subject, minimum) needs a minimum level.");
    }
    return { subject: subjectOrRule, minimum };
  }
  return subjectOrRule;
}
