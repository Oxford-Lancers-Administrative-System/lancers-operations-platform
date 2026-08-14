import type { AttendancePresence } from "@/lib/services/attendance-vocabulary";

/**
 * What the attendance forms hand back to the screens.
 *
 * Beside `actions.ts` rather than in it: a `"use server"` module may only
 * export async functions, so a shared constant or a type exported from there
 * would be a build error. Same split as `../../form-state.ts`.
 *
 * This module and `./presentation.ts` are the only things the client components
 * import besides the service layer's *types*, so nothing here drags `pg` into
 * the browser bundle.
 */

/**
 * One row's save — § 9's Saving, Saved and failed-save states.
 *
 * `presence` is the value the **server** committed, not the one the operator
 * clicked. That distinction is the whole of the failed-save contract: when a
 * save fails the operator has to be able to see what is actually recorded, and
 * a state that echoed the attempted value back would tell them the opposite of
 * the truth at exactly the moment it matters.
 */
export interface AttendanceSaveState {
  /** The participant this state belongs to, so a stale state cannot show on another row. */
  key: string | null;
  /** The latest committed value, as the server read it back. */
  presence: AttendancePresence | null;
  recordedAt: string | null;
  recordedByName: string | null;
  /** The value the operator tried to save, kept visible when it failed. */
  attempted: AttendancePresence | null;
  error: string | null;
}

export const EMPTY_SAVE_STATE: AttendanceSaveState = Object.freeze({
  key: null,
  presence: null,
  recordedAt: null,
  recordedByName: null,
  attempted: null,
  error: null,
});

/** What the walk-on form gets back. */
export interface WalkUpFormState {
  error: string | null;
  /** Exactly what was typed, so nothing is retyped after a refusal. */
  values: {
    givenName: string;
    familyName: string;
    phone: string;
    email: string;
  } | null;
}

export const EMPTY_WALK_UP_STATE: WalkUpFormState = Object.freeze({ error: null, values: null });
