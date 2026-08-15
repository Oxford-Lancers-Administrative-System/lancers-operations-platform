// @vitest-environment node
/**
 * `resolveOperator()` — the four outcomes, and the "currently effective" rule.
 *
 * These are unit tests against an in-memory stand-in for the Supabase clients,
 * because what is under test is this module's own logic: which of the three
 * unresolved causes collapse to `null`, and which role assignments count as
 * current on a given instant. The database's guarantees about the same table —
 * RLS, the grant posture, the unique and check constraints, `on delete
 * restrict` — are proven against the real database in
 * tests/schema-operator-accounts.test.ts, not here.
 *
 * The stand-in below really filters rows rather than returning a canned answer,
 * so a test that expects a person to be excluded fails if the filter is wrong.
 * It also really *projects* them: it hands back the columns the caller asked
 * for and no others, exactly as PostgREST does. That matters for LAN-95. The
 * "currently effective" rule now reads `effective_from`, and a predicate
 * changed without widening the `select` would read `undefined` in production
 * while a hand-built fixture object happily supplied the column. Here it does
 * not — drop `effective_from` from the query and the seats that ought to be
 * returned disappear instead.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `operator.ts` is server-only, and the real package throws when it is imported
// outside a server bundle. The module boundary it protects is a build concern,
// not a runtime one.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { resolveOperator, resolveOperatorAccess } from "./operator";
import { requireCapability } from "./guards";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

/**
 * A minimal working implementation of the PostgREST builder methods this
 * module uses, over plain arrays. `tables` is read at call time, so a test may
 * mutate it between two resolutions to prove nothing is cached.
 *
 * Filtering runs against whole rows and projection happens last, which is the
 * order the real thing uses: `.eq("person_id", …)` still works on a column the
 * `select` never named, and a column the `select` never named still never
 * reaches the caller.
 */
function fakeAdminClient(tables: Tables) {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      let columns: string[] = [];

      function project(row: Row): Row {
        return Object.fromEntries(
          columns.map((column) => {
            // PostgREST rejects a select naming a column that does not exist.
            // A fixture missing one is a test-authoring bug, and silence here
            // would turn it into a passing test about `undefined`.
            if (!(column in row)) {
              throw new Error(`${table} has no column "${column}" to select`);
            }
            return [column, row[column]];
          }),
        );
      }

      const builder = {
        select(requested: string) {
          columns = requested
            .split(",")
            .map((column) => column.trim())
            .filter(Boolean);
          return builder;
        },
        eq(column: string, value: unknown) {
          rows = rows.filter((row) => row[column] === value);
          return builder;
        },
        in(column: string, values: unknown[]) {
          rows = rows.filter((row) => values.includes(row[column]));
          return builder;
        },
        maybeSingle() {
          if (rows.length > 1) {
            return Promise.resolve({
              data: null,
              error: { message: `more than one row in ${table}` },
            });
          }
          const row = rows[0];
          return Promise.resolve({ data: row ? project(row) : null, error: null });
        },
        then<T>(onfulfilled: (value: { data: Row[]; error: null }) => T) {
          return Promise.resolve({ data: rows.map(project), error: null }).then(onfulfilled);
        },
      };

      return builder;
    },
  };
}

const AUTH_USER_ID = "11111111-1111-4111-8111-111111111111";
const PERSON_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_PERSON_ID = "33333333-3333-4333-8333-333333333333";

/**
 * A start date comfortably in the past under the real clock and under every
 * fake one installed below, for the cases whose subject is not the start bound.
 */
const LONG_STARTED = "2020-09-01";

/**
 * Installs the verified-user answer that `supabase.auth.getUser()` returns.
 *
 * `getClaims()` is stubbed alongside it and defaults to a password sign-in,
 * because LAN-125 made how the session was authenticated part of this
 * function's answer. A stub that returned no `amr` would let the recovery
 * refusal below pass while the guard was reading the wrong claim.
 */
function givenVerifiedUser(
  user: { id: string } | null,
  error: { message: string } | null = null,
  amr: unknown = [{ method: "password" }],
) {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: () => Promise.resolve({ data: { user }, error }),
      getClaims: () => Promise.resolve({ data: user ? { claims: { sub: user.id, amr } } : null }),
    },
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

