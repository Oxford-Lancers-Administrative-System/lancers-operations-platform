"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import {
  planEventTemplateChange,
  saveEventTemplate,
  validateEventTemplate,
} from "@/lib/services/event-templates";
import { validateEventQuestions } from "@/lib/services/event-questions";
import type { EventTemplateInput, RawEventTemplate } from "@/lib/services/event-template-input";
import type { EventQuestionInput, RawEventQuestion } from "@/lib/services/event-questions-input";
import type { TemplateFormState } from "./form-state";

/**
 * The template editor's server actions — W8.
 *
 * ## Two actions, one submission shape
 *
 * `previewEventTemplateAction` computes the blast radius and writes nothing.
 * `saveEventTemplateAction` writes, and recomputes that blast radius for itself
 * rather than accepting the one the browser was shown. The confirmation an
 * operator reads and the rows that move therefore come from the same code, run
 * twice, under locks both times — a preview that could disagree with the write
 * would be worse than no preview, because it would be a promise.
 *
 * Both read the identical fields, so the second is the first with an argument
 * flipped. That is deliberate: a save path that read the form differently from
 * the preview path is exactly how the two would drift.
 *
 * ## Authorization
 *
 * `event_calendar_management` — this is administration of the calendar, and W8
 * says so: "Event management capability required, enforced in the service
 * layer." It is not `event_approval`, which exists for the one act that sends
 * messages to real people; editing a template sends nothing and tells nobody.
 *
 * As everywhere else in this application, `NotPermitted` is rethrown rather than
 * rendered beside a field: a refusal shown as red form text reads as "fix your
 * input", which is the wrong instruction and buries an authorization event
 * inside a validation failure.
 */

function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

function readTemplate(formData: FormData): RawEventTemplate {
  return {
    defaultVenue: text(formData, "defaultVenue"),
    defaultDeliveryMode: text(formData, "defaultDeliveryMode"),
    defaultDurationMinutes: text(formData, "defaultDurationMinutes"),
    defaultDescription: text(formData, "defaultDescription"),
    defaultRequiredEquipment: text(formData, "defaultRequiredEquipment"),
    defaultAttendance: text(formData, "defaultAttendance"),
    audienceGroups: formData
      .getAll("audienceGroup")
      .filter((group): group is string => typeof group === "string"),
  };
}

/** The template's own questions — the same five parallel fields the event form posts. */
function readQuestions(formData: FormData): RawEventQuestion[] {
  const strings = (field: string) =>
    formData.getAll(field).map((value) => (typeof value === "string" ? value : ""));

  const prompts = strings("questionPrompt");
  const answerTypes = strings("questionAnswerType");
  const required = strings("questionRequired");
  const choices = strings("questionChoices");

  return prompts.map((prompt, index) => ({
    prompt,
    answerType: answerTypes[index] ?? "",
    required: required[index] ?? "",
    choices: choices[index] ?? "",
    // A template's own questions are the template. `from_template` is the mark
    // put on the *copy* that lands on an event, and is set there.
    fromTemplate: "false",
  }));
}

function messageFor(error: unknown): string {
  if (!isServiceError(error)) throw error;
  if (error.kind === "not_permitted") throw error;
  return error.message;
}

/** The two checked values, once the form has been believed. */
interface CheckedTemplate {
  ok: true;
  template: EventTemplateInput;
  questions: EventQuestionInput[];
  raw: RawEventTemplate;
  rawQuestions: RawEventQuestion[];
}

/**
 * Shared by both actions: read the form, check it, and stop early if it is wrong.
 *
 * Returns the refused state or the checked values, so neither action can
 * validate one thing and act on another.
 */
function checked(formData: FormData): CheckedTemplate | { ok: false; state: TemplateFormState } {
  const raw = readTemplate(formData);
  const rawQuestions = readQuestions(formData);

  const template = validateEventTemplate(raw);
  const questions = validateEventQuestions(rawQuestions);

  if (!template.ok || !questions.ok) {
    return {
      ok: false,
      state: {
        phase: "editing",
        issues: template.ok ? [] : template.issues,
        questionIssues: questions.ok ? [] : questions.issues,
        error: null,
        values: raw,
        questions: rawQuestions,
        plan: null,
      },
    };
  }

  return { ok: true, template: template.value, questions: questions.value, raw, rawQuestions };
}

/** W8-03 — what saving this template will and will not touch. Writes nothing. */
export async function previewEventTemplateAction(
  _previous: TemplateFormState,
  formData: FormData,
): Promise<TemplateFormState> {
  await requireCapability("event_calendar_management");
  const eventType = text(formData, "eventType");

  const outcome = checked(formData);
  if (!outcome.ok) return outcome.state;

  try {
    const plan = await planEventTemplateChange(eventType, outcome.template, outcome.questions);
    return {
      phase: "confirming",
      issues: [],
      questionIssues: [],
      error: null,
      values: outcome.raw,
      questions: outcome.rawQuestions,
      plan,
    };
  } catch (error) {
    return {
      phase: "editing",
      issues: [],
      questionIssues: [],
      error: messageFor(error),
      values: outcome.raw,
      questions: outcome.rawQuestions,
      plan: null,
    };
  }
}

/**
 * Saves the template and updates the drafts the rule reaches, in one transaction.
 *
 * It does not redirect. The operator stays on the template they were editing and
 * reads what actually moved — which is the answer to the question the
 * confirmation asked, and the only place they will ever see it.
 */
export async function saveEventTemplateAction(
  _previous: TemplateFormState,
  formData: FormData,
): Promise<TemplateFormState> {
  const operator = await requireCapability("event_calendar_management");
  const eventType = text(formData, "eventType");

  const outcome = checked(formData);
  if (!outcome.ok) return outcome.state;

  try {
    const plan = await saveEventTemplate(
      operator.personId,
      eventType,
      outcome.template,
      outcome.questions,
    );

    revalidatePath("/operate/events/templates");
    revalidatePath(`/operate/events/templates/${eventType}`);
    // Every draft this may have moved is on both of these.
    revalidatePath("/operate/events");
    revalidatePath("/operate/events/calendar");

    return {
      phase: "saved",
      issues: [],
      questionIssues: [],
      error: null,
      values: outcome.raw,
      questions: outcome.rawQuestions,
      plan,
    };
  } catch (error) {
    return {
      phase: "editing",
      issues: [],
      questionIssues: [],
      error: messageFor(error),
      values: outcome.raw,
      questions: outcome.rawQuestions,
      plan: null,
    };
  }
}
