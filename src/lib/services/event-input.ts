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

/** `public.event_origin`, in full. Source Data Analysis §5.6. */
export const EVENT_ORIGINS: readonly string[] = Object.freeze([
  "club_controlled",
  "externally_assigned",
  "externally_scheduled",
  "negotiated",
]);

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

/** The transitions LAN-76 owns, as data. Anything not listed is refused. */
export type EventTransition = "submit" | "withdraw_submission" | "abandon";

interface TransitionRule {
  readonly from: EventStatus;
  readonly to: EventStatus;
  /** `audit_events.action`, in the club's language. */
  readonly action: string;
  /** Does `events_negative_decisions_are_explained` require a reason? */
  readonly requiresReason: boolean;
  /** What an operator is told when the event is in some other state. */
  readonly refusal: string;
}

export const EVENT_TRANSITIONS: Readonly<Record<EventTransition, TransitionRule>> = Object.freeze({
  /** Model §2.3: `draft → pending_approval` on submission. */
  submit: Object.freeze({
    from: "draft",
    to: "pending_approval",
    action: "event.submitted_for_approval",
    requiresReason: false,
    refusal: "Only a draft can be submitted for approval.",
  }),

  /**
   * UX-33: "Withdrawal returns the event to draft." The operator who submitted
   * too early takes it back; nothing was distributed, because a
   * `pending_approval` event can carry no invitations (P1).
   */
  withdraw_submission: Object.freeze({
    from: "pending_approval",
    to: "draft",
    action: "event.submission_withdrawn",
    requiresReason: false,
    refusal: "Only an event awaiting approval can have its submission withdrawn.",
  }),

  /**
   * LAN-76 scope: `draft → withdrawn` for a candidate the owner abandons. A
   * different thing from withdrawing a submission, which is why the two carry
   * different labels on screen — this one ends the event.
   */
  abandon: Object.freeze({
    from: "draft",
    to: "withdrawn",
    action: "event.draft_abandoned",
    requiresReason: true,
    refusal: "Only a draft can be abandoned.",
  }),
});

// ---------------------------------------------------------------------------
// Input, and the rules it has to satisfy
// ---------------------------------------------------------------------------

/** What an operator typed, before any of it has been believed. */
export interface RawEventDraft {
  name?: string | null;
  eventType?: string | null;
  origin?: string | null;
  scheduledOn?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  venue?: string | null;
  termId?: string | null;
  weekNumber?: string | null;
  /** `"mandatory"` or `"optional"`. Absent is unanswered, never a default. */
  attendance?: string | null;
  /** `"yes"` or `"no"`. Absent is unanswered, never a default. */
  solicitsResponse?: string | null;
}

/** The same values, checked. */
export interface EventDraftInput {
  name: string;
  eventType: string;
  origin: string;
  scheduledOn: string | null;
  startsAt: string | null;
  endsAt: string | null;
  venue: string | null;
  termId: string | null;
  weekNumber: number | null;
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

  const origin = trimmed(raw.origin);
  if (!EVENT_ORIGINS.includes(origin)) {
    issues.push({ field: "origin", message: "Choose who controls this event's schedule." });
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

  const termId = optional(raw.termId);
  if (termId !== null && !UUID_PATTERN.test(termId)) {
    issues.push({ field: "termId", message: "Choose a term from the list, or leave it blank." });
  }

  const weekText = optional(raw.weekNumber);
  let weekNumber: number | null = null;
  if (weekText !== null) {
    const parsed = Number(weekText);
    if (!Number.isInteger(parsed) || parsed < -1 || parsed > 8) {
      issues.push({
        field: "weekNumber",
        message: "Oxford weeks run from −1 to 8. Leave it blank if the event is outside term.",
      });
    } else {
      weekNumber = parsed;
    }
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
      origin,
      scheduledOn,
      startsAt,
      endsAt,
      venue: optional(raw.venue),
      termId,
      weekNumber,
      isMandatory: attendance === "mandatory",
      solicitsResponse: solicits === "yes",
    },
  };
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
