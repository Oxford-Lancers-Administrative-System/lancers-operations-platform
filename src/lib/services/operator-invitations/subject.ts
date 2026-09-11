import type { AdministrationSubject } from "@/lib/auth/administration-authority";
import type { Tx } from "@/lib/db";

/** The target's role codes, read inside the caller's transaction; callers pass `includeScheduled: true` (fail-closed). */
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
