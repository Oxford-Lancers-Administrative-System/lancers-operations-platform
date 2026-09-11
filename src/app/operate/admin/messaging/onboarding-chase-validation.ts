// Reading and checking the onboarding chase's own row — LAN-218, `W11`.
// Bounds mirror the database's own check constraints exactly.

export interface OnboardingChaseFieldBounds {
  /** The `<input>` name within the section's one form. */
  readonly key: "firstChaseAfterHours" | "chaseCount" | "chaseIntervalDays";
  readonly label: string;
  readonly unit: string;
  readonly min: number;
  readonly max: number;
}

export const ONBOARDING_CHASE_FIELDS: readonly OnboardingChaseFieldBounds[] = Object.freeze([
  { key: "firstChaseAfterHours", label: "First chase after joining", unit: "h", min: 0, max: 2160 },
  { key: "chaseCount", label: "Ask this many times", unit: "", min: 0, max: 50 },
  { key: "chaseIntervalDays", label: "Every", unit: "days", min: 1, max: 90 },
]);

export interface OnboardingChaseChange {
  readonly firstChaseAfterHours: number;
  readonly chaseCount: number;
  readonly chaseIntervalDays: number;
}

export type OnboardingChaseValidation =
  | { readonly ok: true; readonly change: OnboardingChaseChange }
  | { readonly ok: false; readonly message: string };

/** Reads and checks the section's one form. Blank, non-integer and out-of-bounds are each refused by name. */
export function readOnboardingChaseChange(formData: FormData): OnboardingChaseValidation {
  const values: Record<string, number> = {};

  for (const field of ONBOARDING_CHASE_FIELDS) {
    const raw = formData.get(field.key);
    if (typeof raw !== "string" || raw.trim() === "") {
      return { ok: false, message: `${field.label}: this field cannot be left blank.` };
    }
    const value = Number(raw);
    if (!Number.isInteger(value)) {
      return { ok: false, message: `${field.label}: this field has to be a whole number.` };
    }
    if (value < field.min || value > field.max) {
      return {
        ok: false,
        message: `${field.label}: this field has to be between ${field.min} and ${field.max}.`,
      };
    }
    values[field.key] = value;
  }

  return {
    ok: true,
    change: {
      firstChaseAfterHours: values.firstChaseAfterHours,
      chaseCount: values.chaseCount,
      chaseIntervalDays: values.chaseIntervalDays,
    },
  };
}

/** Whether a change actually differs from the current row — an unchanged submission writes nothing. */
export function onboardingChaseChanged(
  current: OnboardingChaseChange,
  change: OnboardingChaseChange,
): boolean {
  return (
    current.firstChaseAfterHours !== change.firstChaseAfterHours ||
    current.chaseCount !== change.chaseCount ||
    current.chaseIntervalDays !== change.chaseIntervalDays
  );
}
