// @vitest-environment node
/**
 * The tester-week loader, against local Supabase — LAN-221 (extending LAN-124).
 *
 * Proves, against a real database, what the map and the plan can only
 * promise: the load is repeatable and duplicates nothing; the report files
 * and reconciles with the application's own computation; every state the
 * map names exists and passes its predicate; nothing the sweep would send
 * and no live link beyond the named tester's is left behind, and verify fails
 * closed when one is; the checklists resolve to rows the load created and
 * cover every workflow; rollback removes exactly what the load created plus
 * the strays the parameters name, keeps history and its actors, refuses
 * application-created attachments and clears them with --force; and the
 * append-only and no-delete lists are what the catalogue says.
 *
 * It uses its own season labels and its own vocabulary, marked archived, so
 * its rows are invisible to every "current season" query the rest of the
 * suite makes — the same island `delivery.test.ts` builds.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { withTransaction } from "@/lib/db";
import { computeReportContent } from "@/lib/services/weekly-report";
import { openLocalClient, type Client } from "./helpers/domain-fixture";
import { testParams } from "./helpers/showcase-fixture.mjs";
import { APPEND_ONLY_TABLES, NO_DELETE_TABLES } from "../scripts/production/showcase/db.mjs";
import { STATES, TESTERS, WORKFLOWS, routePattern } from "../scripts/production/showcase/map.mjs";
import { reportIds } from "../scripts/production/showcase/report.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const LOADER = path.join(ROOT, "scripts/production/showcase.mjs");

type Row = { table: string; columns: Record<string, unknown> };
type Plan = Awaited<ReturnType<typeof plan>>;
type Workflow = { id: string; name: string; routes: string[]; notAWorkflow?: boolean };
const workflows = WORKFLOWS as unknown as readonly Workflow[];
type Season = Parameters<typeof computeReportContent>[1];
type State = { key: string; arrivesWith?: string };
const states = STATES as unknown as readonly State[];

let directory: string;
let client: Client;
let paramsPath: string;

function run(phase: string, extra: string[] = [], params = paramsPath) {
  return execFileSync(process.execPath, [LOADER, phase, "--params", params, ...extra], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, CI: "", VITEST: "" },
  });
}

function runExpectingFailure(phase: string, extra: string[] = [], params = paramsPath) {
  try {
    run(phase, extra, params);
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    return `${failure.stdout ?? ""}\n${failure.stderr ?? ""}`;
  }
  throw new Error(`${phase} should have failed`);
}

async function present(table: string, ids: string[]) {
  if (ids.length === 0) return 0;
  const result = await client.query<{ n: number }>(
    `select count(*)::int as n from ${table} where id = any($1)`,
    [ids],
  );
  return result.rows[0].n;
}

/** The plan, as the loader itself computes it against this database. */
async function plan(params = paramsPath) {
  const { buildPlan, todayUtc } = await import("../scripts/production/showcase/plan.mjs");
  const { syntheticTermCard } = await import("../scripts/production/showcase/sources.mjs");
  const { readExisting } = await import("../scripts/production/showcase/db.mjs");
  return buildPlan({
    termCard: syntheticTermCard(),
    params: JSON.parse(readFileSync(params, "utf8")),
    existing: await readExisting(client),
    anchor: todayUtc(),
  });
}

const idsOf = (current: Plan, table: string) =>
  (current.rows as Row[])
    .filter((row) => row.table === table)
    .map((row) => row.columns.id as string);

beforeAll(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "lancers-tester-week-"));
  client = await openLocalClient();
  paramsPath = path.join(directory, "params.json");
  writeFileSync(paramsPath, JSON.stringify(testParams({ liveLinksFor: ["brian"] })));
}, 60_000);

afterAll(async () => {
  try {
    run("rollback", ["--force"]);
  } catch {
    // Reported by whichever test failed; nothing useful to add here.
  }
  await client.end();
  rmSync(directory, { recursive: true, force: true });
});

