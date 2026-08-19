// @vitest-environment node
/**
 * The canonical administration event stream and its two projections, against
 * the real local database — LAN-130, matrix rows 4, 5, 6, 9, 10 and 11.
 *
 * ## The load-bearing test in this file
 *
 * "One event, two projections, no duplicate records" is the property
 * `REQ-append-only-audit-evidence` turns on, and it is the one a convenient
 * implementation gets wrong: writing the fact twice, once shaped for Operator
 * audit history and once for Holder history, makes both screens trivial and
 * makes the two views capable of disagreeing forever afterwards.
 *
 * So the proof here is a **count**, taken through a second connection, of the
 * rows actually committed — not an assertion about the shape of what came back.
 * A duplicate-writing implementation passes every "does the entry appear?"
 * test ever written; it fails `select count(*)`.
 *
 * Every assertion reads through an observer connection opened outside the pool
 * under test, for the reason `tests/service-layer-audit.test.ts` sets out: an
 * uncommitted row is perfectly visible to the transaction that wrote it.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import pg, { type Client } from "pg";

import { capabilityRoleCodes } from "@/lib/auth/capabilities";
import type { ResolvedOperator } from "@/lib/auth/operator";
import { closePool, isServiceError, resolveDatabaseUrl, withTransaction } from "@/lib/db";
import { recordAudit } from "./audit";
import {
  ADMINISTRATION_ACTIONS,
  ADMINISTRATION_HISTORY_CAPABILITY,
  readHolderHistory,
  readHolderHistoryIn,
  readOperatorAuditHistory,
  readOperatorAuditHistoryIn,
  recordAdministrationEvent,
  UNREADABLE_ENTRY_MESSAGE,
  type AdministrationHistoryEntry,
} from "./administration-audit";
import { NO_CHANGE_RULE, type AdministrationEventRecord } from "./administration-events";

/**
 * A second, independent connection, opened outside the pool under test.
 *
 * Every "is the row actually there?" assertion goes through this rather than
 * through the transaction that wrote it. Same reasoning, and same guard, as
 * `tests/helpers/service-layer.ts`; it is opened here rather than imported so
 * that a module under `src/` keeps no dependency on the cross-cutting suite.
 */
async function openObserver(): Promise<Client> {
  const client = new pg.Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();
  return client;
}

/** This suite's own marker — parallel suites share one database. */
const MARKER = "LAN130Fixture:administration-audit";

let observer: Client;
/** The administrator who acts in every event here. */
let actorPersonId: string;
/** The operator every event in the happy path is about. */
let targetPersonId: string;
/** A second operator, whose events must never appear in the first one's history. */
let otherPersonId: string;

const ACCOUNT = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER_ACCOUNT = "aaaaaaaa-0000-4000-8000-000000000002";
const ROLE = "bbbbbbbb-0000-4000-8000-000000000001";
const OTHER_ROLE = "bbbbbbbb-0000-4000-8000-000000000002";
const ASSIGNMENT = "cccccccc-0000-4000-8000-000000000001";
const SUCCESSOR_ASSIGNMENT = "cccccccc-0000-4000-8000-000000000002";
const COMMITTEE_YEAR = "dddddddd-0000-4000-8000-000000000001";

const OPERATING_YEAR = { scope: "committee_year", id: COMMITTEE_YEAR, label: "2026-27" } as const;

/**
 * An operator who may read administration history.
 *
 * The role codes are taken from the capability map rather than written out
 * here, so this suite keeps testing the boundary and not a copy of the policy —
 * and so widening `role_management` in a later package does not silently turn
 * this into a test of nothing.
 */
function administrator(): ResolvedOperator {
  return {
    authUserId: "00000000-0000-4000-8000-00000000000a",
    personId: actorPersonId,
    displayName: "Administrator",
    roleCodes: [...capabilityRoleCodes(ADMINISTRATION_HISTORY_CAPABILITY)],
    isActive: true,
  };
}

/** A signed-in operator holding a seat that does not carry the capability. */
function coach(): ResolvedOperator {
  return {
    authUserId: "00000000-0000-4000-8000-00000000000b",
    personId: actorPersonId,
    displayName: "Coach",
    roleCodes: ["head_coach"],
    isActive: true,
  };
}

