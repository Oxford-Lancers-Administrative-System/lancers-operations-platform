/**
 * The showcase loader's database access — LAN-124.
 *
 * Deliberately small. Everything the loader writes goes through `upsert`, which
 * is `insert … on conflict (id) do update`, because every identifier is
 * deterministic (see `ids.mjs`) and rerunning has to converge on the same rows
 * rather than produce a second set.
 *
 * `pg` is already a dependency of the application, so nothing new is installed.
 */

import pg from "pg";

/** Opens a client against the resolved target. Never logs the string. */
export async function connect(target, env = process.env) {
  const client = new pg.Client({ connectionString: target.connectionString });
  await client.connect();
  // A local rehearsal can run as the role hosted connects as, so the grants —
  // and above all the tables that role may not delete from — are exercised
  // before anybody points the loader at production. Local only: the hosted
  // connection is already that role, and a superuser is the one thing that
  // could make this lie.
  if (env.SHOWCASE_SET_ROLE && target.kind === "local") {
    if (!/^[a-z_]+$/.test(env.SHOWCASE_SET_ROLE)) {
      throw new Error("SHOWCASE_SET_ROLE must be a plain role name.");
    }
    await client.query(`set role ${env.SHOWCASE_SET_ROLE}`);
  }
  return client;
}

/**
 * Reads the reference data that already exists, keyed the way the club names it.
 *
 * The loader cannot simply insert its own roles, seasons and terms. Those
 * tables have natural unique keys — `roles.code`, `terms (name, academic_year)`,
 * `seasons.label` — and `committee_years` carries an exclusion constraint that
 * refuses two overlapping years outright. A loader that ignored what was there
 * would fail on a machine that had ever run the local seed, and worse, would
 * create a *second* committee year in hosted the day somebody adds a first.
 *
 * So the plan adopts what exists and creates only what does not. This function
 * is the only read the loader does before planning, and its result is passed
 * into `buildPlan` as an argument — which keeps the plan a pure function of
 * (workbooks, parameters, what is already there) and keeps the preview honest.
 */
