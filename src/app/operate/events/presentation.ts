import type { AudiencePerson } from "@/lib/services/audience-selection";
import type { DeliveryState } from "@/lib/services/delivery";
import type { TermCoordinate, TermWindow } from "@/lib/services/event-input";
import { joinWithAnd, labelFor, shortMonthOf, TERM_LABELS } from "@/lib/services/event-vocabulary";

// How an event reads on the operator's screens — UX-30..33. Shared vocabulary moved to event-vocabulary.ts (LAN-153) and is re-exported below.
export {
  DELIVERY_MODE_LABELS,
  DERIVED_STATE_LABELS,
  describeAttendance,
  formatDetailWhen,
  formatListWhen,
  formatLongDate,
  joinWithAnd,
  JOINING_LINK_LABEL,
  labelFor,
  STATUS_LABELS,
  TYPE_LABELS,
  venueLabel,
} from "@/lib/services/event-vocabulary";

/** What a draft with nobody in its audience says — D47. Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md · docs/ux/tickets/LAN-156-amend-and-cancel.md · missions/intake/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY/decision-history.md · missions/intake/M-PEOPLE-AND-ROSTER/decision-history.md. */
export const NO_AUDIENCE_YET = "Not chosen yet";

export const NO_DISTRIBUTION_HEADLINE = "Nothing distributed";

export const NO_DISTRIBUTION_DETAIL = "No invitations or responses";

export function isPreApproval(status: string): boolean {
  return status === "draft";
}

/** D86. The zone every event time is in, said on the form (fixes a locale-rendering defect). Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md · docs/ux/tickets/LAN-156-amend-and-cancel.md · missions/intake/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY/decision-history.md · missions/intake/M-PEOPLE-AND-ROSTER/decision-history.md. */
export const CLUB_TIME_ZONE_NOTE =
  "Dates and times are Europe/London — the club's own clock — and times are entered in " +
  "five-minute steps.";

/** What an operator pasting a joining link is told — LAN-284, Brian 2026-09-09. Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md · docs/ux/tickets/LAN-156-amend-and-cancel.md · missions/intake/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY/decision-history.md · missions/intake/M-PEOPLE-AND-ROSTER/decision-history.md. */
export const JOINING_URL_IS_PUBLIC_WARNING =
  "Published on the public calendar and in the subscription feed. Make sure the meeting " +
  "itself requires a passcode.";

/** "Michaelmas 2026-27, Week 1" / "Outside term". Fed by `deriveTermCoordinate`'s ids. Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md · docs/ux/tickets/LAN-156-amend-and-cancel.md · missions/intake/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY/decision-history.md · missions/intake/M-PEOPLE-AND-ROSTER/decision-history.md. */
export function describeTermCoordinate(
  coordinate: TermCoordinate,
  terms: readonly TermWindow[],
): string {
  if (coordinate.termId === null) {
    return "Outside Oxford term — no term or week is recorded.";
  }
  const term = terms.find((candidate) => candidate.id === coordinate.termId);
  if (!term) return "Outside Oxford term — no term or week is recorded.";

  const name = labelFor(TERM_LABELS, term.name);
  const week = coordinate.weekNumber === -1 ? "Week −1" : `Week ${coordinate.weekNumber}`;
  return `${name} ${term.academicYear}, ${week}`;
}

export function formatTermAndWeek(termLabel: string | null, weekNumber: number | null): string {
  const term = termLabel
    ? termLabel.replace(/^(\w+)/, (name) => labelFor(TERM_LABELS, name.toLowerCase()))
    : null;
  const week = weekNumber === null ? null : `Week ${weekNumber}`;
  if (term && week) return `${term} · ${week}`;
  return term ?? week ?? "Outside term";
}

export function formatDeadline(at: Date | string): string {
  const instant = at instanceof Date ? at : new Date(at);
  const parts = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "Europe/London" }).format(instant);

  const weekday = parts({ weekday: "long" });
  const day = parts({ day: "numeric" });
  const month = parts({ month: "long" });
  const year = parts({ year: "numeric" });
  const time = parts({ hour: "2-digit", minute: "2-digit", hour12: false });
  return `${weekday}, ${day} ${month} ${year} at ${time}`;
}

export const CAPACITY_LABELS: Readonly<Record<string, string>> = Object.freeze({
  player: "Player",
  coach: "Coach",
  committee: "Committee",
  guest: "Guest",
  recruit: "Recruit",
});

/** The picker row's second line: every capacity a person holds, in order — LAN-294. Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md · docs/ux/tickets/LAN-156-amend-and-cancel.md · missions/intake/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY/decision-history.md · missions/intake/M-PEOPLE-AND-ROSTER/decision-history.md. */
export function describeAudienceRow(person: AudiencePerson): string {
  const parts: string[] = [];

  person.capacities.forEach((capacity, index) => {
    parts.push(labelFor(CAPACITY_LABELS, capacity));
    const standing = person.standings[index];
    if (standing) parts.push(standing);
    if (capacity === "player" && person.unit) parts.push(person.unit);
  });

  if (person.contact) parts.push(person.contact);
  return parts.join(" · ");
}

