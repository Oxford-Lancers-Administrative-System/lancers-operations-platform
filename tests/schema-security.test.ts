// @vitest-environment node
/**
 * The approved access posture, asserted against the real schema rather than
 * against the documentation.
 *
 * Decided posture (ADR 0002, extended by ADR 0010): RLS on every table in the
 * exposed schema, deny-by-default, zero policies, the secret key bypassing, and
 * the TypeScript service layer as the primary authorization boundary.
 *
 * Deny-by-default here is doubled: a browser-facing role has no policy AND no
 * grant. Either alone would be sufficient; both together mean a future
 * maintainer has to make two mistakes, in two places, to expose a table.
 *
 * The complementary runtime assertion — that a browser-safe key really reads
 * nothing through the Data API — lives in tests/rls-posture.test.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { one, openLocalClient, type Client } from "./helpers/domain-fixture";

let client: Client;

beforeAll(async () => {
  client = await openLocalClient();
});
afterAll(async () => {
  await client?.end();
});

describe("row level security", () => {
  it("is enabled on every table in the exposed schema", async () => {
    const { rows } = await client.query<{ relname: string }>(
      `select c.relname
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
        order by c.relname`,
    );

    expect(
      rows.map((r) => r.relname),
      "a table in `public` has RLS disabled",
    ).toEqual([]);
  });

  it("is enabled on the unexposed staging schema too", async () => {
    // `staging` is not in `[api] schemas`, so PostgREST does not serve it. That
    // is a configuration fact, and configuration facts get reversed by
    // accident, so the backstop is switched on there as well.
    const { rows } = await client.query<{ relname: string }>(
      `select c.relname
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'staging' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it("has zero policies — no direct-browser surface has been approved", async () => {
    // The approved set of client-side surfaces is currently empty. A policy
    // appearing here means someone created a browser-reachable surface without
    // the decision that ADR 0002 requires.
    const { rows } = await client.query<{
      schemaname: string;
      tablename: string;
      policyname: string;
    }>(
      "select schemaname, tablename, policyname from pg_policies where schemaname in ('public', 'staging')",
    );

    expect(
      rows.map((r) => `${r.schemaname}.${r.tablename}.${r.policyname}`),
      "an RLS policy exists but no direct-browser surface has been approved",
    ).toEqual([]);
  });

  it("guarded every domain table in the migration that created it", async () => {
    // Belt to `npm run check:rls`'s braces: that script reads the migrations,
    // this reads the database they produced.
    const { rows } = await client.query<{ count: string }>(
      `select count(*) as count
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'`,
    );
    expect(Number(rows[0].count)).toBeGreaterThan(25);
  });
});

describe("Data API exposure", () => {
  it("grants a browser-facing role nothing at all, on any table or view", async () => {
    const { rows } = await client.query<{
      grantee: string;
      table_name: string;
      privilege_type: string;
    }>(
      `select grantee, table_name, privilege_type
         from information_schema.role_table_grants
        where table_schema in ('public', 'staging') and grantee in ('anon', 'authenticated')`,
    );

    expect(
      rows.map((r) => `${r.grantee} ${r.privilege_type} ${r.table_name}`),
      "a browser-facing role holds a privilege on a domain table",
    ).toEqual([]);
  });

  it("gives the privileged server role working access", async () => {
    // The other half of the posture: deny-by-default must not have denied the
    // one path that is supposed to work.
    await client.query("begin");
    try {
      await client.query("set local role service_role");
      const readable = await one<{ count: string }>(
        client,
        "select count(*) as count from public.people",
      );
      expect(Number(readable.count)).toBeGreaterThan(0);

      const view = await one<{ count: string }>(
        client,
        "select count(*) as count from public.invitation_response_state",
      );
      expect(Number(view.count)).toBeGreaterThan(0);
    } finally {
      await client.query("rollback");
    }
  });

  it("gives a browser-facing role no read, even with RLS bypassed by a view", async () => {
    await client.query("begin");
    try {
      await client.query("set local role anon");
      for (const relation of [
        "public.people",
        "public.availability_statuses",
        "public.current_availability",
      ]) {
        let denied = false;
        await client.query("savepoint probe");
        try {
          await client.query(`select 1 from ${relation} limit 1`);
        } catch {
          denied = true;
        }
        await client.query("rollback to savepoint probe");
        expect(denied, `anon could read ${relation}`).toBe(true);
      }
    } finally {
      await client.query("rollback");
    }
  });
});

describe("views", () => {
  it("all run with invoker rights, so RLS is not bypassed through them", async () => {
    // A view created by a migration is owned by postgres, and postgres bypasses
    // RLS. Without `security_invoker` every view here would be a hole straight
    // through the backstop.
    const { rows } = await client.query<{ relname: string; setting: string | null }>(
      `select c.relname,
              (select option_value from pg_options_to_table(c.reloptions)
                where option_name = 'security_invoker') as setting
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'v'
        order by c.relname`,
    );

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.setting, `view ${row.relname} is not security_invoker`).toBe("true");
    }
  });
});

describe("privacy-sensitive data", () => {
  it("has no column anywhere capable of holding a diagnosis or treatment", async () => {
    // Requirement 8 is satisfied structurally rather than by policy: the fields
    // simply do not exist. This scans the whole schema, not just the
    // availability table, so a well-meaning "notes" column elsewhere is caught.
    const { rows } = await client.query<{ table_name: string; column_name: string }>(
      `select table_name, column_name
         from information_schema.columns
        where table_schema in ('public', 'staging')
          and (column_name ~* '(diagnos|treatment|medical|injury_detail|symptom|condition|prognos)')`,
    );

    expect(
      rows.map((r) => `${r.table_name}.${r.column_name}`),
      "a column capable of holding medical detail exists",
    ).toEqual([]);
  });

  it("keeps availability behind the restricted server path only", async () => {
    const { rows } = await client.query<{ grantee: string; privilege_type: string }>(
      `select grantee, privilege_type
         from information_schema.role_table_grants
        where table_schema = 'public' and table_name = 'availability_statuses'
          and grantee <> 'postgres'
        order by grantee, privilege_type`,
    );

    expect(rows.map((r) => `${r.grantee}:${r.privilege_type}`)).toEqual([
      "service_role:INSERT",
      "service_role:SELECT",
    ]);
  });
});
