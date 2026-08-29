import type { PersonDuplicateCandidate } from "@/lib/services/person-duplicate";

/**
 * The state `/operate/people/new`'s form is driven by, and the pure helpers
 * that go with it — the same split `roster/new/intake-state.ts` states, and
 * for the same reason: a `"use server"` file may export only async
 * functions.
 */

export interface CreateFormValues {
  givenName: string;
  familyName: string;
  mobile: string;
  personalEmail: string;
}

export const EMPTY_VALUES: CreateFormValues = {
  givenName: "",
  familyName: "",
  mobile: "",
  personalEmail: "",
};

export type CreateFieldErrors = Partial<Record<keyof CreateFormValues, string>>;

export interface CreateState {
  values: CreateFormValues;
  errors: CreateFieldErrors;
  /** `null` before the first check; an array (possibly empty) afterwards. */
  candidates: PersonDuplicateCandidate[] | null;
  /** Set when creating over this exact match needs a reason — W3-04. */
  exactMatch: PersonDuplicateCandidate | null;
  reasonError?: string;
  formError?: string;
}

export const INITIAL_CREATE_STATE: CreateState = {
  values: EMPTY_VALUES,
  errors: {},
  candidates: null,
  exactMatch: null,
};

export const GENERIC_FAILURE =
  "That could not be saved, and nothing was written. Try again, and tell the club " +
  "administrator if it keeps happening.";

export function readCreateValues(formData: FormData): CreateFormValues {
  const read = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  return {
    givenName: read("givenName"),
    familyName: read("familyName"),
    mobile: read("mobile"),
    personalEmail: read("personalEmail"),
  };
}
