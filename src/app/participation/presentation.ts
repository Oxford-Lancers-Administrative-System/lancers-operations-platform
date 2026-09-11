import type { AttendancePresence } from "@/lib/services/attendance-vocabulary";
import { formatDetailWhen } from "@/lib/services/event-vocabulary";
import type {
  EventFactsBase,
  ParticipationDiscrepancy,
  ParticipationPerson,
} from "@/lib/services/participation-view";
import { CAPACITY_LABELS } from "../operate/events/presentation";

/**
 * The participation table's words, in one place — W7. LAN-157. Shared by
 * `/operate/events/[id]` and `/e/[token]` per `docs/ux/standards.md` rule 7.
 * No `page.tsx`, so no route. Copy rule: says what a control does and its
 * consequence, never why or a justification.
 *
 * Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE
 */

// The three headline numbers — D62, D73, D74

/** Re-exported from the attendance screen's vocabulary (LAN-152), not rewritten — rule 7. Open: LAN-152 renders `— / 47`, W7's note records `NA / 47`; that is LAN-152's surface to change. */
export {
  formatShowedAgainstInvited,
  HEADLINE_INVITED_LABEL,
  HEADLINE_SAID_YES_LABEL,
  HEADLINE_SHOWED_LABEL,
} from "../operate/events/[id]/attendance/presentation";

/** Re-exported, not rewritten (W157-F2): a duplicated `TERM_LABELS` map here previously disagreed with the event page's, reading a pre-season event as "-1th week". Rule 7. */
export { formatTermAndWeek } from "../operate/events/presentation";

/** `invitation_capacity`, in the club's words — re-exported, not a second copy (same defect shape as `formatTermAndWeek` above). */
export { CAPACITY_LABELS };

// The table

export const TABLE_HEADINGS = Object.freeze({
  name: "Name",
  capacity: "As",
  invited: "Invitation sent",
  delivery: "Delivery",
  answer: "Answer",
  reason: "Reason",
  attendance: "Attendance",
});

/** What a cell with nothing in it prints. One glyph, everywhere. */
export const NOTHING = "—";

/** Invariant P6's row: attended, never asked. */
export const WALK_UP_LABEL = "Walk-up";

export function capacityLabel(person: ParticipationPerson): string {
  if (person.isWalkUp) return WALK_UP_LABEL;
  return CAPACITY_LABELS[person.capacity] ?? person.capacity;
}

export const ANSWER_YES = "Yes";
export const ANSWER_NO = "No";
export const ANSWER_NONE = "No answer";

/** The standing answer. A walk-up reads `—`, not **No answer**: nobody asked them, so nothing is missing (`slice-ux.md` § 9). */
export function answerLabel(person: ParticipationPerson): string {
  if (person.isWalkUp) return NOTHING;
  if (person.answer === "yes") return ANSWER_YES;
  if (person.answer === "no") return ANSWER_NO;
  return ANSWER_NONE;
}

export const PRESENCE_LABELS: Readonly<Record<AttendancePresence, string>> = Object.freeze({
  present: "Present",
  late: "Late",
  excused: "Excused",
  absent: "Absent",
});

export const NOT_RECORDED = "Not recorded";

export function presenceLabel(presence: AttendancePresence | null): string {
  return presence === null ? NOT_RECORDED : PRESENCE_LABELS[presence];
}

/** D3, D65: the delivery states, exactly as the delivery screen says them (rule 7). `held`/`cancelled` are LAN-156's. */
export const DELIVERY_LABELS: Readonly<Record<string, string>> = Object.freeze({
  queued: "Queued",
  attempted: "Attempted",
  delivered: "Delivered",
  failed: "Failed",
  retryable: "Retryable",
  held: "Held",
  cancelled: "Cancelled",
});

export const DELIVERY_NOT_QUEUED = "Nothing queued";

/** W4/W6's two named exceptions to the five-state vocabulary above (`REQ-no-channel-backstop`, `REQ-whatsapp-outage-visible`) — replace an undifferentiated **Failed**. */
export const NOT_DISPATCHED_NO_CHANNEL = "Not dispatched — no channel";
export const WHATSAPP_UNRESPONSIVE = "WhatsApp unresponsive";

/** The Delivery filter's own entry for W4's acceptance #3, above the five states. */
export const NEEDS_ATTENTION_FILTER_LABEL = "Needs attention";

// The discrepancy marker — D64

/** The glyph the approved mockup puts beside the name. */
export const DISCREPANCY_MARK = "≠";

/** What the marker means, per case — statements of fact, never an accusation. */
const DISCREPANCY_LABELS: Readonly<Record<ParticipationDiscrepancy, string>> = Object.freeze({
  said_yes_marked_absent: "Said yes, marked absent",
  said_no_but_attended: "Said no, attended",
  never_answered_attended: "Never answered, attended",
});

