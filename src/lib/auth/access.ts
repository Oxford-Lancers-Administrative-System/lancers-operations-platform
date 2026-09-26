import { capabilityRequirement, roleCodesPermit, type CapabilityKey } from "./capabilities";
import { grantRuleHolds, grantRuleKey, type GrantRule, type OperatorGrants } from "./grants";

/**
 * One requirement over both halves of access — LAN-429.
 *
 * After LAN-423 an operator's access has two sources: the capabilities that
 * stay in code (`./capabilities.ts`, read from `roleCodes`) and the grants the
 * seat page edits (`./grants.ts`, read from `grants`). A page gate or a
 * sidebar entry sometimes needs either — Events shows for any template at
 * `view` *or* an attendance capability — so this is the one shape that can say
 * both:
 *
 * - a `CapabilityKey` string — that capability, exactly as before;
 * - a {@link GrantRule} — see `./grants.ts`;
 * - `{ either: [...] }` — any one of the listed requirements.
 *
 * Every existing `gateShellPage(route, "some_capability")` call is already an
 * `AccessRule` and is unchanged.
 */
export type AccessRule = CapabilityKey | GrantRule | { readonly either: readonly AccessRule[] };

/** The two halves of an operator's access — a `ResolvedOperator` is one. */
export interface AccessHolder {
  readonly roleCodes: readonly string[];
  readonly grants: OperatorGrants;
}

function isCapabilityKey(rule: AccessRule): rule is CapabilityKey {
  return typeof rule === "string";
}

/** Whether an operator satisfies a rule. `null` (no operator) satisfies nothing. */
export function holdsAccess(holder: AccessHolder | null, rule: AccessRule): boolean {
  if (holder === null) return false;
  if (isCapabilityKey(rule)) return roleCodesPermit(holder.roleCodes, rule);
  if ("either" in rule) return rule.either.some((inner) => holdsAccess(holder, inner));
  return grantRuleHolds(holder.grants, rule);
}

/** The `rule` a refusal of this requirement carries: `capability:<key>`, `grant:…`, or `either(…)`. */
export function accessRuleKey(rule: AccessRule): string {
  if (isCapabilityKey(rule)) return `capability:${rule}`;
  if ("either" in rule) return `either(${rule.either.map(accessRuleKey).join("|")})`;
  return grantRuleKey(rule);
}

/** What a seat's access on its page does not include. The sentence a grant refusal carries. */
export const GRANT_REQUIREMENT = "This needs access your seat does not hold.";

/** The sentence a refusal screen prints for a rule. A single capability keeps its own. */
export function describeAccessRule(rule: AccessRule): string {
  if (isCapabilityKey(rule)) return capabilityRequirement(rule);
  return GRANT_REQUIREMENT;
}
