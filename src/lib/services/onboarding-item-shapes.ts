import type { OnboardingItemStatus } from "./membership";

// Onboarding item state lists (`WP-operator-record`, LAN-217), keyed by `onboarding_item_types.code`. No `server-only`: client components need it too.
// Decision history: missions/intake/M-ONBOARDING-AND-INFORMATION-COMPLETION

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

/** Items completed from other recorded facts, never a board column or editable control. */
const DERIVED_ITEM_CODES: ReadonlySet<string> = new Set([
  "contact_academic_details",
  "season_welcome_consent",
]);

export function isDerivedItem(code: string): boolean {
  return DERIVED_ITEM_CODES.has(code);
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
