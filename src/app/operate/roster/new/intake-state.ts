import type { PersonCandidate } from "@/lib/services/roster";
import { EMPTY_VALUES, type IntakeFieldErrors, type IntakeFormValues } from "./validation";

/**
 * The state the returner intake form is driven by, and the pure helpers that go
 * with it.
 *
 * This is a module of its own rather than part of `./actions.ts` for a reason
 * the build enforces: a `"use server"` file may export **only async functions**,
 * because every one of its exports becomes a callable server endpoint. A
 * constant or a synchronous helper living there is a build error, and the fix is
 * not to make them async — it is to put things that are not endpoints somewhere
 * that is not an endpoint list.
 *
 * Everything here is plain data and pure functions, so the client component and
 * the server action can both import it without either pulling the other in.
 */

/** What the form is showing. The action returns exactly one of these. */
export type IntakeState =
  | {
      step: "details";
      values: IntakeFormValues;
      errors: IntakeFieldErrors;
      /** A failure that belongs to the submission rather than to one field. */
      formError?: string;
    }
  | {
      step: "candidates";
      values: IntakeFormValues;
      candidates: PersonCandidate[];
      /** A failure raised while trying to act on a choice. */
      formError?: string;
    }
  | {
      step: "membership_refused";
      values: IntakeFormValues;
      candidates: PersonCandidate[];
      refusal: {
        /** The service's own sentence. Shown when the composed one cannot be. */
        message: string;
        personName: string;
        /** The open season's label, when the refused person is still a candidate. */
        seasonLabel: string | null;
        membershipId: string | null;
      };
    };

export const INITIAL_INTAKE_STATE: IntakeState = {
  step: "details",
  values: EMPTY_VALUES,
  errors: {},
};

/**
 * The sentence shown when something failed that is not a refusal the club
 * recognises — a bug, a driver failure, a lost connection. Deliberately says
 * nothing about the cause: that text may quote a host, a connection string or a
 * row, and for this schema a row is a real person's name and contact details.
 */
export const GENERIC_FAILURE =
  "That could not be saved, and nothing was written. Try again, and tell the club " +
  "administrator if it keeps happening.";

/** A person's name as the club would write it, for a refusal or a confirmation. */
export function personLabel(person: { givenName: string; familyName: string | null }): string {
  return person.familyName ? `${person.givenName} ${person.familyName}` : person.givenName;
}
