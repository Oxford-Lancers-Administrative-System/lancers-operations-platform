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
import QuestionEditForm from "./question-edit-form";

/**
 * UX-31 in edit mode — LAN-76's "edit view", against `/operate/events/[id]`'s
 * "Edit draft" action. Not a new nav destination.
 *
 * A draft is editable whole. An approved event is not — its facts change
 * through the amend path (W5), which tells people — but since LAN-318 (Brian,
 * 2026-09-11, amending D41) its *questions* are, so this route answers "Edit
 * questions" with the question editor alone. A cancelled event is still
 * refused outright: nobody is being asked anything.
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

  // Questions as stored, not the template's — an operator who removed one (D42) must not find it
  // back. Carries the id since LAN-318, so an approved event's set is updated rather than rewritten.
  const initialQuestions: RawEventQuestion[] = (await readEventQuestions(event.id)).map(
    (question) => ({
      id: question.id,
      prompt: question.prompt,
      answerType: question.answerType,
      required: question.isRequired ? "required" : "optional",
      choices: joinQuestionChoices(question.choices),
      fromTemplate: question.fromTemplate ? "true" : "false",
    }),
  );

  if (event.status === "approved") {
    return (
      <Stack spacing={3}>
        <PageHeader
          title="Edit questions"
          subtitle={event.name}
          back={{ href: `/operate/events/${event.id}`, label: "Back to event" }}
        />

        <QuestionEditForm
          eventId={event.id}
          eventTypeLabel={event.templateName}
          initialQuestions={initialQuestions}
          cancelHref={`/operate/events/${event.id}`}
        />
      </Stack>
    );
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
