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
import { resolveOperator } from "./operator";

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

/** Installs the verified-user answer that `supabase.auth.getUser()` returns. */
function givenVerifiedUser(user: { id: string } | null, error: { message: string } | null = null) {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: () => Promise.resolve({ data: { user }, error }) },
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
