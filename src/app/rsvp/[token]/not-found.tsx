import { PublicShell } from "@/components/public-shell";
import { PageHeader } from "@/components/page-header";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import {
  CLOSE,
  CLUB_CONTACT_EMAIL,
  CONTACT_THE_CLUB,
  TERMINAL_BODY,
  TERMINAL_HEADING,
  TERMINAL_PRIVACY_NOTE,
} from "./presentation";

/**
 * UX-63, UX-64 and UX-65 — one response for every unusable link. LAN-79.
 * Brian's owner decision of 12 August 2026 requires unknown/expired/revoked/
 * started to be publicly indistinguishable; the safest way is one file, with
 * no prop, search parameter or variant that could let them diverge.
 *
 * Decision history: docs/ux/tickets/LAN-79-player-rsvp.md
 */
export default function RsvpLinkUnusable() {
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
        {/* Contact the club, only when there is somewhere for it to go — Brian deferred the address 14 August 2026. Renders no button rather than a broken one. */}
        {CLUB_CONTACT_EMAIL ? (
          <Button
            href={`mailto:${CLUB_CONTACT_EMAIL}`}
            variant="contained"
            sx={{ minHeight: 48, flex: 1 }}
          >
            {CONTACT_THE_CLUB}
          </Button>
        ) : null}
        {/* Goes nowhere on purpose — used to link to `/`, one tap from an operator sign-in prompt. */}
        <Button component="span" variant="text" sx={{ minHeight: 48, flex: 1 }}>
          {CLOSE}
        </Button>
      </Stack>
    </PublicShell>
  );
}
