import type { SeasonMessagingConsentState } from "./messaging-consent";

/**
 * The recruitment mission's own fixed vocabulary — types, labels, and the
 * ladder's order — shared by the server-only read/write modules
 * (`recruitment-board.ts`, `recruitment-prospect.ts`) and by client
 * components (`../../app/operate/recruitment/**`) alike.
 *
 * ## Why this file carries no `"server-only"`
 *
 * `recruitment-board.ts` and `messaging-consent.ts` both open with
 * `import "server-only"`, so a client component that imports a **value**
 * (not merely a type) from either fails at build time — Next.js forbids a
 * client bundle from ever reaching a module tagged that way, the same
 * boundary `../roster/presentation.ts` already exists to respect for the
 * roster board's own labels. This module holds no database access and no
 * secret, so it carries none of that restriction, and both sides import the
 * one copy rather than each keeping a wording of its own that could drift.
 */

export type ProspectStatus =
  "identified" | "engaged" | "committed" | "joined" | "declined" | "disengaged" | "void";

/** Ladder order — `W1`'s default sort, and what sinks the three exits to the bottom. */
export const PROSPECT_STATUS_ORDER: readonly ProspectStatus[] = Object.freeze([
  "identified",
  "engaged",
  "committed",
  "joined",
  "declined",
  "disengaged",
  "void",
]);

export const PROSPECT_STATUS_LABELS: Readonly<Record<ProspectStatus, string>> = Object.freeze({
  identified: "Identified",
  engaged: "Engaged",
  committed: "Committed",
  joined: "Joined",
  declined: "Declined",
  disengaged: "Disengaged",
  void: "Void",
});

/** The three exits, `W13`. `joined` is the fourth way off the ladder and is `W14`'s alone. */
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

/**
 * The six Questionnaire B columns, and the codebook this package had to
 * choose — see `recruitment-board.ts`'s own module comment for the full
 * reasoning. `B1`–`B5` are `recruitment-cycle.ts`'s own
 * `QUESTIONNAIRE_B_COMPLETING_CODES`; `B6` is the free-text "anything else"
 * that never completes anything, in both places.
 */
export const QUESTIONNAIRE_B_CODE = Object.freeze({
  playedBefore: "B1",
  watchedBefore: "B2",
  positionInterest: "B3",
  gearOwned: "B4",
  howTheyHeard: "B5",
  anythingElse: "B6",
} as const);

/**
 * "How we came by this number" — `W6`'s opt-in evidence. Correction round 1,
 * F-206-02: Brian ruled "Mock up wins" on structure and copy wherever the
 * runnable fidelity mockup (`src/app/recruitment-preview/add-recruit.tsx` on
 * `origin/chore/recruitment-fidelity-mockup`) disagrees with the approved,
 * generated `W6-01.js` proposal script — this option set is that mockup's
 * own literal list, superseding the earlier one drawn from the script. A
 * value, not a type, so it lives here rather than in `recruitment-add.ts`
 * (`server-only`) for the same reason every other value this module exports
 * does — `add-recruit-form.tsx` is a client component and a client bundle
 * may never reach a `server-only`-tagged module (see this file's own module
 * note above).
 */
export const RECRUITMENT_ADD_OPT_IN_OPTIONS: readonly { value: string; label: string }[] =
  Object.freeze([
    { value: "gave_it", label: "They gave it to us themselves" },
    { value: "passed_on", label: "A member passed it on with their agreement" },
    { value: "public", label: "It is publicly listed and they expect to hear from clubs" },
    { value: "other", label: "Something else — written below" },
  ]);

/**
 * `W6-01`'s companion free-text field, restored in correction round 1
 * (F-206-02) — the mockup's own "In your own words", beside the chooser
 * above: "Free text alone is unauditable and a tick alone records nothing,
 * so this door asks for both."
 */
export const RECRUITMENT_ADD_OPT_IN_NOTE_HELPER =
  "Free text alone is unauditable and a tick alone records nothing, so this door asks for both.";

/**
 * "Which positions interest you?" — `W4`'s Questionnaire B, correction round
 * 1 (F-206-02). Genuine multi-select, grouped Offence / Defence / Special
 * teams, `CODE · Label` — the fidelity mockup's own `POSITION_GROUPS`
 * (`src/app/recruitment-preview/fixtures.ts`), carrying Brian's own dated
 * quote: "A recruit is allowed to be interested in more than one thing."
 * Twenty-two positions, not the nine flat aggregates the superseded single
 * chooser offered.
 */
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

/** The `CODE · Label` value `POSITION_GROUPS`' own entries store and prefill by. */
export function positionValue(entry: { readonly code: string; readonly label: string }): string {
  return `${entry.code} · ${entry.label}`;
}

/**
 * "What playing gear do you already have?" — `W4`'s Questionnaire B,
 * correction round 1 (F-206-02). Genuine multi-select over six individual
 * items, the fidelity mockup's own `GEAR_ITEMS`, retiring the five preset
 * bundles a single chooser offered — a recruit owning boots and a
 * mouthguard could previously only claim "Full pads" (false) or "Something
 * else" (uninformative). Note the mockup's own verb is *have*, not *own*.
 */
export const GEAR_ITEMS: readonly string[] = Object.freeze([
  "Boots",
  "Gloves",
  "Mouthguard",
  "Helmet",
  "Shoulder pads",
  "Padded trousers",
]);

/** Splits a stored joined multi-select answer back into its selected values. */
export function splitMultiAnswer(value: string | null): readonly string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}

/** Joins selected multi-select values into the one string a single `answer_choice` column stores. */
export function joinMultiAnswer(values: readonly string[]): string {
  return values.join(", ");
}