async function insertPerson(tag: string): Promise<string> {
  const result = await observer.query<{ id: string }>(
    "insert into public.people (given_name, family_name) values ($1, $2) returning id",
    [MARKER, tag],
  );
  return result.rows[0].id;
}

/** Every administration row this suite could have committed. */
async function committedRows(): Promise<{ id: string; action: string }[]> {
  const result = await observer.query<{ id: string; action: string }>(
    `select id, action from public.audit_events
      where actor_person_id = any($1::uuid[])
      order by occurred_at, id`,
    [[actorPersonId, targetPersonId, otherPersonId]],
  );
  return result.rows;
}

async function cleanUpEvents(): Promise<void> {
  await observer.query("delete from public.audit_events where actor_person_id = any($1::uuid[])", [
    [actorPersonId, targetPersonId, otherPersonId],
  ]);
}

function write(record: AdministrationEventRecord): Promise<{ id: string }> {
  return withTransaction((tx) => recordAdministrationEvent(tx, record));
}

/** The deactivation of the target operator — an account-state event. */
function deactivation(
  overrides: Partial<AdministrationEventRecord> = {},
): AdministrationEventRecord {
  return {
    action: "administration.operator.deactivated",
    actorPersonId,
    authority: { kind: "capability", capability: "role_management", roleCodes: ["it_officer"] },
    target: { personId: targetPersonId, operatorAccountId: ACCOUNT },
    operatingYear: OPERATING_YEAR,
    fromState: "active",
    toState: "deactivated",
    reason: "Stepped away from the club.",
    ...overrides,
  };
}

/** The target operator being given a role — a role-assignment event. */
function assignment(overrides: Partial<AdministrationEventRecord> = {}): AdministrationEventRecord {
  return {
    action: "administration.role.assigned",
    actorPersonId,
    authority: { kind: "capability", capability: "role_management", roleCodes: ["it_officer"] },
    target: { personId: targetPersonId, operatorAccountId: ACCOUNT },
    role: { id: ROLE, code: "kit_manager", assignmentId: ASSIGNMENT },
    operatingYear: OPERATING_YEAR,
    toState: "assigned",
    ...overrides,
  };
}

/** The target operator being invited — a provisioning event. */
function invitation(overrides: Partial<AdministrationEventRecord> = {}): AdministrationEventRecord {
  return {
    action: "administration.operator.invited",
    actorPersonId,
    authority: { kind: "capability", capability: "role_management", roleCodes: ["it_officer"] },
    target: { personId: targetPersonId, operatorAccountId: ACCOUNT },
    operatingYear: OPERATING_YEAR,
    toState: "invitation_pending",
    detail: { personOrigin: "linked" },
    ...overrides,
  };
}

/** The target operator's email access being recovered — an email-recovery event. */
function emailRehome(
  overrides: Partial<AdministrationEventRecord> = {},
): AdministrationEventRecord {
  return {
    action: "administration.operator.email_rehome_started",
    actorPersonId,
    authority: { kind: "capability", capability: "role_management", roleCodes: ["it_officer"] },
    target: { personId: targetPersonId, operatorAccountId: ACCOUNT },
    operatingYear: OPERATING_YEAR,
    fromState: "active",
    toState: "email_change_pending",
    reason: "Lost access to the old mailbox.",
    ...overrides,
  };
}

beforeAll(async () => {
  observer = await openObserver();
  await observer.query(
    `delete from public.audit_events
      where actor_person_id in (select id from public.people where given_name = $1)`,
    [MARKER],
  );
  await observer.query("delete from public.people where given_name = $1", [MARKER]);

  actorPersonId = await insertPerson("administrator");
  targetPersonId = await insertPerson("target");
  otherPersonId = await insertPerson("other");
});

afterEach(async () => {
  await cleanUpEvents();
});

afterAll(async () => {
  await cleanUpEvents();
  await observer.query("delete from public.people where given_name = $1", [MARKER]);
  await observer.end();
  await closePool();
});

