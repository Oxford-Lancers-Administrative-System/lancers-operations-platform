import type { AudiencePerson } from "@/lib/services/audience-selection";
import type { DeliveryState } from "@/lib/services/delivery";
import type { TermCoordinate, TermWindow } from "@/lib/services/event-input";
import { joinWithAnd, labelFor, shortMonthOf, TERM_LABELS } from "@/lib/services/event-vocabulary";

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
  joinWithAnd,
  JOINING_LINK_LABEL,
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
 * What an operator pasting a joining link is told — LAN-284, Brian 2026-09-09.
 *
 * This replaces `JOINING_URL_IS_NEVER_PUBLIC`, and the reversal is the whole
 * point of the sentence. The link used to be operator-only, and the old text
 * said so. It is now published on the public event page and carried in the
 * subscription feed, and the only thing standing between an unprotected meeting
 * and the open internet is the operator's own care over what they paste —
 * nothing in this application can check whether a meeting has a passcode set.
 *
 * So this is a warning rather than a note, and it is one line rather than a
 * gate: the operator is told what will happen and what to make sure of, and
 * then trusted, because a gate here could only ever be a checkbox asserting
 * something the application cannot verify.
 */
export const JOINING_URL_IS_PUBLIC_WARNING =
  "Published on the public calendar and in the subscription feed. Make sure the meeting " +
  "itself requires a passcode.";

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

/**
 * The second line of a picker row — everything the club knows about that person,
 * in labels and values and nothing else. LAN-294.
 *
 * One row is one human now, so the line has to carry every capacity they hold.
 * Brian, 2026-09-10, on how much that matters: "it can be one thing; it can be
 * subdivided, doesn't really matter." So the shape is the simplest one that
 * stays readable — each capacity followed by its standing, in the order a write
 * would pick between them, with the playing unit sitting where it belongs
 * (against the player capacity, not stranded at the end) and one contact at the
 * close:
 *
 *     Player · Active · Both · Committee · President · bertram@…
 *
 * No sentence, no explanation, no arithmetic — `docs/ux/slice-ux.md` §6.
 */
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
 * as "invitations sent". Until a job has run, nothing has reached anybody, and
 * the screen has to say so rather than implying contact.
 *
 * This is now **one state among several** rather than the only thing the fact
 * can say — see {@link describeDistribution}.
 */
export const NOTHING_DELIVERED_YET = "nothing delivered yet";

/**
 * What the Distribution fact says about delivery, from the real job states.
 *
 * ## The defect this replaces — LAN-243
 *
 * `NOTHING_DELIVERED_YET` used to be interpolated unconditionally whenever the
 * event had any invitation at all. Every approved event therefore claimed
 * nothing had been delivered **forever**, directly above a participation table
 * where most rows carried a green **Delivered** chip — two answers to "did it
 * reach them?" on one screen, which is exactly what `docs/ux/standards.md`
 * rule 7 forbids. `docs/operating-the-slice.md` expects those three words in
 * one state only: after approval, before any job has run.
 *
 * ## The counts come from the table on the same page
 *
 * Not from a second query. The event page already holds the operator
 * participation rows in order to draw that table, and each row carries the
 * delivery state `DELIVERY_STATE_EXPRESSION` produced — so this line and the
 * chips beneath it are one reading of one set of rows and cannot disagree.
 *
 * ## What it says, and what it will not say
 *
 * Values and states, in the delivery vocabulary `slice-ux.md` § 6 fixed, and
 * only the states that are actually present: an event with everything
 * delivered reads "61 delivered" and does not go on to list four zeroes.
 * **Attempted** is deliberately folded into neither delivered nor failed —
 * "Delivered never means read", and a message we have asked about and not yet
 * heard back on is its own state. **Held** and **Cancelled** are the club's own
 * doing rather than the provider's, and they are named for that reason.
 */
export interface DistributionCounts {
  queued: number;
  attempted: number;
  delivered: number;
  failed: number;
  retryable: number;
  held: number;
  cancelled: number;
}

export function describeDelivery(counts: DistributionCounts): string {
  const parts: string[] = [];
  if (counts.delivered > 0) parts.push(`${counts.delivered} delivered`);
  if (counts.attempted > 0) parts.push(`${counts.attempted} attempted`);
  if (counts.queued > 0) parts.push(`${counts.queued} queued`);
  if (counts.retryable > 0) parts.push(`${counts.retryable} retryable`);
  if (counts.failed > 0) parts.push(`${counts.failed} failed`);
  if (counts.held > 0) parts.push(`${counts.held} held`);
  if (counts.cancelled > 0) parts.push(`${counts.cancelled} cancelled`);
  // Nothing queued and nothing attempted is the one state the old literal was
  // written for, and it stays exactly as it was.
  return parts.length === 0 ? NOTHING_DELIVERED_YET : parts.join(" · ");
}

