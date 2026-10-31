/**
 * The dietary preference vocabulary — LAN-502 (Brian, 2026-10-15). Three
 * answers, stored as these codes (`people_dietary_preference_known`), shown as
 * these labels everywhere: the onboarding details step, the person record and
 * its edit form, and the roster board's Person column.
 *
 * Pure and client-safe: the onboarding form and the board's column model both
 * import it.
 */

export const DIETARY_PREFERENCE_VALUES = Object.freeze(["vegan", "vegetarian", "none"] as const);

export type DietaryPreference = (typeof DIETARY_PREFERENCE_VALUES)[number];

export const DIETARY_PREFERENCE_LABELS: Readonly<Record<DietaryPreference, string>> = Object.freeze(
  {
    vegan: "Vegan",
    vegetarian: "Vegetarian",
    none: "No dietary requirements",
  },
);

export const DIETARY_PREFERENCE_OPTIONS: ReadonlyArray<{
  value: DietaryPreference;
  label: string;
}> = Object.freeze(
  DIETARY_PREFERENCE_VALUES.map((value) =>
    Object.freeze({ value, label: DIETARY_PREFERENCE_LABELS[value] }),
  ),
);

export function isDietaryPreference(value: string): value is DietaryPreference {
  return (DIETARY_PREFERENCE_VALUES as readonly string[]).includes(value);
}

/** The label for a stored code; `null` for no answer. */
export function dietaryPreferenceLabel(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  return isDietaryPreference(value) ? DIETARY_PREFERENCE_LABELS[value] : value;
}
