import type { QuestionIssue, RawEventQuestion } from "@/lib/services/event-questions-input";
import type { RawEventTemplate, TemplateFieldIssue } from "@/lib/services/event-template-input";
import type { TemplateChangePlan } from "@/lib/services/event-templates";

/**
 * What the template editor hands back to its screen — W8-02 and W8-03.
 *
 * Beside `actions.ts` rather than in it, for the reason the events' own
 * `form-state.ts` gives: a `"use server"` module may only export async
 * functions, so a shared type or constant declared there would be a build error.
 *
 * ## Two outcomes now — LAN-276 correction round 1
 *
 * `phase` says which. `"editing"` is a fresh form or a refused submission;
 * `"confirming"` carries the blast radius W8-03 shows and has written nothing.
 * There used to be a third, `"saved"`, reached after a successful write; the
 * save actions redirect to the template list now (Brian, 2026-09-10: "it
 * should take me back to the other test templates"), so a state the browser
 * would render after the write is never reached — `redirect` throws before
 * either action returns one.
 *
 * The plan travels back to the browser only to be **read**. It is never posted
 * forward and never trusted: `saveEventTemplate` recomputes it under its own
 * locks, so what the operator saw is a courtesy and what happens is derived from
 * the rows again at the moment of the write.
 */
export type TemplateFormPhase = "editing" | "confirming";

export interface TemplateFormState {
  phase: TemplateFormPhase;
  /** Field-keyed corrections. Empty when the failure was not a field's fault. */
  issues: TemplateFieldIssue[];
  /** Corrections for the questions, addressed by position. */
  questionIssues: QuestionIssue[];
  /** One sentence about the whole submission, or `null`. */
  error: string | null;
  /** Exactly what was submitted, so nothing is retyped. */
  values: RawEventTemplate | null;
  /** The questions exactly as submitted, for the same reason. */
  questions: RawEventQuestion[] | null;
  /** What saving will do, or what it did. `null` while editing. */
  plan: TemplateChangePlan | null;
}

export const EMPTY_TEMPLATE_FORM_STATE: TemplateFormState = {
  phase: "editing",
  issues: [],
  questionIssues: [],
  error: null,
  values: null,
  questions: null,
  plan: null,
};