/**
 * A verified user whose *claims* cannot be read.
 *
 * `getClaims()` is a separate network call from `getUser()` — JWKS on a cold
 * instance, or a second `getUser` round trip on symmetric keys — so this pair
 * of answers is a real state, not a contrived one. Its exact return shape is
 * `{ data: null, error }`, which is what made the first version of the recovery
 * guard fail open: the predicate simply read `false` and the operator resolved.
 */
function givenUnreadableClaims(claimsResult: { data: unknown; error: { message: string } | null }) {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: AUTH_USER_ID } }, error: null }),
      getClaims: () => Promise.resolve(claimsResult),
    },
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

function givenDatabase(tables: Tables) {
  vi.mocked(createAdminClient).mockReturnValue(
    fakeAdminClient(tables) as unknown as ReturnType<typeof createAdminClient>,
  );
}

/** A linked, active operator whose person holds one open-ended committee seat. */
function linkedOperatorTables(overrides: Partial<Tables> = {}): Tables {
  return {
    operator_accounts: [{ auth_user_id: AUTH_USER_ID, person_id: PERSON_ID, is_active: true }],
    people: [
      {
        id: PERSON_ID,
        given_name: "Rowan",
        family_name: "Ashdown",
        known_as: null,
      },
      {
        id: OTHER_PERSON_ID,
        given_name: "Someone",
        family_name: "Else",
        known_as: null,
      },
    ],
    role_assignments: [
      {
        person_id: PERSON_ID,
        role_id: "role-secretary",
        effective_from: LONG_STARTED,
        effective_to: null,
      },
    ],
    roles: [
      { id: "role-secretary", code: "secretary" },
      { id: "role-treasurer", code: "treasurer" },
      { id: "role-president", code: "president" },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("resolveOperator — no session", () => {
  it("returns null when the request carries no verified user", async () => {
    givenVerifiedUser(null);
    givenDatabase(linkedOperatorTables());

    await expect(resolveOperator()).resolves.toBeNull();
  });

  it("returns null, rather than throwing, when the session is expired or malformed", async () => {
    // Supabase reports a bad token as an error with a null user. A protected
    // page must render its signed-out path, not a 500.
    givenVerifiedUser(null, { message: "invalid JWT: token is expired" });
    givenDatabase(linkedOperatorTables());

    await expect(resolveOperator()).resolves.toBeNull();
  });

  /**
   * LAN-125, and the finding independent review walked to before this guard
   * existed: a password-recovery link mints an *ordinary* Supabase session, so
   * `getUser()` confirms it and this function would resolve the operator behind
   * it. Following the emailed link and navigating to `/operate/roster` — never
   * setting a password — opened the shell and its members' email addresses, and
   * because no password was set the operator was never locked out.
   *
   * A recovery session buys one thing: the right to set a password. Everywhere
   * else it is no session at all.
   */
  it("refuses a session that came from a recovery link", async () => {
    givenVerifiedUser({ id: AUTH_USER_ID }, null, [{ method: "otp", timestamp: 1 }]);
    givenDatabase(linkedOperatorTables());

    await expect(resolveOperatorAccess()).resolves.toEqual({ state: "no_session" });
    await expect(resolveOperator()).resolves.toBeNull();
  });

  it("refuses it even when the operator behind it is perfectly good", async () => {
    // The fixture is a linked, active operator with a current seat — the same
    // one every passing test above uses. Nothing about the *account* is wrong;
    // the refusal is about how this request authenticated.
    givenVerifiedUser({ id: AUTH_USER_ID }, null, [{ method: "otp" }]);
    givenDatabase(linkedOperatorTables());

    const refused = await resolveOperatorAccess();

    expect(refused.state).toBe("no_session");
    expect(JSON.stringify(refused)).not.toContain(PERSON_ID);
  });

  it("reports it as no session rather than as an account state", async () => {
    // LAN-107's unlinked and inactive copy is approved for two specific
    // situations, and this is neither. Borrowing one would tell an operator
    // mid-recovery that their access had been revoked.
    givenVerifiedUser({ id: AUTH_USER_ID }, null, [{ method: "otp" }]);
    givenDatabase(linkedOperatorTables());

    const refused = await resolveOperatorAccess();

    expect(refused.state).not.toBe("unlinked");
    expect(refused.state).not.toBe("inactive");
  });

  /**
   * The correction's own defect, found by independent review by injecting the
   * real error shape rather than by reading the code.
   *
   * The guard used to ask "is this provably a recovery session?" and refuse only
   * then. An unanswerable `getClaims()` returns `{ data: null, error }`, which
   * made that question read `false` — so a failed claims lookup resolved the
   * operator exactly as a password sign-in would, and the whole exposure came
   * back for the length of that request, silently.
   *
   * `getClaims()` is a *separate* network call from the `getUser()` above it, so
   * one can fail while the other succeeds: JWKS is fetched on every cold
   * instance, and symmetric keys make a second round trip. The question is now
   * "is this provably *not* a recovery session?", and absent claims are a
   * refusal whatever the reason.
   */
  it.each([
    ["the claims lookup errors", { data: null, error: { message: "jwks fetch failed" } }],
    ["the claims lookup returns nothing", { data: null, error: null }],
    ["the payload carries no claims", { data: {}, error: null }],
    ["the claims are not an object", { data: { claims: null }, error: null }],
  ])("refuses the session when %s", async (_why, claimsResult) => {
    givenUnreadableClaims(claimsResult);
    givenDatabase(linkedOperatorTables());

    const refused = await resolveOperatorAccess();

    expect(refused).toEqual({ state: "no_session" });
    expect(JSON.stringify(refused)).not.toContain(PERSON_ID);
  });

  it("still resolves an ordinary password session", async () => {
    // The counterweight. A guard that refused every session would satisfy all
    // three assertions above and break the application.
    givenVerifiedUser({ id: AUTH_USER_ID });
    givenDatabase(linkedOperatorTables());

    await expect(resolveOperatorAccess()).resolves.toMatchObject({ state: "active" });
  });

  it("trusts the verified user, not a cookie that merely claims one", async () => {
    // The cookie-backed session object claims a user; `getUser()`, which checks
    // the token against the auth server, does not confirm one. Resolving from
    // the claim would hand a forged cookie a real person and their roles.
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: () => Promise.resolve({ data: { user: null }, error: null }),
        getSession: () =>
          Promise.resolve({ data: { session: { user: { id: AUTH_USER_ID } } }, error: null }),
      },
    } as unknown as Awaited<ReturnType<typeof createClient>>);
    givenDatabase(linkedOperatorTables());

    await expect(resolveOperator()).resolves.toBeNull();
  });
});

