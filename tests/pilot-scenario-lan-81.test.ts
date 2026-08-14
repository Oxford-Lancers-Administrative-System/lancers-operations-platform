// @vitest-environment node
/**
 * The LAN-81 pilot scenario, proved against a real database.
 *
 * `scripts/pilot/lan-81/setup.sql` and `cleanup.sql` are run BY HAND against
 * the single hosted production project, with no staging environment to catch a
 * mistake in them. The properties that make them safe are asserted here rather
 * than asserted in prose, in the shape `tests/pilot-scenario-lan-93.test.ts`
 * established and the later scenarios extended.
 *
 * ## What is different about this scenario
 *
 * It is the first whose cleanup can **delete a `weekly_reports` row**, and that
 * is worth stating plainly because invariant M5 makes a published report
 * immutable and nothing in the application can remove one. Immutable is not
 * permanent: a snapshot of a synthetic rehearsal week is scenario data, and the
 * runbook requires scenario data to be removable. What must never happen is a
 * report being *changed*, and nothing in either script does that.
 *
 * The rows have no deterministic identifier — Brian creates them by pressing a
 * button — so cleanup finds them by the sentinel inside their stored content,
 * and **aborts** on a report in the same date range that does not carry one. It
 * might be real leadership history. Both halves of that are tested below,
 * because the abort is the half that protects real history and an untested
 * guard is a guard that has never run.
 *
 * Its setup is also the first to refuse on the state of the **window** rather
 * than only on its own rows: an event in the reporting week that is not the
 * scenario's makes the README's numbers wrong and makes cleanup's identification
 * of the snapshots ambiguous, so the script will not install.
 *
 * LOCAL ONLY, and structurally so: the connection is opened by
 * `scripts/lib/local-db.mjs`, which refuses any non-loopback host and any
 * hosted Supabase connection string.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { one, openLocalClient, type Client } from "./helpers/domain-fixture";

const repoRoot = path.resolve(import.meta.dirname, "..");
const scenarioDir = path.join(repoRoot, "scripts", "pilot", "lan-81");

const SENTINEL = "PILOT-LAN-81";

/** The deterministic ids the scripts use, mirrored here so drift is a failure. */
const PEOPLE = [
  "00810081-0081-4081-8081-000000000001",
  "00810081-0081-4081-8081-000000000002",
  "00810081-0081-4081-8081-000000000003",
  "00810081-0081-4081-8081-000000000004",
  "00810081-0081-4081-8081-000000000005",
  "00810081-0081-4081-8081-000000000006",
];
const EVENTS = {
  practice: "00810081-0081-4081-8081-000000000021",
  emptyRegister: "00810081-0081-4081-8081-000000000022",
  briefing: "00810081-0081-4081-8081-000000000023",
};
const INVITATIONS = {
  saidYes: "00810081-0081-4081-8081-000000000041",
  saidNo: "00810081-0081-4081-8081-000000000042",
  neverAnswered: "00810081-0081-4081-8081-000000000043",
  emptyRegister: "00810081-0081-4081-8081-000000000044",
  briefing: "00810081-0081-4081-8081-000000000045",
};

const SETUP_FILE = readFileSync(path.join(scenarioDir, "setup.sql"), "utf8");
const CLEANUP_FILE = readFileSync(path.join(scenarioDir, "cleanup.sql"), "utf8");
const README_FILE = readFileSync(path.join(scenarioDir, "README.md"), "utf8");

function scriptBody(name: string, raw: string): string {
  const meaningful = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("--"));

  expect(meaningful[0], `${name} must open its own transaction`).toBe("begin;");
  expect(meaningful.at(-1), `${name} must close its own transaction`).toBe("commit;");
  expect(
    meaningful.filter((line) => line === "begin;" || line === "commit;"),
    `${name} must have exactly one transaction`,
  ).toEqual(["begin;", "commit;"]);

  return raw.replace(/^begin;$/m, "").replace(/^commit;$/m, "");
}

const SETUP = scriptBody("setup.sql", SETUP_FILE);
const CLEANUP = scriptBody("cleanup.sql", CLEANUP_FILE);

let client: Client;

