import { PageHeader } from "@/components/page-header";
import Stack from "@mui/material/Stack";
import { audienceCategoriesForEventType } from "@/lib/services/audience-selection";
import {
  DEFAULT_TEMPLATE_CLASS,
  readTemplateAudienceCatalogue,
} from "@/lib/services/event-templates";
import {
  DEFAULT_TEMPLATE_COLOUR_KEY,
  type RawEventTemplate,
} from "@/lib/services/event-template-input";
import { redactAudienceCandidates } from "@/lib/services/event-audience-access";
import { gateShellPage } from "../../../gate";
import TemplateEditor from "../template-editor";
import { NEW_TEMPLATE_HEADLINE } from "../presentation";

// W8-01's New template — LAN-265, Brian/Stu/Clint 2026-09-09. Empty,
// deliberately (no copying from another template); no class control (`event_type`
// stays `practice`, a migration+Brian decision).
export default async function NewEventTemplatePage() {
  const gate = await gateShellPage("/operate/events/templates", "event_calendar_management");
  if ("screen" in gate) return gate.screen;

  const initial: RawEventTemplate = {
    name: "",
    colourKey: DEFAULT_TEMPLATE_COLOUR_KEY,
    defaultVenue: "",
    defaultDeliveryMode: "unset",
    defaultDurationMinutes: "",
    defaultDescription: "",
    defaultRequiredEquipment: "",
    defaultAttendance: "unset",
    audienceGroups: [],
  };

  // LAN-414 round 2: the picker counts against today's roster here too.
  // LAN-423: counted from the groups; the per-person detail follows the seat's grants.
  const candidates = redactAudienceCandidates(
    (await readTemplateAudienceCatalogue(DEFAULT_TEMPLATE_CLASS)).candidates,
    gate.operator.grants,
    DEFAULT_TEMPLATE_CLASS,
  );

  return (
    <Stack spacing={3}>
      <PageHeader
        title={NEW_TEMPLATE_HEADLINE}
        eyebrow="Event template"
        back={{ href: "/operate/events/templates", label: "Back to templates" }}
      />

      <TemplateEditor
        templateId={null}
        eventTypeLabel={NEW_TEMPLATE_HEADLINE}
        initial={initial}
        initialQuestions={[]}
        categories={audienceCategoriesForEventType(DEFAULT_TEMPLATE_CLASS, { templateOnly: true })}
        candidates={candidates}
        eventCount={0}
      />
    </Stack>
  );
}
