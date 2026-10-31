import type { FieldIssue, RawEventDraft } from "@/lib/services/event-input";
import type { QuestionIssue, RawEventQuestion } from "@/lib/services/event-questions-input";
import type { EventMessageIssue, RawEventMessage } from "@/lib/services/event-messages-input";

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
  /** LAN-508. Corrections to the event message cards, addressed by position. */
  eventMessageIssues?: EventMessageIssue[];
  /** LAN-508. The event message cards as posted, so a refused save keeps them. */
  eventMessages?: RawEventMessage[] | null;
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
  /**
   * LAN-394. A true thing that is not a failure — currently "the message is
   * queued behind the sending allowance". Separate from `error` because a
   * refusal and a queue read differently and must look different: one is a
   * refusal Notice, the other is information.
   */
  notice?: string | null;
}

export const EMPTY_TRANSITION_STATE: EventTransitionState = { error: null, notice: null };
