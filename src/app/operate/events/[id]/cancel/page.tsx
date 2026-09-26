import { PageHeader } from "@/components/page-header";
import { Refusal as KitRefusal } from "@/components/refusal";
import Stack from "@mui/material/Stack";
import { isServiceError } from "@/lib/db";
import {
  CANCEL_REQUIRES_APPROVED_MESSAGE,
  readAmendmentContext,
  type AmendmentContext,
} from "@/lib/services/event-amendment";
import { gateEventPage } from "../../event-gate";
import { formatDetailWhen } from "../../presentation";
import CancelForm from "./cancel-form";

// W6 — cancelling an event, on its own route (not an overlay a stray click
// could reach). Any one seat with Manage on the event's template cancels alone
// (D56, D61; LAN-431).
export default async function CancelEventPage({
  params,
}: PageProps<"/operate/events/[id]/cancel">) {
  const { id } = await params;
  const gate = await gateEventPage("/operate/events", id, "manage");
  if ("screen" in gate) return gate.screen;

  let context: AmendmentContext;
  try {
    context = await readAmendmentContext(id);
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return <Refusal message={error.message} />;
  }

  const { event } = context;

  if (event.status !== "approved") {
    return (
      <Refusal
        message={`${CANCEL_REQUIRES_APPROVED_MESSAGE} ${
          event.status === "cancelled" ? "This event is cancelled." : "This event is a draft."
        }`}
        eventId={event.id}
      />
    );
  }

  return (
    <Stack spacing={3} sx={{ maxWidth: 720 }} data-testid="cancel-screen">
      <PageHeader
        title={event.name}
        back={{ href: `/operate/events/${event.id}`, label: "Back to event" }}
        subtitle={<span data-testid="cancel-subtitle">{formatDetailWhen(event)}</span>}
      />

      <CancelForm
        eventId={event.id}
        typeLabel={event.templateName}
        invited={context.audience.invited}
        saidYes={context.audience.saidYes}
        venue={event.venue}
        isFuture={context.isFuture}
      />
    </Stack>
  );
}

function Refusal({ message, eventId }: { message: string; eventId?: string }) {
  return (
    <KitRefusal
      title="Cancel event"
      message={message}
      testId="cancel-refusal"
      action={{
        href: eventId ? `/operate/events/${eventId}` : "/operate/events",
        label: eventId ? "Back to event" : "Back to events",
      }}
    />
  );
}
