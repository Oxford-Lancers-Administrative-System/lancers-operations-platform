// @vitest-environment node
/**
 * `/operate/people/[personId]/merge`'s own boundary — W4, LAN-185. The two
 * refusals, the prospect combine and the FK re-point are already proved
 * against the real database in `person-merge.test.ts`; this proves the
 * action's own parsing (field choices, the reason gate) and who may call it.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new RedirectSignal(url);
  }),
}));

class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`redirect:${url}`);
  }
}

import type { Client } from "pg";

import { closePool } from "@/lib/db";
import { resolveOperatorAccess, type OperatorAccess } from "@/lib/auth/operator";
import { openObserver, seededActorPersonId } from "../../../../../../tests/helpers/service-layer";
import { submitMerge } from "./actions";
import { INITIAL_MERGE_STATE } from "./merge-state";

const MARKER = "LAN185MergeActions";
let counter = 0;
function unique(tag: string): string {
  return `${MARKER}-${tag}-${process.pid}-${counter++}`;
}

let observer: Client;
let actorPersonId: string;
const createdPersonIds: string[] = [];

async function insertPerson(fields: {
  givenName: string;
  familyName?: string | null;
}): Promise<string> {
  const result = await observer.query<{ id: string }>(
    `insert into public.people (given_name, family_name) values ($1, $2) returning id`,
    [fields.givenName, fields.familyName ?? null],
  );
  const id = result.rows[0].id;
  createdPersonIds.push(id);
  return id;
}

function signedInAs(roleCodes: string[]): void {
  const access: OperatorAccess = {
    state: "active",
    operator: {
      authUserId: "00000000-1111-4111-8111-111111111111",
      personId: actorPersonId,
      displayName: "Caspian Hallowfield",
      roleCodes,
      isActive: true,
    },
  };
  vi.mocked(resolveOperatorAccess).mockResolvedValue(access);
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
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

describe("who may call it", () => {
  it("refuses an operator outside the four offices", async () => {
    signedInAs(["treasurer"]);
    const survivorId = await insertPerson({ givenName: unique("Survivor") });
    const loserId = await insertPerson({ givenName: unique("Loser") });
    await expect(
      submitMerge(
        INITIAL_MERGE_STATE,
        form({ survivorPersonId: survivorId, loserPersonId: loserId, reason: "Same person" }),
      ),
    ).rejects.toThrow();
  });
});

describe("the reason gate", () => {
  it("refuses without a reason, before touching the database", async () => {
    signedInAs(["secretary"]);
    const survivorId = await insertPerson({ givenName: unique("Survivor") });
    const loserId = await insertPerson({ givenName: unique("Loser") });

    const result = await submitMerge(
      INITIAL_MERGE_STATE,
      form({ survivorPersonId: survivorId, loserPersonId: loserId, reason: "  " }),
    );
    expect(result.reasonError).toBeTruthy();

    const after = await observer.query<{ merged_into_person_id: string | null }>(
      `select merged_into_person_id from public.people where id = $1::uuid`,
      [loserId],
    );
    expect(after.rows[0].merged_into_person_id).toBeNull();
  });
});

describe("the merge", () => {
  it("applies the operator's per-field choices and redirects to the survivor", async () => {
    signedInAs(["secretary"]);
    const survivorId = await insertPerson({
      givenName: unique("Survivor"),
      familyName: "Alderfield",
    });
    const loserId = await insertPerson({
      givenName: unique("LoserGiven"),
      familyName: "Alderfield",
    });

    await expect(
      submitMerge(
        INITIAL_MERGE_STATE,
        form({
          survivorPersonId: survivorId,
          loserPersonId: loserId,
          reason: "Same person, entered twice",
          field_given_name: "loser",
        }),
      ),
    ).rejects.toThrow(RedirectSignal);

    const row = await observer.query<{ given_name: string; merged_into_person_id: string | null }>(
      `select given_name, merged_into_person_id from public.people where id = $1::uuid`,
      [survivorId],
    );
    expect(row.rows[0].given_name).toContain("LoserGiven");

    const loserRow = await observer.query<{ merged_into_person_id: string | null }>(
      `select merged_into_person_id from public.people where id = $1::uuid`,
      [loserId],
    );
    expect(loserRow.rows[0].merged_into_person_id).toBe(survivorId);
  });
});
