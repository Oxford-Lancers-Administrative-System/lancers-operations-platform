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

/**
 * The club's words for an item's state, for refusals the operator reads.
 *
 * Deliberately here rather than imported from the presentation layer: a service
 * refusal has to be readable wherever it surfaces, including in a log or a test
 * name, and the service must not depend on a screen.
 */
const ONBOARDING_STATUS_WORDS: Readonly<Record<string, string>> = Object.freeze({
  pending: "pending",
  invited: "invited",
  claimed: "claimed",
  complete: "complete",
  waived: "waived",
  not_applicable: "not applicable",
});

/**
 * The two checklist items backed by a versioned agreement — LAN-240. Keyed by
 * `onboarding_item_types.code`, exactly as `onboarding-item-shapes.ts` keys
 * every other per-item fact, so the two codes are named once here rather than
 * spelled out at the one place that needs them. Every other item's code maps
 * to nothing: it has no agreement row and nothing to remove.
 */
const AGREEMENT_ITEM_TYPES: Readonly<Record<string, OnboardingAgreementType>> = Object.freeze({
  code_of_conduct: "code_of_conduct",
  photo_release: "photo_release",
});

/**
 * Sets one onboarding item to one of its own states — D-002 (correction
 * round 6, `WP-operator-record`, LAN-217): an operator names the item's own
 * target state directly, the same list `allowedItemStates` names as both
 * displayable and offerable. There is no separate "resolution" verb any
 * more, and no `reopen` — an operator corrects a mistake by naming a
 * different one of the item's own states, from any current state, not only
 * from a terminal one.
 *
 * `public.onboarding_item_history` (LAN-214, `onboarding-item-history.ts`) is
 * the typed home `REQ-item-history` asks for, and this writes it in the same
 * transaction as the state change — Register D9's "where a typed home
 * exists, that table is the record" applied to the table this package built.
 * The `audit_events` row alongside it is unchanged from LAN-75: this
 * codebase's own precedent (`setMembershipStatus`) keeps a typed table's
 * write and an `audit_events` row together rather than choosing one.
 *
 * `REQ-reason-free-waive` (LAN-214) unwound the schema's
 * `onboarding_items_waiver_is_justified` constraint: the author stays
 * mandatory — `actorPersonId` always is one — and the reason stops being. A
 * waiver with no reason is accepted, exactly as one with one always was.
 * `waived` itself is now offered by exactly one item's own list (Subscription
 * paid) rather than by every item as a shared escape hatch.
 */
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
    // Scoped to the membership as well as the item: the item id arrives from a
    // form, and reading it alone would let a crafted request resolve an item
    // belonging to somebody else's membership.
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

    // D-002 (correction round 6): a derived item completes itself from other
    // recorded facts and has no operator control at all — never a state this
    // call may set, regardless of which one is named.
    if (isDerivedItem(item.code)) {
      throw new ConstraintViolated(`${item.label} is derived and cannot be set directly.`, {
        rule: "onboarding_item_derived_not_editable",
      });
    }

    // D-002 (correction round 6): the state this call names has to be one
    // this item's own list actually holds — B-001's Kit Distributed binary
    // reduction, generalised to every item's own shape, with no shared
    // escape hatch layered on top of any of them any more.
    if (!allowedItemStates(item.code).includes(toStatus)) {
      throw new ConstraintViolated(
        `${item.label} cannot be ${ONBOARDING_STATUS_WORDS[toStatus] ?? toStatus} — that is not one of its own states.`,
        {
          rule: "onboarding_item_state_not_offered_for_item",
        },
      );
    }

    // D-002 (Q-14): "Subscription paid" is blank until "Subscription
    // invoiced" is itself complete — an operator must not be able to record
    // payment on something never invoiced. Checked read-only here, under the
    // same row lock already taken above for the item itself; the sibling
    // read below takes its own lock only when it actually has to write.
    if (item.code === SUBS_PAID_ITEM_CODE) {
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

    /**
     * Saving the status an item already has is not a change, and must not be
     * recorded as one.
     *
     * Without this it wrote a fresh audit row whose `from_state` and
     * `to_state` were identical, and re-dated `completed_on` to today — so an
     * item completed in September silently claimed to have been completed
     * again in August, and the history filled with events in which nothing
     * happened. Owner review caught it: "if I change to say it's completed and
     * the status didn't change, it should not change again."
     *
     * Refused rather than silently ignored, so the operator learns why the
     * screen did not move. The message names the item and the state it is
     * already in, which is the same shape every other refusal here uses.
     */
    // A waiver whose *reason* changed is a real correction, not a no-op — an
    // operator who typo'd one has to be able to fix it without routing through
    // another status and writing audit rows for changes that did not happen.
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

    // Correction round 1, F-001: a reason-only correction to an already-waived
    // item reaches here with `item.status === toStatus` (both `waived`) —
    // `sameReason` above is what let it past the already-in-that-state guard,
    // precisely so the typo-fix path in that guard's own comment keeps
    // working. It is not a transition: nothing about the item's *state*
    // changed, only the reason text. `onboarding_item_history_is_a_real_change`
    // refuses a row whose `from_status` and `to_status` are equal (and rightly
    // so — REQ-item-history's history is a state-pair record, not a reason
    // log), so the history write is skipped for exactly this case. The
    // `audit_events` row below still records the correction, same as before
    // this package existed.
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

    // LAN-240 (walker M7, finding M7-01): reopening one of the two agreement
    // items has to reach the player, and until now it never did. Setting
    // Photo release or Code of Conduct back to "No" is the shipped reopen
    // mechanism — there is no separate verb, by D-002 above — but it moved
    // only `onboarding_items.status`. The `onboarding_agreements` row stayed,
    // so the player's own link went on reading "Already agreed" under a
    // navigator that said "Outstanding", and a bare load of the link resumed
    // at "There is nothing left to fill in". Removing the row in the same
    // transaction as the state change is what makes the reopen real: the
    // player's next load lands on the step, the step reads outstanding, and
    // `recordOnboardingAgreementIn` accepts their fresh agreement instead of
    // refusing it as a duplicate. See `deleteOnboardingAgreementIn` for why a
    // delete rather than a `superseded_at` column, and what keeps the record.
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
          // Zero is legitimate: the item can be set back to "No" for a player
          // who never agreed through the link at all. Recorded, not hidden.
          removed_count: removed,
        },
      });
    }

    // D-002 (Q-14): "correcting the invoice back to Not invoiced must do the
    // right thing to the payment cell." A payment already recorded against
    // an invoice that no longer stands is stale — an operator correcting
    // Subscription invoiced away from `complete` resets its sibling
    // Subscription paid back to `pending` in the same transaction. Never the
    // other way — paying does not touch the invoice, and correcting an
    // already-`pending` payment (it never having been invoiced, or already
    // reset by an earlier correction) has nothing to cascade.
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

/**
 * The player's own trust-class claim — `R2-V`: "the player says done and
 * awaits confirmation." LAN-214. Only offered on an item whose type is
 * `verification_class = 'trust'` (BUCS Play, Hudl, per the item-and-ask
 * inventory) and only from `pending` or `invited` — an item already
 * `claimed`, or resolved, has nothing left for a claim to do; the operator's
 * own `resolveOnboardingItem` is what moves a resolved item back to
 * `pending` (or `invited`) before it can be claimed again.
 *
 * `actorPersonId` here is the player themselves — the same person the
 * membership belongs to — not an operator. Authorization (that the caller
 * really is holding this person's own signed link) is the caller's job,
 * exactly as `src/lib/services/README.md` rule 1 asks of every service
 * function; this one only names who it was told made the claim.
 */
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
