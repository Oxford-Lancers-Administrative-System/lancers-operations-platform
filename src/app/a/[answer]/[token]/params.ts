/** The two query keys this route needs. LAN-172; `saved` added by LAN-376. */
export const ERROR_PARAM = "error";

/**
 * Set by `submitAnswer` on the one redirect that comes back here — a recruit's
 * saved page. Before LAN-376 that page was reached by the token being consumed;
 * now a consumed token is writable again (tapping the button a second time must
 * record again), so "already recorded" needs a marker of its own rather than
 * being inferred from the stamp.
 */
export const SAVED_PARAM = "saved";

/** The primary confirm form's DOM id (OWNER-LAN172-17) — `auto-submit.tsx` looks it up to submit on mount. */
export const ANSWER_FORM_ID = "lo-answer-form";
