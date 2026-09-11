"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCapability } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import {
  createEventTemplate,
  deleteEventTemplate,
  planEventTemplateChange,
  saveEventTemplate,
  validateEventTemplate,
} from "@/lib/services/event-templates";
import { validateEventQuestions } from "@/lib/services/event-questions";
import type { EventTemplateInput, RawEventTemplate } from "@/lib/services/event-template-input";
import type { EventQuestionInput, RawEventQuestion } from "@/lib/services/event-questions-input";
import type { TemplateFormState } from "./form-state";

// The template editor's server actions — W8. preview writes nothing; save
// recomputes the blast radius itself rather than trusting the browser's
// copy, both from the same checked() fields. Guarded on
// `event_calendar_management`, not `event_approval` — editing a template
// sends nothing. Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md · missions/intake/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY/decision-history.md.

function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

function readTemplate(formData: FormData): RawEventTemplate {
  return {
    name: text(formData, "name"),
    colourKey: text(formData, "colourKey"),
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
    // from_template marks the copy that lands on an event, not this.
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

/** Shared by both actions: read the form, check it, stop early if wrong — so neither validates one thing and acts on another. */
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
  const templateId = text(formData, "templateId");

  const outcome = checked(formData);
  if (!outcome.ok) return outcome.state;

  try {
    const plan = await planEventTemplateChange(templateId, outcome.template, outcome.questions);
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

// Saves the template and updates the drafts the rule reaches, in one
// transaction. Redirects to the template list on success — LAN-276 round 1,
// Brian 2026-09-10. Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md · missions/intake/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY/decision-history.md.
export async function saveEventTemplateAction(
  _previous: TemplateFormState,
  formData: FormData,
): Promise<TemplateFormState> {
  const operator = await requireCapability("event_calendar_management");
  const templateId = text(formData, "templateId");

  const outcome = checked(formData);
  if (!outcome.ok) return outcome.state;

  try {
    await saveEventTemplate(operator.personId, templateId, outcome.template, outcome.questions);
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

  revalidatePath("/operate/events/templates");
  revalidatePath(`/operate/events/templates/${templateId}`);
  revalidatePath("/operate/admin/messaging");
  revalidatePath("/calendar");
  revalidatePath("/operate/events");
  revalidatePath("/operate/events/calendar");

  redirect("/operate/events/templates");
}

// Creating a template — LAN-265, W8-01. No preview step: nothing exists yet
// to have a blast radius. Redirects to the template list — LAN-276 round 1,
// Brian 2026-09-10. Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md · missions/intake/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY/decision-history.md.
export async function createEventTemplateAction(
  _previous: TemplateFormState,
  formData: FormData,
): Promise<TemplateFormState> {
  const operator = await requireCapability("event_calendar_management");

  const outcome = checked(formData);
  if (!outcome.ok) return outcome.state;

  try {
    await createEventTemplate(operator.personId, outcome.template, outcome.questions);
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

  revalidatePath("/operate/events/templates");
  revalidatePath("/operate/admin/messaging");
  revalidatePath("/operate/events/new");

  redirect("/operate/events/templates");
}

// Deleting a template nothing was created from — LAN-265. The service
// decides (deleteEventTemplate counts inside the transaction,
// events_template_fkey ON DELETE RESTRICT underneath); the editor hiding the
// control is a courtesy. Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md · missions/intake/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY/decision-history.md.
export async function deleteEventTemplateAction(
  _previous: TemplateFormState,
  formData: FormData,
): Promise<TemplateFormState> {
  const operator = await requireCapability("event_calendar_management");
  const templateId = text(formData, "templateId");

  try {
    await deleteEventTemplate(operator.personId, templateId);
  } catch (error) {
    return {
      phase: "editing",
      issues: [],
      questionIssues: [],
      error: messageFor(error),
      values: null,
      questions: null,
      plan: null,
    };
  }

  revalidatePath("/operate/events/templates");
  revalidatePath("/operate/admin/messaging");
  revalidatePath("/operate/events/new");

  redirect("/operate/events/templates");
}
