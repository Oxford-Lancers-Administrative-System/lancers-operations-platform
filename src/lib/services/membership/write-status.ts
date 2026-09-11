import "server-only";

import { NotFound, withTransaction, type Tx } from "@/lib/db";
import { recordAudit } from "../audit";
import { type MembershipRecord, readMembershipIn } from "./read";
import {
  generateOnboardingItems,
  MEMBERSHIP_NOT_FOUND_MESSAGE,
  requireActor,
  type MembershipStatus,
} from "./shared";

/** The membership status ladder's one write path — LAN-186's `Q-12`, verbatim in `relocations.md`. */

// for update, not a plain read: two operators flipping status at once would otherwise both write a status event for it.
async function lockMembership(
  tx: Tx,
  membershipId: string,
): Promise<{ status: MembershipStatus; seasonId: string }> {
  const result = await tx.query<{ status: MembershipStatus; season_id: string }>(
    `select status::text as status, season_id
       from public.season_memberships
      where id = $1::uuid
      for update`,
    [membershipId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new NotFound(MEMBERSHIP_NOT_FOUND_MESSAGE, { rule: "season_memberships_not_found" });
  }
  return { status: row.status, seasonId: row.season_id };
}

async function recordStatusEvent(
  tx: Tx,
  params: {
    membershipId: string;
    from: MembershipStatus;
    to: MembershipStatus;
    actorPersonId: string;
    reason?: string | null;
  },
): Promise<void> {
  await tx.query(
    `insert into public.season_membership_status_events
       (season_membership_id, from_status, to_status, actor_person_id, reason)
     values ($1::uuid, $2::public.membership_status, $3::public.membership_status, $4::uuid, $5)`,
    [params.membershipId, params.from, params.to, params.actorPersonId, params.reason ?? null],
  );
}

// Sets a membership to any status in the ladder — no legal-transition check, no reason asked
// (Q-12, see relocations.md). Authorization is not here — requireCapability("person_record_authority")
// is in the server action. Flipping to active seeds onboarding items (see relocations.md).
export async function setMembershipStatus(params: {
  actorPersonId: string;
  membershipId: string;
  status: MembershipStatus;
}): Promise<MembershipRecord> {
  const { actorPersonId, membershipId, status } = params;
  requireActor(actorPersonId);

  return withTransaction(async (tx) => {
    const { status: current, seasonId } = await lockMembership(tx, membershipId);
    if (current === status) return readMembershipIn(tx, membershipId);

    if (status === "active") {
      await generateOnboardingItems(tx, membershipId, seasonId);
    }

    await recordStatusEvent(tx, { membershipId, from: current, to: status, actorPersonId });

    await tx.query(
      // inactivity_label is cleared on leaving inactive so a stale reason never survives a flip and back
      `update public.season_memberships
          set status = $2::public.membership_status,
              activated_on = case when $2 = 'active'
                then coalesce(activated_on, current_date) else activated_on end,
              departed_on = case when $2 = 'departed'
                then coalesce(departed_on, current_date) else departed_on end,
              inactivity_label = case when $2 = 'inactive' then inactivity_label else null end,
              updated_at = now()
        where id = $1::uuid`,
      [membershipId, status],
    );

    await recordAudit(tx, {
      actorPersonId,
      action: "season_membership_status_changed",
      entityTable: "season_memberships",
      entityId: membershipId,
      fromState: current,
      toState: status,
      reason: null,
      context: {
        issue: "LAN-186",
        transitions_recorded_in: "season_membership_status_events", // register D9: named, not restated
      },
    });

    return readMembershipIn(tx, membershipId);
  });
}
