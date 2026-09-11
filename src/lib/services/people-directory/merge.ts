import "server-only";

import { withTransaction } from "@/lib/db";
import { personDisplayNameSql } from "../sql-text";

/** A merged-away duplicate's link resolves to the survivor — `W1-09`. */

export interface MergedPredecessor {
  personId: string;
  displayName: string;
  mergedAt: Date;
  mergedByDisplayName: string | null;
}

/**
 * The survivor's id, when `personId` names a person merged away under
 * invariant I6 — `readPersonRecordIn`'s own `NotFound` carries no such id, so
 * this is the second read `W1-09`'s redirect needs: "reaching its id directly
 * redirects to the surviving record."
 */
export async function resolveMergeSurvivor(personId: string): Promise<string | null> {
  return withTransaction(async (tx) => {
    const result = await tx.query<{ merged_into_person_id: string | null }>(
      `select merged_into_person_id from public.people where id = $1::uuid`,
      [personId],
    );
    return result.rows[0]?.merged_into_person_id ?? null;
  });
}

/**
 * Every person merged into this survivor, for `W1-09`'s one-sentence notice:
 * "'Holly Jarrowdale' was merged into this record on 3 October 2025 by
 * Caspian Hallowfield." A merge reads as one event naming what it moved
 * (`REQ-history-on-record`); this is that same fact, read for the record it
 * landed on rather than for the history section's own list.
 */
export async function listMergedPredecessors(
  survivorPersonId: string,
): Promise<MergedPredecessor[]> {
  return withTransaction(async (tx) => {
    const result = await tx.query<{
      person_id: string;
      display_name: string;
      merged_at: Date;
      merged_by_display_name: string | null;
    }>(
      `select p.id as person_id,
              ${personDisplayNameSql("p")} as display_name,
              p.merged_at,
              ${personDisplayNameSql("actor")} as merged_by_display_name
         from public.people p
         left join public.people actor on actor.id = p.merged_by_person_id
        where p.merged_into_person_id = $1::uuid
        order by p.merged_at desc`,
      [survivorPersonId],
    );
    return result.rows.map((row) => ({
      personId: row.person_id,
      displayName: row.display_name,
      mergedAt: row.merged_at,
      mergedByDisplayName: row.merged_by_display_name,
    }));
  });
}
