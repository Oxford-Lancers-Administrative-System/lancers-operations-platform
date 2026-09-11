import "server-only";

import { ConstraintViolated, type Tx } from "@/lib/db";

// Private helpers shared by the roster board's read and write siblings. Decision history: docs/ux/tickets/LAN-186-roster-board.md

export async function currentDateOf(tx: Tx): Promise<string> {
  const result = await tx.query<{ today: string }>(
    "select to_char(current_date, 'YYYY-MM-DD') as today",
  );
  return result.rows[0].today;
}

export type SupersedableTable =
  "position_assignments" | "jersey_assignments" | "eligibility_records";

/** Ends a current row's effective period, or — same-day — deletes it outright (`..._period_ordered` is strict; zero-day rows have no history to supersede). */
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

export const BOARD_ELIGIBILITY_COMPETITION = "club_play";