describe("row 4 — one event, two projections, no duplicate records", () => {
  it("writes exactly one row for a role assignment and shows it in both projections", async () => {
    const written = await write(assignment());

    // The count is the assertion. Two rows here would satisfy every screen and
    // break every reconciliation.
    const rows = await committedRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(written.id);

    const operatorHistory = await readOperatorAuditHistory(administrator(), targetPersonId);
    const holderHistory = await readHolderHistory(administrator(), ROLE);

    expect(operatorHistory.map((entry) => entry.id)).toEqual([written.id]);
    expect(holderHistory.map((entry) => entry.id)).toEqual([written.id]);

    // The same stored event, not two events that happen to look alike.
    expect(new Set([...operatorHistory, ...holderHistory].map((entry) => entry.id)).size).toBe(1);
    expect(operatorHistory[0]).toEqual(holderHistory[0]);
  });

  it("keeps the row count equal to the number of changes across a whole workflow", async () => {
    await write(assignment());
    await write(
      assignment({
        action: "administration.role.ended",
        fromState: "held",
        toState: "ended",
        reason: "Replaced at the AGM.",
      }),
    );
    await write(deactivation());

    expect(await committedRows()).toHaveLength(3);

    const operatorHistory = await readOperatorAuditHistory(administrator(), targetPersonId);
    const holderHistory = await readHolderHistory(administrator(), ROLE);

    // Three changes, three rows: all three in the operator's history, the two
    // role ones also in the role's — from the same three rows.
    expect(operatorHistory).toHaveLength(3);
    expect(holderHistory).toHaveLength(2);
    expect(holderHistory.every((entry) => operatorHistory.some((o) => o.id === entry.id))).toBe(
      true,
    );
  });

  it("records a replacement as the two assignments that changed, linked, and not as a third fact", async () => {
    const correlationId = "eeeeeeee-0000-4000-8000-000000000001";

    const ended = await write(
      assignment({
        action: "administration.role.ended",
        fromState: "held",
        toState: "ended",
        reason: "Replaced at the AGM.",
        correlationId,
      }),
    );
    const started = await write(
      assignment({
        target: { personId: otherPersonId, operatorAccountId: OTHER_ACCOUNT },
        role: { id: ROLE, code: "kit_manager", assignmentId: SUCCESSOR_ASSIGNMENT },
        correlationId,
      }),
    );

    expect(await committedRows()).toHaveLength(2);

    const holderHistory = await readHolderHistory(administrator(), ROLE);
    // Written in separate transactions, so the timestamps already order these.
    // Newest first: the successor's assignment above the outgoing ending.
    expect(holderHistory.map((entry) => entry.id)).toEqual([started.id, ended.id]);
    expect(holderHistory.every((entry) => entry.correlationId === correlationId)).toBe(true);

    // Each holder sees only their own half in their own history.
    const outgoing = await readOperatorAuditHistory(administrator(), targetPersonId);
    const incoming = await readOperatorAuditHistory(administrator(), otherPersonId);
    expect(outgoing.map((entry) => entry.id)).toEqual([ended.id]);
    expect(incoming.map((entry) => entry.id)).toEqual([started.id]);
  });
});

