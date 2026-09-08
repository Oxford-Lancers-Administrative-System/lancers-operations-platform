import { PageHeader } from "@/components/page-header";
import { Refusal } from "@/components/refusal";
import Stack from "@mui/material/Stack";
import { isServiceError } from "@/lib/db";
import { templateGroupsForEventType } from "@/lib/services/audience-selection";
import { joinQuestionChoices } from "@/lib/services/event-questions";
import { readEventTemplate, type EventTemplate } from "@/lib/services/event-templates";
import type { RawEventQuestion } from "@/lib/services/event-questions-input";
import type { RawEventTemplate } from "@/lib/services/event-template-input";
import { gateShellPage } from "../../../gate";
import { labelFor, TYPE_LABELS } from "../presentation";
import TemplateEditor from "../template-editor";

/**
 * W8-02 — one event type's template.
 *
 * The route carries the type itself rather than an identifier, because the type
 * *is* the template's identity: there are exactly seven, they are created by the
 * migration and nobody adds or removes one. `readEventTemplate` refuses anything
 * that is not one of the seven, so a hand-typed URL gets a sentence rather than
 * an empty form.
 */
export default async function EventTemplatePage({
  params,
}: PageProps<"/operate/events/templates/[type]">) {
  const gate = await gateShellPage("/operate/events/templates", "event_calendar_management");
  if ("screen" in gate) return gate.screen;

  const { type } = await params;

  let template: EventTemplate;
  try {
    template = await readEventTemplate(type);
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return (
      <Refusal
        title="Event templates"
        message={error.message}
        testId="template-unavailable"
        action={{ href: "/operate/events/templates", label: "Back to templates" }}
      />
    );
  }

  const typeLabel = labelFor(TYPE_LABELS, template.eventType);

  const initial: RawEventTemplate = {
    defaultVenue: template.defaultVenue ?? "",
    defaultDeliveryMode: template.defaultDeliveryMode ?? "unset",
    defaultDurationMinutes:
      template.defaultDurationMinutes === null ? "" : String(template.defaultDurationMinutes),
    defaultDescription: template.defaultDescription ?? "",
    defaultRequiredEquipment: template.defaultRequiredEquipment ?? "",
    defaultAttendance:
      template.defaultIsMandatory === null
        ? "unset"
        : template.defaultIsMandatory
          ? "mandatory"
          : "optional",
    audienceGroups: template.audienceGroups,
  };

  const initialQuestions: RawEventQuestion[] = template.questions.map((question) => ({
    prompt: question.prompt,
    answerType: question.answerType,
    required: question.isRequired ? "required" : "optional",
    choices: joinQuestionChoices(question.choices),
    fromTemplate: "false",
  }));

  return (
    <Stack spacing={3}>
      <PageHeader
        title={typeLabel}
        eyebrow="Event template"
        back={{ href: "/operate/events/templates", label: "Back to templates" }}
      />

      <TemplateEditor
        eventType={template.eventType}
        eventTypeLabel={typeLabel}
        initial={initial}
        initialQuestions={initialQuestions}
        groups={templateGroupsForEventType(template.eventType)}
      />
    </Stack>
  );
}
