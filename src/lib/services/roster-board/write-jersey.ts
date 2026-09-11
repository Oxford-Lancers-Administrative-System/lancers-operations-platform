import "server-only";

import { Conflict, withTransaction } from "@/lib/db";
import { recordAudit } from "../audit";
import { actorRequirement, closeCurrentRow, currentDateOf } from "./shared";

/** The roster board's jersey-number column — LAN-186. */

export type Kit = "blue" | "white";

/**
 * Sets the whole held set for one kit, effective-dating the difference:
 * a number leaving the set closes its row (never dropped, unlike the fidelity
 * mockup); a number entering it opens a new one. A number already held by
 * another current membership in this season and kit is refused — belt and
 * braces behind the UI, which should never offer it in the first place (`Q-8`).
 */
export async function commitJerseyNumbers(params: {
  actorPersonId: string;
  membershipId: string;
  seasonId: string;
  kit: Kit;
  numbers: readonly string[];
}): Promise<void> {
  actorRequirement(params.actorPersonId);

  return withTransaction(async (tx) => {
    const today = await currentDateOf(tx);
    const current = await tx.query<{ id: string; number: number; effective_from: string }>(
      `select id, number, to_char(effective_from, 'YYYY-MM-DD') as effective_from
         from public.jersey_assignments
        where season_membership_id = $1::uuid and kit = $2::public.kit and effective_to is null
        for update`,
      [params.membershipId, params.kit],
    );

    const currentNumbers = new Set(current.rows.map((row) => String(row.number)));
    const nextNumbers = new Set(params.numbers.map(String));
    const toRemove = current.rows.filter((row) => !nextNumbers.has(String(row.number)));
    const toAdd = [...nextNumbers].filter((number) => !currentNumbers.has(number));

    for (const row of toRemove) {
      await closeCurrentRow(tx, "jersey_assignments", row.id, row.effective_from, today);
    }

    for (const number of toAdd) {
      const holder = await tx.query<{ season_membership_id: string }>(
        `select season_membership_id
           from public.jersey_assignments
          where season_id = $1::uuid and kit = $2::public.kit and number = $3
            and effective_to is null and not is_import_conflict
          for update`,
        [params.seasonId, params.kit, Number(number)],
      );
      if (holder.rows.some((row) => row.season_membership_id !== params.membershipId)) {
        // Application-level pre-check, named distinctly from the database's own
        // `jersey_assignments_unique_within_season_and_kit` exclusion below it
        // (LAN186-F2): both guard the same rule, but a test asserting on `rule`
        // has to be able to tell which layer actually refused. Reusing the
        // constraint's name here made this check and its database backstop
        // indistinguishable to a caller — disabling this block entirely still
        // left every test green, because the exclusion constraint threw the
        // identical `rule` string on the very next statement.
        throw new Conflict(
          `Number ${number} is already held by another player this season. Release it from ` +
            "them before assigning it here.",
          { rule: "roster_board_jersey_number_held_by_another_membership" },
        );
      }
      await tx.query(
        `insert into public.jersey_assignments (season_membership_id, season_id, kit, number, effective_from)
         values ($1::uuid, $2::uuid, $3::public.kit, $4, $5::date)`,
        [params.membershipId, params.seasonId, params.kit, Number(number), today],
      );
    }

    // `jersey_assignments_one_predominant_per_kit`: exactly one predominant row
    // among current ones, or none when the kit holds no number. No UI here
    // chooses which — that is player detail's fuller editor — so the lowest
    // current number is promoted automatically whenever nothing else is
    // already predominant, which keeps the column the club reports against
    // populated rather than left ambiguous.
    const after = await tx.query<{ id: string; is_predominant: boolean }>(
      `select id, is_predominant
         from public.jersey_assignments
        where season_membership_id = $1::uuid and kit = $2::public.kit and effective_to is null
        order by number`,
      [params.membershipId, params.kit],
    );
    if (after.rows.length > 0 && !after.rows.some((row) => row.is_predominant)) {
      await tx.query(`update public.jersey_assignments set is_predominant = true where id = $1`, [
        after.rows[0].id,
      ]);
    }

    const beforeLabel =
      [...currentNumbers].sort((a, b) => Number(a) - Number(b)).join(", ") || null;
    const afterLabel = [...nextNumbers].sort((a, b) => Number(a) - Number(b)).join(", ") || null;
    if (beforeLabel === afterLabel) return;

    await recordAudit(tx, {
      actorPersonId: params.actorPersonId,
      action: "jersey_numbers_changed",
      entityTable: "season_memberships",
      entityId: params.membershipId,
      fromState: beforeLabel,
      toState: afterLabel,
      context: { issue: "LAN-186", kit: params.kit },
    });
  });
}
