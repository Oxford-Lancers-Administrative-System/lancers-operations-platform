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
  "public.people",
  "public.seasons",
  "public.positions",
  "public.position_vocabularies",
  "public.committee_years",
  "public.terms",
  "public.roles",
]);
