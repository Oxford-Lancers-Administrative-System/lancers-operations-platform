import "server-only";

import { type Tx } from "@/lib/db";

/**
 * "Each candidate has to say who it is" — `W8`. Answers `W8`'s second
 * question about whatever `findPersonDuplicates` returns — never a second
 * duplicate check. Read-only, returns raw status codes, never a label.
 * Decision history: missions/intake/M-RECRUITMENT
 */

export type CandidateIdentity =
  | { readonly kind: "player"; readonly membershipStatus: string; readonly seasonLabel: string }
  | { readonly kind: "recruit"; readonly prospectStatus: string; readonly seasonLabel: string }
  | { readonly kind: "past_member"; readonly lastSeasonLabel: string }
  | { readonly kind: "none" };

export async function readCandidateIdentitiesIn(
  tx: Tx,
  personIds: readonly string[],
  currentSeasonId: string,
): Promise<Map<string, CandidateIdentity>> {
  const identities = new Map<string, CandidateIdentity>();
  if (personIds.length === 0) return identities;

  const [players, recruits, pastMembers] = await Promise.all([
    tx.query<{ person_id: string; status: string; label: string }>(
      `select sm.person_id, sm.status::text as status, s.label
         from public.season_memberships sm
         join public.seasons s on s.id = sm.season_id
        where sm.person_id = any($1::uuid[]) and sm.season_id = $2::uuid`,
      [personIds, currentSeasonId],
    ),
    tx.query<{ person_id: string; status: string; label: string }>(
      `select rp.person_id, rp.status::text as status, s.label
         from public.recruitment_prospects rp
         join public.seasons s on s.id = rp.season_id
        where rp.person_id = any($1::uuid[]) and rp.season_id = $2::uuid`,
      [personIds, currentSeasonId],
    ),
    tx.query<{ person_id: string; label: string }>(
      `select distinct on (sm.person_id) sm.person_id, s.label
         from public.season_memberships sm
         join public.seasons s on s.id = sm.season_id
        where sm.person_id = any($1::uuid[])
        order by sm.person_id, s.starts_on desc nulls last, s.created_at desc`,
      [personIds],
    ),
  ]);

  for (const row of players.rows) {
    identities.set(row.person_id, {
      kind: "player",
      membershipStatus: row.status,
      seasonLabel: row.label,
    });
  }
  for (const row of recruits.rows) {
    if (identities.has(row.person_id)) continue;
    identities.set(row.person_id, {
      kind: "recruit",
      prospectStatus: row.status,
      seasonLabel: row.label,
    });
  }
  for (const row of pastMembers.rows) {
    if (identities.has(row.person_id)) continue;
    identities.set(row.person_id, { kind: "past_member", lastSeasonLabel: row.label });
  }
  for (const personId of personIds) {
    if (!identities.has(personId)) identities.set(personId, { kind: "none" });
  }

  return identities;
}
