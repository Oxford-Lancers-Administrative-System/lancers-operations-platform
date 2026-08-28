// @vitest-environment node
/**
 * The one duplicate check — against the real local database. LAN-183,
 * `REQ-duplicate-check`.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import { closePool } from "@/lib/db";
import { openObserver, seededActorPersonId } from "../../../tests/helpers/service-layer";
import { findPersonDuplicates } from "./person-duplicate";

const MARKER = "LAN183PersonDuplicate";

function unique(tag: string): string {
  return `${MARKER}-${tag}-${process.pid}-${counter++}`;
}
let counter = 0;

let observer: Client;
let actorPersonId: string;
const createdPersonIds: string[] = [];

async function insertPerson(givenName: string, familyName: string | null = null): Promise<string> {
  const result = await observer.query<{ id: string }>(
    `insert into public.people (given_name, family_name) values ($1, $2) returning id`,
    [givenName, familyName],
  );
  const id = result.rows[0].id;
  createdPersonIds.push(id);
  return id;
}

async function insertAlias(personId: string, alias: string): Promise<void> {
  await observer.query(
    `insert into public.person_aliases (person_id, alias, source) values ($1::uuid, $2, 'test fixture')`,
    [personId, alias],
  );
}

async function insertContact(
  personId: string,
  kind: "email" | "phone",
  rawValue: string,
  options: { isPreferred?: boolean; validFrom?: string; validUntil?: string | null } = {},
): Promise<void> {
  await observer.query(
    `insert into public.contact_points (person_id, kind, raw_value, is_preferred, source, valid_from, valid_until)
     values ($1::uuid, $2::public.contact_point_kind, $3, $4, 'test fixture',
             coalesce($5::timestamptz, now()), $6::timestamptz)`,
    [
      personId,
      kind,
      rawValue,
      options.isPreferred ?? true,
      options.validFrom ?? null,
      options.validUntil ?? null,
    ],
  );
}

async function mergeAway(losingId: string, survivorId: string): Promise<void> {
  // `people_merge_is_fully_audited` requires all four merge columns together
  // — invariant I6, "a merge is an audited operation". `merged_by_person_id`
  // is the actor; a real merge write path (a later package) would carry it
  // from `resolveOperator()`, so this fixture reuses the same seeded actor
  // every write test in this package uses.
  await observer.query(
    `update public.people
        set merged_into_person_id = $2::uuid, merged_at = now(),
            merged_by_person_id = $3::uuid, merge_reason = 'test fixture'
      where id = $1::uuid`,
    [losingId, survivorId, actorPersonId],
  );
}

beforeAll(async () => {
  observer = await openObserver();
  actorPersonId = await seededActorPersonId(observer);
});

afterAll(async () => {
  await observer.query(`delete from public.people where id = any($1::uuid[])`, [createdPersonIds]);
  await observer.end();
  await closePool();
});

describe("findPersonDuplicates", () => {
  it("matches on given name alone — a quarter of the club has no surname on file", async () => {
    const givenName = unique("Bertram");
    const personId = await insertPerson(givenName);

    const candidates = await findPersonDuplicates({ givenName });

    const found = candidates.find((c) => c.personId === personId);
    expect(found).toBeDefined();
    expect(found!.matchedOn).toContain("given_name");
  });

  it("matches on family name", async () => {
    const familyName = unique("Fielding");
    const personId = await insertPerson("Someone", familyName);

    const candidates = await findPersonDuplicates({ givenName: "Nobody Matches This", familyName });

    const found = candidates.find((c) => c.personId === personId);
    expect(found).toBeDefined();
    expect(found!.matchedOn).toContain("family_name");
  });

  it("matches on an alias", async () => {
    const givenName = unique("Formal");
    const personId = await insertPerson(givenName, "Name");
    const alias = unique("Nickname");
    await insertAlias(personId, alias);

    const candidates = await findPersonDuplicates({ givenName: alias });

    const found = candidates.find((c) => c.personId === personId);
    expect(found).toBeDefined();
    expect(found!.matchedOn).toContain("alias");
  });

  it("matches on any email supplied, not only the first", async () => {
    const givenName = unique("MultiEmail");
    const personId = await insertPerson(givenName);
    const email = `${unique("shared")}@example.com`;
    await insertContact(personId, "email", email);

    const candidates = await findPersonDuplicates({
      givenName: "Nothing Like It",
      emails: ["not-this-one@example.com", email],
    });

    const found = candidates.find((c) => c.personId === personId);
    expect(found).toBeDefined();
    expect(found!.matchedOn).toContain("email");
  });

  it("matches a phone on its last nine digits, spaced or unspaced", async () => {
    const givenName = unique("PhoneMatch");
    const personId = await insertPerson(givenName);
    await insertContact(personId, "phone", "+44 7700 900456");

    const candidates = await findPersonDuplicates({
      givenName: "Nothing Like It Either",
      phones: ["07700900456"],
    });

    const found = candidates.find((c) => c.personId === personId);
    expect(found).toBeDefined();
    expect(found!.matchedOn).toContain("phone");
  });

  it("never offers a merged-away record", async () => {
    const givenName = unique("MergedCandidate");
    const survivorId = await insertPerson(unique("Survivor"));
    const losingId = await insertPerson(givenName);
    await mergeAway(losingId, survivorId);

    const candidates = await findPersonDuplicates({ givenName });

    expect(candidates.map((c) => c.personId)).not.toContain(losingId);
  });

  it("does not match a superseded (no longer current) contact value", async () => {
    const givenName = unique("Superseded");
    const personId = await insertPerson(givenName);
    const email = `${unique("old")}@example.com`;
    await insertContact(personId, "email", email, {
      // `contact_points_preferred_must_be_current` refuses a preferred row
      // that is also dated -- a superseded value cannot be the current
      // preferred one, by definition.
      isPreferred: false,
      validFrom: "2019-01-01T00:00:00Z",
      validUntil: "2020-01-01T00:00:00Z",
    });

    const candidates = await findPersonDuplicates({
      givenName: "Nothing At All Like It",
      emails: [email],
    });

    expect(candidates.map((c) => c.personId)).not.toContain(personId);
  });

  it("reports every current email and phone for a matched candidate", async () => {
    const givenName = unique("ContactList");
    const personId = await insertPerson(givenName);
    const email = `${unique("current")}@example.com`;
    await insertContact(personId, "email", email);
    await insertContact(personId, "phone", "+447700900789");

    const candidates = await findPersonDuplicates({ givenName });
    const found = candidates.find((c) => c.personId === personId)!;

    expect(found.currentEmails).toContain(email);
    expect(found.currentPhones).toContain("+447700900789");
  });

  it("refuses a query with nothing to match on", async () => {
    await expect(findPersonDuplicates({ givenName: "" })).rejects.toMatchObject({
      kind: "constraint_violated",
    });
  });
});