beforeAll(async () => {
  client = await openLocalClient();
});

/**
 * Removes any committed instance of this scenario, and clears the reporting
 * window, inside the test's own transaction — so every test starts from a
 * database that has neither.
 *
 * The window matters as much as the rows. The seeded dataset is dense and the
 * scenario's own preflight refuses to install into a week that already has an
 * event in it, so without this the suite would pass or fail on today's date.
 * Every statement runs inside `begin … rollback`, so nothing it removes is
 * really removed: the review environment is exactly as it was when the test
 * finishes.
 *
 * It deliberately does **not** call `cleanup.sql`, which is one of the things
 * under test and would abort on a report a reviewer generated for another date.
 */
async function blankCanvas() {
  const events = `('${EVENTS.practice}', '${EVENTS.emptyRegister}', '${EVENTS.briefing}')`;
  const people = `(select id from public.people where known_as like '${SENTINEL}%')`;

  await client.query(
    `delete from public.audit_events
      where (entity_table = 'events' and entity_id in ${events})
         or (entity_table = 'weekly_reports'
             and entity_id in (select id from public.weekly_reports
                                where report_on between current_date - 7 and current_date))`,
  );
  await client.query(
    "delete from public.weekly_reports where report_on between current_date - 7 and current_date",
  );
  await client.query(`delete from public.attendance_records where event_id in ${events}`);
  await client.query(
    `delete from public.rsvp_responses
      where invitation_id in (select id from public.invitations where event_id in ${events})`,
  );
  await client.query(`delete from public.invitations where event_id in ${events}`);
  await client.query(`delete from public.event_audience_members where event_id in ${events}`);
  await client.query(`delete from public.season_memberships where person_id in ${people}`);
  await client.query(`delete from public.events where id in ${events}`);
  await client.query(`delete from public.people where known_as like '${SENTINEL}%'`);

  // And the rest of the window. Seeded events are removed dependency-first,
  // exactly as the scenario's own rows are, so the scenario has a week to itself
  // whatever today happens to be.
  const inWindow =
    "(select id from public.events where scheduled_on between current_date - 7 and current_date - 1)";
  await client.query(
    `delete from public.audit_events where entity_table = 'events' and entity_id in ${inWindow}`,
  );
  await client.query(`delete from public.attendance_records where event_id in ${inWindow}`);
  await client.query(
    `delete from public.rsvp_responses
      where invitation_id in (select id from public.invitations where event_id in ${inWindow})`,
  );
  await client.query(
    `delete from public.delivery_results
      where notification_job_id in (select id from public.notification_jobs
                                     where event_id in ${inWindow})`,
  );
  await client.query(`delete from public.notification_jobs where event_id in ${inWindow}`);
  await client.query(
    `delete from public.rsvp_access_tokens
      where invitation_id in (select id from public.invitations where event_id in ${inWindow})`,
  );
  await client.query(`delete from public.invitations where event_id in ${inWindow}`);
  await client.query(`delete from public.event_audience_members where event_id in ${inWindow}`);
  await client.query(`delete from public.schedule_changes where event_id in ${inWindow}`);
  await client.query(`delete from public.event_questions where event_id in ${inWindow}`);
  await client.query(
    "delete from public.events where scheduled_on between current_date - 7 and current_date - 1",
  );
}

beforeEach(async () => {
  await client.query("begin isolation level repeatable read");
  await blankCanvas();
});
afterEach(async () => {
  await client.query("rollback");
});
afterAll(async () => {
  await client.end();
});

/** A digest of every base table in `public` and `staging`. */
async function snapshot(): Promise<Record<string, string>> {
  const { rows: tables } = await client.query<{ qualified: string }>(
    `select quote_ident(n.nspname) || '.' || quote_ident(c.relname) as qualified
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where c.relkind in ('r', 'p')
        and n.nspname in ('public', 'staging')
      order by 1`,
  );

  const digests: Record<string, string> = {};
  for (const { qualified } of tables) {
    const row = await one<{ digest: string }>(
      client,
      `select count(*)::text || ':' ||
              coalesce(md5(string_agg(row_hash, ',' order by row_hash)), '-') as digest
         from (select md5(to_jsonb(t)::text) as row_hash from ${qualified} t) hashed`,
    );
    digests[qualified] = row.digest;
  }
  return digests;
}

