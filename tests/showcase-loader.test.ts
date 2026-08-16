// @vitest-environment node
/**
 * The showcase loader, against local Supabase — LAN-124.
 *
 * LAN-124 requires an automated test proving, against a **local** database,
 * that the load is repeatable, that rollback removes only its own rows and is
 * repeatable, and that durable identities and audit history survive it. This is
 * that test.
 *
 * It builds its own workbooks in memory rather than reading the club's, for the
 * same reason every other showcase suite does: the real files carry forty-two
 * students' names and this repository is public. What is exercised here is the
 * loader's machinery — adoption, idempotency, targeted rollback — which is
 * independent of whose names are in the spreadsheet.
 *
 * The loader was separately run against the club's real files during
 * implementation: 1,138 rows planned, 1,101 written with 37 adopted, a second
 * run creating 0 and updating 1,099, every verification check passing, and
 * rollback removing exactly the 1,099 it wrote.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { workbook } from "./helpers/xlsx-builder.mjs";
import { openLocalClient, type Client } from "./helpers/domain-fixture";

const ROOT = path.resolve(import.meta.dirname, "..");
const LOADER = path.join(ROOT, "scripts/production/showcase.mjs");

/** Names invented for this suite, and unlike anything the club's file holds. */
const PLAYERS = [
  "Quilliam Fetherstonhaugh",
  "Ondine Marchetti-Vale",
  "Bartholomew Ashgrove",
  "Perpetua Nkemdirim",
  "Caspar Wyndham-Fell",
];

let directory: string;
let client: Client;
let rosterPath: string;
let termCardPath: string;
let paramsPath: string;

const cell = (value: string) =>
  `t="inlineStr"><is><t>${value.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</t></is></c>`;

/** Runs one loader phase and returns its output. */
function run(phase: string, extra: string[] = []) {
  return execFileSync(
    process.execPath,
    [
      LOADER,
      phase,
      "--roster",
      rosterPath,
      "--termcard",
      termCardPath,
      "--params",
      paramsPath,
      ...extra,
    ],
    { cwd: ROOT, encoding: "utf8", env: { ...process.env, CI: "", VITEST: "" } },
  );
}

/** How many of the given identifiers are actually in the table. */
async function present(table: string, ids: string[]) {
  if (ids.length === 0) return 0;
  const result = await client.query<{ n: number }>(
    `select count(*)::int as n from ${table} where id = any($1)`,
    [ids],
  );
  return result.rows[0].n;
}

/** The plan, as the loader itself computes it. */
async function plan() {
  const { buildPlan } = await import("../scripts/production/showcase/plan.mjs");
  const { readRoster, readTermCard } = await import("../scripts/production/showcase/sources.mjs");
  const { readWorkbook } = await import("../scripts/production/showcase/workbook.mjs");
  const { readExisting } = await import("../scripts/production/showcase/db.mjs");

  return buildPlan({
    players: readRoster(readWorkbook(rosterPath)),
    termCard: readTermCard(readWorkbook(termCardPath), { year: 2026 }),
    params: JSON.parse(
      (await import("node:fs")).readFileSync(paramsPath, "utf8") as unknown as string,
    ),
    existing: await readExisting(client),
  });
}

