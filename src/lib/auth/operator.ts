import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Server-side resolution from a Supabase auth session to the club Person it
 * belongs to, and to that person's currently-effective role assignments.
 *
 * LAN-71. This is the identity half of the picture only. Nothing here enforces
 * anything: `roleCodes` is the *input* an authorization decision will read, and
 * route-level and action-level enforcement arrive in LAN-73. Calling this and
 * ignoring the result is, today, not a security hole — it is simply the state
 * of the codebase.
 *
 * Two rules this module exists to keep in one place:
 *
 *   * The identity comes from `supabase.auth.getUser()`, which verifies the
 *     token with the auth server. It never comes from a raw cookie claim or
 *     from `getSession()`, both of which a browser can write freely.
 *
 *   * `operator_accounts` is unreachable through the Data API by design (RLS
 *     on, zero policies, no grant to any browser-facing role — ADR 0010), so
 *     the join is read through the privileged admin client. That client
 *     bypasses RLS, which is exactly why the query is pinned to the verified
 *     user's own id and nothing else.
 */

/** A signed-in operator, resolved to a club identity. */
export interface ResolvedOperator {
  /** The Supabase auth user id the session was verified against. */
  authUserId: string;
  /** The `people.id` this login belongs to. The actor id every write records. */
  personId: string;
  /** Human-readable name for display only. Never a key — invariant I1. */
  displayName: string;
  /**
   * `roles.code` for every assignment currently in effect, de-duplicated and
   * sorted. Empty is a legitimate answer: an operator who holds no committee
   * or coaching seat right now is resolved, just unroled.
   */
  roleCodes: string[];
  /** Always `true`. An inactive account resolves to `null`, never to an object. */
  isActive: boolean;
}

type PersonNameColumns = {
  id: string;
  given_name: string;
  family_name: string | null;
  known_as: string | null;
};

type AssignmentColumns = {
  role_id: string;
  effective_to: string | null;
};

/**
 * LAN-71 fixes "currently effective" as `effective_to is null or
 * effective_to > now()`, and this implements exactly that reading and no other.
 *
 * Note what is deliberately *absent*: there is no `effective_from <= now()`
 * term, so a future-dated assignment resolves as current. That is the specified
 * behaviour, it is raised with Brian, and LAN-73 — which is the first issue that
 * will act on a role code — owns the question.
 *
 * `role_assignments.effective_to` is a `date`, so the boundary sits at midnight
 * UTC. `d::timestamptz > now()` and `d > current_date` agree for every date, so
 * comparing the date's midnight instant against the current instant is the same
 * predicate the database would apply: an assignment whose last day is today has
 * already ended, matching the half-open `daterange(effective_from,
 * effective_to, '[)')` the schema's own exclusion constraints use.
 */
function isCurrentlyEffective(assignment: AssignmentColumns, nowMs: number): boolean {
  if (assignment.effective_to === null) return true;

  const endsAt = Date.parse(`${assignment.effective_to}T00:00:00Z`);
  if (Number.isNaN(endsAt)) return false;

  return endsAt > nowMs;
}

/**
 * Display form. `family_name` is nullable by design — 26% of the club's real
 * records are first-name-only — so a missing surname must not produce a
 * trailing space or the string "undefined".
 */
function formatDisplayName(person: PersonNameColumns): string {
  const first = person.known_as?.trim() || person.given_name.trim();
  const last = person.family_name?.trim();
  return last ? `${first} ${last}` : first;
}

/**
 * Resolves the current request's operator, or `null`.
 *
 * Returns `null` — indistinguishably, and on purpose — when there is no
 * session, when the verified user has no `operator_accounts` row, and when that
 * row is inactive. A caller learns only "this request has no operator", never
 * whether a person record exists behind an unlinked login.
 *
 * Throws only if a query the server path depends on fails outright. That is not
 * the same thing as "no operator", and quietly reporting a broken database as
 * an operator with no roles would be an authorization lie the moment LAN-73
 * starts reading `roleCodes`.
 */
export async function resolveOperator(): Promise<ResolvedOperator | null> {
  const supabase = await createClient();

  // Verified against the auth server. An absent, expired or tampered session
  // yields an error or a null user here, and every one of those is "no
  // operator" rather than an exception.
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userError ? null : (userData?.user ?? null);
  if (!user) return null;

  const admin = createAdminClient();

  const { data: account, error: accountError } = await admin
    .from("operator_accounts")
    .select("person_id, is_active")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (accountError) {
    throw new Error(`Could not read operator_accounts: ${accountError.message}`);
  }
  if (!account || !account.is_active) return null;

  const { data: person, error: personError } = await admin
    .from("people")
    .select("id, given_name, family_name, known_as")
    .eq("id", account.person_id)
    .maybeSingle();

  if (personError) {
    throw new Error(`Could not read the linked person: ${personError.message}`);
  }
  // `person_id` is a `not null` foreign key, so this is unreachable short of a
  // schema change. Treated as "no operator" rather than crashing the request.
  if (!person) return null;

  return {
    authUserId: user.id,
    personId: person.id,
    displayName: formatDisplayName(person),
    roleCodes: await readCurrentRoleCodes(admin, account.person_id),
    isActive: true,
  };
}

/**
 * The person's currently-effective role codes.
 *
 * Two queries rather than one embedded select: `role_assignments` reaches
 * `roles` through two foreign keys — `role_id`, and the composite
 * `role_assignments_agree_with_role` that pins scope and office status — so a
 * PostgREST embed would be ambiguous and would have to be disambiguated by
 * constraint name, which is a worse thing to depend on than a second round trip
 * over a handful of rows.
 */
async function readCurrentRoleCodes(
  admin: ReturnType<typeof createAdminClient>,
  personId: string,
): Promise<string[]> {
  const { data: assignments, error: assignmentError } = await admin
    .from("role_assignments")
    .select("role_id, effective_to")
    .eq("person_id", personId);

  if (assignmentError) {
    throw new Error(`Could not read role assignments: ${assignmentError.message}`);
  }

  const nowMs = Date.now();
  const currentRoleIds = [
    ...new Set(
      (assignments ?? [])
        .filter((assignment) => isCurrentlyEffective(assignment, nowMs))
        .map((assignment) => assignment.role_id),
    ),
  ];

  if (currentRoleIds.length === 0) return [];

  const { data: roles, error: roleError } = await admin
    .from("roles")
    .select("code")
    .in("id", currentRoleIds);

  if (roleError) {
    throw new Error(`Could not read roles: ${roleError.message}`);
  }

  // Sorted so the value is stable for display, comparison and snapshotting.
  return [...new Set((roles ?? []).map((role) => role.code))].sort();
}
