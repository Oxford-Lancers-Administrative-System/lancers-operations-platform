import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { isServiceError } from "@/lib/db";
import {
  EDIT_REFUSAL_MESSAGE,
  joinQuestionChoices,
  readEvent,
  readEventQuestions,
  type EventDetail,
  type RawEventDraft,
  type RawEventQuestion,
  type TermWindow,
} from "@/lib/services/events";
import { listTermWindows } from "@/lib/services/seasons";
import { readEventFormDefaults, type EventTypeFormDefaults } from "@/lib/services/event-templates";
import { gateShellPage } from "../../../gate";
import EventForm from "../../event-form";

/**
 * UX-31 in edit mode — LAN-76's "edit view".
 *
 * `slice-ux.md` § 4 registers `/operate/events/[id]` and not this sub-route,
 * but the live issue requires an edit view and UX-32 carries an "Edit draft"
 * action that has to lead somewhere. The editor screen it leads to is UX-31,
 * so this route renders UX-31 against an existing draft. It is not a new
 * navigation destination — the shell still exposes Roster, Events and Report
 * and nothing else.
 *
 * Only a draft is editable. The refusal is rendered here as well as thrown by
 * the service, because arriving at this URL for a submitted event should
 * explain itself rather than present a form whose save will be refused.
 */
export default async function EditEventPage({ params }: PageProps<"/operate/events/[id]/edit">) {
  const gate = await gateShellPage("/operate/events", "event_calendar_management");
  if ("screen" in gate) return gate.screen;

  const { id } = await params;

  let event: EventDetail;
  let terms: TermWindow[];
  let templates: Record<string, EventTypeFormDefaults>;
  try {
    [event, terms, templates] = await Promise.all([
      readEvent(id),
      listTermWindows(),
      readEventFormDefaults(),
    ]);
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return <Refusal message={error.message} />;
  }

  if (event.status !== "draft") {
    return (
      <Refusal
        message={`${EDIT_REFUSAL_MESSAGE} This event is ${event.status.replace("_", " ")}.`}
        eventId={event.id}
      />
    );
  }

  const initial: RawEventDraft = {
    name: event.name,
    eventType: event.eventType,
    scheduledOn: event.scheduledOn ?? "",
    startsAt: event.startsAt ?? "",
    endsAt: event.endsAt ?? "",
    deliveryMode: event.deliveryMode,
    venue: event.venue ?? "",
    description: event.description ?? "",
    requiredEquipment: event.requiredEquipment ?? "",
    joiningUrl: event.joiningUrl ?? "",
    attendance: event.isMandatory ? "mandatory" : "optional",
  };

  // The questions as stored, not the template's: this event's questions are its
  // own from the moment it was created, and an operator who removed one (D42)
  // must not find it back on the form.
  const initialQuestions: RawEventQuestion[] = (await readEventQuestions(event.id)).map(
    (question) => ({
      prompt: question.prompt,
      answerType: question.answerType,
      required: question.isRequired ? "required" : "optional",
      choices: joinQuestionChoices(question.choices),
      fromTemplate: question.fromTemplate ? "true" : "false",
    }),
  );

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          Edit draft
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Record the operational facts before resolving an audience.
        </Typography>
      </Box>

      <EventForm
        mode="edit"
        eventId={event.id}
        terms={terms}
        templates={templates}
        initial={initial}
        initialQuestions={initialQuestions}
        cancelHref={`/operate/events/${event.id}`}
      />
    </Stack>
  );
}

function Refusal({ message, eventId }: { message: string; eventId?: string }) {
  return (
    <Stack spacing={2} sx={{ maxWidth: 720 }}>
      <Typography variant="h6" component="h1">
        Edit draft
      </Typography>
      <Alert severity="warning" data-testid="edit-refused">
        {message}
      </Alert>
      <Box>
        <Button
          variant="outlined"
          href={eventId ? `/operate/events/${eventId}` : "/operate/events"}
        >
          {eventId ? "Back to the event" : "Back to events"}
        </Button>
      </Box>
    </Stack>
  );
}