export async function readExisting(client, { authUserIds = [] } = {}) {
  const map = async (sql, keyOf) => {
    const result = await client.query(sql);
    return new Map(result.rows.map((row) => [keyOf(row), row.id]));
  };

  // The durable identities. `docs/pilot-data-manifest.md` is explicit that
  // Brian's existing hosted Auth user, Person and operator link are
  // "inventoried, not duplicated. The first provisioning action is to look, not
  // to insert." A second `people` row for somebody who already has one is
  // invariant I1's failure mode and is undone by an audited merge, not a delete.
  //
  // Keyed on the Auth user identifier because that is the only thing that
  // identifies the same human across a name change — and because
  // `operator_accounts_auth_user_key` is a unique constraint the loader's
  // `on conflict (id)` clause does not cover, so an unnoticed existing link
  // aborts the whole load after preflight has said it would not.
  const operators = new Map();
  if (authUserIds.length > 0) {
    const linked = await client.query(
      `select oa.id as operator_account_id, oa.auth_user_id, oa.person_id, oa.is_active
         from public.operator_accounts oa
        where oa.auth_user_id = any($1)`,
      [authUserIds],
    );
    for (const row of linked.rows) {
      operators.set(row.auth_user_id, {
        operatorAccountId: row.operator_account_id,
        personId: row.person_id,
        isActive: row.is_active,
      });
    }
  }

  // Currently effective holders of every seat, keyed by role code. A seat the
  // catalogue makes single-holder or a constitutional office refuses a second
  // overlapping assignment outright (`role_assignments_one_holder_per_office`),
  // so a loader that always inserted would abort on any database where LAN-138's
  // bootstrap has already seated Clint, Stewart or Brian. The plan adopts a seat
  // the named person already holds and declines one somebody else holds.
  const assignments = new Map();
  const held = await client.query(
    `select ra.id, ra.person_id, r.code
       from public.role_assignments ra
       join public.roles r on r.id = ra.role_id
      where ra.effective_from <= current_date
        and (ra.effective_to is null or ra.effective_to > current_date)`,
  );
  for (const row of held.rows) {
    if (!assignments.has(row.code)) assignments.set(row.code, []);
    assignments.get(row.code).push({ id: row.id, personId: row.person_id });
  }

  // Reference rows the migrations own and the loader may only read.
  const schedules = await client.query("select * from public.messaging_schedules");
  const agreementVersions = await client.query(
    `select distinct on (agreement_type) id, agreement_type::text as agreement_type
       from public.onboarding_agreement_versions
      order by agreement_type, effective_from desc`,
  );
  const chase = await client.query(
    "select first_chase_after_hours, chase_count, chase_interval_days from public.onboarding_chase_settings",
  );

  return {
    operators,
    assignments,
    messagingSchedules: new Map(schedules.rows.map((row) => [row.event_type, row])),
    agreementVersions: new Map(agreementVersions.rows.map((row) => [row.agreement_type, row.id])),
    chaseSettings: chase.rows[0] ?? null,
    // Whole rows, not just identifiers: since LAN-128 the catalogue is created
    // by migration and the loader adopts it outright, so an assignment needs
    // the seat's scope and both cardinality facts to be truthful about the
    // role it names.
    roles: new Map(
      (
        await client.query(
          `select id, code, scope, is_constitutional_office, is_single_holder_seat
             from public.roles`,
        )
      ).rows.map((row) => [row.code, row]),
    ),
    // Seasons carry their own position vocabulary, and
    // `position_assignments_vocabulary_is_the_seasons` enforces that an
    // assignment uses it. So an adopted season brings its vocabulary with it and
    // the loader has to follow, rather than imposing the one it would have made.
    seasons: new Map(
      (await client.query("select id, label, position_vocabulary_id from public.seasons")).rows.map(
        (row) => [
          normaliseLabel(row.label),
          { id: row.id, vocabularyId: row.position_vocabulary_id },
        ],
      ),
    ),
    terms: await map(
      "select id, name::text as name, academic_year from public.terms",
      (row) => `${row.name}:${normaliseLabel(row.academic_year)}`,
    ),
    vocabularies: await map("select id, code from public.position_vocabularies", (row) => row.code),
    // Keyed by vocabulary *identifier*, not its code: the season names the
    // vocabulary, and two vocabularies can carry the same position code.
    positions: await map(
      "select id, code, vocabulary_id from public.positions",
      (row) => `${row.vocabulary_id}:${row.code}`,
    ),
    onboardingTypes: await map(
      "select id, season_id, code from public.onboarding_item_types",
      (row) => `${row.season_id}:${row.code}`,
    ),
    // Any committee year still open. The exclusion constraint means at most one
    // can overlap the showcase, so the first is the one to adopt.
    openCommitteeYear:
      (
        await client.query(
          "select id from public.committee_years where ends_on is null order by starts_on limit 1",
        )
      ).rows[0]?.id ?? null,
  };
}

/**
 * Treats `2025–26` and `2025-26` as the same label.
 *
 * The club writes season and academic-year labels with an en dash in some
 * places and a hyphen in others, and the seed and this loader disagreed. A
 * loader that read them as different labels would create a duplicate season,
 * which is the one reference row everything else hangs off.
 */
export function normaliseLabel(label) {
  return String(label).replace(/[–—]/g, "-").trim();
}

/**
 * Records what a run did, so the CLI can print a summary and the manifest can
 * be written without every phase threading a counter through itself.
 */
export function newLedger() {
  return {
    created: 0,
    updated: 0,
    skipped: 0,
    /** Every row this run owns, in insertion order, for rollback. */
    rows: [],
    /** Provenance entries, for the manifest. */
    provenance: [],
  };
}

/**
 * Tables the loader may insert into but must never rewrite.
 *
 * These are append-only by decision, and the hosted runtime role is granted
 * `INSERT` on them and no `UPDATE`. An RSVP answer, an availability record, a
 * delivery result, a status-history row, an audit row: history that the
 * application is not allowed to rewrite, and neither is this.
 *
 * That matters here because `on conflict (id) do update` requires the `UPDATE`
 * privilege *even when nothing conflicts*, so the ordinary upsert was refused
 * outright against production. These tables therefore take `do nothing`, which
 * needs only `INSERT`.
 *
 * The behaviour that costs is rerunning: a second load leaves an existing row
 * as it found it rather than rewriting it to the planned value. For append-only
 * data that is the more correct answer anyway.
 *
 * Discovered by running the load against the hosted project on 17 August 2026 —
 * it failed on `availability_statuses`, in a transaction, having written
 * nothing. LAN-221 widened the list to every table the migrations grant without
 * `UPDATE`; `tests/showcase-loader.test.ts` pins it against the catalogue.
 */
