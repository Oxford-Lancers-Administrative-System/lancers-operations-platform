import type { FieldIssue, RawEventDraft } from "@/lib/services/event-input";

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
  /** One sentence about the whole submission, or `null`. */
  error: string | null;
  /** Exactly what was submitted, so nothing is retyped. */
  values: RawEventDraft | null;
}

export const EMPTY_FORM_STATE: EventFormState = { issues: [], error: null, values: null };

/** What a transition button gets back. */
export interface EventTransitionState {
  error: string | null;
}

export const EMPTY_TRANSITION_STATE: EventTransitionState = { error: null };
