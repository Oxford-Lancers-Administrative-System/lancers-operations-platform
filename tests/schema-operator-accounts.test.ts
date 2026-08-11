// @vitest-environment node
/**
 * `public.operator_accounts` — the identity join, asserted against the real
 * database rather than against the migration that was supposed to create it.
 *
 * LAN-71. This table maps a login to a real club Person, so it is the single
 * most sensitive row in the schema to expose: a browser that could read it
 * would have the club's operator roster. Its posture is therefore proved here
 * three ways — the catalogue flag, the grant table, and an actual attempt by
 * each role — rather than trusted to the SQL having been written correctly.
 *
 * Style follows tests/schema-security.test.ts and tests/rls-posture.test.ts:
 * direct PostgreSQL, every mutation inside a transaction that is rolled back,
 * local Supabase only (`connectLocal` refuses any non-loopback host).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  expectAccepted,
  expectRejected,
  one,
  openLocalClient,
  type Client,
} from "./helpers/domain-fixture";

let client: Client;

beforeAll(async () => {
  client = await openLocalClient();
});
afterAll(async () => {
  await client?.end();
});

/** An auth user and a Person, both created inside the caller's transaction. */
async function createIdentity(suffix: string): Promise<{ authUserId: string; personId: string }> {
  const user = await one<{ id: string }>(
    client,
    "insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id",
    [`operator-fixture-${suffix}@oxfordlancers.local`],
  );
  const person = await one<{ id: string }>(
    client,
    "insert into public.people (given_name, family_name) values ('Operator', $1) returning id",
    [`Fixture ${suffix}`],
  );
  return { authUserId: user.id, personId: person.id };
}

describe("the link between an auth user and a Person", () => {
  beforeEach(async () => {
    await client.query("begin");
  });
  afterEach(async () => {
    await client.query("rollback");
  });

  it("stores one auth user against one person, and reads it back", async () => {
    const { authUserId, personId } = await createIdentity("a");

    const inserted = await one<{ id: string; is_active: boolean; disabled_at: string | null }>(
      client,
      `insert into public.operator_accounts (auth_user_id, person_id)
       values ($1, $2) returning id, is_active, disabled_at`,
      [authUserId, personId],
    );

    // Active by default, and no deactivation date until there is one.
    expect(inserted.is_active).toBe(true);
    expect(inserted.disabled_at).toBeNull();

    const readBack = await one<{ auth_user_id: string; person_id: string }>(
      client,
      "select auth_user_id, person_id from public.operator_accounts where id = $1",
      [inserted.id],
    );
    expect(readBack).toEqual({ auth_user_id: authUserId, person_id: personId });
  });

  it("refuses a second account for the same auth user", async () => {
    // Not an upsert, and not a silent second identity: one login must not be
    // able to act as two people.
    const first = await createIdentity("b");
    const second = await createIdentity("c");

    await expectAccepted(
      client,
      "insert into public.operator_accounts (auth_user_id, person_id) values ($1, $2)",
      [first.authUserId, first.personId],
    );

    await expectRejected(
      client,
      "insert into public.operator_accounts (auth_user_id, person_id) values ($1, $2)",
      [first.authUserId, second.personId],
      "operator_accounts_auth_user_key",
    );
  });

  it("refuses a second account for the same person", async () => {
    // The other direction: two logins for one person would make the actor
    // recorded on a write ambiguous about who actually performed it.
    const first = await createIdentity("d");
    const second = await createIdentity("e");

    await expectAccepted(
      client,
      "insert into public.operator_accounts (auth_user_id, person_id) values ($1, $2)",
      [first.authUserId, first.personId],
    );

    await expectRejected(
      client,
      "insert into public.operator_accounts (auth_user_id, person_id) values ($1, $2)",
      [second.authUserId, first.personId],
      "operator_accounts_person_key",
    );
  });

  it("allows two different auth users to link to two different people", async () => {
    const first = await createIdentity("f");
    const second = await createIdentity("g");

    await expectAccepted(
      client,
      `insert into public.operator_accounts (auth_user_id, person_id)
       values ($1, $2), ($3, $4)`,
      [first.authUserId, first.personId, second.authUserId, second.personId],
    );

    const { rows } = await client.query(
      "select 1 from public.operator_accounts where person_id in ($1, $2)",
      [first.personId, second.personId],
    );
    expect(rows).toHaveLength(2);
  });

  it("requires an auth user and a person that both exist", async () => {
    const { personId } = await createIdentity("h");

    await expectRejected(
      client,
      "insert into public.operator_accounts (auth_user_id, person_id) values (gen_random_uuid(), $1)",
      [personId],
      /auth_user_id_fkey|violates foreign key/,
    );
  });
});

