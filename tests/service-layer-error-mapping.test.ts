// @vitest-environment node
/**
 * The constraint mapper, driven by **real** database rejections — matrix rows
 * 9 and 10.
 *
 * The point of this file is that nothing in it is hand-built. Each case runs a
 * statement the local database genuinely refuses, and asserts on what came back
 * out of `tx.query`. A fabricated `{ code: "23514", constraint: "…" }` proves
 * only that the mapper's lookup table matches itself; it cannot catch a
 * constraint that was renamed, a check that never fires because a NOT NULL
 * beats it to it, or a rejection that arrives with no constraint name at all.
 *
 * Every case builds its own fixture graph inside a transaction that is then
 * rolled back, so the seeded dataset is untouched.
 */
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import {
  closePool,
  getPool,
  isServiceError,
  withTransaction,
  type ServiceError,
  type Tx,
} from "@/lib/db";
import { createBaseline, type Baseline } from "./helpers/domain-fixture";

afterAll(async () => {
  await closePool();
});

/** Marks the deliberate abort that unwinds a fixture transaction. */
const ROLLBACK = new Error("fixture transaction deliberately rolled back");

/**
 * Builds the fixture graph, runs `attempt`, and returns the error the database
 * raised — then rolls the whole thing back.
 *
 * `attempt` must fail. If it succeeds, so does the test's premise, and the
 * assertion below turns that into a clear failure rather than a confusing one.
 */
