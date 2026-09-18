import { CLUB_TIME_ZONE } from "@/lib/club-time";
import { SHORT_MONTHS } from "@/lib/services/event-vocabulary";
import type {
  MessagingSafetyState,
  MessagingSafetyStatus,
  SafetyHoldRow,
  SafetyReasonCode,
} from "@/lib/services/messaging-safety";

/**
 * The Messaging safety section's own words — LAN-394.
 *
 * Labels, values and states. The one sentence of prose in the whole section is
 * {@link SAFETY_NORMAL_SENTENCE}, which sits under the control that needs it;
 * everything else an operator needs to understand about the thresholds is
 * outside the frame, in `docs/operating-the-slice.md`.
 *
 * Brian's visual pass of 18 September 2026: "This is an emergency page. When I
 * get here I need to work immediately." Two jobs, in this order — stop a
 * runaway, then find and clear a blockage — and the section is arranged as the
 * answers to them. Everything derived is derived here rather than in the
 * component, so the arithmetic that decides amber from red is something a test
 * can call directly.
 *
 * His second pass the same day settled the words: "The narrative UI is really
 * terrible. 'Is it running away?' — for God's sake, have a professional tone.
 * Just say what the thing is: how many messages were sent in the last 24
 * hours." So every heading here is a noun phrase and every row is a label and
 * a value. The order and the content are unchanged.
 */

export const SAFETY_SECTION_HEADING = "Messaging safety";

/** The six states, in the order Brian's list gives them: green, amber, red. */
export const SAFETY_STATE_LABELS: Readonly<Record<MessagingSafetyState, string>> = Object.freeze({
  sending_normally: "Sending normally",
  messages_waiting: "Messages waiting",
  provider_cooling_down: "Provider cooling down",
  paused: "Paused",
  emergency_stopped: "Emergency stop",
  unavailable: "Safety status unavailable",
});

/**
 * The one sentence. It is here because a person about to stop every message the
 * club sends is owed the three facts that decide whether they should: what
 * stops, what does not, and what may still arrive. It sits under the control,
 * not above the status.
 */
export const SAFETY_NORMAL_SENTENCE =
  "Pausing stops new application WhatsApp and email sends. Signups and replies continue to be " +
  "saved. Messages already in progress may still arrive.";

export const PAUSE_LABEL = "Pause messaging";
export const RESUME_LABEL = "Resume messaging";
export const RESUME_SCOPE_LABEL = "Resume";
/** Noun phrases, not questions — Brian, 18 September 2026, second pass. */
export const PAUSE_REASON_LABEL = "Reason for pausing";
export const RESUME_REASON_LABEL = "Reason for resuming";
export const REASON_NOTES_LABEL = "Anything else (optional)";
export const REASON_REQUIRED = "Choose a reason, then press the button again.";

/**
 * The one-tap reasons — Brian, 18 September 2026. A preset on its own is a
 * complete reason: on the screen somebody opens because the club is firing
 * messages at everybody, requiring them to type first is requiring them to
 * compose a sentence before they can stop it. The free-text field beside them
 * stays, and adds to whichever preset was chosen.
 */
export const REASON_PRESETS: readonly string[] = Object.freeze([
  "Runaway sends",
  "Provider outage",
  "Testing",
]);

/**
 * What an operator reads for each safe reason code — labels and states, never
 * an explanation (`docs/ux/standards.md`; no narrative text in the application
 * frame).
 *
 * Here rather than beside the codes themselves, and that is not tidiness: the
 * section is a client component, and every runtime value it imports from
 * `@/lib/services/messaging-safety` would drag the server barrel — and with it
 * `pg` and `next/headers` — into the browser bundle. The barrel is
 * `server-only`; this file is words.
 */
const SAFETY_REASON_LABELS: Readonly<Record<SafetyReasonCode, string>> = Object.freeze({
  paused_by_operator: "Messaging paused",
  global_emergency_stop: "Emergency stop",
  shared_pacing: "Waiting for the sending allowance",
  person_pacing: "Waiting — one message per person at a time",
  destination_pacing: "Waiting — one message per number at a time",
  person_hold: "Held — this person's limit reached",
  destination_hold: "Held — this number's limit reached",
  provider_cooldown: "Provider cooling down",
  safety_unavailable: "Safety status unavailable",
});

