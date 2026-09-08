import { PageHeader } from "@/components/page-header";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { isServiceError } from "@/lib/db";
import { UnavailableScreen } from "@/app/operate/unavailable";
import { listTermWindows } from "@/lib/services/seasons";
import { readEventFormDefaults } from "@/lib/services/event-templates";
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
 * UX-31 — a new event draft.
 *
 * The heading and the sentence under it are the wireframe's. The form itself
 * is shared with the edit view, because they are the same screen with the same
 * rules.
 *
 * ## Duplicating an event lands here — D39
 *
 * `?from=<event id>` prefills the form from an existing event and writes
 * nothing. Brian settled it on 2026-08-22: duplicate opens the create form
 * prefilled, and nothing exists until the operator saves. So this is one route
 * with one action, and "duplicate" is a way of arriving at it rather than a
 * second way of creating an event.
 *
 * What is deliberately **not** copied is the date. A duplicate is the next one
 * of something, and carrying last Wednesday's date over would be the one field
 * guaranteed to be wrong — and the one whose being wrong is hardest to see.
 * Everything else, including the questions, comes across.
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
      // An event that has been deleted since the link was rendered is not a
      // reason to refuse a new one. The form opens empty, which is what
      // **Create event** does anyway.
      if (!isServiceError(error)) throw error;
      source = null;
    }
  }

  const initial: RawEventDraft | undefined =
    source === null
      ? undefined
      : {
          name: source.name,
          eventType: source.eventType,
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
        // A blank form opens on Practice, so it opens with the Practice
        // template's questions; changing the Type swaps them for the new
        // type's, inside the form. A duplicate brings its source's own.
        initialQuestions={source === null ? (templates.practice?.questions ?? []) : sourceQuestions}
        duplicatedFromName={source?.name}
        cancelHref="/operate/events"
      />
    </Stack>
  );
}
