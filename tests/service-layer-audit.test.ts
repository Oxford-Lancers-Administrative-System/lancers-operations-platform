// @vitest-environment node
/**
 * `recordAudit` against the real local database — matrix rows 7 and 8.
 *
 * Invariant M2 is not "an audit row gets written". It is "an audit row is
 * written **with** the change it describes, and cannot outlive it". An audit
 * trail that survives a rolled-back change is a false history: a record
 * asserting something happened that did not. That is strictly worse than no
 * record, because somebody will believe it.
 *
 * So row 8 is the load-bearing one here, and it is only provable against a real
 * transaction. Every assertion reads through a **second connection**, because
 * an uncommitted audit row is perfectly visible to the transaction that wrote
 * it.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import { closePool, withTransaction, type Tx } from "@/lib/db";
import { recordAudit } from "@/lib/services/audit";
import { createFixture, openObserver } from "./helpers/service-layer";

// This suite's own marker — see the note in the fixture helper about parallel
// suites sharing one database.
const fixture = createFixture("audit");
const MARKER = fixture.marker;

let observer: Client;
/** A real `people.id`, standing in for what `resolveOperator()` returns. */
let actorPersonId: string;

interface AuditRow {
  id: string;
  actor_person_id: string | null;
  actor_label: string | null;
  action: string;
  entity_table: string;
  entity_id: string;
  from_state: string | null;
  to_state: string | null;
  reason: string | null;
  context: Record<string, unknown>;
  occurred_at: Date;
}

async function auditRowsFor(entityId: string): Promise<AuditRow[]> {
  const result = await observer.query<AuditRow>(
    "select * from public.audit_events where entity_table = $1 and entity_id = $2 order by occurred_at",
    [MARKER, entityId],
  );
  return result.rows;
}

beforeAll(async () => {
  observer = await openObserver();
  await fixture.cleanUp(observer);

  const person = await observer.query<{ id: string }>(...fixture.insertPerson("audit-actor"));
  actorPersonId = person.rows[0].id;
});

afterEach(async () => {
  await fixture.cleanUpAudit(observer);
});

afterAll(async () => {
  await fixture.cleanUp(observer);
  await observer.end();
  await closePool();
});

/** A fresh, unrelated uuid to hang an audit row off. */
function newEntityId(): string {
  return crypto.randomUUID();
}

describe("row 7 — writes exactly one row, with what it was given", () => {
  it("records the actor, action, entity and transition", async () => {
    const entityId = newEntityId();

    const written = await withTransaction((tx) =>
      recordAudit(tx, {
        actorPersonId,
        action: "event.approved",
        entityTable: MARKER,
        entityId,
        fromState: "pending_approval",
        toState: "approved",
        reason: "Committee approved at the Tuesday meeting.",
      }),
    );

    const rows = await auditRowsFor(entityId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: written.id,
      actor_person_id: actorPersonId,
      actor_label: null,
      action: "event.approved",
      entity_table: MARKER,
      entity_id: entityId,
      from_state: "pending_approval",
      to_state: "approved",
      reason: "Committee approved at the Tuesday meeting.",
      context: {},
    });
    expect(rows[0].occurred_at).toBeInstanceOf(Date);
  });

  it("writes one row and not two, even for a transition with every field set", async () => {
    const entityId = newEntityId();

    await withTransaction((tx) =>
      recordAudit(tx, {
        actorPersonId,
        action: "membership.reinstated",
        entityTable: MARKER,
        entityId,
        fromState: "departed",
        toState: "active",
        reason: "Returned in February.",
        context: { season: "2026-27", note: "register D1" },
      }),
    );

    const rows = await auditRowsFor(entityId);
    expect(rows).toHaveLength(1);
    expect(rows[0].context).toEqual({ season: "2026-27", note: "register D1" });
  });

  it("accepts a record with the optional fields omitted", async () => {
    const entityId = newEntityId();

    await withTransaction((tx) =>
      recordAudit(tx, { actorPersonId, action: "person.viewed", entityTable: MARKER, entityId }),
    );

    const rows = await auditRowsFor(entityId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      from_state: null,
      to_state: null,
      reason: null,
      actor_label: null,
      context: {},
    });
  });

  it("accepts a labelled non-human actor where there genuinely is no person", async () => {
    const entityId = newEntityId();

    await withTransaction((tx) =>
      recordAudit(tx, {
        actorLabel: "system: season rollover",
        action: "membership.carried_forward",
        entityTable: MARKER,
        entityId,
      }),
    );

    const rows = await auditRowsFor(entityId);
    expect(rows).toHaveLength(1);
    expect(rows[0].actor_person_id).toBeNull();
    expect(rows[0].actor_label).toBe("system: season rollover");
  });

  it("refuses a record that names nobody at all, and writes nothing", async () => {
    // `audit_events_has_an_actor`. A row with no actor is not an audit record,
    // it is a rumour — and a default or fabricated actor would be worse still,
    // because it would name someone who did not do it.
    const entityId = newEntityId();

    await expect(
      withTransaction((tx) =>
        recordAudit(tx, { action: "event.approved", entityTable: MARKER, entityId }),
      ),
    ).rejects.toMatchObject({ kind: "constraint_violated", rule: "audit_events_has_an_actor" });

    expect(await auditRowsFor(entityId)).toHaveLength(0);
  });

  it.each([
    ["an empty actor label", { actorLabel: "" }],
    ["a whitespace-only actor label", { actorLabel: "   " }],
    ["an explicitly null actor", { actorPersonId: null, actorLabel: null }],
  ])("refuses %s", async (_label, actor) => {
    const entityId = newEntityId();

    await expect(
      withTransaction((tx) =>
        recordAudit(tx, { ...actor, action: "event.approved", entityTable: MARKER, entityId }),
      ),
    ).rejects.toMatchObject({ rule: "audit_events_has_an_actor" });

    expect(await auditRowsFor(entityId)).toHaveLength(0);
  });

  it("refuses a blank action and a blank entity table", async () => {
    const entityId = newEntityId();

    await expect(
      withTransaction((tx) =>
        recordAudit(tx, { actorPersonId, action: "  ", entityTable: MARKER, entityId }),
      ),
    ).rejects.toMatchObject({ rule: "audit_events_action_not_blank" });

    await expect(
      withTransaction((tx) =>
        recordAudit(tx, { actorPersonId, action: "event.approved", entityTable: " ", entityId }),
      ),
    ).rejects.toMatchObject({ rule: "audit_events_entity_table_not_blank" });
  });

  it("still has the database enforcing the actor rule, not just this function", async () => {
    // The TypeScript check above is ergonomics. If someone bypasses
    // `recordAudit` and inserts directly, the constraint must still fire — and
    // must arrive mapped, not as raw driver text.
    const entityId = newEntityId();

    await expect(
      withTransaction(async (tx: Tx) => {
        await tx.query(
          "insert into public.audit_events (action, entity_table, entity_id) values ($1, $2, $3)",
          ["event.approved", MARKER, entityId],
        );
      }),
    ).rejects.toMatchObject({ rule: "audit_events_has_an_actor" });

    expect(await auditRowsFor(entityId)).toHaveLength(0);
  });
});

