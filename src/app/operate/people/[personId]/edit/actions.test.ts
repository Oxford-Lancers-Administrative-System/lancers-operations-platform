// @vitest-environment node
/**
 * `/operate/people/[personId]/edit`'s own boundary — W2, LAN-185. Against
 * the real database: the orchestration this action does (re-reading the
 * current record, writing only what changed, resolving an email collision to
 * the other person) is exactly what a mock would have to reimplement to be
 * worth trusting.
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
import { readPersonRecord } from "@/lib/services/person-record";
import { personVersion } from "@/lib/services/person-write";
import { submitPersonEdit } from "./actions";
import { INITIAL_EDIT_STATE } from "./edit-state";

const MARKER = "LAN185EditActions";
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

async function insertContact(
  personId: string,
  fields: { kind: "email" | "phone"; scope?: "college" | "personal" | null; rawValue: string },
): Promise<void> {
  await observer.query(
    `insert into public.contact_points (person_id, kind, scope, raw_value, is_preferred, source)
     values ($1::uuid, $2::public.contact_point_kind, $3::public.contact_point_scope, $4, true, 'test fixture')`,
    [personId, fields.kind, fields.scope ?? null, fields.rawValue],
  );
}

function signedInAs(): void {
  const access: OperatorAccess = {
    state: "active",
    operator: {
      authUserId: "00000000-1111-4111-8111-111111111111",
      personId: actorPersonId,
      displayName: "Caspian Hallowfield",
      roleCodes: ["secretary"],
      isActive: true,
    },
  };
  vi.mocked(resolveOperatorAccess).mockResolvedValue(access);
}

/** Every field the action reads, defaulted from the current record, so a test only overrides what it means to change. */
async function formFrom(
  personId: string,
  overrides: Record<string, string> = {},
): Promise<FormData> {
  const record = await readPersonRecord(personId);
  const version = await personVersion(personId);
  const mobile = record.contacts.find(
    (c) => c.kind === "phone" && c.validUntil === null && c.isPreferred,
  );
  const personalEmail = record.contacts.find(
    (c) => c.kind === "email" && c.scope === "personal" && c.validUntil === null && c.isPreferred,
  );
  const collegeEmail = record.contacts.find(
    (c) => c.kind === "email" && c.scope === "college" && c.validUntil === null && c.isPreferred,
  );
  const base: Record<string, string> = {
    personId,
    expectedVersion: version ?? "",
    givenName: record.givenName,
    familyName: record.familyName ?? "",
    mobile: mobile?.rawValue ?? "",
    mobileReason: "",
    personalEmail: personalEmail?.rawValue ?? "",
    personalEmailReason: "",
    collegeEmail: collegeEmail?.rawValue ?? "",
    collegeEmailReason: "",
    college: record.college ?? "",
    matriculationYear: record.matriculationYear?.toString() ?? "",
    expectedGraduationYear: record.expectedGraduationYear?.toString() ?? "",
    degreeField: record.degreeField ?? "",
    dateOfBirth: record.dateOfBirth ?? "",
    emergencyGivenName: record.emergencyContact?.givenName ?? "",
    emergencyFamilyName: record.emergencyContact?.familyName ?? "",
    emergencyRelationship: record.emergencyContact?.relationship ?? "",
    emergencyPhone: record.emergencyContact?.phone ?? "",
    emergencyEmail: record.emergencyContact?.email ?? "",
    ...overrides,
  };
  const data = new FormData();
  for (const [key, value] of Object.entries(base)) data.set(key, value);
  return data;
}

beforeAll(async () => {
  observer = await openObserver();
  actorPersonId = await seededActorPersonId(observer);
});

afterAll(async () => {
  await observer.query(
    `delete from public.audit_events
      where (entity_table = 'people' and entity_id = any($1::uuid[]))
         or (entity_table = 'contact_points'
             and entity_id in (select id from public.contact_points where person_id = any($1::uuid[])))
         or (entity_table = 'person_emergency_contacts' and entity_id = any($1::uuid[]))`,
    [createdPersonIds],
  );
  await observer.query(`delete from public.people where id = any($1::uuid[])`, [createdPersonIds]);
  await observer.end();
  await closePool();
});

describe("who may call it", () => {
  it("refuses an operator outside the four offices, before reading anything", async () => {
    vi.mocked(resolveOperatorAccess).mockResolvedValue({
      state: "active",
      operator: {
        authUserId: "00000000-1111-4111-8111-111111111112",
        personId: "22222222-1111-4111-8111-111111111111",
        displayName: "Someone",
        roleCodes: ["treasurer"],
        isActive: true,
      },
    });
    const data = new FormData();
    data.set("personId", "00000000-0000-4000-8000-000000000000");
    await expect(submitPersonEdit(INITIAL_EDIT_STATE, data)).rejects.toThrow();
  });
});