describe("resolveOperator — no link", () => {
  it("returns null when the verified user has no operator account", async () => {
    givenVerifiedUser({ id: AUTH_USER_ID });
    givenDatabase(linkedOperatorTables({ operator_accounts: [] }));

    await expect(resolveOperator()).resolves.toBeNull();
  });

  it("does not resolve to somebody else's account", async () => {
    // The lookup must be pinned to this user's id. A resolution that ignored
    // `auth_user_id` would happily return the only row in the table.
    givenVerifiedUser({ id: "99999999-9999-4999-8999-999999999999" });
    givenDatabase(linkedOperatorTables());

    await expect(resolveOperator()).resolves.toBeNull();
  });
});

describe("resolveOperator — inactive link", () => {
  it("returns null when the link exists but is deactivated", async () => {
    givenVerifiedUser({ id: AUTH_USER_ID });
    givenDatabase(
      linkedOperatorTables({
        operator_accounts: [
          {
            auth_user_id: AUTH_USER_ID,
            person_id: PERSON_ID,
            is_active: false,
            disabled_at: "2026-08-01T00:00:00Z",
          },
        ],
      }),
    );

    const resolved = await resolveOperator();

    // Not "the person with no roles" — nothing at all. A revoked operator that
    // still resolved to an identity would keep working the moment LAN-73 wrote
    // a check that only looked at `roleCodes`.
    expect(resolved).toBeNull();
  });

  it("stops resolving as soon as the account is deactivated, with no cache", async () => {
    givenVerifiedUser({ id: AUTH_USER_ID });
    const tables = linkedOperatorTables();
    givenDatabase(tables);

    expect(await resolveOperator()).not.toBeNull();

    tables.operator_accounts[0].is_active = false;
    tables.operator_accounts[0].disabled_at = "2026-08-11T09:00:00Z";

    expect(await resolveOperator()).toBeNull();
  });
});

