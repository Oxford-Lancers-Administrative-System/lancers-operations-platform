import "server-only";

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isRecoveryAuthenticatedSession } from "./recovery";

/**
 * Server-side resolution from a Supabase auth session to the club Person it
 * belongs to, and to that person's currently-effective role assignments.
 *
 * LAN-71. This is the identity half of the picture only. Nothing here enforces
 * anything: `roleCodes` is the *input* an authorization decision reads, and the
 * decision itself lives in `capabilities.ts` and `guards.ts` (LAN-73). Since
 * those landed, calling this and ignoring the result **is** a security hole —
 * a page or an action that resolves an operator and does not guard is
 * unguarded, which is why the guards, not this module, are what callers use.
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
   * sorted. A seat that has not started yet, or that has ended, is not in
   * effect. Empty is a legitimate answer: an operator who holds no committee
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
  /**
   * The display alias, embedded rather than columnar.
   *
   * LAN-182 struck `people.known_as` and moved the name a person is shown under
   * into `person_aliases`, one row of which may be flagged `is_display_name`.
   * This path reads through PostgREST rather than SQL, so it arrives as an
   * embedded array — with at most one element, which
   * `person_aliases_one_display_name_per_person` guarantees.
   */
  person_aliases: { alias: string }[] | null;
};

type AssignmentColumns = {
  role_id: string;
  effective_from: string;
  effective_to: string | null;
};

