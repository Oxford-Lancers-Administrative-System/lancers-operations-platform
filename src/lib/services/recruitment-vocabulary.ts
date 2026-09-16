import type { SeasonMessagingConsentState } from "./messaging-consent";

/**
 * The recruitment mission's own fixed vocabulary — types, labels, ladder
 * order. No `"server-only"` tag, so a client bundle can reach it directly.
 */

export type ProspectStatus =
  "identified" | "engaged" | "committed" | "joined" | "declined" | "disengaged" | "void";

export const PROSPECT_STATUS_LABELS: Readonly<Record<ProspectStatus, string>> = Object.freeze({
  identified: "Identified",
  engaged: "Engaged",
  committed: "Committed",
  joined: "Joined",
  declined: "Declined",
  disengaged: "Disengaged",
  void: "Void",
});

export const EXIT_STATUSES: readonly ProspectStatus[] = Object.freeze([
  "declined",
  "disengaged",
  "void",
]);

export const CONSENT_LABELS: Readonly<Record<SeasonMessagingConsentState, string>> = Object.freeze({
  never_asked: "Never asked",
  asked: "Asked",
  granted: "Granted",
  refused: "Refused",
  withdrawn: "Withdrawn",
});

/**
 * The standing consent state, said the way Brian asked for it on 2026-09-16
 * (LAN-371): "WhatsApp granted", "Revoked (by operator, date)" or "Revoked (by
 * the person, date)". The state alone does not say who acted, and once an
 * operator can withdraw on somebody's behalf that is the first thing a reader
 * needs to know.
 */
export function consentStatusLabel(
  state: SeasonMessagingConsentState,
  provenance: { readonly byOperator: boolean; readonly changedAt: string | null },
): string {
  if (state === "granted") return "WhatsApp granted";
  if (state !== "withdrawn") return CONSENT_LABELS[state];
  const who = provenance.byOperator ? "by operator" : "by the person";
  const when = consentDateLabel(provenance.changedAt);
  return when === null ? `Revoked (${who})` : `Revoked (${who}, ${when})`;
}

/** "15 Sept 2026", in the club's zone, or null where there is no date. */
function consentDateLabel(changedAt: string | null): string | null {
  if (changedAt === null) return null;
  const when = new Date(changedAt);
  if (Number.isNaN(when.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/London",
  }).format(when);
}

/**
 * Why an operator changed somebody's consent.
 *
 * Brian, 2026-09-16: a recruit who wants out and cannot make it happen may
 * complain to WhatsApp, which risks the club's sending account. A text-based
 * "press X to stop" was tried and Meta classified it as marketing, so the
 * mechanism is an operator action — and an operator action that changes what
 * the club may send somebody is one the club has to be able to account for
 * later.
 *
 * The four reasons are a short list plus the operator's own words, exactly as
 * the issue asks: it is the reason that is recorded, never the recruit's own
 * message or contact details.
 */
export const CONSENT_WITHDRAWAL_REASONS = Object.freeze({
  asked_in_person: "They asked in person",
  asked_by_message: "They asked by message",
  complaint: "They complained",
  other: "Other",
} as const);

export type ConsentWithdrawalReason = keyof typeof CONSENT_WITHDRAWAL_REASONS;

export type RsvpValue = "yes" | "no";
export type AttendanceValue = "present" | "late" | "excused" | "absent";

export const RSVP_LABEL: Readonly<Record<RsvpValue, string>> = Object.freeze({
  yes: "Yes",
  no: "No",
});

export const ATTENDANCE_LABEL: Readonly<Record<AttendanceValue, string>> = Object.freeze({
  present: "Present",
  late: "Late",
  excused: "Excused",
  absent: "Absent",
});

/** The six Questionnaire B columns. `B1`-`B5` are `QUESTIONNAIRE_B_COMPLETING_CODES`; `B6` is the free-text "anything else" that never completes anything. */
export const QUESTIONNAIRE_B_CODE = Object.freeze({
  playedBefore: "B1",
  watchedBefore: "B2",
  positionInterest: "B3",
  gearOwned: "B4",
  howTheyHeard: "B5",
  anythingElse: "B6",
} as const);

