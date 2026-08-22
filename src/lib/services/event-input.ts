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
 * `public.event_type`, in full — the approved seven-type model (D12).
 *
 * LAN-151 narrowed the enum from ten values to these seven: `camp` became a
 * practice, `fixture` and `varsity` became `game`, and `other` became
 * `meeting`. There is no longer a subset that a draft may be created as,
 * because there is no longer a type whose defining fields the form cannot
 * record — the opponent went with `fixture` (D14: the name carries it) and the
 * side went with it.
 *
 * Adding an eighth is a change to the approved domain model and Brian's
 * decision, not a code change.
 */
export const EVENT_TYPES: readonly string[] = Object.freeze([
  "practice",
  "strength_and_conditioning",
  "chalk",
  "game",
  "social",
  "recruitment",
  "meeting",
]);

/**
 * The types a draft may be created as. Every one of the seven, now that the
 * types the form could not honestly describe are gone — so this is `EVENT_TYPES`
 * and stays a separate name only because callers already import it.
 */
export const DRAFTABLE_EVENT_TYPES: readonly string[] = EVENT_TYPES;

/**
 * `public.event_origin`, in full. Source Data Analysis §5.6 — not every event's
 * schedule is the club's to set.
 *
 * The column stays, and so does every value in it: a BUCS game really is
 * externally assigned, and that provenance is load-bearing. What went away in
 * Brian's LAN-76 clarification is the *choice* — an operator creating an event
 * on the club's own calendar was being asked to classify its provenance from
 * four unexplained words. An event this form creates is by definition one the
 * club scheduled, so the value is derived rather than asked for, and an event
 * that came from elsewhere keeps whatever provenance it already had.
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
 * recording an event the club controls.
 */
export const OPERATOR_CREATED_ORIGIN = "club_controlled";

/**
 * The three stored statuses, and no others (D12, D30).
 *
 * LAN-151 narrowed `public.event_status` from eight values to these three, and
 * what went is worth naming because each was a thing the club turned out not to
 * do. `pending_approval` modelled a proposer asking a gatekeeper, and Brian
 * removed the Submit step on 12 August 2026. `rejected` and `withdrawn` were
 * two flavours of "it never became an event", which is a draft. `occurred` and
 * `not_held` were assertions somebody typed, and `derivedEventState` below now
 * answers that from the date instead.
 */
export type EventStatus = "draft" | "approved" | "cancelled";

export const EVENT_STATUSES: readonly EventStatus[] = Object.freeze([
  "draft",
  "approved",
  "cancelled",
]);

/**
 * `public.event_delivery_mode` (D20). In person or online, as a property of the
 * event rather than something guessed from what somebody typed in the venue.
 * The venue field then holds an address or a destination accordingly (D21).
 */
export type EventDeliveryMode = "in_person" | "online";

export const EVENT_DELIVERY_MODES: readonly EventDeliveryMode[] = Object.freeze([
  "in_person",
  "online",
]);

// ---------------------------------------------------------------------------
// Occurrence, derived rather than asserted
// ---------------------------------------------------------------------------

/**
 * What an event looks like now, as distinct from what is stored about it.
 *
 * D30, and the reason this function exists at all: **nothing asserts that an
 * event occurred**. There is no *Mark occurred*, no *Mark not held*, no
 * *Confirm what happened* and no *Correct this to not held*, and no code path
 * anywhere writes an occurrence. An event has occurred when its date has passed
 * and it was not cancelled — that is the whole definition, and it is the same
 * one `public.rsvp_attendance_mismatches` uses in SQL.
 *
 * What replaced the assertion is not another flag but the register itself: its
 * saved-versus-untouched state is the record of whether the session was
 * assessed (D71-D74), and a sheet saved with everybody absent is a real zero
 * rather than a sheet nobody opened.
 *
 * Pure, and takes today as an argument, so the clock stays the caller's problem
 * and the rule can be checked at any date.
 */
export type DerivedEventState = "upcoming" | "occurred" | "cancelled";

export function derivedEventState(
  event: { status: EventStatus; scheduledOn: string | null },
  today: string,
): DerivedEventState {
  if (event.status === "cancelled") return "cancelled";
  // A draft with no date has not happened, and neither has one dated tomorrow.
  if (event.scheduledOn === null) return "upcoming";
  return event.scheduledOn < today ? "occurred" : "upcoming";
}

/**
 * Has this event happened, in the sense that lets a register be taken?
 *
 * Both halves of invariant P5, in one place. `attendance_records` carries the
 * "the event is approved" half as a check constraint; the "its date has passed"
 * half cannot be one, because a check constraint cannot read the clock. So it
 * is stated here, once, and every caller asks the same question rather than
 * re-deriving it.
 */
/**
 * The value the events list's Status filter uses for the derived state — Q-6.
 *
 * Brian asked to "see the events that occurred, to easily be able to tell which
 * ones happened versus not", and this is the fourth thing that filter offers.
 * It is deliberately **not** a fourth `event_status`: nothing stores it and
 * nobody asserts it (D30), so it lives here beside the derivation rather than
 * in the enum, and a reader who follows it arrives at `derivedEventState`
 * rather than at a column.
 */
