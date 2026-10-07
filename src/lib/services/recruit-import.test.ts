// @vitest-environment node
/**
 * The database half of the recruit import — LAN-487.
 *
 * `./recruit-csv.test.ts` proves what a row's own shape means. This suite
 * proves, against the real local database, what only exists there: that May
 * add recruits is checked before any read or write; that each row's duplicate
 * question is the roster's `findPersonCandidates`, now asked of both emails;
 * that an imported recruit is written exactly as a hand-added one is; that
 * the audience group rule runs; that a rerun writes nothing; and that the
 * digest is checked against a freshly rebuilt plan.
 *
 * Every name, mobile and email is manufactured from `MARKER` and a counter,
 * never a plausible real one, so the loose name match can only find this
 * suite's own people. `afterEach` deletes exactly those and what hangs off them.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/guards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/guards")>();
  return { ...actual, requireGrant: vi.fn() };
});

import type { Client } from "pg";

import { closePool, NotPermitted, withTransaction } from "@/lib/db";
import { requireGrant } from "@/lib/auth/guards";
import type { ResolvedOperator } from "@/lib/auth/operator";
import { seededGrantsFor } from "@/lib/auth/capabilities";
import { openObserver, seededActorPersonId } from "../../../tests/helpers/service-layer";
import { groupSelectionKeys } from "./audience-selection";
import { approveEvent, saveEventAudience } from "./event-approval";
import { listAudienceCatalogueIn } from "./event-audience";
import { createEventDraft } from "./events";
import {
  applyRecruitImport,
  IMPORT_NOTHING_TO_APPLY_MESSAGE,
  IMPORT_PLAN_MOVED_MESSAGE,
  planRecruitImport,
  readRecruitImportContext,
} from "./recruit-import";
import type { RecruitImportPlan, RecruitPlannedRow } from "./recruit-csv";
import { addRecruitIn } from "./recruitment-add-write";
import { readCurrentSeasonIn } from "./seasons";

const MARKER = "LAN487RecruitImport";
const PRACTICE_TEMPLATE_ID = "7e34a764-7ed1-535e-8cef-73e00a62eafc";

let observer: Client;
let actorPersonId: string;
let seasonId: string;

const grant = vi.mocked(requireGrant);

function operator(): ResolvedOperator {
  return {
    authUserId: "48748748-7487-4487-8487-487487487487",
    personId: actorPersonId,
    displayName: "Recruit Import Suite Operator",
    roleCodes: ["president"],
    grants: seededGrantsFor(["president"]),
    isActive: true,
  };
}

beforeAll(async () => {
  observer = await openObserver();
  actorPersonId = await seededActorPersonId(observer);
  const season = await withTransaction((tx) => readCurrentSeasonIn(tx));
  seasonId = season.id;
});

beforeEach(() => {
  grant.mockReset();
  grant.mockResolvedValue(operator());
});

async function cleanUp(): Promise<void> {
  const people = `(select id from public.people where given_name like '${MARKER}%')`;
  const events = `(select id from public.events where name like '${MARKER}%')`;
  const audience = `(select id from public.event_audience_members where invitee_person_id in ${people} or event_id in ${events})`;
  const invitations = `(select id from public.invitations where audience_member_id in ${audience} or event_id in ${events})`;
  const jobs = `(select id from public.notification_jobs where person_id in ${people} or event_id in ${events} or invitation_id in ${invitations})`;
  const prospects = `(select id from public.recruitment_prospects where person_id in ${people})`;

  await observer.query(
    `delete from public.nonresponse_flags where invitation_id in ${invitations}`,
  );
  await observer.query(`delete from public.delivery_attempts where notification_job_id in ${jobs}`);
  await observer.query(`delete from public.delivery_results where notification_job_id in ${jobs}`);
  await observer.query(`delete from public.notification_jobs where id in ${jobs}`);
  await observer.query(
    `delete from public.rsvp_access_tokens where invitation_id in ${invitations}`,
  );
  await observer.query(`delete from public.rsvp_responses where invitation_id in ${invitations}`);
  await observer.query(`delete from public.invitations where id in ${invitations}`);
  await observer.query(`delete from public.event_audience_members where id in ${audience}`);
  await observer.query(`delete from public.event_audience_exclusions where event_id in ${events}`);
  await observer.query(`delete from public.event_audience_groups where event_id in ${events}`);
  await observer.query(`delete from public.event_messaging_plans where event_id in ${events}`);
  await observer.query(`delete from public.schedule_changes where event_id in ${events}`);
  await observer.query(
    `delete from public.audit_events where entity_table = 'events' and entity_id in ${events}`,
  );
  await observer.query(`delete from public.events where id in ${events}`);

  await observer.query(
    `delete from public.recruitment_prospect_notes where prospect_id in ${prospects}`,
  );
  await observer.query(
    `delete from public.recruitment_prospect_status_events where prospect_id in ${prospects}`,
  );
  await observer.query(`delete from public.audit_events where entity_id in ${prospects}`);
  await observer.query(`delete from public.recruitment_prospects where id in ${prospects}`);
  await observer.query(`delete from public.season_messaging_consents where person_id in ${people}`);
  await observer.query(`delete from public.person_emergency_contacts where person_id in ${people}`);
  await observer.query(`delete from public.season_memberships where person_id in ${people}`);
  await observer.query(`delete from public.contact_points where person_id in ${people}`);
  await observer.query(`delete from public.person_aliases where person_id in ${people}`);
  await observer.query(`delete from public.person_access_tokens where person_id in ${people}`);
  await observer.query(`delete from public.audit_events where entity_id in ${people}`);
  await observer.query(`delete from public.people where id in ${people}`);
}

afterEach(cleanUp);

afterAll(async () => {
  await cleanUp();
  await observer.end();
  await closePool();
});

// ---------------------------------------------------------------------------
// Fixtures — every value manufactured
// ---------------------------------------------------------------------------

let unique = 0;
function next(): number {
  unique += 1;
  return unique;
}

function givenNameFor(tag: string): string {
  return `${MARKER}${tag}${next()}`;
}
function familyNameFor(tag: string): string {
  return `${MARKER}Family${tag}${next()}`;
}
/**
 * `+1 555 0148` and a counter: inside the synthetic-seed privacy rule's own
 * fictional range (`tests/synthetic-seed.test.ts`), and a block no other suite
 * draws from.
 */
