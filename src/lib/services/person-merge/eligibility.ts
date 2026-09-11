import type { Tx } from "@/lib/db";
import type { PersonRecord } from "../person-record";
import { readPersonRecordIn } from "../person-record";

/**
 * Eligibility — the two refusals `Q-5` names, read-only. LAN-185, `Q-16`
 * (Brian, correction round 2): the season-overlap refusal names the season,
 * links to the loser's membership, and clears once it is archived.
 */

export interface MergeRefusal {
  rule: string;
  message: string;
  /** Q-16: one entry per season still blocking. Absent for the active-operator-seat refusal. */
  blockingMemberships?: { seasonLabel: string; membershipId: string }[];
}

interface SeasonOverlap {
  seasonId: string;
  seasonLabel: string;
  loserMembershipId: string;
  loserStatus: string;
}

interface RetainedMembership {
  seasonId: string;
  seasonLabel: string;
  membershipId: string;
}

export async function readMergeSide(
  tx: Tx,
  personId: string,
): Promise<{ record: PersonRecord; createdAt: Date } | null> {
  const row = await tx.query<{ merged_into_person_id: string | null; created_at: Date }>(
    `select merged_into_person_id, created_at from public.people where id = $1::uuid`,
    [personId],
  );
  if (!row.rows[0]) return null;
  if (row.rows[0].merged_into_person_id) return null;
  return { record: await readPersonRecordIn(tx, personId), createdAt: row.rows[0].created_at };
}

/** Every season where both hold a membership, naming the loser's row and status. */
async function findSeasonOverlaps(
  tx: Tx,
  survivorId: string,
  loserId: string,
): Promise<SeasonOverlap[]> {
  const result = await tx.query<{
    season_id: string;
    label: string;
    loser_membership_id: string;
    status: string;
  }>(
    `select s.id as season_id, s.label, b.id as loser_membership_id, b.status
       from public.season_memberships a
       join public.season_memberships b
         on b.season_id = a.season_id and b.person_id = $2::uuid
       join public.seasons s on s.id = a.season_id
      where a.person_id = $1::uuid`,
    [survivorId, loserId],
  );
  return result.rows.map((row) => ({
    seasonId: row.season_id,
    seasonLabel: row.label,
    loserMembershipId: row.loser_membership_id,
    loserStatus: row.status,
  }));
}

/** Q-16: proceeds once the loser's membership for the shared season is archived. An already-archived overlap is `retained`, not refused. */
async function evaluateSeasonOverlap(
  tx: Tx,
  survivorId: string,
  loserId: string,
): Promise<{
  refusal: MergeRefusal | null;
  retained: RetainedMembership[];
}> {
  const overlaps = await findSeasonOverlaps(tx, survivorId, loserId);
  const blocking = overlaps.filter((o) => o.loserStatus !== "archived");
  const retained = overlaps
    .filter((o) => o.loserStatus === "archived")
    .map((o) => ({
      seasonId: o.seasonId,
      seasonLabel: o.seasonLabel,
      membershipId: o.loserMembershipId,
    }));

  if (blocking.length === 0) return { refusal: null, retained };

  const labels = blocking.map((b) => b.seasonLabel).join(", ");
  return {
    refusal: {
      rule: "person_merge_membership_overlap",
      message:
        `Both records hold a membership for ${labels}. Archive the losing record's ` +
        `membership for ${labels} on the roster before merging.`,
      blockingMemberships: blocking.map((b) => ({
        seasonLabel: b.seasonLabel,
        membershipId: b.loserMembershipId,
      })),
    },
    retained,
  };
}

/** The two refusals `Q-5` names, checked read-only; re-checked under a real lock inside `mergePersons()` — a preview is never authoritative under a race. */
export async function checkMergeRefusal(
  tx: Tx,
  survivorId: string,
  loserId: string,
): Promise<{
  refusal: MergeRefusal | null;
  retainedMemberships: RetainedMembership[];
}> {
  const seat = await tx.query<{ id: string }>(
    `select id from public.operator_accounts where person_id = $1::uuid and is_active`,
    [loserId],
  );
  if (seat.rows.length > 0) {
    return {
      refusal: {
        rule: "person_merge_active_operator_seat",
        message:
          "This record holds an active operator seat. End the seat before merging — Mission 1's administration surface.",
      },
      retainedMemberships: [],
    };
  }

  const overlap = await evaluateSeasonOverlap(tx, survivorId, loserId);
  return { refusal: overlap.refusal, retainedMemberships: overlap.retained };
}
