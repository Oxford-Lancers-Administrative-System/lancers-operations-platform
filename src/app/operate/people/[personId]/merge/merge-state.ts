export interface MergeState {
  formError?: string;
  reasonError?: string;
}

export const INITIAL_MERGE_STATE: MergeState = {};

export const GENERIC_FAILURE =
  "That could not be saved, and nothing was written. Try again, and tell the club " +
  "administrator if it keeps happening.";
