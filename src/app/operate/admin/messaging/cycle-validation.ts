import type {
  RecruitmentCycleStepChange,
  RecruitmentCycleStepName,
} from "@/lib/services/recruitment-cycle";

/**
 * Reading and checking the recruitment cycle's own rows — LAN-203,
 * `REQ-recruitment-cycle`. The `validation.ts` ergonomic-layer-in-front-of-
 * the-database idiom, for the cycle's four steps instead of the seven event
 * types.
 *
 * ## Why a form can cover more than one step
 *
 * `messaging_schedules_and_chase`'s law is one row, one form, one SAVE — and
 * the cycle's own two rows (Brian, 2026-09-01) keep it: **Welcome** is one
 * page row *of the page* covering two database rows, `welcome` and its own
 * `details_reminder` — "the top two bars here should be made as one… the
 * first message gets sent out 0 hours after, and then the second one" — and
 * **Recruitment questionnaire** is the same shape, covering `interest_ask`
 * and its own `interest_reminder`. Both are the same "several columns, one
 * row, one save" idiom the Recruitment event type's six fields already use.
 * `readCycleStepsChange` is therefore given the list of step names one
 * submission covers, and reads each one's own field out of the same
 * `FormData` by a `step_<name>_` prefix, rather than being called once per
 * database row.
 *
 * ## No `enabled` — superseded, Brian, 2026-09-01
 *
 * `REQ-recruitment-cycle`'s per-step toggle is gone: "the toggles were
 * completely invented… Remove the toggles." This module reads and validates
 * only each step's timing field now; `recruitment-cycle.ts`'s own module note
 * explains why the database column survives untouched while the application
 * stops reading and writing it.
 */

export interface CycleStepFieldBounds {
  readonly step: RecruitmentCycleStepName;
  /** The page's own short label for this step's timing field. */
  readonly label: string;
  readonly min: number;
  readonly max: number;
}

/**
 * Every step's own field, in the cycle's declared order. Hours throughout —
 * `offset_hours` is the column's own unit, and Welcome already has to be in
 * hours (it can fire at `0`, immediately, which "0 days" would misstate as
 * "a whole day"), so every step reads the same way rather than switching
 * units row to row.
 *
 * `details_reminder` and `interest_reminder` both read "hours after
 * capture", not "hours after" the message before them — a step's own timing
 * has to stay meaningful on its own, the same reasoning that named
 * `interest_reminder`'s field before it, extended to `details_reminder` now
 * that the two are shown on one row (Brian, 2026-09-01).
 */
export const CYCLE_STEP_FIELDS: readonly CycleStepFieldBounds[] = Object.freeze([
  { step: "welcome", label: "First message after capture", min: 0, max: 2160 },
  { step: "details_reminder", label: "Second message after capture", min: 0, max: 2160 },
  { step: "interest_ask", label: "Ask after capture", min: 0, max: 2160 },
  { step: "interest_reminder", label: "Reminder after capture", min: 0, max: 2160 },
]);

const FIELDS_BY_STEP: ReadonlyMap<RecruitmentCycleStepName, CycleStepFieldBounds> = new Map(
  CYCLE_STEP_FIELDS.map((field) => [field.step, field]),
);

/** The step's own words, for a page reader — "Welcome", not "welcome". */
export const CYCLE_STEP_LABELS: Readonly<Record<RecruitmentCycleStepName, string>> = Object.freeze({
  welcome: "Welcome",
  details_reminder: "Details reminder",
  interest_ask: "Recruitment questionnaire",
  interest_reminder: "Recruitment questionnaire reminder",
});

export type CycleStepsValidation =
  | {
      readonly ok: true;
      readonly changes: ReadonlyMap<RecruitmentCycleStepName, RecruitmentCycleStepChange>;
    }
  | { readonly ok: false; readonly message: string };

/**
 * Reads and checks every step named in `steps`, from one row's own form.
 *
 * No `enabled` field — Brian, 2026-09-01: "the toggles were completely
 * invented… Remove the toggles." `offsetHours` follows `SCHEDULE_FIELDS`'
 * own reading: blank, non-integer and out-of-bounds are each refused by
 * name before anything reaches the database.
 */
export function readCycleStepsChange(
  steps: readonly RecruitmentCycleStepName[],
  formData: FormData,
): CycleStepsValidation {
  const changes = new Map<RecruitmentCycleStepName, RecruitmentCycleStepChange>();

  for (const step of steps) {
    const bound = FIELDS_BY_STEP.get(step);
    if (!bound) {
      return { ok: false, message: `${step} is not a recruitment cycle step.` };
    }
    const label = CYCLE_STEP_LABELS[step];

    const raw = formData.get(`step_${step}_offsetHours`);
    if (typeof raw !== "string" || raw.trim() === "") {
      return { ok: false, message: `${label}: the timing field cannot be left blank.` };
    }
    const offsetHours = Number(raw);
    if (!Number.isInteger(offsetHours)) {
      return { ok: false, message: `${label}: the timing field has to be a whole number.` };
    }
    if (offsetHours < bound.min || offsetHours > bound.max) {
      return {
        ok: false,
        message: `${label}: the timing field has to be between ${bound.min} and ${bound.max} hours.`,
      };
    }

    changes.set(step, { offsetHours });
  }

  return { ok: true, changes };
}
