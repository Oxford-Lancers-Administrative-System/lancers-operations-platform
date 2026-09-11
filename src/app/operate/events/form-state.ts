import type { FieldIssue, RawEventDraft } from "@/lib/services/event-input";
import type { QuestionIssue, RawEventQuestion } from "@/lib/services/event-questions-input";

export interface EventFormState {
  issues: FieldIssue[];
  // Addressed by position, not field name — amendment W4-A1.
  questionIssues: QuestionIssue[];
  error: string | null;
  values: RawEventDraft | null;
  questions: RawEventQuestion[] | null;
}

export const EMPTY_FORM_STATE: EventFormState = {
  issues: [],
  questionIssues: [],
  error: null,
  values: null,
  questions: null,
};

export interface EventTransitionState {
  error: string | null;
}

export const EMPTY_TRANSITION_STATE: EventTransitionState = { error: null };
