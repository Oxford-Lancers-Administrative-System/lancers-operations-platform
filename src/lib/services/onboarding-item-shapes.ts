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

/**
 * D-002 (correction round 5, `WP-operator-record`, LAN-217) — the words
 * Brian actually said for each item's own progression, layered over the
 * shared escape hatch (`waived` → "Waived", `not_applicable` → "Not
 * applicable" — his own words, "Waived and Not applicable remain available on
 * every item as the operator's escape hatch") and the shared trust-class
 * words (`invited` → "Invited", `claimed` → "Claimed" — never overridden,
 * because those two words already are what he asked for everywhere they
 * apply).
 *
 * Only `pending` and `complete` vary by item — the two ends of the ladder
 * Brian actually named a wrong word for ("Subscription invoiced is
 * invoiced-or-not, never Complete") or a right one for verbatim:
 *
 *   * Subscription invoiced — "It should be binary: yes or no."
 *   * Subscription paid — "either: paid, waived, not paid."
 *   * Kit Distributed — B-001, already Yes/No.
 *   * Squad photo — "Do we have a squad photo of them or not?"
 *   * Comms group — "not assigned, assigned and invited, in the group."
 *   * Hudl access / BUCS Play — "invited, claimed, confirmed."
 *   * Code of Conduct / Photo release — signed or not (the brief's own
 *     words), matching every other binary item's "not X" / "X" shape.
 *
 * The two derived items (`contact_academic_details`,
 * `season_welcome_consent`) are absent here deliberately: nobody has settled
 * different words for them, and they are not board columns — inventing
 * wording nobody asked for would be exactly the kind of interface decision
 * `describeOnboarding`'s own doc comment already refuses to make. They read
 * the plain `pending`/`complete` fallback below, same as before.
 */
const ITEM_STATUS_LABEL_OVERRIDES: Readonly<
  Record<string, Partial<Readonly<Record<OnboardingItemStatus, string>>>>
> = Object.freeze({
  [SUBS_INVOICED_ITEM_CODE]: Object.freeze({ pending: "Not invoiced", complete: "Invoiced" }),
  [SUBS_PAID_ITEM_CODE]: Object.freeze({ pending: "Not paid", complete: "Paid" }),
  [KIT_DISTRIBUTED_ITEM_CODE]: Object.freeze({ pending: "No", complete: "Yes" }),
  photo: Object.freeze({ pending: "No", complete: "Yes" }),
  comms_groups: Object.freeze({
    pending: "Not assigned",
    invited: "Assigned and invited",
    complete: "In the group",
  }),
  bucs_play: Object.freeze({
    pending: "Not invited",
    invited: "Invited",
    claimed: "Claimed",
    complete: "Confirmed",
  }),
  hudl_access: Object.freeze({
    pending: "Not invited",
    invited: "Invited",
    claimed: "Claimed",
    complete: "Confirmed",
  }),
  code_of_conduct: Object.freeze({ pending: "Not signed", complete: "Signed" }),
  photo_release: Object.freeze({ pending: "Not signed", complete: "Signed" }),
}) as Readonly<Record<string, Partial<Readonly<Record<OnboardingItemStatus, string>>>>>;

/** The plain word for a status when no item overrides it — every escape-hatch and trust-class word, plus the default binary. */
const DEFAULT_ITEM_STATUS_LABELS: Readonly<Record<OnboardingItemStatus, string>> = Object.freeze({
  pending: "Pending",
  invited: "Invited",
  claimed: "Claimed",
  complete: "Complete",
  waived: "Waived",
  not_applicable: "Not applicable",
});

/**
 * D-002: the one word this item's cell shows for this status — the
 * displayable set's own wiring, matching `allowedItemStatuses` above rather
 * than a second, driftable list. Never called with a status this item cannot
 * occupy: that is exactly the defect Brian saw (Sub invoiced, Sub paid and
 * Squad photo rendering "Invited"), so this throws rather than silently
 * printing a word for a state the cell's own model says cannot exist here.
 */
export function itemStatusLabel(code: string, status: OnboardingItemStatus): string {
  if (!allowedItemStatuses(code).includes(status)) {
    throw new Error(`"${status}" is not a status "${code}" can occupy.`);
  }
  return ITEM_STATUS_LABEL_OVERRIDES[code]?.[status] ?? DEFAULT_ITEM_STATUS_LABELS[status];
}

/**
 * D-002: the word for one entry in the *open* control — the same displayable
 * set `itemStatusLabel` covers, plus `reopen`, which is never a status a row
 * can be *in* and so is never in that function's domain. Every item reads
 * `reopen` as the generic "Reopen" except Kit Distributed, whose own binary
 * reduction (B-001) already reads its `pending` as "No" — a control with only
 * two ideas in it ("has this happened, or not") has no room for a third word
 * that means the same thing its own negative already says, which is
 * precisely the shape of the bug this correction round exists to fix
 * elsewhere. One function, so the board's dropdown and the record page's
 * cannot invent two different answers for the same item's `reopen` again.
 */
export function itemResolutionLabel(
  code: string,
  resolution: OnboardingItemStatus | "reopen",
): string {
  if (resolution === "reopen") {
    if (!allowedItemResolutions(code).includes("reopen")) {
      throw new Error(`"reopen" is not a resolution "${code}" offers.`);
    }
    return ITEM_CODES_WITHOUT_WAIVER.has(code) ? "No" : "Reopen";
  }
  return itemStatusLabel(code, resolution);
}
