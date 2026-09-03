import type {
  MembershipStatus,
  OnboardingItemStatus,
  RosterEntry,
} from "@/lib/services/membership";

/**
 * The words the roster screens use, fixed in one place.
 *
 * LAN-90 § 4 requires the mapping from the frozen model's internal state names
 * to on-screen language to be decided once and used everywhere, "so three
 * issues do not invent three labels for one state". These are that mapping for
 * `membership_status`, `membership_entry` and `onboarding_item_status`, and
 * they are read from the approved wireframes rather than invented here: UX-20's
 * status column reads Active and Inactive; UX-20's entry column reads Returning
 * and New.
 *
 * The status vocabulary shrank to five under LAN-182, so UX-20's "Confirmed"
 * and UX-21's "Carried forward → Confirmed" no longer name anything: both
 * states map onto Onboarding. Nothing here invents a replacement word — the
 * three struck labels are simply gone.
 *
 * No client component and no page carries a label of its own.
 */

export const MEMBERSHIP_STATUS_LABELS: Readonly<Record<MembershipStatus, string>> = Object.freeze({
  onboarding: "Onboarding",
  active: "Active",
  inactive: "Inactive",
  departed: "Departed",
  archived: "Archived",
});

export const ENTRY_LABELS: Readonly<Record<string, string>> = Object.freeze({
  returning: "Returning",
  new: "New",
});

export const ONBOARDING_ITEM_LABELS: Readonly<Record<OnboardingItemStatus, string>> = Object.freeze(
  {
    pending: "Pending",
    invited: "Invited",
    // LAN-214: `claimed` joined the enum this label map is keyed on. The word
    // itself is not this package's to place on a screen — W6 owns where it
    // sits visually against `complete` (delegated to the Mission Lead) — this
    // entry exists only so the map stays total over `OnboardingItemStatus`
    // and this route keeps compiling.
    claimed: "Claimed",
    complete: "Complete",
    waived: "Waived",
    not_applicable: "Not applicable",
  },
);

/** The label for a value, falling back to the value so nothing renders blank. */
export { labelFor } from "../labels";

/**
 * The statuses the roster filter offers, in the season's own order.
 *
 * The whole vocabulary, deliberately: an operator looking for somebody who has
 * gone needs to be able to find them, and a filter that hid half the states
 * would send them to the database.
 */
export const FILTERABLE_MEMBERSHIP_STATUSES: readonly MembershipStatus[] = Object.freeze([
  "onboarding",
  "active",
  "inactive",
  "departed",
  "archived",
]) as readonly MembershipStatus[];

export const FILTERABLE_ENTRIES: readonly string[] = Object.freeze(["returning", "new"]);

/**
 * Colour never carries meaning alone — every chip states its status in words,
 * which is what the accessibility criterion in the ticket contract asks for.
 * This only decides which of them the eye reaches first.
 */
export function membershipStatusColour(
  status: MembershipStatus | string,
): "default" | "info" | "success" | "warning" {
  switch (status) {
    case "active":
      return "success";
    case "onboarding":
      return "info";
    case "inactive":
      return "warning";
    default:
      return "default";
  }
}

/**
 * UX-20's Onboarding column, in one sentence.
 *
 * Four distinct things an operator needs to tell apart, and each gets its own
 * words rather than a shared "incomplete":
 *
 *   * no items at all — a real configuration state, not a failure;
 *   * everything resolved;
 *   * required items outstanding, which is what activation will ask about;
 *   * only optional items left, which will not stand in anybody's way.
 *
 * The wireframe's fourth value, "Waiver needed", is deliberately absent: it
 * would require a rule deciding when a waiver is *needed* rather than merely
 * possible, and no source in this issue states one. Inventing it here would be
 * an interface decision this ticket is not allowed to make. Recorded as a
 * deviation in the pull request.
 */
export function describeOnboarding(entry: RosterEntry): string {
  if (entry.itemsTotal === 0) return "No items configured";
  if (entry.requiredOutstanding > 0) {
    return `${entry.requiredOutstanding} outstanding`;
  }
  if (entry.itemsResolved === entry.itemsTotal) return "Complete";
  // "none blocking", not "optional". An unpaid subscription is very often
  // marked `is_required` — the pilot scenario marks it so deliberately — and
  // calling it optional would be false about the item while trying to be true
  // about the gate. This says only what the count means: nothing here stands
  // between this member and activation. Independent review caught the earlier
  // wording.
  const remaining = entry.itemsTotal - entry.itemsResolved;
  return `${remaining} outstanding, none blocking`;
}

/**
 * A fixed, explicit locale and time zone.
 *
 * Server and browser both render these strings, and `toLocaleString()` with
 * neither argument uses whatever each of them happens to be configured with —
 * a hydration mismatch on any machine not set to en-GB/London, and a date that
 * reads as American to a club in Oxford. The same reasoning, and the same
 * fixed pair, as the membership confirmation screen.
 */
export function formatWhen(value: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(value);
}

/** A plain date — `YYYY-MM-DD` as the club reads it. */
export function formatDay(value: string): string {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeZone: "Europe/London",
  }).format(parsed);
}
