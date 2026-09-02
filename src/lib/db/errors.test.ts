// @vitest-environment node
/**
 * The error taxonomy as a *caller* experiences it: can it tell the five cases
 * apart without reading English, and can a raw driver error reach an operator?
 *
 * The mapper's behaviour against real database rejections is proven separately,
 * in tests/service-layer-error-mapping.test.ts, because a hand-built error
 * object cannot fail the way PostgreSQL does. What is tested here is the part
 * that has no database in it: discrimination, and what the mapper refuses to
 * copy out of the driver's error.
 */
import { describe, expect, it } from "vitest";

import {
  Conflict,
  ConstraintViolated,
  InvalidTransition,
  isServiceError,
  mapDatabaseError,
  NotFound,
  NotPermitted,
  ServiceError,
  UnexpectedDatabaseError,
  type ServiceErrorKind,
} from "./errors";

/**
 * Everything a naive caller, logger or crash reporter could get at: the
 * sentence, the name, the stack, and whatever `console.error` or a JSON log
 * line would serialise. If a secret is not in here, it did not escape.
 */
function everythingThatEscapesFrom(error: ServiceError): string {
  return JSON.stringify({
    message: error.message,
    name: error.name,
    rule: error.rule,
    context: error.context,
    stack: error.stack,
    cause: (error as { cause?: unknown }).cause,
    enumerable: { ...error },
  });
}

describe("the taxonomy is distinguishable by the caller", () => {
  const members = [
    { kind: "not_found", error: new NotFound("gone"), type: NotFound },
    { kind: "not_permitted", error: new NotPermitted("no"), type: NotPermitted },
    {
      kind: "invalid_transition",
      error: new InvalidTransition("not from here"),
      type: InvalidTransition,
    },
    {
      kind: "constraint_violated",
      error: new ConstraintViolated("rule"),
      type: ConstraintViolated,
    },
    { kind: "conflict", error: new Conflict("clash"), type: Conflict },
    { kind: "unexpected", error: new UnexpectedDatabaseError(), type: UnexpectedDatabaseError },
  ] as const;

  it("gives every member a distinct kind", () => {
    const kinds = members.map((member) => member.kind);
    expect(new Set(kinds).size).toBe(members.length);
  });

  it.each(members)(
    "discriminates $kind by kind, by class, and by name",
    ({ kind, error, type }) => {
      expect(error.kind).toBe(kind satisfies ServiceErrorKind);
      expect(error).toBeInstanceOf(type);
      expect(error).toBeInstanceOf(ServiceError);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe(type.name);
      expect(isServiceError(error)).toBe(true);
    },
  );

  it("does not confuse one member with another", () => {
    expect(new NotPermitted("no")).not.toBeInstanceOf(NotFound);
    expect(new Conflict("clash").kind).not.toBe(new ConstraintViolated("rule").kind);
  });

  it("keeps NotPermitted separable, because authorization is the one that must never blur", () => {
    // LAN-73's requireRole() throws this. A caller that cannot tell an
    // authorization refusal from a validation failure renders it as a field
    // error and invites a retry.
    const refusal: unknown = new NotPermitted("Only the committee may approve an event.");
    expect(isServiceError(refusal) && refusal.kind === "not_permitted").toBe(true);
  });

  it("does not claim a plain Error, or a lookalike, is a ServiceError", () => {
    expect(isServiceError(new Error("boom"))).toBe(false);
    expect(isServiceError({ kind: "not_found", message: "spoofed" })).toBe(false);
    expect(isServiceError(Object.assign(new Error("x"), { kind: "made_up" }))).toBe(false);
    expect(isServiceError(null)).toBe(false);
    expect(isServiceError("not_found")).toBe(false);
  });
});

describe("the mapper degrades safely", () => {
  it("is idempotent, so a mapped error is never re-wrapped as it travels up", () => {
    const mapped = new InvalidTransition("specific and useful", { rule: "some_constraint" });
    expect(mapDatabaseError(mapped)).toBe(mapped);
  });

  it("turns an error with no database detail at all into a handleable typed error", () => {
    const mapped = mapDatabaseError(new Error("connect ECONNREFUSED 127.0.0.1:54322"));
    expect(isServiceError(mapped)).toBe(true);
    expect(mapped.kind).toBe("unexpected");

    // Row 10's privacy clause applies to THIS branch too, and it is the branch
    // connection-level failures land in. Locally the leak would be a loopback
    // address, which looks harmless; against a hosted pooler the same string is
    // the hosted hostname, printed by the same code path.
    expect(mapped.message).not.toContain("127.0.0.1");
    expect(mapped.message).not.toMatch(/ECONNREFUSED|54322/);
    expect(everythingThatEscapesFrom(mapped)).not.toMatch(/ECONNREFUSED|54322|127\.0\.0\.1/);
  });

  it("does not echo a connection failure that quotes the connection string", () => {
    const mapped = mapDatabaseError(
      new Error(
        "could not connect to server: " +
          "postgresql://postgres:hunter2-the-real-password@db.proj.supabase.co:5432/postgres",
      ),
    );

    const escaped = everythingThatEscapesFrom(mapped);
    expect(mapped.kind).toBe("unexpected");
    expect(escaped).not.toContain("hunter2-the-real-password");
    expect(escaped).not.toContain("postgresql://");
    expect(escaped).not.toContain("db.proj.supabase.co");
  });

  it.each([
    ["a thrown string", "something went wrong"],
    ["a thrown null", null],
    ["a thrown undefined", undefined],
    ["a thrown number", 42],
  ])("survives %s", (_label, thrown) => {
    const mapped = mapDatabaseError(thrown);
    expect(isServiceError(mapped)).toBe(true);
    expect(mapped.kind).toBe("unexpected");
    // Whatever was thrown, none of it is copied into what a caller can read.
    if (typeof thrown === "string") {
      expect(everythingThatEscapesFrom(mapped)).not.toContain(thrown);
    }
  });

  it("types an unrecognised constraint by its SQLSTATE class rather than giving up", () => {
    const mapped = mapDatabaseError({
      code: "23514",
      constraint: "some_constraint_added_next_year",
      table: "events",
      message: 'new row for relation "events" violates check constraint',
    });

    expect(mapped).toBeInstanceOf(ConstraintViolated);
    // Kept for the log, so an operator report can be traced to a rule…
    expect(mapped.rule).toBe("some_constraint_added_next_year");
    // …but not put in the sentence an operator reads.
    expect(mapped.message).not.toContain("some_constraint_added_next_year");
  });

  it("types an unrecognised unique violation as a conflict", () => {
    const mapped = mapDatabaseError({ code: "23505", constraint: "some_future_unique_index" });
    expect(mapped).toBeInstanceOf(Conflict);
    expect(mapped.kind).toBe("conflict");
  });

  it("falls back to unexpected for an error class it has no opinion about", () => {
    const mapped = mapDatabaseError({ code: "42601", message: 'syntax error at or near "slect"' });
    expect(mapped).toBeInstanceOf(UnexpectedDatabaseError);
  });
});