describe("row 8 — the audit row vanishes with its transaction", () => {
  it("leaves no audit row when the surrounding transaction rolls back", async () => {
    const entityId = newEntityId();
    const boom = new Error("the state change failed after the audit row was written");

    await expect(
      withTransaction(async (tx) => {
        await recordAudit(tx, {
          actorPersonId,
          action: "event.approved",
          entityTable: MARKER,
          entityId,
          fromState: "pending_approval",
          toState: "approved",
        });
        throw boom;
      }),
    ).rejects.toBe(boom);

    expect(await auditRowsFor(entityId)).toHaveLength(0);
  });

  it("takes the audit row down with the state change it describes", async () => {
    // The realistic shape: a service flips a state, records the audit, and then
    // a later statement is rejected. Neither the change nor its record may
    // survive — and the record surviving alone is the worse of the two.
    const entityId = newEntityId();

    await expect(
      withTransaction(async (tx) => {
        await tx.query(...fixture.insertPerson("audited-change"));
        await recordAudit(tx, {
          actorPersonId,
          action: "person.created",
          entityTable: MARKER,
          entityId,
        });
        // people_given_name_not_blank rejects this.
        await tx.query("insert into public.people (given_name) values ('   ')");
      }),
    ).rejects.toMatchObject({ kind: "constraint_violated" });

    const people = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.people where given_name = $1 and family_name = $2",
      [MARKER, "audited-change"],
    );
    expect(Number(people.rows[0].count)).toBe(0);
    expect(await auditRowsFor(entityId)).toHaveLength(0);
  });

  it("rolls the audit row back when a NESTED scope wrote it and an outer one failed", async () => {
    const entityId = newEntityId();
    const boom = new Error("the outer scope refused");

    await expect(
      withTransaction(async () => {
        await withTransaction((inner) =>
          recordAudit(inner, {
            actorPersonId,
            action: "event.approved",
            entityTable: MARKER,
            entityId,
          }),
        );
        throw boom;
      }),
    ).rejects.toBe(boom);

    expect(await auditRowsFor(entityId)).toHaveLength(0);
  });

  it("commits the audit row when the transaction succeeds, so this is not vacuous", async () => {
    const entityId = newEntityId();

    await withTransaction(async (tx) => {
      await tx.query(...fixture.insertPerson("audited-commit"));
      await recordAudit(tx, {
        actorPersonId,
        action: "person.created",
        entityTable: MARKER,
        entityId,
      });
    });

    expect(await auditRowsFor(entityId)).toHaveLength(1);
  });
});