async function rejectionFrom(
  attempt: (tx: Tx, baseline: Baseline) => Promise<unknown>,
): Promise<ServiceError> {
  let captured: unknown;
  let succeeded = false;

  try {
    await withTransaction(async (tx) => {
      const baseline = await createBaseline(tx as unknown as Client);
      try {
        await attempt(tx, baseline);
        succeeded = true;
      } catch (error) {
        captured = error;
      }
      // Unconditionally. Nothing this suite writes is allowed to commit.
      throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }

  if (succeeded) {
    throw new Error("Expected the database to reject this statement, but it succeeded.");
  }
  if (!isServiceError(captured)) {
    throw new Error(
      `Expected a ServiceError from the mapper, got ${Object.prototype.toString.call(captured)}`,
    );
  }
  return captured;
}

/**
 * The four rejections LAN-72 names, each raised by the database itself. The
 * constraint names were read out of `supabase/migrations/`, not assumed.
 */
const CASES = [
  {
    name: "a No with no reason",
    constraint: "rsvp_responses_no_requires_a_reason",
    kind: "constraint_violated",
    attempt: (tx: Tx, base: Baseline) =>
      tx.query(
        `insert into public.rsvp_responses (invitation_id, response, source, responded_at)
         values ($1, 'no', 'operator', now())`,
        [base.invitationId],
      ),
  },
  {
    name: "an approval with no recorded audience",
    constraint: "events_approval_requires_date_and_audience",
    kind: "invalid_transition",
    attempt: (tx: Tx, base: Baseline) =>
      tx.query(
        `insert into public.events
           (season_id, name, event_type, status, scheduled_on, approved_at, approved_by_person_id)
         values ($1, 'No audience', 'practice', 'approved', '2026-11-04', now(), $2)`,
        [base.seasonId, base.personId],
      ),
  },
  {
    name: "attendance against an event that has not occurred",
    constraint: "attendance_records_require_an_occurred_event",
    kind: "invalid_transition",
    attempt: (tx: Tx, base: Baseline) =>
      tx.query(
        `insert into public.attendance_records
           (event_id, event_status, season_id, capacity, season_membership_id, presence)
         values ($1, 'approved', $2, 'player', $3, 'present')`,
        [base.approvedEventId, base.seasonId, base.membershipId],
      ),
  },
  {
    name: "a duplicate membership for a person in a season",
    constraint: "season_memberships_one_per_person_per_season",
    kind: "conflict",
    attempt: (tx: Tx, base: Baseline) =>
      tx.query(
        `insert into public.season_memberships (person_id, season_id, status, entry)
         values ($1, $2, 'confirmed', 'new')`,
        [base.personId, base.seasonId],
      ),
  },
] as const;

/**
 * Every case's rejection, gathered one at a time.
 *
 * Sequential on purpose. Each case builds its own fixture graph, and those
 * graphs collide on the same unique codes and the same committee-year exclusion
 * window — run in parallel they would serialise on locks at best and deadlock
 * at worst, which would make this suite flaky for a reason that has nothing to
 * do with the mapper.
 */
async function collectAll(): Promise<ServiceError[]> {
  const errors: ServiceError[] = [];
  for (const testCase of CASES) errors.push(await rejectionFrom(testCase.attempt));
  return errors;
}

describe("row 9 — four real rejections, four specific answers", () => {
  it.each(CASES)("maps $name", async ({ constraint, kind, attempt }) => {
    const error = await rejectionFrom(attempt);

    // Rejected by the SPECIFIC constraint the rule lives in. Without this, the
    // test passes for the wrong reason the moment an unrelated NOT NULL fires
    // first — which is exactly what happens if a fixture drifts.
    expect(error.context?.constraint).toBe(constraint);
    expect(error.rule).toBe(constraint);
    expect(error.kind).toBe(kind);
  });

  it("gives all four distinct, non-generic messages", async () => {
    const errors = await collectAll();
    const messages = errors.map((error) => error.message);

    expect(new Set(messages).size).toBe(CASES.length);
    // Not the generic fallback — the whole value of naming constraints in the
    // schema is that the interface can say what the club rule actually is.
    for (const message of messages) {
      expect(message).not.toContain("breaks one of the club's recorded rules");
      expect(message.length).toBeGreaterThan(30);
    }
  });

  it("keeps all four distinguishable by the caller without reading English", async () => {
    const errors = await collectAll();
    // `rule` is the discriminator that stays distinct even where two rules
    // share a taxonomy member, which two of these four do.
    expect(new Set(errors.map((error) => error.rule)).size).toBe(CASES.length);
  });

  it.each(CASES)("shows an operator nothing they should not see for $name", async ({ attempt }) => {
    const error = await rejectionFrom(attempt);
    const shown = error.message;

    // No SQL, no driver sentence, no internal identifier in the sentence a
    // person reads. The constraint name is kept, on `rule`, for the log.
    expect(shown).not.toMatch(/insert into|select |update |values \(/i);
    expect(shown).not.toMatch(/violates|constraint|relation|SQLSTATE|\bpg_|postgres/i);
    expect(shown).not.toContain("postgresql://");
    expect(shown).not.toMatch(/\$\d/);
  });
});

describe("row 10 — an unmapped rejection still degrades safely", () => {
  it("types a constraint the mapper has never heard of by its SQLSTATE class", async () => {
    const error = await rejectionFrom((tx) =>
      // `people_given_name_not_blank` is a real check constraint that the
      // mapper deliberately has no entry for.
      tx.query("insert into public.people (given_name) values ('   ')"),
    );

    expect(error.kind).toBe("constraint_violated");
    expect(error.rule).toBe("people_given_name_not_blank");
    expect(error.context?.code).toBe("23514");
    // Handleable and safe, even though it is generic.
    expect(error.message).toContain("Nothing was saved.");
    expect(error.message).not.toContain("people_given_name_not_blank");
  });

  it("types a rejection that carries no constraint name at all", async () => {
    const error = await rejectionFrom((tx) =>
      // An enum domain error: no constraint, just a SQLSTATE.
      tx.query("select 'unsure'::public.rsvp_value"),
    );

    expect(isServiceError(error)).toBe(true);
    expect(error.rule).toBeUndefined();
    expect(error.message).not.toMatch(/invalid input value for enum/i);
  });

  it("does not report a syntax error as success", async () => {
    const error = await rejectionFrom((tx) => tx.query("slect 1"));

    expect(error.kind).toBe("unexpected");
    expect(error.message).not.toContain("slect");
  });

  it("never lets driver text or a connection string escape, for any of them", async () => {
    const attempts = [
      (tx: Tx) => tx.query("insert into public.people (given_name) values ('   ')"),
      (tx: Tx) => tx.query("select 'unsure'::public.rsvp_value"),
      (tx: Tx) => tx.query("slect 1"),
      (tx: Tx) => tx.query("select * from public.no_such_table"),
    ];

    for (const attempt of attempts) {
      const error = await rejectionFrom(attempt);
      const everythingThatEscapes = JSON.stringify({
        message: error.message,
        stack: error.stack,
        enumerable: { ...error },
      });

      expect(everythingThatEscapes).not.toContain("postgresql://");
      expect(everythingThatEscapes).not.toContain("54322");
      expect(everythingThatEscapes).not.toMatch(/password/i);
      expect(everythingThatEscapes).not.toMatch(/syntax error|does not exist|invalid input value/i);
    }
  });

  it("aborts the whole transaction on an unmapped rejection, like any other", async () => {
    // Degrading safely means degrading *transactionally*. A typed error that
    // left half the work committed would be the worst of both.
    const boom = await rejectionFrom(async (tx, base) => {
      await tx.query("update public.people set known_as = 'changed' where id = $1", [
        base.personId,
      ]);
      await tx.query("slect 1");
    });

    expect(boom.kind).toBe("unexpected");
  });
});

describe("a rejection raised at COMMIT is mapped like any other", () => {
  /**
   * `commit` is the one statement `withTransaction` issues that does not pass
   * through the callback's query interface, so it is the one place a raw driver
   * error could escape.
   *
   * A DEFERRABLE INITIALLY DEFERRED constraint is the cleanest way to force
   * that: the violating insert is accepted, and the check happens at commit
   * time. This uses a temp table with `on commit drop`, so it needs no
   * migration and leaves nothing behind.
   *
   * The everyday path is safe today — the schema has no deferrable constraints.
   * This matters because a serialization failure, a statement timeout at commit
   * or a lost connection all arrive the same way, and because the first
   * migration to model a cyclic foreign key under ADR 0008 will make it routine.
   */
  async function commitRejection(): Promise<unknown> {
    try {
      await withTransaction(async (tx) => {
        await tx.query("create temp table lan72_commit_probe (email text) on commit drop");
        await tx.query(
          `alter table lan72_commit_probe
             add constraint lan72_commit_probe_email_unique unique (email)
             deferrable initially deferred`,
        );
        // Both accepted. The constraint is not checked until commit.
        await tx.query("insert into lan72_commit_probe (email) values ('jane.smith@example.com')");
        await tx.query("insert into lan72_commit_probe (email) values ('jane.smith@example.com')");
      });
    } catch (error) {
      return error;
    }
    throw new Error("Expected the commit to be rejected, but the transaction committed.");
  }

  it("reaches the caller as a ServiceError, not as a raw driver error", async () => {
    const error = await commitRejection();

    expect(isServiceError(error)).toBe(true);
    expect((error as ServiceError).kind).toBe("conflict");
    expect((error as ServiceError).context?.code).toBe("23505");
    expect((error as ServiceError).rule).toBe("lan72_commit_probe_email_unique");
  });

  it("leaks neither the driver's sentence nor the offending row's values", async () => {
    // `detail` on a deferred unique violation quotes the row that collided.
    // For this schema that is a real person's name and contact details, and
    // ADR 0014 and the module header both say it is never copied out.
    const error = (await commitRejection()) as ServiceError;
    const everythingThatEscapes = JSON.stringify({
      message: error.message,
      name: error.name,
      rule: error.rule,
      context: error.context,
      stack: error.stack,
      enumerable: { ...error },
    });

    expect(everythingThatEscapes).not.toContain("jane.smith@example.com");
    expect(everythingThatEscapes).not.toMatch(/duplicate key value violates/i);
    expect(everythingThatEscapes).not.toContain("postgresql://");
  });

  it("leaves the pool healthy, so a failed commit is not also a leak", async () => {
    await commitRejection();

    const pool = getPool();
    expect(pool.totalCount - pool.idleCount).toBe(0);

    // And the connection still works — the temp table went with the aborted
    // transaction rather than lingering on a recycled client.
    const value = await withTransaction(async (tx) => {
      const result = await tx.query<{ n: number }>("select 1 as n");
      return result.rows[0].n;
    });
    expect(value).toBe(1);
  });
});
