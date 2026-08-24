import type { Client } from "pg";

const DURABLE_FOUNDATION = [
  "public.audit_events",
  "public.operator_accounts",
  "public.role_assignments",
  "public.roles",
];

/**
 * Snapshot every table's row count, but hash row contents only where cleanup is
 * allowed to write or where durable identity/access/history must survive. This
 * keeps the safety signal while avoiding an all-row/all-table digest on every
 * pilot assertion.
 */
export async function scopedPilotSnapshot(
  client: Client,
  cleanupSql: string,
  options: { excludeDigests?: ReadonlySet<string> } = {},
): Promise<Record<string, string>> {
  const deletionTargets = [...cleanupSql.matchAll(/\bdelete\s+from\s+(public\.[a-z_]+)/gi)].map(
    (match) => match[1].toLowerCase(),
  );
  const hashed = new Set([...deletionTargets, ...DURABLE_FOUNDATION]);
  for (const excluded of options.excludeDigests ?? []) hashed.delete(excluded);

  const { rows: tables } = await client.query<{ qualified: string }>(
    `select quote_ident(n.nspname) || '.' || quote_ident(c.relname) as qualified
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where c.relkind in ('r', 'p')
        and n.nspname in ('public', 'staging')
      order by 1`,
  );

  const snapshot: Record<string, string> = {};
  for (const { qualified } of tables) {
    const digest = hashed.has(qualified)
      ? `coalesce(md5(string_agg(md5(to_jsonb(t)::text), ',' order by md5(to_jsonb(t)::text))), '-')`
      : `'-'`;
    const { rows } = await client.query<{ digest: string }>(
      `select count(*)::text || ':' || ${digest} as digest from ${qualified} t`,
    );
    snapshot[qualified] = rows[0].digest;
  }
  return snapshot;
}