function mobileFor(): string {
  return `+1 555 0148${String(next()).padStart(3, "0")}`;
}
function collegeEmailFor(tag: string): string {
  return `${MARKER.toLowerCase()}.${tag.toLowerCase()}${next()}@lancers.example.ox.ac.uk`;
}
function personalEmailFor(tag: string): string {
  return `${MARKER.toLowerCase()}.${tag.toLowerCase()}${next()}@mail.example.com`;
}

interface PersonFixture {
  id: string;
  givenName: string;
  familyName: string;
}

/** A person the club already holds, with whatever contacts the case needs and nothing else. */
async function seedPerson(options: {
  givenName?: string;
  familyName?: string;
  mobile?: string;
  emails?: { value: string; scope: "college" | "personal" }[];
}): Promise<PersonFixture> {
  const givenName = options.givenName ?? givenNameFor("Held");
  const familyName = options.familyName ?? familyNameFor("Held");
  const inserted = await observer.query<{ id: string }>(
    `insert into public.people (given_name, family_name) values ($1, $2) returning id`,
    [givenName, familyName],
  );
  const id = inserted.rows[0].id;
  if (options.mobile) {
    await observer.query(
      `insert into public.contact_points (person_id, kind, raw_value, is_preferred, source)
       values ($1::uuid, 'phone', $2, true, 'seed')`,
      [id, options.mobile],
    );
  }
  for (const email of options.emails ?? []) {
    await observer.query(
      `insert into public.contact_points (person_id, kind, scope, raw_value, is_preferred, source)
       values ($1::uuid, 'email', $2::public.contact_point_scope, $3, true, 'seed')`,
      [id, email.scope, email.value],
    );
  }
  return { id, givenName, familyName };
}