beforeAll(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "lancers-showcase-"));
  client = await openLocalClient();

  const rosterRows: [string, string][] = [
    ["A1", cell("Name")],
    ["E1", cell("Kitted")],
  ];
  PLAYERS.forEach((name, index) => {
    const row = index + 3;
    rosterRows.push([`A${row}`, cell(name)]);
    rosterRows.push([`E${row}`, cell(index % 2 === 0 ? "Yes" : "No")]);
    rosterRows.push([`I${row}`, cell(["QB", "WR", "T", "G", "C"][index])]);
    rosterRows.push([`J${row}`, cell(["S", "CB", "LB", "E", "S"][index])]);
  });

  rosterPath = path.join(directory, "roster.xlsx");
  writeFileSync(rosterPath, workbook({ "Players Databank": rosterRows }));

  termCardPath = path.join(directory, "termcard.xlsx");
  writeFileSync(
    termCardPath,
    workbook({
      MT26: [
        ["B7", cell("1st (11th-17th Oct)")],
        ["C7", cell("Team Practice, University Parks, 10:00-13:00")],
        ["H7", cell("Team Practice, Iffley Road Astro, 20:00-22:31")],
        ["B11", cell("5th (8th-14th Nov)")],
        ["C11", cell("Lancers vs TBD, TBD, TBD")],
      ],
    }),
  );

  paramsPath = path.join(directory, "params.json");
  writeFileSync(
    paramsPath,
    JSON.stringify({
      brian: {
        givenName: "Showcase",
        familyName: "Owner",
        phone: "07700 900901",
        roles: ["it_officer"],
      },
      stewart: {
        givenName: "Showcase",
        familyName: "Manager",
        phone: "07700 900902",
        roles: ["general_manager"],
      },
      accessEndsOn: "2026-09-30",
      // Its own reference island. The loader commits — that is what it is for —
      // and the seeded current season is read by `listCurrentSeasonRoster` and
      // by the LAN-93 pilot scenario's refusals. Loading into it changed a
      // roster total and a vocabulary's season count in two other suites, which
      // is a real defect in this test rather than in them.
      //
      // `archived` keeps every "current season" query blind to these rows,
      // which is the same reason `delivery.test.ts` builds an archived season
      // of its own.
      labels: {
        currentSeason: "Showcase test current",
        archivedSeason: "Showcase test archived",
        vocabularyCode: "showcase_test_vocab",
        seasonStatus: "archived",
      },
    }),
  );
}, 60_000);

afterAll(async () => {
  // Always roll back, so this suite leaves the shared local stack as it found
  // it even when an assertion above failed.
  try {
    run("rollback");
  } catch {
    // Reported by whichever test failed; nothing useful to add here.
  }
  await client.end();
  rmSync(directory, { recursive: true, force: true });
});

describe("preflight and preview write nothing", () => {
  it("preflight passes and creates no row", async () => {
    const before = await present(
      "public.people",
      (await plan()).rows
        .filter((row: { table: string }) => row.table === "public.people")
        .map((row: { columns: { id: string } }) => row.columns.id),
    );

    const output = run("preflight");

    expect(output).toMatch(/Preflight passed/);
    expect(output).toMatch(/Nothing was written/);
    const after = await present(
      "public.people",
      (await plan()).rows
        .filter((row: { table: string }) => row.table === "public.people")
        .map((row: { columns: { id: string } }) => row.columns.id),
    );
    expect(after).toBe(before);
  });

  it("preview reports what it would do, and does none of it", async () => {
    const output = run("preview");

    expect(output).toMatch(/Nothing was written/);
    expect(output).toMatch(/public\.season_memberships/);

    const current = await plan();
    const eventIds = current.rows
      .filter((row: { table: string }) => row.table === "public.events")
      .map((row: { columns: { id: string } }) => row.columns.id);
    expect(await present("public.events", eventIds)).toBe(0);
  });
});