export const APPEND_ONLY_TABLES = Object.freeze([
  "public.audit_events",
  "public.availability_statuses",
  "public.delivery_callbacks",
  "public.delivery_results",
  "public.onboarding_activity_log",
  "public.onboarding_agreement_versions",
  "public.onboarding_agreements",
  "public.onboarding_item_history",
  "public.operator_accounts",
  "public.recruitment_prospect_notes",
  "public.recruitment_prospect_status_events",
  "public.rsvp_responses",
  "public.schedule_changes",
  "public.season_membership_status_events",
  "public.weekly_reports",
]);

/**
 * Tables the hosted runtime role cannot delete from at all.
 *
 * The application's login is granted `select, insert` on these and no `delete`,
 * deliberately, so that "correct an answer" or "tidy the history" can never be
 * implemented as a delete. The loader connects as that same login and inherits
 * the refusal — which means `rollback` on hosted cannot remove the rows it
 * wrote into them.
 *
 * Rather than fail halfway, `rollback` checks the privilege it actually holds,
 * deletes what it may, and writes the remainder to a residue file as exact
 * `delete … where id in (…)` statements — identifiers only, no names — for
 * Brian to run as the database owner. Locally, where the tests connect as the
 * owner, the same rollback removes everything and the residue file is empty,
 * which is how the test proves the statements are the right ones.
 */
export const NO_DELETE_TABLES = Object.freeze([
  "public.audit_events",
  "public.availability_statuses",
  "public.bps_selections",
  "public.club_link_tokens",
  "public.delivery_attempts",
  "public.delivery_callbacks",
  "public.delivery_results",
  "public.event_messaging_plans",
  "public.nonresponse_flags",
  "public.onboarding_activity_log",
  "public.onboarding_agreement_versions",
  "public.onboarding_agreements",
  "public.onboarding_item_history",
  "public.operator_accounts",
  "public.person_access_tokens",
  "public.person_fact_disputes",
  "public.recruitment_prospect_notes",
  "public.recruitment_prospect_status_events",
  "public.recruitment_questionnaire_responses",
  "public.recruitment_signup_codes",
  "public.rsvp_access_tokens",
  "public.rsvp_responses",
  "public.schedule_changes",
  "public.season_membership_status_events",
  "public.season_messaging_consents",
  "public.weekly_reports",
]);

/**
 * Which of `INSERT` / `UPDATE` / `DELETE` the connected role really holds on
 * each table, from the catalogue rather than from the two lists above.
 *
 * Preflight uses it to refuse a load the target would abort partway, and
 * rollback uses it to decide what it can delete itself and what it has to
 * hand to a human as residue SQL.
 */
export async function readPrivileges(client, tables) {
  const result = await client.query(
    `select t as "table",
            has_table_privilege(current_user, t, 'INSERT') as can_insert,
            has_table_privilege(current_user, t, 'UPDATE') as can_update,
            has_table_privilege(current_user, t, 'DELETE') as can_delete
       from unnest($1::text[]) as t`,
    [tables],
  );
  return new Map(
    result.rows.map((row) => [
      row.table,
      { insert: row.can_insert, update: row.can_update, delete: row.can_delete },
    ]),
  );
}

/**
 * Inserts a row, or updates it if the loader already owns that identifier.
 *
 * `columns` is a plain object. The primary key must be `id`, and must be one of
 * the deterministic identifiers — a random one would make the run
 * non-idempotent, which `dryRun` cannot detect and a second run would.
 *
 * Append-only tables take `do nothing` instead — see `APPEND_ONLY_TABLES`.
 */
