/** The one query key this route needs. LAN-172. */
export const ERROR_PARAM = "error";

/**
 * The primary confirm form's own DOM id — OWNER-LAN172-17. `auto-submit.tsx`
 * looks this exact id up with `document.getElementById` to submit the form
 * itself on mount; named once, here, so the id used to render the form and
 * the id used to find it can never drift apart from each other.
 */
export const ANSWER_FORM_ID = "lo-answer-form";
