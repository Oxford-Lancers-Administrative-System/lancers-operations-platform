import { PublicShell } from "@/components/public-shell";
import { PageHeader } from "@/components/page-header";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { CLOSE, TERMINAL_BODY, TERMINAL_HEADING, TERMINAL_PRIVACY_NOTE } from "./presentation";

/** One response for every unusable answer link (LAN-172, following `rsvp/[token]/not-found.tsx`) — `unknown`/`revoked`/`event_started` render identically, publicly indistinguishable (`REQ-no-false-rsvp`). */
export default function AnswerLinkUnusable() {
  return (
    <PublicShell>
      <PageHeader title={TERMINAL_HEADING} />
      <Typography sx={{ fontSize: 15, color: "text.secondary", mt: 1.5 }}>
        {TERMINAL_BODY}
      </Typography>
      <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 2 }}>
        {TERMINAL_PRIVACY_NOTE}
      </Typography>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 3 }}>
        <Button component="span" variant="text" sx={{ minHeight: 48, flex: 1 }}>
          {CLOSE}
        </Button>
      </Stack>
    </PublicShell>
  );
}
