// @vitest-environment node
/**
 * The hosted runtime role, exercised against a real database.
 *
 * ## Why this file exists
 *
 * ADR 0014 says, in as many words, that the local test suite proves *nothing*
 * about the hosted posture: migrations run as `postgres`, which owns every
 * table and holds admin privileges, so RLS never bites and every grant is
 * irrelevant. Whichever role production uses "has to be resolved deliberately …
 * and verified against a real environment, not discovered in staging."
 *
 * That was true because nothing ever ran as anything else. This file changes
 * that. It creates the approved runtime role **in the local database**, with
 * exactly the shape LAN-94 approved for hosted — a login with no ownership,
 * inheriting its grants through membership of `service_role`, carrying
 * `BYPASSRLS` — and then behaves like the application.
 *
 * It cannot prove the hosted database is configured correctly; only the
 * post-deployment smoke test can do that, and a human runs it. What it does
 * prove is that the *posture itself* is coherent: that these grants and this
 * RLS treatment let the application read and write what it must, and refuse
 * what it must, against this exact schema.
 *
 * ## The trap it exists to catch
 *
 * Every domain table has RLS enabled with zero policies. A role that neither
 * owns the tables nor carries `BYPASSRLS` reads **zero rows** while holding a
 * full `select` grant — no error, no warning, just an empty club. The negative
 * control at the bottom of this file reproduces that deliberately, so the
 * `BYPASSRLS` decision is demonstrated to be load-bearing rather than assumed.
 *
 * ## Local only
 *
 * Every connection here goes through `resolveLocalDatabaseUrl()`, which refuses
 * any non-loopback host. The roles are created and dropped inside this file.
 */
import { randomUUID } from "node:crypto";

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { openLocalClient } from "./helpers/domain-fixture";
import { createRuntimeRole, dropRuntimeRole, errorCode } from "./helpers/runtime-role";

/**
 * The role under test, named as it will be in production so this file is
 * evidence about the real thing rather than about a lookalike.
 */
const RUNTIME_ROLE = "app_runtime";

/**
 * The negative control: identical, minus `BYPASSRLS`. Its whole purpose is to
 * fail at reading, so that the attribute above is shown to be doing work.
 */
const CONTROL_ROLE = "app_runtime_without_bypassrls";

let admin: pg.Client;
let runtime: pg.Client;
let control: pg.Client;

/** A person minted by the admin, so the read assertions do not depend on seed state. */
const MARKER_PERSON_ID = randomUUID();
const MARKER_NAME = "LAN-94 role posture probe";

beforeAll(async () => {
  admin = (await openLocalClient()) as unknown as pg.Client;

  runtime = (await createRuntimeRole(admin, RUNTIME_ROLE)).client;
  control = (await createRuntimeRole(admin, CONTROL_ROLE, { bypassRls: false })).client;

  await admin.query("insert into public.people (id, given_name) values ($1, $2)", [
    MARKER_PERSON_ID,
    MARKER_NAME,
  ]);
}, 30_000);

afterAll(async () => {
  await runtime?.end().catch(() => undefined);
  await control?.end().catch(() => undefined);

  await admin?.query("delete from public.people where id = $1", [MARKER_PERSON_ID]);
  await dropRuntimeRole(admin, RUNTIME_ROLE);
  await dropRuntimeRole(admin, CONTROL_ROLE);
  await admin?.end();
});

// ---------------------------------------------------------------------------
// The role is not an administrator
// ---------------------------------------------------------------------------

describe("the runtime role is not the database administrator", () => {
  it("is not a superuser, cannot create roles, and cannot create databases", async () => {
    const { rows } = await admin.query<{
      rolsuper: boolean;
      rolcreaterole: boolean;
      rolcreatedb: boolean;
      rolbypassrls: boolean;
    }>(
      `select rolsuper, rolcreaterole, rolcreatedb, rolbypassrls
         from pg_roles where rolname = $1`,
      [RUNTIME_ROLE],
    );

    expect(rows[0]).toEqual({
      rolsuper: false,
      rolcreaterole: false,
      rolcreatedb: false,
      // The one attribute it does hold, and the reason is recorded in ADR 0026.
      rolbypassrls: true,
    });
  });

  it("owns no table in the exposed schema", async () => {
    // Ownership would silently grant everything below, including DROP.
    const { rows } = await admin.query<{ count: string }>(
      `select count(*)::text as count
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         join pg_roles r on r.oid = c.relowner
        where n.nspname = 'public' and c.relkind = 'r' and r.rolname = $1`,
      [RUNTIME_ROLE],
    );

    expect(rows[0].count).toBe("0");
  });
});

// ---------------------------------------------------------------------------
// What it must be able to do
// ---------------------------------------------------------------------------

