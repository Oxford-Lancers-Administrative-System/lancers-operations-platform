import "server-only";

import { ConstraintViolated, withTransaction, type Tx } from "@/lib/db";
import { recordAudit } from "../audit";
import { actorRequirement, closeCurrentRow, currentDateOf } from "./shared";

/** The roster board's position columns — LAN-186. */

/** The four position cells LAN-387 leaves: a primary and a backup a side, each from the season's own vocabulary. */
export type PositionColumn = "offence" | "offenceBackup" | "defence" | "defenceBackup";

async function lookupPosition(
  tx: Tx,
  seasonId: string,
  side: "offence" | "defence",
  code: string,
): Promise<{ id: string; vocabularyId: string }> {
  const result = await tx.query<{ id: string; vocabulary_id: string }>(
    `select p.id, s.position_vocabulary_id as vocabulary_id
       from public.positions p
       join public.seasons s on s.position_vocabulary_id = p.vocabulary_id
      where s.id = $1::uuid and p.side = $2::public.position_side and p.code = $3`,
    [seasonId, side, code],
  );
  const row = result.rows[0];
  if (!row) {
    throw new ConstraintViolated(
      `"${code}" is not a position in this season's vocabulary for that side.`,
      { rule: "position_assignments_position_in_vocabulary" },
    );
  }
  return { id: row.id, vocabularyId: row.vocabulary_id };
}

const POSITION_COLUMN_SIDE: Readonly<Record<PositionColumn, "offence" | "defence">> = Object.freeze(
  {
    offence: "offence",
    offenceBackup: "offence",
    defence: "defence",
    defenceBackup: "defence",
  },
);

/** Which `position_assignments.slot` each column fills. The primary and the backup are separate slots, so the per-slot exclusion keeps one of each (invariant S1/S4). */
const POSITION_COLUMN_SLOT: Readonly<Record<PositionColumn, string>> = Object.freeze({
  offence: "offence",
  offenceBackup: "offence_backup",
  defence: "defence",
  defenceBackup: "defence_backup",
});

/** Sets — or clears — the one position this board column holds, superseding whatever was there (invariant S4). */
export async function commitPosition(params: {
  actorPersonId: string;
  membershipId: string;
  seasonId: string;
  column: PositionColumn;
  /** The chosen position code, or `null` to clear the column. */
  code: string | null;
}): Promise<void> {
  actorRequirement(params.actorPersonId);
  const side = POSITION_COLUMN_SIDE[params.column];
  const slot = POSITION_COLUMN_SLOT[params.column];

  return withTransaction(async (tx) => {
    const today = await currentDateOf(tx);
    // Keyed on the slot, not the side: a backup is superseded on its own and
    // never disturbs the primary beside it.
    const current = await tx.query<{ id: string; code: string; effective_from: string }>(
      `select pa.id, pos.code, to_char(pa.effective_from, 'YYYY-MM-DD') as effective_from
         from public.position_assignments pa
         join public.positions pos on pos.id = pa.position_id
        where pa.season_membership_id = $1::uuid and pa.slot = $2::public.position_slot
          and pa.effective_to is null
        for update of pa`,
      [params.membershipId, slot],
    );

    const before = current.rows.map((row) => row.code).join(", ") || null;
    if (current.rows.length === 1 && params.code === current.rows[0].code) return; // no-op

    for (const row of current.rows) {
      await closeCurrentRow(tx, "position_assignments", row.id, row.effective_from, today);
    }

    if (params.code !== null) {
      const position = await lookupPosition(tx, params.seasonId, side, params.code);
      await tx.query(
        `insert into public.position_assignments
           (season_membership_id, season_id, position_vocabulary_id, position_id, side, slot,
            effective_from, recorded_by_person_id)
         values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::public.position_side,
                 $6::public.position_slot, $7::date, $8::uuid)`,
        [
          params.membershipId,
          params.seasonId,
          position.vocabularyId,
          position.id,
          side,
          slot,
          today,
          params.actorPersonId,
        ],
      );
    }

    await recordAudit(tx, {
      actorPersonId: params.actorPersonId,
      action: "position_assignment_changed",
      entityTable: "season_memberships",
      entityId: params.membershipId,
      fromState: before,
      toState: params.code,
      context: { issue: "LAN-387", column: params.column, side, slot },
    });
  });
}
