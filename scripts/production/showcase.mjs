#!/usr/bin/env node
/**
 * The tester-week loader — LAN-221, extending LAN-124. **Owner-run. Brian
 * runs this by hand.**
 *
 * Nothing invokes it: not CI, not a migration, not an npm script, not an agent.
 * `tests/production-smoke-contract.test.ts` fails if anything starts to, and
 * that is why the commands below are spelled out in full in `OWNER-RUNBOOK.md`
 * rather than wrapped in `npm run`.
 *
 *     node scripts/production/showcase.mjs <phase> [options]
 *
 * Phases, in the order they are run:
 *
 *     preflight   read-only. Checks the target, the schema, the privileges,
 *                 the parameters and the term card, and writes nothing.
 *     preview     read-only. Prints what the load would create and update.
 *     load        writes, in one transaction. Idempotent.
 *     report      files the Monday report from what was loaded. Idempotent.
 *     verify      read-only. Proves every state the map names exists, that
 *                 the pages reconcile, and that nothing live is left behind.
 *     manifest    read-only. Writes the provenance manifest to a file.
 *     checklists  read-only. Writes one checklist per tester, links filled in.
 *     rollback    deletes exactly the rows this loader would create, and the
 *                 stray rows the parameters name; refuses when rows it did not
 *                 create are attached, and writes residue SQL for the tables
 *                 the connected role may not delete from.
 *
 * Options:
 *
 *     --params <path>          the private parameter file (never committed)
 *     --termcard <path>        the Michaelmas term-card workbook (optional)
 *     --anchor <YYYY-MM-DD>    the tester-week date; defaults to today
 *     --out <path>             where `manifest` writes, or the directory
 *                              `checklists` writes into
 *     --base-url <url>         the deployed origin the checklists link to
 *     --form-url <url>         the report form the checklists point at
 *     --after-rollback         verify: expect only history to remain
 *     --force                  rollback: also remove attached rows the
 *                              application created
 *     --database-url <url>     a loopback database, for a local rehearsal
 *     --confirm-target <ref>   the hosted project, named out loud
 *
 * A local run needs no confirmation because it cannot reach anything real. A
 * hosted run needs `--confirm-target` *and* `DATABASE_URL`, and both are checked
 * by the same functions the connection smoke test uses.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  connect,
  findAttachedRows,
  newLedger,
  NO_DELETE_TABLES,
  PRESERVED_TABLES,
  readDependencies,
  readExisting,
  readPrivileges,
  ROLLBACK_ORDER,
  writePlan,
} from "./showcase/db.mjs";
import { buildPlan, todayInLondon } from "./showcase/plan.mjs";
import { readTermCard, syntheticTermCard } from "./showcase/sources.mjs";
import { resolveTarget } from "./showcase/target.mjs";
import { readWorkbook } from "./showcase/workbook.mjs";
import { STATES, TESTERS, WORKFLOWS } from "./showcase/map.mjs";
import { renderChecklists } from "./showcase/checklists.mjs";
import {
  computeReportContent,
  fileReport,
  readFiledReport,
  reportIds,
} from "./showcase/report.mjs";

const PHASES = [
  "preflight",
  "preview",
  "load",
  "report",
  "verify",
  "manifest",
  "checklists",
  "rollback",
];
const DEFAULT_BASE_URL = "https://app.oxfordlancers.com";
export const MAX_ATTEMPTS = 5;

/** Reads `--flag value` out of argv. */
function option(argv, name, fallback = null) {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? fallback : (argv[index + 1] ?? fallback);
}

/**
 * The private parameters: who the testers are, how to reach Brian and
 * Stewart, the secret every live link is derived from, and the stray rows
 * rollback should also remove.
 *
 * Never committed, never echoed. This function reports its *shape* and never
 * its contents — see `describeParameters`.
 */
