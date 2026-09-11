import type { PersonDuplicateCandidate } from "@/lib/services/person-duplicate";
import type { CandidateIdentity } from "@/lib/services/recruitment-candidate-identity";

/** The state `/operate/recruitment/new`'s form is driven by — same split as `/operate/people/new/create-state.ts` (a "use server" file may export only async functions). */

export interface AddRecruitFormValues {
  givenName: string;
  familyName: string;
  mobile: string;
  /** LAN-268, Brian 2026-09-09: required, ox.ac.uk only. */
  collegeEmail: string;
  personalEmail: string;
  /** V-2, correction round 2: the shipped intake forms' own field set; every field below is optional (REQ-missing-never-blocks). */
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

const EMPTY_VALUES: AddRecruitFormValues = {
  givenName: "",
  familyName: "",
  mobile: "",
  collegeEmail: "",
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

/** V-3/V-4, correction round 2: an existing-member match gets its own confirmation screen, not the formError banner. */
interface AddRecruitAlreadyMember {
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
    collegeEmail: read("collegeEmail"),
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
