import { PageHeader } from "@/components/page-header";
import { Refusal as KitRefusal } from "@/components/refusal";
import Stack from "@mui/material/Stack";
import { isServiceError } from "@/lib/db";
import { listTermWindows } from "@/lib/services/seasons";
import {
  AMEND_REQUIRES_APPROVED_MESSAGE,
  readAmendmentContext,
  type AmendmentContext,
} from "@/lib/services/event-amendment";
import { readAddableAudience } from "@/lib/services/event-audience-amendment";
import type { RawEventDraft, TermWindow } from "@/lib/services/event-input";
import { joinQuestionChoices, readEventQuestions } from "@/lib/services/events";
import type { RawEventQuestion } from "@/lib/services/event-questions-input";
import { gateEventPage } from "../../event-gate";
import { formatDetailWhen, labelFor, STATUS_LABELS } from "../../presentation";
import { AMEND_HEADLINE_PREFIX } from "../change-presentation";
import AmendForm from "./amend-form";
import { AddToAudience } from "./add-to-audience";

/**
 * W5 — amending an approved event, on its own route (not a mode of `/edit`,
 * UX-31's draft-only screen) — different consequences: queued messages, a
 * notify decision, an already-told audience. The refusal for a draft or
 * cancelled event is rendered here too, not just thrown
 * (`docs/ux/standards.md` rule 6); the service refuses regardless.
 */
export default async function AmendEventPage({ params }: PageProps<"/operate/events/[id]/amend">) {
  const { id } = await params;
  // LAN-431: Manage on this event's template.
  const gate = await gateEventPage("/operate/events", id, "manage");
  if ("screen" in gate) return gate.screen;

  let context: AmendmentContext;
  let terms: TermWindow[];
  let addable: Awaited<ReturnType<typeof readAddableAudience>>;
  let storedQuestions: Awaited<ReturnType<typeof readEventQuestions>>;
  try {
    [context, terms, addable, storedQuestions] = await Promise.all([
      readAmendmentContext(id),
      listTermWindows(),
      // LAN-393. Read here rather than inside the client component so the
      // "already invited" filter is the server's answer, not the browser's.
      readAddableAudience(id),
      // LAN-419. The questions as stored, not the template's — an operator who
      // removed one (D42) must not find it back.
      readEventQuestions(id),
    ]);
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return <Refusal message={error.message} />;
  }

  const { event } = context;

  if (event.status !== "approved") {
    return (
      <Refusal
        message={`${AMEND_REQUIRES_APPROVED_MESSAGE} ${
          event.status === "cancelled" ? "This event is cancelled." : "This event is a draft."
        }`}
        eventId={event.id}
      />
    );
  }

  // LAN-419. Carries the id, so an approved event's set is updated rather than
  // rewritten (LAN-318).
  const initialQuestions: RawEventQuestion[] = storedQuestions.map((question) => ({
    id: question.id,
    prompt: question.prompt,
    answerType: question.answerType,
    required: question.isRequired ? "required" : "optional",
    choices: joinQuestionChoices(question.choices),
    fromTemplate: question.fromTemplate ? "true" : "false",
  }));

  /**
   * LAN-419 — editing the questions and amending the details are one save.
   * LAN-431 made them one decision too: Manage on the event's template, which
   * the gate above already required. The action asks again.
   */
  const mayEditQuestions = gate.level === "manage";

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
    <Stack spacing={3} sx={{ maxWidth: 900 }} data-testid="amend-screen">
      <PageHeader
        title={`${AMEND_HEADLINE_PREFIX} ${event.name}`}
        back={{ href: `/operate/events/${event.id}`, label: "Back to event" }}
        subtitle={
          <span data-testid="amend-subtitle">{`${labelFor(STATUS_LABELS, event.status)} · ${formatDetailWhen(event)}`}</span>
        }
      />

      <AmendForm
        eventId={event.id}
        eventName={event.name}
        initial={initial}
        before={{
          name: event.name,
          templateId: event.templateId,
          scheduledOn: event.scheduledOn,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          deliveryMode: event.deliveryMode,
          venue: event.venue,
          description: event.description,
          requiredEquipment: event.requiredEquipment,
          joiningUrl: event.joiningUrl,
          isMandatory: event.isMandatory,
        }}
        terms={terms}
        audience={context.audience}
        unsentMessages={context.unsentMessages}
        isFuture={context.isFuture}
        initialQuestions={initialQuestions}
        eventTypeLabel={event.templateName}
        eventType={event.eventType}
        mayEditQuestions={mayEditQuestions}
      />

      {/* LAN-393. Only while the event is still ahead: the service refuses an
          event that has started, and a control that can only be refused is not
          a control. */}
      {context.isFuture ? (
        <AddToAudience
          eventId={event.id}
          candidates={addable.candidates}
          counts={addable.counts}
          alreadyOnEvent={addable.alreadyOnEvent}
        />
      ) : null}
    </Stack>
  );
}

function Refusal({ message, eventId }: { message: string; eventId?: string }) {
  return (
    <KitRefusal
      title="Edit event"
      message={message}
      testId="amend-refusal"
      action={{
        href: eventId ? `/operate/events/${eventId}` : "/operate/events",
        label: eventId ? "Back to event" : "Back to events",
      }}
    />
  );
}
