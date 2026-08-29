/**
 * What a board cell's server action hands back.
 *
 * Beside `board-actions.ts` rather than inside it for the same reason
 * `action-state.ts` sits beside `actions.ts`: a `"use server"` module may only
 * export async functions, and a client component needs this type without
 * pulling the actions module — and the database access it eventually reaches
 * — into its own import graph.
 */
export interface BoardActionState {
  /** One sentence about the whole attempt, or `null`. */
  error: string | null;
}