export async function upsert(client, ledger, table, columns, { dryRun = false } = {}) {
  const keys = Object.keys(columns);
  if (!keys.includes("id")) {
    throw new Error(`Refusing to write ${table} without a deterministic id.`);
  }

  ledger.rows.push({ table, id: columns.id });

  if (dryRun) {
    // A preview must not open a transaction that writes, so existence is read
    // rather than inferred. This is the only place the loader reads to decide.
    const existing = await client.query(`select 1 from ${table} where id = $1`, [columns.id]);
    if (existing.rowCount > 0) ledger.updated += 1;
    else ledger.created += 1;
    return { id: columns.id, action: existing.rowCount > 0 ? "update" : "create" };
  }

  const updatable = keys.filter((key) => key !== "id");
  const placeholders = keys.map((_, index) => `$${index + 1}`);
  const appendOnly = APPEND_ONLY_TABLES.includes(table);

  const conflict = appendOnly
    ? "do nothing"
    : `do update set ${updatable.map((key) => `${key} = excluded.${key}`).join(", ")}`;

  const result = await client.query(
    `insert into ${table} (${keys.join(", ")})
     values (${placeholders.join(", ")})
     on conflict (id) ${conflict}
     returning (xmax = 0) as inserted`,
    keys.map((key) => columns[key]),
  );

  // `do nothing` returns no row at all when it skips, which is how a skip is
  // told apart from a write. `do update` always returns one, and `xmax = 0`
  // distinguishes the insert from the update.
  if (result.rowCount === 0) {
    ledger.skipped += 1;
    return { id: columns.id, action: "skip" };
  }

  const inserted = result.rows[0]?.inserted === true;
  if (inserted) ledger.created += 1;
  else ledger.updated += 1;

  return { id: columns.id, action: inserted ? "create" : "update" };
}

/**
 * Writes a whole plan, table by table in foreign-key order, in batches.
 *
 * LAN-124 wrote one row per statement, which was fine for a thousand rows and
 * is not for twenty-two thousand over a pooled hosted connection. The plan's
 * rows are grouped by table, the tables are ordered so that every parent is
 * written before its children — the order is computed from `pg_constraint`
 * rather than assumed, with the plan's own first-appearance order as the
 * tie-break — and each table is written in multi-row statements.
 *
 * Within a table the plan's order is kept, which is what self-references
 * (`season_memberships.carried_forward_from_id`, `people.merged_into_person_id`)
 * rely on. `rsvp_access_tokens.superseded_by_token_id` is deferrable and is
 * checked at commit.
 *
 * `dryRun` reads existence instead of writing, so `preview` stays honest.
 */
export async function writePlan(client, ledger, plan, { dryRun = false } = {}) {
  const tables = [];
  const rowsByTable = new Map();
  for (const row of plan.rows) {
    if (!rowsByTable.has(row.table)) {
      rowsByTable.set(row.table, []);
      tables.push(row.table);
    }
    rowsByTable.get(row.table).push(row.columns);
  }

  const dependencies = await readDependencies(client);
  const parentsOf = new Map(tables.map((table) => [table, new Set()]));
  for (const [parent, edges] of dependencies) {
    for (const edge of edges) {
      if (edge.child !== parent && parentsOf.has(edge.child) && parentsOf.has(parent)) {
        parentsOf.get(edge.child).add(parent);
      }
    }
  }
  // Kahn's algorithm, first appearance breaking ties, so the order is stable.
  const ordered = [];
  const done = new Set();
  while (ordered.length < tables.length) {
    const next = tables.find(
      (table) => !done.has(table) && [...parentsOf.get(table)].every((parent) => done.has(parent)),
    );
    if (!next) {
      throw new Error(
        "The plan's tables form a cycle in the foreign-key graph: " +
          tables.filter((table) => !done.has(table)).join(", "),
      );
    }
    ordered.push(next);
    done.add(next);
  }

  for (const table of ordered) {
    const rows = rowsByTable.get(table);
    const appendOnly = APPEND_ONLY_TABLES.includes(table);
    // Rows of one table can carry different column sets; group by signature.
    const groups = new Map();
    for (const columns of rows) {
      const signature = Object.keys(columns).join(",");
      if (!groups.has(signature)) groups.set(signature, []);
      groups.get(signature).push(columns);
    }
    for (const [signature, group] of groups) {
      const keys = signature.split(",");
      if (!keys.includes("id"))
        throw new Error(`Refusing to write ${table} without a deterministic id.`);
      const chunkSize = Math.max(1, Math.floor(20000 / keys.length));
      for (let start = 0; start < group.length; start += chunkSize) {
        const chunk = group.slice(start, start + chunkSize);
        for (const columns of chunk) ledger.rows.push({ table, id: columns.id });

        if (dryRun) {
          const existing = await client.query(`select id from ${table} where id = any($1)`, [
            chunk.map((columns) => columns.id),
          ]);
          ledger.updated += existing.rowCount;
          ledger.created += chunk.length - existing.rowCount;
          continue;
        }

        const values = [];
        const placeholders = chunk.map((columns, rowIndex) => {
          const cells = keys.map((key, keyIndex) => {
            values.push(columns[key]);
            return `$${rowIndex * keys.length + keyIndex + 1}`;
          });
          return `(${cells.join(", ")})`;
        });
        const updatable = keys.filter((key) => key !== "id");
        const conflict = appendOnly
          ? "do nothing"
          : `do update set ${updatable.map((key) => `${key} = excluded.${key}`).join(", ")}`;
        const result = await client.query(
          `insert into ${table} (${keys.join(", ")})
           values ${placeholders.join(",\n")}
           on conflict (id) ${conflict}
           returning (xmax = 0) as inserted`,
          values,
        );
        const inserted = result.rows.filter((row) => row.inserted === true).length;
        ledger.created += inserted;
        ledger.updated += result.rowCount - inserted;
        ledger.skipped += chunk.length - result.rowCount;
      }
    }
  }
  return ordered;
}