// LAN-204, item 5 (Brian, 2026-09-02: "What rules? I made all the rules, so I
// don't even know what rule I'm breaking."). The service layer satisfies both
// of these on the write for every reachable path (`updateRecruitmentProspectStatusIn`,
// `flipRecruitmentProspectToJoinedIn`) — this is the backstop for a caller
// that reaches the raw constraint anyway, and it must name the club's rule
// rather than the generic "breaks one of the club's recorded rules" sentence.
describe("the two recruitment status constraints name themselves (LAN-204)", () => {
  it("recruitment_prospects_commitment_is_dated", () => {
    const mapped = mapDatabaseError({
      code: "23514",
      constraint: "recruitment_prospects_commitment_is_dated",
      table: "recruitment_prospects",
    });
    expect(mapped).toBeInstanceOf(ConstraintViolated);
    expect(mapped.message).toMatch(/committed date/i);
    expect(mapped.message).not.toBe(
      "The database refused this change because it breaks one of the club's recorded rules. " +
        "Nothing was saved.",
    );
  });

  it("recruitment_prospects_conversion_matches_status", () => {
    const mapped = mapDatabaseError({
      code: "23514",
      constraint: "recruitment_prospects_conversion_matches_status",
      table: "recruitment_prospects",
    });
    expect(mapped).toBeInstanceOf(ConstraintViolated);
    expect(mapped.message).toMatch(/joined status/i);
    expect(mapped.message).not.toBe(
      "The database refused this change because it breaks one of the club's recorded rules. " +
        "Nothing was saved.",
    );
  });
});

describe("nothing sensitive is copied out of the driver's error", () => {
  /**
   * A realistic `pg` error. `message`, `detail`, `hint` and `where` are the
   * four fields that in practice carry a connection string, a row's values, or
   * both — and for this schema a row's values are a real person's name and
   * contact details.
   */
  const leaky = {
    code: "23505",
    constraint: "people_email_key",
    table: "people",
    message:
      'duplicate key value violates unique constraint "people_email_key" ' +
      "(connection postgresql://postgres:hunter2-the-real-password@127.0.0.1:54322/postgres)",
    detail: "Key (email)=(jane.smith@example.com) already exists.",
    hint: "try postgresql://postgres:hunter2-the-real-password@db.proj.supabase.co:5432/postgres",
    where: "SQL statement \"insert into public.people (given_name) values ('Jane')\"",
    internalQuery: "select * from public.people where email = 'jane.smith@example.com'",
  };

  const mapped = mapDatabaseError(leaky);
  const everythingThatEscapes = JSON.stringify({
    message: mapped.message,
    name: mapped.name,
    rule: mapped.rule,
    context: mapped.context,
    stack: mapped.stack,
    // Whatever a naive `console.error(error)` or a JSON log line would emit.
    enumerable: { ...mapped },
  });

  it.each([
    ["a password", "hunter2-the-real-password"],
    ["a connection string", "postgresql://"],
    ["a hosted host", "db.proj.supabase.co"],
    ["a row value", "jane.smith@example.com"],
    ["SQL", "insert into public.people"],
    ["the driver's own sentence", "duplicate key value violates"],
  ])("does not leak %s", (_label, secret) => {
    expect(everythingThatEscapes).not.toContain(secret);
  });

  it("keeps only the safe, schema-level subset for the log", () => {
    expect(mapped.context).toEqual({
      code: "23505",
      constraint: "people_email_key",
      table: "people",
    });
  });

  it("does not attach the original driver error as a cause", () => {
    // Attaching it would put every field above one `console.error` away from a
    // log aggregator, which is exactly what this layer exists to prevent.
    expect((mapped as { cause?: unknown }).cause).toBeUndefined();
  });
});
