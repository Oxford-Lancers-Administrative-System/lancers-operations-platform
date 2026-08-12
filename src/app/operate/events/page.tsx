import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { gateShellPage } from "../gate";

/**
 * `/operate/events` — an ordinary operator surface, deliberately empty.
 *
 * Drafting an event is LAN-76 and approving one is LAN-77. Approval is the
 * privileged step, and it is gated on the `event_approval` capability by the
 * action that performs it — not by whether an operator can open this list.
 */
export default async function EventsPage() {
  const gate = await gateShellPage("/operate/events");
  if ("screen" in gate) return gate.screen;

  return (
    <Stack spacing={2} sx={{ maxWidth: 720 }}>
      <Typography variant="h6" component="h1">
        Events
      </Typography>
      <Typography color="text.secondary">
        The event list is not built yet. LAN-76 adds the draft, and LAN-77 adds audience
        confirmation and approval.
      </Typography>
    </Stack>
  );
}