describe("A1 — a pair written in ONE transaction still renders in a meaningful order", () => {
  /**
   * `occurred_at` defaults to `now()`, which is transaction time, so both rows
   * of an atomic replacement carry the *same* timestamp and the old
   * `occurred_at desc, id desc` ordering fell through to a random uuid.
   *
   * The loop is what makes this a regression test rather than a coin toss: the
   * previous implementation had a one-in-two chance of rendering the right
   * order on any single round, so eight independent rounds leave it a
   * one-in-256 chance of passing by luck.
   */
  const ROUNDS = 8;

  it("renders a replacement successor above the outgoing ending, every time", async () => {
    const correlationId = "eeeeeeee-0000-4000-8000-000000000002";

    for (let round = 0; round < ROUNDS; round += 1) {
      await withTransaction(async (tx) => {
        await recordAdministrationEvent(
          tx,
          assignment({
            action: "administration.role.ended",
            fromState: "held",
            toState: "ended",
            reason: "Replaced at the AGM.",
            correlationId,
          }),
        );
        await recordAdministrationEvent(
          tx,
          assignment({
            target: { personId: otherPersonId, operatorAccountId: OTHER_ACCOUNT },
            role: { id: ROLE, code: "kit_manager", assignmentId: SUCCESSOR_ASSIGNMENT },
            correlationId,
          }),
        );
      });

      const history = await readHolderHistory(administrator(), ROLE);

      // Both rows really do share one instant — otherwise the timestamp would
      // be doing the ordering and this test would prove nothing.
      expect(new Set(history.map((entry) => entry.occurredAt)).size).toBe(1);
      expect(history.map((entry) => entry.action)).toEqual([
        "administration.role.assigned",
        "administration.role.ended",
      ]);

      await cleanUpEvents();
    }
  });

  it("renders an initial role assignment above the invitation it was created with", async () => {
    // The other pair `WP-invitation` must write atomically: create the account,
    // then assign the first role. Same instant, same rule.
    for (let round = 0; round < ROUNDS; round += 1) {
      await withTransaction(async (tx) => {
        await recordAdministrationEvent(tx, invitation());
        await recordAdministrationEvent(tx, assignment());
      });

      const history = await readOperatorAuditHistory(administrator(), targetPersonId);

      expect(new Set(history.map((entry) => entry.occurredAt)).size).toBe(1);
      expect(history.map((entry) => entry.action)).toEqual([
        "administration.role.assigned",
        "administration.operator.invited",
      ]);

      await cleanUpEvents();
    }
  });

  it("still orders by time first, so an ordering rule never outranks the clock", async () => {
    // The tie-break must only break ties. An assignment made last year must not
    // float above an ending recorded today just because of its position.
    await write(assignment());
    await write(
      assignment({
        action: "administration.role.ended",
        fromState: "held",
        toState: "ended",
        reason: "Season over.",
      }),
    );

    const history = await readHolderHistory(administrator(), ROLE);
    expect(new Set(history.map((entry) => entry.occurredAt)).size).toBe(2);
    expect(history.map((entry) => entry.action)).toEqual([
      "administration.role.ended",
      "administration.role.assigned",
    ]);
  });
});

describe("row 5 — Operator audit history shows target-affecting events", () => {
  it("includes every family of change affecting that operator", async () => {
    // All four families the requirement names, each written and read back
    // through Postgres — LAN-130 review finding A2. Two of them were only ever
    // exercised as pure records before, so this test's name outran it.
    await write(invitation());
    await write(assignment());
    await write(deactivation());
    await write(
      deactivation({
        action: "administration.operator.restored",
        fromState: "deactivated",
        toState: "active",
        reason: null,
      }),
    );
    await write(emailRehome());

    const history = await readOperatorAuditHistory(administrator(), targetPersonId);
    expect(history.map((entry) => entry.family).sort()).toEqual([
      "account_state",
      "account_state",
      "email_recovery",
      "provisioning",
      "role_assignment",
    ]);
  });

  it("round-trips a provisioning event's own fields, not merely its family", async () => {
    await write(invitation());

    const [entry] = await readOperatorAuditHistory(administrator(), targetPersonId);
    expect(entry.action).toBe("administration.operator.invited");
    expect(entry.label).toBe("Operator invited");
    expect(entry.fromState).toBeNull();
    expect(entry.toState).toBe("invitation_pending");
    expect(entry.detail).toEqual({ personOrigin: "linked" });
    expect(entry.role).toBeNull();
    expect(entry.unreadable).toBeNull();
  });

  it("round-trips an email-recovery event, including the reason it requires", async () => {
    await write(emailRehome());

    const [entry] = await readOperatorAuditHistory(administrator(), targetPersonId);
    expect(entry.action).toBe("administration.operator.email_rehome_started");
    expect(entry.family).toBe("email_recovery");
    expect(entry.fromState).toBe("active");
    expect(entry.toState).toBe("email_change_pending");
    expect(entry.reason).toBe("Lost access to the old mailbox.");
    expect(entry.unreadable).toBeNull();
  });

  it("excludes another operator's events entirely", async () => {
    await write(deactivation());
    await write(
      deactivation({ target: { personId: otherPersonId, operatorAccountId: OTHER_ACCOUNT } }),
    );

    const history = await readOperatorAuditHistory(administrator(), targetPersonId);
    expect(history).toHaveLength(1);
    expect(history[0].target.personId).toBe(targetPersonId);
  });

  it("excludes audit rows that are not administration events at all", async () => {
    // An event approval is a real `audit_events` row written by another
    // service. It must never surface in an administration history, whatever
    // its context happens to contain.
    await withTransaction((tx) =>
      recordAudit(tx, {
        actorPersonId,
        action: "event.approved",
        entityTable: "public.events",
        entityId: ASSIGNMENT,
        fromState: "pending_approval",
        toState: "approved",
        context: { administration: { version: 1, targetPersonId } },
      }),
    );

    expect(await committedRows()).toHaveLength(1);
    expect(await readOperatorAuditHistory(administrator(), targetPersonId)).toEqual([]);
  });

  it("is empty, rather than an error, for a Person nothing has been done to", async () => {
    expect(await readOperatorAuditHistory(administrator(), otherPersonId)).toEqual([]);
  });

  it("refuses an identifier that is not one", async () => {
    await expect(readOperatorAuditHistory(administrator(), "not-a-person")).rejects.toMatchObject({
      kind: "constraint_violated",
      rule: "administration_history_operator_id_invalid",
    });
  });
});

