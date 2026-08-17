#!/usr/bin/env node
/**
 * The Monday showcase loader — LAN-124. **Owner-run. Brian runs this by hand.**
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
 *     preflight   read-only. Checks the target, the schema, the parameters and
 *                 the workbooks, and writes nothing at all.
 *     preview     read-only. Prints what the load would create and update.
 *     load        writes, in one transaction. Idempotent.
 *     verify      read-only. Counts what is there and checks it reconciles.
 *     manifest    read-only. Writes the source-to-record manifest to a file.
 *     rollback    deletes exactly the rows this loader would create, and
 *                 refuses when rows it did not create are attached to them.
 *
 * Options:
 *
 *     --roster <path>          the Players Databank workbook
 *     --termcard <path>        the Michaelmas term-card workbook
 *     --params <path>          the private parameter file (never committed)
 *     --anchor <YYYY-MM-DD>    the walkthrough date; defaults to 17 Aug 2026
 *     --out <path>             where `manifest` writes
 *     --force                  rollback only: also remove the rows the
 *                              walkthrough itself created
 *     --database-url <url>     a loopback database, for a local rehearsal
 *     --confirm-target <ref>   the hosted project, named out loud
 *
 * A local run needs no confirmation because it cannot reach anything real. A
 * hosted run needs `--confirm-target` *and* `DATABASE_URL`, and both are checked
 * by the same functions the connection smoke test uses.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import {
  connect,
  findAttachedRows,
  newLedger,
  PRESERVED_TABLES,
  readDependencies,
  readExisting,
  ROLLBACK_ORDER,
  upsert,
} from "./showcase/db.mjs";
import { buildPlan } from "./showcase/plan.mjs";
import { readRoster, readTermCard } from "./showcase/sources.mjs";
import { resolveTarget } from "./showcase/target.mjs";
import { readWorkbook } from "./showcase/workbook.mjs";

const PHASES = ["preflight", "preview", "load", "verify", "manifest", "rollback"];

/** Reads `--flag value` out of argv. */
function option(argv, name, fallback = null) {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? fallback : (argv[index + 1] ?? fallback);
}

/**
 * The private parameters: who Brian and Stewart are, and how to reach them.
 *
 * Never committed, never echoed. The file holds real telephone numbers and real
 * Auth user identifiers, so this function reports its *shape* and never its
 * contents — see `describeParameters`.
 */
