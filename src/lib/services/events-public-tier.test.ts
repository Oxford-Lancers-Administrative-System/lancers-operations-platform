/**
 * The two guards LAN-153's tier boundary actually stands on — R153-B1, R153-B2.
 *
 * ## Why these intercept rather than inspect
 *
 * Independent review broke both of the originals, and both failures were the
 * same shape: the assertion named the rule and then checked something adjacent
 * to it.
 *
 *   * **R153-B1.** The old test asserted that `PUBLIC_EVENT_COLUMNS` mentions no
 *     participation table. That constant is a **column fragment** spliced into
 *     two larger statements, and everything outside it was unguarded — a
 *     `left join public.event_audience_members` added to the public list query
 *     left the whole repository green, including the test named for
 *     `REQ-public-calendar`'s "renders without touching participation data at
 *     all". So this asserts on **the statement that actually executes**,
 *     captured from the transaction the service opens.
 *   * **R153-B2.** `listEventsForOperator` exists to put the operator tier's
 *     guard in front of the elevated projection, and nothing proved the guard
 *     was wired in: deleting `await requireEventOperatorTier()` from it left
 *     4069 unit tests and 1466 database tests green. Every screen suite mocks
 *     `listEventsForOperator` itself, so the guard is mocked away wherever a
 *     page is exercised, and `event-tier.test.ts` only ever proves the guard
 *     *refuses* — never that the projection *calls* it.
 *
 * ## Why this file has no database
 *
 * The question is what SQL the service composes and whether a guard runs before
 * it, and neither needs a server. `withTransaction` is replaced by a recorder,
 * so every statement the code would have issued is captured verbatim — which is
 * strictly more than a live run could assert, because a live run sees results
 * rather than text. The behavioural backstops that *do* need a database — the
 * exact key set of the public payload, and the joining URL's value never
 * appearing in it — stay in `tests/public-calendar-side-effects.test.ts`, where
 * they caught three of the four leak injections review threw at them.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));

/** Every statement the service issued, in order, verbatim. */
const recorded: { sql: string; params: readonly unknown[] }[] = [];

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return {
    ...actual,
    // The real one checks out a client and opens a transaction. This one hands
    // the callback a recorder, so the code under test runs unchanged and every
    // statement it composes is captured before it would have been sent.
    withTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> =>
      fn({
        query: async (sql: string, params: readonly unknown[] = []) => {
          recorded.push({ sql, params });
          return answerFor(sql);
        },
      }),
  };
});

import { NotPermitted } from "@/lib/db";
import { resolveOperatorAccess, type ResolvedOperator } from "@/lib/auth/operator";
import { EVENT_OPERATOR_TIER_RULE } from "@/lib/auth/event-tier";
import {
  listCurrentSeasonEvents,
  listEventsForOperator,
  listPublicSeasonEvents,
  PARTICIPATION_TABLES,
  readPublicEvent,
} from "./events";

const EVENT_ID = "33333333-3333-4333-8333-333333333333";

/**
 * Enough of a result for the service to keep going.
 *
 * Shaped by which statement asked, because the readers run three in sequence —
 * the open season, the events, and the season's total — and a single canned
 * answer would stop the first one.
 */
function answerFor(sql: string): { rows: Record<string, unknown>[]; rowCount: number } {
  if (sql.includes("from public.seasons")) {
    return {
      rows: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          label: "2026-27",
          status: "active",
          starts_on: "2026-04-26",
          ends_on: null,
        },
      ],
      rowCount: 1,
    };
  }
  if (sql.includes("count(*)::text as count")) {
    return { rows: [{ count: "110" }], rowCount: 1 };
  }
  return {
    rows: [
      {
        id: EVENT_ID,
        name: "Chalk — michaelmas week 4",
        event_type: "chalk",
        status: "approved",
        scheduled_on: "2026-11-03",
        starts_at: "18:00:00",
        ends_at: "19:00:00",
        delivery_mode: "online",
        venue: "Teams",
        is_mandatory: false,
        is_cancelled: false,
        description: null,
        required_equipment: null,
        audience_count: "0",
        invitation_count: "0",
        response_count: "0",
        said_yes_count: "0",
        showed_count: "0",
        register_saved: false,
      },
    ],
    rowCount: 1,
  };
}

function operator(roleCodes: string[] = ["secretary"]): ResolvedOperator {
  return {
    authUserId: "11111111-1111-4111-8111-111111111111",
    personId: "22222222-2222-4222-8222-222222222222",
    displayName: "Rowan Ashdown",
    roleCodes,
    isActive: true,
  };
}

/** Every statement issued, as one string. */
function issuedSql(): string {
  return recorded.map((entry) => entry.sql).join("\n");
}

/** The statement that read the events themselves, not the season or the count. */
function eventStatement(): string {
  const found = recorded.find(
    (entry) => entry.sql.includes("from public.events e") && !entry.sql.includes("count(*)::text"),
  );
  expect(found, "no statement read the events at all").toBeDefined();
  return found!.sql;
}

