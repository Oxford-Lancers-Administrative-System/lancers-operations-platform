import "server-only";

import { ConstraintViolated, InvalidTransition, NotFound, withTransaction } from "@/lib/db";
import { recordAudit } from "../audit";
import {
  deleteOnboardingAgreementIn,
  type OnboardingAgreementType,
} from "../onboarding-agreements";
import { writeOnboardingItemHistoryIn } from "../onboarding-item-history";
import {
  allowedItemStates,
  isDerivedItem,
  SUBS_INVOICED_ITEM_CODE,
  SUBS_PAID_ITEM_CODE,
} from "../onboarding-item-shapes";
import { type MembershipRecord, readMembershipIn } from "./read";
import { optional, requireActor, type OnboardingItemStatus } from "./shared";

/**
 * One onboarding item's own write path — LAN-75/LAN-214/LAN-217/LAN-240.
 * D-002's per-item state model is in `relocations.md`.
 */

// Deliberately here, not the presentation layer — a refusal must be readable wherever it surfaces.
const ONBOARDING_STATUS_WORDS: Readonly<Record<string, string>> = Object.freeze({
  pending: "pending",
  invited: "invited",
  claimed: "claimed",
  complete: "complete",
  waived: "waived",
  not_applicable: "not applicable",
});

// The two checklist items backed by a versioned agreement (LAN-240), keyed by onboarding_item_types.code.
const AGREEMENT_ITEM_TYPES: Readonly<Record<string, OnboardingAgreementType>> = Object.freeze({
  code_of_conduct: "code_of_conduct",
  photo_release: "photo_release",
});

