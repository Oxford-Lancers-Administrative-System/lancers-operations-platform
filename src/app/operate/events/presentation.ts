import type { EventListEntry } from "@/lib/services/events";

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

/** "Wed 14 Oct" — the list's date column. */
export function formatShortDate(scheduledOn: string | null): string {
  if (!scheduledOn) return "No date yet";
  const weekday = part(scheduledOn, { weekday: "short" });
  const day = part(scheduledOn, { day: "numeric" });
  const month = part(scheduledOn, { month: "short" });
  return `${weekday} ${day} ${month}`;
}

/** "Sunday, 18 October" — the detail heading. */
export function formatLongDate(scheduledOn: string | null): string {
  if (!scheduledOn) return "No date yet";
  const weekday = part(scheduledOn, { weekday: "long" });
  const day = part(scheduledOn, { day: "numeric" });
  const month = part(scheduledOn, { month: "long" });
  return `${weekday}, ${day} ${month}`;
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

/** `event_status` in the club's words. The list, the detail and the chips agree. */
export const STATUS_LABELS: Readonly<Record<string, string>> = Object.freeze({
  draft: "Draft",
  pending_approval: "Pending approval",
  approved: "Approved",
  occurred: "Occurred",
  not_held: "Not held",
  cancelled: "Cancelled",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
});

/** `event_type` in the club's words. */
export const TYPE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  practice: "Practice",
  strength_and_conditioning: "Strength and conditioning",
  chalk: "Chalk",
  fixture: "Fixture",
  social: "Social",
  recruitment: "Recruitment",
  camp: "Camp",
  varsity: "Varsity",
  meeting: "Meeting",
  other: "Other",
});

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

export function labelFor(labels: Readonly<Record<string, string>>, value: string): string {
  return labels[value] ?? value;
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
 * What the Audience column says — the wireframe's three cases, decided from
 * counts the database actually holds rather than from the status.
 */
export function describeAudience(event: EventListEntry): string {
  if (event.invitationCount > 0) return `${event.invitationCount} invited`;
  if (event.audienceCount > 0) return `${event.audienceCount} selected`;
  return "Not resolved";
}

/** What the Responses column says. Never a count of people, only of answers. */
export function describeResponses(event: EventListEntry): string {
  if (event.invitationCount === 0) return "—";
  return `${event.responseCount} responses`;
}

/** What the Occurrence column says. Occurrence is an assertion — invariant E5. */
export function describeOccurrence(event: EventListEntry): string {
  switch (event.status) {
    case "occurred":
      return "Occurred";
    case "not_held":
      return "Not held";
    case "approved":
      return "Awaiting assertion";
    default:
      return "—";
  }
}

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
  "A draft or pending event can carry no invitations, responses or attendance. " +
  "Nothing is sent until the designated approver approves it.";

/** True where that rule applies — the two pre-approval states. */
export function isPreApproval(status: string): boolean {
  return status === "draft" || status === "pending_approval";
}

/** The meaning of the response-solicited flag, on screen, in both states. */
export const SOLICITS_RESPONSE_MEANING =
  "A soliciting event asks its audience to answer, carries a deadline and chases " +
  "nonresponses. An event that does not solicit a response is visible to its " +
  "audience and asks nothing.";

export function describeSolicitation(solicitsResponse: boolean): string {
  return solicitsResponse ? "Response requested" : "No response requested";
}

export function describeAttendance(isMandatory: boolean): string {
  return isMandatory ? "Mandatory" : "Optional";
}
