import type { FieldIssue, RawEventDraft } from "@/lib/services/event-input";
import type { QuestionIssue, RawEventQuestion } from "@/lib/services/event-questions-input";

/**
 * What the event forms hand back to the screens.
 *
 * These live beside `actions.ts` rather than in it because a `"use server"`
 * module may only export async functions — everything else in it becomes a
 * server-action reference. A shared constant exported from there would be a
 * build error, and the type would be one too.
 *
 * The client form imports this module and `@/lib/services/event-input`; neither
 * reaches the database, so neither drags `pg` into the browser bundle.
 */

/** What a form gets back. Every field the operator filled in survives it. */
export interface EventFormState {
  /** Field-keyed corrections. Empty when the failure was not a field's fault. */
  issues: FieldIssue[];
  /**
   * Corrections for the questions, addressed by position rather than by field
   * name — amendment W4-A1.
   *
   * A separate list because a repeating group has no single field to point at:
   * "this question is already being asked" belongs to the third card, and
   * `FieldIssue.field` is keyed to `RawEventDraft`, which has no third card.
   */
  questionIssues: QuestionIssue[];
  /** One sentence about the whole submission, or `null`. */
  error: string | null;
  /** Exactly what was submitted, so nothing is retyped. */
  values: RawEventDraft | null;
  /** The questions exactly as submitted, for the same reason. */
  questions: RawEventQuestion[] | null;
}

export const EMPTY_FORM_STATE: EventFormState = {
  issues: [],
  questionIssues: [],
  error: null,
  values: null,
  questions: null,
};

/** What a transition button gets back. */
export interface EventTransitionState {
  error: string | null;
}

export const EMPTY_TRANSITION_STATE: EventTransitionState = { error: null };
