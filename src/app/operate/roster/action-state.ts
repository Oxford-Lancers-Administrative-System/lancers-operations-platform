/**
 * What the membership actions hand back to the screens.
 *
 * These live beside `actions.ts` rather than in it because a `"use server"`
 * module may only export async functions — everything else in it becomes a
 * server-action reference, and a shared constant exported from there is a build
 * error. The same reason `events/form-state.ts` exists.
 *
 * This module imports nothing that reaches the database, so a client component
 * can import it without dragging `pg` into the browser bundle.
 */

/** What a membership action gets back. */
export interface MembershipActionState {
  /** One sentence about the whole attempt, or `null`. */
  error: string | null;
}

export const EMPTY_MEMBERSHIP_ACTION_STATE: MembershipActionState = {
  error: null,
};