describe("preflight and preview write nothing", () => {
  it("preflight passes, says what it found, and creates no row", async () => {
    const people = idsOf(await plan(), "public.people");
    const before = await present("public.people", people);
    const output = run("preflight");
    expect(output).toMatch(/Preflight passed/);
    expect(output).toMatch(/Nothing was written/);
    expect(output).toMatch(/Term card: \d+ entries \(synthetic/);
    expect(output).toMatch(/token secret: present/);
    expect(output).toMatch(/Privileges:/);
    expect(await present("public.people", people)).toBe(before);
  });

  it("preview reports what it would do, and does none of it", async () => {
    const output = run("preview");
    expect(output).toMatch(/Nothing was written/);
    expect(output).toMatch(/public\.notification_jobs/);
    expect(await present("public.events", idsOf(await plan(), "public.events"))).toBe(0);
  });

  it("refuses a parameter file without the token secret", () => {
    const bad = path.join(directory, "params-no-secret.json");
    writeFileSync(bad, JSON.stringify(testParams({ tokenSecret: undefined })));
    expect(runExpectingFailure("preflight", [], bad)).toMatch(/tokenSecret/);
  });
});

describe("loading", () => {
  it("writes every row the plan names, in one transaction", async () => {
    const output = run("load");
    expect(output).toMatch(/Created \d+, updated 0, skipped 0/);
    const current = await plan();
    for (const [table, ids] of current.byTable as Map<string, string[]>) {
      expect(await present(table, ids), table).toBe(ids.length);
    }
  }, 120_000);

  it("is repeatable — a second run creates nothing and duplicates nothing", async () => {
    const before = await plan();
    const people = idsOf(before, "public.people");
    const output = run("load");
    expect(output).toMatch(/Created 0, updated \d+/);
    expect(await present("public.people", people)).toBe(people.length);
    const first = before.examples.get("person.player.first") as string;
    const all = await client.query<{ n: number }>(
      "select count(*)::int as n from public.people where id = $1",
      [first],
    );
    expect(all.rows[0].n).toBe(1);
  }, 120_000);

  it("files the report from the loaded data, and files it once", async () => {
    expect(run("report")).toMatch(/Filed the .* report \(8 new rows\)/);
    expect(run("report")).toMatch(/\(0 new rows\)/);
    const ids = reportIds(await plan());
    expect(await present("public.weekly_reports", [ids.v1, ids.v2])).toBe(2);
  }, 60_000);

  it("writes a manifest carrying states, and no name, number or token", async () => {
    const manifestPath = path.join(directory, "manifest.json");
    run("manifest", ["--out", manifestPath]);
    const raw = readFileSync(manifestPath, "utf8");
    const manifest = JSON.parse(raw) as {
      counts: { states: number };
      records: { states?: string[] }[];
    };
    expect(manifest.counts.states).toBeGreaterThan(100);
    expect(manifest.records.some((record) => record.states?.includes("job.held"))).toBe(true);
    expect(raw).not.toContain("Alaric");
    expect(raw).not.toContain("900901");
    expect(raw).not.toMatch(
      /(?=[A-Za-z0-9_-]*[a-z])(?=[A-Za-z0-9_-]*[A-Z])(?=[A-Za-z0-9_-]*\d)\b[A-Za-z0-9_-]{43}\b/,
    );
  });
});

describe("verification", () => {
  it("passes against a loaded database, every state present", () => {
    const output = run("verify");
    expect(output).toMatch(/Everything reconciles/);
    expect(output).not.toMatch(/^FAIL/m);
    for (const state of states) {
      if (state.arrivesWith) expect(output).toContain(`LATER state ${state.key}`);
      else
        expect(output, state.key).toMatch(
          new RegExp(`^PASS  state ${state.key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:`, "m"),
        );
    }
  });

  it("proves nothing the sweep would send, and no live link but Brian's, is left behind", () => {
    const output = run("verify");
    expect(output).toMatch(
      /notification jobs the automatic sweep would dispatch, this dataset \(0 expected\): 0/,
    );
    expect(output).toMatch(
      /notification jobs pending or ready and not held, this dataset \(0 expected\): 0/,
    );
    expect(output).toMatch(
      /live RSVP links for anybody but the named testers, this dataset \(0 expected\): 0/,
    );
    expect(output).toMatch(
      /live player-page links for anybody but the named testers, this dataset \(0 expected\): 0/,
    );
    expect(output).toMatch(
      /single-use answer links neither spent nor revoked, this dataset \(0 expected\): 0/,
    );
  });

  it("reconciles the filed report with the application's own computation", async () => {
    const current = await plan();
    const ids = reportIds(current);
    const stored = await client.query<{ content: unknown }>(
      "select content from public.weekly_reports where id = $1",
      [ids.v2],
    );
    const season = {
      id: ids.seasonId,
      label: current.context.labels.currentSeason,
      status: "archived",
      startsOn: null,
      endsOn: null,
    } as unknown as Season;
    const fresh = await withTransaction((tx) =>
      computeReportContent(tx, season, current.context.anchor),
    );
    expect(JSON.parse(JSON.stringify(stored.rows[0].content))).toEqual(
      JSON.parse(JSON.stringify(fresh)),
    );
    expect((fresh as { lastWeek: unknown[] }).lastWeek.length).toBeGreaterThan(0);
    expect((fresh as { onboarding: { rows: unknown[] } }).onboarding.rows.length).toBeGreaterThan(
      0,
    );
  });

  it("fails closed when a job the sweep would send is injected", async () => {
    const invitation = idsOf(await plan(), "public.invitations")[0];
    await client.query(
      `insert into public.notification_jobs (idempotency_key, job_type, status, invitation_id, channel, scheduled_for)
       values ('tester-week-test-live', 'reminder', 'pending', $1, 'whatsapp', now() - interval '1 hour')`,
      [invitation],
    );
    const output = runExpectingFailure("verify");
    expect(output).toMatch(
      /FAIL  notification jobs the automatic sweep would dispatch, this dataset \(0 expected\): 1/,
    );
    expect(output).toMatch(/STOP\. Verification did not reconcile/);
    await client.query(
      "delete from public.notification_jobs where idempotency_key = 'tester-week-test-live'",
    );
  });

  it("fails closed when a live link for somebody who is not a named tester is injected", async () => {
    const current = await plan();
    const player = (current.context.players as { personId: string }[])[0];
    await client.query(
      `insert into public.person_access_tokens (person_id, season_id, token_hash, single_use)
       values ($1, $2, repeat('b', 64), false)`,
      [player.personId, current.context.seasonId],
    );
    const output = runExpectingFailure("verify");
    expect(output).toMatch(
      /FAIL  live player-page links for anybody but the named testers, this dataset \(0 expected\): 1/,
    );
    await client.query(
      "delete from public.person_access_tokens where token_hash = repeat('b', 64)",
    );
  });
});

describe("checklists", () => {
  it("writes one per tester, every link a row this load created, together covering every workflow", async () => {
    const out = path.join(directory, "checklists");
    const output = run("checklists", [
      "--out",
      out,
      "--base-url",
      "https://app.example",
      "--form-url",
      "https://forms.example/qa",
    ]);
    expect(output).toMatch(/hand each file to its tester only/);
    const files = readdirSync(out).sort();
    expect(files).toEqual(
      Object.values(TESTERS)
        .map((tester) => tester.file)
        .sort(),
    );

    const current = await plan();
    const known = new Set((current.rows as Row[]).map((row) => row.columns.id as string));
    // Role pages are addressed by the catalogue's own identifiers, adopted.
    for (const row of (await client.query<{ id: string }>("select id from public.roles")).rows)
      known.add(row.id);
    const covered = new Set<string>();
    const unresolved = new Set<string>();
    for (const file of files) {
      const text = readFileSync(path.join(out, file), "utf8");
      expect(text).toContain("https://forms.example/qa");
      for (const line of text.split("\n")) {
        const link = /Open https:\/\/app\.example(\/\S+)/.exec(line);
        const skipped = /no example row for `([^`]+)`/.exec(line);
        if (skipped) unresolved.add(skipped[1]);
        if (!link) continue;
        const route = link[1];
        for (const id of route.match(
          /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,
        ) ?? []) {
          expect(known.has(id), `${file}: ${route} names a row the load did not create`).toBe(true);
        }
      }
      for (const workflow of workflows) {
        if (text.includes(`. ${workflow.name}`)) covered.add(workflow.id);
      }
    }
    expect([...unresolved]).toEqual(["operator.brian"]);
    for (const workflow of workflows.filter((w) => !w.notAWorkflow)) {
      expect(covered.has(workflow.id), `${workflow.id} is on nobody's checklist`).toBe(true);
    }
  });

  it("gives Brian his own live links and nobody else's", async () => {
    const out = path.join(directory, "checklists");
    const brian = readFileSync(path.join(out, "brian.md"), "utf8");
    const current = await plan();
    expect(brian).toContain(`/rsvp/${current.examples.get("link.rsvp.brian")}`);
    expect(brian).toContain(`/me/${current.examples.get("link.me.brian")}`);
    for (const file of ["stewart.md", "clint.md", "coach.md"]) {
      const text = readFileSync(path.join(out, file), "utf8");
      expect(text).not.toContain(current.examples.get("link.rsvp.brian") as string);
      expect(text).not.toContain(current.examples.get("link.me.brian") as string);
    }
    // Every routed link is a page the application serves.
    for (const workflow of WORKFLOWS)
      for (const template of workflow.routes) expect(routePattern(template)).toMatch(/^\//);
  });
});

describe("the append-only and no-delete lists are what the catalogue says", () => {
  it("names exactly the tables the application role cannot update, and cannot delete from", async () => {
    const grants = await client.query<{ table_name: string; privileges: string }>(
      `select table_name, string_agg(privilege_type, ',' order by privilege_type) as privileges
         from information_schema.role_table_grants
        where table_schema = 'public' and grantee = 'service_role'
        group by table_name`,
    );
    const written = new Set((await plan()).byTable.keys() as Iterable<string>);
    written.add("public.weekly_reports");
    written.add("public.follow_up_actions");
    const noUpdate = grants.rows
      .filter(
        (row) => !row.privileges.includes("UPDATE") && written.has(`public.${row.table_name}`),
      )
      .map((row) => `public.${row.table_name}`)
      .sort();
    const noDelete = grants.rows
      .filter(
        (row) => !row.privileges.includes("DELETE") && written.has(`public.${row.table_name}`),
      )
      .map((row) => `public.${row.table_name}`)
      .sort();
    expect([...APPEND_ONLY_TABLES].filter((table) => written.has(table)).sort()).toEqual(noUpdate);
    expect([...NO_DELETE_TABLES].filter((table) => written.has(table)).sort()).toEqual(noDelete);
  });
});

describe("rollback", () => {
  it("refuses by name when the application has attached rows, and --force clears them", async () => {
    const invitation = idsOf(await plan(), "public.invitations")[0];
    const job = await client.query<{ id: string }>(
      `insert into public.notification_jobs (idempotency_key, job_type, status, invitation_id, channel)
       values ('tester-week-test-attached', 'invitation', 'completed', $1, 'whatsapp') returning id`,
      [invitation],
    );
    await client.query(
      `insert into public.delivery_attempts (notification_job_id, attempt_number, channel, provider)
       values ($1, 1, 'whatsapp', 'whatsapp_cloud')`,
      [job.rows[0].id],
    );
    const refusal = runExpectingFailure("rollback");
    expect(refusal).toMatch(/STOP\./);
    expect(refusal).toMatch(/notification_jobs\.invitation_id/);
    expect(refusal).toMatch(/Nothing was deleted/);
    expect(await present("public.invitations", [invitation])).toBe(1);

    run("rollback", ["--force"]);
    const gone = await client.query<{ n: number }>(
      "select count(*)::int as n from public.notification_jobs where idempotency_key = 'tester-week-test-attached'",
    );
    expect(gone.rows[0].n).toBe(0);
  }, 120_000);

  it("removes exactly what it wrote — its own audit rows included — and leaves a bystander alone", async () => {
    run("load");
    run("report");
    const bystander = await client.query<{ id: string }>(
      `insert into public.people (given_name, family_name) values ('Showcase', 'Bystander') returning id`,
    );
    const current = await plan();
    const people = idsOf(current, "public.people");
    const audit = idsOf(current, "public.audit_events");
    const rids = reportIds(current);

    const output = run("rollback");
    expect(output).toMatch(/Removed \d+ rows/);
    expect(await present("public.people", people)).toBe(0);
    expect(
      await present("public.audit_events", [...audit, rids.audit]),
      "fabricated history survived",
    ).toBe(0);
    expect(await present("public.people", [bystander.rows[0].id])).toBe(1);
    for (const table of [
      "public.events",
      "public.notification_jobs",
      "public.rsvp_access_tokens",
      "public.onboarding_item_history",
    ]) {
      expect(await present(table, idsOf(current, table)), table).toBe(0);
    }
    expect(await present("public.weekly_reports", [rids.v1, rids.v2])).toBe(0);
    await client.query("delete from public.people where id = $1", [bystander.rows[0].id]);

    expect(run("verify", ["--after-rollback"])).toMatch(/Everything reconciles/);
  }, 120_000);

  it("keeps history the application wrote, and the actor it names, even with --force", async () => {
    // Invariant M2: an actor named by real history stays resolvable. So a
    // Person an application audit row names cannot be removed at all — that is
    // a limit, not an omission, and everything else still rolls back.
    run("load");
    const current = await plan();
    const actor = idsOf(current, "public.people")[3];
    await client.query(
      `insert into public.audit_events (actor_person_id, actor_label, action, entity_table, entity_id)
       values ($1, 'test', 'showcase.preserved', 'people', $1)`,
      [actor],
    );
    expect(runExpectingFailure("rollback")).toMatch(/audit_events\.actor_person_id/);
    run("rollback", ["--force"]);
    const kept = await client.query<{ n: number }>(
      "select count(*)::int as n from public.audit_events where action = 'showcase.preserved'",
    );
    expect(kept.rows[0].n, "application history was deleted").toBe(1);
    expect(
      await present("public.people", [actor]),
      "the actor real history names was deleted",
    ).toBe(1);
    expect(
      await present(
        "public.people",
        idsOf(current, "public.people").filter((id) => id !== actor),
      ),
    ).toBe(0);
    await client.query("delete from public.audit_events where action = 'showcase.preserved'");
    run("rollback", ["--force"]);
  }, 120_000);

  it("as the role hosted connects as, holds back what it may not delete and everything it references, and the residue file finishes the job", async () => {
    // The hosted login has no DELETE on the history tables. Rehearsed here by
    // running rollback as `service_role`, which carries exactly those grants:
    // the transaction must not abort on a job a delivery row still points
    // at (independent review, round 1, F1), the residue file must name the
    // held-back rows children-first, and running it as the owner must leave
    // nothing behind.
    run("load");
    run("report");
    const current = await plan();
    const residuePath = path.join(directory, "residue.sql");
    const output = execFileSync(
      process.execPath,
      [LOADER, "rollback", "--params", paramsPath, "--residue", residuePath],
      {
        cwd: ROOT,
        encoding: "utf8",
        env: { ...process.env, CI: "", VITEST: "", SHOWCASE_SET_ROLE: "service_role" },
      },
    );
    expect(output).toMatch(/Removed \d+ rows/);
    expect(output).toMatch(/could not be deleted by the connected role/);

    // A delivery row it could not delete still points at its job, which
    // still points at its invitation: those are held back. Jobs nothing
    // references any more — cancelled and held reminders — are deleted.
    const jobs = idsOf(current, "public.notification_jobs");
    const results = idsOf(current, "public.delivery_results");
    expect(await present("public.delivery_results", results)).toBe(results.length);
    const orphanedResults = await client.query<{ n: number }>(
      `select count(*)::int as n from public.delivery_results r
        where r.id = any($1) and not exists (select 1 from public.notification_jobs j where j.id = r.notification_job_id)`,
      [results],
    );
    expect(orphanedResults.rows[0].n, "a held-back result lost its job").toBe(0);
    const remainingJobs = await present("public.notification_jobs", jobs);
    expect(remainingJobs).toBeGreaterThan(0);
    expect(remainingJobs).toBeLessThan(jobs.length);
    expect(await present("public.invitations", idsOf(current, "public.invitations"))).toBe(
      idsOf(current, "public.invitations").length,
    );
    // While the leaves nothing references were removed.
    expect(
      await present("public.question_responses", idsOf(current, "public.question_responses")),
    ).toBe(0);

    const sql = readFileSync(residuePath, "utf8");
    const order = [...sql.matchAll(/^delete from (public\.[a-z_]+) where id in/gm)].map(
      (match) => match[1],
    );
    expect(order.indexOf("public.delivery_results")).toBeLessThan(
      order.indexOf("public.notification_jobs"),
    );
    expect(order.indexOf("public.notification_jobs")).toBeLessThan(
      order.indexOf("public.invitations"),
    );
    expect(order.indexOf("public.invitations")).toBeLessThan(order.indexOf("public.events"));
    expect(sql).not.toMatch(/07700 900\d{3}/);

    expect(run("verify", ["--after-rollback", "--residue", residuePath])).toMatch(
      /RESIDUE {2}residue in public\.notification_jobs/,
    );
    expect(runExpectingFailure("verify", ["--after-rollback"])).toMatch(
      /FAIL {2}loader rows remaining outside residue tables/,
    );

    // The owner runs the file whole.
    await client.query(sql);
    expect(run("verify", ["--after-rollback"])).toMatch(/Everything reconciles/);
    expect(run("rollback")).toMatch(/Removed 0 rows/);
  }, 180_000);

  it("is repeatable — a second rollback removes nothing and fails at nothing", () => {
    expect(run("rollback")).toMatch(/Removed 0 rows/);
  }, 60_000);

  it("removes the stray Person rows the parameters name, and refuses one that holds an operator account", async () => {
    const stray = await client.query<{ id: string }>(
      `insert into public.people (given_name, family_name, created_at) values ('Invitation', 'Testrow', '2026-08-21T10:00:00Z') returning id`,
    );
    await client.query(
      `insert into public.contact_points (person_id, kind, raw_value, is_preferred) values ($1, 'phone', '07700 900998', true)`,
      [stray.rows[0].id],
    );
    const withStray = path.join(directory, "params-stray.json");
    writeFileSync(
      withStray,
      JSON.stringify(
        testParams({ liveLinksFor: ["brian"], strays: { personIds: [stray.rows[0].id] } }),
      ),
    );

    expect(run("preflight", [], withStray)).toMatch(/Strays: 1 of 1 named Person rows are present/);
    run("load", [], withStray);
    run("rollback", [], withStray);
    expect(await present("public.people", [stray.rows[0].id]), "the stray survived").toBe(0);
    expect(run("verify", ["--after-rollback"], withStray)).toMatch(
      /stray Person rows remaining \(0 expected\): 0/,
    );

    // An operator is never a stray.
    const keeper = await client.query<{ id: string }>(
      `insert into public.people (given_name) values ('Keeper') returning id`,
    );
    const auth = await client.query<{ id: string }>(
      `insert into auth.users (id, instance_id, aud, role, email)
       values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tester-week-keeper@lancers.local') returning id`,
    );
    await client.query(
      "insert into public.operator_accounts (auth_user_id, person_id) values ($1, $2)",
      [auth.rows[0].id, keeper.rows[0].id],
    );
    const withOperator = path.join(directory, "params-operator-stray.json");
    writeFileSync(
      withOperator,
      JSON.stringify(
        testParams({ liveLinksFor: ["brian"], strays: { personIds: [keeper.rows[0].id] } }),
      ),
    );
    expect(runExpectingFailure("preflight", [], withOperator)).toMatch(/hold an operator account/);
    run("load", [], withOperator);
    expect(runExpectingFailure("rollback", [], withOperator)).toMatch(
      /will not remove an operator/,
    );
    expect(await present("public.people", [keeper.rows[0].id])).toBe(1);
    run("rollback", [], paramsPath);
    await client.query("delete from public.operator_accounts where person_id = $1", [
      keeper.rows[0].id,
    ]);
    await client.query("delete from public.people where id = $1", [keeper.rows[0].id]);
    await client.query("delete from auth.users where id = $1", [auth.rows[0].id]);
  }, 180_000);
});
