import type { TermCoordinate, TermWindow } from "@/lib/services/event-input";
import type { EventListEntry } from "@/lib/services/events";
import { labelFor, TERM_LABELS } from "@/lib/services/event-vocabulary";

/**
 * How an event reads on the **operator's** screens — UX-30, UX-31, UX-32, UX-33.
 *
 * Presentation only: every function here is pure, takes what the service
 * returned, and decides nothing. It is a separate module from the screens
 * because four of them show the same status, the same date and the same two
 * flags, and a label that differs between the list and the detail is a defect
 * an operator finds before a test does.
 *
 * The club's shared vocabulary — the type names, the status words, the date
 * formatters — moved to `@/lib/services/event-vocabulary` when LAN-153 opened a
 * public calendar, and is re-exported below. What is left in this file is what
 * only an operator ever reads: the audience column, the approval copy, the
 * origin of an event, and the sentence beside the joining URL.
 */

/**
 * The club's words for an event, and how its dates read, now live in
 * `@/lib/services/event-vocabulary` — LAN-153 opened a public calendar, and a
 * practice is a **Practice** whoever is reading. They are re-exported here so
 * that the operator screens, which have imported them from this module since
 * LAN-76, keep one import each and the move is not a diff across twenty files.
 *
 * Anything **tiered** stayed out of the shared module. What a screen may show is
 * `@/lib/auth/event-tier`'s question, and nothing in the vocabulary answers it.
 */
export {
  CLUB_TIME_ZONE,
  DELIVERY_MODE_LABELS,
  DERIVED_STATE_LABELS,
  describeAttendance,
  formatDetailWhen,
  formatListWhen,
  formatLongDate,
  formatShortDate,
  formatTimes,
  labelFor,
  SHORT_MONTHS,
  shortMonthOf,
  STATUS_LABELS,
  TERM_LABELS,
  TYPE_LABELS,
  venueLabel,
} from "@/lib/services/event-vocabulary";

/**
 * What the Audience column says.
 *
 * Brian's LAN-76 clarification asks the list to "make it clear that response
 * and audience information will not exist until the approval workflow is
 * completed". "Not resolved" did not say that — it reads as an omission
 * somebody should go and fix, when in fact there is nothing to fix and nothing
 * to do until approval. So a pre-approval event says when the audience
 * arrives, rather than that it is missing.
 */
export function describeAudience(event: EventListEntry): string {
  if (event.invitationCount > 0) return `${event.invitationCount} invited`;
  if (event.audienceCount > 0) return `${event.audienceCount} selected`;
  if (isPreApproval(event.status)) return "Chosen at approval";
  return "None recorded";
}

/**
 * The sentence above the list, saying the same thing once rather than in every
 * row.
 */
export const AUDIENCE_AND_RESPONSES_COME_LATER =
  "A draft has no invitations and no responses, and cannot have any. The audience is " +
  "chosen and confirmed during approval, which is when anything is sent at all.";

/** The same statement, for the form and the event itself. */
export const AUDIENCE_COMES_LATER =
  "You are recording the event's operational facts. Who it goes to is chosen and confirmed " +
  "during the approval step, and nothing is sent to anybody until an approver has completed " +
  "it.";

/**
 * The sentence a draft or pending event carries, stated as the structural fact
 * it is rather than as a description of what happens to be true today.
 *
 * LAN-76 acceptance criterion: "A draft or pending event shows explicitly that
 * it has no invitations and cannot have any yet."
 */
export const NO_DISTRIBUTION_HEADLINE = "Nothing distributed";

export const NO_DISTRIBUTION_DETAIL = "No invitations or responses";

export const NO_DISTRIBUTION_RULE =
  "A draft can carry no invitations, responses or attendance. " +
  "Nothing is sent until the designated approver approves it.";

/**
 * True where that rule applies. One state, since LAN-151 retired
 * `pending_approval` — there is no step between drafting and approval.
 */
export function isPreApproval(status: string): boolean {
  return status === "draft";
}

// ---------------------------------------------------------------------------
// What only the operator reads
// ---------------------------------------------------------------------------

/**
 * D86. The zone every event time is in, said on the **form** rather than
 * assumed.
 *
 * The recorded defect this closes: the date input renders in the browser's
 * locale, so an operator in Oxford could be reading `mm/dd/yyyy`, and the two
 * time fields carried no zone at all. Per-user timezones are a later release
 * (DEC-timezone); this is the club's, fixed, and stated.
 */
export const CLUB_TIME_ZONE_NOTE =
  "Dates and times are Europe/London — the club's own clock — and times are entered in " +
  "five-minute steps.";

/**
 * `REQ-no-joining-url`, said to the operator entering one.
 *
 * The rule is real and enforced in the service layer — the public projection has
 * no column for a joining URL and no field to put one in
 * (`listPublicSeasonEvents`) — and this is the sentence that stops somebody
 * assuming the link will reach people because they typed it in.
 */
export const JOINING_URL_IS_NEVER_PUBLIC =
  "Never shown on the public calendar or in a subscription feed. How an invited person " +
  "receives it is not yet built.";

/** `event_origin` in the club's words — Source Data Analysis §5.6. */
export const ORIGIN_LABELS: Readonly<Record<string, string>> = Object.freeze({
  club_controlled: "Club",
  externally_assigned: "Assigned externally",
  externally_scheduled: "Scheduled externally",
  negotiated: "Negotiated",
});