// D-002 (correction round 6, WP-operator-record, LAN-217): an operator names the item's own target
// state directly — no separate "resolution" verb, no reopen. Writes onboarding_item_history (LAN-214)
// and audit_events together (Register D9, matching setMembershipStatus's precedent). REQ-reason-free-waive
// (LAN-214): the author is mandatory, the reason is not. See relocations.md.
export async function resolveOnboardingItem(params: {
  actorPersonId: string;
  membershipId: string;
  itemId: string;
  status: OnboardingItemStatus;
  reason?: string | null;
}): Promise<MembershipRecord> {
  const { actorPersonId, membershipId, itemId } = params;
  requireActor(actorPersonId);
  const reason = optional(params.reason);
  const toStatus = params.status;

  return withTransaction(async (tx) => {
    const existing = await tx.query<{
      status: OnboardingItemStatus;
      label: string;
      code: string;
      waived_reason: string | null;
      person_id: string;
      season_id: string;
    }>(
      `select i.status::text as status, t.label, t.code, i.waived_reason,
              m.person_id, m.season_id
         from public.onboarding_items i
         join public.onboarding_item_types t on t.id = i.item_type_id
         join public.season_memberships m on m.id = i.season_membership_id
        where i.id = $1::uuid and i.season_membership_id = $2::uuid
        for update of i`,
      [itemId, membershipId],
    );

    const item = existing.rows[0];
    if (!item) {
      throw new NotFound("That onboarding item is not on this membership.", {
        rule: "onboarding_items_not_found",
      });
    }

    if (isDerivedItem(item.code)) {
      // a derived item completes itself from other facts — never a state this call may set
      throw new ConstraintViolated(`${item.label} is derived and cannot be set directly.`, {
        rule: "onboarding_item_derived_not_editable",
      });
    }

    if (!allowedItemStates(item.code).includes(toStatus)) {
      throw new ConstraintViolated(
        `${item.label} cannot be ${ONBOARDING_STATUS_WORDS[toStatus] ?? toStatus} — that is not one of its own states.`,
        {
          rule: "onboarding_item_state_not_offered_for_item",
        },
      );
    }

    if (item.code === SUBS_PAID_ITEM_CODE) {
      // D-002 (Q-14): payment cannot be recorded on something never invoiced
      const invoiced = await tx.query<{ status: OnboardingItemStatus }>(
        `select i.status::text as status
           from public.onboarding_items i
           join public.onboarding_item_types t on t.id = i.item_type_id
          where i.season_membership_id = $1::uuid and t.code = $2`,
        [membershipId, SUBS_INVOICED_ITEM_CODE],
      );
      if ((invoiced.rows[0]?.status ?? null) !== "complete") {
        throw new ConstraintViolated(
          `${item.label} cannot be recorded until Subscription invoiced is complete.`,
          { rule: "onboarding_item_subs_paid_requires_invoiced" },
        );
      }
    }

    // Saving the status an item already has is not a change and must not be recorded as one (owner
    // review: "if the status didn't change, it should not change again"). A changed waiver *reason*
    // is a real correction, though — see relocations.md.
    const sameReason = toStatus !== "waived" || (item.waived_reason ?? null) === (reason ?? null);
    if (item.status === toStatus && sameReason) {
      throw new InvalidTransition(
        `${item.label} is already ${ONBOARDING_STATUS_WORDS[toStatus] ?? toStatus}.`,
        { rule: "onboarding_item_already_in_that_state" },
      );
    }

    await tx.query(
      `update public.onboarding_items
          set status = $2::public.onboarding_item_status,
              completed_on = case when $2 = 'complete' then current_date else null end,
              waived_reason = case when $2 = 'waived' then $3 else null end,
              waived_by_person_id = case when $2 = 'waived' then $4::uuid else null end,
              updated_at = now()
        where id = $1::uuid`,
      [itemId, toStatus, reason, actorPersonId],
    );

    // Correction round 1, F-001: a reason-only correction to an already-waived item is not a state
    // transition, so the history write is skipped (onboarding_item_history_is_a_real_change refuses
    // a from=to row); the audit row still records the correction. See relocations.md.
    if (item.status !== toStatus) {
      await writeOnboardingItemHistoryIn(tx, {
        onboardingItemId: itemId,
        seasonMembershipId: membershipId,
        fromStatus: item.status,
        toStatus,
        actorKind: "operator",
        actorPersonId,
        reason,
      });
    }

    await recordAudit(tx, {
      actorPersonId,
      action: "onboarding_item_resolved",
      entityTable: "onboarding_items",
      entityId: itemId,
      fromState: item.status,
      toState: toStatus,
      reason,
      context: {
        issue: "LAN-75",
        season_membership_id: membershipId,
        item_code: item.code,
        item_label: item.label,
      },
    });

    // LAN-240 (walker M7, finding M7-01): reopening an agreement item (setting it back off
    // `complete`) removes the onboarding_agreements row in the same transaction, so the player's
    // next load actually reads outstanding rather than "Already agreed" — see relocations.md.
    if (
      AGREEMENT_ITEM_TYPES[item.code] !== undefined &&
      item.status === "complete" &&
      toStatus !== "complete"
    ) {
      const removed = await deleteOnboardingAgreementIn(tx, {
        personId: item.person_id,
        seasonId: item.season_id,
        agreementType: AGREEMENT_ITEM_TYPES[item.code],
      });
      await recordAudit(tx, {
        actorPersonId,
        action: "onboarding_agreement_reopened",
        entityTable: "onboarding_agreements",
        entityId: itemId,
        fromState: "agreed",
        toState: "outstanding",
        reason,
        context: {
          issue: "LAN-240",
          season_membership_id: membershipId,
          person_id: item.person_id,
          season_id: item.season_id,
          agreement_type: AGREEMENT_ITEM_TYPES[item.code],
          removed_count: removed, // zero is legitimate — recorded, not hidden
        },
      });
    }

    // D-002 (Q-14): correcting Subscription invoiced away from complete resets the sibling
    // Subscription paid back to pending in the same transaction, never the reverse. See relocations.md.
    if (
      item.code === SUBS_INVOICED_ITEM_CODE &&
      item.status === "complete" &&
      toStatus !== "complete"
    ) {
      const sibling = await tx.query<{ id: string; status: OnboardingItemStatus }>(
        `select i.id, i.status::text as status
           from public.onboarding_items i
           join public.onboarding_item_types t on t.id = i.item_type_id
          where i.season_membership_id = $1::uuid and t.code = $2
          for update of i`,
        [membershipId, SUBS_PAID_ITEM_CODE],
      );
      const paid = sibling.rows[0];
      if (paid && paid.status !== "pending") {
        await tx.query(
          `update public.onboarding_items
              set status = 'pending'::public.onboarding_item_status,
                  completed_on = null, waived_reason = null, waived_by_person_id = null,
                  updated_at = now()
            where id = $1::uuid`,
          [paid.id],
        );
        await writeOnboardingItemHistoryIn(tx, {
          onboardingItemId: paid.id,
          seasonMembershipId: membershipId,
          fromStatus: paid.status,
          toStatus: "pending",
          actorKind: "operator",
          actorPersonId,
          reason: "Subscription invoiced was corrected back to Not invoiced.",
        });
        await recordAudit(tx, {
          actorPersonId,
          action: "onboarding_item_resolved",
          entityTable: "onboarding_items",
          entityId: paid.id,
          fromState: paid.status,
          toState: "pending",
          reason: "Subscription invoiced was corrected back to Not invoiced.",
          context: {
            issue: "LAN-217",
            season_membership_id: membershipId,
            item_code: SUBS_PAID_ITEM_CODE,
            cascade_from: SUBS_INVOICED_ITEM_CODE,
          },
        });
      }
    }

    return readMembershipIn(tx, membershipId);
  });
}