async function count(sql: string, params: unknown[] = []): Promise<number> {
  const row = await one<{ n: string }>(client, `select count(*)::text as n from ${sql}`, params);
  return Number(row.n);
}

/**
 * A weekly report of the shape the application writes, for the scenario's
 * reporting date.
 *
 * The test does not call the service, deliberately: what is under test is
 * whether the SQL can find and remove a row the application created, and
 * building it here means the assertion does not depend on the service still
 * producing exactly this content. It carries the sentinel where a real one
 * does — inside the stored content, because every section names the scenario's
 * own events and people.
 */
async function generateReport(version: number, supersedes: string | null): Promise<string> {
  const row = await one<{ id: string }>(
    client,
    `insert into public.weekly_reports
       (season_id, report_on, version, supersedes_id, metric_definition_version,
        data_as_of, content)
     values ((select id from public.seasons where status in ('open', 'active')),
             current_date, $1, $2, 'LAN-81.1', now(),
             jsonb_build_object(
               'schema', 'lancers.monday-exception-report.v1',
               'exceptions', jsonb_build_array(
                 jsonb_build_object('key', 'nonresponses', 'items',
                   jsonb_build_array(jsonb_build_object(
                     'person', 'PILOT-LAN-81 Never answered',
                     'event', 'PILOT-LAN-81 Reporting week practice'))))))
     returning id`,
    [version, supersedes],
  );
  return row.id;
}

// ---------------------------------------------------------------------------
// setup.sql
// ---------------------------------------------------------------------------

