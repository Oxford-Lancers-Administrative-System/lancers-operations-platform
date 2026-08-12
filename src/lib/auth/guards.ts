import "server-only";

import { NotPermitted } from "@/lib/db";
import {
  capabilityRoleCodes,
  describeRoleRequirement,
  roleCodesPermit,
  type CapabilityKey,
} from "./capabilities";
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

  // An empty `codes` is refused, not waved through. A guard called with no
  // required role is a guard whose requirement was never decided, and the
  // fail-open reading of it hands the action to everybody.
  const held = operator.roleCodes.some((code) => codes.includes(code));
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