/** The whole note under **Invitations created**: how many, how many answered, and where they are. */
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

/**
 * The delivery states of the rows the participation table is about to draw.
 *
 * `null` — a person with no notification job at all — is counted as nothing,
 * because there is no state to report for them and the invitation count above
 * already says how many people there are. A `null` participation (a draft, or
 * an event whose invitations do not exist yet) yields every zero, which
 * {@link describeDelivery} reads as "nothing delivered yet".
 */
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

// ---------------------------------------------------------------------------
// The messaging plan disclosure — W1, LAN-171
// ---------------------------------------------------------------------------

/**
 * One rung's instant, in the club's own zone — "Sat 10 Oct · 18:00".
 *
 * Compact rather than `formatDeadline`'s full sentence, because a plan lists
 * several of these in a column and a reader scans it as a schedule rather than
 * reading each line as its own fact. Still `Europe/London`, for the reason
 * `formatDeadline` gives: rendering a plan instant at UTC would show every
 * step an hour early for the whole of British Summer Time.
 *
 * The month comes from `shortMonthOf`'s fixed table rather than a second
 * `Intl` call: recent ICU data renders `{ month: "short" }` for September as
 * "Sept" in `en-GB`, four letters where every other month gets three, and
 * this club abbreviates every month to three letters everywhere else in the
 * application (`formatShortDate`, the events list). One September rendered
 * differently on this one screen would be a defect a reader notices before a
 * test does.
 */
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

/** "4 steps" / "1 step" — the disclosure's own count, closed or open. */
export function describePlanStepCount(steps: number): string {
  return `${steps} ${steps === 1 ? "step" : "steps"}`;
}

export const PLAN_COMMITS_ON_APPROVAL = "Approval commits this plan.";
export const PLAN_FROZEN_AT_APPROVAL = "Frozen at approval.";
export const PLAN_NO_QUIET_HOURS = "No quiet-hours adjustment.";
export const PLAN_RECOVERY_NOTE =
  "Failed sends retry automatically. Remaining errors appear in Delivery.";

/**
 * F-A2. Shown instead of the disclosure for an approved event with no
 * `event_messaging_plans` row at all — approved before automated messaging
 * existed for it, or a fixture deliberately left that way. Without this the
 * section was simply absent, indistinguishable from "nothing is due right
 * now": the acceptance this answers is that an operator can tell "no
 * messages are due" apart from "no messages will ever be sent". Amending the
 * event is the repair route `event-amendment.ts` now gives it — see
 * `recomputeScheduleOnRescheduleIn`'s F-A2/F-C3 note — so the note names it
 * rather than leaving the state a dead end.
 */
export const PLAN_MISSING_HEADLINE = "No messaging plan";
export const PLAN_MISSING_NOTE =
  "This event was approved before it had one. Amending the event creates it.";

/**
 * W1's settled guarantee, stated rather than derived — Brian, 2026-08-22: "if
 * practice happens in 2 days and we're approving and we're sending it out,
 * that needs to go out now, right? It should say that."
 */
export const PLAN_DISPATCHES_IMMEDIATELY =
  "This event is closer than its own invitation lead, so its invitation goes out now rather " +
  "than on a stated date.";

/**
 * `REQ-late-approval`, named on the panel rather than shown as a quietly
 * shorter list — W1's "see a short-notice event labelled as one".
 */
export const PLAN_LATE_APPROVAL =
  "There is not enough runway for the full ladder. This event still chases: it sends " +
  "immediately, fills the time it has with WhatsApp only, and does not escalate to the " +
  "President.";

/** "1 user has an error." / "3 users have an error." — W1's concise count. */
export function describeWhatsAppErrorCount(count: number): string {
  return count === 1 ? "1 user has an error." : `${count} users have an error.`;
}

/** "See 1 user with error" / "See 3 users with error" — the disclosure summary. */
export function whatsAppErrorDisclosureLabel(count: number): string {
  return count === 1 ? "See 1 user with error" : `See ${count} users with error`;
}

export const WHATSAPP_ERROR_DETAIL = "WhatsApp error";