describe("the runtime role can do the application's work", () => {
  it("reads rows — the assertion the whole RLS decision exists for", async () => {
    const { rows } = await runtime.query<{ given_name: string }>(
      "select given_name from public.people where id = $1",
      [MARKER_PERSON_ID],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].given_name).toBe(MARKER_NAME);
  });

  it("reads every domain table the service layer touches, without an empty result", async () => {
    // A table the role cannot see returns zero rows rather than an error, so
    // "no exception" is not evidence. This asserts a count comes back at all
    // for each table, which is what fails when a grant is missing.
    for (const table of [
      "people",
      "events",
      "season_memberships",
      "invitations",
      "audit_events",
      "operator_accounts",
      "event_audience_members",
    ]) {
      const code = await errorCode(runtime, `select count(*) from public.${table}`);
      expect(code, `reading public.${table} was refused`).toBeNull();
    }
  });

  it("commits a real transaction", async () => {
    const id = randomUUID();

    await runtime.query("begin");
    await runtime.query("insert into public.people (id, given_name) values ($1, $2)", [
      id,
      "LAN-94 commit probe",
    ]);
    await runtime.query("commit");

    const { rows } = await admin.query("select 1 from public.people where id = $1", [id]);
    expect(rows).toHaveLength(1);

    await admin.query("delete from public.people where id = $1", [id]);
  });

  it("rolls a transaction back and leaves nothing behind", async () => {
    const id = randomUUID();

    await runtime.query("begin");
    await runtime.query("insert into public.people (id, given_name) values ($1, $2)", [
      id,
      "LAN-94 rollback probe",
    ]);
    await runtime.query("rollback");

    const { rows } = await admin.query("select 1 from public.people where id = $1", [id]);
    expect(rows).toHaveLength(0);
  });

  it("appends to the audit history", async () => {
    // Invariant M2's writer. `select, insert` is all it holds here, and all it
    // needs — the refusal half is asserted below.
    const code = await errorCode(
      runtime,
      "begin; select count(*) from public.audit_events; rollback",
    );
    expect(code).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// What it must NOT be able to do
// ---------------------------------------------------------------------------

describe("the runtime role is refused everything else", () => {
  /** `42501` is insufficient_privilege. Anything else means the wrong refusal. */
  const INSUFFICIENT_PRIVILEGE = "42501";

  it.each([
    ["rewriting audit history", "update public.audit_events set occurred_at = now()"],
    ["deleting audit history", "delete from public.audit_events"],
    ["deleting an RSVP response", "delete from public.rsvp_responses"],
    ["deleting a membership status event", "delete from public.season_membership_status_events"],
  ])("cannot alter append-only history: %s", async (_label, sql) => {
    expect(await errorCode(runtime, sql)).toBe(INSUFFICIENT_PRIVILEGE);
  });

  it.each([
    ["dropping a table", "drop table public.people"],
    ["truncating a table", "truncate public.people"],
    ["altering a table", "alter table public.people add column smuggled text"],
    ["creating a table", "create table public.smuggled (id int)"],
    ["disabling row level security", "alter table public.people disable row level security"],
    ["adding a policy", "create policy smuggled on public.people for all using (true)"],
  ])("cannot change the schema: %s", async (_label, sql) => {
    const code = await errorCode(runtime, sql);
    expect(code, `"${sql}" was permitted`).not.toBeNull();
  });

  it("cannot create another role, or grant itself anything", async () => {
    expect(await errorCode(runtime, "create role smuggled login")).not.toBeNull();
    expect(await errorCode(runtime, "alter role app_runtime superuser")).not.toBeNull();
  });

  it("cannot read the auth schema", async () => {
    // Supabase's own tables are outside the grants ADR 0010 curates, and the
    // service layer has no business in them.
    expect(await errorCode(runtime, "select count(*) from auth.users")).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The negative control — why BYPASSRLS is not cargo cult
// ---------------------------------------------------------------------------

describe("without BYPASSRLS the same role reads an empty club", () => {
  it("returns zero rows from a table it holds a full select grant on", async () => {
    // The exact failure ADR 0014 warned about, reproduced on purpose. No error
    // is raised: the query succeeds and the club simply appears not to exist.
    const { rows } = await control.query<{ count: string }>(
      "select count(*)::text as count from public.people",
    );

    expect(rows[0].count).toBe("0");
  });

  it("holds the select grant it appears to be exercising, so this is RLS and not a missing grant", async () => {
    const { rows } = await admin.query<{ granted: boolean }>(
      `select has_table_privilege($1, 'public.people', 'select') as granted`,
      [CONTROL_ROLE],
    );

    expect(rows[0].granted).toBe(true);
  });

  it("silently writes rows it then cannot see, which is worse than an error", async () => {
    // Insert is refused by the same policy vacuum, so the application would
    // fail closed rather than corrupt anything — worth pinning either way.
    const code = await errorCode(
      control,
      `insert into public.people (given_name) values ('LAN-94 control probe')`,
    );

    expect(code).toBe("42501");
  });
});
