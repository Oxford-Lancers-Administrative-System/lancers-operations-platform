import "server-only";

import { InvalidTransition, NotFound, withTransaction, type Tx } from "@/lib/db";

/** Operator notes on a recruit's record — `W2`. LAN-204. */

export async function addRecruitmentProspectNoteIn(
  tx: Tx,
  actorPersonId: string,
  prospectId: string,
  note: string,
): Promise<void> {
  const trimmed = note.trim();
  if (trimmed === "") {
    throw new InvalidTransition("A note needs some text.", { rule: "recruitment_note_not_blank" });
  }
  const exists = await tx.query(`select 1 from public.recruitment_prospects where id = $1::uuid`, [
    prospectId,
  ]);
  if (!exists.rows[0])
    throw new NotFound("That recruit could not be found.", {
      rule: "recruitment_prospect_not_found",
    });

  await tx.query(
    `insert into public.recruitment_prospect_notes (prospect_id, note, author_person_id)
     values ($1::uuid, $2, $3::uuid)`,
    [prospectId, trimmed, actorPersonId],
  );
}

export async function addRecruitmentProspectNote(
  actorPersonId: string,
  prospectId: string,
  note: string,
): Promise<void> {
  return withTransaction((tx) => addRecruitmentProspectNoteIn(tx, actorPersonId, prospectId, note));
}
