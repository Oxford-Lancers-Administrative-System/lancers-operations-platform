import type { TermCoordinate, TermWindow } from "@/lib/services/event-input";
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
 * What a draft with nobody in its audience says — D47.
 *
 * It used to read "Chosen at approval", which is no longer true of most events:
 * a type whose template names a default audience arrives with one already set,
 * and only a type whose template says nothing arrives empty. So the words state
 * what is the case rather than what is about to happen.
 */
export const NO_AUDIENCE_YET = "Not chosen yet";

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

/**
 * What the builder says under its heading — and the one sentence in the
 * application that D47 explicitly reverses.
 *
 * It used to read: "Nothing is selected to begin with, and there is no
 * whole-roster default: the audience is stored as the explicit list you confirm
 * here." The last clause is still true and is still what the database holds. The
 * first is not: a type's template supplies a default audience, and the approver
 * checks it rather than rebuilding it.
 *
 * So the sentence now names the template that put people there, and says what to
 * do with them. A type whose template names no groups gets the second form,
 * because on that event nothing did arrive and there is nothing to check.
 */
export function describeBuilderDefault(
  eventTypeLabel: string,
  groupLabels: readonly string[],
): string {
  if (groupLabels.length === 0) return "Choose who this event is for.";
  return `The ${eventTypeLabel} template invites ${joinWithAnd(groupLabels).toLowerCase()}. Check it, change it, or add people by hand.`;
}

/** "A, B and C" — the club's punctuation rather than ICU's. */
export function joinWithAnd(parts: readonly string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** UX-42 — the empty-audience refusal, which is a screen rather than a toast. */
export const EMPTY_AUDIENCE_HEADLINE = "This event cannot be approved";

export const EMPTY_AUDIENCE_DETAIL =
  "The resolved audience is empty. No invitations or notification jobs were created.";

export const EMPTY_AUDIENCE_SERVER_NOTE =
  "Approval is refused on the server even if this screen is bypassed.";

/** UX-41 — the event, the people and the questions, read once before approving. */
export const APPROVAL_HEADLINE_PREFIX = "Approve";

/*
 * A paragraph explaining what approving does used to sit at the foot of this
 * screen — that it confirms the list, creates invitations, queues delivery and
 * freezes the audience. Brian removed it on 2026-08-21: "You don't really have
 * to explain what approving does because we already know what it is ... That's
 * over-explaining for no reason."
 *
 * Nothing replaced it, deliberately. The screen shows what is being approved and
 * the button says what it will do, and that is the whole of it.
 */

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
 * Brian's clarification freezes the audience at approval — no late additions,
 * no removals, no re-resolution — so the screen states that rather than leaving
 * an operator to discover it by looking for an edit control that does not exist.
 */
export const AUDIENCE_FROZEN_AT_APPROVAL =
  "Confirmed at approval and fixed for this event. Adding or removing someone afterwards " +
  "is deliberately not possible in this workflow.";

/**
 * The half of the Distribution fact that stops "invitations created" being read
 * as "invitations sent". Until LAN-78 dispatches the queued jobs, nothing has
 * reached anybody, and the screen has to say so rather than implying contact.
 */
export const NOTHING_DELIVERED_YET = "nothing delivered yet";

// ---------------------------------------------------------------------------
// Questions — amendment W4-A1
// ---------------------------------------------------------------------------

/** The heading the create-and-edit form and the event page share. */
export const QUESTIONS_HEADLINE = "Questions";

/** What the form says under it: what these are for, not what the rule is. */
export const QUESTIONS_FORM_DETAIL =
  "Asked on the RSVP page, in this order, alongside whether they are coming.";

/** What the approval review says under its own copy of them. */
export const QUESTIONS_REVIEW_DETAIL = "Exactly as they will appear on the RSVP page.";

/** The first thing every invitee is asked, and it is not one of these. */
export const RSVP_FIRST_QUESTION = "Are you coming?";

export const RSVP_FIRST_QUESTION_ANSWER = "Yes · No — a reason is asked on No";

/** D42. What marks a question that came with the type. */
export const FROM_TEMPLATE_CHIP_PREFIX = "From the";

export function fromTemplateChip(eventTypeLabel: string): string {
  return `${FROM_TEMPLATE_CHIP_PREFIX} ${eventTypeLabel} template`;
}

/** The empty state, which says what to do rather than what is absent. */
export const NO_QUESTIONS_YET = "Nothing extra is asked. Add a question if this event needs one.";

// ---------------------------------------------------------------------------
// Deleting a draft — REQ-delete-draft, D29
// ---------------------------------------------------------------------------

export const DELETE_DRAFT_HEADLINE = "Delete this draft";

export const DELETE_DRAFT_DETAIL = "It disappears from the calendar and cannot be brought back.";

export const DELETE_DRAFT_ACTION = "Delete draft";

export const DELETE_DRAFT_DIALOG_TITLE = "Delete this draft?";

/**
 * The confirmation's body — the reason a draft can be deleted at all.
 *
 * Brian, 2026-08-21, on the rule that an approved event cannot be deleted:
 * "That warning should pop up if you try to delete an approved event ... I don't
 * think it needs to be called out there specifically." So it is not here. It is
 * on the refusal, where somebody has actually run into it.
 */
export const DELETE_DRAFT_DIALOG_DETAIL =
  "It disappears from the calendar and cannot be brought back. Nobody has been told about " +
  "it, so nobody will be told it is gone.";

export const DELETE_DRAFT_KEEP = "Keep it";

// ---------------------------------------------------------------------------
// Duplicating an event — D39
// ---------------------------------------------------------------------------

export const DUPLICATE_ACTION = "Duplicate";

/**
 * What the create form says when it opened from another event.
 *
 * D39 as Brian settled it on 2026-08-22: duplicate opens the create form
 * prefilled, and nothing is written until the operator saves. The sentence says
 * which event it copied, because "prefilled from something" with no name is a
 * form an operator cannot check.
 */
export function duplicatedFrom(name: string): string {
  return `Copied from ${name}. Nothing is saved until you save it.`;
}

// ---------------------------------------------------------------------------
// The approval completeness gate — D16
// ---------------------------------------------------------------------------

export const INCOMPLETE_EVENT_HEADLINE = "This event cannot be approved";

/** Where the operator goes to fix it. */
export const INCOMPLETE_EVENT_ACTION = "Edit draft";
