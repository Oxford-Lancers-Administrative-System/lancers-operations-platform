/**
 * What `recordOperatorAnswerAction` hands back to the dialog — W3, LAN-170.
 *
 * Lives beside `record-answer-actions.ts` rather than in it for the same
 * reason `operate/roster/action-state.ts` does: a `"use server"` module may
 * only export async functions, and a shared type or constant exported from one
 * is a build error. This module imports nothing that reaches the database, so
 * `record-answer.tsx` — a client component — can import it without dragging
 * `pg` into the browser bundle.
 */
export interface RecordAnswerState {
  /** One sentence about the whole attempt, or `null`. */
  error: string | null;
  /**
   * Flips to `true` on a successful save. The dialog watches this rather than
   * `pending` falling back to `false` to decide when to close itself, because
   * a *failed* save also leaves `pending` false and must keep the dialog open
   * with the failure and the operator's unsaved choices still visible.
   */
  success: boolean;
}

export const EMPTY_RECORD_ANSWER_STATE: RecordAnswerState = {
  error: null,
  success: false,
};