function readParameters(path) {
  if (!path) {
    throw new Error(
      "No --params file. It carries the Auth user identifiers and the two real " +
        "telephone numbers, and it is the one input that must never be committed. " +
        "See OWNER-RUNBOOK.md § The private parameter file.",
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read --params ${path}: ${error.message}`);
  }

  if (!parsed.brian?.givenName) {
    throw new Error("The parameter file must describe `brian`, who owns every audit trail here.");
  }

  return parsed;
}

/** Says what the parameters contain without saying what any of it is. */
function describeParameters(params) {
  return ["brian", "stewart", "coach"]
    .filter((key) => params[key])
    .map((key) => {
      const person = params[key];
      const has = [
        person.authUserId ? "auth user" : null,
        person.phone ? "telephone number" : null,
        person.roles?.length ? `roles: ${person.roles.join(", ")}` : null,
      ].filter(Boolean);
      return `  ${key}: ${has.length === 0 ? "name only" : has.join(", ")}`;
    })
    .join("\n");
}

/** Loads and parses both workbooks. */
function readSources(argv) {
  const rosterPath = option(argv, "roster");
  const termCardPath = option(argv, "termcard");

  if (!rosterPath || !termCardPath) {
    throw new Error(
      "Both --roster and --termcard are required. They live outside this repository " +
        "and are never committed.",
    );
  }

  const players = readRoster(readWorkbook(rosterPath));
  const termCard = readTermCard(readWorkbook(termCardPath), { year: 2026 });
  return { players, termCard };
}

/**
 * Checks everything that can be checked without writing.
 *
 * Fails closed on each of the four things LAN-124 names: the target, the
 * schema, the private parameters, and the notification allowlist.
 */
async function preflight(client, target, params, sources) {
  const problems = [];
  const notes = [];

  notes.push(`Target: ${target.describe()}`);

  // Schema. Not a migration check — the loader never migrates — but a refusal
  // to write into a shape it does not recognise.
  const tables = await client.query(
    `select table_name from information_schema.tables
      where table_schema = 'public' and table_name = any($1)`,
    [["people", "seasons", "events", "invitations", "season_memberships", "roles"]],
  );
  const found = new Set(tables.rows.map((row) => row.table_name));
  for (const table of [
    "people",
    "seasons",
    "events",
    "invitations",
    "season_memberships",
    "roles",
  ]) {
    if (!found.has(table)) problems.push(`The database has no public.${table}. Migrations first.`);
  }

  // The reference gap LAN-73 recorded: hosted has no roles at all.
  const roles = await client.query("select count(*)::int as count from public.roles");
  notes.push(`Roles already present: ${roles.rows[0].count}`);

  const seasons = await client.query(
    "select label, status from public.seasons order by created_at",
  );
  notes.push(
    seasons.rowCount === 0
      ? "Seasons already present: none"
      : `Seasons already present: ${seasons.rows.map((row) => `${row.label} (${row.status})`).join(", ")}`,
  );

  // Parameters.
  notes.push(`Parameters supplied:\n${describeParameters(params)}`);
  if (!params.brian?.authUserId) {
    notes.push(
      "  note: brian has no authUserId, so no operator account will be linked. " +
        "Create the Auth user in Supabase first if you intend to sign in as him.",
    );
  }

  // Durable identities. The manifest binds the loader to inventorying rather
  // than duplicating these, so preflight says out loud what is already there —
  // "Preflight passed. Nothing was written." must not be the last thing Brian
  // reads before a load discovers an existing link and aborts.
  const authUserIds = ["brian", "stewart", "coach"]
    .map((key) => params[key]?.authUserId)
    .filter(Boolean);

  if (authUserIds.length === 0) {
    notes.push(
      "No authUserId supplied for anybody. Nobody will be able to sign in, and no " +
        "operator account will be created or adopted.",
    );
  } else {
    const linked = await client.query(
      `select oa.auth_user_id, oa.is_active, p.given_name, p.family_name
         from public.operator_accounts oa
         join public.people p on p.id = oa.person_id
        where oa.auth_user_id = any($1)`,
      [authUserIds],
    );

    notes.push(
      `Durable identities: ${linked.rowCount} of ${authUserIds.length} supplied Auth ` +
        "users already resolve to a Person. Those are adopted, not duplicated.",
    );

    for (const row of linked.rows) {
      const key = ["brian", "stewart", "coach"].find(
        (candidate) => params[candidate]?.authUserId === row.auth_user_id,
      );
      const supplied = `${params[key].givenName} ${params[key].familyName ?? ""}`.trim();
      const actual = `${row.given_name} ${row.family_name ?? ""}`.trim();
      if (supplied.toLowerCase() !== actual.toLowerCase()) {
        problems.push(
          `The Auth user supplied as \`${key}\` is already linked to a different ` +
            "Person than the parameters describe. Resolve that by hand before loading — " +
            "the loader will not repoint somebody's login.",
        );
      }
      if (!row.is_active) {
        problems.push(
          `The operator account for \`${key}\` exists but is deactivated. Reactivate it ` +
            "in the database before loading; the loader does not.",
        );
      }
    }
  }

  // The notification allowlist. The loader does not send anything, but it
  // creates the rows an operator can then act on, so an unsafe allowlist is a
  // reason to stop before loading rather than after.
  const allowlist = (process.env.DELIVERY_RECIPIENT_ALLOWLIST ?? "").trim();
  if (allowlist === "") {
    notes.push(
      "DELIVERY_RECIPIENT_ALLOWLIST is not set in this shell. That is fine for the " +
        "loader, which sends nothing — but the deployed application will send to " +
        "nobody until it is set there.",
    );
  } else {
    const entries = allowlist.split(/[,;\n]+/).filter((entry) => entry.trim() !== "").length;
    notes.push(`DELIVERY_RECIPIENT_ALLOWLIST names ${entries} recipient(s) in this shell.`);
  }

  // Sources.
  notes.push(`Roster: ${sources.players.length} players`);
  notes.push(`Term card: ${sources.termCard.length} entries`);
  if (sources.players.length === 0) problems.push("The roster workbook produced no players.");
  if (sources.termCard.length === 0) problems.push("The term-card workbook produced no entries.");

  const future = sources.termCard.filter((entry) => entry.scheduledOn <= "2026-08-17");
  if (future.length > 0) {
    problems.push(
      `${future.length} term-card entries are not in the future. Check the year: the ` +
        "loader dates events from the week labels, and a wrong year is the usual cause.",
    );
  }

  return { problems, notes };
}