/** Midnight UTC on a `date` column's value, or `null` if it will not parse. */
function startOfDayMs(day: string): number | null {
  const parsed = Date.parse(`${day}T00:00:00Z`);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * "Currently effective" is bounded at *both* ends:
 *
 *     effective_from <= now() and (effective_to is null or effective_to > now())
 *
 * Both bounds are deliberate. Neither is an oversight to be tidied away.
 *
 *   * The **start** bound is LAN-95's correction. `effective_from` is `not
 *     null` and the schema permits a future date, because that is precisely
 *     what effective-dating exists for: a committee seat is recorded at the AGM
 *     to begin later. Without this term, next year's Treasurer resolves as
 *     holding the role today — and LAN-73's `requireRole()`, which consumes
 *     this output, would hand them authority before their seat starts. The
 *     accepted cost, decided by Brian on 2026-08-11, is that a seat dated to
 *     begin on the day of a handover confers nothing until that date.
 *
 *   * The **end** bound is LAN-71's, unchanged. An assignment whose last day
 *     has passed is over.
 *
 * Both columns are `date`, so each boundary sits at midnight UTC.
 * `d::timestamptz > now()` and `d > current_date` agree for every date, so
 * comparing a date's midnight instant against the current instant is the same
 * predicate the database would apply. Together the two terms reproduce the
 * half-open `daterange(effective_from, effective_to, '[)')` the schema's own
 * exclusion constraints use: in effect on the first day, not on the last.
 *
 * A bound that will not parse — including a column the query forgot to select,
 * which arrives as `undefined` — excludes the assignment rather than admitting
 * it. A role missing from `roleCodes` is visible and gets reported; a bound
 * silently ignored is authority nobody granted.
 */
function isCurrentlyEffective(assignment: AssignmentColumns, nowMs: number): boolean {
  const startsAt = startOfDayMs(assignment.effective_from);
  if (startsAt === null || startsAt > nowMs) return false;

  if (assignment.effective_to === null) return true;

  const endsAt = startOfDayMs(assignment.effective_to);
  if (endsAt === null) return false;

  return endsAt > nowMs;
}

/**
 * Display form. `family_name` is nullable by design — 26% of the club's real
 * records are first-name-only — so a missing surname must not produce a
 * trailing space or the string "undefined".
 */
function formatDisplayName(person: PersonNameColumns): string {
  const first = person.person_aliases?.[0]?.alias.trim() || person.given_name.trim();
  const last = person.family_name?.trim();
  return last ? `${first} ${last}` : first;
}

/**
 * Why this request has no operator, or the operator it has.
 *
 * LAN-73. `resolveOperator()` below collapses the three unresolved causes into
 * one `null` and always will — that is LAN-71's contract, and every caller that
 * only needs "is there an operator?" keeps it.
 *
 * This union exists because the account-state screens have to tell two of those
 * causes apart. Brian decided on 12 August 2026 (LAN-107, and `slice-ux.md`
 * § 8) that an unlinked account and a deactivated one must read differently,
 * because the next action differs: one person has to be linked, the other has
 * to be re-enabled, and one message that covers both sends at least one of them
 * somewhere useless.
 *
 * That is a disclosure to the **holder of the account, about their own
 * account**, made after the session has been verified. It is not a disclosure
 * about anybody else: no state carries a person, a role, another account or a
 * contact detail, and an anonymous caller reaches none of them.
 */
export type OperatorAccess =
  | { state: "no_session" }
  | { state: "unlinked" }
  | { state: "inactive" }
  | { state: "active"; operator: ResolvedOperator };

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
 * an operator with no roles would be an authorization lie now that LAN-73 reads
 * `roleCodes`.
 */
export async function resolveOperator(): Promise<ResolvedOperator | null> {
  const access = await resolveOperatorAccess();
  return access.state === "active" ? access.operator : null;
}

/**
 * The same resolution, reporting which of the four outcomes happened.
 *
 * One implementation, so the two functions cannot drift: `resolveOperator()` is
 * this function with the reason thrown away. Everything the module header says
 * about verification and about the privileged client applies here unchanged —
 * the identity still comes from `auth.getUser()`, and the join is still pinned
 * to the verified user's own id.
 *
 * ## Memoised for the length of one render, and no longer. LAN-228
 *
 * Exported through React's `cache()`, which is the pattern Next.js documents
 * for exactly this function (`guides/authentication`, "Creating a Data Access
 * Layer"). Every `/operate` page resolves the operator at least twice — the
 * layout guards the frame, the page's own gate guards the page, and neither may
 * depend on the other having run — and the events list adds a third through its
 * service-layer tier check. Each resolution is five serial round trips to the
 * Supabase API (`auth/v1/user`, then `operator_accounts`, `people`,
 * `role_assignments`, `roles`): about 150 ms on a quiet machine and 300 ms on a
 * loaded one, paid two or three times over on every operator page render
 * (`docs/lan-227-slowness-diagnosis.md` § 2.6).
 *
 * What this does **not** do is weaken any of the three checks. Every caller
 * still asks, still gets the same answer, and still refuses on it; the second
 * and third asks are answered from the first ask *in the same render* instead
 * of from five more round trips. Nothing here is shared between requests or
 * between operators: `cache()` keys on the React request that is rendering, so
 * one signed-in session's resolution is unreachable from another's, and a
 * resolution never outlives the response it was made for. A deactivation, a
 * revoked role or a signed-out session is seen by the very next request, which
 * is the same guarantee this function gave before.
 *
 * A Server Action is not inside a render, so its own guard is not memoised
 * either, and the re-render Next.js performs afterwards builds a new flight
 * request with an empty cache. An action that revokes the acting operator's own
 * access is therefore refused by the render that follows it, exactly as it was
 * before this changed.
 *
 * Outside a React render — a Vitest run, a script — `cache()` is a passthrough:
 * React's implementation calls straight through when no async dispatcher is
 * installed. So the unit tests below still see an uncached function and "stops
 * resolving as soon as the account is deactivated, with no cache" keeps its
 * teeth against a module-level cache, which is the shape that *would* be a
 * security defect.
 */
export const resolveOperatorAccess: () => Promise<OperatorAccess> = cache(readOperatorAccess);

async function readOperatorAccess(): Promise<OperatorAccess> {
  const supabase = await createClient();

  // Verified against the auth server. An absent, expired or tampered session
  // yields an error or a null user here, and every one of those is "no
  // operator" rather than an exception.
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userError ? null : (userData?.user ?? null);
  if (!user) return { state: "no_session" };

  // LAN-125. A password-recovery link mints an ordinary Supabase session, and
  // that session is a real, verified one — `getUser()` above confirms it and
  // would happily resolve the operator behind it. It must not.
  //
  // Whoever can read an operator's mailbox can follow the emailed link, decline
  // to set a password, and walk into the shell: roster, contact points,
  // availability, events, the report, and every action that operator's roles
  // permit. Because they never set a password, the operator is not locked out
  // and nothing anywhere signals the intrusion. Independent review found this
  // by walking it, and it was reproduced in a browser before this guard was
  // written — a recovery link alone reached `/operate/roster` and its members'
  // email addresses.
  //
  // So a recovery session buys exactly one thing: the right to set a password.
  // `/reset-password` asks `isRecoveryAuthenticatedSession` for permission;
  // this asks the same question and refuses the answer it wants. The two are
  // deliberately mirror images, and both consult the verified `amr` claim
  // rather than anything the browser can write.
  //
  // Reported as `no_session`, not as a fifth state, because it is the truthful
  // answer to the question this function is asked — "is there an operator
  // behind this request?" — and because the account states are LAN-107's
  // approved copy for two specific situations, neither of which is this one.
  // Nothing legitimate is refused: a completed reset signs the recovery session
  // out, and the operator returns with `amr: password`.
  // Written as "resolve only if this is provably not a recovery session",
  // never as "refuse only if recovery can be proved". The first version of this
  // guard was the second shape — it discarded the error and asked
  // `isRecoveryAuthenticatedSession(claimsData?.claims)` — and independent
  // review reproduced the whole exposure above by making `getClaims()` fail:
  // `{ data: null, error }` makes the predicate `false`, and the operator
  // resolved as if the session had been a password sign-in.
  //
  // That is reachable, not theoretical. `getClaims()` is a *separate* network
  // call from `getUser()` four lines up: with asymmetric signing keys it
  // fetches JWKS, whose cache is empty on every cold Cloud Run instance, and
  // with symmetric keys it makes a second `getUser` round trip. One transient
  // failure would have silently reopened a hole for the length of that request.
  //
  // So: absent claims are a refusal, for any reason — an error, a null, an
  // expiry between the two calls. This is what `getUser()` above already does
  // with its own error, and what `/reset-password` already does with a missing
  // recovery context. An operator inconvenienced by a blip signs in again; the
  // alternative is a mailbox reading the roster.
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const claims = claimsError ? null : (claimsData?.claims ?? null);
  if (!claims || isRecoveryAuthenticatedSession(claims)) return { state: "no_session" };

  const admin = createAdminClient();

  const { data: account, error: accountError } = await admin
    .from("operator_accounts")
    .select("person_id, is_active, email_rehome_pending_at")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (accountError) {
    throw new Error(`Could not read operator_accounts: ${accountError.message}`);
  }
  if (!account) return { state: "unlinked" };
  if (!account.is_active) return { state: "inactive" };

  // LAN-132, `REQ-rehome-email`. An administrator has moved this login to a
  // replacement address and sent a verification link to it, and the account
  // "cannot sign in until they confirm the new address" — which is what
  // `operator-account-state.ts` has told the club since LAN-131, and what this
  // line makes true.
  //
  // Without it the flow would be a hole rather than a control. Moving the
  // address stops the *old* mailbox signing in and stops it receiving a reset
  // link, which is most of the point; but this stack runs with
  // `enable_confirmations = false`, so an unconfirmed address signs in
  // perfectly well with a password that already existed. In the case the
  // requirement names — a compromised mailbox, from which somebody may already
  // have taken the password — that would leave the intruder signed in and the
  // administrator believing they had locked them out.
  //
  // Reported as `inactive` rather than as a fifth state, deliberately. The two
  // screens at `/operate` carry copy Brian approved on 12 August 2026 (LAN-107)
  // and a third one is his to write, not this package's to invent; `inactive`
  // is the honest one of the two — access is suspended and the club
  // administrator is who to ask about it. Nothing is disclosed either way:
  // every unresolved state renders the same screen with no operator data on it.
  if (account.email_rehome_pending_at !== null) return { state: "inactive" };

  const { data: person, error: personError } = await admin
    .from("people")
    .select("id, given_name, family_name, person_aliases(alias)")
    .eq("id", account.person_id)
    .eq("person_aliases.is_display_name", true)
    .maybeSingle();

  if (personError) {
    throw new Error(`Could not read the linked person: ${personError.message}`);
  }
  // `person_id` is a `not null` foreign key, so this is unreachable short of a
  // schema change. Reported as unlinked rather than crashing the request: the
  // link genuinely does not reach a person, and "contact the administrator with
  // the address you signed in with" is the right next action for a login whose
  // club record has gone missing.
  if (!person) return { state: "unlinked" };

  return {
    state: "active",
    operator: {
      authUserId: user.id,
      personId: person.id,
      displayName: formatDisplayName(person),
      roleCodes: await readCurrentRoleCodes(admin, account.person_id),
      isActive: true,
    },
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
    .select("role_id, effective_from, effective_to")
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