describe("loading", () => {
  it("writes every row the plan names", async () => {
    const output = run("load");
    expect(output).toMatch(/Created \d+, updated 0/);

    const current = await plan();
    for (const table of [
      "public.people",
      "public.season_memberships",
      "public.events",
      "public.invitations",
    ]) {
      const ids = current.rows
        .filter((row: { table: string }) => row.table === table)
        .map((row: { columns: { id: string } }) => row.columns.id);
      expect(await present(table, ids), table).toBe(ids.length);
    }
  }, 60_000);

  it("is repeatable — a second run creates nothing and duplicates nothing", async () => {
    const before = await plan();
    const peopleIds = before.rows
      .filter((row: { table: string }) => row.table === "public.people")
      .map((row: { columns: { id: string } }) => row.columns.id);

    const output = run("load");

    // The property LAN-124 states: no duplicates, deterministic updates.
    expect(output).toMatch(/Created 0, updated \d+/);
    expect(await present("public.people", peopleIds)).toBe(peopleIds.length);
  }, 60_000);

  it("gives every source player both an archived and a current membership", async () => {
    const current = await plan();
    const memberships = current.rows.filter(
      (row: { table: string }) => row.table === "public.season_memberships",
    );
    // Two each, and no more.
    expect(memberships.length).toBe(PLAYERS.length * 2);
    expect(
      await present(
        "public.season_memberships",
        memberships.map((row: { columns: { id: string } }) => row.columns.id),
      ),
    ).toBe(PLAYERS.length * 2);
  });

  it("leaves every term-card event a draft, with no audience and no invitation", async () => {
    // LAN-124: uncertain entries stay draft and are never approved or invited.
    // The loader must not approve *any* of them, tentative or not.
    const current = await plan();
    const termCardIds = current.rows
      .filter(
        (row: { table: string; columns: { term_id: string | null } }) =>
          row.table === "public.events" && row.columns.term_id !== null,
      )
      .map((row: { columns: { id: string } }) => row.columns.id);

    expect(termCardIds.length).toBeGreaterThan(0);

    const notDraft = await client.query<{ n: number }>(
      "select count(*)::int as n from public.events where id = any($1) and status <> 'draft'",
      [termCardIds],
    );
    expect(notDraft.rows[0].n).toBe(0);

    const invited = await client.query<{ n: number }>(
      "select count(*)::int as n from public.invitations where event_id = any($1)",
      [termCardIds],
    );
    expect(invited.rows[0].n).toBe(0);
  });

  it("normalises the drifted minute and keeps the raw value in the manifest", async () => {
    const manifestPath = path.join(directory, "manifest.json");
    run("manifest", ["--out", manifestPath]);

    const { readFileSync } = await import("node:fs");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const drifted = manifest.records.find(
      (record: { note?: string }) => record.note?.includes("22:31") ?? false,
    );

    expect(drifted, "no provenance record mentions the drifted time").toBeDefined();
    expect(drifted.note).toMatch(/loaded 22:30/);
  });

  it("writes a manifest carrying no name and no telephone number", async () => {
    const manifestPath = path.join(directory, "manifest-privacy.json");
    run("manifest", ["--out", manifestPath]);

    const { readFileSync } = await import("node:fs");
    const raw = readFileSync(manifestPath, "utf8");

    // The manifest is the artifact that records provenance, and it is the one
    // most likely to be pasted somewhere. It records cells and identifiers.
    for (const name of PLAYERS) {
      expect(raw, `the manifest names ${name.split(" ")[0]}`).not.toContain(name);
    }
    expect(raw).not.toContain("07700 900901");
    expect(raw).not.toContain("900901");
  });
});

describe("verification", () => {
  it("passes against a loaded database", () => {
    const output = run("verify");
    expect(output).toMatch(/Everything reconciles/);
    expect(output).not.toMatch(/^FAIL/m);
  });

  it("proves nothing the loader wrote is deliverable", () => {
    // The loader creates invitations and answers. It must create no job and no
    // live link: only the walkthrough itself, performed by a human, does that.
    const output = run("verify");
    expect(output).toMatch(/notification jobs against showcase invitations \(0 expected\): 0/);
    expect(output).toMatch(/live RSVP tokens against showcase invitations \(0 expected\): 0/);
  });
});

