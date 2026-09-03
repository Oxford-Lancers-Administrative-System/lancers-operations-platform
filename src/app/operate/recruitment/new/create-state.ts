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
  /**
   * V-2, correction round 2 — the shipped intake forms' own field set
   * (`signup-form.tsx`, `edit-person-form.tsx`), not one invented here.
   * Every field below is optional; `REQ-missing-never-blocks` names only
   * first name, last name and mobile.
   */
  knownAs: string;
  college: string;
  matriculationYear: string;
  expectedGraduationYear: string;
  degreeField: string;
  dateOfBirth: string;
  emergencyGivenName: string;
  emergencyFamilyName: string;
  emergencyRelationship: string;
  emergencyPhone: string;
  emergencyEmail: string;
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
  knownAs: "",
  college: "",
  matriculationYear: "",
  expectedGraduationYear: "",
  degreeField: "",
  dateOfBirth: "",
  emergencyGivenName: "",
  emergencyFamilyName: "",
  emergencyRelationship: "",
  emergencyPhone: "",
  emergencyEmail: "",
  optInEvidence: "",
  optInNote: "",
};

export type AddRecruitFieldErrors = Partial<Record<keyof AddRecruitFormValues, string>>;

export interface AddRecruitCandidate extends PersonDuplicateCandidate {
  readonly identity: CandidateIdentity;
}

/**
 * V-3 / V-4, correction round 2 — "This is them" on a candidate who already
 * holds a membership this season used to fall into the ordinary `formError`
 * banner, stacked on top of the still-visible candidates panel and form:
 * Brian's own "flurry of information" and "that's not an error state."
 * Set only for that one outcome, and rendered as this record's own single
 * confirmation screen — everything else disappears while it is set.
 */
export interface AddRecruitAlreadyMember {
  readonly displayName: string;
  readonly membershipStatus: string;
  readonly seasonLabel: string;
}

export interface AddRecruitState {
  values: AddRecruitFormValues;
  errors: AddRecruitFieldErrors;
  /** `null` before the first check; an array (possibly empty) afterwards. */
  candidates: AddRecruitCandidate[] | null;
  /** Set when creating over this exact match needs a reason. */
  exactMatch: AddRecruitCandidate | null;
  /** Set only when "This is them" resolved to a current player — V-3/V-4. */
  alreadyMember?: AddRecruitAlreadyMember | null;
  reasonError?: string;
  formError?: string;
}

export const INITIAL_ADD_RECRUIT_STATE: AddRecruitState = {
  values: EMPTY_VALUES,
  errors: {},
  candidates: null,
  exactMatch: null,
  alreadyMember: null,
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
    knownAs: read("knownAs"),
    college: read("college"),
    matriculationYear: read("matriculationYear"),
    expectedGraduationYear: read("expectedGraduationYear"),
    degreeField: read("degreeField"),
    dateOfBirth: read("dateOfBirth"),
    emergencyGivenName: read("emergencyGivenName"),
    emergencyFamilyName: read("emergencyFamilyName"),
    emergencyRelationship: read("emergencyRelationship"),
    emergencyPhone: read("emergencyPhone"),
    emergencyEmail: read("emergencyEmail"),
    optInEvidence: read("optInEvidence"),
    optInNote: read("optInNote"),
  };
}
