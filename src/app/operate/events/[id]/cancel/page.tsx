import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { isServiceError } from "@/lib/db";
import {
  CANCEL_REQUIRES_APPROVED_MESSAGE,
  readAmendmentContext,
  type AmendmentContext,
} from "@/lib/services/event-amendment";
import { gateShellPage } from "../../../gate";
import { formatDetailWhen, labelFor, TYPE_LABELS } from "../../presentation";
import CancelForm from "./cancel-form";

/**
 * W6 — cancelling an event, on its own route.
 *
 * The mockup draws the confirmation as a panel over the event page. A route is
 * the same screen with one property the overlay does not have: it cannot be
 * reached by a stray click, and the address bar says what is about to happen.
 * For the one irreversible action in the mission, that is the right trade.
 *
 * There is no approval gate here and none is coming — any one of the four
 * operator roles cancels alone (D56, D61), because a waterlogged pitch does not
 * wait for a quorum.
 */
export default async function CancelEventPage({
  params,
}: PageProps<"/operate/events/[id]/cancel">) {
  const gate = await gateShellPage("/operate/events", "event_approval");
  if ("screen" in gate) return gate.screen;

  const { id } = await params;

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
      <Box>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          {event.name}
        </Typography>
        <Typography variant="body2" color="text.secondary" data-testid="cancel-subtitle">
          {formatDetailWhen(event)}
        </Typography>
      </Box>

      <CancelForm
        eventId={event.id}
        typeLabel={labelFor(TYPE_LABELS, event.eventType)}
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
    <Stack spacing={2} sx={{ maxWidth: 640 }} data-testid="cancel-refusal">
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
        Cancel event
      </Typography>
      <Alert severity="info">{message}</Alert>
      <Box>
        <Button
          variant="outlined"
          href={eventId ? `/operate/events/${eventId}` : "/operate/events"}
        >
          {eventId ? "Back to event" : "Back to events"}
        </Button>
      </Box>
    </Stack>
  );
}