export function discrepancyLabel(discrepancy: ParticipationDiscrepancy | null): string | null {
  return discrepancy === null ? null : DISCREPANCY_LABELS[discrepancy];
}

/** The legend under the table's heading. Says what the glyph is, and stops. */
export const DISCREPANCY_LEGEND = `${DISCREPANCY_MARK} marks RSVP and attendance disagreeing`;

export const SORTABLE_NOTE = "Sortable on every column";

/** The count above the table. */
export function everyoneAsked(total: number): string {
  return `Everyone asked — ${total}`;
}

// The collapsed Questions section — D68

export const QUESTIONS_HEADING = "Questions";

/** Applicable people with nothing stored against a question. */
export const QUESTION_NO_ANSWER = "No answer";

// Filters

export const FILTER_SEARCH_LABEL = "Search name";
export const FILTER_CAPACITY_LABEL = "As";
export const FILTER_ANSWER_LABEL = "Answer";
export const FILTER_ATTENDANCE_LABEL = "Attendance";
export const FILTER_DELIVERY_LABEL = "Delivery";
export const FILTER_ALL = "All";
export const CLEAR_FILTERS = "Clear filters";

/** `slice-ux.md` § 9: a filtered-empty table must not read like an empty one. */
export const NO_MATCHING_PEOPLE = "No one matches these filters.";
export const NOBODY_ASKED = "Nobody has been invited to this event yet.";

// The club link — §4.15, D2, D81

export const SHARE_LINK = "Share link";
export const SHARE_HEADLINE = "Share this event";

/** The one sentence the dialog carries — the consequence of pressing the control. The mockup's reasoning paragraph is a deviation reported in the PR, not shipped. */
export const SHARE_CONSEQUENCE =
  "Anyone with this link can see who was asked, what they said and who turned up. They " +
  "cannot change anything and do not need an account.";

export const COPY_LINK = "Copy link";
export const COPY_LINK_DONE = "Copied";
export const ISSUE_LINK = "Create the link";
export const CLOSE = "Close";

export const CLUB_LINK_SUBTITLE = "Shared link";

/** What a stranger gets for an unknown, revoked or draft-event token — one body for all three, like the RSVP page's. */
export const CLUB_LINK_UNAVAILABLE_HEADLINE = "This link does not open anything.";
export const CLUB_LINK_UNAVAILABLE_DETAIL = "Ask the club for a current link.";

// Recording an answer in person — W3, LAN-170

/** The row action, and the dialog's submit button — the same word, per W3-02's wireframe. */
export const RECORD_ANSWER = "Record answer";

export function recordAnswerDialogTitle(displayName: string): string {
  return `Record ${displayName}'s answer`;
}

/**
 * The dialog's event-identity subtitle (OWNER-LAN170-09, correction round 4):
 * restores the second line `W3-02`/`W3-04` both draw, dropped without
 * authorisation. Date/time half uses `formatDetailWhen`, the same formatter
 * the operator event page's header uses, per Q-23.
 *
 * Decision history: missions/intake/M-PEOPLE-AND-ROSTER
 */
export function recordAnswerEventSubtitle(
  event: Pick<EventFactsBase, "name" | "scheduledOn" | "startsAt" | "endsAt">,
): string {
  return `${event.name} · ${formatDetailWhen(event)}`;
}

export const WHAT_DID_THEY_SAY = "What did they say?";
export const RESPONSE_YES_LABEL = "Yes, attending";
export const RESPONSE_NO_LABEL = "No, not attending";

export const WHEN_DID_THEY_TELL_YOU = "When did they tell you?";
export const WHEN_HELPER =
  "Defaults to now. Earlier is allowed, later is not. Times are in the club's zone, Europe/London.";

export const REASON_LABEL = "Reason";
export const REASON_REQUIRED_FOR_NO = "Required for a No";
export const REASON_PLACEHOLDER = "What they told you, in their words";

/** Required by W3's "Safety, privacy, and authority" section — a club-link holder reads this, not only the coach who typed it. */
export const REASON_PRIVACY_NOTE =
  "This reason is visible to anybody holding the club link for this event, the same as a " +
  "player's own reason would be.";

export const EVENT_QUESTIONS_HEADING = "This event's questions";
export const QUESTION_OPTIONAL = "Optional";

/** OWNER-LAN170-08: says whose rule is whose — the player-facing requirement is separate from whether the operator must fill this in now. */
export const QUESTION_REQUIRED_OF_PLAYER_OPTIONAL_HERE =
  "Required of the player, optional to record now";

export const CANCEL = "Cancel";
export const RECORDING = "Recording…";