/** "How we came by this number" — `W6`'s opt-in evidence (F-206-02). A value, not a type, so a client component can import it directly. */
export const RECRUITMENT_ADD_OPT_IN_OPTIONS: readonly { value: string; label: string }[] =
  Object.freeze([
    { value: "gave_it", label: "They gave it to us themselves" },
    { value: "passed_on", label: "A member passed it on with their agreement" },
    { value: "public", label: "It is publicly listed and they expect to hear from clubs" },
    { value: "other", label: "Something else — written below" },
  ]);

/** V-10: the one explicit, scoped exception to the no-narrative-text rule on this surface — replaces "How we came by this number" and "In your own words". LAN-305 corrected the last sentence: a blank answer never stopped the first ask, and since LAN-305 it no longer stops the message either. */
export const RECRUITMENT_ADD_EXPLANATION =
  "Why we ask: added this way, this recruit did not hand over their own number through a form, so the club needs a record of how it reached you before messaging them. Answer below and the club records their agreement; leave it blank and they are still added, and the welcome still goes out. Only a recorded refusal stops it.";

export const RECRUITMENT_ADD_OPT_IN_LABEL = "How did their contact details reach you?";

export const RECRUITMENT_ADD_OPT_IN_NOTE_LABEL = "Describe how, in your own words (optional)";

export const RECRUITMENT_ADD_OPT_IN_NOTE_HELPER =
  "A word or two is enough — this is what the club could show them if they ever asked how it had their number.";

/** "Which positions interest you?" — `W4`'s Questionnaire B (F-206-02). Genuine multi-select, grouped, twenty-two positions, not the nine flat aggregates superseded. */
export const POSITION_GROUPS: readonly {
  readonly label: string;
  readonly positions: readonly { readonly code: string; readonly label: string }[];
}[] = Object.freeze([
  Object.freeze({
    label: "Offence",
    positions: Object.freeze([
      { code: "QB", label: "Quarterback" },
      { code: "RB", label: "Running Back" },
      { code: "FB", label: "Full Back" },
      { code: "WB", label: "Wing Back" },
      { code: "WR", label: "Wide Receiver" },
      { code: "TE", label: "Tight End" },
      { code: "T", label: "Tackle" },
      { code: "G", label: "Guard" },
      { code: "C", label: "Centre" },
    ]),
  }),
  Object.freeze({
    label: "Defence",
    positions: Object.freeze([
      { code: "DE", label: "Defensive End" },
      { code: "DT", label: "Defensive Tackle" },
      { code: "NT", label: "Nose Tackle" },
      { code: "MLB", label: "Mike Linebacker" },
      { code: "WLB", label: "Will Linebacker" },
      { code: "SLB", label: "Sam Linebacker" },
      { code: "CB", label: "Cornerback" },
      { code: "FS", label: "Free Safety" },
      { code: "SS", label: "Strong Safety" },
    ]),
  }),
  Object.freeze({
    label: "Special teams",
    positions: Object.freeze([
      { code: "KO", label: "Kickoff" },
      { code: "KR", label: "Kick Return" },
      { code: "PUNT", label: "Punt" },
      { code: "FG", label: "Field Goal" },
    ]),
  }),
]);

export function positionValue(entry: { readonly code: string; readonly label: string }): string {
  return `${entry.code} · ${entry.label}`;
}

/** "What playing gear do you already have?" — `W4`'s Questionnaire B (F-206-02). Genuine multi-select, retiring the five preset bundles a single chooser offered. */
export const GEAR_ITEMS: readonly string[] = Object.freeze([
  "Boots",
  "Gloves",
  "Mouthguard",
  "Helmet",
  "Shoulder pads",
  "Padded trousers",
]);

export function splitMultiAnswer(value: string | null): readonly string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}

export function joinMultiAnswer(values: readonly string[]): string {
  return values.join(", ");
}
