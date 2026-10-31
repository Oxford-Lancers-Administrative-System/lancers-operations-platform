// @vitest-environment node
/**
 * LAN-397 — the two owner-run files Brian uses to take test records out of
 * production (`scripts/pilot/lan-397/inventory.sql` and `removal.sql`), proved
 * against the local database on a look-alike mix of test and real rows.
 *
 * Both files act on whatever database they run against, so they never run here
 * outside a transaction: their own `begin;` and `commit;` are stripped, the ids
 * are written into the removal's lists the way Brian pastes them, and every
 * case is rolled back.
 *
 * In `tests/` rather than beside a service because no file under `src/` may
 * name the pilot directory (`tests/pilot-data-contract.test.ts`).
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  confirmAudienceMember,
  createBaseline,
  one,
  openLocalClient,
  type Baseline,
  type Client,
} from "./helpers/domain-fixture";

const root = resolve(import.meta.dirname, "..");
const DIRECTORY = join(root, "scripts", "pilot", "lan-397");
const INVENTORY = readFileSync(join(DIRECTORY, "inventory.sql"), "utf8");
const REMOVAL = readFileSync(join(DIRECTORY, "removal.sql"), "utf8");

const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.DATABASE_URL);

if (process.env.REQUIRE_SUPABASE_TESTS === "1" && !configured) {
  throw new Error("REQUIRE_SUPABASE_TESTS=1 but the local database is not configured.");
}

const MARKER = "LAN397Fixture";
const SHARED_EMAIL = "shared-lan397@example.invalid";

interface Marks {
  deletePeople?: string[];
  deleteOperatorAccountOf?: string[];
  deleteEvents?: string[];
  keep?: string[];
  dryRun?: boolean;
}

/** The removal file with Brian's lists filled in and its transaction stripped. */
function removal(marks: Marks): string {
  const list = (ids: string[] = []) => `'{${ids.join(",")}}'::uuid[]`;
  const filled = REMOVAL.replace(
    "'{}'::uuid[] as delete_people",
    `${list(marks.deletePeople)} as delete_people`,
  )
    .replace(
      "'{}'::uuid[] as delete_operator_account_of",
      `${list(marks.deleteOperatorAccountOf)} as delete_operator_account_of`,
    )
    .replace("'{}'::uuid[] as delete_events", `${list(marks.deleteEvents)} as delete_events`)
    .replace("'{}'::uuid[] as keep", `${list(marks.keep)} as keep`)
    .replace("true as dry_run", `${marks.dryRun ?? false} as dry_run`);
  return filled
    .split("\n")
    .filter((line) => line.trim() !== "begin;" && line.trim() !== "commit;")
    .join("\n");
}

let client: Client;

/** Runs the removal and returns its last result, or the error it raised. */
async function runRemoval(marks: Marks): Promise<{
  rows: { step: number | null; removed_from: string; removed: string | null }[];
  error: string | null;
}> {
  await client.query("savepoint lan397");
  try {
    const results = await client.query(removal(marks));
    const last = Array.isArray(results) ? results.at(-1) : results;
    await client.query("release savepoint lan397");
    return { rows: last.rows, error: null };
  } catch (caught) {
    await client.query("rollback to savepoint lan397");
    return { rows: [], error: (caught as Error).message };
  }
}

async function exists(table: string, id: string): Promise<boolean> {
  const row = await one<{ n: string }>(
    client,
    `select count(*)::text as n from public.${table} where id = $1`,
    [id],
  );
  return row.n === "1";
}

async function insertId(sql: string, params: unknown[] = []): Promise<string> {
  return (await one<{ id: string }>(client, `${sql} returning id`, params)).id;
}

async function person(tag: string): Promise<string> {
  return insertId("insert into public.people (given_name, family_name) values ($1, $2)", [
    MARKER,
    tag,
  ]);
}

async function authUser(): Promise<string> {
  return insertId("insert into auth.users (id) values (gen_random_uuid())");
}

async function operatorAccount(personId: string, active: boolean): Promise<string> {
  return insertId(
    `insert into public.operator_accounts (auth_user_id, person_id, is_active, disabled_at, disabled_reason)
     values ($1, $2, $3, case when $3 then null else now() end, case when $3 then null else 'fixture' end)`,
    [await authUser(), personId, active],
  );
}

