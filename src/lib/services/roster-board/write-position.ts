import "server-only";

import { ConstraintViolated, withTransaction, type Tx } from "@/lib/db";
import { recordAudit } from "../audit";
import { actorRequirement, closeCurrentRow, currentDateOf } from "./shared";

/**
 * The roster board's position columns — LAN-186. Special-teams reading and
 * the vocabulary invariant are in `relocations.md` (source: `roster-board.ts`
 * module header, decisions 1-2).
 * Decision history: docs/ux/tickets/LAN-186-roster-board.md.
 */

export type PositionColumn = "offence" | "defence" | "specialTeams";

/**
 * `KO → kickoff, KR → kick_return, PUNT → punt, FG → field_goal` — LAN-186's
 * own words, not this module's invention. The club's special-teams codes are
 * unchanged between `VOCAB_2023` and `VOCAB_2026` (LAN-190), so this mapping is
 * stable across the one vocabulary change the club has made; a future
 * vocabulary that renamed them would need this table updated alongside it,
 * exactly as it would need the issue's own prose updated.
 */
const SPECIAL_TEAMS_SLOT_BY_CODE: Readonly<Record<string, string>> = Object.freeze({
  KO: "kickoff",
  KR: "kick_return",
  PUNT: "punt",
  FG: "field_goal",
});

async function lookupPosition(
  tx: Tx,
  seasonId: string,
  side: "offence" | "defence" | "special_teams",
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

const POSITION_COLUMN_SIDE: Readonly<
  Record<PositionColumn, "offence" | "defence" | "special_teams">
> = Object.freeze({
  offence: "offence",
  defence: "defence",
  specialTeams: "special_teams",
});

/**
 * Sets — or clears — the one position this board column holds, superseding
 * whatever was there rather than adding a second row or deleting the first
 * (invariant S4). See `relocations.md` for the special-teams reading.
 */
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

  return withTransaction(async (tx) => {
    const today = await currentDateOf(tx);
    const current = await tx.query<{ id: string; code: string; effective_from: string }>(
      `select pa.id, pos.code, to_char(pa.effective_from, 'YYYY-MM-DD') as effective_from
         from public.position_assignments pa
         join public.positions pos on pos.id = pa.position_id
        where pa.season_membership_id = $1::uuid and pa.side = $2::public.position_side
          and pa.effective_to is null
        for update of pa`,
      [params.membershipId, side],
    );

    const before = current.rows.map((row) => row.code).join(", ") || null;
    if (current.rows.length === 1 && params.code === current.rows[0].code) return; // no-op

    for (const row of current.rows) {
      await closeCurrentRow(tx, "position_assignments", row.id, row.effective_from, today);
    }

    if (params.code !== null) {
      const position = await lookupPosition(tx, params.seasonId, side, params.code);
      const slot = side === "special_teams" ? SPECIAL_TEAMS_SLOT_BY_CODE[params.code] : side;
      if (!slot) {
        throw new ConstraintViolated(
          `"${params.code}" does not map to a recognised special-teams slot.`,
          { rule: "position_assignments_slot_matches_side" },
        );
      }
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
      context: { issue: "LAN-186", column: params.column, side },
    });
  });
}