// The player's own trust-class claim (R2-V, LAN-214) — only on a `trust` verification_class item,
// only from pending/invited. actorPersonId is the player; authorization that the caller really
// holds this person's own signed link is the caller's job (README.md rule 1).
export async function claimOnboardingItem(params: {
  actorPersonId: string;
  membershipId: string;
  itemId: string;
}): Promise<MembershipRecord> {
  const { actorPersonId, membershipId, itemId } = params;
  requireActor(actorPersonId);

  return withTransaction(async (tx) => {
    const existing = await tx.query<{
      status: OnboardingItemStatus;
      label: string;
      verification_class: "direct" | "trust";
    }>(
      `select i.status::text as status, t.label, t.verification_class::text as verification_class
         from public.onboarding_items i
         join public.onboarding_item_types t on t.id = i.item_type_id
        where i.id = $1::uuid and i.season_membership_id = $2::uuid
        for update of i`,
      [itemId, membershipId],
    );

    const item = existing.rows[0];
    if (!item) {
      throw new NotFound("That onboarding item is not on this membership.", {
        rule: "onboarding_items_not_found",
      });
    }
    if (item.verification_class !== "trust") {
      throw new ConstraintViolated(
        `${item.label} does not accept a player claim — it completes directly.`,
        { rule: "onboarding_item_claim_requires_trust_class" },
      );
    }
    if (item.status !== "pending" && item.status !== "invited") {
      throw new InvalidTransition(
        `${item.label} is already ${ONBOARDING_STATUS_WORDS[item.status] ?? item.status}.`,
        { rule: "onboarding_item_already_in_that_state" },
      );
    }

    await tx.query(
      `update public.onboarding_items
          set status = 'claimed'::public.onboarding_item_status, updated_at = now()
        where id = $1::uuid`,
      [itemId],
    );

    await writeOnboardingItemHistoryIn(tx, {
      onboardingItemId: itemId,
      seasonMembershipId: membershipId,
      fromStatus: item.status,
      toStatus: "claimed",
      actorKind: "player",
      actorPersonId,
    });

    await recordAudit(tx, {
      actorPersonId,
      action: "onboarding_item_claimed",
      entityTable: "onboarding_items",
      entityId: itemId,
      fromState: item.status,
      toState: "claimed",
      context: { issue: "LAN-214", season_membership_id: membershipId },
    });

    return readMembershipIn(tx, membershipId);
  });
}