describe("setup.sql", () => {
  it("creates the whole scenario, and is safe to run twice", async () => {
    await client.query(SETUP);

    expect(await count("public.people where known_as like $1", [`${SENTINEL}%`])).toBe(6);
    expect(await count("public.season_memberships where person_id = any($1)", [PEOPLE])).toBe(6);
    expect(await count("public.events where name like $1", [`%${SENTINEL}%`])).toBe(3);
    expect(
      await count("public.event_audience_members where event_id = any($1)", [
        Object.values(EVENTS),
      ]),
    ).toBe(6);
    expect(
      await count("public.invitations where event_id = any($1)", [Object.values(EVENTS)]),
    ).toBe(5);
    expect(
      await count(
        "public.rsvp_responses where invitation_id in (select id from public.invitations where event_id = any($1))",
        [Object.values(EVENTS)],
      ),
    ).toBe(2);
    expect(
      await count("public.attendance_records where event_id = any($1)", [Object.values(EVENTS)]),
    ).toBe(2);

    const afterFirst = await snapshot();
    await client.query(SETUP);
    expect(await snapshot()).toEqual(afterFirst);
  });

  it("puts every event inside the reporting window, and none outside it", async () => {
    await client.query(SETUP);

    // The window is the seven days ending the day before the reporting date,
    // and the reporting date is today. An event a day out is an event the
    // report would not see, which would make the README's matrix wrong.
    expect(
      await count(
        `public.events where name like $1
           and scheduled_on between current_date - 7 and current_date - 1`,
        [`%${SENTINEL}%`],
      ),
    ).toBe(3);
  });

  it("produces one of every exception the report leads with", async () => {
    await client.query(SETUP);

    const window = "scheduled_on between current_date - 7 and current_date - 1";

    // Two people were asked and never answered: one on the practice, one on
    // the empty-register session.
    expect(await count(`public.nonresponse_queue where ${window}`)).toBe(2);

    // One declined, with a reason.
    expect(
      await count(
        `public.invitation_response_state s
           join public.events e on e.id = s.event_id
          where e.${window} and s.response_state = 'responded_no'`,
      ),
    ).toBe(1);

    // Two mismatches: said yes and marked absent, and turned up uninvited —
    // the second of which the view could not emit before this issue's migration.
    const mismatches = await client.query<{ mismatch: string }>(
      `select mismatch from public.rsvp_attendance_mismatches where ${window} order by mismatch`,
    );
    expect(mismatches.rows.map((row) => row.mismatch)).toEqual([
      "attended_without_invitation",
      "said_yes_marked_absent",
    ]);

    // One approval defect: confirmed in the audience and never invited.
    expect(await count(`public.uninvited_audience_members where ${window}`)).toBe(1);

    // And one occurred event in the window with no attendance at all.
    expect(
      await count(
        `public.events e
          where e.${window} and e.status = 'occurred'
            and not exists (select 1 from public.attendance_records a where a.event_id = e.id)`,
      ),
    ).toBe(1);
  });

  it("keeps the non-soliciting briefing out of the response stream — invariant E6", async () => {
    await client.query(SETUP);

    // It has an audience and an invitation, and the invitee never answered.
    expect(await count("public.invitations where event_id = $1", [EVENTS.briefing])).toBe(1);
    expect(
      await count("public.event_audience_members where event_id = $1", [EVENTS.briefing]),
    ).toBe(1);

    // And it is absent from the partition entirely, so nothing about it can
    // reach the report's breakdown or its nonresponse queue.
    expect(
      await count("public.invitation_response_state where event_id = $1", [EVENTS.briefing]),
    ).toBe(0);
    expect(await count("public.nonresponse_queue where event_id = $1", [EVENTS.briefing])).toBe(0);
  });

  it("creates no contact point, so nothing here can be dialled or emailed", async () => {
    await client.query(SETUP);

    expect(await count("public.contact_points where person_id = any($1)", [PEOPLE])).toBe(0);
  });

  it("creates no notification job, so nothing here can be delivered", async () => {
    await client.query(SETUP);

    expect(
      await count("public.notification_jobs where event_id = any($1)", [Object.values(EVENTS)]),
    ).toBe(0);
    expect(
      await count("public.rsvp_access_tokens where invitation_id = any($1)", [
        Object.values(INVITATIONS),
      ]),
    ).toBe(0);
  });

  it("creates no weekly report — generating one is the thing under test", async () => {
    await client.query(SETUP);

    expect(await count("public.weekly_reports where report_on = current_date")).toBe(0);
  });

  it("refuses to install into a week that is not its own", async () => {
    // A real event in the reporting window makes the README's numbers wrong and
    // makes cleanup's identification of the generated snapshots ambiguous.
    await client.query(
      `insert into public.events (season_id, name, event_type, status, scheduled_on)
       values ((select id from public.seasons where status in ('open', 'active')),
               'An unrelated practice', 'practice', 'draft', current_date - 2)`,
    );

    await expect(client.query(SETUP)).rejects.toThrow(/already sit in the reporting window/);
  });

  it("refuses to install on top of a report already filed for today", async () => {
    await generateReport(1, null);

    await expect(client.query(SETUP)).rejects.toThrow(/already filed for today/);
  });

  it("refuses when an unrelated event has taken the sentinel", async () => {
    await client.query(
      `insert into public.events (season_id, name, event_type, status, scheduled_on)
       values ((select id from public.seasons where status in ('open', 'active')),
               '${SENTINEL} something somebody else named', 'practice', 'draft',
               current_date + 60)`,
    );

    await expect(client.query(SETUP)).rejects.toThrow(/are not this scenario/);
  });
});

// ---------------------------------------------------------------------------
// cleanup.sql
// ---------------------------------------------------------------------------

