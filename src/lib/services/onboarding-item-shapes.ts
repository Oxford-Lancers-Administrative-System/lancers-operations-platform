import type { OnboardingItemResolution, OnboardingItemStatus } from "./membership";

/**
 * D-002 (correction round 3, Q-14, Brian, 2026-09-04) — one status model per
 * onboarding item, so the set a cell can display and the set its own control
 * can reach are the same thing and cannot drift apart again.
 *
 * Kept here, in code, keyed by `onboarding_item_types.code` — not as a new
 * column on the type. The checklist itself is frozen (`REQ-checklist-fixed`:
 * nobody configures which items exist, per season or otherwise), so a
 * per-item behaviour table has nothing to read from the database that could
 * ever legitimately differ between two rows of the same code; it is exactly
 * the same reasoning B-001's `KIT_DISTRIBUTED_ITEM_CODE` special case already
 * used, generalised from one item to all eleven. Recorded in the pull
 * request as the chosen home for this model.
 *
 * A module of its own, deliberately without `server-only`: `membership.ts`
 * (the write path) and `board-columns.ts` / `record-view.tsx` (client
 * components — the roster board and the record page both render the same
 * onboarding cell) all need the identical answer to "what can this item show
 * and what can its own control do", and a client component may not import a
 * `server-only` module even for one pure function.
 *
 * Brian, item by item: "It's either been distributed to them, or it hasn't"
 * (Kit), "Do we have a squad photo of them or not? That's all that is"
 * (Squad photo), "5 and 6 feel like one group" (Comms group, already one
 * item type), "Make BUCS Play invited, claimed, confirmed" (BUCS Play,
 * mirroring Hudl). "Invited" names an ask that actually went out, or an
 * operator's own invite action (Comms group) — never a state an
 * operator-ticked-only item can occupy, which is the whole of what Brian saw
 * go wrong on Sub invoiced, Sub paid and Squad photo.
 */

/** The two subscription items — `WP-operator-record` (LAN-217), Q-14. */
export const SUBS_INVOICED_ITEM_CODE = "subs_invoiced";
export const SUBS_PAID_ITEM_CODE = "subs_paid";

/** B-001 (correction round 2): the one item reduced to yes/no — never waived, never not-applicable. */
export const KIT_DISTRIBUTED_ITEM_CODE = "kit_sorted";

/** The four resolutions every item offers except Kit Distributed (below). */
const FULL_ITEM_RESOLUTIONS: readonly OnboardingItemResolution[] = Object.freeze([
  "complete",
  "waived",
  "not_applicable",
  "reopen",
]) as readonly OnboardingItemResolution[];

/**
 * Every item's own natural progression, in order, excluding `waived` and
 * `not_applicable` — the operator's escape hatch, layered on top of every
 * item except Kit Distributed (below). Reached by the player (BUCS Play,
 * Hudl access, via `claimOnboardingItem`), by an ask actually going out
 * (`invited` on the two trust-class items — a later package's own
 * mechanism), by the operator's own invite action (Comms group), or by the
 * operator's plain complete/reopen (everything binary). An item's code
 * absent from this table — there is none today; the eleven-item checklist is
 * frozen — falls back to the plain pending/complete binary.
 */
const ONBOARDING_ITEM_PROGRESSIONS: Readonly<Record<string, readonly OnboardingItemStatus[]>> =
  Object.freeze({
    [SUBS_INVOICED_ITEM_CODE]: Object.freeze(["pending", "complete"]),
    [SUBS_PAID_ITEM_CODE]: Object.freeze(["pending", "complete"]),
    [KIT_DISTRIBUTED_ITEM_CODE]: Object.freeze(["pending", "complete"]),
    bucs_play: Object.freeze(["pending", "invited", "claimed", "complete"]),
    hudl_access: Object.freeze(["pending", "invited", "claimed", "complete"]),
    photo: Object.freeze(["pending", "complete"]),
    // "Operator ×2" (item-and-ask-inventory.md): not assigned, assigned and
    // invited, in the group. No player action and no `claimed` — both steps
    // are the operator's own.
    comms_groups: Object.freeze(["pending", "invited", "complete"]),
    code_of_conduct: Object.freeze(["pending", "complete"]),
    photo_release: Object.freeze(["pending", "complete"]),
    contact_academic_details: Object.freeze(["pending", "complete"]),
    season_welcome_consent: Object.freeze(["pending", "complete"]),
  }) as Readonly<Record<string, readonly OnboardingItemStatus[]>>;

const DEFAULT_ITEM_PROGRESSION: readonly OnboardingItemStatus[] = Object.freeze([
  "pending",
  "complete",
]) as readonly OnboardingItemStatus[];

/**
 * Kit Distributed alone excludes the waiver escape hatch — B-001, reconfirmed
 * at Brian's second walkthrough (Q-14): "It's either been distributed to
 * them, or it hasn't. That's all it's going to be right now." Every other
 * item keeps it, per Q-14's opening line: "Waived and Not applicable remain
 * available on every item as the operator's escape hatch — they are never
 * states a player reaches."
 */
const ITEM_CODES_WITHOUT_WAIVER: ReadonlySet<string> = new Set([KIT_DISTRIBUTED_ITEM_CODE]);

/** D-002: the complete set of statuses this item's cell may legitimately ever show. */
export function allowedItemStatuses(code: string): readonly OnboardingItemStatus[] {
  const progression = ONBOARDING_ITEM_PROGRESSIONS[code] ?? DEFAULT_ITEM_PROGRESSION;
  return ITEM_CODES_WITHOUT_WAIVER.has(code)
    ? progression
    : ([...progression, "waived", "not_applicable"] as readonly OnboardingItemStatus[]);
}

/** D-002: the resolutions the operator's own dropdown offers for this item — Kit Distributed's binary reduction, generalised. */
export function allowedItemResolutions(code: string): readonly OnboardingItemResolution[] {
  return ITEM_CODES_WITHOUT_WAIVER.has(code)
    ? (["complete", "reopen"] as const)
    : FULL_ITEM_RESOLUTIONS;
}