describe("deactivation, not deletion", () => {
  beforeEach(async () => {
    await client.query("begin");
  });
  afterEach(async () => {
    await client.query("rollback");
  });

  it("records when a deactivated account was deactivated", async () => {
    const { authUserId, personId } = await createIdentity("i");

    await expectAccepted(
      client,
      `insert into public.operator_accounts (auth_user_id, person_id, is_active, disabled_at, disabled_reason)
       values ($1, $2, false, now(), 'left the committee')`,
      [authUserId, personId],
    );
  });

  it("refuses a deactivation with no date", async () => {
    const { authUserId, personId } = await createIdentity("j");

    await expectRejected(
      client,
      `insert into public.operator_accounts (auth_user_id, person_id, is_active)
       values ($1, $2, false)`,
      [authUserId, personId],
      "operator_accounts_disabled_is_dated",
    );
  });

  it("refuses a deactivation with no date on update, not only on insert", async () => {
    const { authUserId, personId } = await createIdentity("k");
    await client.query(
      "insert into public.operator_accounts (auth_user_id, person_id) values ($1, $2)",
      [authUserId, personId],
    );

    await expectRejected(
      client,
      "update public.operator_accounts set is_active = false where auth_user_id = $1",
      [authUserId],
      "operator_accounts_disabled_is_dated",
    );
  });

  it("leaves an active account free of a deactivation date", async () => {
    const { authUserId, personId } = await createIdentity("l");

    await expectAccepted(
      client,
      "insert into public.operator_accounts (auth_user_id, person_id, is_active) values ($1, $2, true)",
      [authUserId, personId],
    );
  });

  it("refuses a blank deactivation reason", async () => {
    const { authUserId, personId } = await createIdentity("m");

    await expectRejected(
      client,
      `insert into public.operator_accounts (auth_user_id, person_id, is_active, disabled_at, disabled_reason)
       values ($1, $2, false, now(), '   ')`,
      [authUserId, personId],
      "operator_accounts_disabled_reason_not_blank",
    );
  });
});

describe("referenced identities cannot be deleted out from under history", () => {
  beforeEach(async () => {
    await client.query("begin");
  });
  afterEach(async () => {
    await client.query("rollback");
  });

  it("refuses to delete a person an operator account points at", async () => {
    // Invariant M2: an actor named by an audited write must stay resolvable.
    // `on delete restrict`, not cascade and not set null.
    const { authUserId, personId } = await createIdentity("n");
    await client.query(
      "insert into public.operator_accounts (auth_user_id, person_id) values ($1, $2)",
      [authUserId, personId],
    );

    await expectRejected(
      client,
      "delete from public.people where id = $1",
      [personId],
      /violates foreign key/,
    );
  });

  it("refuses to delete the auth user an operator account points at", async () => {
    const { authUserId, personId } = await createIdentity("o");
    await client.query(
      "insert into public.operator_accounts (auth_user_id, person_id) values ($1, $2)",
      [authUserId, personId],
    );

    await expectRejected(
      client,
      "delete from auth.users where id = $1",
      [authUserId],
      /violates foreign key/,
    );
  });

  it("still deletes a person who has no operator account", async () => {
    // The restriction must come from the link, not from having made `people`
    // undeletable for everyone.
    const { personId } = await createIdentity("p");

    await expectAccepted(client, "delete from public.people where id = $1", [personId]);
  });
});

