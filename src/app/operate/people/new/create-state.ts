import type { PersonDuplicateCandidate } from "@/lib/services/person-duplicate";

export interface CreateFormValues {
  givenName: string;
  /** LAN-366. Optional, and it is the only name field here that is. */
  middleName: string;
  familyName: string;
  mobile: string;
  personalEmail: string;
}

export const EMPTY_VALUES: CreateFormValues = {
  givenName: "",
  middleName: "",
  familyName: "",
  mobile: "",
  personalEmail: "",
};

export type CreateFieldErrors = Partial<Record<keyof CreateFormValues, string>>;

export interface CreateState {
  values: CreateFormValues;
  errors: CreateFieldErrors;
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
    middleName: read("middleName"),
    familyName: read("familyName"),
    mobile: read("mobile"),
    personalEmail: read("personalEmail"),
  };
}