export const AUDIENCE_BUILDER_HEADLINE = "Build event audience";

/** The builder's sub-heading — D47's reversal: names the template default rather than "nothing selected". Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md · docs/ux/tickets/LAN-156-amend-and-cancel.md · missions/intake/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY/decision-history.md · missions/intake/M-PEOPLE-AND-ROSTER/decision-history.md. */
export function describeBuilderDefault(
  eventTypeLabel: string,
  groupLabels: readonly string[],
): string {
  if (groupLabels.length === 0) return "Choose who this event is for.";
  return `The ${eventTypeLabel} template invites ${joinWithAnd(groupLabels).toLowerCase()}. Check it, change it, or add people by hand.`;
}

export const EMPTY_AUDIENCE_HEADLINE = "This event cannot be approved";

export const EMPTY_AUDIENCE_DETAIL =
  "The resolved audience is empty. No invitations or notification jobs were created.";

export const APPROVAL_HEADLINE_PREFIX = "Approve";

// Brian removed the "what approving does" paragraph on 2026-08-21 — see relocations.md. Nothing replaced it.

export const DISTRIBUTION_AUTOMATED = "Automated 1:1 WhatsApp";

export const DISTRIBUTION_BEGINS_AFTER_APPROVAL = "Begins only after approval";

export const DEADLINE_DUE_IMMEDIATELY = "Due immediately";

export const DEADLINE_DUE_IMMEDIATELY_DETAIL =
  "The usual deadline for this kind of event has already passed, so anyone who has not " +
  "answered will appear as an outstanding response straight away.";

export const DEADLINE_NONE = "No deadline";

export const DEADLINE_NONE_DETAIL = "This event asks for no response, so nothing expires.";

export const APPROVED_HEADLINE = "Event approved";

export const APPROVED_NOTHING_SENT_YET =
  "Nothing has been delivered yet. Each invitation has a queued job waiting for automated " +
  "delivery, and delivery status will follow from the results of those jobs.";

/** LAN-156 dropped the "not editable afterwards" sentence — D49/D50 reversed it. Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md · docs/ux/tickets/LAN-156-amend-and-cancel.md · missions/intake/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY/decision-history.md · missions/intake/M-PEOPLE-AND-ROSTER/decision-history.md. */
export const AUDIENCE_FROZEN_AT_APPROVAL = "Confirmed at approval.";

/** One state among several — see {@link describeDistribution}. Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md · docs/ux/tickets/LAN-156-amend-and-cancel.md · missions/intake/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY/decision-history.md · missions/intake/M-PEOPLE-AND-ROSTER/decision-history.md. */
export const NOTHING_DELIVERED_YET = "nothing delivered yet";

/** What the Distribution fact says, from the real job states — LAN-243. Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md · docs/ux/tickets/LAN-156-amend-and-cancel.md · missions/intake/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY/decision-history.md · missions/intake/M-PEOPLE-AND-ROSTER/decision-history.md. */
export interface DistributionCounts {
  queued: number;
  attempted: number;
  delivered: number;
  failed: number;
  retryable: number;
  held: number;
  cancelled: number;
}

function describeDelivery(counts: DistributionCounts): string {
  const parts: string[] = [];
  if (counts.delivered > 0) parts.push(`${counts.delivered} delivered`);
  if (counts.attempted > 0) parts.push(`${counts.attempted} attempted`);
  if (counts.queued > 0) parts.push(`${counts.queued} queued`);
  if (counts.retryable > 0) parts.push(`${counts.retryable} retryable`);
  if (counts.failed > 0) parts.push(`${counts.failed} failed`);
  if (counts.held > 0) parts.push(`${counts.held} held`);
  if (counts.cancelled > 0) parts.push(`${counts.cancelled} cancelled`);
  return parts.length === 0 ? NOTHING_DELIVERED_YET : parts.join(" · ");
}

export function describeDistribution(
  invitationCount: number,
  responseCount: number,
  counts: DistributionCounts,
): string {
  return `${invitationCount} invitations · ${responseCount} responses · ${describeDelivery(counts)}`;
}

const NO_DELIVERY_COUNTS: DistributionCounts = Object.freeze({
  queued: 0,
  attempted: 0,
  delivered: 0,
  failed: 0,
  retryable: 0,
  held: 0,
  cancelled: 0,
});

export function countDeliveryStates(
  participation: { people: readonly { delivery: DeliveryState | null }[] } | null,
): DistributionCounts {
  if (participation === null) return { ...NO_DELIVERY_COUNTS };

  const counts: DistributionCounts = { ...NO_DELIVERY_COUNTS };
  for (const person of participation.people) {
    if (person.delivery === null) continue;
    counts[person.delivery] += 1;
  }
  return counts;
}

export const QUESTIONS_HEADLINE = "Questions";

export const QUESTIONS_FORM_DETAIL =
  "Asked on the RSVP page, in this order, alongside whether they are coming.";

