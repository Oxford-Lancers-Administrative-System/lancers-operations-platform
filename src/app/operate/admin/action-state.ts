/**
 * What Administration's server actions hand back to the screens — LAN-133.
 *
 * These live beside `actions.ts` rather than in it because a `"use server"`
 * module may only export async functions; everything else exported from one
 * becomes a server-action reference, and a shared constant exported from there
 * is a build error. The same reason `roster/action-state.ts` and
 * `events/form-state.ts` exist.
 *
 * This module imports nothing that reaches the database, so a client component
 * can import it without dragging `pg` into the browser bundle.
 */

/** One person the invitation or assignment flow might mean. */
export interface CandidateChoice {
  readonly personId: string;
  readonly name: string;
  readonly email: string | null;
  readonly phone: string | null;
  /** Why they surfaced — "email", "family name", … — so the choice is informed. */
  readonly matchedOn: readonly string[];
  /**
   * What already exists on this Person's login, in the club's words, or `null`
   * when they have none. Non-null is usually the answer to the question the
   * search is asking: this person cannot be invited again.
   */
  readonly operatorState: string | null;
  readonly operatorAccountId: string | null;
}

/**
 * The state every Administration action returns.
 *
 * `error` is the service's own sentence — those are written for the operator
 * and never carry a row, a host or a connection string — and `notice` is the
 * screen's confirmation. Both are `null` before anything has been attempted.
 *
 * A refusal is never either of them, and `refusal` is why it now has a field of
 * its own rather than being rethrown — LAN133-BRIAN-1.
 *
 * The original reasoning was sound and is preserved: a refusal rendered as red
 * text beside a button reads as "try again", which is the wrong instruction and
 * hides an authorization event inside a validation failure. The conclusion drawn
 * from it was not. Rethrowing `NotPermitted` out of a server action does not
 * produce a refusal *screen*; it produces an unhandled exception, and Brian met
 * it as a Next.js error page with a stack trace when he invited somebody to a
 * protected seat. The guard had done its job and written a good sentence —
 * "This action affects the President. Only the General Manager role may assign
 * this role for that seat." — and the screen threw it away.
 *
 * So the refusal is carried back deliberately, in its own field, and rendered
 * as a rule rather than as a failed attempt. Keeping it out of `error` is what
 * stops it reading as "try again"; keeping it out of an exception is what stops
 * it reading as a crash. Authorization itself is unaffected: every action asked
 * the whole question again inside its own transaction before this state was
 * built, and nothing here decides anything.
 */
export interface AdminActionState {
  readonly error: string | null;
  readonly notice: string | null;
  /** Populated only by the duplicate check. Empty means "searched, none found". */
  readonly candidates: readonly CandidateChoice[] | null;
  /**
   * The guard's own sentence, when the club's rules refuse this action to this
   * administrator against this person. Never a validation message, and never
   * something a retry can change.
   */
  readonly refusal: string | null;
}

export const EMPTY_ADMIN_ACTION_STATE: AdminActionState = Object.freeze({
  error: null,
  notice: null,
  candidates: null,
  refusal: null,
});
