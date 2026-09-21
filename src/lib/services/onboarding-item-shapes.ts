import type { OnboardingItemStatus } from "./membership";
import ONBOARDING_ITEM_TYPE_ROWS from "./onboarding-item-types.json";

// Onboarding item state lists (`WP-operator-record`, LAN-217), keyed by `onboarding_item_types.code`. No `server-only`: client components need it too.

/**
 * One onboarding item type a season opens with — LAN-396.
 *
 * `verificationClass` is `'trust'` only for BUCS Play and Hudl ("BUCS Play and
 * Hudl answers record claimed, not complete", W4's locked decision) and
 * `'direct'` for everything else.
 */
export interface OnboardingItemTypeShape {
  readonly code: string;
  readonly label: string;
  readonly isRequired: boolean;
  readonly isSubscription: boolean;
  readonly verificationClass: "direct" | "trust";
}

/**
 * The club's eleven onboarding item types, in the order a season lists them —
 * the approved item-and-ask inventory, and the one place it is written down
 * (LAN-396).
 *
 * Production, 2026-09-17: `scripts/production/baseline/season-2026-27.sql`
 * opened the 2026-27 season with no item types at all, because nothing in the
 * application creates them and the baseline did not either. Every membership
 * generated for that season therefore had no onboarding items, and the board's
 * onboarding cells were silently uneditable. Brian repaired it by hand the
 * same day. The list lived in two places then — the local seed and the
 * showcase reference — and in neither of them could the application read it.
 *
 * It lives in `./onboarding-item-types.json` so the three readers are one
 * list: this module, `scripts/seed-local.mjs`, and the showcase plan's
 * `reference.mjs`. `onboarding-item-shapes.test.ts` fails when any of them
 * drifts.
 */
export const ONBOARDING_ITEM_TYPES: readonly OnboardingItemTypeShape[] = Object.freeze(
  (ONBOARDING_ITEM_TYPE_ROWS as readonly OnboardingItemTypeShape[]).map((type) =>
    Object.freeze({ ...type }),
  ),
);

export const SUBS_INVOICED_ITEM_CODE = "subs_invoiced";
export const SUBS_PAID_ITEM_CODE = "subs_paid";
export const KIT_DISTRIBUTED_ITEM_CODE = "kit_sorted";

interface ItemState {
  readonly status: OnboardingItemStatus;
  readonly label: string;
}

/** Each item's closed state list, laid out pending-first. Derived items are not listed; see `isDerivedItem`. */
const ITEM_STATE_LISTS: Readonly<Record<string, readonly ItemState[]>> = Object.freeze({
  [SUBS_INVOICED_ITEM_CODE]: Object.freeze([
    { status: "pending", label: "Not invoiced" },
    { status: "complete", label: "Invoiced" },
  ]),
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
 * Items completed from other recorded facts, never an editable control.
 * `kit_sorted` joined them in LAN-375: it is still the Onboarding group's red
 * flag and still shows Yes or No, but it reads the issued kit rather than an
 * operator's click. Its state list above stays, because the cell still has to
 * be able to say which of the two it is.
 */
const DERIVED_ITEM_CODES: ReadonlySet<string> = new Set([
  "contact_academic_details",
  "season_welcome_consent",
  KIT_DISTRIBUTED_ITEM_CODE,
]);

export function isDerivedItem(code: string): boolean {
  return DERIVED_ITEM_CODES.has(code);
}

/**
 * The three states that settle an item — the client-safe copy of
 * `RESOLVED_ITEM_STATUSES` in `membership/read.ts`, which is `server-only` and
 * so cannot be read from a record's own components.
 * `onboarding-item-shapes.test.ts` asserts the two lists stay the same.
 */
export const RESOLVED_ITEM_STATUS_CODES: readonly OnboardingItemStatus[] = Object.freeze([
  "complete",
  "waived",
  "not_applicable",
]);

/** Whether this item is settled — `false` is what the record's required marker draws attention to (LAN-408). */
export function isItemResolved(status: OnboardingItemStatus): boolean {
  return RESOLVED_ITEM_STATUS_CODES.includes(status);
}

const DEFAULT_ITEM_STATES: readonly ItemState[] = Object.freeze([
  { status: "pending", label: "Pending" },
  { status: "complete", label: "Complete" },
]);

function statesFor(code: string): readonly ItemState[] {
  return ITEM_STATE_LISTS[code] ?? DEFAULT_ITEM_STATES;
}

/** All states this item may occupy; also what its own control offers (none for a derived item). */
export function allowedItemStates(code: string): readonly OnboardingItemStatus[] {
  return statesFor(code).map((entry) => entry.status);
}

/** The label this item's cell shows for `status`; throws if `status` is not in `code`'s allowed list. */
export function itemStateLabel(code: string, status: OnboardingItemStatus): string {
  const found = statesFor(code).find((entry) => entry.status === status);
  if (!found) {
    throw new Error(`"${status}" is not a state "${code}" can occupy.`);
  }
  return found.label;
}
