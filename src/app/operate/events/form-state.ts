import type { FieldIssue, RawEventDraft } from "@/lib/services/event-input";
import type { QuestionIssue, RawEventQuestion } from "@/lib/services/event-questions-input";

/**
 * What a questions save is about to do, shown before it does it — LAN-367.
 *
 * Present only on the questions editor's own state, and only when a save would
 * void answers and ask people again. `null` everywhere else, which is what
 * makes "a save that changes no question shows no confirm" true by shape.
 */
interface QuestionChangePreview {
  /** The questions whose wording, answer type or options changed. */
  changedPrompts: string[];
  /** How many questions this save adds. */
  addedCount: number;
  /** How many people would be asked again. */
  peopleToAsk: number;
}

export interface EventFormState {
  issues: FieldIssue[];
  // Addressed by position, not field name — amendment W4-A1.
  questionIssues: QuestionIssue[];
  error: string | null;
  values: RawEventDraft | null;
  questions: RawEventQuestion[] | null;
  /** LAN-367. Set when the save needs the operator to confirm first. */
  questionChange?: QuestionChangePreview | null;
}

export const EMPTY_FORM_STATE: EventFormState = {
  issues: [],
  questionIssues: [],
  error: null,
  values: null,
  questions: null,
  questionChange: null,
};

export interface EventTransitionState {
  error: string | null;
}

export const EMPTY_TRANSITION_STATE: EventTransitionState = { error: null };