/**
 * Deletes every row the loader owns, youngest dependency first.
 *
 * The order is explicit rather than derived from the ledger: a rollback has to
 * work from a manifest written by an earlier run, on a different machine, so it
 * cannot depend on the order this process happened to insert things.
 *
 * Nothing here deletes by pattern. Every statement names identifiers the loader
 * computed, which is why it cannot remove a row it did not create.
 */
/**
 * Tables `--force` must never delete from.
 *
 * `audit_events` is append-only at the privilege level, and invariant M2 says an
 * actor referenced by history has to stay resolvable. So a Person named by an
 * audit row cannot be removed at all — not even with `--force`. That is a limit
 * rather than an omission: history that can be deleted to tidy up is not
 * history. Rollback keeps that Person, says so, and removes everything else.
 */
export const PRESERVED_TABLES = Object.freeze(["public.audit_events"]);

/**
 * Every foreign key in `public` that points at another table's `id`.
 *
 * Read from `pg_constraint` rather than written down. The first version of this
 * was a hand-written list of fourteen table/column pairs compiled by reading the
 * migrations; independent review enumerated the catalog and found **fifty-five**
 * single-column foreign keys into loader-owned tables that the list did not
 * have, plus composite keys its query shape could not express at all.
 *
 * The lesson is not "the list was short". It is that a list like that cannot be
 * kept complete — it was wrong the day it was written, and every future
 * migration would make it quietly wronger. The database already knows the
 * answer, so it is asked.
 *
 * Composite keys are included through their `id` component. That over-reports
 * rather than under-reports, which is the safe direction: the consequence is a
 * refusal naming one row too many, never a delete taking one row too many.
 *
 * Two bounds, both learned the same way. The walk stays inside `public`, so it
 * cannot follow an edge into the import staging area and delete provenance that
 * belongs to neither the loader nor the walkthrough. And it ignores `SET NULL`
 * and `SET DEFAULT` edges, because PostgreSQL resolves those by rewriting the
 * child rather than refusing the parent — an edge that cannot block a delete has
 * no business appearing in a refusal.
 */
