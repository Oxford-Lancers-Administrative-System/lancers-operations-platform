import "server-only";

import type { Tx } from "@/lib/db";

/**
 * Who may be anonymised — LAN-361, Brian 2026-09-16.
 *
 * Only a person with no active records. The page states why when it refuses,
 * so every rule here returns a sentence rather than a boolean: an operator who
 * is told "not yet" and not told what to do about it will ask somebody, and
 * the somebody is Brian.
 */

interface ErasureBlocker {
  /** A stable id, so a test names a rule rather than a sentence. */
  readonly rule: string;
  /** What stands in the way, and what would end it. */
  readonly reason: string;
}

export interface ErasureEligibility {
  readonly eligible: boolean;
  readonly blockers: readonly ErasureBlocker[];
  /** Already a tombstone — the action is offered on nobody twice. */
  readonly alreadyErased: boolean;
}

/** Prospect states that are still live interest in somebody. Void, declined and disengaged are not. */
const ACTIVE_PROSPECT_STATES = ["identified", "engaged", "committed"];

/** Membership states that are still a player. Departed and archived are not. */
const ACTIVE_MEMBERSHIP_STATES = ["onboarding", "active", "inactive"];

export async function readErasureEligibilityIn(
  tx: Tx,
  personId: string,
): Promise<ErasureEligibility> {
  const blockers: ErasureBlocker[] = [];

  const person = await tx.query<{ erased_at: Date | null }>(
    `select erased_at from public.people where id = $1::uuid`,
    [personId],
  );
  const alreadyErased = person.rows[0]?.erased_at != null;

  // A recruit the club is still pursuing. Void, declined and disengaged are
  // finished; identified, engaged and committed are not.
  const prospect = await tx.query<{ status: string }>(
    `select status::text as status
       from public.recruitment_prospects
      where person_id = $1::uuid and status = any($2::text[]::public.prospect_status[])`,
    [personId, ACTIVE_PROSPECT_STATES],
  );
  if (prospect.rows.length > 0) {
    blockers.push({
      rule: "erasure_recruit_still_live",
      reason:
        "This person is still a live recruit. The recruitment record has to be void, " +
        "declined or disengaged first.",
    });
  }

  // A player in a season that has not closed. An alumnus — somebody with no
  // membership in the current season at all — qualifies.
  const membership = await tx.query<{ season_label: string }>(
    `select s.label as season_label
       from public.season_memberships m
       join public.seasons s on s.id = m.season_id
      where m.person_id = $1::uuid
        and s.status <> 'archived'
        and m.status = any($2::text[]::public.membership_status[])`,
    [personId, ACTIVE_MEMBERSHIP_STATES],
  );
  if (membership.rows.length > 0) {
    blockers.push({
      rule: "erasure_membership_still_open",
      reason: `This person is on the ${membership.rows[0].season_label} roster. They have to be departed from it first.`,
    });
  }

  // A live operator account. Deactivating it is somebody's decision, not a
  // side effect of this one.
  const account = await tx.query<{ id: string }>(
    `select id from public.operator_accounts where person_id = $1::uuid and is_active`,
    [personId],
  );
  if (account.rows.length > 0) {
    blockers.push({
      rule: "erasure_operator_account_live",
      reason:
        "This person still holds an operator account. It has to be deactivated in " +
        "Administration first.",
    });
  }

  // A committee or coaching seat that has not ended.
  const seat = await tx.query<{ name: string }>(
    `select r.name
       from public.role_assignments a
       join public.roles r on r.id = a.role_id
      where a.person_id = $1::uuid
        and (a.effective_to is null or a.effective_to >= current_date)`,
    [personId],
  );
  if (seat.rows.length > 0) {
    blockers.push({
      rule: "erasure_seat_still_held",
      reason: `This person still holds the ${seat.rows[0].name} seat. It has to end first.`,
    });
  }

  return { eligible: !alreadyErased && blockers.length === 0, blockers, alreadyErased };
}
