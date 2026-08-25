import type { AttendancePresence } from "@/lib/services/attendance-vocabulary";
import type {
  ParticipationDiscrepancy,
  ParticipationPerson,
} from "@/lib/services/participation-view";
import { CAPACITY_LABELS } from "../operate/events/presentation";

/**
 * The participation table's words, in one place — W7. LAN-157.
 *
 * ## Why this folder exists, and why it is not a route
 *
 * Two surfaces render the same table: `/operate/events/[id]` at the operator
 * tier, and `/e/[token]` at the club-link tier. `docs/ux/standards.md` rule 7
 * says two screens answering the same question answer it identically, and one
 * component with one vocabulary is a stronger guarantee than two components
 * pinned together by a test.
 *
 * `src/app/participation/` holds no `page.tsx`, so the App Router creates no
 * route for it. It is a shared component folder that happens to live under
 * `src/app`, which is where every other component in this repository lives.
 *
 * ## The copy rule this file is held to
 *
 * Brian, repeatedly through this mission: the application says what a control
 * does and what its consequence is. It never explains its own design, never
 * justifies a default, and never tells the operator to use a different field.
 * Every string below is the minimum that tells somebody what will happen.
 */

// ---------------------------------------------------------------------------
// The three headline numbers — D62, D73, D74
// ---------------------------------------------------------------------------

/**
 * Re-exported from the attendance screen's own vocabulary rather than written
 * again here.
 *
 * The headline numbers and D74's `showed / invited` pair belong to LAN-152 and
 * are not rebuilt by this package. The club-link page needs them, so it reads
 * the same three labels and the same formatter the event page already reads —
 * which is `docs/ux/standards.md` rule 7 satisfied by having one definition
 * rather than two readings pinned together afterwards.
 *
 * The one thing left open: LAN-152 renders the unsaved case as `— / 47`, while
 * W7's approval note records `NA / 47`. Both are in the workflow document.
 * Changing it is a change to LAN-152's surface, so it is reported rather than
 * taken here.
 */
export {
  formatShowedAgainstInvited,
  HEADLINE_INVITED_LABEL,
  HEADLINE_SAID_YES_LABEL,
  HEADLINE_SHOWED_LABEL,
} from "../operate/events/[id]/attendance/presentation";

/**
 * The event page's own term-and-week sentence, re-exported rather than written
 * again — W157-F2.
 *
 * The club link had its own `TERM_LABELS` map and its own `ordinal()`, and the
 * two surfaces disagreed in the first screenful: the operator read
 * `Michaelmas 2026-27 · Week 7` and the club link read
 * `michaelmas 2026-27 · 7th week` for the same event at the same moment. The
 * map was dead code — it is keyed on `michaelmas | hilary | trinity` while
 * `events.termLabel` is built as `<name> <academic year>`, so the lookup never
 * matched and the raw lowercase value fell through. A pre-season event read
 * `michaelmas 2026-27 · -1th week`.
 *
 * `docs/ux/standards.md` rule 7 is the rule that breaks, and this folder's own
 * header names that rule as the reason it exists. One definition, then, rather
 * than two readings pinned together afterwards.
 */
export { formatTermAndWeek } from "../operate/events/presentation";

/**
 * `invitation_capacity`, in the club's words — re-exported rather than a
 * second copy. This file used to carry its own byte-identical map; the
 * `formatTermAndWeek` note above is the exact defect that shape invites.
 */
export { CAPACITY_LABELS };

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------

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

/**
 * The standing answer, in the club's words.
 *
 * A walk-up reads `—` rather than **No answer**: nobody asked them, so there is
 * no answer missing. `slice-ux.md` § 9 wants an absence and an empty result to
 * be distinguishable, and this is the same distinction one cell wide.
 */
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

/**
 * D3, D65: the delivery states, exactly as the delivery screen says them —
 * `docs/ux/standards.md` rule 7, one word per fact across both surfaces.
 * `held` and `cancelled` are LAN-156's; this table reads the same
 * `DELIVERY_STATE_EXPRESSION` the delivery screen does, so both can appear
 * here too.
 */
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

// ---------------------------------------------------------------------------
// The discrepancy marker — D64
// ---------------------------------------------------------------------------

/** The glyph the approved mockup puts beside the name. */
export const DISCREPANCY_MARK = "≠";

/**
 * What the marker means, per case.
 *
 * Statements of fact, and none of them an accusation: the workflow says in as
 * many words that the marker records that two facts differ and does not accuse
 * anybody. "Said yes, marked absent" is what the two records say; "did not
 * bother to turn up" is what it must never say.
 */
export const DISCREPANCY_LABELS: Readonly<Record<ParticipationDiscrepancy, string>> = Object.freeze(
  {
    said_yes_marked_absent: "Said yes, marked absent",
    said_no_but_attended: "Said no, attended",
    never_answered_attended: "Never answered, attended",
  },
);

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

// ---------------------------------------------------------------------------
// The collapsed Questions section — D68
// ---------------------------------------------------------------------------

export const QUESTIONS_HEADING = "Questions";

/** Applicable people with nothing stored against a question. */
export const QUESTION_NO_ANSWER = "No answer";

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export const FILTER_SEARCH_LABEL = "Search name";
export const FILTER_CAPACITY_LABEL = "As";
export const FILTER_ANSWER_LABEL = "Answer";
export const FILTER_ATTENDANCE_LABEL = "Attendance";
export const FILTER_DELIVERY_LABEL = "Delivery";
export const FILTER_ALL = "All";
export const FILTERS_COMBINE = "Applied as you type — combines";
export const CLEAR_FILTERS = "Clear filters";

/** `slice-ux.md` § 9: a filtered-empty table must not read like an empty one. */
export const NO_MATCHING_PEOPLE = "No one matches these filters.";
export const NOBODY_ASKED = "Nobody has been invited to this event yet.";

// ---------------------------------------------------------------------------
// The club link — §4.15, D2, D81
// ---------------------------------------------------------------------------

export const SHARE_LINK = "Share link";
export const SHARE_HEADLINE = "Share this event";

/**
 * The one sentence the dialog carries.
 *
 * It states the consequence of pressing the control — who can see what, and
 * what they cannot do — and nothing else.
 *
 * The approved mockup carried a second paragraph: "It is a private link, not a
 * secret one — a squad list is not a secret from the squad. Share it where you
 * would share the squad." That is D81's *reasoning*, and reasoning is what
 * Brian has rejected on this mission's screens five times. It is recorded in
 * the pull request as a deviation from the mockup rather than shipped.
 */
export const SHARE_CONSEQUENCE =
  "Anyone with this link can see who was asked, what they said and who turned up. They " +
  "cannot change anything and do not need an account.";

export const COPY_LINK = "Copy link";
export const COPY_LINK_DONE = "Copied";
export const ISSUE_LINK = "Create the link";
export const CLOSE = "Close";

/** The club-link page's own heading strip. */
export const CLUB_LINK_BRAND = "Oxford Lancers";
export const CLUB_LINK_SUBTITLE = "Shared link";

/**
 * What a stranger gets for an unknown, revoked or draft-event token.
 *
 * One body for all three, like the RSVP page's, so the internal states cannot
 * render different text even by accident.
 */
export const CLUB_LINK_UNAVAILABLE_HEADLINE = "This link does not open anything.";
export const CLUB_LINK_UNAVAILABLE_DETAIL = "Ask the club for a current link.";
