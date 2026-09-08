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
import type { RawEventDraft, TermWindow } from "@/lib/services/event-input";
import { gateShellPage } from "../../../gate";
import { formatDetailWhen, labelFor, STATUS_LABELS } from "../../presentation";
import { AMEND_HEADLINE_PREFIX } from "../change-presentation";
import AmendForm from "./amend-form";

/**
 * W5 — amending an approved event, on its own route.
 *
 * ## Why a route rather than a mode of `/edit`
 *
 * `/operate/events/[id]/edit` is UX-31 against a draft, and it refuses anything
 * that is not one. Amending an approved event is a different act with different
 * consequences: it holds queued messages, it makes a notify decision, and it
 * touches an event thirty-seven people have already been told about. Sharing
 * one route would mean one screen whose surrounding panels, buttons and
 * confirmations changed with the status — the shape that produces a screen
 * saying one thing and doing another.
 *
 * ## The refusal is rendered here as well as thrown
 *
 * Arriving at this URL for a draft or a cancelled event should explain itself
 * rather than present a form whose save will be refused —
 * `docs/ux/standards.md` rule 6. The service refuses regardless of what was
 * rendered.
 */
export default async function AmendEventPage({ params }: PageProps<"/operate/events/[id]/amend">) {
  const gate = await gateShellPage("/operate/events", "event_approval");
  if ("screen" in gate) return gate.screen;

  const { id } = await params;

  let context: AmendmentContext;
  let terms: TermWindow[];
  try {
    [context, terms] = await Promise.all([readAmendmentContext(id), listTermWindows()]);
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
          eventType: event.eventType,
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
      />
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
