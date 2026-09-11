import { REQUIRED_FIELD_LABELS, type RequiredField } from "@/lib/services/person-required";
import type { PeopleScope } from "@/lib/services/people-directory";

/**
 * Query-param parsing and href helpers for the missing-data queue — W7/W8.
 * Decision history: docs/ux/tickets/LAN-184-people-and-missing-queue.md.
 */

export function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/**
 * Validates the `fact` query param against the real vocabulary rather than
 * trusting a caller's text — the same whitelist discipline `roster.ts`'s
 * `ROSTER_SORT_COLUMNS` uses for `sort`. `REQUIRED_FIELD_LABELS` is the one
 * list of every `RequiredField`, so a new required fact is recognised here
 * without this module naming its own copy of the ten keys.
 */
export function isRequiredField(value: string): value is RequiredField {
  return Object.hasOwn(REQUIRED_FIELD_LABELS, value);
}

export const MISSING_SORT_OPTIONS: readonly { value: string; label: string }[] = Object.freeze([
  { value: "missing", label: "How much is missing" },
  { value: "name", label: "Name" },
]);

export function withPlayersParam(href: string, onboardingOnly: boolean): string {
  if (onboardingOnly) return href;
  const joiner = href.includes("?") ? "&" : "?";
  return `${href}${joiner}players=all`;
}

export function withScopeParam(href: string, scope: PeopleScope): string {
  if (scope !== "outside_season") return href;
  const joiner = href.includes("?") ? "&" : "?";
  return `${href}${joiner}scope=outside`;
}