describe("access posture", () => {
  it("has row level security enabled", async () => {
    const row = await one<{ relrowsecurity: boolean }>(
      client,
      `select c.relrowsecurity
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = 'operator_accounts'`,
    );
    expect(row?.relrowsecurity, "RLS is not enabled on public.operator_accounts").toBe(true);
  });

  it("carries zero policies", async () => {
    const { rows } = await client.query<{ policyname: string }>(
      "select policyname from pg_policies where schemaname = 'public' and tablename = 'operator_accounts'",
    );
    expect(
      rows.map((r) => r.policyname),
      "a policy exists, which would create a browser-reachable surface nobody approved",
    ).toEqual([]);
  });

  it("grants a browser-facing role nothing whatsoever", async () => {
    // Including TRUNCATE, TRIGGER and REFERENCES, which Supabase's default
    // privileges hand out on a newly created table and which the migration
    // must revoke.
    const { rows } = await client.query<{ grantee: string; privilege_type: string }>(
      `select grantee, privilege_type
         from information_schema.role_table_grants
        where table_schema = 'public' and table_name = 'operator_accounts'
          and grantee in ('anon', 'authenticated')`,
    );

    expect(
      rows.map((r) => `${r.grantee}:${r.privilege_type}`),
      "a browser-facing role holds a privilege on the operator roster",
    ).toEqual([]);
  });

  it("grants the server role select, insert and update — and no delete", async () => {
    const { rows } = await client.query<{ privilege_type: string }>(
      `select privilege_type
         from information_schema.role_table_grants
        where table_schema = 'public' and table_name = 'operator_accounts'
          and grantee = 'service_role'
        order by privilege_type`,
    );

    expect(rows.map((r) => r.privilege_type)).toEqual(["INSERT", "SELECT", "UPDATE"]);
  });

  it("actually refuses a delete attempted as the server role", async () => {
    // The grant table is the rule; this is the rule taking effect. Revocation
    // has to be a deactivation, so the quick route must not be available.
    await client.query("begin");
    try {
      await client.query("set local role service_role");
      await expectRejected(client, "delete from public.operator_accounts", [], /permission denied/);
    } finally {
      await client.query("rollback");
    }
  });

  it("still lets the server role read, insert and update", async () => {
    // Deny-by-default must not have denied the one path that is meant to work.
    await client.query("begin");
    try {
      const { authUserId, personId } = await createIdentity("q");
      await client.query("set local role service_role");

      await expectAccepted(
        client,
        "insert into public.operator_accounts (auth_user_id, person_id) values ($1, $2)",
        [authUserId, personId],
      );
      await expectAccepted(
        client,
        "update public.operator_accounts set updated_at = now() where auth_user_id = $1",
        [authUserId],
      );
      const readBack = await one<{ count: string }>(
        client,
        "select count(*) as count from public.operator_accounts where auth_user_id = $1",
        [authUserId],
      );
      expect(Number(readBack.count)).toBe(1);
    } finally {
      await client.query("rollback");
    }
  });

  it("refuses a read attempted as a browser-facing role", async () => {
    await client.query("begin");
    try {
      for (const role of ["anon", "authenticated"]) {
        await client.query("savepoint probe");
        await client.query(`set local role ${role}`);
        let denied = false;
        try {
          await client.query("select 1 from public.operator_accounts limit 1");
        } catch {
          denied = true;
        }
        await client.query("rollback to savepoint probe");
        expect(denied, `${role} could read public.operator_accounts`).toBe(true);
      }
    } finally {
      await client.query("rollback");
    }
  });
});
