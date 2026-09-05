import type { OnboardingItemStatus } from "./membership";

/**
 * D-002 (correction round 6, `WP-operator-record`, LAN-217) — **one state
 * list per onboarding item.** Round 3 (Q-14) fixed the words but kept two
 * separate concepts: a *status* the cell displayed, and a *resolution* — the
 * old four operator verbs (`complete`/`waived`/`not_applicable`/`reopen`)
 * with new words painted on — that the cell's own control offered. That
 * split is why BUCS Play still offered "Confirmed · Waived · Not applicable ·
 * Reopen" instead of its own four states, and why Subscription invoiced
 * offered four options for a yes/no fact. Brian caught it immediately.
 *
 * The Q-14 brief that told the previous round "Waived and Not applicable
 * stay available on every item as the operator's escape hatch, and reopen
 * from any terminal state is unchanged" was never Brian's decision — the
 * Mission Lead invented it. There is no escape hatch and no reopen verb.
 * Every item's own list, below, is Brian's exact words and nothing else:
 * the set a cell may show and the set its own control may choose from are
 * now, structurally, the same array — there is no second list anywhere
 * that could say something different, because there is no second list.
 *
 * Kept here, in code, keyed by `onboarding_item_types.code` — not as a new
 * column on the type; see the module's original correction-round-3 note for
 * why (`REQ-checklist-fixed`). A module of its own, deliberately without
 * `server-only`: `membership.ts` (the write path) and `board-columns.ts` /
 * `board-data.ts` / `record-view.tsx` (client components) all need the
 * identical answer to "what can this item be, and what can its own control
 * choose", and a client component may not import a `server-only` module even
 * for one pure function.
 */

/** The two subscription items — `WP-operator-record` (LAN-217). */
export const SUBS_INVOICED_ITEM_CODE = "subs_invoiced";
export const SUBS_PAID_ITEM_CODE = "subs_paid";

/** B-001 (correction round 2): the one item reduced to yes/no from the start. */
export const KIT_DISTRIBUTED_ITEM_CODE = "kit_sorted";

interface ItemState {
  readonly status: OnboardingItemStatus;
  readonly label: string;
}

/**
 * Every operator-ticked item's own closed list, Brian's exact words. Order is
 * this module's own choice — the *set* of words is what he named — laid out
 * pending-first so a reader can see each item's own shape at a glance.
 *
 * `waived` appears exactly once, on Subscription paid, where he named it —
 * nowhere else. `not_applicable` appears nowhere at all: there is no escape
 * hatch. Neither derived item (`contact_academic_details`,
 * `season_welcome_consent`) is listed — see `isDerivedItem` below.
 */
const ITEM_STATE_LISTS: Readonly<Record<string, readonly ItemState[]>> = Object.freeze({
  [SUBS_INVOICED_ITEM_CODE]: Object.freeze([
    { status: "pending", label: "Not invoiced" },
    { status: "complete", label: "Invoiced" },
  ]),
  // Blank/unset while Subscription invoiced is not Invoiced is not a fourth
  // state in this list — it is the absence of a control at all, the same
  // "nothing to show yet" every other genuinely unset value on this board
  // already reads as. See `record-view.tsx`'s `blank` prop and
  // `board-data.ts`'s `subsPaid` case.
  [SUBS_PAID_ITEM_CODE]: Object.freeze([
    { status: "pending", label: "Not paid" },
    { status: "complete", label: "Paid" },
    { status: "waived", label: "Waived" },
  ]),
  [KIT_DISTRIBUTED_ITEM_CODE]: Object.freeze([
    { status: "pending", label: "No" },
    { status: "complete", label: "Yes" },
  ]),
  photo: Object.freeze([
    { status: "pending", label: "No" },
    { status: "complete", label: "Yes" },
  ]),
  comms_groups: Object.freeze([
    { status: "pending", label: "Not assigned" },
    { status: "invited", label: "Assigned and invited" },
    { status: "complete", label: "In the group" },
  ]),
  // No `complete` — three states only. Distinct on purpose from BUCS Play,
  // which has a fourth: this is the one place the two trust-class items'
  // own lists genuinely differ, and it is Brian's own table that draws the
  // line there, not a shared "trust-class" abstraction any more.
  hudl_access: Object.freeze([
    { status: "pending", label: "Not invited" },
    { status: "invited", label: "Invited" },
    { status: "claimed", label: "Claimed" },
  ]),
  bucs_play: Object.freeze([
    { status: "pending", label: "Not invited" },
    { status: "invited", label: "Invited" },
    { status: "claimed", label: "Claimed" },
    { status: "complete", label: "Confirmed" },
  ]),
  code_of_conduct: Object.freeze([
    { status: "pending", label: "No" },
    { status: "complete", label: "Yes" },
  ]),
  photo_release: Object.freeze([
    { status: "pending", label: "No" },
    { status: "complete", label: "Yes" },
  ]),
}) as Readonly<Record<string, readonly ItemState[]>>;

/**
 * The two items that complete themselves from other recorded facts
 * (`item-and-ask-inventory.md`, items 9 and 12) — never a board column
 * (already true), and now never an editable control anywhere, record view
 * included. Nobody has settled words or states for them beyond the plain
 * pending/complete binary every code falls back to; inventing either would
 * be exactly the interface decision this module has never been allowed to
 * make on its own.
 */
const DERIVED_ITEM_CODES: ReadonlySet<string> = new Set([
  "contact_academic_details",
  "season_welcome_consent",
]);

export function isDerivedItem(code: string): boolean {
  return DERIVED_ITEM_CODES.has(code);
}

/** Every code's fallback shape — including the two derived items' own display, which is never offered as a control regardless. */
const DEFAULT_ITEM_STATES: readonly ItemState[] = Object.freeze([
  { status: "pending", label: "Pending" },
  { status: "complete", label: "Complete" },
]);

function statesFor(code: string): readonly ItemState[] {
  return ITEM_STATE_LISTS[code] ?? DEFAULT_ITEM_STATES;
}

/**
 * The complete, closed set of states this item may ever occupy — the same
 * set its own control offers (a derived item's control offers none at all;
 * see `isDerivedItem`). One list, read by the service boundary that accepts
 * a transition and by every surface that renders one: there is no second
 * list anywhere that could name a state this one does not.
 */
export function allowedItemStates(code: string): readonly OnboardingItemStatus[] {
  return statesFor(code).map((entry) => entry.status);
}

/**
 * The one word this item's cell shows for this state. Never called with a
 * state this item cannot occupy — that is exactly the defect Brian saw twice
 * now (first "Invited" on a yes/no item, then the old four resolution verbs
 * painted over an item's own states) — so this throws rather than silently
 * printing a word for a state the item's own list says cannot exist here.
 */
export function itemStateLabel(code: string, status: OnboardingItemStatus): string {
  const found = statesFor(code).find((entry) => entry.status === status);
  if (!found) {
    throw new Error(`"${status}" is not a state "${code}" can occupy.`);
  }
  return found.label;
}
