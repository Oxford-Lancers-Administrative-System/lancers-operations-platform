/**
 * The query keys the RSVP page and its actions agree on. LAN-79.
 *
 * They live outside `actions.ts` because a `"use server"` module may export
 * nothing but async functions, and outside `presentation.ts` because these are
 * routing details rather than approved copy.
 *
 * The steps are query parameters rather than routes so that the whole journey
 * is one `/rsvp/[token]` entry in the approved screen registry, and so that a
 * player without JavaScript moves between UX-60, UX-61 and UX-62 with ordinary
 * links and form posts.
 */

export const STEP_PARAM = "step";
export const DECLINE_STEP = "decline";
export const SAVED_PARAM = "saved";
export const ERROR_PARAM = "error";

/** The player left the reason empty. Recoverable, and said so on UX-61. */
export const REASON_REQUIRED_ERROR = "reason";
/**
 * The write window is shut, for any reason at all.
 *
 * Deliberately one value. A revoked link, an unknown one, an expired one and an
 * event that has started all arrive here, because distinguishing them in a
 * query parameter would leak exactly what the uniform terminal response exists
 * to hide.
 */
export const CLOSED_ERROR = "closed";

/**
 * The request was rate limited.
 *
 * Distinct from `closed` on purpose. Both refuse the write, but they are not
 * the same fact and must not read as one: `closed` tells a player their event
 * has started, and telling that to somebody who merely arrived in a busy minute
 * is false and leaves them nothing to do. This one says try again.
 */
export const BUSY_ERROR = "busy";
