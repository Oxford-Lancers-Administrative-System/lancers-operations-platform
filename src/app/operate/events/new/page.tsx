import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { isServiceError } from "@/lib/db";
import { UnavailableScreen } from "@/app/operate/unavailable";
import { listTermWindows } from "@/lib/services/seasons";
import { gateShellPage } from "../../gate";
import EventForm from "../event-form";

/**
 * UX-31 — a new event draft.
 *
 * The heading and the sentence under it are the wireframe's. The form itself
 * is shared with the edit view, because they are the same screen with the same
 * rules.
 */
export default async function NewEventPage() {
  const gate = await gateShellPage("/operate/events", "event_calendar_management");
  if ("screen" in gate) return gate.screen;

  let terms;
  try {
    terms = await listTermWindows();
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

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          Create event
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Record the operational facts before resolving an audience.
        </Typography>
      </Box>

      <EventForm mode="create" terms={terms} cancelHref="/operate/events" />
    </Stack>
  );
}