export async function readDependencies(client) {
  const result = await client.query(
    `select
        child_ns.nspname  || '.' || child.relname  as child,
        child_att.attname                          as child_column,
        parent_ns.nspname || '.' || parent.relname as parent,
        con.confdeltype                            as on_delete
       from pg_constraint con
       join pg_class child        on child.oid = con.conrelid
       join pg_namespace child_ns on child_ns.oid = child.relnamespace
       join pg_class parent        on parent.oid = con.confrelid
       join pg_namespace parent_ns on parent_ns.oid = parent.relnamespace
       join lateral unnest(con.conkey)  with ordinality as ck(attnum, ord) on true
       join lateral unnest(con.confkey) with ordinality as fk(attnum, ord)
              on fk.ord = ck.ord
       join pg_attribute child_att
              on child_att.attrelid = con.conrelid and child_att.attnum = ck.attnum
       join pg_attribute parent_att
              on parent_att.attrelid = con.confrelid and parent_att.attnum = fk.attnum
      where con.contype = 'f'
        and parent_ns.nspname = 'public'
        -- The child too, not only the parent. Without this the walk followed
        -- staging.legacy_roster_rows.matched_person_id into the import staging
        -- area: it refused a rollback over a row the walkthrough never produced,
        -- and --force then deleted a legacy-import provenance row. Bounding the
        -- parent alone bounds nothing.
        and child_ns.nspname = 'public'
        -- Only edges that can actually block a delete. n is SET NULL and d is
        -- SET DEFAULT: PostgreSQL resolves both by rewriting the child and
        -- letting the delete through, so reporting one is a false refusal, and
        -- --force resolving it by deleting the child is strictly worse than
        -- what the constraint asked for.
        and con.confdeltype not in ('n', 'd')
        and parent_att.attname = 'id'`,
  );

  const byParent = new Map();
  for (const row of result.rows) {
    if (!byParent.has(row.parent)) byParent.set(row.parent, []);
    byParent.get(row.parent).push({
      child: row.child,
      column: row.child_column,
      onDelete: row.on_delete,
    });
  }
  return byParent;
}

/**
 * Rows the loader does not own that are attached to rows it does — transitively.
 *
 * Breadth-first, because attachment is transitive and one pass is not enough: an
 * invitation the application created has its own notification job, which has its
 * own delivery attempt. The first version walked a hand-ordered list once and
 * collected that invitation *after* it had already looked for the invitation's
 * children, so the children were never found and the delete aborted anyway.
 *
 * Returns `{ blockers, attached }` — `blockers` for the refusal message, one
 * entry per table and column with a count and a sample; `attached` mapping table
 * to the identifiers `--force` has to delete, deepest first.
 */
/** Does this `schema.table` carry a column literally called `id`? Cached. */
const ID_COLUMN_CACHE = new Map();

async function hasIdColumn(client, qualified) {
  const cached = ID_COLUMN_CACHE.get(qualified);
  if (cached !== undefined) return cached;

  const [schema, table] = qualified.includes(".") ? qualified.split(".") : ["public", qualified];
  const result = await client.query(
    `select 1
       from information_schema.columns
      where table_schema = $1 and table_name = $2 and column_name = 'id'`,
    [schema, table],
  );
  const answer = result.rowCount > 0;
  ID_COLUMN_CACHE.set(qualified, answer);
  return answer;
}