describe("cleanup.sql", () => {
  it("removes everything setup created, and is safe to run twice", async () => {
    const before = await snapshot();

    await client.query(SETUP);
    await client.query(CLEANUP);

    expect(await snapshot()).toEqual(before);

    await client.query(CLEANUP);
    expect(await snapshot()).toEqual(before);
  });

  it("removes the reports a tester generated, every version of them", async () => {
    await client.query(SETUP);

    const first = await generateReport(1, null);
    const second = await generateReport(2, first);
    expect(await count("public.weekly_reports where report_on = current_date")).toBe(2);

    await client.query(CLEANUP);

    // Both, in one statement — the supersession foreign key is `no action`, so
    // a whole version chain goes together and no ordering is needed.
    expect(await count("public.weekly_reports where id = any($1)", [[first, second]])).toBe(0);
    expect(
      await count("public.weekly_reports where content::text like $1", [`%${SENTINEL}%`]),
    ).toBe(0);
  });

  it("removes the audit rows the application wrote when it generated", async () => {
    await client.query(SETUP);
    const report = await generateReport(1, null);
    await client.query(
      `insert into public.audit_events (actor_label, action, entity_table, entity_id)
       values ('test', 'weekly_report_generated', 'weekly_reports', $1)`,
      [report],
    );

    await client.query(CLEANUP);

    expect(
      await count("public.audit_events where entity_table = 'weekly_reports' and entity_id = $1", [
        report,
      ]),
    ).toBe(0);
  });

  it("refuses rather than delete a report it cannot prove is this scenario's", async () => {
    await client.query(SETUP);

    // A snapshot with no sentinel in its content, filed in the same range. It
    // might be real leadership history, and guessing is exactly what the
    // ownership rule exists to prevent.
    await client.query(
      `insert into public.weekly_reports
         (season_id, report_on, version, metric_definition_version, data_as_of, content)
       values ((select id from public.seasons where status in ('open', 'active')),
               current_date - 1, 1, 'LAN-81.1', now(), '{"schema": "something else"}'::jsonb)`,
    );

    await expect(client.query(CLEANUP)).rejects.toThrow(/do not carry the PILOT-LAN-81 sentinel/);

    // And nothing was removed on the way to refusing: the abort is the point.
    await client.query("rollback");
    await client.query("begin isolation level repeatable read");
    await blankCanvas();
  });

  it("leaves the rest of the database exactly as it found it", async () => {
    // The strongest available statement of "and only its own rows": every base
    // table in `public` and `staging`, digested before and after.
    const before = await snapshot();

    await client.query(SETUP);
    await generateReport(1, null);
    await client.query(CLEANUP);

    expect(await snapshot()).toEqual(before);
  });

  it("leaves the open season, and every unrelated person, untouched", async () => {
    const seasons = await count("public.seasons where status in ('open', 'active')");
    const people = await count("public.people");

    await client.query(SETUP);
    await client.query(CLEANUP);

    expect(await count("public.seasons where status in ('open', 'active')")).toBe(seasons);
    expect(await count("public.people")).toBe(people);
  });
});

// ---------------------------------------------------------------------------
// The scripts as artifacts
// ---------------------------------------------------------------------------

describe("the scripts say what they do", () => {
  it("names the migration this scenario depends on", async () => {
    // The corrected mismatch view. Without it one row of the README's matrix is
    // silently missing, which is the worst kind of missing.
    expect(SETUP_FILE).toContain("20260814200000");
    expect(README_FILE).toContain("20260814200000_mismatch_view_sees_walk_ups.sql");
  });

  it("declares the sentinel-only shape it uses", () => {
    expect(README_FILE).toContain("## Ownership marker: sentinel only");
    expect(README_FILE).toContain("docs/adr/0019-application-created-pilot-rows.md");
  });

  it("creates nothing that could reach a real person", () => {
    for (const file of [SETUP_FILE, CLEANUP_FILE]) {
      expect(file).not.toMatch(/insert\s+into\s+public\.contact_points/i);
      expect(file).not.toMatch(/insert\s+into\s+public\.notification_jobs/i);
      expect(file).not.toMatch(/insert\s+into\s+public\.rsvp_access_tokens/i);
      expect(file).not.toMatch(/insert\s+into\s+auth\./i);
    }
  });

  it("never rewrites a row it did not create", () => {
    // `on conflict (id) do nothing` throughout, and no `do update` anywhere: a
    // row this script did not write is never silently changed. Comments are
    // stripped first, because the file says the words in order to promise them.
    const statements = SETUP_FILE.replace(/--[^\n]*/g, "");
    expect(statements).not.toMatch(/do\s+update/i);
    expect(SETUP_FILE.match(/on conflict \(id\) do nothing/g)?.length ?? 0).toBeGreaterThanOrEqual(
      6,
    );
  });

  it("never updates a weekly report — M5 is not weakened by being cleaned up", () => {
    for (const file of [SETUP_FILE, CLEANUP_FILE]) {
      expect(file).not.toMatch(/update\s+public\.weekly_reports/i);
    }
  });
});
