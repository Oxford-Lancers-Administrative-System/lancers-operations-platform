import { PageHeader } from "@/components/page-header";
import { Refusal as KitRefusal } from "@/components/refusal";
import Stack from "@mui/material/Stack";
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
 * UX-31 in edit mode — LAN-76's "edit view", against `/operate/events/[id]`'s
 * "Edit draft" action. Not a new nav destination. Only a draft is editable;
 * the refusal renders here too, not just thrown by the service.
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
    templateId: event.templateId,
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

  // Questions as stored, not the template's — an operator who removed one (D42) must not find it back.
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
      <PageHeader
        title="Edit draft"
        subtitle={event.name}
        back={{ href: `/operate/events/${event.id}`, label: "Back to event" }}
      />

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
    <KitRefusal
      title="Edit draft"
      message={message}
      testId="edit-refused"
      action={{
        href: eventId ? `/operate/events/${eventId}` : "/operate/events",
        label: eventId ? "Back to the event" : "Back to events",
      }}
    />
  );
}