export const QUESTIONS_REVIEW_DETAIL = "Exactly as they will appear on the RSVP page.";

export const RSVP_FIRST_QUESTION = "Are you coming?";

export const RSVP_FIRST_QUESTION_ANSWER = "Yes · No — a reason is asked on No";

const FROM_TEMPLATE_CHIP_PREFIX = "From the";

export function fromTemplateChip(eventTypeLabel: string): string {
  return `${FROM_TEMPLATE_CHIP_PREFIX} ${eventTypeLabel} template`;
}

export const DELETE_DRAFT_HEADLINE = "Delete this draft";

export const DELETE_DRAFT_DETAIL = "It disappears from the calendar and cannot be brought back.";

export const DELETE_DRAFT_ACTION = "Delete draft";

export const DELETE_DRAFT_DIALOG_TITLE = "Delete this draft?";

/** Brian, 2026-08-21: the "approved events can't be deleted" warning lives on the refusal, not here. Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md · docs/ux/tickets/LAN-156-amend-and-cancel.md · missions/intake/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY/decision-history.md · missions/intake/M-PEOPLE-AND-ROSTER/decision-history.md. */
export const DELETE_DRAFT_DIALOG_DETAIL =
  "It disappears from the calendar and cannot be brought back. Nobody has been told about " +
  "it, so nobody will be told it is gone.";

export const DELETE_DRAFT_KEEP = "Keep it";

export const DUPLICATE_ACTION = "Duplicate";

/** D39, Brian 2026-08-22: names the source event, since an unnamed "prefilled" form can't be checked. Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md · docs/ux/tickets/LAN-156-amend-and-cancel.md · missions/intake/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY/decision-history.md · missions/intake/M-PEOPLE-AND-ROSTER/decision-history.md. */
export function duplicatedFrom(name: string): string {
  return `Copied from ${name}. Nothing is saved until you save it.`;
}

export const INCOMPLETE_EVENT_HEADLINE = "This event cannot be approved";

export const INCOMPLETE_EVENT_ACTION = "Edit draft";

/** "Sat 10 Oct · 18:00" — compact, Europe/London, via `shortMonthOf`'s fixed 3-letter table. Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md · docs/ux/tickets/LAN-156-amend-and-cancel.md · missions/intake/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY/decision-history.md · missions/intake/M-PEOPLE-AND-ROSTER/decision-history.md. */
export function formatPlanWhen(at: Date): string {
  const part = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "Europe/London" }).format(at);
  const weekday = part({ weekday: "short" });
  const day = part({ day: "numeric" });
  const isoDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
  const month = shortMonthOf(isoDate);
  const time = part({ hour: "2-digit", minute: "2-digit", hour12: false });
  return `${weekday} ${day} ${month} · ${time}`;
}

export const MESSAGING_PLAN_HEADLINE = "Messaging plan";

export function describePlanStepCount(steps: number): string {
  return `${steps} ${steps === 1 ? "step" : "steps"}`;
}

export const PLAN_COMMITS_ON_APPROVAL = "Approval commits this plan.";
export const PLAN_FROZEN_AT_APPROVAL = "Frozen at approval.";
export const PLAN_NO_QUIET_HOURS = "No quiet-hours adjustment.";
export const PLAN_RECOVERY_NOTE =
  "Failed sends retry automatically. Remaining errors appear in Delivery.";

/** F-A2: shown for an approved event with no messaging-plan row at all. Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md · docs/ux/tickets/LAN-156-amend-and-cancel.md · missions/intake/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY/decision-history.md · missions/intake/M-PEOPLE-AND-ROSTER/decision-history.md. */
export const PLAN_MISSING_HEADLINE = "No messaging plan";
export const PLAN_MISSING_NOTE =
  "This event was approved before it had one. Amending the event creates it.";

/** W1's guarantee, stated not derived — Brian, 2026-08-22. Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md · docs/ux/tickets/LAN-156-amend-and-cancel.md · missions/intake/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY/decision-history.md · missions/intake/M-PEOPLE-AND-ROSTER/decision-history.md. */
export const PLAN_DISPATCHES_IMMEDIATELY =
  "This event is closer than its own invitation lead, so its invitation goes out now rather " +
  "than on a stated date.";

/** `REQ-late-approval`, named on the panel — W1. Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md · docs/ux/tickets/LAN-156-amend-and-cancel.md · missions/intake/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY/decision-history.md · missions/intake/M-PEOPLE-AND-ROSTER/decision-history.md. */
export const PLAN_LATE_APPROVAL =
  "There is not enough runway for the full ladder. This event still chases: it sends " +
  "immediately, fills the time it has with WhatsApp only, and does not escalate to the " +
  "President.";

export function describeWhatsAppErrorCount(count: number): string {
  return count === 1 ? "1 user has an error." : `${count} users have an error.`;
}

export function whatsAppErrorDisclosureLabel(count: number): string {
  return count === 1 ? "See 1 user with error" : `See ${count} users with error`;
}

export const WHATSAPP_ERROR_DETAIL = "WhatsApp error";
