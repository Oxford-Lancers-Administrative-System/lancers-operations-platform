/**
 * What the report's forms hand back to the screens.
 *
 * Beside `actions.ts` rather than in it: a `"use server"` module may export
 * only async functions, so a shared constant or an exported type would be a
 * build error. Same split as the attendance and event forms.
 */

/**
 * The result of pressing **Generate report**.
 *
 * There is no success member. A generation that commits ends in a redirect to
 * the stored snapshot it created — the operator's next question is always "what
 * does it say", and a success banner on the preview would leave them looking at
 * recomputed numbers that are no longer the ones on file. So this state carries
 * only a refusal, and the refused reporting date, so the message can sit beside
 * the field that caused it.
 */
export interface GenerateReportState {
  error: string | null;
  reportOn: string | null;
}

export const EMPTY_GENERATE_STATE: GenerateReportState = Object.freeze({
  error: null,
  reportOn: null,
});
