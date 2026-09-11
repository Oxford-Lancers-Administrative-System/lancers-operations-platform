import { formatDay } from "@/app/operate/admin/presentation";
import type { OnboardingChaseNext, OnboardingLastContact } from "@/lib/services/onboarding-chase";

// The queue's two new columns, in words — LAN-218, `T11-visibility`. Decision history: docs/ux/tickets/LAN-218-chase-and-queue.md · missions/intake/M-PEOPLE-AND-ROSTER/decision-history.md.

export const NOT_YET_CONTACTED = "Not yet contacted";

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

const UNKNOWN_FAILURE_REASON = "the reason was not recorded";

/** `hasReachableNumber` defaults true so every existing caller keeps its wording; only `exhausted` reads it (correction round 2, F-1). Decision history: docs/ux/tickets/LAN-218-chase-and-queue.md · missions/intake/M-PEOPLE-AND-ROSTER/decision-history.md. */
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

export function chaseNeedsAHuman(next: OnboardingChaseNext): boolean {
  return (
    next.kind === "exhausted" || next.kind === "unmessageable" || next.kind === "terminal_failure"
  );
}

/** Whether a nudge is offered — `W8`'s refusal list, corrected round 1/2: no channel, or under 18; `hasReachableNumber` read independently of `kind` so exhaustion can't mask it. Decision history: docs/ux/tickets/LAN-218-chase-and-queue.md · missions/intake/M-PEOPLE-AND-ROSTER/decision-history.md. */
export function isNudgeable(next: OnboardingChaseNext, hasReachableNumber: boolean): boolean {
  return next.kind !== "unmessageable" && hasReachableNumber;
}
