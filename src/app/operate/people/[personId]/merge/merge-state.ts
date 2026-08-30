/**
 * The state `/operate/people/[personId]/merge`'s confirmation form is driven
 * by — W4, LAN-185. Plain data only, for the same reason every other
 * `"use server"`-adjacent state module in this package states.
 */
export interface MergeState {
  formError?: string;
  reasonError?: string;
}

export const INITIAL_MERGE_STATE: MergeState = {};

export const GENERIC_FAILURE =
  "That could not be saved, and nothing was written. Try again, and tell the club " +
  "administrator if it keeps happening.";