describe("row 6 — Holder history shows the role-related subset", () => {
  it("excludes account-state events, because a deactivated holder still holds the seat", async () => {
    await write(assignment());
    await write(deactivation());

    const history = await readHolderHistory(administrator(), ROLE);
    expect(history).toHaveLength(1);
    expect(history[0].family).toBe("role_assignment");
    expect(history[0].role).toEqual({ id: ROLE, code: "kit_manager", assignmentId: ASSIGNMENT });
  });

  it("excludes another role's events", async () => {
    await write(assignment());
    await write(
      assignment({
        role: { id: OTHER_ROLE, code: "media_secretary", assignmentId: SUCCESSOR_ASSIGNMENT },
      }),
    );

    const history = await readHolderHistory(administrator(), ROLE);
    expect(history.map((entry) => entry.role?.id)).toEqual([ROLE]);
  });

  it("names the holder each entry concerns", async () => {
    await write(assignment());

    const history = await readHolderHistory(administrator(), ROLE);
    expect(history[0].target.personId).toBe(targetPersonId);
    expect(history[0].target.name).toBe(`${MARKER} target`);
  });
});

describe("row 10 — administration history is a privileged read", () => {
  it("refuses an operator who does not hold the capability", async () => {
    await write(assignment());

    for (const read of [
      () => readOperatorAuditHistory(coach(), targetPersonId),
      () => readHolderHistory(coach(), ROLE),
    ]) {
      await expect(read()).rejects.toMatchObject({
        kind: "not_permitted",
        rule: `capability:${ADMINISTRATION_HISTORY_CAPABILITY}`,
      });
    }
  });

  it("refuses a caller with no operator at all", async () => {
    await expect(readOperatorAuditHistory(null, targetPersonId)).rejects.toMatchObject({
      kind: "not_permitted",
    });
    await expect(readHolderHistory(null, ROLE)).rejects.toMatchObject({ kind: "not_permitted" });
  });

  it("refuses before reading, so a refusal discloses nothing about the subject", async () => {
    await write(assignment());

    let refusal: unknown;
    try {
      await readOperatorAuditHistory(coach(), targetPersonId);
    } catch (error) {
      refusal = error;
    }

    expect(isServiceError(refusal)).toBe(true);
    if (!isServiceError(refusal)) return;
    expect(refusal.message).not.toContain(targetPersonId);
    expect(refusal.message).not.toContain("kit_manager");
  });
});

