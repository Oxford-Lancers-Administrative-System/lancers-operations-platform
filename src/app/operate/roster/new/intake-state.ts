import type { PersonCandidate } from "@/lib/services/roster";
import { EMPTY_VALUES, type IntakeFieldErrors, type IntakeFormValues } from "./validation";

// The state the returner intake form is driven by. A module of its own — a
// "use server" file may export only async functions.
export type IntakeState =
  | {
      step: "details";
      values: IntakeFormValues;
      errors: IntakeFieldErrors;
      formError?: string;
    }
  | {
      step: "candidates";
      values: IntakeFormValues;
      candidates: PersonCandidate[];
      formError?: string;
    }
  | {
      step: "membership_refused";
      values: IntakeFormValues;
      candidates: PersonCandidate[];
      refusal: {
        message: string;
        personName: string;
        personGivenName: string;
        seasonLabel: string | null;
        membershipId: string | null;
      };
    };

export const INITIAL_INTAKE_STATE: IntakeState = {
  step: "details",
  values: EMPTY_VALUES,
  errors: {},
};

/** Says nothing about the cause — that text may quote a host, connection string or a real person's row. */
export const GENERIC_FAILURE =
  "That could not be saved, and nothing was written. Try again, and tell the club " +
  "administrator if it keeps happening.";

export function personLabel(person: { givenName: string; familyName: string | null }): string {
  return person.familyName ? `${person.givenName} ${person.familyName}` : person.givenName;
}
