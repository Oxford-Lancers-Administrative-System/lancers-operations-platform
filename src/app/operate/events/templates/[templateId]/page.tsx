import { PageHeader } from "@/components/page-header";
import { Refusal } from "@/components/refusal";
import Stack from "@mui/material/Stack";
import { isServiceError } from "@/lib/db";
import { templateGroupsForEventType } from "@/lib/services/audience-selection";
import { joinQuestionChoices } from "@/lib/services/event-questions";
import {
  countEventsFromTemplate,
  readEventTemplate,
  type EventTemplate,
} from "@/lib/services/event-templates";
import type { RawEventQuestion } from "@/lib/services/event-questions-input";
import type { RawEventTemplate } from "@/lib/services/event-template-input";
import { gateShellPage } from "../../../gate";
import TemplateEditor from "../template-editor";

// W8-02 — one template. Route carries the template's own id since LAN-265
// (used to carry event_type, before templates were rename-able).
export default async function EventTemplatePage({
  params,
}: PageProps<"/operate/events/templates/[templateId]">) {
  const gate = await gateShellPage("/operate/events/templates", "event_calendar_management");
  if ("screen" in gate) return gate.screen;

  const { templateId } = await params;

  let template: EventTemplate;
  let eventCount: number;
  try {
    template = await readEventTemplate(templateId);
    eventCount = await countEventsFromTemplate(templateId);
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

  const initial: RawEventTemplate = {
    name: template.name,
    colourKey: template.colourKey,
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
        title={template.name}
        eyebrow="Event template"
        back={{ href: "/operate/events/templates", label: "Back to templates" }}
      />

      <TemplateEditor
        templateId={template.id}
        eventTypeLabel={template.name}
        initial={initial}
        initialQuestions={initialQuestions}
        groups={templateGroupsForEventType(template.eventType)}
        eventCount={eventCount}
      />
    </Stack>
  );
}