/** The section's own heading, and its five sub-headings. All noun phrases. */
export const STATUS_HEADING = "Messaging status";
export const SENT_HEADING = "Messages sent";
export const WAITING_HEADING = "Waiting";
export const THRESHOLDS_SUMMARY = "Limits and current use";
/** Brian, 18 September 2026: "Active holds" told him nothing. These are people. */
export const HOLDS_HEADING = "People held back";
export const AUDIT_HEADING = "Recent changes";
export const NO_HOLDS = "Nobody";
export const NO_AUDIT = "None recorded";
/** The status block's four rows. */
export const STATUS_LABEL = "Status";
export const REASON_LABEL = "Reason";
export const BY_LABEL = "By";
export const LAST_CHANGE_LABEL = "Last change";
/** The one row "Waiting" carries when no cause is holding anything. */
export const HOLDING_LABEL = "Holding";
export const NOTHING_HOLDING = "Nothing";
export const DUE_NOW_LABEL = "Due now";
/** A held person's two facts, on their card. */
export const HOLD_SINCE_LABEL = "Since";
export const HOLD_NOTE_LABEL = "Note";
/** The value a row carries where nothing governs it, or nobody may act on it. */
const NO_LIMIT = "—";

/** Where the two links under "Waiting" land. */
export const CONTROL_ANCHOR = "messaging-safety-control";
export const HOLDS_ANCHOR = "messaging-safety-holds";

/** The paused-state notice at the top of the page, which links to the section. */
export const PAUSED_BANNER = "Messaging is paused.";
export const PAUSED_BANNER_LINK = "Messaging safety";

export const SHARED_DESTINATION_LABEL = "Shared by more than one person";

export function pausedNotice(): string {
  return "Messaging is paused.";
}

export function resumedNotice(): string {
  return "Messaging is resumed.";
}

function part(value: Date, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: CLUB_TIME_ZONE }).format(value);
}

/**
 * `17 Sep 2026, 09:00` — a recorded moment, in the club's own time.
 *
 * The month comes from this repository's own table rather than from ICU, which
 * renders September as "Sept" on some Node builds and is the one abbreviation
 * `docs/ux/design-system.md` § 3 forbids outright.
 */
export function formatMoment(value: Date | string | null): string {
  if (!value) return "—";
  const moment = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(moment.getTime())) return "—";
  const month = SHORT_MONTHS[Number(part(moment, { month: "numeric" })) - 1] ?? "";
  return `${part(moment, { day: "numeric" })} ${month} ${part(moment, { year: "numeric" })}, ${part(
    moment,
    { hour: "2-digit", minute: "2-digit", hour12: false },
  )}`;
}

export function queueLabel(dueWaiting: number, oldestDueMinutes: number): string {
  if (dueWaiting === 0) return "None";
  const age =
    oldestDueMinutes >= 60
      ? `${Math.floor(oldestDueMinutes / 60)} h ${oldestDueMinutes % 60} min`
      : `${oldestDueMinutes} min`;
  return `${dueWaiting} — oldest ${age}`;
}

/** What one hold is on. Never a destination fingerprint; see `status.ts`. */
export function holdLabel(hold: SafetyHoldRow): string {
  if (hold.kind === "destination" && hold.people.length > 0) {
    return hold.people.map((person) => person.name).join(", ");
  }
  return hold.label;
}

/**
 * Why this person or number is held, in the words that decide whether to
 * resume. Which ceiling was reached is read back from the attempts; once those
 * counting fields have aged out the stored reason code is all there is.
 */
export function holdWhy(hold: SafetyHoldRow): string {
  if (hold.limitReached === "daily") return "Daily limit reached";
  if (hold.limitReached === "weekly") return "Weekly limit reached";
  if (hold.reasonCode) return SAFETY_REASON_LABELS[hold.reasonCode];
  return "Held";
}

/** The record to open, where the hold is on exactly one known person. */
export function holdPersonHref(hold: SafetyHoldRow): string | null {
  return hold.people.length === 1 ? `/operate/people/${hold.people[0].personId}` : null;
}

/** Everything under "People held back". A provider cooling down is not a person. */
export function heldBackRows(status: MessagingSafetyStatus): readonly SafetyHoldRow[] {
  return status.holds.filter((hold) => hold.kind !== "provider");
}

// ---------------------------------------------------------------------------
// "Messages sent"
// ---------------------------------------------------------------------------

/** Amber below the limit, red at it, and nothing at all below that. */
export type RateSeverity = "neutral" | "warning" | "error";

/**
 * The word a reading carries beside its number, or none. Colour is never the
 * only signal — the chip's own rule — so an amber row says what amber means.
 */
export const RATE_CHIP_STATUS: Readonly<Record<Exclude<RateSeverity, "neutral">, string>> =
  Object.freeze({ warning: "nearing_limit", error: "at_limit" });

