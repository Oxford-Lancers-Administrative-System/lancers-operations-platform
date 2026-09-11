/** Query keys the RSVP page and its actions agree on (LAN-79) — steps are params, not routes, so the journey stays one entry and works without JS. Decision history: docs/ux/tickets/LAN-79-player-rsvp.md */

export const STEP_PARAM = "step";
export const DECLINE_STEP = "decline";
export const SAVED_PARAM = "saved";
export const ERROR_PARAM = "error";

/** The player left the reason empty. Recoverable (UX-61). */
export const REASON_REQUIRED_ERROR = "reason";

/** The write window is shut, for any reason (revoked, unknown, expired, started) — one value, so the uniform terminal response is not leaked. */
export const CLOSED_ERROR = "closed";

/** Rate limited — distinct from `closed`: this says try again, not that the event has started. */
export const BUSY_ERROR = "busy";
