// @vitest-environment node
/**
 * `npm run db:link-operator` — the local operator linking script.
 *
 * LAN-71. Run as a real subprocess rather than imported, because two of the
 * three things under test are process-level: the exit status, and what does and
 * does not appear on the output streams. The third — idempotency — is only
 * meaningful across two separate invocations.
 *
 * The refusal cases need no database at all and always run. The linking cases
 * need the local stack, and follow the same skip-unless-configured convention
 * as the other Supabase-backed suites (CI sets REQUIRE_SUPABASE_TESTS=1, which
 * turns the skip into a failure).
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { openLocalClient } from "./helpers/domain-fixture";

const run = promisify(execFile);

const root = resolve(import.meta.dirname, "..");
const script = resolve(root, "scripts/link-test-operator.mjs");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const email = process.env.TEST_USER_EMAIL ?? "test.user@oxfordlancers.local";
const configured = Boolean(url);

if (process.env.REQUIRE_SUPABASE_TESTS === "1" && !configured) {
  throw new Error("REQUIRE_SUPABASE_TESTS=1 but NEXT_PUBLIC_SUPABASE_URL is not set.");
}

type Outcome = { code: number; stdout: string; stderr: string };

async function runScript(env: Record<string, string> = {}): Promise<Outcome> {
  try {
    const { stdout, stderr } = await run(process.execPath, [script], {
      cwd: root,
      env: { ...process.env, ...env },
    });
    return { code: 0, stdout, stderr };
  } catch (caught) {
    const error = caught as Error & { code?: number; stdout?: string; stderr?: string };
    return { code: error.code ?? 1, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
  }
}

describe("refusing a non-local database", () => {
  it("refuses a hosted Supabase connection string, with a non-zero exit", async () => {
    const result = await runScript({
      SUPABASE_DB_URL: "postgresql://postgres:pw@db.abcdefgh.supabase.co:5432/postgres",
    });

    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/Refusing to run/i);
    expect(result.stdout).not.toMatch(/Linked/);
  });

  it("refuses any non-loopback host, with a non-zero exit", async () => {
    const result = await runScript({
      SUPABASE_DB_URL: "postgresql://postgres:pw@10.0.0.5:5432/postgres",
    });

    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/non-local database host/i);
  });

  it("refuses a connection pooler host too", async () => {
    const result = await runScript({
      SUPABASE_DB_URL: "postgresql://postgres:pw@aws-0-eu-west-2.pooler.supabase.com:6543/postgres",
    });

    expect(result.code).not.toBe(0);
    expect(result.stdout).not.toMatch(/Linked/);
  });
});

describe.runIf(configured)("linking the local test user", () => {
  it("links the test user to a seeded person and is safe to run twice", async () => {
    // First run either creates the link or reports the one a previous run or a
    // developer already made; either way it must succeed and leave exactly one
    // row. That is what "idempotent" has to mean for a command in the
    // documented first-run sequence.
    const first = await runScript();
    expect(first.stderr, first.stderr).toBe("");
    expect(first.code).toBe(0);
    expect(first.stdout).toMatch(/Linked|already linked|Reactivated/);

    const second = await runScript();
    expect(second.code).toBe(0);
    expect(second.stdout).toMatch(/already linked/i);

    const client = await openLocalClient();
    try {
      const { rows } = await client.query<{
        auth_count: string;
        operator_count: string;
        person_count: string;
        is_active: boolean;
        email_confirmed: boolean;
      }>(
        `select count(distinct u.id) as auth_count,
                count(distinct oa.id) as operator_count,
                count(distinct oa.person_id) as person_count,
                bool_and(oa.is_active) as is_active,
                bool_and(u.email_confirmed_at is not null) as email_confirmed
           from public.operator_accounts oa
           join auth.users u on u.id = oa.auth_user_id
          where lower(u.email) = lower($1)`,
        [email],
      );

      expect(Number(rows[0].auth_count), "the review login is duplicated").toBe(1);
      expect(Number(rows[0].operator_count), "the second run created a duplicate link").toBe(1);
      expect(Number(rows[0].person_count), "the login is linked to multiple people").toBe(1);
      expect(rows[0].is_active).toBe(true);
      expect(rows[0].email_confirmed).toBe(true);
    } finally {
      await client.end();
    }
  });

  it("links to a person who actually holds a currently-effective committee seat", async () => {
    await runScript();

    const client = await openLocalClient();
    try {
      const { rows } = await client.query<{ code: string }>(
        `select r.code
           from public.operator_accounts oa
           join auth.users u on u.id = oa.auth_user_id
           join public.role_assignments ra on ra.person_id = oa.person_id
           join public.roles r on r.id = ra.role_id
          where lower(u.email) = lower($1)
            and ra.committee_year_id is not null
            and (ra.effective_to is null or ra.effective_to > now())`,
        [email],
      );

      expect(rows.length, "the linked person holds no current committee seat").toBeGreaterThan(0);
    } finally {
      await client.end();
    }
  });

  it("prints no key material", async () => {
    // The script reads .env.local for the test user's address. A well-meaning
    // debug line that echoed the environment would put a privileged key into a
    // terminal, a CI log, and an agent transcript.
    const result = await runScript();
    const output = `${result.stdout}${result.stderr}`;

    for (const pattern of [
      /sb_secret_/,
      /sb_publishable_/,
      /service_role/,
      /eyJ[A-Za-z0-9_-]{10}/,
    ]) {
      expect(output, `output matched ${pattern}`).not.toMatch(pattern);
    }
    expect(output).not.toContain(process.env.SUPABASE_SECRET_KEY ?? "(not set)");
    expect(output).not.toContain(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "(not set)");
    expect(output).not.toContain(process.env.TEST_USER_PASSWORD ?? "(not set)");
  });
});
