import { formatDay } from "@/app/operate/admin/presentation";
import type { OnboardingChaseNext, OnboardingLastContact } from "@/lib/services/onboarding-chase";

/**
 * The queue's two new columns, in words — LAN-218, `T11-visibility`.
 *
 * Wording matches the approved `W8-01` mockup verbatim ("Chase exhausted",
 * "Unmessageable · no consent", "Delivery failed · needs a person") — the
 * short form every one of the three approved screens actually uses; `W8-03`'s
 * own richer per-row detail (a delivered count, a withdrawal date) is
 * additional colour the workflow's prose never fixes as required copy, and
 * is not reproduced here.
 */

export const NOT_YET_CONTACTED = "Not yet contacted";

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

export function formatChaseNext(next: OnboardingChaseNext): string {
  switch (next.kind) {
    case "scheduled":
      return formatDay(next.at);
    case "exhausted":
      return "Chase exhausted";
    case "unmessageable":
      return next.reason === "under_18" ? "Unmessageable · under 18" : "Unmessageable · no consent";
    case "terminal_failure":
      return "Delivery failed · needs a person";
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

/** Whether a nudge to this person is offered at all — `W8`'s own refusal list: no consent, no channel, or under 18. */
export function isNudgeable(next: OnboardingChaseNext): boolean {
  return next.kind !== "unmessageable";
}
