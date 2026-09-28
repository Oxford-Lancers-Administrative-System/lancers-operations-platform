import type { RawEventDraft } from "./event-input";
import type { RawEventQuestion } from "./event-questions-input";

// Shared decoding for draft and approved-event forms. Validation and authorization stay with callers.
export function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

export function readDraft(formData: FormData): RawEventDraft {
  return {
    name: text(formData, "name"),
    templateId: text(formData, "templateId"),
    scheduledOn: text(formData, "scheduledOn"),
    startsAt: text(formData, "startsAt"),
    endsAt: text(formData, "endsAt"),
    deliveryMode: text(formData, "deliveryMode"),
    venue: text(formData, "venue"),
    description: text(formData, "description"),
    requiredEquipment: text(formData, "requiredEquipment"),
    joiningUrl: text(formData, "joiningUrl"),
    attendance: text(formData, "attendance"),
  };
}

export function readQuestions(formData: FormData): RawEventQuestion[] | null {
  if (formData.get("questionsPresent") === null) return null;

  const strings = (field: string) =>
    formData.getAll(field).map((value) => (typeof value === "string" ? value : ""));

  const ids = strings("questionId");
  const prompts = strings("questionPrompt");
  const answerTypes = strings("questionAnswerType");
  const required = strings("questionRequired");
  const choices = strings("questionChoices");
  const fromTemplate = strings("questionFromTemplate");

  return prompts.map((prompt, index) => ({
    id: ids[index] ?? "",
    prompt,
    answerType: answerTypes[index] ?? "",
    required: required[index] ?? "",
    choices: choices[index] ?? "",
    fromTemplate: fromTemplate[index] ?? "false",
  }));
}