describe("rollback", () => {
  it("removes exactly what it wrote, and leaves a bystander alone", async () => {
    // A row the loader did not create, in a table it writes heavily.
    const bystander = await client.query<{ id: string }>(
      `insert into public.people (given_name, family_name)
       values ('Showcase', 'Bystander') returning id`,
    );
    const bystanderId = bystander.rows[0].id;

    const before = await plan();
    const peopleIds = before.rows
      .filter((row: { table: string }) => row.table === "public.people")
      .map((row: { columns: { id: string } }) => row.columns.id);

    run("rollback");

    expect(await present("public.people", peopleIds)).toBe(0);
    expect(await present("public.people", [bystanderId])).toBe(1);

    await client.query("delete from public.people where id = $1", [bystanderId]);
  }, 60_000);

  it("leaves the reference data it adopted rather than created", async () => {
    // Roles, the season and the position vocabulary were already there and were
    // adopted. Rollback must not remove them — they are not the loader's.
    const roles = await client.query<{ n: number }>("select count(*)::int as n from public.roles");
    expect(roles.rows[0].n).toBeGreaterThan(0);

    const seasons = await client.query<{ n: number }>(
      "select count(*)::int as n from public.seasons",
    );
    expect(seasons.rows[0].n).toBeGreaterThan(0);
  });

  it("is repeatable — a second rollback removes nothing and fails at nothing", () => {
    const output = run("rollback");
    expect(output).toMatch(/Removed 0 rows/);
  }, 60_000);

  it("leaves audit history behind", async () => {
    // `audit_events` is append-only at the privilege level and an actor it
    // references must stay resolvable, so rollback never names one.
    //
    // This assertion was `toBeGreaterThanOrEqual(0)`, which is true of every
    // possible number and could not fail. Independent review caught it. It now
    // counts the rows attributed to a showcase person specifically, and proves
    // rollback did not remove them.
    const current = await plan();
    const peopleIds = current.rows
      .filter((row: { table: string }) => row.table === "public.people")
      .map((row: { columns: { id: string } }) => row.columns.id);

    run("load");

    const actor = peopleIds[0];
    await client.query(
      `insert into public.audit_events
         (actor_person_id, actor_label, action, entity_table, entity_id)
       values ($1, 'test', 'showcase.test', 'people', $1)`,
      [actor],
    );

    const before = await client.query<{ n: number }>(
      "select count(*)::int as n from public.audit_events where actor_person_id = $1",
      [actor],
    );
    expect(before.rows[0].n).toBeGreaterThan(0);

    // Rollback must now refuse: an audit row references a person it would
    // delete, under `on delete restrict`.
    expect(() => run("rollback")).toThrow();

    const after = await client.query<{ n: number }>(
      "select count(*)::int as n from public.audit_events where actor_person_id = $1",
      [actor],
    );
    expect(after.rows[0].n).toBe(before.rows[0].n);

    await client.query("delete from public.audit_events where action = 'showcase.test'");
    run("rollback");
  }, 60_000);
});

