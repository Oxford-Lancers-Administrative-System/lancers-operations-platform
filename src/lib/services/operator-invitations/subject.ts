import type { AdministrationSubject } from "@/lib/auth/administration-authority";
import type { Tx } from "@/lib/db";

/**
 * The target's role codes, read from the database inside the caller's
 * transaction. **This is the input the leadership rules stand on** — every
 * caller that hands the result to a guard passes `includeScheduled: true`
 * (fail-closed; no production caller asks for the narrow answer). Decision
 * history (LAN-141 finding 1): relocations.md.
 */
export async function readAdministrationSubject(
  tx: Tx,
  personId: string,
  options: { includeScheduled?: boolean } = {},
): Promise<AdministrationSubject> {
  const result = await tx.query<{ code: string }>(
    `select distinct r.code
       from public.role_assignments ra
       join public.roles r on r.id = ra.role_id
      where ra.person_id = $1
        and (ra.effective_to is null or ra.effective_to > current_date)
        and ($2::boolean or ra.effective_from <= current_date)
      order by r.code`,
    [personId, options.includeScheduled === true],
  );

  return { personId, roleCodes: result.rows.map((row) => row.code) };
}
