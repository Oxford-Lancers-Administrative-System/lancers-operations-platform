import "server-only";

import { withTransaction } from "@/lib/db";

/** The rest of the person record — roles and seasons. `W1-05`. */

/** One entry on the record's "Roles" row — amendment `W1-A4`. Read-only; granting one is Mission 1's. */
export interface PersonRoleAssignment {
  roleName: string;
  /** The committee year or season label this seat was held in. */
  cycleLabel: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  /** Whether this seat has ended — the mockup's own "ended" chip. */
  hasEnded: boolean;
}

/**
 * Every role this person has held, any cycle, newest first — the person
 * record's "Roles" row. `PersonRecord` carries no role data of its own;
 * `role_assignments` is a different table from anything `person-record.ts`
 * reads, so this is a second, independent query rather than an extension of
 * that module.
 */
export async function listPersonRoleAssignments(personId: string): Promise<PersonRoleAssignment[]> {
  return withTransaction(async (tx) => {
    const result = await tx.query<{
      role_name: string;
      cycle_label: string;
      effective_from: string;
      effective_to: string | null;
    }>(
      `select r.name as role_name,
              coalesce(cy.label, sn.label) as cycle_label,
              to_char(ra.effective_from, 'YYYY-MM-DD') as effective_from,
              to_char(ra.effective_to, 'YYYY-MM-DD') as effective_to
         from public.role_assignments ra
         join public.roles r on r.id = ra.role_id
         left join public.committee_years cy on cy.id = ra.committee_year_id
         left join public.seasons sn on sn.id = ra.season_id
        where ra.person_id = $1::uuid
        order by ra.effective_from desc, r.sort_order`,
      [personId],
    );
    return result.rows.map((row) => ({
      roleName: row.role_name,
      cycleLabel: row.cycle_label,
      effectiveFrom: row.effective_from,
      effectiveTo: row.effective_to,
      hasEnded: row.effective_to !== null,
    }));
  });
}

/** One of the person's season records — `W1-05`'s "Their seasons" list, each linking to `W6`. */
export interface PersonSeasonRecord {
  membershipId: string;
  seasonLabel: string;
  status: string;
}

/** Every season membership this person holds, most recent season first. */
export async function listPersonSeasons(personId: string): Promise<PersonSeasonRecord[]> {
  return withTransaction(async (tx) => {
    const result = await tx.query<{ membership_id: string; season_label: string; status: string }>(
      `select m.id as membership_id, s.label as season_label, m.status::text as status
         from public.season_memberships m
         join public.seasons s on s.id = m.season_id
        where m.person_id = $1::uuid
        order by s.starts_on desc nulls last, s.label desc`,
      [personId],
    );
    return result.rows.map((row) => ({
      membershipId: row.membership_id,
      seasonLabel: row.season_label,
      status: row.status,
    }));
  });
}