describe("resolveOperator — the unresolved causes stay indistinguishable", () => {
  /**
   * LAN-95 reworded what `/dashboard` shows and deliberately did not change
   * what this function returns. All three causes are still a bare `null` — no
   * reason code, no discriminated result, nothing a caller could branch on to
   * learn whether a person record exists behind an unlinked login.
   */
  it("answers with the identical bare null for all three causes", async () => {
    givenVerifiedUser(null);
    givenDatabase(linkedOperatorTables());
    const noSession = await resolveOperator();

    givenVerifiedUser({ id: AUTH_USER_ID });
    givenDatabase(linkedOperatorTables({ operator_accounts: [] }));
    const noLink = await resolveOperator();

    givenVerifiedUser({ id: AUTH_USER_ID });
    givenDatabase(
      linkedOperatorTables({
        operator_accounts: [{ auth_user_id: AUTH_USER_ID, person_id: PERSON_ID, is_active: false }],
      }),
    );
    const inactiveLink = await resolveOperator();

    // Three causes, one indistinguishable value — not an object carrying a
    // reason, and not `undefined` for one of them either.
    expect([noSession, noLink, inactiveLink]).toEqual([null, null, null]);
    for (const outcome of [noSession, noLink, inactiveLink]) {
      expect(outcome).toBeNull();
    }
  });

  it("resolves to an object with exactly the documented shape, and no reason field", async () => {
    givenVerifiedUser({ id: AUTH_USER_ID });
    givenDatabase(linkedOperatorTables());

    const resolved = await resolveOperator();

    expect(Object.keys(resolved ?? {}).sort()).toEqual([
      "authUserId",
      "displayName",
      "isActive",
      "personId",
      "roleCodes",
    ]);
  });
});

describe("resolveOperator — resolved operator", () => {
  it("returns the linked person and their current role codes", async () => {
    givenVerifiedUser({ id: AUTH_USER_ID });
    givenDatabase(linkedOperatorTables());

    await expect(resolveOperator()).resolves.toEqual({
      authUserId: AUTH_USER_ID,
      personId: PERSON_ID,
      displayName: "Rowan Ashdown",
      roleCodes: ["secretary"],
      isActive: true,
    });
  });

  it("returns every concurrently-held role, de-duplicated and sorted", async () => {
    // One person holding an Office plus other seats is legal, real, and the
    // case the seeded 2026-27 committee contains.
    givenVerifiedUser({ id: AUTH_USER_ID });
    givenDatabase(
      linkedOperatorTables({
        role_assignments: [
          {
            person_id: PERSON_ID,
            role_id: "role-treasurer",
            effective_from: LONG_STARTED,
            effective_to: null,
          },
          {
            person_id: PERSON_ID,
            role_id: "role-secretary",
            effective_from: LONG_STARTED,
            effective_to: null,
          },
          {
            person_id: PERSON_ID,
            role_id: "role-secretary",
            effective_from: LONG_STARTED,
            effective_to: "2099-01-01",
          },
        ],
      }),
    );

    const resolved = await resolveOperator();

    expect(resolved?.roleCodes).toEqual(["secretary", "treasurer"]);
  });

  it("returns an empty role list — not null, not an error — for an unroled operator", async () => {
    givenVerifiedUser({ id: AUTH_USER_ID });
    givenDatabase(linkedOperatorTables({ role_assignments: [] }));

    const resolved = await resolveOperator();

    expect(resolved).not.toBeNull();
    expect(resolved?.personId).toBe(PERSON_ID);
    expect(resolved?.roleCodes).toEqual([]);
  });

  it("returns only this operator's roles, never another person's", async () => {
    givenVerifiedUser({ id: AUTH_USER_ID });
    givenDatabase(
      linkedOperatorTables({
        role_assignments: [
          {
            person_id: PERSON_ID,
            role_id: "role-secretary",
            effective_from: LONG_STARTED,
            effective_to: null,
          },
          {
            person_id: OTHER_PERSON_ID,
            role_id: "role-president",
            effective_from: LONG_STARTED,
            effective_to: null,
          },
        ],
      }),
    );

    const resolved = await resolveOperator();

    expect(resolved?.roleCodes).toEqual(["secretary"]);
  });

  it("prefers a known-as name and copes with the missing surname 26% of records have", async () => {
    givenVerifiedUser({ id: AUTH_USER_ID });
    givenDatabase(
      linkedOperatorTables({
        people: [{ id: PERSON_ID, given_name: "Benjamin", family_name: null, known_as: "Ben" }],
      }),
    );

    await expect(resolveOperator()).resolves.toMatchObject({ displayName: "Ben" });
  });
});