/** Prints the plan without writing it. */
async function preview(client, plan) {
  const ledger = newLedger();
  for (const row of plan.rows) {
    await upsert(client, ledger, row.table, row.columns, { dryRun: true });
  }

  const byTable = new Map();
  for (const row of plan.rows) {
    byTable.set(row.table, (byTable.get(row.table) ?? 0) + 1);
  }

  console.log("\nProposed rows, by table:");
  for (const [table, count] of [...byTable].sort()) {
    console.log(`  ${String(count).padStart(5)}  ${table}`);
  }
  console.log(`\n  create: ${ledger.created}   update: ${ledger.updated}`);
  console.log(
    "\nNothing was written. `update` means the loader already owns that identifier — " +
      "rerunning converges rather than duplicating.",
  );
  return ledger;
}

/** Writes the plan, in one transaction. */
async function load(client, plan) {
  const ledger = newLedger();
  await client.query("begin");
  try {
    for (const row of plan.rows) {
      await upsert(client, ledger, row.table, row.columns);
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }

  console.log(
    `\nCreated ${ledger.created}, updated ${ledger.updated}, skipped ${ledger.skipped}. ` +
      "Nothing else was touched.",
  );
  if (ledger.skipped > 0) {
    console.log(
      "  Skipped rows are append-only — an answer, an availability record, an operator " +
        "link. They were already there and this loader may not rewrite them.",
    );
  }
  return ledger;
}

/**
 * Counts what is there, and checks it reconciles.
 *
 * Fails closed: a non-zero exit means do not proceed with the walkthrough.
 */
async function verify(client, plan) {
  const checks = [];
  const check = (label, actual, expected) =>
    checks.push({ label, actual, expected, ok: actual === expected });

  const count = async (sql, values = []) => Number((await client.query(sql, values)).rows[0].count);

  /**
   * The identifiers the plan owns, by table.
   *
   * Everything below counts *these*, never "every row in the season". The
   * showcase can share a season with rows it did not write — the local rehearsal
   * does exactly that, adopting the seeded season — and a verifier that counted
   * the season would report a failure that is really somebody else's data. Worse,
   * on hosted it would quietly pass by counting rows the loader is not
   * responsible for.
   */
  const owned = new Map();
  for (const row of plan.rows) {
    if (!owned.has(row.table)) owned.set(row.table, []);
    owned.get(row.table).push(row.columns.id);
  }
  const ids = (table) => owned.get(table) ?? [];

  const present = async (table) =>
    count(`select count(*)::int as count from ${table} where id = any($1)`, [ids(table)]);

  for (const table of [
    "public.people",
    "public.season_memberships",
    "public.events",
    "public.event_audience_members",
    "public.invitations",
    "public.rsvp_responses",
    "public.attendance_records",
    "public.availability_statuses",
    "public.onboarding_items",
    "public.position_assignments",
    "public.recruitment_prospects",
  ]) {
    check(`${table.replace("public.", "")} written`, await present(table), ids(table).length);
  }

  // Both seasons of membership for every source player, which is the roster
  // criterion LAN-124 states.
  const players = plan.context.memberships.length;
  check(
    "every source player has a current membership",
    await count(
      `select count(*)::int as count from public.season_memberships
        where season_id = $1 and person_id = any($2)`,
      [plan.context.seasonId, plan.context.memberships.map((entry) => entry.player.personId)],
    ),
    players,
  );
  check(
    "every source player has an archived membership",
    await count(
      `select count(*)::int as count from public.season_memberships
        where season_id = $1 and person_id = any($2)`,
      [
        plan.context.archivedSeasonId,
        plan.context.memberships.map((entry) => entry.player.personId),
      ],
    ),
    players,
  );

  // The refusals. These are the ones that stop a walkthrough.
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
      `select count(*)::int as count from public.event_audience_members where event_id = any($1)`,
      [termCardIds],
    ),
    0,
  );

  // Nothing the loader wrote may be deliverable. Only the walkthrough itself,
  // performed by a human afterwards, creates a job or a live link.
  check(
    "notification jobs against showcase invitations (0 expected)",
    await count(
      `select count(*)::int as count from public.notification_jobs where invitation_id = any($1)`,
      [ids("public.invitations")],
    ),
    0,
  );

  check(
    "live RSVP tokens against showcase invitations (0 expected)",
    await count(
      `select count(*)::int as count from public.rsvp_access_tokens
        where invitation_id = any($1) and revoked_at is null and expires_at > now()`,
      [ids("public.invitations")],
    ),
    0,
  );

  // Cross-page parity: every answer belongs to an invitation the loader wrote,
  // and every register entry to an event it wrote.
  check(
    "answers whose invitation is missing (0 expected)",
    await count(
      `select count(*)::int as count from public.rsvp_responses r
        where r.id = any($1)
          and not exists (select 1 from public.invitations i where i.id = r.invitation_id)`,
      [ids("public.rsvp_responses")],
    ),
    0,
  );

  console.log("");
  let failed = false;
  for (const entry of checks) {
    if (!entry.ok) failed = true;
    console.log(
      `${entry.ok ? "PASS" : "FAIL"}  ${entry.label}: ${entry.actual}` +
        (entry.ok ? "" : ` (expected ${entry.expected})`),
    );
  }

  return { checks, failed };
}

