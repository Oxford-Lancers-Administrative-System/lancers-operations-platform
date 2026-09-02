import type { PersonDuplicateCandidate } from "@/lib/services/person-duplicate";
import type { CandidateIdentity } from "@/lib/services/recruitment-candidate-identity";

/**
 * The state `/operate/recruitment/new`'s form is driven by — the same split
 * `/operate/people/new/create-state.ts` keeps, for the same reason: a
 * `"use server"` file may export only async functions.
 */

export interface AddRecruitFormValues {
  givenName: string;
  familyName: string;
  mobile: string;
  personalEmail: string;
  college: string;
  matriculationYear: string;
  /** One of `RECRUITMENT_ADD_OPT_IN_OPTIONS`' own values, or `""` for "not recorded". */
  optInEvidence: string;
  /** `W6-01`'s "In your own words" — correction round 1, F-206-02. */
  optInNote: string;
}

export const EMPTY_VALUES: AddRecruitFormValues = {
  givenName: "",
  familyName: "",
  mobile: "",
  personalEmail: "",
  college: "",
  matriculationYear: "",
  optInEvidence: "",
  optInNote: "",
};

export type AddRecruitFieldErrors = Partial<Record<keyof AddRecruitFormValues, string>>;

export interface AddRecruitCandidate extends PersonDuplicateCandidate {
  readonly identity: CandidateIdentity;
}

export interface AddRecruitState {
  values: AddRecruitFormValues;
  errors: AddRecruitFieldErrors;
  /** `null` before the first check; an array (possibly empty) afterwards. */
  candidates: AddRecruitCandidate[] | null;
  /** Set when creating over this exact match needs a reason. */
  exactMatch: AddRecruitCandidate | null;
  reasonError?: string;
  formError?: string;
}

export const INITIAL_ADD_RECRUIT_STATE: AddRecruitState = {
  values: EMPTY_VALUES,
  errors: {},
  candidates: null,
  exactMatch: null,
};

export const GENERIC_FAILURE =
  "That could not be saved, and nothing was written. Try again, and tell the club " +
  "administrator if it keeps happening.";

export function readAddRecruitValues(formData: FormData): AddRecruitFormValues {
  const read = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  return {
    givenName: read("givenName"),
    familyName: read("familyName"),
    mobile: read("mobile"),
    personalEmail: read("personalEmail"),
    college: read("college"),
    matriculationYear: read("matriculationYear"),
    optInEvidence: read("optInEvidence"),
    optInNote: read("optInNote"),
  };
}
