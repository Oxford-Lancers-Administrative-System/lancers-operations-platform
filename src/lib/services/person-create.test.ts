// @vitest-environment node
/**
 * W3 — add or link a person who holds no membership, against the real local
 * database. LAN-185, `REQ-duplicate-check`, `REQ-create-without-roles`.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import { closePool } from "@/lib/db";
import { openObserver, seededActorPersonId } from "../../../tests/helpers/service-layer";
import { createPerson } from "./person-create";

const MARKER = "LAN185PersonCreate";
let counter = 0;
function unique(tag: string): string {
  return `${MARKER}-${tag}-${process.pid}-${counter++}`;
}

let observer: Client;
let actorPersonId: string;
const createdPersonIds: string[] = [];

async function insertExisting(fields: {
  givenName: string;
  familyName?: string | null;
  phone?: string | null;
  email?: string | null;
}): Promise<string> {
  const result = await observer.query<{ id: string }>(
    `insert into public.people (given_name, family_name) values ($1, $2) returning id`,
    [fields.givenName, fields.familyName ?? null],
  );
  const id = result.rows[0].id;
  createdPersonIds.push(id);
  if (fields.phone) {
    await observer.query(
      `insert into public.contact_points (person_id, kind, raw_value, is_preferred, source)
       values ($1::uuid, 'phone', $2, true, 'test fixture')`,
      [id, fields.phone],
    );
  }
  if (fields.email) {
    await observer.query(
      `insert into public.contact_points (person_id, kind, scope, raw_value, is_preferred, source)
       values ($1::uuid, 'email', 'personal', $2, true, 'test fixture')`,
      [id, fields.email],
    );
  }
  return id;
}

beforeAll(async () => {
  observer = await openObserver();
  actorPersonId = await seededActorPersonId(observer);
});

afterAll(async () => {
  await observer.query(
    `delete from public.audit_events where entity_table = 'people' and entity_id = any($1::uuid[])`,
    [createdPersonIds],
  );
  await observer.query(`delete from public.people where id = any($1::uuid[])`, [createdPersonIds]);
  await observer.end();
  await closePool();
});

describe("createPerson — the minimum to mint", () => {
  it("mints a person with a first name, last name and mobile, and creates no role or membership", async () => {
    const givenName = unique("Percival");
    const result = await createPerson({
      actorPersonId,
      input: { givenName, familyName: "Oakhanger", mobile: "+44 7700 900314" },
      decision: { kind: "create_new" },
    });
    createdPersonIds.push(result.personId);

    expect(result.created).toBe(true);
    expect(result.record.givenName).toBe(givenName);

    const roles = await observer.query(
      `select 1 from public.role_assignments where person_id = $1::uuid`,
      [result.personId],
    );
    const memberships = await observer.query(
      `select 1 from public.season_memberships where person_id = $1::uuid`,
      [result.personId],
    );
    expect(roles.rows).toHaveLength(0);
    expect(memberships.rows).toHaveLength(0);
  });

  it("is refused on a first name alone", async () => {
    await expect(
      createPerson({
        actorPersonId,
        input: { givenName: unique("Onlyname"), familyName: "", mobile: null, personalEmail: null },
        decision: { kind: "create_new" },
      }),
    ).rejects.toMatchObject({ rule: "people_family_name_not_blank" });
  });

  it("is refused with no contact point at all", async () => {
    await expect(
      createPerson({
        actorPersonId,
        input: {
          givenName: unique("No"),
          familyName: "Contact",
          mobile: null,
          personalEmail: null,
        },
        decision: { kind: "create_new" },
      }),
    ).rejects.toMatchObject({ rule: "person_create_requires_a_contact_point" });
  });
});

describe("createPerson — the duplicate check", () => {
  it("this is them: links the existing record and creates nothing", async () => {
    const givenName = unique("Hollis");
    const existingId = await insertExisting({
      givenName,
      familyName: "Jarrowdale",
      phone: "+44 7700 900988",
    });

    const before = await observer.query(`select count(*)::int as n from public.people`);

    const result = await createPerson({
      actorPersonId,
      input: { givenName, familyName: "Jarrowdale", mobile: "+44 7700 900988" },
      decision: { kind: "link_existing", personId: existingId },
    });

    expect(result.personId).toBe(existingId);
    expect(result.created).toBe(false);

    const after = await observer.query(`select count(*)::int as n from public.people`);
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it("refuses to mint over an exact contact-point match without a reason", async () => {
    const givenName = unique("Percival");
    await insertExisting({ givenName, familyName: "Oakhanger", phone: "+44 7700 900315" });

    await expect(
      createPerson({
        actorPersonId,
        input: { givenName, familyName: "Oakhanger", mobile: "+44 7700 900315" },
        decision: { kind: "create_new" },
      }),
    ).rejects.toMatchObject({ rule: "person_create_exact_match_requires_reason" });
  });

  it("creates anyway with a reason, and audits the rejected candidate", async () => {
    const givenName = unique("Percival");
    await insertExisting({ givenName, familyName: "Oakhanger", phone: "+44 7700 900316" });

    const result = await createPerson({
      actorPersonId,
      input: { givenName, familyName: "Oakhanger", mobile: "+44 7700 900316" },
      decision: { kind: "create_new", overrideReason: "Father and son, same phone" },
    });
    createdPersonIds.push(result.personId);
    expect(result.created).toBe(true);

    const audit = await observer.query<{
      reason: string | null;
      context: { candidates_shown: unknown[] };
    }>(
      `select reason, context from public.audit_events
        where entity_table = 'people' and entity_id = $1::uuid and action = 'person_created'`,
      [result.personId],
    );
    expect(audit.rows[0].reason).toBe("Father and son, same phone");
    expect((audit.rows[0].context.candidates_shown as unknown[]).length).toBeGreaterThan(0);
  });

  it("never offers a merged-away record; its survivor is offered instead", async () => {
    const survivorId = await insertExisting({
      givenName: unique("Survivor"),
      familyName: "Jarrowdale",
    });
    const givenName = unique("HollyDup");
    const losingId = await insertExisting({
      givenName,
      familyName: "Jarrowdale",
      phone: "+44 7700 900989",
    });
    await observer.query(
      `update public.people set merged_into_person_id = $2::uuid, merged_at = now(),
              merged_by_person_id = $3::uuid, merge_reason = 'test fixture'
        where id = $1::uuid`,
      [losingId, survivorId, actorPersonId],
    );

    await expect(
      createPerson({
        actorPersonId,
        input: { givenName, familyName: "Jarrowdale", mobile: "+44 7700 900989" },
        decision: { kind: "link_existing", personId: losingId },
      }),
    ).rejects.toMatchObject({ rule: "person_merged_away" });
  });
});