/** Writes the source-to-record manifest. */
function manifest(plan, path) {
  const document = {
    issue: "LAN-124",
    anchor: plan.context.anchor,
    generatedFrom: {
      roster: "OULAFC Master Table.xlsx / Players Databank",
      termCard: "260720 OULAFC MT26 Term Card v0.xlsx",
    },
    counts: {
      total: plan.provenance.length,
      sourceDerived: plan.provenance.filter((entry) => entry.classification === "source-derived")
        .length,
      illustrative: plan.provenance.filter((entry) => entry.classification === "illustrative")
        .length,
    },
    // Deliberately no names and no telephone numbers: this file records which
    // cell produced which row identifier, which is provenance, not personal
    // data. It is safe to keep and safe to show.
    records: plan.provenance,
  };

  writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`);
  console.log(
    `\nWrote ${document.counts.total} provenance records to ${path} ` +
      `(${document.counts.sourceDerived} source-derived, ${document.counts.illustrative} illustrative).`,
  );
  return document;
}

/**
 * Deletes exactly what the loader would create.
 *
 * Every statement names identifiers computed from the plan. There is no pattern
 * match anywhere, which is why this cannot remove a row it did not write.
 */
async function rollback(client, plan, { force = false } = {}) {
  /**
   * Tables `--force` discovered that `ROLLBACK_ORDER` does not name.
   *
   * Deleted before the fixed order, and in the order the walk produced —
   * `findAttachedRows` already returns deepest-first, so reversing it here
   * inverted the ordering it had just computed. Local rather than module-level,
   * so a second `rollback` in one process cannot accumulate or re-flip it.
   */
  const discovered = [];

  const byTable = new Map();
  for (const row of plan.rows) {
    if (!byTable.has(row.table)) byTable.set(row.table, []);
    byTable.get(row.table).push(row.columns.id);
  }

  // Refuse before deleting, rather than aborting on a constraint name.
  //
  // After the walkthrough this is the normal case, not an edge: approving an
  // event mints a token and queues a job, an answer writes a response, and
  // pressing Show report writes a report and an audit row against the showcase
  // person. Some of those foreign keys restrict — the delete would fail and
  // remove nothing — and some cascade, where it would silently remove rows the
  // loader never created. Both are reasons to stop and say so.
  //
  // What is attached is discovered from `pg_constraint` and followed
  // transitively, not read off a list. See `readDependencies`.
  const dependencies = await readDependencies(client);
  const { blockers, attached } = await findAttachedRows(client, byTable, dependencies);

  if (blockers.length > 0 && !force) {
    console.error("\nSTOP. Rows this loader did not create are attached to rows it did:\n");
    for (const blocker of blockers) {
      console.error(
        `  ${String(blocker.count).padStart(5)}  ${blocker.table}.${blocker.column} ` +
          `→ ${blocker.target}   (for example ${blocker.sample})`,
      );
    }
    console.error(
      "\nNothing was deleted. This is what the walkthrough itself produces — an " +
        "approval, a message, an answer, a generated report — and removing the showcase " +
        "underneath it would either fail halfway or take those rows with it.\n" +
        "\nSee OWNER-RUNBOOK.md § 11. Once you have kept whatever evidence you want " +
        "from those rows, re-run with --force to remove them along with the showcase.",
    );
    return { removed: 0, blockers };
  }

  if (blockers.length > 0) {
    const preservedBlockers = blockers.filter((b) => PRESERVED_TABLES.includes(b.table));
    const removable = attached.filter(([table]) => !PRESERVED_TABLES.includes(table));

    console.log(
      `\n--force: removing ${removable.reduce((total, [, ids]) => total + ids.length, 0)} ` +
        "attached rows the walkthrough created, as well as the showcase.",
    );

    if (preservedBlockers.length > 0) {
      // Not an omission. `audit_events` is append-only and invariant M2 requires
      // an actor named by history to stay resolvable, so a row an audit entry
      // names cannot be removed at all. Everything else still goes.
      console.log(
        "\nKept, and so is whatever they point at:\n" +
          preservedBlockers
            .map((b) => `  ${String(b.count).padStart(5)}  ${b.table}.${b.column} → ${b.target}`)
            .join("\n") +
          "\n  History that can be deleted to tidy up is not history.",
      );

      // A row an audit entry names cannot be deleted either, so it comes out of
      // the plan rather than being attempted and failing.
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

    // Deepest first, so a child is gone before its parent is attempted.
    for (const [table, ids] of removable) {
      byTable.set(table, [...new Set([...(byTable.get(table) ?? []), ...ids])]);
    }
    for (const [table] of removable) {
      if (!ROLLBACK_ORDER.includes(table)) discovered.push(table);
    }
  }

  let removed = 0;
  await client.query("begin");
  try {
    for (const table of [...discovered, ...ROLLBACK_ORDER]) {
      const ids = byTable.get(table);
      if (!ids || ids.length === 0) continue;
      const result = await client.query(`delete from ${table} where id = any($1)`, [ids]);
      if (result.rowCount > 0) {
        console.log(`  ${String(result.rowCount).padStart(5)}  ${table}`);
        removed += result.rowCount;
      }
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }

  console.log(
    `\nRemoved ${removed} rows. Approved identities the loader adopted rather than ` +
      "created are untouched.",
  );
  return { removed, blockers: [] };
}

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
  const anchor = option(argv, "anchor", "2026-08-17");

  console.log(`\nShowcase ${phase} — ${target.describe()}`);

  const client = await connect(target);
  try {
    // Read before planning. The plan adopts whatever reference data is already
    // present rather than inserting a competing copy, so it is a pure function
    // of (workbooks, parameters, what is there) — and the preview stays honest
    // because it is built from exactly the same three things as the load.
    const authUserIds = ["brian", "stewart", "coach"]
      .map((key) => params[key]?.authUserId)
      .filter(Boolean);
    const existing = await readExisting(client, { authUserIds });
    const plan = buildPlan({ ...sources, params, existing, anchor });

    const adopted = plan.provenance.filter((entry) => entry.note?.startsWith("adopted")).length;
    console.log(
      `Plan: ${plan.rows.length} rows to write, ${adopted} existing rows adopted, ` +
        `${plan.provenance.length} provenance records.`,
    );

    if (phase === "manifest") {
      manifest(plan, option(argv, "out", "showcase-manifest.json"));
      return;
    }

    if (phase === "preflight") {
      const { problems, notes } = await preflight(client, target, params, sources);
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

    if (phase === "preview") {
      await preview(client, plan);
      return;
    }

    if (phase === "load") {
      await load(client, plan);
      return;
    }

    if (phase === "verify") {
      const { failed } = await verify(client, plan);
      if (failed) {
        console.error("\nSTOP. Verification did not reconcile. Do not run the walkthrough.");
        process.exitCode = 1;
      } else {
        console.log("\nEverything reconciles.");
      }
      return;
    }

    if (phase === "rollback") {
      const { blockers } = await rollback(client, plan, { force: argv.includes("--force") });
      if (blockers.length > 0) process.exitCode = 1;
    }
  } finally {
    await client.end();
  }
}

// Only when run directly, mirroring `connection-smoke-test.mjs`. Importing this
// module — which a test does — must never open a connection or write anything.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