describe("adopting a durable identity that already exists", () => {
  /**
   * The path had no automated coverage at all, and independent review found it
   * aborted a load that preflight had just passed — the exact failure the
   * adoption was written to prevent.
   *
   * `docs/pilot-data-manifest.md` binds the loader to inventorying rather than
   * duplicating an existing Auth user, Person and operator link. Brian's hosted
   * Auth user already exists, so this is Monday's path, not a hypothetical.
   */
  let authUserId: string;
  let existingPersonId: string;
  let adoptParams: string;

  beforeAll(async () => {
    const person = await client.query<{ id: string }>(
      `insert into public.people (given_name, family_name)
       values ('Adopted', 'Owner') returning id`,
    );
    existingPersonId = person.rows[0].id;

    // A preferred phone already on file. This is what collided.
    await client.query(
      `insert into public.contact_points (person_id, kind, raw_value, is_preferred)
       values ($1, 'phone', '07700 900950', true)`,
      [existingPersonId],
    );

    const auth = await client.query<{ id: string }>(
      `insert into auth.users (id, instance_id, aud, role, email)
       values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
               'authenticated', 'authenticated', 'adopted.owner@lancers.local')
       returning id`,
    );
    authUserId = auth.rows[0].id;

    await client.query(
      "insert into public.operator_accounts (auth_user_id, person_id) values ($1, $2)",
      [authUserId, existingPersonId],
    );

    adoptParams = path.join(directory, "params-adopt.json");
    writeFileSync(
      adoptParams,
      JSON.stringify({
        brian: {
          givenName: "Adopted",
          familyName: "Owner",
          authUserId,
          phone: "07700 900951",
          roles: ["it_officer"],
        },
        labels: {
          currentSeason: "Adoption test current",
          archivedSeason: "Adoption test archived",
          vocabularyCode: "adoption_test_vocab",
          seasonStatus: "archived",
        },
      }),
    );
  }, 60_000);

  const runAdopt = (phase: string, extra: string[] = []) =>
    execFileSync(
      process.execPath,
      [
        LOADER,
        phase,
        "--roster",
        rosterPath,
        "--termcard",
        termCardPath,
        "--params",
        adoptParams,
        ...extra,
      ],
      { cwd: ROOT, encoding: "utf8", env: { ...process.env, CI: "", VITEST: "" } },
    );

  it("loads without colliding with the preferred phone already on file", () => {
    // `contact_points_one_preferred_per_kind` is a *partial* unique index, which
    // `on conflict (id)` does not cover. The loader wrote a second preferred
    // phone and the whole transaction aborted — after preflight passed.
    const output = runAdopt("load");
    expect(output).toMatch(/Created \d+, updated 0/);
  }, 60_000);

  it("creates no second Person for a human who already has one", async () => {
    const people = await client.query<{ n: number }>(
      "select count(*)::int as n from public.people where given_name = 'Adopted'",
    );
    expect(people.rows[0].n, "a second Person was created").toBe(1);
  });

  it("leaves the existing operator link pointing where it did", async () => {
    const link = await client.query<{ person_id: string; n: number }>(
      `select person_id, count(*) over ()::int as n
         from public.operator_accounts where auth_user_id = $1`,
      [authUserId],
    );
    expect(link.rows[0].n).toBe(1);
    expect(link.rows[0].person_id).toBe(existingPersonId);
  });

  it("keeps the club's own preferred number preferred", async () => {
    const preferred = await client.query<{ raw_value: string }>(
      `select raw_value from public.contact_points
        where person_id = $1 and kind = 'phone' and is_preferred`,
      [existingPersonId],
    );
    expect(preferred.rowCount).toBe(1);
    expect(preferred.rows[0].raw_value).toBe("07700 900950");
  });

  it("rollback leaves the adopted Person and their own contact behind", async () => {
    runAdopt("rollback", ["--force"]);

    const person = await client.query<{ n: number }>(
      "select count(*)::int as n from public.people where id = $1",
      [existingPersonId],
    );
    expect(person.rows[0].n, "the adopted Person was deleted").toBe(1);

    const contact = await client.query<{ n: number }>(
      "select count(*)::int as n from public.contact_points where person_id = $1",
      [existingPersonId],
    );
    expect(contact.rows[0].n, "the pre-existing contact was deleted").toBe(1);

    const link = await client.query<{ n: number }>(
      "select count(*)::int as n from public.operator_accounts where auth_user_id = $1",
      [authUserId],
    );
    expect(link.rows[0].n, "the pre-existing operator link was deleted").toBe(1);
  }, 60_000);

  afterAll(async () => {
    try {
      runAdopt("rollback", ["--force"]);
    } catch {
      // Reported by whichever assertion failed.
    }
    await client.query("delete from public.operator_accounts where auth_user_id = $1", [
      authUserId,
    ]);
    await client.query("delete from public.contact_points where person_id = $1", [
      existingPersonId,
    ]);
    await client.query("delete from public.people where id = $1", [existingPersonId]);
    await client.query("delete from auth.users where id = $1", [authUserId]);
  });
});

