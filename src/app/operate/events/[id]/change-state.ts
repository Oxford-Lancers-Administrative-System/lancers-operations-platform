/**
 * What the cancellation form hands back — LAN-156.
 *
 * Beside `change-actions.ts` rather than in it, for the reason `form-state.ts`
 * gives: a `"use server"` module may export only async functions, so a shared
 * type declared there would be a build error.
 */
export interface CancelFormState {
  /** One sentence about the whole submission, or `null`. */
  error: string | null;
  /** What the operator typed, so a refusal never costs them their words. */
  reason: string;
}

export const EMPTY_CANCEL_STATE: CancelFormState = { error: null, reason: "" };
