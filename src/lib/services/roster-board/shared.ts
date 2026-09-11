import "server-only";

import { ConstraintViolated, type Tx } from "@/lib/db";

// Private helpers shared by the roster board's read and write siblings.
// Decision history: docs/ux/tickets/LAN-186-roster-board.md.

/** `current_date` from the database, so every date in one transaction agrees. */
export async function currentDateOf(tx: Tx): Promise<string> {
  const result = await tx.query<{ today: string }>(
    "select to_char(current_date, 'YYYY-MM-DD') as today",
  );
  return result.rows[0].today;
}

/**
 * Closes a current, effective-dated row — but only ever onto one of these two
 * tables, named explicitly rather than taken as a caller-supplied string.
 */
export type SupersedableTable =
  "position_assignments" | "jersey_assignments" | "eligibility_records";

/**
 * Ends a current row's effective period, or — when it was opened on the same
 * day it is being replaced — deletes it outright.
 *
 * `..._period_ordered` on every one of these tables requires
 * `effective_to > effective_from`, strictly: two `date` columns with no time
 * component. An operator correcting a same-day mis-click (set a position at
 * 10am, fix it at 2pm) would otherwise ask this module to set `effective_to`
 * equal to `effective_from`, which the database refuses outright — found by
 * this module's own test suite reproducing exactly that sequence, not assumed.
 *
 * A row that lived for zero calendar days was never "current" for anybody to
 * have read as the club's answer, so there is no history in it worth
 * preserving by superseding — deleting it and inserting the new one fresh is a
 * same-day correction, not the overwrite invariant S4 forbids. A row opened on
 * an earlier day still supersedes exactly as before.
 */
export async function closeCurrentRow(
  tx: Tx,
  table: SupersedableTable,
  id: string,
  effectiveFrom: string,
  today: string,
): Promise<void> {
  if (effectiveFrom === today) {
    if (table === "position_assignments") {
      await tx.query(`delete from public.position_assignments where id = $1::uuid`, [id]);
    } else if (table === "jersey_assignments") {
      await tx.query(`delete from public.jersey_assignments where id = $1::uuid`, [id]);
    } else {
      await tx.query(`delete from public.eligibility_records where id = $1::uuid`, [id]);
    }
    return;
  }

  if (table === "position_assignments") {
    await tx.query(`update public.position_assignments set effective_to = $2 where id = $1::uuid`, [
      id,
      today,
    ]);
  } else if (table === "jersey_assignments") {
    await tx.query(`update public.jersey_assignments set effective_to = $2 where id = $1::uuid`, [
      id,
      today,
    ]);
  } else {
    await tx.query(`update public.eligibility_records set effective_to = $2 where id = $1::uuid`, [
      id,
      today,
    ]);
  }
}

export function actorRequirement(actorPersonId: string): void {
  if (typeof actorPersonId !== "string" || actorPersonId.trim() === "") {
    throw new ConstraintViolated("A board edit has to name the operator who made it.", {
      rule: "audit_events_has_an_actor",
    });
  }
}

/** The one competition the board's eligibility column reads. See `read.ts`. */
export const BOARD_ELIGIBILITY_COMPETITION = "club_play";