describe("resolveOperator — currently-effective role assignments", () => {
  type Bounds = { from?: string; to?: string | null };

  /**
   * Resolves, at `instant`, an operator holding one seat with the given bounds,
   * and returns their role codes.
   *
   * The operator is linked and active throughout, so `resolveOperator()` must
   * never answer `null` here. Asserting that inside the helper keeps an empty
   * `roleCodes` — the shape over-exclusion takes — from being confused with a
   * resolution failure by any test below.
   */
  async function roleCodesAt(instant: string, bounds: Bounds): Promise<string[]> {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(instant));
    givenVerifiedUser({ id: AUTH_USER_ID });
    givenDatabase(
      linkedOperatorTables({
        role_assignments: [
          {
            person_id: PERSON_ID,
            role_id: "role-secretary",
            effective_from: bounds.from ?? LONG_STARTED,
            effective_to: bounds.to ?? null,
          },
        ],
      }),
    );

    const resolved = await resolveOperator();
    expect(resolved).not.toBeNull();
    return resolved?.roleCodes ?? [];
  }

  describe("the end bound — LAN-71's rule, unchanged", () => {
    it("includes an open-ended assignment", async () => {
      expect(await roleCodesAt("2026-08-11T12:00:00Z", { to: null })).toEqual(["secretary"]);
    });

    it("includes an assignment that ends in the future", async () => {
      expect(await roleCodesAt("2026-08-11T12:00:00Z", { to: "2026-08-12" })).toEqual([
        "secretary",
      ]);
    });

    it("excludes an assignment that has already ended", async () => {
      // The seeded 2025-26 committee is exactly this: end-dated at the AGM.
      expect(await roleCodesAt("2026-08-11T12:00:00Z", { to: "2026-06-10" })).toEqual([]);
    });

    it("includes an assignment right up to the instant it ends", async () => {
      // One millisecond before the boundary, the seat is still held.
      expect(await roleCodesAt("2026-08-10T23:59:59.999Z", { to: "2026-08-11" })).toEqual([
        "secretary",
      ]);
    });

    it("excludes an assignment at exactly the instant it ends", async () => {
      // `effective_to > now()` is strict, and `effective_to` is a date, so the
      // boundary is midnight UTC. This matches the half-open `[)` daterange the
      // schema's own exclusion constraints use.
      expect(await roleCodesAt("2026-08-11T00:00:00.000Z", { to: "2026-08-11" })).toEqual([]);
    });

    it("excludes an assignment just after the instant it ends", async () => {
      expect(await roleCodesAt("2026-08-11T00:00:00.001Z", { to: "2026-08-11" })).toEqual([]);
    });
  });

  describe("the start bound — LAN-95's correction", () => {
    it("excludes a seat that does not begin until next season", async () => {
      // Next year's Treasurer, recorded at the AGM. Before LAN-95 this resolved
      // as a role held today, and LAN-73's requireRole() would have honoured it.
      expect(await roleCodesAt("2026-08-11T12:00:00Z", { from: "2027-06-10", to: null })).toEqual(
        [],
      );
    });

    it("excludes a seat one millisecond before it begins", async () => {
      expect(
        await roleCodesAt("2026-08-10T23:59:59.999Z", { from: "2026-08-11", to: null }),
      ).toEqual([]);
    });

    it("includes a seat at exactly the instant it begins", async () => {
      // `effective_from` is a date, so its instant is midnight UTC, and the
      // bound is inclusive — the first day of a seat is a day in the seat.
      // Together with the exclusive end bound this reproduces `[)`.
      expect(
        await roleCodesAt("2026-08-11T00:00:00.000Z", { from: "2026-08-11", to: null }),
      ).toEqual(["secretary"]);
    });

    it("includes a seat one millisecond after it begins", async () => {
      expect(
        await roleCodesAt("2026-08-11T00:00:00.001Z", { from: "2026-08-11", to: null }),
      ).toEqual(["secretary"]);
    });

    it("reads the start bound from the database rather than assuming one", async () => {
      // The trap this change turns on. The fake client hands back only the
      // columns the module's `select` names, so a predicate that consults
      // `effective_from` while the query still fetches `role_id, effective_to`
      // reads `undefined`, fails to parse it, and drops this plainly-current
      // seat. Changing the predicate without widening the query fails here.
      expect(await roleCodesAt("2026-08-11T12:00:00Z", { from: "2020-09-01", to: null })).toEqual([
        "secretary",
      ]);
    });

    it("excludes a seat whose start bound will not parse, rather than admitting it", async () => {
      // `effective_from` is `not null` in the schema, so this is unreachable
      // short of corruption. Failing closed is still the right direction: a
      // missing role gets reported, a silently ignored bound does not.
      expect(await roleCodesAt("2026-08-11T12:00:00Z", { from: "not-a-date", to: null })).toEqual(
        [],
      );
    });
  });

  describe("a genuinely current seat survives both bounds", () => {
    it("keeps a seat that started yesterday and has not ended", async () => {
      expect(await roleCodesAt("2026-08-11T12:00:00Z", { from: "2026-08-10", to: null })).toEqual([
        "secretary",
      ]);
    });

    it("keeps a seat bounded on both sides around today", async () => {
      expect(
        await roleCodesAt("2026-08-11T12:00:00Z", { from: "2026-06-10", to: "2027-06-10" }),
      ).toEqual(["secretary"]);
    });

    it("keeps the current seat while dropping the expired and the not-yet-started", async () => {
      // The dangerous failure mode is the opposite of a leak: a predicate that
      // is too strict empties `roleCodes`, which reads as "holds no seat"
      // rather than as an error, and would quietly deny access under LAN-73.
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-11T12:00:00Z"));
      givenVerifiedUser({ id: AUTH_USER_ID });
      givenDatabase(
        linkedOperatorTables({
          role_assignments: [
            {
              person_id: PERSON_ID,
              role_id: "role-president",
              effective_from: "2025-06-10",
              effective_to: "2026-06-10",
            },
            {
              person_id: PERSON_ID,
              role_id: "role-treasurer",
              effective_from: "2027-06-10",
              effective_to: null,
            },
            {
              person_id: PERSON_ID,
              role_id: "role-secretary",
              effective_from: "2026-06-10",
              effective_to: null,
            },
          ],
        }),
      );

      const resolved = await resolveOperator();

      expect(resolved).not.toBeNull();
      expect(resolved?.roleCodes).toEqual(["secretary"]);
    });

    it("keeps two concurrent seats that both started in the past", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-11T12:00:00Z"));
      givenVerifiedUser({ id: AUTH_USER_ID });
      givenDatabase(
        linkedOperatorTables({
          role_assignments: [
            {
              person_id: PERSON_ID,
              role_id: "role-secretary",
              effective_from: "2026-06-10",
              effective_to: null,
            },
            {
              person_id: PERSON_ID,
              role_id: "role-treasurer",
              effective_from: "2024-06-10",
              effective_to: "2027-06-10",
            },
          ],
        }),
      );

      const resolved = await resolveOperator();

      expect(resolved?.roleCodes).toEqual(["secretary", "treasurer"]);
    });

    it("keeps the outgoing seat the day before a recorded handover", async () => {
      // A handover recorded in advance: the outgoing seat runs to the changeover
      // date, the incoming one starts on it. The day before, only the outgoing
      // one counts — and it does still count.
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-10T12:00:00Z"));
      givenVerifiedUser({ id: AUTH_USER_ID });
      givenDatabase(
        linkedOperatorTables({
          role_assignments: [
            {
              person_id: PERSON_ID,
              role_id: "role-president",
              effective_from: "2025-06-10",
              effective_to: "2026-08-11",
            },
            {
              person_id: PERSON_ID,
              role_id: "role-treasurer",
              effective_from: "2026-08-11",
              effective_to: null,
            },
          ],
        }),
      );

      const resolved = await resolveOperator();

      expect(resolved?.roleCodes).toEqual(["president"]);
    });

    it("hands over to the incoming seat on the changeover day itself", async () => {
      // The same two rows one day later: the outgoing seat has ended and the
      // incoming one has begun. Exactly one seat is held on each side of the
      // boundary — no gap, no overlap.
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-11T00:00:00.000Z"));
      givenVerifiedUser({ id: AUTH_USER_ID });
      givenDatabase(
        linkedOperatorTables({
          role_assignments: [
            {
              person_id: PERSON_ID,
              role_id: "role-president",
              effective_from: "2025-06-10",
              effective_to: "2026-08-11",
            },
            {
              person_id: PERSON_ID,
              role_id: "role-treasurer",
              effective_from: "2026-08-11",
              effective_to: null,
            },
          ],
        }),
      );

      const resolved = await resolveOperator();

      expect(resolved?.roleCodes).toEqual(["treasurer"]);
    });
  });
});

