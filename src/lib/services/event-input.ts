/**
 * The event vocabulary and the rules one submitted form has to satisfy.
 *
 * Split out of `events.ts` for one structural reason: this module is imported
 * by the **client** component that renders the form, and `events.ts` imports
 * the PostgreSQL connection. A client component that reached `events.ts` would
 * drag `pg` into the browser bundle, which does not build — and would not be
 * something to fix with a bundler exclusion if it did.
 *
 * So the division is not stylistic. Everything here is pure: no database, no
 * `server-only`, no framework. Everything that touches a row lives in
 * `events.ts`, which re-exports this module so a server caller has one import
 * and does not have to know the split exists.
 *
 * The rules themselves stay in the service layer rather than moving into the
 * component, for the reason `README.md` gives: "a practice needs a name", "the
 * end cannot precede the start" and "week 9 is not an Oxford week" are club
 * rules, and a rule that lives in a component is a rule the next screen
 * re-invents differently.
 */

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/**
 * The event types this slice's form can honestly describe.
 *
 * `fixture` and `varsity` carry an opponent, a side and a competition, and
 * `recruitment` carries an aggregate headcount — all four fields are explicitly
 * out of LAN-76's scope, and offering a type whose defining fields the form
 * cannot record would produce a half-described event. The enum keeps every
 * value; this list is what a *draft* may be created as, and widening it is a
 * scope decision rather than a code change.
 */
export const DRAFTABLE_EVENT_TYPES: readonly string[] = Object.freeze([
  "practice",
  "strength_and_conditioning",
  "chalk",
  "social",
  "camp",
  "meeting",
]);

/**
 * `public.event_origin`, in full. Source Data Analysis §5.6 — not every event's
 * schedule is the club's to set.
 *
 * The column stays, and so does every value in it: a BUCS fixture really is
 * externally assigned, and that provenance is load-bearing for the schedule
 * work in later issues. What went away in Brian's LAN-76 clarification is the
 * *choice* — an operator creating an event on the club's own calendar was being
 * asked to classify its provenance from four unexplained words. An event this
 * form creates is by definition one the club scheduled, so the value is derived
 * rather than asked for, and an event that came from elsewhere keeps whatever
 * provenance it already had.
 */
export const EVENT_ORIGINS: readonly string[] = Object.freeze([
  "club_controlled",
  "externally_assigned",
  "externally_scheduled",
  "negotiated",
]);

/**
 * The origin of an event created through this form.
 *
 * An operator sitting in the club's own calendar, typing in a practice, is
 * recording an event the club controls. There is no case in this slice where
 * that is not true — fixtures, which are the externally-scheduled ones, are out
 * of scope — so it is written rather than asked.
 */
export const OPERATOR_CREATED_ORIGIN = "club_controlled";

/** The statuses a `draft`-side screen may present. */
export type EventStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "occurred"
  | "not_held"
  | "cancelled"
  | "rejected"
  | "withdrawn";

/**
 * The transitions the slice owns, as data. Anything not listed is refused.
 *
 * `abandon` is LAN-76's. The four occurrence transitions are LAN-80's: the two
 * assertions an operator makes about a past event, and the correction of each.
 */
export type EventTransition =
  "abandon" | "mark_occurred" | "mark_not_held" | "correct_to_not_held" | "correct_to_occurred";

interface TransitionRule {
  readonly from: EventStatus;
  readonly to: EventStatus;
  /** `audit_events.action`, in the club's language. */
  readonly action: string;
  /** Does this transition have to say why? */
  readonly requiresReason: boolean;
  /**
   * What a missing reason is called and what the operator is told.
   *
   * Two different rules want a reason, for two different transitions. The three
   * negative decisions are required to explain themselves by
   * `events_negative_decisions_are_explained`, a durable database constraint. A
   * **correction** is required to explain itself by the frozen model's audit
   * rule, which the database does not carry — so its refusal names a service
   * rule and says so honestly rather than borrowing a constraint name that did
   * not fire.
   */
  readonly reasonRule?: string;
  readonly reasonRefusal?: string;
  /** What an operator is told when the event is in some other state. */
  readonly refusal: string;
  /**
   * Does this transition record `outcome_recorded_at` and
   * `outcome_recorded_by_person_id`?
   *
   * Invariant E5: `occurred` and `not_held` are assertions somebody makes, and
   * `events_outcome_is_asserted` refuses either state without an author. The
   * flag is here rather than inferred from `to` so that the rule is stated once
   * beside the transition it belongs to.
   */
  readonly recordsOutcome?: boolean;
}

