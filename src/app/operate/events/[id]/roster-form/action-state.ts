/**
 * The roster form action's own state shape and refusal sentence.
 *
 * It lives beside `./actions.ts` rather than inside it because a `"use server"`
 * file may export only async functions — a type or a constant exported from one
 * fails at runtime with `A "use server" file can only export async functions,
 * found string`, which is a 500 on the click rather than a build error. The
 * same split `../attendance/action-state.ts` already makes, for the same
 * reason.
 */

export interface GenerateRosterFormState {
  /** ISO instant the generation was recorded, or `null` when it was not. */
  readonly generatedAt: string | null;
  readonly error: string | null;
}

export const ROSTER_FORM_GENERATE_FAILED =
  "That could not be recorded, and nothing was written. Try again, and tell the club " +
  "administrator if it keeps happening.";