beforeEach(() => {
  recorded.length = 0;
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// R153-B1 — the participation guard, against the statement that executes
// ---------------------------------------------------------------------------

describe("the public tier's statements touch no participation data", () => {
  it("issues a real statement against the events table, so the checks below have a subject", async () => {
    // The anti-false-pass half, and it comes first deliberately: "mentions no
    // participation table" is trivially true of a statement that was never
    // composed, which is exactly how the previous version of this guard was
    // able to pass while a `left join` sat in the query.
    await listPublicSeasonEvents();

    expect(recorded.length).toBeGreaterThan(0);
    expect(eventStatement()).toContain("from public.events e");
    expect(eventStatement()).toContain("e.season_id = $1");
  });

  it("names no participation table anywhere in the public list statement", async () => {
    await listPublicSeasonEvents();
    const sql = issuedSql();

    for (const table of PARTICIPATION_TABLES) {
      expect(sql, `the public list statement reads public.${table}`).not.toContain(table);
    }
  });

  it("names no participation table anywhere in the public event statement", async () => {
    await readPublicEvent(EVENT_ID);
    const sql = issuedSql();

    for (const table of PARTICIPATION_TABLES) {
      expect(sql, `the public event statement reads public.${table}`).not.toContain(table);
    }
  });

  it("never selects the joining URL at either public read", async () => {
    // `REQ-no-joining-url`, at the layer where it is decided rather than at the
    // layer where it would be noticed.
    await listPublicSeasonEvents();
    await readPublicEvent(EVENT_ID);

    expect(issuedSql()).not.toContain("joining_url");
  });

  it("proves the check has teeth, by failing the operator's statement", async () => {
    // A positive control. The operator's own read *does* join the participation
    // tables, so if the matcher above were broken — a typo in a table name, a
    // comparison that always passes — this would go green too, and the guard
    // would be worthless without ever failing.
    vi.mocked(resolveOperatorAccess).mockResolvedValue({ state: "active", operator: operator() });
    await listCurrentSeasonEvents();
    const sql = issuedSql();

    const named = PARTICIPATION_TABLES.filter((table) => sql.includes(table));
    expect(named).toContain("invitations");
    expect(named).toContain("attendance_records");
    expect(named).toContain("event_audience_members");
  });
});

// ---------------------------------------------------------------------------
// R153-B2 — the operator guard is actually in front of the elevated projection
// ---------------------------------------------------------------------------

describe("the elevated projection is reached only through the operator guard", () => {
  const UNRESOLVED = [
    { state: "no_session" as const },
    { state: "unlinked" as const },
    { state: "inactive" as const },
  ];

  it("refuses every state that is not an active operator", async () => {
    for (const access of UNRESOLVED) {
      recorded.length = 0;
      vi.mocked(resolveOperatorAccess).mockResolvedValue(access);

      await expect(listEventsForOperator(), access.state).rejects.toThrow(NotPermitted);
    }
  });

  it("names the rule, so a caller never has to match on message text", async () => {
    vi.mocked(resolveOperatorAccess).mockResolvedValue({ state: "no_session" });

    try {
      await listEventsForOperator();
      expect.unreachable("the elevated projection was handed to nobody at all");
    } catch (error) {
      expect((error as NotPermitted).rule).toBe(EVENT_OPERATOR_TIER_RULE);
    }
  });

  it("refuses before it reads, so a refused caller costs the database nothing", async () => {
    // The guard runs *in front of* the projection rather than beside it. If it
    // moved after the read — or were deleted, which is the injection this file
    // exists for — the statement would already have been issued.
    vi.mocked(resolveOperatorAccess).mockResolvedValue({ state: "unlinked" });

    await expect(listEventsForOperator()).rejects.toThrow(NotPermitted);
    expect(recorded, "the elevated read ran despite the refusal").toHaveLength(0);
  });

  it("reads the elevated projection once an operator is resolved", async () => {
    // The other direction: the guard admits, and the projection it guards is the
    // one carrying the participation counts. Without this, a guard that refused
    // everybody would satisfy the tests above.
    vi.mocked(resolveOperatorAccess).mockResolvedValue({ state: "active", operator: operator() });

    const list = await listEventsForOperator();

    expect(resolveOperatorAccess).toHaveBeenCalled();
    expect(list.events).toHaveLength(1);
    expect(list.events[0]).toHaveProperty("invitationCount");
    expect(list.events[0]).toHaveProperty("showedCount");
    expect(eventStatement()).toContain("invitations");
  });

  it("admits an operator holding no role, and a coaching assignment", async () => {
    // The floor is a linked, active operator and says nothing about roles —
    // the floor `/operate/events` has stood on since LAN-76. Nothing in LAN-153
    // widens or narrows it, and this is what would notice if it did.
    for (const roleCodes of [[], ["head_coach"]]) {
      recorded.length = 0;
      vi.mocked(resolveOperatorAccess).mockResolvedValue({
        state: "active",
        operator: operator(roleCodes),
      });

      await expect(listEventsForOperator()).resolves.toBeTruthy();
    }
  });
});
