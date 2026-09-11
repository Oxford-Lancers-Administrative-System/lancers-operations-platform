import type { QuestionIssue, RawEventQuestion } from "@/lib/services/event-questions-input";
import type { RawEventTemplate, TemplateFieldIssue } from "@/lib/services/event-template-input";
import type { TemplateChangePlan } from "@/lib/services/event-templates";

// What the template editor hands back to its screen — W8-02/W8-03.
type TemplateFormPhase = "editing" | "confirming";

export interface TemplateFormState {
  phase: TemplateFormPhase;
  issues: TemplateFieldIssue[];
  questionIssues: QuestionIssue[];
  error: string | null;
  values: RawEventTemplate | null;
  questions: RawEventQuestion[] | null;
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
