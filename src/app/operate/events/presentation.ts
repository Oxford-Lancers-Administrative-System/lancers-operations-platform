import type { TermCoordinate, TermWindow } from "@/lib/services/event-input";
import type { EventListEntry } from "@/lib/services/events";
import { labelFor } from "../labels";

/**
 * How an event reads on screen — UX-30, UX-31, UX-32 and UX-33.
 *
 * Presentation only: every function here is pure, takes what the service
 * returned, and decides nothing. It is a separate module from the screens
 * because four of them show the same status, the same date and the same two
 * flags, and a label that differs between the list and the detail is a defect
 * an operator finds before a test does.
 *
 * Dates and times are formatted in `en-GB` at UTC, deliberately. `scheduled_on`
 * is a `date` and `starts_at`/`ends_at` are `time` — none of the three carries a
 * zone, so rendering them in the viewer's zone would shift a Wednesday practice
 * into Tuesday for anybody east of Greenwich. There is one club, it is in
 * Oxford, and these values mean what they say.
 */

/**
 * The parts are formatted individually and joined here rather than handed to
 * one formatter, because the separators between them are not ICU's to choose:
 * `en-GB` emits "Wednesday 14 October" on one Node build and
 * "Wednesday, 14 October" on another, and the wireframes show the comma. This
 * way the punctuation is the repository's, and a CI runner with a different
 * ICU build cannot change what an operator reads.
 */
function part(scheduledOn: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).format(
    new Date(`${scheduledOn}T00:00:00Z`),
  );
}

/**
 * Month abbreviations, owned by this repository rather than asked of ICU.
 *
 * The same reasoning as `part()` above, and found the same way. `en-GB` with
 * `month: "short"` renders September as **"Sept"** on some ICU builds and
 * "Sep" on others, so the abbreviation an operator reads would depend on which
 * Node the container happened to be built with — and the Oxford term card,
 * whose whole job is to state exact dates, would disagree with itself between a
 * developer's machine and Cloud Run.
 *
 * Twelve strings settle it. The month index is read straight off the
 * `YYYY-MM-DD`, which needs no formatter at all.
 */
export const SHORT_MONTHS: readonly string[] = Object.freeze([
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]);

/** "Oct" for any `YYYY-MM-DD`. Empty for anything that is not one. */
export function shortMonthOf(day: string): string {
  return SHORT_MONTHS[Number(day.slice(5, 7)) - 1] ?? "";
}

/**
 * "Wed 14 Oct 2026" — the list's date column.
 *
 * The year is not decoration. A season runs from September to June, so a list
 * of one season's events spans two calendar years, and "Wed 16 Jun" does not
 * say which one — which is exactly what Brian hit reading the list.
 */
export function formatShortDate(scheduledOn: string | null): string {
  if (!scheduledOn) return "No date yet";
  const weekday = part(scheduledOn, { weekday: "short" });
  const day = part(scheduledOn, { day: "numeric" });
  const month = shortMonthOf(scheduledOn);
  const year = part(scheduledOn, { year: "numeric" });
  return `${weekday} ${day} ${month} ${year}`;
}

/** "Sunday, 18 October 2026" — the detail heading. Year, for the same reason. */
export function formatLongDate(scheduledOn: string | null): string {
  if (!scheduledOn) return "No date yet";
  const weekday = part(scheduledOn, { weekday: "long" });
  const day = part(scheduledOn, { day: "numeric" });
  const month = part(scheduledOn, { month: "long" });
  const year = part(scheduledOn, { year: "numeric" });
  return `${weekday}, ${day} ${month} ${year}`;
}

/** "20:00–22:00", "from 20:00", "until 22:00", or nothing at all. */
export function formatTimes(startsAt: string | null, endsAt: string | null): string {
  if (startsAt && endsAt) return `${startsAt}–${endsAt}`;
  if (startsAt) return `from ${startsAt}`;
  if (endsAt) return `until ${endsAt}`;
  return "";
}

/** "Wed 14 Oct, 20:00" — date and start, as the list wireframe shows them. */
export function formatListWhen(event: EventListEntry): string {
  const date = formatShortDate(event.scheduledOn);
  return event.startsAt ? `${date}, ${event.startsAt}` : date;
}

/** "Sunday, 18 October · 10:00–13:00" — the detail subtitle. */
export function formatDetailWhen(event: {
  scheduledOn: string | null;
  startsAt: string | null;
  endsAt: string | null;
}): string {
  const times = formatTimes(event.startsAt, event.endsAt);
  const date = formatLongDate(event.scheduledOn);
  return times ? `${date} · ${times}` : date;
}

/**
 * `event_status` in the club's words. The list, the detail and the chips agree.
 *
 * Three, since LAN-151. `Occurred` is not here because it is not a stored
 * status: it is derived from the date passing, and `DERIVED_STATE_LABELS`
 * below is where a screen gets the word for it.
 */
export const STATUS_LABELS: Readonly<Record<string, string>> = Object.freeze({
  draft: "Draft",
  approved: "Approved",
  cancelled: "Cancelled",
});

/**
 * What the event looks like now, in the club's words (D30).
 *
 * A screen shows this beside the stored status, never instead of it: "Approved"
 * and "Occurred" are answers to two different questions, and collapsing them
 * would put the club back where the assertion was.
 */
export const DERIVED_STATE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  upcoming: "Upcoming",
  occurred: "Occurred",
  cancelled: "Cancelled",
});

/** `event_type` in the club's words — the seven approved types (D12). */
export const TYPE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  practice: "Practice",
  strength_and_conditioning: "Strength and conditioning",
  chalk: "Chalk",
  game: "Game",
  social: "Social",
  recruitment: "Recruitment",
  meeting: "Meeting",
});

/** `event_delivery_mode` in the club's words (D20). */
export const DELIVERY_MODE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  in_person: "In person",
  online: "Online",
});

/** What the venue field is called, which depends on where the event is (D21). */
export function venueLabel(deliveryMode: string): string {
  return deliveryMode === "online" ? "Destination" : "Venue";
}

/**
 * D86. The zone every event time is in, said on the form rather than assumed.
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
 * REQ-no-joining-url, said to the operator entering one.
 *
 * The rule is real and enforced elsewhere; this is the sentence that stops
 * somebody assuming the link will reach people because they typed it in.
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

export const TERM_LABELS: Readonly<Record<string, string>> = Object.freeze({
  michaelmas: "Michaelmas",
  hilary: "Hilary",
  trinity: "Trinity",
});

export { labelFor };

/**
 * The derived coordinate in the club's words — "Michaelmas 2026-27, Week 1", or
 * "Outside term" for a date no Oxford term contains.
 *
 * Takes the terms rather than a label because it is fed by `deriveTermCoordinate`,
 * which returns ids: the same function runs in the browser as the operator
 * picks a date and on the server when the draft is saved, and both need to say
 * the same sentence.
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

export function describeAttendance(isMandatory: boolean): string {
  return isMandatory ? "Mandatory" : "Optional";
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