describe("rollback against a database the walkthrough has been performed on", () => {
  /**
   * The case that was missing, and the one that matters most.
   *
   * `OWNER-RUNBOOK.md` § 10 has Brian approve an event, send a message, take an
   * answer and regenerate the report — and § 11 then tells him rollback is the
   * default closing move. Every one of those writes rows the *application*
   * creates, carrying identifiers the loader never computed, hanging off rows it
   * did. Some restrict, so the delete aborts and removes nothing; two cascade,
   * so the delete silently takes rows the loader never created.
   *
   * The original suite only ever rolled back a clean database — the one state in
   * which none of this can happen.
   */
  it("refuses by name rather than failing on a constraint", async () => {
    run("load");
    const current = await plan();

    const invitationId = current.rows.find(
      (row: { table: string }) => row.table === "public.invitations",
    )?.columns.id;
    expect(invitationId, "the plan writes no invitation to attach to").toBeDefined();

    // Exactly what approving an event and messaging somebody produces.
    await client.query(
      `insert into public.notification_jobs
         (idempotency_key, job_type, status, invitation_id, channel)
       values ('showcase-test-foreign', 'invitation', 'completed', $1, 'whatsapp')`,
      [invitationId],
    );

    let output = "";
    try {
      run("rollback");
      throw new Error("rollback should have refused");
    } catch (error) {
      output = String((error as { stdout?: string; stderr?: string }).stderr ?? "");
    }

    // It names the table and the column, not a PostgreSQL constraint name.
    expect(output).toMatch(/STOP\./);
    expect(output).toMatch(/notification_jobs\.invitation_id/);
    expect(output).toMatch(/Nothing was deleted/);

    // And it really did delete nothing.
    const survived = await client.query<{ n: number }>(
      "select count(*)::int as n from public.invitations where id = $1",
      [invitationId],
    );
    expect(survived.rows[0].n).toBe(1);

    // `--force` removes them deliberately, which is the documented way out.
    run("rollback", ["--force"]);

    const gone = await client.query<{ n: number }>(
      "select count(*)::int as n from public.notification_jobs where idempotency_key = $1",
      ["showcase-test-foreign"],
    );
    expect(gone.rows[0].n).toBe(0);
  }, 60_000);

  it("--force clears a notification job that has its own delivery attempt", async () => {
    // The case independent review executed and this suite's fixture missed:
    // sending the message writes a job *and* an attempt, and
    // `delivery_attempts.notification_job_id` restricts. A single pass over a
    // hand-ordered list collected the job after it had already looked for the
    // job's children, so the attempt was never found and `--force` aborted.
    // Dependencies are now followed transitively, which is what this pins.
    run("load");
    const current = await plan();
    const invitationId = current.rows.find(
      (row: { table: string }) => row.table === "public.invitations",
    )?.columns.id;

    const job = await client.query<{ id: string }>(
      `insert into public.notification_jobs
         (idempotency_key, job_type, status, invitation_id, channel)
       values ('showcase-test-transitive', 'invitation', 'completed', $1, 'whatsapp')
       returning id`,
      [invitationId],
    );
    await client.query(
      `insert into public.delivery_attempts
         (notification_job_id, attempt_number, channel, provider)
       values ($1, 1, 'whatsapp', 'whatsapp_cloud')`,
      [job.rows[0].id],
    );

    run("rollback", ["--force"]);

    const attempts = await client.query<{ n: number }>(
      "select count(*)::int as n from public.delivery_attempts where notification_job_id = $1",
      [job.rows[0].id],
    );
    expect(attempts.rows[0].n, "the transitive child survived --force").toBe(0);

    const jobs = await client.query<{ n: number }>(
      "select count(*)::int as n from public.notification_jobs where idempotency_key = $1",
      ["showcase-test-transitive"],
    );
    expect(jobs.rows[0].n).toBe(0);
  }, 60_000);

  it("--force removes a weekly report, which the rollback order must include", async () => {
    // The first version of `--force` collected ids from `weekly_reports`,
    // `audit_events` and `event_questions` and then never deleted them, because
    // none of those tables was in ROLLBACK_ORDER. The restrict constraint fired
    // exactly as it would have without `--force`, so the documented way out of a
    // refusal did not work. This is the case that catches that.
    run("load");
    const current = await plan();
    const season = current.rows.find((row: { table: string }) => row.table === "public.seasons")
      ?.columns.id;
    const person = current.rows.find((row: { table: string }) => row.table === "public.people")
      ?.columns.id;
    expect(season, "the plan adopts every season, so there is none to attach to").toBeDefined();

    await client.query(
      `insert into public.weekly_reports
         (season_id, report_on, generated_by_person_id, metric_definition_version,
          data_as_of, content)
       values ($1, current_date, $2, 'test', now(), '{}'::jsonb)`,
      [season, person],
    );

    let stderr = "";
    try {
      run("rollback");
    } catch (error) {
      stderr = String((error as { stderr?: string }).stderr ?? "");
    }
    expect(stderr).toMatch(/weekly_reports/);

    run("rollback", ["--force"]);

    const gone = await client.query<{ n: number }>(
      "select count(*)::int as n from public.weekly_reports where season_id = $1",
      [season],
    );
    expect(gone.rows[0].n).toBe(0);
  }, 60_000);

  it("--force still refuses to delete audit history, and keeps the actor", async () => {
    // Invariant M2: an actor named by history stays resolvable. So a Person an
    // audit row names cannot be removed even with `--force` — that is a limit,
    // not an omission, and everything else must still roll back around it.
    run("load");
    const current = await plan();
    const person = current.rows.find((row: { table: string }) => row.table === "public.people")
      ?.columns.id;

    await client.query(
      `insert into public.audit_events
         (actor_person_id, actor_label, action, entity_table, entity_id)
       values ($1, 'test', 'showcase.preserved', 'people', $1)`,
      [person],
    );

    run("rollback", ["--force"]);

    const audit = await client.query<{ n: number }>(
      "select count(*)::int as n from public.audit_events where action = 'showcase.preserved'",
    );
    expect(audit.rows[0].n, "audit history was deleted").toBe(1);

    const actor = await client.query<{ n: number }>(
      "select count(*)::int as n from public.people where id = $1",
      [person],
    );
    expect(actor.rows[0].n, "the actor an audit row names was deleted").toBe(1);

    await client.query("delete from public.audit_events where action = 'showcase.preserved'");
    run("rollback", ["--force"]);
  }, 60_000);

  it("does not let a cascade quietly remove an audience row it did not create", async () => {
    // `event_audience_members.event_id` cascades. Without the check, deleting a
    // showcase event would take an audience row somebody added afterwards with
    // no error and no record — the widening the pilot runbook exists to refuse.
    run("load");
    const current = await plan();

    const event = current.rows.find(
      (row: { table: string; columns: { status: string } }) =>
        row.table === "public.events" && row.columns.status === "draft",
    );
    // The membership has to be in the event's own season —
    // `event_audience_members_membership_same_season` is a composite key, not
    // two independent ones.
    const membership = current.rows.find(
      (row: { table: string; columns: { season_id: string } }) =>
        row.table === "public.season_memberships" &&
        row.columns.season_id === event.columns.season_id,
    );
    expect(event).toBeDefined();
    expect(membership, "no membership in the event's season").toBeDefined();

    const added = await client.query<{ id: string }>(
      `insert into public.event_audience_members
         (event_id, season_id, capacity, season_membership_id)
       values ($1, $2, 'player', $3) returning id`,
      [event.columns.id, event.columns.season_id, membership.columns.id],
    );

    let stderr = "";
    try {
      run("rollback");
    } catch (error) {
      stderr = String((error as { stderr?: string }).stderr ?? "");
    }
    // The table, not a particular column. Dependencies are discovered from
    // `pg_constraint` and followed breadth-first, so whichever edge reaches this
    // row first is the one named — here `season_membership_id` rather than
    // `event_id`, an edge the original hand-written list did not have at all.
    // What matters is that the row is found and named, not by which route.
    expect(stderr).toMatch(/event_audience_members/);

    const survived = await client.query<{ n: number }>(
      "select count(*)::int as n from public.event_audience_members where id = $1",
      [added.rows[0].id],
    );
    expect(survived.rows[0].n).toBe(1);

    await client.query("delete from public.event_audience_members where id = $1", [
      added.rows[0].id,
    ]);
    run("rollback");
  }, 60_000);
});