describe("A6 — an event this version cannot read is a visible gap, not an absence", () => {
  /** Writes a raw administration row carrying an envelope we cannot read. */
  async function writeForeignEnvelope(envelope: Record<string, unknown>): Promise<string> {
    const written = await withTransaction((tx) =>
      recordAudit(tx, {
        actorPersonId,
        action: "administration.operator.deactivated",
        entityTable: "public.operator_accounts",
        entityId: ACCOUNT,
        fromState: "active",
        toState: "deactivated",
        reason: "Written by a later version.",
        context: { administration: envelope },
      }),
    );
    return written.id;
  }

  it("keeps a newer-envelope row in the list and marks it", async () => {
    await write(assignment());
    const foreignId = await writeForeignEnvelope({
      version: 2,
      targetPersonId,
      somethingThisVersionDoesNotKnow: true,
    });

    const history = await readOperatorAuditHistory(administrator(), targetPersonId);

    // The old behaviour returned one entry here, and the reader had no way to
    // know a second event existed.
    expect(history).toHaveLength(2);
    const marked = history.filter((entry) => entry.unreadable !== null);
    expect(marked.map((entry) => entry.id)).toEqual([foreignId]);
    expect(marked[0].unreadable).toEqual({
      reason: "unsupported-envelope-version",
      storedVersion: 2,
      message: UNREADABLE_ENTRY_MESSAGE,
    });
  });

  it("still tells the reader what kind of thing happened, when, and who did it", async () => {
    await writeForeignEnvelope({ version: 99, targetPersonId });

    const [entry] = await readOperatorAuditHistory(administrator(), targetPersonId);
    expect(entry.action).toBe("administration.operator.deactivated");
    expect(entry.label).toBe("Operator access deactivated");
    expect(entry.family).toBe("account_state");
    expect(entry.actor.personId).toBe(actorPersonId);
    expect(entry.actor.name).toBe(`${MARKER} administrator`);
    expect(entry.fromState).toBe("active");
    expect(entry.toState).toBe("deactivated");
    expect(entry.reason).toBe("Written by a later version.");
    expect(entry.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // And is honest about what it cannot say.
    expect(entry.authority.roleCodes).toEqual([]);
    expect(entry.role).toBeNull();
    expect(entry.detail).toEqual({});
    expect(entry.unreadable?.storedVersion).toBe(99);
  });

  it("marks a row whose envelope is absent or the wrong shape, rather than dropping it", async () => {
    await writeForeignEnvelope({ targetPersonId });

    const [absent] = await readOperatorAuditHistory(administrator(), targetPersonId);
    expect(absent.unreadable).toEqual({
      reason: "missing-envelope",
      storedVersion: null,
      message: UNREADABLE_ENTRY_MESSAGE,
    });
  });

  it("leaves every event this version wrote unmarked", async () => {
    await write(assignment());
    await write(deactivation());
    await write(invitation());
    await write(emailRehome());

    const history = await readOperatorAuditHistory(administrator(), targetPersonId);
    expect(history).toHaveLength(4);
    expect(history.every((entry) => entry.unreadable === null)).toBe(true);
  });

  it("does not let one unreadable row take the readable ones with it", async () => {
    await write(assignment());
    await writeForeignEnvelope({ version: 2, targetPersonId });
    await write(deactivation());

    const history = await readOperatorAuditHistory(administrator(), targetPersonId);
    expect(history).toHaveLength(3);
    expect(history.filter((entry) => entry.unreadable === null)).toHaveLength(2);
  });
});

describe("A7 — the guard is pinned where it actually lives", () => {
  it("refuses an unpermitted caller in the transaction-scoped reads themselves", async () => {
    await write(assignment());

    // Not through the wrapper. If a later refactor moves the guard up to
    // `readOperatorAuditHistory`, these four calls become unguarded reads of
    // administration history and this test is the only thing that notices.
    await expect(
      withTransaction((tx) => readOperatorAuditHistoryIn(tx, coach(), targetPersonId)),
    ).rejects.toMatchObject({
      kind: "not_permitted",
      rule: `capability:${ADMINISTRATION_HISTORY_CAPABILITY}`,
    });
    await expect(
      withTransaction((tx) => readHolderHistoryIn(tx, coach(), ROLE)),
    ).rejects.toMatchObject({
      kind: "not_permitted",
      rule: `capability:${ADMINISTRATION_HISTORY_CAPABILITY}`,
    });
    await expect(
      withTransaction((tx) => readOperatorAuditHistoryIn(tx, null, targetPersonId)),
    ).rejects.toMatchObject({ kind: "not_permitted" });
    await expect(
      withTransaction((tx) => readHolderHistoryIn(tx, null, ROLE)),
    ).rejects.toMatchObject({ kind: "not_permitted" });
  });

  it("validates the subject identifier in the transaction-scoped reads too", async () => {
    await expect(
      withTransaction((tx) => readOperatorAuditHistoryIn(tx, administrator(), "not-a-person")),
    ).rejects.toMatchObject({ rule: "administration_history_operator_id_invalid" });
    await expect(
      withTransaction((tx) => readHolderHistoryIn(tx, administrator(), "not-a-role")),
    ).rejects.toMatchObject({ rule: "administration_history_role_id_invalid" });
  });

  it("returns the same entries through the transaction-scoped read as through the wrapper", async () => {
    await write(assignment());
    await write(deactivation());

    const throughWrapper = await readOperatorAuditHistory(administrator(), targetPersonId);
    const throughTx = await withTransaction((tx) =>
      readOperatorAuditHistoryIn(tx, administrator(), targetPersonId),
    );
    expect(throughTx).toEqual(throughWrapper);

    const holderWrapper = await readHolderHistory(administrator(), ROLE);
    const holderTx = await withTransaction((tx) => readHolderHistoryIn(tx, administrator(), ROLE));
    expect(holderTx).toEqual(holderWrapper);
  });
});

describe("row 11 — what an entry carries", () => {
  it("reports the actor, the authority held at the time, the year, and the reason", async () => {
    await write(deactivation());

    const [entry] = await readOperatorAuditHistory(administrator(), targetPersonId);
    expect(entry.actor).toEqual({
      personId: actorPersonId,
      name: `${MARKER} administrator`,
    });
    expect(entry.authority).toEqual({
      kind: "capability",
      capability: "role_management",
      roleCodes: ["it_officer"],
    });
    expect(entry.operatingYear).toEqual({
      scope: "committee_year",
      id: COMMITTEE_YEAR,
      label: "2026-27",
    });
    expect(entry.fromState).toBe("active");
    expect(entry.toState).toBe("deactivated");
    expect(entry.reason).toBe("Stepped away from the club.");
    expect(entry.label).toBe("Operator access deactivated");
    expect(entry.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("orders newest first", async () => {
    await write(assignment());
    await write(deactivation());
    await write(
      deactivation({
        action: "administration.operator.restored",
        fromState: "deactivated",
        toState: "active",
        reason: null,
      }),
    );

    const history = await readOperatorAuditHistory(administrator(), targetPersonId);
    const times = history.map((entry: AdministrationHistoryEntry) => entry.occurredAt);
    expect([...times].sort().reverse()).toEqual(times);
    expect(history[0].action).toBe("administration.operator.restored");
  });
});

describe("rows 8 and 9 — nothing is written that should not be", () => {
  it("writes no row at all when the transition would change nothing", async () => {
    await expect(
      write(deactivation({ fromState: "deactivated", toState: "deactivated" })),
    ).rejects.toMatchObject({ kind: "invalid_transition", rule: NO_CHANGE_RULE });

    expect(await committedRows()).toHaveLength(0);
  });

  it("takes the event down with the change it describes when the transaction fails", async () => {
    const boom = new Error("the state change failed after the audit row was written");

    await expect(
      withTransaction(async (tx) => {
        await recordAdministrationEvent(tx, assignment());
        throw boom;
      }),
    ).rejects.toBe(boom);

    expect(await committedRows()).toHaveLength(0);
  });

  it("leaves the ledger append-only: the server role may select and insert, nothing else", async () => {
    const { rows } = await observer.query<{ grantee: string; privilege_type: string }>(
      `select grantee, privilege_type
         from information_schema.role_table_grants
        where table_schema = 'public' and table_name = 'audit_events'
          and grantee <> 'postgres'
        order by grantee, privilege_type`,
    );

    expect(rows.map((row) => `${row.grantee}:${row.privilege_type}`)).toEqual([
      "service_role:INSERT",
      "service_role:SELECT",
    ]);
  });

  it("exposes no update, delete or amendment path from this module", async () => {
    const exported: Record<string, unknown> = await import("./administration-audit");
    const surface = Object.keys(exported).join(" ");
    expect(surface).not.toMatch(/update|delete|amend|correct|redact|purge/i);
  });

  it("projects only the closed action set, so a future action cannot leak in unnoticed", async () => {
    await withTransaction((tx) =>
      recordAudit(tx, {
        actorPersonId,
        action: "administration.operator.exported",
        entityTable: "public.operator_accounts",
        entityId: ACCOUNT,
        toState: "exported",
        context: {
          administration: { version: 1, targetPersonId, roleId: ROLE },
        },
      }),
    );

    expect(ADMINISTRATION_ACTIONS).not.toContain("administration.operator.exported");
    expect(await readOperatorAuditHistory(administrator(), targetPersonId)).toEqual([]);
    expect(await readHolderHistory(administrator(), ROLE)).toEqual([]);
  });
});
