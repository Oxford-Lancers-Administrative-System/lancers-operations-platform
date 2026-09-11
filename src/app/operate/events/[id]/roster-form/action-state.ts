export interface GenerateRosterFormState {
  readonly generatedAt: string | null;
  readonly error: string | null;
}

export const ROSTER_FORM_GENERATE_FAILED =
  "That could not be recorded, and nothing was written. Try again, and tell the club " +
  "administrator if it keeps happening.";