export const RATE_CHIP_LABELS: Readonly<Record<Exclude<RateSeverity, "neutral">, string>> =
  Object.freeze({ warning: "Nearing limit", error: "At limit" });

/** Eighty per cent, the same fraction the capacity warning already uses. */
const RUNAWAY_WARNING_FRACTION = 0.8;

export interface SafetyRateRow {
  readonly key: "pacing" | "hour" | "day";
  readonly label: string;
  readonly used: number;
  /** The ceiling this window is read against, or `null` where none governs it. */
  readonly limit: number | null;
  readonly severity: RateSeverity;
}

function rateSeverity(used: number, limit: number | null): RateSeverity {
  if (limit === null || limit <= 0) return "neutral";
  if (used >= limit) return "error";
  if (used >= limit * RUNAWAY_WARNING_FRACTION) return "warning";
  return "neutral";
}

/**
 * `1,450 of 3,000`, or the count alone where no ceiling governs the window —
 * Brian, 18 September 2026: "Just say what the thing is: how many messages
 * were sent in the last 24 hours."
 */
export function rateValue(row: SafetyRateRow): string {
  const used = row.used.toLocaleString("en-GB");
  return row.limit === null ? used : `${used} of ${row.limit.toLocaleString("en-GB")}`;
}

/**
 * How many were sent, in three windows: five minutes, an hour, a day, each
 * against its ceiling. The hour has none — it is the window that shows a
 * runaway building between a tick and a day.
 */
export function sentRows(status: MessagingSafetyStatus): readonly SafetyRateRow[] {
  const windows: readonly {
    key: SafetyRateRow["key"];
    label: string;
    used: number;
    limit: number | null;
  }[] = [
    {
      key: "pacing",
      label: "Last 5 minutes",
      used: status.admittedInPacingWindow,
      limit: status.pacingLimit,
    },
    { key: "hour", label: "Last hour", used: status.admittedInHour, limit: null },
    { key: "day", label: "Last 24 hours", used: status.admittedInDay, limit: status.dayLimit },
  ];
  return windows.map((window) => ({
    ...window,
    severity: rateSeverity(window.used, window.limit),
  }));
}

// ---------------------------------------------------------------------------
// "Waiting"
// ---------------------------------------------------------------------------

/**
 * One thing that is holding messages, as a label and a value — the same shape
 * as every other row in the section, rather than a sentence with a dash in it.
 */
export interface SafetyBlocker {
  readonly id: string;
  /** What is blocking, in the club's words. */
  readonly label: string;
  /** What clears it, or how many there are: the row's value. */
  readonly value: string;
  /** Where that control is, when it is on this page. */
  readonly href: string | null;
}

/** `08:05`, for a cooldown that ends at a time rather than after a duration. */
function clockTime(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return part(date, { hour: "2-digit", minute: "2-digit", hour12: false });
}

/**
 * Every cause that is currently holding messages, each with its clearing
 * action. Empty is the answer worth having: an operator who has been told
 * nothing is blocking can stop looking here and look at the schedule.
 */
export function safetyBlockers(
  status: MessagingSafetyStatus,
  /**
   * Whether this operator is offered the control. The IT Officer reads this
   * section to diagnose a deployment and may not end a pause, so they are told
   * what is blocking and never pointed at a control that is not there.
   */
  mayControl: boolean,
): readonly SafetyBlocker[] {
  const blockers: SafetyBlocker[] = [];

  if (status.state === "emergency_stopped" || status.state === "paused") {
    blockers.push({
      id: "global",
      label: SAFETY_STATE_LABELS[status.state],
      value: mayControl ? RESUME_SCOPE_LABEL : NO_LIMIT,
      href: mayControl ? `#${CONTROL_ANCHOR}` : null,
    });
  }

  for (const hold of status.holds) {
    if (hold.kind !== "provider" || !hold.cooldownUntil) continue;
    blockers.push({
      id: hold.scopeId,
      label: `${hold.label} cooling down`,
      value: `until ${clockTime(hold.cooldownUntil)}`,
      href: null,
    });
  }

  const held = heldBackRows(status).length;
  if (held > 0) {
    blockers.push({
      id: "holds",
      label: HOLDS_HEADING,
      value: String(held),
      href: `#${HOLDS_ANCHOR}`,
    });
  }

  return blockers;
}

export const SAFETY_ACTION_FAILED =
  "That could not be done, and nothing changed. Reload and look at the state again.";
