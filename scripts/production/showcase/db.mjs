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
export async function connect(target) {
  const client = new pg.Client({ connectionString: target.connectionString });
  await client.connect();
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

  return {
    operators,
    roles: await map("select id, code from public.roles", (row) => row.code),
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
 * Inserts a row, or updates it if the loader already owns that identifier.
 *
 * `columns` is a plain object. The primary key must be `id`, and must be one of
 * the deterministic identifiers — a random one would make the run
 * non-idempotent, which `dryRun` cannot detect and a second run would.
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

  const result = await client.query(
    `insert into ${table} (${keys.join(", ")})
     values (${placeholders.join(", ")})
     on conflict (id) do update set ${updatable.map((key) => `${key} = excluded.${key}`).join(", ")}
     returning (xmax = 0) as inserted`,
    keys.map((key) => columns[key]),
  );

  const inserted = result.rows[0]?.inserted === true;
  if (inserted) ledger.created += 1;
  else ledger.updated += 1;

  return { id: columns.id, action: inserted ? "create" : "update" };
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
 * Rows the **application** creates that hang off rows the loader created.
 *
 * The walkthrough writes these. Approving the Leadership Walkthrough mints a
 * token and queues a job; Stewart answering writes a response; pressing **Show
 * report** writes a `weekly_reports` row and an `audit_events` row attributed to
 * the showcase Person. Every one of them carries an identifier the loader did
 * not compute and therefore cannot name.
 *
 * They matter in two opposite ways, and both are why this exists:
 *
 *   * under `on delete restrict` — `audit_events.actor_person_id`,
 *     `weekly_reports.season_id`, `notification_jobs.invitation_id`,
 *     `rsvp_access_tokens.invitation_id`, `rsvp_responses.invitation_id` — the
 *     delete aborts with a raw PostgreSQL error and removes nothing;
 *   * under `on delete cascade` — `event_audience_members.event_id`,
 *     `event_questions.event_id` — the delete **silently removes** them, which
 *     is the widening `docs/pilot-data-runbook.md` says a cleanup must refuse.
 *
 * So rollback counts them first and refuses by name. A cleanup that cannot
 * complete has to say which row is holding it, not surface a constraint name.
 *
 * `[table, column, what the loader owns it points at]`
 */
export const FOREIGN_ROW_CHECKS = Object.freeze([
  ["public.audit_events", "actor_person_id", "public.people"],
  ["public.weekly_reports", "season_id", "public.seasons"],
  ["public.weekly_reports", "generated_by_person_id", "public.people"],
  ["public.notification_jobs", "invitation_id", "public.invitations"],
  ["public.notification_jobs", "event_id", "public.events"],
  ["public.notification_jobs", "person_id", "public.people"],
  ["public.rsvp_access_tokens", "invitation_id", "public.invitations"],
  ["public.rsvp_responses", "invitation_id", "public.invitations"],
  ["public.attendance_records", "event_id", "public.events"],
  ["public.event_audience_members", "event_id", "public.events"],
  ["public.event_questions", "event_id", "public.events"],
  ["public.invitations", "event_id", "public.events"],
  ["public.season_memberships", "person_id", "public.people"],
  ["public.role_assignments", "person_id", "public.people"],
]);

/**
 * Finds rows the loader does not own that point at rows it does.
 *
 * Returns one entry per table/column with a count and a sample identifier, so
 * the refusal can name something a human can go and look at.
 */
export async function findForeignRows(client, ownedIdsByTable) {
  const blockers = [];

  for (const [table, column, target] of FOREIGN_ROW_CHECKS) {
    const targetIds = ownedIdsByTable.get(target) ?? [];
    if (targetIds.length === 0) continue;

    const ownIds = ownedIdsByTable.get(table) ?? [];

    const result = await client.query(
      `select count(*)::int as count, min(id::text) as sample
         from ${table}
        where ${column} = any($1)
          and not (id = any($2))`,
      [targetIds, ownIds],
    );

    const count = result.rows[0].count;
    if (count > 0) {
      blockers.push({ table, column, target, count, sample: result.rows[0].sample });
    }
  }

  return blockers;
}

export const ROLLBACK_ORDER = Object.freeze([
  "public.attendance_records",
  "public.rsvp_responses",
  "public.delivery_attempts",
  "public.notification_jobs",
  "public.rsvp_access_tokens",
  "public.invitations",
  "public.event_audience_members",
  "public.events",
  "public.recruitment_prospects",
  "public.availability_statuses",
  "public.onboarding_items",
  "public.position_assignments",
  "public.season_membership_status_events",
  "public.season_memberships",
  "public.onboarding_item_types",
  "public.role_assignments",
  "public.contact_points",
  "public.operator_accounts",
  // Before `people`: a season records who opened and who closed it, so deleting
  // the actor first violates `seasons_opened_by_person_id_fkey`. This only
  // shows up when the loader created the seasons rather than adopting them —
  // the automated test does exactly that, which is how the order got fixed.
  "public.seasons",
  "public.people",
  "public.positions",
  "public.position_vocabularies",
  "public.committee_years",
  "public.terms",
  "public.roles",
]);
