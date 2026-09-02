/**
 * What the recruitment board's and record's server actions hand back.
 *
 * Beside `board-actions.ts`/`[prospectId]/actions.ts` rather than inside them:
 * a `"use server"` module may only export async functions, and a client
 * component needs this type without pulling the database access those
 * modules eventually reach into its own import graph — the same reason
 * `../roster/board-action-state.ts` exists.
 */
export interface RecruitmentActionState {
  /** One sentence about the whole attempt, or `null`. */
  error: string | null;
}

export const EMPTY_RECRUITMENT_ACTION_STATE: RecruitmentActionState = { error: null };