interface RowInput {
  firstName?: string;
  lastName?: string;
  mobile?: string;
  collegeEmail?: string;
  personalEmail?: string;
  college?: string;
  optIn?: string;
  optInNote?: string;
}

function csvOf(rows: readonly RowInput[]): string {
  const header =
    "first_name,last_name,mobile,college_email,personal_email,college,opt_in,opt_in_note";
  const body = rows.map((row) =>
    [
      row.firstName ?? "",
      row.lastName ?? "",
      row.mobile ?? "",
      row.collegeEmail ?? "",
      row.personalEmail ?? "",
      row.college ?? "",
      row.optIn ?? "",
      row.optInNote ?? "",
    ].join(","),
  );
  return [header, ...body].join("\r\n") + "\r\n";
}

function newRow(tag: string, extra: Partial<RowInput> = {}): RowInput {
  return {
    firstName: givenNameFor(tag),
    lastName: familyNameFor(tag),
    mobile: mobileFor(),
    ...extra,
  };
}

async function planned(csvText: string, answers: Record<string, string> = {}) {
  const result = await planRecruitImport({ csvText, duplicateAnswers: answers });
  if (!result.ok) throw new Error(result.reason);
  return result.plan;
}

function rowAt(plan: RecruitImportPlan, line: number): RecruitPlannedRow {
  const row = plan.rows.find((candidate) => candidate.line === line);
  if (!row) throw new Error(`No line ${line}`);
  return row;
}

async function personIdFor(givenName: string): Promise<string | null> {
  const result = await observer.query<{ id: string }>(
    "select id from public.people where given_name = $1",
    [givenName],
  );
  return result.rows[0]?.id ?? null;
}

async function prospectFor(personId: string) {
  const result = await observer.query<{
    id: string;
    source: string;
    status: string;
    first_contact_on: Date | null;
    updated_at: Date;
  }>(
    `select id, source, status::text as status, first_contact_on, updated_at
       from public.recruitment_prospects where person_id = $1::uuid and season_id = $2::uuid`,
    [personId, seasonId],
  );
  return result.rows[0] ?? null;
}

async function cycleJobKeysFor(personId: string): Promise<string[]> {
  const result = await observer.query<{ idempotency_key: string }>(
    `select idempotency_key from public.notification_jobs
      where person_id = $1::uuid and idempotency_key like 'recruit-cycle:%'
      order by idempotency_key`,
    [personId],
  );
  return result.rows.map((row) => row.idempotency_key.split(":")[1]);
}

async function jobCountFor(personIds: readonly string[]): Promise<number> {
  const result = await observer.query<{ count: string }>(
    "select count(*)::text as count from public.notification_jobs where person_id = any($1::uuid[])",
    [personIds],
  );
  return Number(result.rows[0].count);
}

async function consentFor(personId: string) {
  const result = await observer.query<{ state: string; source: string }>(
    `select state::text as state, source::text as source from public.season_messaging_consents
      where person_id = $1::uuid and season_id = $2::uuid`,
    [personId, seasonId],
  );
  return result.rows[0] ?? null;
}

async function notesFor(prospectId: string): Promise<string[]> {
  const result = await observer.query<{ note: string }>(
    `select note from public.recruitment_prospect_notes where prospect_id = $1::uuid order by created_at`,
    [prospectId],
  );
  return result.rows.map((row) => row.note);
}

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