/**
 * ## Why there is no "submit for approval" here
 *
 * There was, and Brian removed it on 12 August 2026 after reading it on the
 * screen. The frozen model's §2.3 has `draft → pending_approval` on submission,
 * and the interface built from it asked a Secretary who had just typed in
 * Wednesday's practice to then press "Submit for approval" — announcing to
 * themselves that they were ready.
 *
 * That step models a proposer asking a gatekeeper for permission, and this club
 * has no such relationship: only the four calendar roles can create an event at
 * all, so there is no outsider to submit anything. In his words: "the intent of
 * what you're doing makes it seem like any player on the team can submit an
 * event, which is not the case."
 *
 * So a saved event is a **draft**, full stop, and a draft goes to approval when
 * the club wants the automation to go out. Approval itself is unchanged and
 * still exists — it is the second pair of eyes and the switch that releases
 * invitations — and it is LAN-77's to build, now from `draft` rather than from
 * `pending_approval`.
 *
 * `pending_approval` stays in the `event_status` enum: removing a value is a
 * migration and a domain-model change, seeded rows use it, and nothing is
 * gained by churning the schema. Nothing in the application produces it.
 */
export const EVENT_TRANSITIONS: Readonly<Record<EventTransition, TransitionRule>> = Object.freeze({
  /**
   * `draft → withdrawn` — a candidate the club abandons.
   *
   * The one transition this issue owns. Distinct from anything to do with
   * approval: it ends an event that is never going to happen, and the schema
   * requires it to say why.
   */
  abandon: Object.freeze({
    from: "draft",
    to: "withdrawn",
    action: "event.draft_abandoned",
    requiresReason: true,
    reasonRule: "events_negative_decisions_are_explained",
    reasonRefusal: "Say why this event is being abandoned.",
    refusal: "Only a draft can be abandoned.",
  }),

  /**
   * `approved → occurred` — LAN-80's whole point, and invariant E5's.
   *
   * "The passage of time never equals occurrence." There is no timer, no
   * scheduled job and no derivation from `scheduled_on` anywhere in this
   * repository that produces this transition: a person asserts it, and the row
   * records which person and when. The frozen model permits a policy auto-mark
   * with a correction window; this slice deliberately does not build one.
   *
   * It is what opens attendance. `attendance_records` carries a copy of the
   * event's status behind a cascading composite foreign key and a
   * `check (event_status = 'occurred')`, so nothing can be recorded against an
   * event until this transition has been made by somebody.
   */
  mark_occurred: Object.freeze({
    from: "approved",
    to: "occurred",
    action: "event.marked_occurred",
    requiresReason: false,
    refusal: "Only an approved event can be marked as occurred.",
    recordsOutcome: true,
  }),

  /**
   * `approved → not_held` — the other half of the same human assertion.
   *
   * Not a cancellation: a cancellation is a decision taken *before* the event
   * about an event that will not happen, and `events_negative_decisions_are_explained`
   * requires it to say why. This is a report about a date that has passed and
   * on which nothing took place, so it needs no reason — and attendance stays
   * permanently unavailable for it, which is UX-75.
   */
  mark_not_held: Object.freeze({
    from: "approved",
    to: "not_held",
    action: "event.marked_not_held",
    requiresReason: false,
    refusal: "Only an approved event can be marked as not held.",
    recordsOutcome: true,
  }),

  /**
   * `occurred → not_held` — correcting an assertion somebody got wrong.
   *
   * The reason these two exist at all: the assertion is a human judgement made
   * at the pitch, sometimes on a phone, sometimes about the wrong event in the
   * list. `docs/ux/slice-ux.md` § 9 requires a completed state to show "any
   * permitted correction", and without one an operator who pressed the wrong
   * button has no route back at all.
   *
   * A reason is required — not by the database, which asks for one only on the
   * three negative decisions, but by the frozen model's rule that a
   * **correction** records why. `services/events.ts` refuses this transition
   * outright while any attendance row exists, before the statement is sent, so
   * that the operator gets a sentence naming the attendance rather than the
   * cascade breaking `attendance_records_require_an_occurred_event`.
   */
  correct_to_not_held: Object.freeze({
    from: "occurred",
    to: "not_held",
    action: "event.occurrence_corrected",
    requiresReason: true,
    reasonRule: "event_occurrence_correction_is_explained",
    reasonRefusal: "Say why this event is being corrected to not held.",
    refusal: "Only an event recorded as having happened can be corrected to not held.",
    recordsOutcome: true,
  }),

  /** `not_held → occurred` — the same correction in the other direction. */
  correct_to_occurred: Object.freeze({
    from: "not_held",
    to: "occurred",
    action: "event.occurrence_corrected",
    requiresReason: true,
    reasonRule: "event_occurrence_correction_is_explained",
    reasonRefusal: "Say why this event is being corrected to occurred.",
    refusal: "Only an event recorded as not held can be corrected to occurred.",
    recordsOutcome: true,
  }),
});