function readParameters(pathname) {
  if (!pathname) {
    throw new Error(
      "No --params file. It carries the Auth user identifiers, the real telephone " +
        "numbers and the token secret, and it is the one input that must never be " +
        "committed. See OWNER-RUNBOOK.md § The private parameter file.",
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(pathname, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read --params ${pathname}: ${error.message}`);
  }
  if (!parsed.brian?.givenName) {
    throw new Error("The parameter file must describe `brian`, who owns every audit trail here.");
  }
  if (typeof parsed.tokenSecret !== "string" || parsed.tokenSecret.length < 16) {
    throw new Error(
      "The parameter file must carry `tokenSecret` — at least 16 characters, never " +
        "committed — from which every live link is derived. See OWNER-RUNBOOK.md § The " +
        "private parameter file.",
    );
  }
  return parsed;
}

/** Says what the parameters contain without saying what any of it is. */
function describeParameters(params) {
  const people = [
    "brian",
    "stewart",
    "clint",
    "coach",
    ...(params.others ?? []).map((p) => p.key ?? "other"),
  ];
  return people
    .filter((key) => params[key] || (params.others ?? []).some((p) => (p.key ?? "other") === key))
    .map((key) => {
      const person = params[key] ?? (params.others ?? []).find((p) => (p.key ?? "other") === key);
      const has = [
        person.authUserId ? "auth user" : null,
        person.phone ? "telephone number" : null,
        person.roles?.length ? `roles: ${person.roles.join(", ")}` : null,
      ].filter(Boolean);
      return `  ${key}: ${has.length === 0 ? "name only" : has.join(", ")}`;
    })
    .concat([
      `  live links for: ${(params.liveLinksFor ?? ["brian", "stewart"]).join(", ") || "nobody"}`,
      `  strays to remove on rollback: ${params.strays?.personIds?.length ?? 0}`,
      `  token secret: ${params.tokenSecret ? "present" : "absent"}`,
    ])
    .join("\n");
}

/** The term card: the club's workbook when given, a synthetic one otherwise. */
function readSources(argv) {
  const termCardPath = option(argv, "termcard");
  if (!termCardPath)
    return { termCard: syntheticTermCard({ year: 2026 }), termCardSource: "synthetic" };
  return {
    termCard: readTermCard(readWorkbook(termCardPath), { year: 2026 }),
    termCardSource: termCardPath,
  };
}

/** The tables the plan writes, plus the report phase's. */
function plannedTables(plan) {
  return [
    ...new Set([
      ...plan.rows.map((row) => row.table),
      "public.weekly_reports",
      "public.follow_up_actions",
      "public.audit_events",
    ]),
  ];
}

// ---------------------------------------------------------------------------
// preflight
// ---------------------------------------------------------------------------

async function preflight(client, target, params, sources, plan) {
  const problems = [];
  const notes = [];
  notes.push(`Target: ${target.describe()}`);

  const required = [
    "people",
    "seasons",
    "events",
    "invitations",
    "season_memberships",
    "roles",
    "notification_jobs",
    "onboarding_item_history",
    "person_fact_disputes",
    "recruitment_prospects",
  ];
  const tables = await client.query(
    `select table_name from information_schema.tables where table_schema = 'public' and table_name = any($1)`,
    [required],
  );
  const found = new Set(tables.rows.map((row) => row.table_name));
  for (const table of required) {
    if (!found.has(table))
      problems.push(
        `The database has no public.${table}. Migrations first — LAN-214's onboarding substrate included.`,
      );
  }

  const roles = await client.query("select count(*)::int as count from public.roles");
  notes.push(`Roles already present: ${roles.rows[0].count}`);
  if (roles.rows[0].count === 0)
    problems.push("public.roles is empty. Apply the role-catalogue migration first.");

  const seasons = await client.query(
    "select label, status from public.seasons order by created_at",
  );
  notes.push(
    seasons.rowCount === 0
      ? "Seasons already present: none"
      : `Seasons already present: ${seasons.rows.map((row) => `${row.label} (${row.status})`).join(", ")}`,
  );

  notes.push(`Parameters supplied:\n${describeParameters(params)}`);
  if (!params.brian?.authUserId) {
    notes.push(
      "  note: brian has no authUserId, so no operator account will be linked. Run the LAN-138 bootstrap first if you intend to sign in as him.",
    );
  }

  // Durable identities — inventoried, never duplicated.
  const authUserIds = ["brian", "stewart", "clint", "coach"]
    .map((key) => params[key]?.authUserId)
    .filter(Boolean);
  if (authUserIds.length > 0) {
    const linked = await client.query(
      `select oa.auth_user_id, oa.is_active, p.given_name, p.family_name
         from public.operator_accounts oa join public.people p on p.id = oa.person_id
        where oa.auth_user_id = any($1)`,
      [authUserIds],
    );
    notes.push(
      `Durable identities: ${linked.rowCount} of ${authUserIds.length} supplied Auth users already resolve to a Person. Those are adopted, not duplicated.`,
    );
    for (const row of linked.rows) {
      const key = ["brian", "stewart", "clint", "coach"].find(
        (candidate) => params[candidate]?.authUserId === row.auth_user_id,
      );
      const supplied = `${params[key].givenName} ${params[key].familyName ?? ""}`.trim();
      const actual = `${row.given_name} ${row.family_name ?? ""}`.trim();
      if (supplied.toLowerCase() !== actual.toLowerCase()) {
        problems.push(
          `The Auth user supplied as \`${key}\` is already linked to a different Person than the parameters describe. Resolve that by hand before loading.`,
        );
      }
      if (!row.is_active)
        problems.push(
          `The operator account for \`${key}\` exists but is deactivated. Reactivate it in the application before loading.`,
        );
    }
  } else {
    notes.push(
      "No authUserId supplied for anybody. Nobody will be able to sign in, and no operator account will be created or adopted.",
    );
  }

  // Privileges: the load must not abort partway on a table the role cannot write.
  const privileges = await readPrivileges(client, plannedTables(plan));
  const cannotInsert = [...privileges].filter(([, p]) => !p.insert).map(([table]) => table);
  const cannotDelete = [...privileges].filter(([, p]) => !p.delete).map(([table]) => table);
  if (cannotInsert.length > 0)
    problems.push(`The connected role cannot INSERT into: ${cannotInsert.join(", ")}.`);
  notes.push(
    cannotDelete.length === 0
      ? "Privileges: the connected role can delete from every table the plan writes — rollback will be complete on its own."
      : `Privileges: the connected role cannot DELETE from ${cannotDelete.length} table(s) the plan writes; rollback will write residue SQL for those. Expected on hosted.`,
  );
  const unexpected = cannotDelete.filter(
    (table) => !NO_DELETE_TABLES.includes(table) && !PRESERVED_TABLES.includes(table),
  );
  if (unexpected.length > 0)
    problems.push(
      `Tables without DELETE that the loader did not expect: ${unexpected.join(", ")}. Update NO_DELETE_TABLES before loading.`,
    );

  // Reference rows the plan adopts.
  if ((plan.context && !plan.context.seasonId) || false) problems.push("No season resolved.");
  const agreements = await client.query(
    "select count(*)::int as count from public.onboarding_agreement_versions",
  );
  if (agreements.rows[0].count === 0)
    problems.push(
      "public.onboarding_agreement_versions is empty. Apply LAN-214's migration, which seeds the placeholder versions.",
    );
  const schedules = await client.query(
    "select count(*)::int as count from public.messaging_schedules",
  );
  if (schedules.rows[0].count === 0)
    problems.push(
      "public.messaging_schedules is empty. Apply the messaging-schedule migration first.",
    );

  // Strays: the parameters name them; preflight only hints at candidates.
  const strays = params.strays?.personIds ?? [];
  if (strays.length > 0) {
    const linked = await client.query(
      "select count(*)::int as count from public.operator_accounts where person_id = any($1)",
      [strays],
    );
    if (linked.rows[0].count > 0)
      problems.push(
        `${linked.rows[0].count} of the stray Person ids named in the parameters hold an operator account. Rollback will refuse them; take them out of the list.`,
      );
    const present = await client.query(
      "select count(*)::int as count from public.people where id = any($1)",
      [strays],
    );
    notes.push(
      `Strays: ${present.rows[0].count} of ${strays.length} named Person rows are present.`,
    );
  }
  const candidates = await client.query(
    `select count(*)::int as count from public.people p
      where p.created_at::date = '2026-08-21'
        and not exists (select 1 from public.operator_accounts oa where oa.person_id = p.id)
        and not exists (select 1 from public.season_memberships m where m.person_id = p.id)`,
  );
  if (candidates.rows[0].count > 0) {
    notes.push(
      `Hint: ${candidates.rows[0].count} Person row(s) were created on 2026-08-21 with no membership and no operator link — the invitation-testing rows LAN-196 names. Put their ids in the parameter file's strays.personIds and rollback removes them; the loader never guesses.`,
    );
  }

  notes.push(
    `Term card: ${sources.termCard.length} entries (${sources.termCardSource === "synthetic" ? "synthetic — no workbook supplied" : sources.termCardSource})`,
  );
  if (sources.termCard.length === 0) problems.push("The term card produced no entries.");
  notes.push(
    `Anchor: ${plan.context.anchor}. Plan: ${plan.rows.length} rows, ${plan.states.size} states, ${plan.examples.size} examples.`,
  );
  for (const note of plan.notes) notes.push(`  note: ${note}`);

  return { problems, notes };
}

// ---------------------------------------------------------------------------
// preview / load / report
// ---------------------------------------------------------------------------

async function preview(client, plan) {
  const ledger = newLedger();
  await writePlan(client, ledger, plan, { dryRun: true });
  const byTable = new Map();
  for (const row of plan.rows) byTable.set(row.table, (byTable.get(row.table) ?? 0) + 1);
  console.log("\nProposed rows, by table:");
  for (const [table, count] of [...byTable].sort())
    console.log(`  ${String(count).padStart(6)}  ${table}`);
  console.log(`\n  create: ${ledger.created}   update: ${ledger.updated}`);
  console.log(
    "\nNothing was written. `update` means the loader already owns that identifier — rerunning converges rather than duplicating.",
  );
  return ledger;
}

async function load(client, plan) {
  const ledger = newLedger();
  await client.query("begin");
  try {
    await writePlan(client, ledger, plan);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
  console.log(
    `\nCreated ${ledger.created}, updated ${ledger.updated}, skipped ${ledger.skipped}. Nothing else was touched.`,
  );
  if (ledger.skipped > 0) {
    console.log(
      "  Skipped rows are append-only — history, answers, results. They were already there and this loader may not rewrite them.",
    );
  }
  console.log("\nNext: `report`, then `verify`.");
  return ledger;
}

async function report(client, plan) {
  await client.query("begin");
  let result;
  try {
    result = await fileReport(client, plan, { actorPersonId: plan.context.actorPersonId });
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
  console.log(
    `\nFiled the ${plan.context.anchor} report (${result.created} new rows): ` +
      `${result.content.lastWeek.length} events last week, ${result.content.nextWeek.length} next week, ` +
      `${result.content.grid.rows.length} people to chase, ${result.content.onboarding.rows.length} onboarding, ` +
      `${result.content.recruitment.length} recruits, ${result.content.walkUps.length} walk-ups.`,
  );
  return result;
}

// ---------------------------------------------------------------------------
// verify
// ---------------------------------------------------------------------------

/** JSON with sorted keys, so two equal objects compare equal whatever order they were built in. */
function canonical(value) {
  return JSON.stringify(value, (key, inner) =>
    inner && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(
          Object.keys(inner)
            .sort()
            .map((k) => [k, inner[k]]),
        )
      : inner,
  );
}

async function verify(client, plan, params, { afterRollback = false, wholeDatabase = false } = {}) {
  const checks = [];
  const check = (label, actual, expected, { detail = null } = {}) =>
    checks.push({ label, actual, expected, ok: actual === expected, detail });
  const count = async (sql, values = []) => Number((await client.query(sql, values)).rows[0].count);
  const ids = (table) => plan.byTable.get(table) ?? [];

  if (afterRollback) {
    // Only history and residue may remain.
    const remaining = [];
    for (const [table, owned] of plan.byTable) {
      const present = await count(
        `select count(*)::int as count from ${table} where id = any($1)`,
        [owned],
      );
      if (present === 0) continue;
      if (PRESERVED_TABLES.includes(table)) continue;
      remaining.push({ table, present, residue: NO_DELETE_TABLES.includes(table) });
    }
    const audit = await count(
      "select count(*)::int as count from public.audit_events where id = any($1)",
      [ids("public.audit_events")],
    );
    check("audit lineage kept", audit > 0, true, { detail: `${audit} rows` });
    const actors = (
      await client.query(
        "select distinct actor_person_id as id from public.audit_events where id = any($1) and actor_person_id is not null",
        [ids("public.audit_events")],
      )
    ).rows.map((row) => row.id);
    const peopleLeft = remaining.find((entry) => entry.table === "public.people");
    if (peopleLeft) {
      const others = await count(
        "select count(*)::int as count from public.people where id = any($1) and id <> all($2::uuid[])",
        [ids("public.people"), actors],
      );
      check("people remaining beyond the actors history names (0 expected)", others, 0);
      remaining.splice(remaining.indexOf(peopleLeft), 1);
    }
    const rids = reportIds(plan);
    const reports = await count(
      "select count(*)::int as count from public.weekly_reports where id = any($1)",
      [[rids.v1, rids.v2]],
    );
    if (reports > 0)
      remaining.push({ table: "public.weekly_reports", present: reports, residue: true });
    const hard = remaining.filter((entry) => !entry.residue);
    check("loader rows remaining outside residue tables (0 expected)", hard.length, 0, {
      detail: hard.map((e) => `${e.table}:${e.present}`).join(", ") || null,
    });
    for (const entry of remaining.filter((e) => e.residue)) {
      checks.push({
        label: `residue in ${entry.table}`,
        actual: entry.present,
        expected: entry.present,
        ok: true,
        residue: true,
      });
    }
    const strays = params.strays?.personIds ?? [];
    if (strays.length > 0) {
      check(
        "stray Person rows remaining (0 expected)",
        await count("select count(*)::int as count from public.people where id = any($1)", [
          strays,
        ]),
        0,
      );
    }
    return finish(checks);
  }

  // 1. Every planned row is present.
  for (const [table, owned] of plan.byTable) {
    check(
      `${table.replace("public.", "")} written`,
      await count(`select count(*)::int as count from ${table} where id = any($1)`, [owned]),
      owned.length,
    );
  }

  // 2. Every state the map names: each tagged row present and satisfying its
  //    predicate, and the floor met.
  for (const state of STATES) {
    if (state.arrivesWith) {
      checks.push({
        label: `state ${state.key} — arrives with ${state.arrivesWith}`,
        actual: "later",
        expected: "later",
        ok: true,
        later: true,
      });
      continue;
    }
    // The report phase's rows are not in the plan; their identifiers are.
    const filedIds = reportIds(plan);
    const tagged =
      state.key === "report.filed"
        ? [filedIds.v2]
        : state.key === "follow-up.open"
          ? filedIds.followUpsOpen
          : state.key === "follow-up.closed"
            ? filedIds.followUpsClosed
            : (plan.states.get(state.key) ?? []);
    const satisfied =
      tagged.length === 0
        ? 0
        : await count(
            `select count(*)::int as count from ${state.table} t where t.id = any($1) and (${state.where})`,
            [tagged],
          );
    check(`state ${state.key}: ${state.label}`, satisfied, tagged.length, {
      detail: `${satisfied} of ${tagged.length} tagged`,
    });
    if (tagged.length < state.min)
      check(`state ${state.key} floor ${state.min}`, tagged.length, state.min);
  }

  // 3. Term-card refusals.
  const termCardIds = plan.rows
    .filter((row) => row.table === "public.events" && row.columns.term_id !== null)
    .map((row) => row.columns.id);
  check(
    "term-card events that are not draft (0 expected)",
    await count(
      "select count(*)::int as count from public.events where id = any($1) and status <> 'draft'",
      [termCardIds],
    ),
    0,
  );
  check(
    "term-card events carrying an audience (0 expected)",
    await count(
      "select count(*)::int as count from public.event_audience_members where event_id = any($1)",
      [termCardIds],
    ),
    0,
  );

  // 4. Nothing live. The claim predicate is the dispatcher's own (`claimJobIn`,
  //    src/lib/services/delivery.ts). On hosted the check covers the whole
  //    database, which is the invariant tester week actually needs: the day
  //    WHATSAPP_PHONE_NUMBER_ID is set, nothing anywhere may start sending.
  //    Locally the seed keeps a live ladder by design, so the check is scoped
  //    to the dataset's own season and people unless --whole-database is given.
  const scope = wholeDatabase ? "whole database" : "this dataset";
  const seasonId = plan.context.seasonId;
  const people = [
    ...new Set(
      plan.rows.filter((row) => row.table === "public.people").map((row) => row.columns.id),
    ),
  ];
  const jobScope = wholeDatabase
    ? "true"
    : `(j.event_id in (select id from public.events where season_id = $1)
        or j.invitation_id in (select id from public.invitations where season_id = $1)
        or j.person_id = any($2::uuid[]))`;
  const jobArgs = wholeDatabase ? [] : [seasonId, people];
  // The sweep's own selection (`messaging-scheduler.ts`): pending or ready and
  // due, or failed with a retry scheduled — never held, never at the ceiling.
  check(
    `notification jobs the automatic sweep would dispatch, ${scope} (0 expected)`,
    await count(
      `select count(*)::int as count from public.notification_jobs j where ${jobScope} and j.held_at is null and j.attempt_count < ${MAX_ATTEMPTS} and (j.status in ('pending','ready') or (j.status = 'failed' and j.next_attempt_at is not null))`,
      jobArgs,
    ),
    0,
  );
  check(
    `notification jobs pending or ready and not held, ${scope} (0 expected)`,
    await count(
      `select count(*)::int as count from public.notification_jobs j where ${jobScope} and j.status in ('pending','ready') and j.held_at is null`,
      jobArgs,
    ),
    0,
  );
  const livePeople = plan.context.operators
    .filter((operator) => plan.context.liveLinksFor.includes(operator.key))
    .map((operator) => operator.personId);
  const tokenScope = wholeDatabase ? "true" : "i.season_id = $2";
  const tokenArgs = wholeDatabase ? [livePeople] : [livePeople, seasonId];
  check(
    `live RSVP links for anybody but the named testers, ${scope} (0 expected)`,
    await count(
      `select count(*)::int as count from public.rsvp_access_tokens t
         join public.invitations i on i.id = t.invitation_id
         left join public.season_memberships m on m.id = i.season_membership_id
        where ${tokenScope} and t.revoked_at is null and t.expires_at > now()
          and coalesce(i.person_id, m.person_id) <> all($1::uuid[])`,
      tokenArgs,
    ),
    0,
  );
  const personTokenScope = wholeDatabase ? "true" : "t.season_id = $2";
  check(
    `live player-page links for anybody but the named testers, ${scope} (0 expected)`,
    await count(
      `select count(*)::int as count from public.person_access_tokens t where ${personTokenScope} and not t.single_use and t.revoked_at is null and t.person_id <> all($1::uuid[])`,
      tokenArgs,
    ),
    0,
  );
  check(
    `single-use answer links neither spent nor revoked, ${scope} (0 expected)`,
    await count(
      `select count(*)::int as count from public.person_access_tokens t where ${wholeDatabase ? "true" : "t.season_id = $1"} and t.single_use and t.single_use_at is null and t.revoked_at is null`,
      wholeDatabase ? [] : [seasonId],
    ),
    0,
  );

  // 5. Cross-page parity.
  check(
    "answers whose invitation is missing (0 expected)",
    await count(
      `select count(*)::int as count from public.rsvp_responses r where r.id = any($1) and not exists (select 1 from public.invitations i where i.id = r.invitation_id)`,
      [ids("public.rsvp_responses")],
    ),
    0,
  );
  check(
    "jobs whose invitation is missing (0 expected)",
    await count(
      `select count(*)::int as count from public.notification_jobs j where j.id = any($1) and j.invitation_id is not null and not exists (select 1 from public.invitations i where i.id = j.invitation_id)`,
      [ids("public.notification_jobs")],
    ),
    0,
  );
  check(
    "delivery results without a job (0 expected)",
    await count(
      `select count(*)::int as count from public.delivery_results d where d.id = any($1) and not exists (select 1 from public.notification_jobs j where j.id = d.notification_job_id)`,
      [ids("public.delivery_results")],
    ),
    0,
  );
  check(
    "current memberships without a full checklist (0 expected)",
    await count(
      `select count(*)::int as count from public.season_memberships m where m.id = any($1) and m.season_id = $2 and (select count(*) from public.onboarding_items i where i.season_membership_id = m.id) <> 11`,
      [ids("public.season_memberships"), plan.context.seasonId],
    ),
    0,
  );

  // 6. The report reconciles with the pages.
  const rids = reportIds(plan);
  const filed = await readFiledReport(client, plan);
  check("report filed as version 2", filed?.version ?? 0, 2);
  if (filed) {
    const fresh = await computeReportContent(
      client,
      { id: rids.seasonId, label: plan.context.labels.currentSeason },
      plan.context.anchor,
    );
    const stored = filed.content;
    const same = (label, a, b) => check(`report reconciles: ${label}`, canonical(a), canonical(b));
    same(
      "last week's events",
      stored.lastWeek.map((e) => [
        e.id,
        e.invited,
        e.respondedYes,
        e.respondedNo,
        e.present,
        e.late,
        e.excused,
        e.absent,
        e.walkUps,
      ]),
      fresh.lastWeek.map((e) => [
        e.id,
        e.invited,
        e.respondedYes,
        e.respondedNo,
        e.present,
        e.late,
        e.excused,
        e.absent,
        e.walkUps,
      ]),
    );
    same(
      "next week's events",
      stored.nextWeek.map((e) => [e.id, e.invited, e.answered]),
      fresh.nextWeek.map((e) => [e.id, e.invited, e.answered]),
    );
    same("attendance totals", stored.attendance, fresh.attendance);
    same("availability counts", stored.availabilityCounts, fresh.availabilityCounts);
    same("people to chase", stored.grid.rows.length, fresh.grid.rows.length);
    same("onboarding rows", stored.onboarding.rows.length, fresh.onboarding.rows.length);
    same("recruits", stored.recruitment.length, fresh.recruitment.length);
    check(
      "report sections populated",
      [
        "lastWeek",
        "nextWeek",
        "grid",
        "availability",
        "walkUps",
        "recruitment",
        "onboarding",
      ].filter(
        (key) =>
          (Array.isArray(stored[key]) ? stored[key].length : (stored[key].rows ?? []).length) > 0,
      ).length,
      7,
    );
  }
  check(
    "follow-up actions filed",
    await count("select count(*)::int as count from public.follow_up_actions where id = any($1)", [
      rids.followUps,
    ]),
    rids.followUps.length,
  );

  return finish(checks);
}

function finish(checks) {
  console.log("");
  let failed = false;
  for (const entry of checks) {
    if (entry.later) {
      console.log(`LATER ${entry.label}`);
      continue;
    }
    if (entry.residue) {
      console.log(
        `RESIDUE  ${entry.label}: ${entry.actual} row(s) the connected role could not delete — run the residue SQL as the owner`,
      );
      continue;
    }
    if (!entry.ok) failed = true;
    console.log(
      `${entry.ok ? "PASS" : "FAIL"}  ${entry.label}: ${entry.actual}${entry.ok ? "" : ` (expected ${entry.expected})`}${entry.detail && !entry.ok ? ` — ${entry.detail}` : ""}`,
    );
  }
  const later = checks.filter((entry) => entry.later).length;
  if (later > 0) console.log(`\n${later} state(s) arrive with later packages and are not counted.`);
  return { checks, failed };
}

// ---------------------------------------------------------------------------
// manifest / checklists
// ---------------------------------------------------------------------------

function manifest(plan, sources, pathname) {
  const document = {
    issue: "LAN-221",
    anchor: plan.context.anchor,
    generatedFrom: {
      termCard:
        sources.termCardSource === "synthetic"
          ? "synthetic term card"
          : "260720 OULAFC MT26 Term Card v0.xlsx",
    },
    counts: {
      total: plan.provenance.length,
      sourceDerived: plan.provenance.filter((entry) => entry.classification === "source-derived")
        .length,
      illustrative: plan.provenance.filter((entry) => entry.classification === "illustrative")
        .length,
      states: plan.states.size,
    },
    // Deliberately no names, no telephone numbers and no tokens: this file
    // records which row carries which state and where it came from.
    records: plan.provenance,
    report: reportIds(plan),
  };
  writeFileSync(pathname, `${JSON.stringify(document, null, 2)}\n`);
  console.log(
    `\nWrote ${document.counts.total} provenance records to ${pathname} (${document.counts.sourceDerived} source-derived, ${document.counts.illustrative} illustrative).`,
  );
  return document;
}

function checklists(plan, params, argv) {
  const directory = option(argv, "out", "showcase-checklists");
  const baseUrl = option(argv, "base-url", DEFAULT_BASE_URL).replace(/\/$/, "");
  const formUrl = option(argv, "form-url", params.formUrl ?? null);
  mkdirSync(directory, { recursive: true });
  const rendered = renderChecklists({ plan, baseUrl, formUrl, logins: params.logins ?? {} });
  for (const [tester, markdown] of rendered) {
    const target = path.join(directory, TESTERS[tester].file);
    writeFileSync(target, markdown);
    console.log(
      `  wrote ${target} (${WORKFLOWS.filter((w) => w.tester === tester).length} workflows)`,
    );
  }
  if (!formUrl)
    console.log(
      "\nNo --form-url given: the checklists say the form link is to follow. Re-run with --form-url once the Notion form is live.",
    );
  console.log(
    `\nLinks point at ${baseUrl}. They contain live credentials for the named testers — hand each file to its tester only, and never commit them.`,
  );
}

// ---------------------------------------------------------------------------
// rollback
// ---------------------------------------------------------------------------

async function rollback(client, plan, params, { force = false, residuePath }) {
  const discovered = [];
  const byTable = new Map();
  for (const row of plan.rows) {
    if (PRESERVED_TABLES.includes(row.table)) continue; // history stays
    if (!byTable.has(row.table)) byTable.set(row.table, []);
    byTable.get(row.table).push(row.columns.id);
  }
  const rids = reportIds(plan);
  byTable.set("public.follow_up_actions", [
    ...(byTable.get("public.follow_up_actions") ?? []),
    ...rids.followUps,
  ]);
  byTable.set("public.weekly_reports", [
    ...(byTable.get("public.weekly_reports") ?? []),
    rids.v2,
    rids.v1,
  ]);

  // The strays: Person rows the parameters name, removed with everything
  // hanging off them, never an operator.
  const strays = params.strays?.personIds ?? [];
  if (strays.length > 0) {
    const linked = await client.query(
      "select person_id from public.operator_accounts where person_id = any($1)",
      [strays],
    );
    if (linked.rowCount > 0) {
      console.error(
        `\nSTOP. ${linked.rowCount} of the stray Person ids named in the parameters hold an operator account. The loader will not remove an operator; take them out of strays.personIds.`,
      );
      return {
        removed: 0,
        blockers: [
          {
            table: "public.operator_accounts",
            column: "person_id",
            target: "strays",
            count: linked.rowCount,
            sample: "(withheld)",
          },
        ],
      };
    }
    byTable.set("public.people", [...(byTable.get("public.people") ?? []), ...strays]);
  }

  // People named as actor by the loader's own audit rows stay: history is
  // kept, and an actor history names must stay resolvable (invariant M2). On
  // hosted that is Brian's adopted Person, never created here; in a rehearsal
  // without an Auth user it is the Person the loader made for him.
  const ownedAudit = plan.byTable.get("public.audit_events") ?? [];
  const keptActors = new Set(
    (
      await client.query(
        "select distinct actor_person_id as id from public.audit_events where id = any($1) and actor_person_id is not null",
        [ownedAudit],
      )
    ).rows.map((row) => row.id),
  );
  if (keptActors.size > 0) {
    byTable.set(
      "public.people",
      (byTable.get("public.people") ?? []).filter((id) => !keptActors.has(id)),
    );
  }

  const dependencies = await readDependencies(client);
  const walkerOwned = new Map(byTable);
  walkerOwned.set("public.audit_events", ownedAudit);
  const { blockers, attached } = await findAttachedRows(client, walkerOwned, dependencies);

  // Rows attached to the strays are the strays' own — a contact point typed
  // with them, a consent row — and go with them without --force. Everything
  // else attached is the application's, and the usual refusal applies.
  const strayOwned = new Set();
  if (strays.length > 0) {
    const straySet = new Set(strays);
    for (const [table, rows] of attached) {
      for (const rowId of rows) {
        const parent = await client
          .query(`select 1 from ${table} where id = $1 and person_id = any($2)`, [rowId, strays])
          .catch(() => ({ rowCount: 0 }));
        if (parent.rowCount > 0) strayOwned.add(`${table}:${rowId}`);
      }
    }
    void straySet;
  }
  const realBlockers = blockers.filter(
    (blocker) =>
      !(
        strays.length > 0 &&
        blocker.target === "public.people" &&
        blocker.count ===
          [...strayOwned].filter((key) => key.startsWith(`${blocker.table}:`)).length
      ),
  );

  if (realBlockers.length > 0 && !force) {
    console.error("\nSTOP. Rows this loader did not create are attached to rows it did:\n");
    for (const blocker of realBlockers) {
      console.error(
        `  ${String(blocker.count).padStart(5)}  ${blocker.table}.${blocker.column} → ${blocker.target}   (for example ${blocker.sample})`,
      );
    }
    console.error(
      "\nNothing was deleted. This is what tester week itself produces — approvals, answers, " +
        "reports, corrections — and removing the dataset underneath them would either fail " +
        "halfway or take those rows with it.\n\nSee OWNER-RUNBOOK.md § Afterwards. Once you have " +
        "kept whatever evidence you want from those rows, re-run with --force to remove them along with the dataset.",
    );
    return { removed: 0, blockers: realBlockers };
  }

  const removable = attached.filter(([table]) => !PRESERVED_TABLES.includes(table));
  if (attached.length > 0) {
    const preservedBlockers = blockers.filter((b) => PRESERVED_TABLES.includes(b.table));
    if (force)
      console.log(
        `\n--force: removing ${removable.reduce((total, [, ids]) => total + ids.length, 0)} attached rows the application created, as well as the dataset.`,
      );
    if (preservedBlockers.length > 0) {
      console.log(
        "\nKept, and so is whatever they point at:\n" +
          preservedBlockers
            .map((b) => `  ${String(b.count).padStart(5)}  ${b.table}.${b.column} → ${b.target}`)
            .join("\n") +
          "\n  History that can be deleted to tidy up is not history.",
      );
      for (const blocker of preservedBlockers) {
        const keep = await client.query(
          `select ${blocker.column} as id from ${blocker.table} where ${blocker.column} = any($1)`,
          [byTable.get(blocker.target) ?? []],
        );
        const kept = new Set(keep.rows.map((row) => row.id));
        byTable.set(
          blocker.target,
          (byTable.get(blocker.target) ?? []).filter((id) => !kept.has(id)),
        );
      }
    }
    for (const [table, ids] of removable)
      byTable.set(table, [...new Set([...(byTable.get(table) ?? []), ...ids])]);
    for (const [table] of removable) if (!ROLLBACK_ORDER.includes(table)) discovered.push(table);
  }

  // What the connected role may actually delete.
  const privileges = await readPrivileges(client, [...byTable.keys()]);
  const residue = [];
  let removed = 0;
  await client.query("begin");
  try {
    for (const table of [...discovered, ...ROLLBACK_ORDER]) {
      const ids = byTable.get(table);
      if (!ids || ids.length === 0) continue;
      if (!privileges.get(table)?.delete) {
        const present = await client.query(`select id from ${table} where id = any($1)`, [ids]);
        if (present.rowCount > 0) residue.push({ table, ids: present.rows.map((row) => row.id) });
        continue;
      }
      const result = await client.query(`delete from ${table} where id = any($1)`, [ids]);
      if (result.rowCount > 0) {
        console.log(`  ${String(result.rowCount).padStart(6)}  ${table}`);
        removed += result.rowCount;
      }
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }

  console.log(
    `\nRemoved ${removed} rows. Approved identities the loader adopted rather than created, the audit history` +
      `${keptActors.size > 0 ? `, and the ${keptActors.size} Person row(s) that history names as actor` : ""}, are untouched.`,
  );

  if (residue.length > 0) {
    const statements = residue.map(
      ({ table, ids }) =>
        `-- ${ids.length} row(s)\ndelete from ${table} where id in (\n${ids.map((id) => `  '${id}'`).join(",\n")}\n);`,
    );
    const sql = `-- Tester-week rollback residue — LAN-221. Run as the database owner, in the\n-- Supabase SQL editor, in this order. Identifiers only; no personal data.\nbegin;\n${statements.join("\n")}\ncommit;\n`;
    writeFileSync(residuePath, sql);
    console.log(
      `\n${residue.reduce((total, entry) => total + entry.ids.length, 0)} rows in ${residue.length} table(s) could not be deleted by the connected role and were written to ${residuePath}. ` +
        "Run that file as the owner in the SQL editor, then `verify --after-rollback`. See OWNER-RUNBOOK.md § Afterwards.",
    );
    // Deleting the parents those rows still point at would have failed, so
    // those parents are residue too; the file above is what removes them.
  }
  return { removed, blockers: [], residue };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2);
  const phase = argv[0];
  if (!PHASES.includes(phase)) {
    console.error(`Usage: node scripts/production/showcase.mjs <${PHASES.join("|")}> [options]`);
    process.exitCode = 1;
    return;
  }

  const target = resolveTarget(argv.slice(1));
  const params = readParameters(option(argv, "params"));
  const sources = readSources(argv);
  const anchor = option(argv, "anchor", todayInLondon());

  console.log(`\nShowcase ${phase} — ${target.describe()}`);

  const client = await connect(target);
  try {
    const authUserIds = ["brian", "stewart", "clint", "coach"]
      .map((key) => params[key]?.authUserId)
      .filter(Boolean);
    const existing = await readExisting(client, { authUserIds });
    const plan = buildPlan({ ...sources, params, existing, anchor });
    const adopted = plan.provenance.filter((entry) => entry.note?.startsWith("adopted")).length;
    console.log(
      `Plan: ${plan.rows.length} rows to write, ${adopted} existing rows adopted, ${plan.states.size} states, anchor ${anchor}.`,
    );

    if (phase === "manifest")
      return void manifest(plan, sources, option(argv, "out", "showcase-manifest.json"));
    if (phase === "checklists") return void checklists(plan, params, argv);

    if (phase === "preflight") {
      const { problems, notes } = await preflight(client, target, params, sources, plan);
      console.log("");
      for (const note of notes) console.log(note);
      if (problems.length > 0) {
        console.error("\nSTOP. Preflight found:");
        for (const problem of problems) console.error(`  - ${problem}`);
        process.exitCode = 1;
      } else {
        console.log("\nPreflight passed. Nothing was written.");
      }
      return;
    }
    if (phase === "preview") return void (await preview(client, plan));
    if (phase === "load") return void (await load(client, plan));
    if (phase === "report") return void (await report(client, plan));
    if (phase === "verify") {
      const { failed } = await verify(client, plan, params, {
        afterRollback: argv.includes("--after-rollback"),
        wholeDatabase: target.kind === "hosted" || argv.includes("--whole-database"),
      });
      if (failed) {
        console.error("\nSTOP. Verification did not reconcile. Do not hand out the checklists.");
        process.exitCode = 1;
      } else {
        console.log("\nEverything reconciles.");
      }
      return;
    }
    if (phase === "rollback") {
      const { blockers } = await rollback(client, plan, params, {
        force: argv.includes("--force"),
        residuePath: option(argv, "residue", "showcase-rollback-residue.sql"),
      });
      if (blockers.length > 0) process.exitCode = 1;
    }
  } finally {
    await client.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
