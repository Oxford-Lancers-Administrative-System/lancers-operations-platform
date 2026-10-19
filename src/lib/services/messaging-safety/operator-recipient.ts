import "server-only";

import type { Tx } from "@/lib/db";

/**
 * Whether a recipient is an operator at this moment. LAN-503.
 *
 * Anyone holding a currently-effective seat — committee or coaching — is an
 * operator; every role in `public.roles` is an operator role. Currentness is the
 * predicate `src/lib/auth/operator.ts` resolves sign-in roles with, bounded at
 * both ends: a seat recorded to begin later confers nothing yet, and one whose
 * last day has passed is over. Expressed in SQL because the guard runs with no
 * session, inside the claim transaction.
 *
 * Read at every admission and never cached, so a person who takes up or leaves
 * a seat moves between the two sets of limits on their next send.
 */
export async function isOperatorRecipientIn(tx: Tx, personId: string): Promise<boolean> {
  const result = await tx.query<{ operator: boolean }>(
    `select exists (
       select 1
         from public.role_assignments a
        where a.person_id = $1::uuid
          and a.effective_from <= current_date
          and (a.effective_to is null or a.effective_to > current_date)
     ) as operator`,
    [personId],
  );
  return result.rows[0]?.operator === true;
}
