import { PageHeader } from "@/components/page-header";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { isServiceError } from "@/lib/db";
import { UnavailableScreen } from "@/app/operate/unavailable";
import { listTermWindows } from "@/lib/services/seasons";
import { readEventFormDefaults } from "@/lib/services/event-templates";
import { DEFAULT_TEMPLATE_CLASS } from "@/lib/services/event-template-input";
import {
  joinQuestionChoices,
  readEvent,
  readEventQuestions,
  type EventDetail,
  type RawEventDraft,
  type RawEventQuestion,
} from "@/lib/services/events";
import { gateShellPage } from "../../gate";
import EventForm from "../event-form";

/**
 * UX-31 — a new event draft, shared with the edit view. D39: `?from=<event
 * id>` prefills and writes nothing (Brian, 2026-08-22); the date is never copied.
 */
export default async function NewEventPage({ searchParams }: PageProps<"/operate/events/new">) {
  const gate = await gateShellPage("/operate/events", "event_calendar_management");
  if ("screen" in gate) return gate.screen;

  const query = await searchParams;
  const from = typeof query.from === "string" ? query.from : null;

  let terms;
  let templates;
  try {
    [terms, templates] = await Promise.all([listTermWindows(), readEventFormDefaults()]);
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return (
      <UnavailableScreen title="Create event" message={error.message}>
        <Box>
          <Button variant="outlined" href="/operate/events">
            Back to events
          </Button>
        </Box>
      </UnavailableScreen>
    );
  }

  let source: EventDetail | null = null;
  let sourceQuestions: RawEventQuestion[] = [];
  if (from !== null) {
    try {
      source = await readEvent(from);
      sourceQuestions = (await readEventQuestions(from)).map((question) => ({
        prompt: question.prompt,
        answerType: question.answerType,
        required: question.isRequired ? "required" : "optional",
        choices: joinQuestionChoices(question.choices),
        fromTemplate: question.fromTemplate ? "true" : "false",
      }));
    } catch (error) {
      // A deleted-since-rendered source is not a refusal — the form just opens empty.
      if (!isServiceError(error)) throw error;
      source = null;
    }
  }

  const initial: RawEventDraft | undefined =
    source === null
      ? undefined
      : {
          name: source.name,
          templateId: source.templateId,
          scheduledOn: "",
          startsAt: source.startsAt ?? "",
          endsAt: source.endsAt ?? "",
          deliveryMode: source.deliveryMode,
          venue: source.venue ?? "",
          description: source.description ?? "",
          requiredEquipment: source.requiredEquipment ?? "",
          joiningUrl: source.joiningUrl ?? "",
          attendance: source.isMandatory ? "mandatory" : "optional",
        };

  /** The questions a blank form opens with — same rule `EventForm` uses for the Type control's default template (LAN-265). */
  const openingQuestions =
    (
      Object.values(templates).find((option) => option.eventType === DEFAULT_TEMPLATE_CLASS) ??
      Object.values(templates)[0]
    )?.questions ?? [];

  return (
    <Stack spacing={3}>
      <PageHeader
        title="Create event"
        back={{ href: "/operate/events", label: "Back to events" }}
      />

      <EventForm
        mode="create"
        terms={terms}
        templates={templates}
        initial={initial}
        // A blank form opens on the default template's questions; Type swaps them. A duplicate brings its source's own.
        initialQuestions={source === null ? openingQuestions : sourceQuestions}
        duplicatedFromName={source?.name}
        cancelHref="/operate/events"
      />
    </Stack>
  );
}