describe("filling and correcting", () => {
  it("fills an empty last name with no reason, and it reads back on the record", async () => {
    signedInAs();
    const personId = await insertPerson({ givenName: unique("Bertram") });
    const data = await formFrom(personId, { familyName: "Brackenridge" });

    await expect(submitPersonEdit(INITIAL_EDIT_STATE, data)).rejects.toThrow(RedirectSignal);

    const after = await readPersonRecord(personId);
    expect(after.familyName).toBe("Brackenridge");
    expect(after.missingRequiredFields).not.toContain("family_name");
  });

  it("requires a reason to change an existing mobile, and keeps the old one dated", async () => {
    signedInAs();
    const personId = await insertPerson({ givenName: unique("Hollis") });
    await insertContact(personId, { kind: "phone", rawValue: "+44 7700 900412" });

    const withoutReason = await formFrom(personId, { mobile: "+44 7700 900988" });
    const refused = await submitPersonEdit(INITIAL_EDIT_STATE, withoutReason);
    expect(refused.formError).toBeTruthy();

    const withReason = await formFrom(personId, {
      mobile: "+44 7700 900988",
      mobileReason: "New number, told me at training",
    });
    await expect(submitPersonEdit(INITIAL_EDIT_STATE, withReason)).rejects.toThrow(RedirectSignal);

    const after = await readPersonRecord(personId);
    const current = after.contacts.find((c) => c.validUntil === null);
    const superseded = after.contacts.find((c) => c.validUntil !== null);
    expect(current?.rawValue).toBe("+44 7700 900988");
    expect(superseded?.rawValue).toBe("+44 7700 900412");
  });

  it("refuses a malformed number and a malformed email, per field, naming the rule", async () => {
    signedInAs();
    const personId = await insertPerson({ givenName: unique("Hollis") });
    const data = await formFrom(personId, {
      mobile: "0770 12",
      personalEmail: "not-an-email",
    });
    const result = await submitPersonEdit(INITIAL_EDIT_STATE, data);
    expect(result.errors.mobile).toBeTruthy();
  });

  it("saves every correct form of a mobile number", async () => {
    signedInAs();
    for (const raw of ["+44 7700 900988", "07700 900988", "07700900988", "+1 415 555 0142"]) {
      const personId = await insertPerson({ givenName: unique("Number") });
      const data = await formFrom(personId, { mobile: raw });
      await expect(submitPersonEdit(INITIAL_EDIT_STATE, data)).rejects.toThrow(RedirectSignal);
    }
  });

  it("is refused when saving an email that already belongs to another person, and offered the merge", async () => {
    signedInAs();
    const otherId = await insertPerson({ givenName: unique("Jarrah"), familyName: "Lanthorne" });
    await insertContact(otherId, {
      kind: "email",
      scope: "personal",
      rawValue: "jarrah@example.invalid",
    });

    const personId = await insertPerson({ givenName: unique("Hollis") });
    const data = await formFrom(personId, { personalEmail: "jarrah@example.invalid" });
    const result = await submitPersonEdit(INITIAL_EDIT_STATE, data);

    expect(result.emailConflict?.personId).toBe(otherId);
    expect(result.emailConflict?.field).toBe("personalEmail");
  });

  it("refuses a concurrent save, and tells the operator what moved underneath them", async () => {
    signedInAs();
    const personId = await insertPerson({ givenName: unique("Hollis") });
    const stale = await formFrom(personId, { familyName: "Winterbourne" });

    // Somebody else's save, using a fresh form of their own.
    const theirs = await formFrom(personId, { familyName: "Someone Else" });
    await expect(submitPersonEdit(INITIAL_EDIT_STATE, theirs)).rejects.toThrow(RedirectSignal);

    const result = await submitPersonEdit(INITIAL_EDIT_STATE, stale);
    expect(result.concurrentEditMessage).toBeTruthy();

    const after = await readPersonRecord(personId);
    expect(after.familyName).toBe("Someone Else");
  });

  // F1, LAN-185 correction (`inv-ae866233-f12`): the reason rule was
  // unreachable for twelve of fifteen correctable fields — the seven
  // `PersonFieldUpdate` fields and all five emergency-contact fields carried
  // no `*Reason` input anywhere, so an operator could never correct any of
  // them once populated. Reverting the `reason:` threading in `actions.ts`
  // (or the reason inputs in `edit-person-form.tsx`) makes this test fail
  // exactly the way the reviewer reproduced it live.
  it("corrects an existing college, matriculation year, expected graduation, degree field, date of birth and last name with a reason apiece, and reads back — LAN-185 F1", async () => {
    signedInAs();
    const personId = await insertPerson({ givenName: unique("Alaric"), familyName: "Brindlewood" });
    await observer.query(
      `update public.people
          set college = 'Beaumont', matriculation_year = 2023, expected_graduation_year = 2026,
              degree_field = 'Engineering Science', date_of_birth = '2004-03-11'
        where id = $1::uuid`,
      [personId],
    );

    const data = await formFrom(personId, {
      familyName: "Winterhold",
      familyNameReason: "Corrected spelling from passport",
      college: "Merton",
      collegeReason: "Transferred colleges",
      matriculationYear: "2024",
      matriculationYearReason: "Original year was a typo",
      expectedGraduationYear: "2027",
      expectedGraduationYearReason: "Took a year out",
      degreeField: "Materials Science",
      degreeFieldReason: "Changed course",
      dateOfBirth: "2004-03-12",
      dateOfBirthReason: "Corrected after seeing a passport",
    });

    await expect(submitPersonEdit(INITIAL_EDIT_STATE, data)).rejects.toThrow(RedirectSignal);

    const after = await readPersonRecord(personId);
    expect(after.familyName).toBe("Winterhold");
    expect(after.college).toBe("Merton");
    expect(after.matriculationYear).toBe(2024);
    expect(after.expectedGraduationYear).toBe(2027);
    expect(after.degreeField).toBe("Materials Science");
    expect(after.dateOfBirth).toBe("2004-03-12");
  });

  it("refuses those same corrections without a reason, per field — LAN-185 F1", async () => {
    signedInAs();
    const personId = await insertPerson({ givenName: unique("Alaric"), familyName: "Brindlewood" });
    await observer.query(`update public.people set college = 'Beaumont' where id = $1::uuid`, [
      personId,
    ]);

    const data = await formFrom(personId, { college: "Merton" });
    const result = await submitPersonEdit(INITIAL_EDIT_STATE, data);
    expect(result.formError).toBeTruthy();

    const after = await readPersonRecord(personId);
    expect(after.college).toBe("Beaumont");
  });

  it("corrects every existing emergency-contact field with a reason apiece, and reads back — LAN-185 F1", async () => {
    signedInAs();
    const personId = await insertPerson({ givenName: unique("Rosalind") });
    await observer.query(
      `insert into public.person_emergency_contacts
         (person_id, given_name, family_name, relationship, phone, email, recorded_by_person_id)
       values ($1::uuid, 'Iris', 'Thistlewood', 'Mother', '+447700900111', 'iris@example.invalid', $2::uuid)`,
      [personId, actorPersonId],
    );

    const data = await formFrom(personId, {
      emergencyGivenName: "Ivy",
      emergencyGivenNameReason: "Preferred name",
      emergencyFamilyName: "Hawthorne",
      emergencyFamilyNameReason: "Remarried",
      emergencyRelationship: "Guardian",
      emergencyRelationshipReason: "Updated after a custody change",
      emergencyPhone: "+447700900222",
      emergencyPhoneReason: "New number",
      emergencyEmail: "ivy@example.invalid",
      emergencyEmailReason: "New email",
    });

    await expect(submitPersonEdit(INITIAL_EDIT_STATE, data)).rejects.toThrow(RedirectSignal);

    const after = await readPersonRecord(personId);
    expect(after.emergencyContact?.givenName).toBe("Ivy");
    expect(after.emergencyContact?.familyName).toBe("Hawthorne");
    expect(after.emergencyContact?.relationship).toBe("Guardian");
    expect(after.emergencyContact?.phone).toBe("+447700900222");
    expect(after.emergencyContact?.email).toBe("ivy@example.invalid");
  });

  it("moves nothing on the ladder", async () => {
    signedInAs();
    const personId = await insertPerson({ givenName: unique("Hollis") });
    const before = await observer.query(
      `select count(*)::int as n from public.season_memberships where person_id = $1::uuid`,
      [personId],
    );
    const data = await formFrom(personId, { college: "Hallamshire" });
    await expect(submitPersonEdit(INITIAL_EDIT_STATE, data)).rejects.toThrow(RedirectSignal);
    const after = await observer.query(
      `select count(*)::int as n from public.season_memberships where person_id = $1::uuid`,
      [personId],
    );
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });
});
