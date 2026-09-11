import type {
  RecruitmentCycleStepChange,
  RecruitmentCycleStepName,
} from "@/lib/services/recruitment-cycle";

// Reading and checking the recruitment cycle's own rows — LAN-203,
// `REQ-recruitment-cycle`. Decision history: docs/ux/tickets/LAN-203-recruit-ladders-and-cycle.md · missions/intake/M-RECRUITMENT/decision-history.md.

export interface CycleStepFieldBounds {
  readonly step: RecruitmentCycleStepName;
  readonly label: string;
  readonly min: number;
  readonly max: number;
}

/** Hours throughout (the column's own unit; Welcome can fire at 0). Reminders read "hours after capture", not after the prior message. Decision history: docs/ux/tickets/LAN-203-recruit-ladders-and-cycle.md · missions/intake/M-RECRUITMENT/decision-history.md. */
export const CYCLE_STEP_FIELDS: readonly CycleStepFieldBounds[] = Object.freeze([
  { step: "welcome", label: "First message after capture", min: 0, max: 2160 },
  { step: "details_reminder", label: "Second message after capture", min: 0, max: 2160 },
  { step: "interest_ask", label: "Ask after capture", min: 0, max: 2160 },
  { step: "interest_reminder", label: "Reminder after capture", min: 0, max: 2160 },
]);

const FIELDS_BY_STEP: ReadonlyMap<RecruitmentCycleStepName, CycleStepFieldBounds> = new Map(
  CYCLE_STEP_FIELDS.map((field) => [field.step, field]),
);

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