// ---------------------------------------------------------------------------
// Input, and the rules it has to satisfy
// ---------------------------------------------------------------------------

/**
 * What an operator typed, before any of it has been believed.
 *
 * Three fields the first implementation had are deliberately absent, per
 * Brian's LAN-76 clarification:
 *
 *   * `origin` — derived, never asked (see `OPERATOR_CREATED_ORIGIN`);
 *   * `termId` and `weekNumber` — **derived from the date**. The event's real
 *     date and times are the operator-entered source of truth, and the Oxford
 *     term and week are a coordinate computed from it. Letting all three be
 *     typed independently let an operator record a date in Michaelmas and
 *     label it Hilary week 4, and nothing would have disagreed with them.
 */
export interface RawEventDraft {
  name?: string | null;
  eventType?: string | null;
  scheduledOn?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  venue?: string | null;
  /** `"mandatory"` or `"optional"`. Absent is unanswered, never a default. */
  attendance?: string | null;
  /** `"yes"` or `"no"`. Absent is unanswered, never a default. */
  solicitsResponse?: string | null;
}

/** The same values, checked. Term, week and origin are not among them. */
export interface EventDraftInput {
  name: string;
  eventType: string;
  scheduledOn: string | null;
  startsAt: string | null;
  endsAt: string | null;
  venue: string | null;
  isMandatory: boolean;
  solicitsResponse: boolean;
}

/** One field, one correction — the shape the shared state contract asks for. */
export interface FieldIssue {
  field: keyof RawEventDraft;
  message: string;
}

export type EventDraftValidation =
  { ok: true; value: EventDraftInput } | { ok: false; issues: FieldIssue[] };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}(:\d{2})?$/;
/** Shared with `events.ts`, so "that is not an identifier" is one rule. */
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Pure validation of one submitted form.
 *
 * Pure, and in the service layer rather than in the route, for the reason the
 * service README gives: it is a club rule ("a practice needs a name", "the end
 * cannot precede the start", "week 9 is not an Oxford week"), and a rule that
 * lives in a component is a rule the next screen re-invents differently.
 *
 * It collects **every** issue rather than stopping at the first, because the
 * shared state contract requires the form to identify the field and state the
 * correction — for all of them, not for whichever one happened to be checked
 * first.
 *
 * The two flags are deliberately answerable only by answering them. Neither has
 * a default here, and LAN-76's acceptance criteria require exactly that of the
 * response-solicited flag; applying the same rule to mandatory/optional costs
 * one radio group and removes the other silent default.
 */
export function validateEventDraft(raw: RawEventDraft): EventDraftValidation {
  const issues: FieldIssue[] = [];

  const name = trimmed(raw.name);
  if (name === "") {
    issues.push({ field: "name", message: "Give the event a name." });
  }

  const eventType = trimmed(raw.eventType);
  if (!DRAFTABLE_EVENT_TYPES.includes(eventType)) {
    issues.push({ field: "eventType", message: "Choose the kind of event this is." });
  }

  const scheduledOn = optional(raw.scheduledOn);
  if (scheduledOn !== null && !DATE_PATTERN.test(scheduledOn)) {
    issues.push({ field: "scheduledOn", message: "Enter the date as a calendar date." });
  }

  const startsAtRaw = optional(raw.startsAt);
  const endsAtRaw = optional(raw.endsAt);
  let startsAt: string | null = null;
  let endsAt: string | null = null;

  if (startsAtRaw !== null && !TIME_PATTERN.test(startsAtRaw)) {
    issues.push({ field: "startsAt", message: "Enter the start as a time of day." });
  } else {
    startsAt = startsAtRaw === null ? null : toMinutePrecision(startsAtRaw);
  }

  if (endsAtRaw !== null && !TIME_PATTERN.test(endsAtRaw)) {
    issues.push({ field: "endsAt", message: "Enter the end as a time of day." });
  } else {
    endsAt = endsAtRaw === null ? null : toMinutePrecision(endsAtRaw);
  }

  // `events_times_ordered` says the same thing in the database. Saying it here
  // too is what turns an integrity error into a sentence beside the field.
  if (startsAt !== null && endsAt !== null && endsAt <= startsAt) {
    issues.push({ field: "endsAt", message: "The event has to end after it starts." });
  }

  const attendance = trimmed(raw.attendance);
  if (attendance !== "mandatory" && attendance !== "optional") {
    issues.push({
      field: "attendance",
      message: "Say whether attendance is expected at this event.",
    });
  }

  const solicits = trimmed(raw.solicitsResponse);
  if (solicits !== "yes" && solicits !== "no") {
    issues.push({
      field: "solicitsResponse",
      message: "Say whether this event asks its audience to respond.",
    });
  }

  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    value: {
      name,
      eventType,
      scheduledOn,
      startsAt,
      endsAt,
      venue: optional(raw.venue),
      isMandatory: attendance === "mandatory",
      solicitsResponse: solicits === "yes",
    },
  };
}

