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

/**
 * Locks the membership row for the rest of the transaction and returns its
 * current status.
 *
 * `for update` rather than a plain read: two operators changing status at the
 * same moment would otherwise both read the same starting status and both
 * write a status event for it, leaving a history that claims the same flip
 * happened twice. The lock serialises the second one onto whatever the first
 * actually left behind.
 */
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

/**
 * Sets a membership's status to any other value in the ladder — there is no
 * legal-transition check any more, `archived` included, and no reason is
 * asked. See `relocations.md` for `Q-12` verbatim.
 *
 * **Authorization is not here.** It is `requireCapability("person_record_authority")`
 * in the server action, which resolves the actor from the verified session; a
 * service that took "who am I" as an argument would believe whatever it was
 * told. `actorPersonId` is the already-verified operator, and this function's
 * job is the write, not the boundary. `src/lib/services/README.md` rule 1.
 *
 * Two things still happen on the way through, and neither is a gate:
 *
 *   * **Flipping to `active` seeds onboarding items when none exist yet** —
 *     belt and braces for a membership confirmed before onboarding items
 *     existed, or reached `active` by any path that never generated them.
 *     `generateOnboardingItems()` is idempotent, so the ordinary case (items
 *     already there) inserts nothing. Outstanding required items are never
 *     asked about — they simply carry on being outstanding, visible on the
 *     record, exactly as any other season fact would be.
 *   * **The two dated-field checks the database itself enforces are honoured,
 *     not renegotiated**: `season_memberships_activation_is_dated` (`active`
 *     needs `activated_on`) and `season_memberships_departure_is_dated`
 *     (`departed` needs `departed_on`). Both use the same
 *     `coalesce(existing, current_date)` pattern, so flipping out of and back
 *     into either status preserves the original date rather than resetting it
 *     on every visit.
 *
 * A membership already at the requested status is a no-op: writing a
 * from-equals-to row is refused by `season_membership_status_events_is_a_change`,
 * and there is nothing to change. Everything below commits together — the
 * status event, the membership row and the audit record — so a failure at any
 * statement leaves the membership exactly as it was, with no half-written
 * history.
 */
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

    // `inactivity_label` is the schema's own optional, non-medical home for why
    // a membership went inactive — and, since no path collects a reason any
    // more, nothing ever writes a fresh one here. It is cleared on leaving
    // `inactive` so a stale reason from a past stint never survives a flip
    // through some other status and back.
    await tx.query(
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
        // Register D9: the transitions live in the typed table. This names
        // where to read them rather than restating them.
        transitions_recorded_in: "season_membership_status_events",
      },
    });

    return readMembershipIn(tx, membershipId);
  });
}
