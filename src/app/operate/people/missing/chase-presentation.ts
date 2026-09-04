import { formatDay } from "@/app/operate/admin/presentation";
import type { OnboardingChaseNext, OnboardingLastContact } from "@/lib/services/onboarding-chase";

/**
 * The queue's two new columns, in words — LAN-218, `T11-visibility`.
 *
 * Wording matches the approved `W8-01` mockup verbatim for "Chase exhausted"
 * and "Unmessageable · under 18" — the short form every one of the three
 * approved screens actually uses; `W8-03`'s own richer per-row detail (a
 * delivered count, a withdrawal date) is additional colour the workflow's
 * prose never fixes as required copy, and is not reproduced here.
 *
 * Two of the mockup's own three short forms were superseded in Brian's
 * 2026-09-03 walkthrough (correction round 1), recorded as Q-11 and cited in
 * the correcting PR rather than treated as a silent departure from an
 * approved screen:
 *
 *   - "Unmessageable · no consent" is gone (`C-4`) — see
 *     {@link OnboardingChaseNext}'s own comment in `onboarding-chase.ts` for
 *     why a team member lacking granted consent is no longer modelled as
 *     unmessageable at all.
 *   - "Delivery failed · needs a person" is gone (`C-5`) — Brian: "it should
 *     show them why the failure is there." Replaced by the real,
 *     provider-neutral reason `onboarding-chase.ts` already carries off
 *     `delivery_results`, on the same footing `delivery.ts`'s own event
 *     delivery screen already shows an operator. No new detection or
 *     categorisation is built here — the stored sentence is shown as-is.
 *
 * "Unmessageable · under 18" is unaffected, and a new short form joins it —
 * `C-1`/`C-2`/`C-3`: a person with no reachable mobile number is not merely
 * "unmessageable" in the abstract, so the row says the concrete fact plainly
 * rather than reusing that word.
 */

export const NOT_YET_CONTACTED = "Not yet contacted";

/**
 * Correction round 2, F-1: the exact wording `formatChaseNext`'s own
 * `no_channel` branch already returns — shared so the exhausted-and-
 * unreachable row below says the same plain thing rather than a second copy
 * that could drift from it.
 */
const NO_PHONE_NUMBER_ON_FILE = "No phone number on file";

export function formatLastContact(contact: OnboardingLastContact | null): string {
  if (!contact) return NOT_YET_CONTACTED;
  const when = formatDay(contact.occurredAt);
  if (contact.kind === "welcome") return `The welcome · ${when}`;
  if (contact.kind === "nudge") {
    return contact.byDisplayName
      ? `Nudge by ${contact.byDisplayName} · ${when}`
      : `Nudge · ${when}`;
  }
  return contact.ordinal ? `Follow-up ${contact.ordinal} · ${when}` : `Follow-up · ${when}`;
}

/** Shown when a terminally failed attempt somehow carries no recorded reason — belt and braces; every real failure sets one. */
const UNKNOWN_FAILURE_REASON = "the reason was not recorded";

/**
 * `hasReachableNumber` defaults `true` so every existing caller (and the
 * cases where it plainly does not apply — `scheduled`, `unmessageable`,
 * `terminal_failure`, `no_automated_chase`, none of which this defaulting
 * touches) keeps its exact wording. Only `exhausted` reads it — correction
 * round 2, F-1: `describeOnboardingChaseNext` reports `exhausted` before it
 * ever reaches the `no_channel` check (deliberate, C-1 — exhaustion is
 * permanent and must not be masked by a later-added number), so a person who
 * is both exhausted and unreachable never gets the `no_channel` wording from
 * `next` alone. Say the concrete, actionable fact plainly instead of the
 * generic "exhausted" one, the same way `no_channel` already does.
 */
export function formatChaseNext(next: OnboardingChaseNext, hasReachableNumber = true): string {
  switch (next.kind) {
    case "scheduled":
      return formatDay(next.at);
    case "exhausted":
      return hasReachableNumber ? "Chase exhausted" : NO_PHONE_NUMBER_ON_FILE;
    case "unmessageable":
      return next.reason === "under_18" ? "Unmessageable · under 18" : NO_PHONE_NUMBER_ON_FILE;
    case "terminal_failure":
      return `Delivery failed · ${next.reason ?? UNKNOWN_FAILURE_REASON}`;
    case "no_automated_chase":
      return "No automated chase";
  }
}

/** The three cases `T11-visibility` names as "a person a human has to handle." */
export function chaseNeedsAHuman(next: OnboardingChaseNext): boolean {
  return (
    next.kind === "exhausted" || next.kind === "unmessageable" || next.kind === "terminal_failure"
  );
}

/**
 * Whether a nudge to this person is offered at all — `W8`'s own refusal
 * list, corrected in round 1 (`C-1`/`C-3`/`C-4`): no channel, or under 18. A
 * team member who has not granted consent is no longer refused here — see
 * `onboarding-chase.ts`'s own comment on why `no_consent` is gone. A person
 * with no reachable number is refused, and plainly so — Brian, 2026-09-03:
 * "if there's no number, nudge doesn't do anything… that is something the
 * president needs to go off and get their real phone number." The queue's
 * own `correctHref` (unaffected by this package) is where that correction is
 * made; this function only ever decides whether the button appears.
 *
 * Correction round 2, F-1: `next.kind !== "unmessageable"` alone let an
 * exhausted person with no reachable number keep an active Nudge button —
 * `describeOnboardingChaseNext` reports `exhausted` before it ever reaches
 * the `no_channel` check (deliberate, C-1), so `kind` on its own cannot see
 * the missing number once exhaustion has claimed the row. `hasReachableNumber`
 * is read independently of `kind` so it refuses regardless of what else is
 * true of the row — exhausted or not. Exhaustion itself still only warns
 * (`chaseNeedsAHuman`, unaffected by this parameter) and never refuses on its
 * own: an exhausted person who does have a number keeps the nudge.
 */
export function isNudgeable(next: OnboardingChaseNext, hasReachableNumber: boolean): boolean {
  return next.kind !== "unmessageable" && hasReachableNumber;
}