// ---------------------------------------------------------------------------
// The term coordinate, derived from the date
// ---------------------------------------------------------------------------

/** The shape `deriveTermCoordinate` needs of a term. */
export interface TermWindow {
  id: string;
  name: string;
  academicYear: string;
  /** `YYYY-MM-DD`. The first day of `firstWeek`. */
  startsOn: string;
  /** `YYYY-MM-DD`. Falls inside `lastWeek`. */
  endsOn: string;
  /** −1 for Michaelmas, 0 for Hilary and Trinity. */
  firstWeek: number;
  lastWeek: number;
}

/** Where a date falls in the Oxford calendar. Both `null` means outside term. */
export interface TermCoordinate {
  termId: string | null;
  weekNumber: number | null;
}

const MS_PER_DAY = 86_400_000;

/** Midnight UTC for a `YYYY-MM-DD`, or `null` if it will not parse. */
function dayMs(day: string): number | null {
  if (!DATE_PATTERN.test(day)) return null;
  const parsed = Date.parse(`${day}T00:00:00Z`);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * The Oxford term and week a date falls in.
 *
 * Brian's LAN-76 clarification: the event's real date is the source of truth,
 * and the term coordinate is computed from it rather than typed beside it.
 *
 * The arithmetic follows from what `public.terms` actually stores, and it is
 * worth writing down because it is not obvious from the column names.
 * `starts_on` is the **first day of `first_week`**, not of week 1 — Michaelmas
 * begins in week −1, Hilary and Trinity in 0th week. Weeks are seven days
 * (Sunday to Saturday, Source Data Analysis §5.4), and the terms in the seeded
 * dataset agree with this to the day: Michaelmas 2026-27 runs 27 September to
 * 5 December, which is `−1 + floor(69 / 7) = 8`, exactly its `last_week`.
 *
 * So: `week = first_week + floor((date − starts_on) / 7 days)`.
 *
 * A date outside every term is a legitimate answer, not an error — a summer
 * camp or a pre-season meeting has no Oxford week, and `events.term_id` and
 * `events.week_number` are both nullable precisely for that case.
 *
 * Pure, and takes the terms as an argument, so the rule can be checked against
 * a hand-built calendar with no database — and so the same function can run in
 * the browser to show an operator the coordinate as they pick a date.
 */
export function deriveTermCoordinate(
  scheduledOn: string | null,
  terms: readonly TermWindow[],
): TermCoordinate {
  if (scheduledOn === null) return { termId: null, weekNumber: null };

  const dateMs = dayMs(scheduledOn);
  if (dateMs === null) return { termId: null, weekNumber: null };

  for (const term of terms) {
    const startMs = dayMs(term.startsOn);
    const endMs = dayMs(term.endsOn);
    if (startMs === null || endMs === null) continue;
    if (dateMs < startMs || dateMs > endMs) continue;

    const week = term.firstWeek + Math.floor((dateMs - startMs) / (7 * MS_PER_DAY));

    // The schema permits −1 to 8 and nothing else. A term whose dates and week
    // bounds disagree would otherwise produce a week the database refuses, and
    // an event that cannot be saved is a worse answer than one outside term.
    if (week < -1 || week > 8 || week > term.lastWeek) continue;

    return { termId: term.id, weekNumber: week };
  }

  return { termId: null, weekNumber: null };
}

// ---------------------------------------------------------------------------
// Shared string handling
// ---------------------------------------------------------------------------

export function trimmed(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export function optional(value: string | null | undefined): string | null {
  const text = trimmed(value);
  return text === "" ? null : text;
}

/** `HH:MM` — seconds are dropped so a re-edit round-trips unchanged. */
export function toMinutePrecision(time: string): string {
  return time.slice(0, 5);
}