export async function findAttachedRows(client, ownedIdsByTable, dependencies) {
  const attached = new Map();
  const blockers = new Map();
  const order = [];

  const ownedByTable = new Map([...ownedIdsByTable].map(([table, ids]) => [table, new Set(ids)]));
  let frontier = new Map(ownedIdsByTable);

  // Bounded. The schema is finite and each pass only follows edges out of rows
  // the previous one found; the cap is a backstop against a cycle in the
  // catalog, not a limit any real schema should reach.
  for (let depth = 0; depth < 12 && frontier.size > 0; depth += 1) {
    const next = new Map();

    for (const [parent, parentIds] of frontier) {
      if (!parentIds || parentIds.length === 0) continue;

      for (const edge of dependencies.get(parent) ?? []) {
        const owned = ownedByTable.get(edge.child) ?? new Set();
        const already = attached.get(edge.child) ?? new Set();

        // Every table this walk can reach has to be deletable by `id`, because
        // that is the only key the rollback knows how to delete by. A table
        // without one is refused by name rather than crashing on a missing
        // column three statements later: LAN-151 added reference tables keyed
        // by `event_type` rather than by a surrogate, and the first sign of it
        // was `column "id" does not exist` out of the middle of a rollback.
        if (!(await hasIdColumn(client, edge.child))) {
          throw new Error(
            `Rollback cannot follow ${edge.child}.${edge.column}: ${edge.child} has no \`id\` ` +
              "column, and the rollback deletes by `id`. Give it one, or exclude it from the " +
              "dependency walk deliberately.",
          );
        }

        const found = await client.query(
          `select id from ${edge.child} where ${edge.column} = any($1)`,
          [parentIds],
        );

        const fresh = found.rows
          .map((row) => row.id)
          .filter((id) => !owned.has(id) && !already.has(id));

        if (fresh.length === 0) continue;

        const key = `${edge.child}.${edge.column}`;
        const existing = blockers.get(key);
        blockers.set(key, {
          table: edge.child,
          column: edge.column,
          target: parent,
          onDelete: edge.onDelete,
          count: (existing?.count ?? 0) + fresh.length,
          sample: existing?.sample ?? fresh[0],
        });

        if (!attached.has(edge.child)) {
          attached.set(edge.child, new Set());
          order.push(edge.child);
        }
        for (const id of fresh) attached.get(edge.child).add(id);

        next.set(edge.child, [...(next.get(edge.child) ?? []), ...fresh]);
      }
    }

    frontier = next;
  }

  return {
    blockers: [...blockers.values()],
    // Reversed: the deepest thing found is the first thing that has to go.
    attached: order.reverse().map((table) => [table, [...attached.get(table)]]),
  };
}

export const ROLLBACK_ORDER = Object.freeze([
  // Leaves first: rows that reference something below and that nothing
  // references in turn.
  "public.delivery_callbacks",
  "public.delivery_results",
  "public.delivery_attempts",
  "public.nonresponse_flags",
  "public.notification_jobs",
  "public.question_responses",
  "public.rsvp_responses",
  "public.rsvp_access_tokens",
  "public.club_link_tokens",
  "public.attendance_records",
  "public.invitations",
  "public.event_audience_members",
  "public.event_messaging_plans",
  "public.schedule_changes",
  // Cascades off `events`, so it is deleted deliberately rather than silently.
  "public.event_questions",
  "public.follow_up_actions",
  "public.events",
  "public.alternative_groups",
  "public.event_series",
  // LAN-201: notes moved off `recruitment_prospects` onto their own attributed
  // table, `on delete restrict` back to it — delete before the prospect row.
  "public.recruitment_prospect_notes",
  "public.recruitment_prospect_status_events",
  "public.recruitment_questionnaire_responses",
  "public.recruitment_prospects",
  "public.recruitment_signup_codes",
  "public.person_access_tokens",
  "public.season_messaging_consents",
  "public.onboarding_item_history",
  "public.onboarding_activity_log",
  "public.onboarding_agreements",
  "public.onboarding_items",
  "public.bps_selections",
  "public.person_fact_disputes",
  "public.availability_statuses",
  "public.position_assignments",
  "public.jersey_assignments",
  "public.coach_group_assignments",
  "public.formalwear_records",
  "public.blues_awards",
  "public.eligibility_records",
  "public.season_membership_status_events",
  "public.season_memberships",
  "public.onboarding_item_types",
  "public.role_assignments",
  "public.person_emergency_contacts",
  "public.person_aliases",
  "public.contact_points",
  "public.operator_accounts",
  // The loader's own audit rows are what `load` created and go with the rest —
  // fabricated history is not history. Rows the *application* wrote stay:
  // `PRESERVED_TABLES` keeps any audit row the loader did not create, and
  // whatever it names. Before `people`, because an audit row's actor is a
  // foreign key onto it.
  "public.audit_events",
  // Before `people`: a season records who opened and who closed it, so deleting
  // the actor first violates `seasons_opened_by_person_id_fkey`. This only
  // shows up when the loader created the seasons rather than adopting them —
  // the automated test does exactly that, which is how the order got fixed.
  // Reference both `seasons` and `people`, so they precede both. Absent from
  // this list, `--force` collected their ids and then never deleted them, and
  // the restrict constraint fired exactly as it would have without `--force`.
  "public.weekly_reports",
  "public.seasons",
  "public.people",
  "public.positions",
  "public.position_vocabularies",
  "public.committee_years",
  "public.terms",
  "public.roles",
]);
