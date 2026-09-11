/**
 * What `recordOperatorAnswerAction` hands back to the dialog — W3, LAN-170.
 * Lives beside, not in, `record-answer-actions.ts`: a `"use server"` module
 * may only export async functions.
 */
export interface RecordAnswerState {
  /** One sentence about the whole attempt, or `null`. */
  error: string | null;
  /** Flips to `true` on a successful save; the dialog watches this, not `pending`, since a failed save also leaves `pending` false. */
  success: boolean;
}

export const EMPTY_RECORD_ANSWER_STATE: RecordAnswerState = {
  error: null,
  success: false,
};
