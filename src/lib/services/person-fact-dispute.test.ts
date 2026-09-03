// @vitest-environment node
/**
 * The disputed-fact raise-and-resolve pair — LAN-214, `REQ-no-silent-overwrite`.
 * Against the real local database: what is under test is the
 * one-open-dispute-per-field upsert, that resolving to the player's answer
 * really writes `people` through the shared `updatePersonField` path, and
 * that the losing value survives on the resolved row.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import { closePool, isServiceError, withTransaction } from "@/lib/db";
import { openObserver, seededActorPersonId } from "../../../tests/helpers/service-layer";
import {
  raisePersonFactDisputeIn,
  readOpenPersonFactDisputesIn,
  resolvePersonFactDisputeIn,
} from "./person-fact-dispute";

const MARKER = "LAN214Dispute";

let observer: Client;
let resolverPersonId: string;

async function insertPerson(tag: string, college: string | null = "Old College"): Promise<string> {
  const result = await observer.query<{ id: string }>(
    "insert into public.people (given_name, family_name, college) values ($1, $2, $3) returning id",
    [MARKER, tag, college],
  );
  return result.rows[0].id;
}

beforeAll(async () => {
  observer = await openObserver();
  resolverPersonId = await seededActorPersonId(observer);
});

afterEach(async () => {
  await observer.query(
    `delete from public.person_fact_disputes where person_id in (select id from public.people where given_name = $1)`,
    [MARKER],
  );
  await observer.query(
    `delete from public.audit_events where entity_table = 'people'
       and entity_id in (select id from public.people where given_name = $1)`,
    [MARKER],
  );
  await observer.query("delete from public.people where given_name = $1", [MARKER]);
});

afterAll(async () => {
  await observer.end();
  await closePool();
});

describe("raisePersonFactDisputeIn", () => {
  it("raises a dispute, leaving the club's value untouched", async () => {
    const personId = await insertPerson("raise");

    const dispute = await withTransaction((tx) =>
      raisePersonFactDisputeIn(tx, {
        personId,
        field: "college",
        clubValue: "Old College",
        playerValue: "New College",
      }),
    );

    expect(dispute.status).toBe("open");
    expect(dispute.clubValue).toBe("Old College");
    expect(dispute.playerValue).toBe("New College");

    const person = await observer.query<{ college: string }>(
      "select college from public.people where id = $1::uuid",
      [personId],
    );
    expect(person.rows[0].college).toBe("Old College");
  });

  it("supersedes the waiting answer rather than opening a second dispute", async () => {
    const personId = await insertPerson("supersede");
    await withTransaction((tx) =>
      raisePersonFactDisputeIn(tx, {
        personId,
        field: "college",
        clubValue: "Old College",
        playerValue: "First Answer",
      }),
    );
    await withTransaction((tx) =>
      raisePersonFactDisputeIn(tx, {
        personId,
        field: "college",
        clubValue: "Old College",
        playerValue: "Second Answer",
      }),
    );

    const open = await withTransaction((tx) => readOpenPersonFactDisputesIn(tx, personId));
    expect(open).toHaveLength(1);
    expect(open[0].playerValue).toBe("Second Answer");
  });
});

describe("resolvePersonFactDisputeIn", () => {
  it("keeps the club's value: people is untouched, the dispute is resolved, the player's answer is retained", async () => {
    const personId = await insertPerson("keep-club");
    const dispute = await withTransaction((tx) =>
      raisePersonFactDisputeIn(tx, {
        personId,
        field: "college",
        clubValue: "Old College",
        playerValue: "Wrong College",
      }),
    );

    const { dispute: resolved, personRecord } = await withTransaction((tx) =>
      resolvePersonFactDisputeIn(tx, {
        disputeId: dispute.id,
        resolverPersonId,
        resolution: "keep_club",
      }),
    );

    expect(resolved.status).toBe("resolved_kept_club");
    expect(resolved.playerValue).toBe("Wrong College"); // retained, never deleted
    expect(personRecord).toBeNull();

    const person = await observer.query<{ college: string }>(
      "select college from public.people where id = $1::uuid",
      [personId],
    );
    expect(person.rows[0].college).toBe("Old College");
  });

  it("takes the player's answer: people is updated, the club's value is retained on the resolved row", async () => {
    const personId = await insertPerson("take-player");
    const dispute = await withTransaction((tx) =>
      raisePersonFactDisputeIn(tx, {
        personId,
        field: "college",
        clubValue: "Old College",
        playerValue: "Corrected College",
      }),
    );

    const { dispute: resolved, personRecord } = await withTransaction((tx) =>
      resolvePersonFactDisputeIn(tx, {
        disputeId: dispute.id,
        resolverPersonId,
        resolution: "take_player",
      }),
    );

    expect(resolved.status).toBe("resolved_took_player");
    expect(resolved.clubValue).toBe("Old College"); // the losing value, retained
    expect(personRecord?.college).toBe("Corrected College");

    const person = await observer.query<{ college: string }>(
      "select college from public.people where id = $1::uuid",
      [personId],
    );
    expect(person.rows[0].college).toBe("Corrected College");
  });

  it("coerces a numeric field's text back to a number when taking the player's answer", async () => {
    const personId = await insertPerson("year");
    await observer.query("update public.people set matriculation_year = 2020 where id = $1::uuid", [
      personId,
    ]);
    const dispute = await withTransaction((tx) =>
      raisePersonFactDisputeIn(tx, {
        personId,
        field: "matriculation_year",
        clubValue: "2020",
        playerValue: "2021",
      }),
    );

    const { personRecord } = await withTransaction((tx) =>
      resolvePersonFactDisputeIn(tx, {
        disputeId: dispute.id,
        resolverPersonId,
        resolution: "take_player",
      }),
    );

    expect(personRecord?.matriculationYear).toBe(2021);
  });

  it("refuses to resolve a dispute twice", async () => {
    const personId = await insertPerson("twice");
    const dispute = await withTransaction((tx) =>
      raisePersonFactDisputeIn(tx, {
        personId,
        field: "college",
        clubValue: "Old College",
        playerValue: "New College",
      }),
    );
    await withTransaction((tx) =>
      resolvePersonFactDisputeIn(tx, {
        disputeId: dispute.id,
        resolverPersonId,
        resolution: "keep_club",
      }),
    );

    const failure = await withTransaction((tx) =>
      resolvePersonFactDisputeIn(tx, {
        disputeId: dispute.id,
        resolverPersonId,
        resolution: "take_player",
      }),
    ).catch((error: unknown) => error);

    expect(isServiceError(failure) && failure.rule).toBe("person_fact_dispute_already_resolved");
  });
});