describe("May add recruits", () => {
  const refuse = () =>
    grant.mockRejectedValue(new NotPermitted("You do not have access to this action."));

  it("is checked before the context, the plan or the apply reads or writes anything", async () => {
    refuse();
    const row = newRow("Refused");
    const csvText = csvOf([row]);

    await expect(readRecruitImportContext()).rejects.toBeInstanceOf(NotPermitted);
    await expect(planRecruitImport({ csvText })).rejects.toBeInstanceOf(NotPermitted);
    await expect(applyRecruitImport({ csvText, digest: "x" })).rejects.toBeInstanceOf(NotPermitted);
    expect(await personIdFor(row.firstName as string)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The duplicate check
// ---------------------------------------------------------------------------

describe("who a row might already be", () => {
  it("first name only: the person is a candidate, matched on first name", async () => {
    const held = await seedPerson({ mobile: mobileFor() });
    const plan = await planned(csvOf([newRow("FirstOnly", { firstName: held.givenName })]));
    const candidates = rowAt(plan, 2).duplicate?.candidates ?? [];
    expect(candidates.map((c) => [c.personId, c.matchedOn])).toEqual([[held.id, ["first name"]]]);
  });

  it("last name only: the person is a candidate, matched on last name", async () => {
    const held = await seedPerson({ mobile: mobileFor() });
    const plan = await planned(csvOf([newRow("LastOnly", { lastName: held.familyName })]));
    const candidates = rowAt(plan, 2).duplicate?.candidates ?? [];
    expect(candidates.map((c) => [c.personId, c.matchedOn])).toEqual([[held.id, ["last name"]]]);
  });

  it("college email only: the person is a candidate, matched on college email", async () => {
    const email = collegeEmailFor("College");
    const held = await seedPerson({ emails: [{ value: email, scope: "college" }] });
    const plan = await planned(csvOf([newRow("CollegeOnly", { collegeEmail: email })]));
    const candidates = rowAt(plan, 2).duplicate?.candidates ?? [];
    expect(candidates.map((c) => [c.personId, c.matchedOn])).toEqual([
      [held.id, ["college email"]],
    ]);
  });

  it("personal email only: the person is a candidate, matched on personal email", async () => {
    const email = personalEmailFor("Personal");
    const held = await seedPerson({ emails: [{ value: email, scope: "personal" }] });
    const plan = await planned(csvOf([newRow("PersonalOnly", { personalEmail: email })]));
    const candidates = rowAt(plan, 2).duplicate?.candidates ?? [];
    expect(candidates.map((c) => [c.personId, c.matchedOn])).toEqual([
      [held.id, ["personal email"]],
    ]);
  });

  it("mobile only: one person holds it, so the row is that person, matched on mobile", async () => {
    const mobile = mobileFor();
    const held = await seedPerson({ mobile });
    const plan = await planned(csvOf([newRow("MobileOnly", { mobile })]));
    const row = rowAt(plan, 2);
    expect(row.outcome).toBe("existing");
    expect(row.matchedPersonId).toBe(held.id);
    expect(row.resolvedOn).toEqual(["mobile"]);
    expect(row.duplicate).toBeNull();
  });

  it("a person matched on several fields appears once, with every matched field named", async () => {
    const college = collegeEmailFor("Multi");
    const personal = personalEmailFor("Multi");
    const held = await seedPerson({
      mobile: mobileFor(),
      emails: [
        { value: college, scope: "college" },
        { value: personal, scope: "personal" },
      ],
    });
    const plan = await planned(
      csvOf([
        newRow("Multi", {
          firstName: held.givenName,
          lastName: held.familyName,
          collegeEmail: college,
          personalEmail: personal,
        }),
      ]),
    );
    const candidates = rowAt(plan, 2).duplicate?.candidates ?? [];
    expect(candidates).toHaveLength(1);
    expect(candidates[0].personId).toBe(held.id);
    expect(candidates[0].matchedOn).toEqual([
      "first name",
      "last name",
      "college email",
      "personal email",
    ]);
  });

  it("refuses an unanswered possible duplicate at apply, while the rest of the file applies", async () => {
    const held = await seedPerson({ mobile: mobileFor() });
    const asked = newRow("Asked", { firstName: held.givenName });
    const clean = newRow("Clean");
    const csvText = csvOf([asked, clean]);
    const plan = await planned(csvText);
    expect(rowAt(plan, 2).outcome).toBe("refused");
    expect(plan.unansweredLines).toEqual([2]);

    const applied = await applyRecruitImport({ csvText, digest: plan.digest });
    expect(applied.created).toBe(1);
    expect(applied.refused).toBe(1);
    expect(await prospectFor(held.id)).toBeNull();
    const cleanId = await personIdFor(clean.firstName as string);
    expect(cleanId).not.toBeNull();
    expect(await prospectFor(cleanId as string)).not.toBeNull();
  });

  it("'same person' makes that person a recruit, and adds no second person", async () => {
    const held = await seedPerson({ mobile: mobileFor() });
    const row = newRow("Same", { firstName: held.givenName });
    const csvText = csvOf([row]);
    const plan = await planned(csvText, { "2": held.id });
    expect(rowAt(plan, 2).outcome).toBe("existing");

    const applied = await applyRecruitImport({
      csvText,
      digest: plan.digest,
      duplicateAnswers: { "2": held.id },
    });
    expect(applied.existing).toBe(1);
    const prospect = await prospectFor(held.id);
    expect(prospect?.source).toBe("CSV import");
    const people = await observer.query("select 1 from public.people where given_name = $1", [
      held.givenName,
    ]);
    expect(people.rowCount).toBe(1);
  });

  it("'different person' over an exact contact match creates them, with the line as the reason", async () => {
    const email = personalEmailFor("Exact");
    await seedPerson({ emails: [{ value: email, scope: "personal" }] });
    const row = newRow("Different", { personalEmail: email });
    const csvText = csvOf([row]);
    const plan = await planned(csvText, { "2": "different" });
    expect(rowAt(plan, 2).outcome).toBe("new");

    await applyRecruitImport({
      csvText,
      digest: plan.digest,
      duplicateAnswers: { "2": "different" },
    });
    const created = await personIdFor(row.firstName as string);
    expect(created).not.toBeNull();
    const audit = await observer.query<{ reason: string | null }>(
      `select reason from public.audit_events where action = 'person_created' and entity_id = $1::uuid`,
      [created],
    );
    expect(audit.rows[0]?.reason).toBe("Confirmed different in recruit import, line 2");
  });
});

// ---------------------------------------------------------------------------
// What applying writes
// ---------------------------------------------------------------------------

describe("an imported recruit", () => {
  it("is written exactly as a hand-added one: record, opt-in evidence, first note, welcome", async () => {
    const imported = newRow("Imported", {
      collegeEmail: collegeEmailFor("Imported"),
      optIn: "They gave it to us themselves",
      optInNote: "At the freshers' fair",
    });
    const csvText = csvOf([imported]);
    const plan = await planned(csvText);
    expect(rowAt(plan, 2).outcome).toBe("new");
    const applied = await applyRecruitImport({ csvText, digest: plan.digest });
    expect(applied.created).toBe(1);
    expect(applied.welcomesQueued).toBe(1);

    // The same values, through the hand-add's own write.
    const handGiven = givenNameFor("HandAdded");
    await withTransaction((tx) =>
      addRecruitIn(tx, {
        actorPersonId,
        seasonId,
        person: {
          givenName: handGiven,
          familyName: familyNameFor("HandAdded"),
          mobile: mobileFor(),
          collegeEmail: collegeEmailFor("HandAdded"),
        },
        decision: { kind: "create_new", overrideReason: null },
        academic: { optInEvidence: "gave_it", optInNote: "At the freshers' fair" },
      }),
    );

    const importedId = (await personIdFor(imported.firstName as string)) as string;
    const handId = (await personIdFor(handGiven)) as string;
    const importedProspect = await prospectFor(importedId);
    const handProspect = await prospectFor(handId);

    expect(importedProspect?.source).toBe("CSV import · They gave it to us themselves");
    expect(handProspect?.source).toBe("Operator add · They gave it to us themselves");
    expect(importedProspect?.status).toBe(handProspect?.status);
    expect(importedProspect?.first_contact_on).not.toBeNull();
    expect(await consentFor(importedId)).toEqual(await consentFor(handId));
    expect(await consentFor(importedId)).toEqual({ state: "granted", source: "operator_recorded" });
    expect(await notesFor(importedProspect?.id as string)).toEqual(
      await notesFor(handProspect?.id as string),
    );
    const importedJobs = await cycleJobKeysFor(importedId);
    expect(importedJobs).toContain("welcome");
    expect(importedJobs).toEqual(await cycleJobKeysFor(handId));
  });

  it("with a blank opt-in is still a recruit with a welcome, and no consent row, as on the hand-add", async () => {
    const row = newRow("BlankOptIn");
    const csvText = csvOf([row]);
    const plan = await planned(csvText);
    await applyRecruitImport({ csvText, digest: plan.digest });
    const id = (await personIdFor(row.firstName as string)) as string;
    expect((await prospectFor(id))?.source).toBe("CSV import");
    expect(await consentFor(id)).toBeNull();
    expect(await cycleJobKeysFor(id)).toContain("welcome");
  });

  it("refuses no mobile, an existing member and an invalid opt-in, each with its line, writing nothing", async () => {
    const memberMobile = mobileFor();
    const member = await seedPerson({ mobile: memberMobile });
    await observer.query(
      `insert into public.season_memberships (person_id, season_id, status, entry, confirmed_on)
       values ($1::uuid, $2::uuid, 'onboarding', 'returning', current_date)`,
      [member.id, seasonId],
    );
    const noMobile = newRow("NoMobile", { mobile: "" });
    const asMember = newRow("Member", { mobile: memberMobile });
    const badOptIn = newRow("BadOptIn", { optIn: "probably" });
    const good = newRow("Good");
    const csvText = csvOf([noMobile, asMember, badOptIn, good]);

    const plan = await planned(csvText);
    expect(rowAt(plan, 2).outcome).toBe("refused");
    expect(rowAt(plan, 2).reasons.join(" ")).toContain('"mobile" is empty');
    expect(rowAt(plan, 3).outcome).toBe("refused");
    expect(rowAt(plan, 3).reasons.join(" ")).toContain("Already holds a membership this season");
    expect(rowAt(plan, 4).outcome).toBe("refused");
    expect(rowAt(plan, 4).reasons.join(" ")).toContain('"opt_in" reads "probably"');

    const applied = await applyRecruitImport({ csvText, digest: plan.digest });
    expect(applied).toMatchObject({ created: 1, refused: 3 });
    expect(await personIdFor(noMobile.firstName as string)).toBeNull();
    expect(await personIdFor(asMember.firstName as string)).toBeNull();
    expect(await personIdFor(badOptIn.firstName as string)).toBeNull();
    expect(await prospectFor(member.id)).toBeNull();
  });

  it("already a recruit this season is reported as already there, and nothing is written", async () => {
    const mobile = mobileFor();
    const held = await seedPerson({ mobile });
    const prospect = await observer.query<{ id: string }>(
      `insert into public.recruitment_prospects (person_id, season_id, source)
       values ($1::uuid, $2::uuid, 'seed') returning id`,
      [held.id, seasonId],
    );
    const before = await prospectFor(held.id);
    const csvText = csvOf([
      newRow("AlreadyThere", { mobile, optIn: "gave_it", optInNote: "again" }),
      newRow("Other"),
    ]);
    const plan = await planned(csvText);
    expect(rowAt(plan, 2).outcome).toBe("already_recruit");

    const applied = await applyRecruitImport({ csvText, digest: plan.digest });
    expect(applied.alreadyRecruits).toBe(1);
    const after = await prospectFor(held.id);
    expect(after?.source).toBe("seed");
    expect(after?.updated_at.getTime()).toBe(before?.updated_at.getTime());
    expect(await notesFor(prospect.rows[0].id)).toEqual([]);
    expect(await consentFor(held.id)).toBeNull();
    expect(await jobCountFor([held.id])).toBe(0);
  });

  it("a rerun of the same file writes nothing new and mints no new jobs", async () => {
    const rows = [newRow("RerunA", { optIn: "gave_it" }), newRow("RerunB")];
    const csvText = csvOf(rows);
    const first = await planned(csvText);
    await applyRecruitImport({ csvText, digest: first.digest });
    const ids = await Promise.all(rows.map((row) => personIdFor(row.firstName as string)));
    const jobsBefore = await jobCountFor(ids as string[]);
    expect(jobsBefore).toBeGreaterThan(0);

    const second = await planned(csvText);
    expect(second.rows.map((row) => row.outcome)).toEqual(["already_recruit", "already_recruit"]);
    expect(second.applicableCount).toBe(0);
    await expect(applyRecruitImport({ csvText, digest: second.digest })).rejects.toThrow(
      IMPORT_NOTHING_TO_APPLY_MESSAGE,
    );

    expect(await jobCountFor(ids as string[])).toBe(jobsBefore);
    const people = await observer.query(
      "select 1 from public.people where given_name = any($1::text[])",
      [rows.map((row) => row.firstName)],
    );
    expect(people.rowCount).toBe(2);
  });

  it("refuses a stale digest rather than applying what the operator did not read", async () => {
    const row = newRow("Stale");
    const csvText = csvOf([row]);
    const plan = await planned(csvText);
    // The club moves underneath: somebody with this row's mobile is added.
    await seedPerson({ mobile: row.mobile });
    await expect(applyRecruitImport({ csvText, digest: plan.digest })).rejects.toThrow(
      IMPORT_PLAN_MOVED_MESSAGE,
    );
    expect(await personIdFor(row.firstName as string)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The audience group rule — on at this door, unlike the roster import
// ---------------------------------------------------------------------------

describe("an imported recruit and an approved event whose audience includes recruits", () => {
  async function approvedRecruitEvent(): Promise<string> {
    const day = new Date();
    day.setDate(day.getDate() + 9);
    const event = await createEventDraft(actorPersonId, {
      name: `${MARKER} recruit practice`,
      templateId: PRACTICE_TEMPLATE_ID,
      scheduledOn: day.toISOString().slice(0, 10),
      startsAt: "19:00",
      endsAt: "21:00",
      venue: "University Parks",
      isMandatory: false,
      deliveryMode: "in_person",
      description: null,
      requiredEquipment: null,
      joiningUrl: null,
    });
    const keys = await withTransaction(async (tx) => {
      const catalogue = await listAudienceCatalogueIn(
        tx,
        event.seasonId,
        event.scheduledOn,
        event.eventType,
      );
      return groupSelectionKeys(catalogue.candidates, "recruits:all");
    });
    await saveEventAudience(actorPersonId, event.id, keys, ["recruits:all"]);
    await approveEvent(actorPersonId, event.id);
    return event.id;
  }

  it("is counted in the proposal, then added to the audience and invited, as a QR sign-up is", async () => {
    const eventId = await approvedRecruitEvent();
    const row = newRow("Audience", { optIn: "gave_it" });
    const csvText = csvOf([row]);

    const plan = await planned(csvText);
    expect(plan.audienceAdds).toBe(1);

    const applied = await applyRecruitImport({ csvText, digest: plan.digest });
    expect(applied.addedToAudiences).toBe(1);

    const personId = (await personIdFor(row.firstName as string)) as string;
    const member = await observer.query<{ id: string }>(
      `select id
         from public.event_audience_members
        where event_id = $1::uuid and invitee_person_id = $2::uuid`,
      [eventId, personId],
    );
    expect(member.rowCount).toBe(1);
    const invitation = await observer.query(
      "select 1 from public.invitations where audience_member_id = $1::uuid",
      [member.rows[0].id],
    );
    expect(invitation.rowCount).toBe(1);
    const invitationJob = await observer.query(
      `select 1 from public.notification_jobs
        where event_id = $1::uuid and person_id = $2::uuid and job_type = 'invitation'`,
      [eventId, personId],
    );
    expect(invitationJob.rowCount).toBe(1);
  });

  it("is counted as nobody when no approved event's audience includes recruits", async () => {
    const plan = await planned(csvOf([newRow("NoEvent")]));
    expect(plan.audienceAdds).toBe(0);
  });
});