/**
 * LAN-73 — the four outcomes, reported rather than collapsed.
 *
 * `resolveOperator()` answers `null` for three different situations, on
 * purpose, and every test above depends on that staying true.
 * `resolveOperatorAccess()` is the same resolution with the reason kept, which
 * the account-state screens need and which no privileged path is given.
 *
 * These run over the same fake database as everything above, so the two
 * functions are proved to agree on real filtering rather than on a fixture.
 */
describe("resolveOperatorAccess — the reason, for the account's own holder", () => {
  it("reports no session when the request carries no verified user", async () => {
    givenVerifiedUser(null);
    givenDatabase(linkedOperatorTables());

    await expect(resolveOperatorAccess()).resolves.toEqual({ state: "no_session" });
  });

  it("reports unlinked when the verified user has no operator account", async () => {
    givenVerifiedUser({ id: "44444444-4444-4444-8444-444444444444" });
    givenDatabase(linkedOperatorTables());

    await expect(resolveOperatorAccess()).resolves.toEqual({ state: "unlinked" });
  });

  it("reports inactive when the link exists but is deactivated", async () => {
    givenVerifiedUser({ id: AUTH_USER_ID });
    givenDatabase(
      linkedOperatorTables({
        operator_accounts: [{ auth_user_id: AUTH_USER_ID, person_id: PERSON_ID, is_active: false }],
      }),
    );

    await expect(resolveOperatorAccess()).resolves.toEqual({ state: "inactive" });
  });

  it("tells unlinked and inactive apart, which resolveOperator deliberately does not", async () => {
    givenVerifiedUser({ id: "44444444-4444-4444-8444-444444444444" });
    givenDatabase(linkedOperatorTables());
    const unlinked = await resolveOperatorAccess();

    givenVerifiedUser({ id: AUTH_USER_ID });
    givenDatabase(
      linkedOperatorTables({
        operator_accounts: [{ auth_user_id: AUTH_USER_ID, person_id: PERSON_ID, is_active: false }],
      }),
    );
    const inactive = await resolveOperatorAccess();

    expect(unlinked.state).not.toBe(inactive.state);
    // Neither carries anything beyond the state itself — no person, no id, no
    // email, nothing a screen could render by accident.
    expect(Object.keys(unlinked)).toEqual(["state"]);
    expect(Object.keys(inactive)).toEqual(["state"]);
  });

  it("carries the resolved operator, unchanged, when the account is active", async () => {
    givenVerifiedUser({ id: AUTH_USER_ID });
    givenDatabase(linkedOperatorTables());
    const access = await resolveOperatorAccess();

    givenVerifiedUser({ id: AUTH_USER_ID });
    givenDatabase(linkedOperatorTables());
    const resolved = await resolveOperator();

    expect(access).toEqual({ state: "active", operator: resolved });
  });

  it("agrees with resolveOperator on every outcome", async () => {
    const cases: Array<[string, Tables, { id: string } | null]> = [
      ["no session", linkedOperatorTables(), null],
      ["unlinked", linkedOperatorTables(), { id: "44444444-4444-4444-8444-444444444444" }],
      [
        "inactive",
        linkedOperatorTables({
          operator_accounts: [
            { auth_user_id: AUTH_USER_ID, person_id: PERSON_ID, is_active: false },
          ],
        }),
        { id: AUTH_USER_ID },
      ],
      ["active", linkedOperatorTables(), { id: AUTH_USER_ID }],
    ];

    for (const [name, tables, user] of cases) {
      givenVerifiedUser(user);
      givenDatabase(tables);
      const access = await resolveOperatorAccess();

      givenVerifiedUser(user);
      givenDatabase(tables);
      const resolved = await resolveOperator();

      expect(resolved === null, name).toBe(access.state !== "active");
    }
  });
});

