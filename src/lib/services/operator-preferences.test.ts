// @vitest-environment node
/**
 * An operator's own screen settings — LAN-387, Brian's visual pass of
 * 2026-09-17, item 1: "saved on the operator's account so it follows them
 * between devices".
 *
 * Against the real local database, because what is under test is the storage
 * itself: that nothing stored reads as nothing rather than as "everything
 * open", that a stored empty list is a real answer and a different one, that a
 * second write replaces the list rather than appending to it, and that a
 * setting written beside it survives that replacement.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import { closePool } from "@/lib/db";
import { openObserver } from "../../../tests/helpers/service-layer";
import {
  readOperatorPreferences,
  writeRecruitmentCollapsedGroups,
  writeRosterCollapsedGroups,
} from "./operator-preferences";

const MARKER = "LAN387Preference";

let observer: Client;
let personId: string;
let otherPersonId: string;

async function insertPerson(tag: string): Promise<string> {
  const result = await observer.query<{ id: string }>(
    "insert into public.people (given_name, family_name) values ($1, $2) returning id",
    [MARKER, tag],
  );
  return result.rows[0].id;
}

beforeAll(async () => {
  observer = await openObserver();
});

afterEach(async () => {
  await observer.query(
    `delete from public.operator_preferences where person_id in
       (select id from public.people where given_name = $1)`,
    [MARKER],
  );
  await observer.query("delete from public.people where given_name = $1", [MARKER]);
});

afterAll(async () => {
  await observer.end();
  await closePool();
});

describe("readOperatorPreferences", () => {
  it("answers nothing for an operator who has never stored anything", async () => {
    personId = await insertPerson("never");

    // `{}`, not `{ rosterCollapsedGroups: [] }`: the board has to be able to
    // tell "never touched it" from "opened everything", because those are
    // different screens.
    expect(await readOperatorPreferences(personId)).toEqual({});
  });

  it("ignores a stored value of the wrong shape rather than failing the screen", async () => {
    personId = await insertPerson("malformed");
    await observer.query(
      `insert into public.operator_preferences (person_id, preferences)
       values ($1::uuid, '{"rosterCollapsedGroups": "kit"}'::jsonb)`,
      [personId],
    );

    // A setting nobody can read is no setting. It must never be the reason a
    // roster does not render.
    expect(await readOperatorPreferences(personId)).toEqual({});
  });

  it("drops the entries of a stored list that are not names", async () => {
    personId = await insertPerson("mixed");
    await observer.query(
      `insert into public.operator_preferences (person_id, preferences)
       values ($1::uuid, '{"rosterCollapsedGroups": ["kit", 3, null]}'::jsonb)`,
      [personId],
    );

    expect(await readOperatorPreferences(personId)).toEqual({ rosterCollapsedGroups: ["kit"] });
  });
});

describe("writeRosterCollapsedGroups", () => {
  it("stores the groups, and reads them back for that operator alone", async () => {
    personId = await insertPerson("writer");
    otherPersonId = await insertPerson("bystander");

    await writeRosterCollapsedGroups({
      actorPersonId: personId,
      groups: ["specialTeams", "kit"],
    });

    expect(await readOperatorPreferences(personId)).toEqual({
      // Sorted on the way in, so the same choice is always the same row.
      rosterCollapsedGroups: ["kit", "specialTeams"],
    });
    expect(await readOperatorPreferences(otherPersonId)).toEqual({});
  });

  it("replaces the stored list rather than adding to it", async () => {
    personId = await insertPerson("replacer");

    await writeRosterCollapsedGroups({ actorPersonId: personId, groups: ["kit", "coaching"] });
    await writeRosterCollapsedGroups({ actorPersonId: personId, groups: ["kit"] });

    expect(await readOperatorPreferences(personId)).toEqual({ rosterCollapsedGroups: ["kit"] });
  });

  it("stores an empty list as an answer, not as an absence", async () => {
    personId = await insertPerson("emptied");

    await writeRosterCollapsedGroups({ actorPersonId: personId, groups: ["kit"] });
    await writeRosterCollapsedGroups({ actorPersonId: personId, groups: [] });

    // An operator who opened everything gets everything open next time, rather
    // than the two groups the board closes by default.
    expect(await readOperatorPreferences(personId)).toEqual({ rosterCollapsedGroups: [] });
  });

  it("de-duplicates, so the same choice never stores two ways", async () => {
    personId = await insertPerson("duplicated");

    await writeRosterCollapsedGroups({ actorPersonId: personId, groups: ["kit", "kit"] });

    expect(await readOperatorPreferences(personId)).toEqual({ rosterCollapsedGroups: ["kit"] });
  });

  it("leaves any other setting on the row alone", async () => {
    personId = await insertPerson("merger");
    await observer.query(
      `insert into public.operator_preferences (person_id, preferences)
       values ($1::uuid, '{"somethingElse": "kept"}'::jsonb)`,
      [personId],
    );

    await writeRosterCollapsedGroups({ actorPersonId: personId, groups: ["kit"] });

    // The write merges into the object. A screen added after this one must not
    // lose its setting the first time somebody folds a roster group away.
    const stored = await observer.query<{ preferences: Record<string, unknown> }>(
      "select preferences from public.operator_preferences where person_id = $1::uuid",
      [personId],
    );
    expect(stored.rows[0].preferences).toEqual({
      somethingElse: "kept",
      rosterCollapsedGroups: ["kit"],
    });
  });

  it("stamps updated_at on a replacement", async () => {
    personId = await insertPerson("stamped");

    await writeRosterCollapsedGroups({ actorPersonId: personId, groups: ["kit"] });
    const first = await observer.query<{ updated_at: Date }>(
      "select updated_at from public.operator_preferences where person_id = $1::uuid",
      [personId],
    );
    await observer.query(
      "update public.operator_preferences set updated_at = now() - interval '1 hour' where person_id = $1::uuid",
      [personId],
    );
    await writeRosterCollapsedGroups({ actorPersonId: personId, groups: ["coaching"] });

    const second = await observer.query<{ updated_at: Date }>(
      "select updated_at from public.operator_preferences where person_id = $1::uuid",
      [personId],
    );
    expect(second.rows[0].updated_at.getTime()).toBeGreaterThan(
      first.rows[0].updated_at.getTime() - 60_000,
    );
  });
});

/**
 * LAN-404 — the recruitment board's groups are its own. Both boards have a
 * `person` group, so one stored list would have folded both at once.
 */
describe("writeRecruitmentCollapsedGroups", () => {
  it("keeps the two boards' settings apart in the one row", async () => {
    personId = await insertPerson("two boards");

    await writeRosterCollapsedGroups({ actorPersonId: personId, groups: ["person", "kit"] });
    await writeRecruitmentCollapsedGroups({
      actorPersonId: personId,
      groups: ["events:event-1"],
    });

    expect(await readOperatorPreferences(personId)).toEqual({
      rosterCollapsedGroups: ["kit", "person"],
      recruitmentCollapsedGroups: ["events:event-1"],
    });

    // Writing one leaves the other exactly where it was.
    await writeRecruitmentCollapsedGroups({ actorPersonId: personId, groups: [] });
    expect(await readOperatorPreferences(personId)).toEqual({
      rosterCollapsedGroups: ["kit", "person"],
      recruitmentCollapsedGroups: [],
    });
  });
});