/** A sent message: job, attempt and result, keyed to a person and optionally an event. */
async function message(
  tag: string,
  personId: string,
  eventId: string | null,
  destinationKey: string | null,
): Promise<string> {
  const job = await insertId(
    `insert into public.notification_jobs
       (idempotency_key, job_type, status, person_id, event_id, channel, attempt_count)
     values ($1, 'other', 'completed', $2, $3, 'email', 1)`,
    [`${MARKER}:${tag}`, personId, eventId],
  );
  await client.query(
    `insert into public.delivery_attempts
       (notification_job_id, attempt_number, channel, provider, requested_at, concluded_at,
        safety_admitted_at, safety_person_id, safety_destination_key)
     values ($1, 1, 'email', 'resend', now(), now(), now(), $2, $3)`,
    [job, personId, destinationKey],
  );
  await client.query(
    `insert into public.delivery_results
       (notification_job_id, attempt_number, outcome, channel, provider)
     values ($1, 1, 'delivered', 'email', 'resend')`,
    [job],
  );
  return job;
}

async function destinationKey(email: string): Promise<string> {
  const row = await one<{ key: string }>(
    client,
    "select encode(sha256(convert_to('v1:email:' || $1::text, 'UTF8')), 'hex') as key",
    [email],
  );
  return row.key;
}

interface Mix {
  baseline: Baseline;
  /** A void recruit: contact, safety scopes, a message, an audience row on a real event. */
  voidRecruit: string;
  voidProspect: string;
  voidJob: string;
  /** An inactive player record, with its membership. */
  inactivePlayer: string;
  inactiveMembership: string;
  /** A test event with a real person's audience row, invitation, question and message. */
  testEvent: string;
  testEventInvitation: string;
  testEventJob: string;
  /** A deactivated test operator with no history. */
  testOperator: string;
  testOperatorAccount: string;
  /** A deactivated operator account whose person stays (it has audit history). */
  auditedPerson: string;
  auditedAccount: string;
  /** A real person who shares the void recruit's address. */
  realPerson: string;
  signupCode: string;
  personScope: string;
  sharedScope: string;
  ownScope: string;
}

async function lookAlikeMix(): Promise<Mix> {
  const baseline = await createBaseline(client);

  const voidRecruit = await person("void-recruit");
  const voidProspect = await insertId(
    `insert into public.recruitment_prospects (person_id, season_id, status, source)
     values ($1, $2, 'void', 'qr_self_entry')`,
    [voidRecruit, baseline.seasonId],
  );
  const ownEmail = "void-lan397@example.invalid";
  await client.query(
    `insert into public.contact_points (person_id, kind, raw_value, normalised_value)
     values ($1, 'email', $2, $2), ($1, 'email', $3, $3)`,
    [voidRecruit, ownEmail, SHARED_EMAIL],
  );
  const voidJob = await message("void", voidRecruit, null, await destinationKey(ownEmail));
  await confirmAudienceMember(
    client,
    { eventId: baseline.approvedEventId, seasonId: baseline.seasonId },
    { capacity: "recruit", personId: voidRecruit },
  );

  const realPerson = await person("real");
  await client.query(
    `insert into public.contact_points (person_id, kind, raw_value, normalised_value)
     values ($1, 'email', $2, $2)`,
    [realPerson, SHARED_EMAIL],
  );

  const personScope = await insertId(
    "insert into public.messaging_safety_scopes (scope_kind, scope_key) values ('person', $1)",
    [voidRecruit],
  );
  const ownScope = await insertId(
    "insert into public.messaging_safety_scopes (scope_kind, scope_key) values ('destination', $1)",
    [await destinationKey(ownEmail)],
  );
  const sharedScope = await insertId(
    "insert into public.messaging_safety_scopes (scope_kind, scope_key) values ('destination', $1)",
    [await destinationKey(SHARED_EMAIL)],
  );

  const inactivePlayer = await person("inactive-player");
  const inactiveMembership = await insertId(
    `insert into public.season_memberships (person_id, season_id, status, entry, confirmed_on)
     values ($1, $2, 'inactive', 'new', '2026-09-20')`,
    [inactivePlayer, baseline.seasonId],
  );

  const testEvent = await insertId(
    `insert into public.events (season_id, name, event_type, status, scheduled_on,
       audience_confirmed_at, audience_confirmed_by_person_id, approved_at, approved_by_person_id, template_id)
     values ($1, 'Test Event', 'practice', 'approved', '2026-11-11', now(), $2, now(), $2,
             (select id from public.event_templates where event_type = 'practice' order by lower(name) limit 1))`,
    [baseline.seasonId, baseline.personId],
  );
  const audience = await confirmAudienceMember(
    client,
    { eventId: testEvent, seasonId: baseline.seasonId },
    { capacity: "player", membershipId: baseline.otherMembershipId },
  );
  const testEventInvitation = await insertId(
    `insert into public.invitations (event_id, event_status, season_id, audience_member_id,
       capacity, season_membership_id, status)
     values ($1, 'approved', $2, $3, 'player', $4, 'issued')`,
    [testEvent, baseline.seasonId, audience, baseline.otherMembershipId],
  );
  await client.query(
    "insert into public.event_questions (event_id, prompt) values ($1, 'Fixture question')",
    [testEvent],
  );
  const testEventJob = await message("test-event", baseline.otherPersonId, testEvent, null);

  const testOperator = await person("test-operator");
  const testOperatorAccount = await operatorAccount(testOperator, false);

  const auditedPerson = await person("audited-operator");
  const auditedAccount = await operatorAccount(auditedPerson, false);
  await client.query(
    `insert into public.audit_events (actor_person_id, action, entity_table, entity_id)
     values ($1, 'fixture', 'people', $1)`,
    [auditedPerson],
  );

  const signupCode = await insertId(
    `insert into public.recruitment_signup_codes (season_id, code, minted_by_person_id)
     values ($1, 'lan397fixture', $2)`,
    [baseline.seasonId, baseline.personId],
  );

  return {
    baseline,
    voidRecruit,
    voidProspect,
    voidJob,
    inactivePlayer,
    inactiveMembership,
    testEvent,
    testEventInvitation,
    testEventJob,
    testOperator,
    testOperatorAccount,
    auditedPerson,
    auditedAccount,
    realPerson,
    signupCode,
    personScope,
    sharedScope,
    ownScope,
  };
}