/**
 * The derived coordinate in the club's words — "Michaelmas 2026-27, Week 1", or
 * "Outside term" for a date no Oxford term contains.
 *
 * Takes the terms rather than a label because it is fed by
 * `deriveTermCoordinate`, which returns ids: the same function runs in the
 * browser as the operator picks a date and on the server when the draft is
 * saved, and both need to say the same sentence.
 *
 * This is the **form's** sentence, about the coordinate that will be stored. The
 * calendar's own answer is `@/lib/services/oxford-year`, which is a wider one:
 * it names the vacation a date falls in, and the stored coordinate has no way to
 * hold that (`events.week_number` is constrained to −1..8).
 */
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

/** "Michaelmas 2026-27 · Week 2", or the part of it that is known. */
export function formatTermAndWeek(termLabel: string | null, weekNumber: number | null): string {
  const term = termLabel
    ? termLabel.replace(/^(\w+)/, (name) => labelFor(TERM_LABELS, name.toLowerCase()))
    : null;
  const week = weekNumber === null ? null : `Week ${weekNumber}`;
  if (term && week) return `${term} · ${week}`;
  return term ?? week ?? "Outside term";
}

// ---------------------------------------------------------------------------
// Approval — UX-40, UX-41, UX-42 and UX-43
// ---------------------------------------------------------------------------

/**
 * The RSVP deadline, in the club's own zone — "Friday, 16 October 2026 at 18:00".
 *
 * The only value on these screens that is a genuine **instant** rather than a
 * bare date or time, so unlike everything above it, it is formatted in
 * `Europe/London` rather than UTC. Rendering it at UTC would show an October
 * deadline an hour early for the whole of British Summer Time, which is most of
 * the first half of a season.
 */
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

/** `invitation_capacity`, in the club's words. UX-40's Capacity column. */
export const CAPACITY_LABELS: Readonly<Record<string, string>> = Object.freeze({
  player: "Player",
  coach: "Coach",
  committee: "Committee",
  guest: "Guest",
  recruit: "Recruit",
});

/** UX-40's heading, and the sentence under it. */
export const AUDIENCE_BUILDER_HEADLINE = "Build event audience";

export const AUDIENCE_BUILDER_DETAIL =
  "Select current active memberships and any eligible coaching or committee capacities. " +
  "Nothing is selected to begin with, and there is no whole-roster default: the audience " +
  "is stored as the explicit list you confirm here.";

/** UX-42 — the empty-audience refusal, which is a screen rather than a toast. */
export const EMPTY_AUDIENCE_HEADLINE = "This event cannot be approved";

export const EMPTY_AUDIENCE_DETAIL =
  "The resolved audience is empty. No invitations or notification jobs were created.";

export const EMPTY_AUDIENCE_SERVER_NOTE =
  "Approval is refused on the server even if this screen is bypassed.";

/** UX-41 — what approval will do, said before it is done. */
export const APPROVAL_HEADLINE_PREFIX = "Approve";

export const APPROVAL_DETAIL =
  "Approval is limited to the designated approver. It confirms this exact list of people, " +
  "creates their invitations and queues automated delivery. The audience is frozen once " +
  "approved — this workflow has no way to add, remove or re-send afterwards.";

export const DISTRIBUTION_AUTOMATED = "Automated 1:1 WhatsApp";

export const DISTRIBUTION_BEGINS_AFTER_APPROVAL = "Begins only after approval";

/**
 * What a clamped deadline says. Brian's rule: approval is never refused for
 * being late, and the approver is told that responses are due at once.
 */
export const DEADLINE_DUE_IMMEDIATELY = "Due immediately";

export const DEADLINE_DUE_IMMEDIATELY_DETAIL =
  "The usual deadline for this kind of event has already passed, so anyone who has not " +
  "answered will appear as an outstanding response straight away.";

export const DEADLINE_NONE = "No deadline";

export const DEADLINE_NONE_DETAIL = "This event asks for no response, so nothing expires.";

/** UX-43 — approved, and what exists now that did not before. */
export const APPROVED_HEADLINE = "Event approved";

export const APPROVED_NOTHING_SENT_YET =
  "Nothing has been delivered yet. Each invitation has a queued job waiting for automated " +
  "delivery, and delivery status will follow from the results of those jobs.";

/**
 * What the Audience fact says once there is one.
 *
 * It used to add "Adding or removing someone afterwards is deliberately not
 * possible in this workflow". LAN-156 took that sentence out, for two reasons.
 * It narrated a rule rather than saying what the screen shows, which is the
 * thing Brian has asked for repeatedly. And W5's "second reversal of LAN-77"
 * records D49 and D50 as overriding the claim it made: an approved event can
 * now be changed, and the sentence sat directly above an **Edit event** button
 * saying it could not.
 *
 * The audience is still not editable during an amendment — no surface in the
 * approved mockups offers that — and the honest way to say so is to say nothing
 * about it rather than to describe a permanence the mission has reversed.
 */
export const AUDIENCE_FROZEN_AT_APPROVAL = "Confirmed at approval.";

/**
 * The half of the Distribution fact that stops "invitations created" being read
 * as "invitations sent". Until LAN-78 dispatches the queued jobs, nothing has
 * reached anybody, and the screen has to say so rather than implying contact.
 */
export const NOTHING_DELIVERED_YET = "nothing delivered yet";
