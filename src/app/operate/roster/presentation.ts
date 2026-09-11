import type { MembershipStatus } from "@/lib/services/membership";

/**
 * The words the roster screens use, fixed in one place.
 *
 * LAN-90 § 4 requires the mapping from the frozen model's internal state names
 * to on-screen language to be decided once and used everywhere, "so three
 * issues do not invent three labels for one state". These are that mapping for
 * `membership_status` and `membership_entry`, read from the approved
 * wireframes rather than invented here: UX-20's status column reads Active
 * and Inactive; UX-20's entry column reads Returning and New.
 *
 * `onboarding_item_status`'s own mapping lives in `onboarding-item-shapes.ts`
 * (`itemStatusLabel`), not here — D-002 (correction round 3/4, Q-14) settled
 * that the word for a status varies per item ("Invoiced" is not "Complete"),
 * so it cannot be one flat map the way these two genuinely-uniform
 * vocabularies are.
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

/** The label for a value, falling back to the value so nothing renders blank. */
export { labelFor } from "../labels";

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