/** Stewart's list, applied to the mix. */
function marks(mix: Mix, dryRun = false): Marks {
  return {
    deletePeople: [mix.voidRecruit, mix.inactivePlayer, mix.testOperator],
    deleteOperatorAccountOf: [mix.auditedPerson],
    deleteEvents: [mix.testEvent],
    keep: [mix.realPerson, mix.baseline.personId, mix.baseline.approvedEventId],
    dryRun,
  };
}

describe("the LAN-397 files' shape", () => {
  it("ships the removal as one transaction, dry run on, every list empty", () => {
    const lines = REMOVAL.split("\n").filter(
      (line) => line.trim() !== "" && !line.trim().startsWith("--"),
    );
    expect(lines[0]).toBe("begin;");
    expect(lines).toContain("commit;");
    expect(REMOVAL).toContain("true as dry_run;");
    expect(REMOVAL.match(/'\{\}'::uuid\[\] as /g)).toHaveLength(4);
    expect(REMOVAL).toMatch(/do \$preflight\$/);
    // The order comes from the catalogue, and Auth users are left to the dashboard.
    expect(REMOVAL).toMatch(/from pg_constraint/);
    expect(REMOVAL).not.toMatch(/\b(delete from|update|insert into)\s+auth\./i);
  });

  it("ships the inventory as a single read-only select", () => {
    const body = INVENTORY.split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    expect(body.trim().startsWith("with ")).toBe(true);
    expect(body.replace(/'[^']*'/g, "''").match(/;/g)).toHaveLength(1);
    expect(body).not.toMatch(/\b(insert|update|delete|truncate|alter|drop|create|grant)\b/i);
  });
});

describe.runIf(configured)("the LAN-397 files, against the local database", () => {
  beforeAll(async () => {
    client = await openLocalClient();
  });

  beforeEach(async () => {
    await client.query("begin");
  });

  afterEach(async () => {
    await client.query("rollback");
  });

  afterAll(async () => {
    await client?.end();
  });

  it("lists every candidate class in the inventory", async () => {
    const mix = await lookAlikeMix();
    const { rows } = await client.query<{ section: string; id: string; standing: string }>(
      INVENTORY,
    );
    const byId = new Map(rows.map((row) => [row.id, row]));

    expect(byId.get(mix.voidRecruit)?.section).toBe("1 person");
    expect(byId.get(mix.voidRecruit)?.standing).toContain("recruit void");
    expect(byId.get(mix.inactivePlayer)?.standing).toContain("membership inactive");
    expect(byId.get(mix.testOperator)?.standing).toContain("operator deactivated");
    expect(byId.get(mix.testEvent)?.section).toBe("3 event");
    expect(byId.get(mix.signupCode)?.section).toBe("4 sign-up code");
    const authUser = await one<{ auth_user_id: string }>(
      client,
      "select auth_user_id from public.operator_accounts where id = $1",
      [mix.testOperatorAccount],
    );
    expect(byId.get(authUser.auth_user_id)?.section).toBe("2 auth user");
  });

  it("rehearses first: the dry run reports the counts and changes nothing", async () => {
    const mix = await lookAlikeMix();

    const { error } = await runRemoval(marks(mix, true));

    expect(error).toMatch(/LAN-397 dry run: nothing was changed/);
    expect(error).toMatch(/\n  1 events\n/);
    expect(error).toMatch(/\n  3 people(\n|$)/);
    expect(error).toMatch(/\n  2 messaging_safety_scopes\n/);
    expect(await exists("people", mix.voidRecruit)).toBe(true);
    expect(await exists("events", mix.testEvent)).toBe(true);
    expect(await exists("operator_accounts", mix.auditedAccount)).toBe(true);
  });

  it("removes the marked rows and everything keyed to them, and nothing else", async () => {
    const mix = await lookAlikeMix();

    const { rows, error } = await runRemoval(marks(mix));

    expect(error).toBeNull();
    for (const id of [mix.voidRecruit, mix.inactivePlayer, mix.testOperator]) {
      expect(await exists("people", id)).toBe(false);
    }
    expect(await exists("recruitment_prospects", mix.voidProspect)).toBe(false);
    expect(await exists("season_memberships", mix.inactiveMembership)).toBe(false);
    expect(await exists("notification_jobs", mix.voidJob)).toBe(false);
    expect(await exists("events", mix.testEvent)).toBe(false);
    expect(await exists("invitations", mix.testEventInvitation)).toBe(false);
    expect(await exists("notification_jobs", mix.testEventJob)).toBe(false);
    expect(await exists("operator_accounts", mix.testOperatorAccount)).toBe(false);
    // The operator account goes; the person with audit history stays.
    expect(await exists("operator_accounts", mix.auditedAccount)).toBe(false);
    expect(await exists("people", mix.auditedPerson)).toBe(true);
    // Their messaging safety scopes go, except the address a kept person shares.
    expect(await exists("messaging_safety_scopes", mix.personScope)).toBe(false);
    expect(await exists("messaging_safety_scopes", mix.ownScope)).toBe(false);
    expect(await exists("messaging_safety_scopes", mix.sharedScope)).toBe(true);

    // Real records stay: people, the real event and its audience, the real
    // person invited to the test event, and the sign-up code — still live.
    for (const id of [mix.realPerson, mix.baseline.personId, mix.baseline.otherPersonId]) {
      expect(await exists("people", id)).toBe(true);
    }
    expect(await exists("events", mix.baseline.approvedEventId)).toBe(true);
    expect(await exists("invitations", mix.baseline.invitationId)).toBe(true);
    const code = await one<{ live: boolean }>(
      client,
      "select deactivated_at is null as live from public.recruitment_signup_codes where id = $1",
      [mix.signupCode],
    );
    expect(code.live).toBe(true);

    // The two Auth users left with no operator account, for the dashboard.
    expect(rows.filter((row) => row.removed_from.startsWith("auth user to delete"))).toHaveLength(
      2,
    );
    expect(rows.some((row) => row.removed_from === "people")).toBe(true);
  });

  it("removes nothing the second time", async () => {
    const mix = await lookAlikeMix();
    expect((await runRemoval(marks(mix))).error).toBeNull();

    const again = await runRemoval(marks(mix, true));

    expect(again.error).toMatch(/every marked id is already gone/);
  });

  it("refuses a person who holds a current seat or an active operator account", async () => {
    const mix = await lookAlikeMix();
    const seated = await person("seated");
    await operatorAccount(seated, true);

    const { error } = await runRemoval({ deletePeople: [seated] });

    expect(error).toMatch(/refusing; nothing was changed/);
    expect(error).toMatch(/1 active operator accounts/);
    expect(await exists("people", seated)).toBe(true);
    expect(mix.baseline.personId).toBeTruthy();
  });

  it("refuses a person named by audit history, and leaves them in place", async () => {
    const mix = await lookAlikeMix();

    const { error } = await runRemoval({ deletePeople: [mix.auditedPerson] });

    expect(error).toMatch(/audit_events\.actor_person_id name a removed row/);
    expect(await exists("people", mix.auditedPerson)).toBe(true);
  });

  it("refuses a person whose removal would take the printed sign-up code", async () => {
    const mix = await lookAlikeMix();
    const minter = await person("minter");
    await client.query(
      "update public.recruitment_signup_codes set minted_by_person_id = $2 where id = $1",
      [mix.signupCode, minter],
    );

    const { error } = await runRemoval({ deletePeople: [minter] });

    expect(error).toMatch(/recruitment_signup_codes\.minted_by_person_id/);
    expect(await exists("recruitment_signup_codes", mix.signupCode)).toBe(true);
  });

  it("refuses a person who approved or owns an event that stays", async () => {
    const mix = await lookAlikeMix();

    const { error } = await runRemoval({ deletePeople: [mix.baseline.personId] });

    expect(error).toMatch(/refusing/);
    expect(error).toMatch(/ events\.approved_by_person_id/);
    expect(await exists("people", mix.baseline.personId)).toBe(true);
  });

  it("refuses an id marked both delete and keep", async () => {
    const mix = await lookAlikeMix();

    const { error } = await runRemoval({
      deletePeople: [mix.voidRecruit],
      keep: [mix.voidRecruit],
    });

    expect(error).toMatch(/marked both delete and keep/);
  });
});
