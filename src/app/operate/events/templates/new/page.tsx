import { PageHeader } from "@/components/page-header";
import Stack from "@mui/material/Stack";
import { templateGroupsForEventType } from "@/lib/services/audience-selection";
import { DEFAULT_TEMPLATE_CLASS } from "@/lib/services/event-templates";
import {
  DEFAULT_TEMPLATE_COLOUR_KEY,
  type RawEventTemplate,
} from "@/lib/services/event-template-input";
import { gateShellPage } from "../../../gate";
import TemplateEditor from "../template-editor";
import { NEW_TEMPLATE_HEADLINE } from "../presentation";

/**
 * W8-01's **New template** — LAN-265.
 *
 * Brian, with Stu and Clint, 2026-09-09: "A template is anything the operators
 * want to create: 'Kicking Clinic', 'Full Pads Practice', 'Film Review',
 * whatever they name."
 *
 * ## Empty, deliberately
 *
 * Nothing is copied from another template. "Kicking Clinic" is not a variant of
 * Practice, and pre-filling it with Practice's venue, questions and audience
 * would put words in the operator's mouth on the one screen whose entire purpose
 * is that they get to choose. Every field is optional except the name, exactly
 * as it is on an existing template.
 *
 * ## No class control, and that is the decision
 *
 * A template's behavioural class — `public.event_type`, the thing D46's
 * recruits rule and the Monday report's buckets key off — is `practice` on
 * anything created here, and there is no control for it because LAN-265 says
 * there is not one: "new behavioural classes (new enum values) ... stays a
 * migration and a Brian decision." The audience groups offered are therefore
 * that class's, which is what `templateGroupsForEventType` is asked for here.
 */
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
        groups={templateGroupsForEventType(DEFAULT_TEMPLATE_CLASS)}
        eventCount={0}
      />
    </Stack>
  );
}