export const OCCURRED_FILTER: DerivedEventState = "occurred";

/**
 * What the Status filter offers, in the order an operator reads a season in.
 *
 * The three stored states with the derived one in its place in time: a draft
 * becomes approved, the evening happens, and a cancellation is the thing that
 * stops it. `EVENT_STATUSES` stays the stored vocabulary and nothing here
 * widens it — `src/app/operate/labels.test.ts` holds those two apart.
 */
export const EVENT_STATUS_FILTERS: readonly string[] = Object.freeze([
  "draft",
  "approved",
  OCCURRED_FILTER,
  "cancelled",
]);

export function hasOccurred(
  event: { status: EventStatus; scheduledOn: string | null },
  today: string,
): boolean {
  return event.status === "approved" && derivedEventState(event, today) === "occurred";
}

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
  /** `"in_person"` or `"online"` (D20). Absent means in person. */
  deliveryMode?: string | null;
  /** An address when in person, a destination when online (D21). */
  venue?: string | null;
  /** D18: free text, absorbing anything without a home of its own. */
  description?: string | null;
  /** D17: its own field, separate from the description. */
  requiredEquipment?: string | null;
  /** The online event's link (REQ-no-joining-url). Never public. */
  joiningUrl?: string | null;
  /** `"mandatory"` or `"optional"`. Absent is unanswered, never a default. */
  attendance?: string | null;
}

/** The same values, checked. Term, week and origin are not among them. */
export interface EventDraftInput {
  name: string;
  eventType: string;
  scheduledOn: string | null;
  startsAt: string | null;
  endsAt: string | null;
  deliveryMode: EventDeliveryMode;
  venue: string | null;
  description: string | null;
  requiredEquipment: string | null;
  joiningUrl: string | null;
  isMandatory: boolean;
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
 * Mandatory-or-optional is deliberately answerable only by answering it: it has
 * no default here, so an event never quietly claims attendance is expected when
 * nobody said so. `Response requested` used to sit beside it and D23 removed
 * it — mandatory or optional already carries that, and everyone sent an event
 * is expected to answer.
 *
 * D78 and D86: times are entered in five-minute increments, in Europe/London,
 * with the zone stated on the form. The increment is an entry rule and is
 * checked here rather than in the database, because the club's own historical
 * records contain times that are not multiples of five and a check constraint
 * would refuse the club's real data at migration time.
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
    if (startsAt !== null && !isFiveMinuteIncrement(startsAt)) {
      issues.push({ field: "startsAt", message: FIVE_MINUTE_INCREMENT_MESSAGE });
      startsAt = null;
    }
  }

  if (endsAtRaw !== null && !TIME_PATTERN.test(endsAtRaw)) {
    issues.push({ field: "endsAt", message: "Enter the end as a time of day." });
  } else {
    endsAt = endsAtRaw === null ? null : toMinutePrecision(endsAtRaw);
    if (endsAt !== null && !isFiveMinuteIncrement(endsAt)) {
      issues.push({ field: "endsAt", message: FIVE_MINUTE_INCREMENT_MESSAGE });
      endsAt = null;
    }
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

  // D20. Absent means in person: that is what the club runs, and it is the only
  // default in this function that is a fact rather than an assumption about
  // what somebody meant.
  const deliveryModeRaw = trimmed(raw.deliveryMode);
  const deliveryMode: EventDeliveryMode = deliveryModeRaw === "online" ? "online" : "in_person";
  if (deliveryModeRaw !== "" && !EVENT_DELIVERY_MODES.includes(deliveryModeRaw as never)) {
    issues.push({ field: "deliveryMode", message: "Say whether this is in person or online." });
  }

  // REQ-no-joining-url: an in-person event has no joining link, and offering to
  // store one would put a URL on an event nobody will ever join online.
  const joiningUrl = optional(raw.joiningUrl);
  if (joiningUrl !== null && deliveryMode !== "online") {
    issues.push({
      field: "joiningUrl",
      message: "A joining link belongs to an online event. Change this to online, or clear it.",
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
      deliveryMode,
      venue: optional(raw.venue),
      description: optional(raw.description),
      requiredEquipment: optional(raw.requiredEquipment),
      joiningUrl,
      isMandatory: attendance === "mandatory",
    },
  };
}

/**
 * D78. The club enters times in five-minute increments, so 19:32 is a typo
 * rather than a schedule.
 *
 * Deliberately not a database check constraint. The club's own historical
 * records carry minute-level drift — the seeded dataset reproduces it, because
 * the real term card does — and a constraint would refuse that data when the
 * migration ran. The rule is about *entry*, which is where it is applied.
 */
export const FIVE_MINUTE_INCREMENT_MESSAGE = "Enter the time in five-minute steps.";

export function isFiveMinuteIncrement(time: string): boolean {
  const minutes = Number(time.slice(3, 5));
  return Number.isInteger(minutes) && minutes % 5 === 0;
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