/**
 * LAN-73 — the guards over the real resolution, not over a stubbed actor.
 *
 * Everything else about the guards is proved against an injected actor in
 * guards.test.ts, which is the only way to reach actors a session could not
 * produce. This block is the join: a role assignment sitting in the database
 * becomes, or fails to become, permission — including the two effective-dating
 * boundaries that decide whether a coach may record attendance today.
 */
describe("requireCapability over a real resolution", () => {
  function coachTables(assignments: Row[]): Tables {
    return linkedOperatorTables({
      role_assignments: assignments,
      roles: [
        { id: "role-head-coach", code: "head_coach" },
        { id: "role-secretary", code: "secretary" },
      ],
    });
  }

  function seat(roleId: string, from: string, to: string | null): Row {
    return { person_id: PERSON_ID, role_id: roleId, effective_from: from, effective_to: to };
  }

  it("lets a serving Head Coach record attendance", async () => {
    givenVerifiedUser({ id: AUTH_USER_ID });
    givenDatabase(coachTables([seat("role-head-coach", LONG_STARTED, null)]));

    const operator = await requireCapability("attendance_recorder");

    expect(operator.personId).toBe(PERSON_ID);
  });

  it("refuses a Head Coach whose season has ended", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T09:00:00.000Z"));
    givenVerifiedUser({ id: AUTH_USER_ID });
    givenDatabase(coachTables([seat("role-head-coach", "2025-09-01", "2026-06-30")]));

    await expect(requireCapability("attendance_recorder")).rejects.toMatchObject({
      kind: "not_permitted",
    });
  });

  it("refuses a Head Coach whose season has not started", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T09:00:00.000Z"));
    givenVerifiedUser({ id: AUTH_USER_ID });
    givenDatabase(coachTables([seat("role-head-coach", "2026-09-01", null)]));

    await expect(requireCapability("attendance_recorder")).rejects.toMatchObject({
      kind: "not_permitted",
    });
  });

  it("refuses a serving Secretary the attendance capability", async () => {
    givenVerifiedUser({ id: AUTH_USER_ID });
    givenDatabase(coachTables([seat("role-secretary", LONG_STARTED, null)]));

    await expect(requireCapability("attendance_recorder")).rejects.toMatchObject({
      kind: "not_permitted",
    });
  });

  it("refuses a deactivated account that still holds the seat", async () => {
    // The assignment is untouched and current; the login is switched off. The
    // account state, not the role, is what decides here.
    givenVerifiedUser({ id: AUTH_USER_ID });
    givenDatabase({
      ...coachTables([seat("role-head-coach", LONG_STARTED, null)]),
      operator_accounts: [{ auth_user_id: AUTH_USER_ID, person_id: PERSON_ID, is_active: false }],
    });

    await expect(requireCapability("attendance_recorder")).rejects.toMatchObject({
      rule: "operator_required",
    });
  });

  it("refuses an account with no operator link at all", async () => {
    givenVerifiedUser({ id: "44444444-4444-4444-8444-444444444444" });
    givenDatabase(coachTables([seat("role-head-coach", LONG_STARTED, null)]));

    await expect(requireCapability("attendance_recorder")).rejects.toMatchObject({
      rule: "operator_required",
    });
  });
});
