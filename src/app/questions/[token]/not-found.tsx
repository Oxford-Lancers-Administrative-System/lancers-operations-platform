import Typography from "@mui/material/Typography";
import { PageHeader } from "@/components/page-header";
import { PublicShell } from "@/components/public-shell";

import {
  TERMINAL_BODY,
  TERMINAL_HEADING,
  TERMINAL_PRIVACY_NOTE,
} from "@/app/a/[answer]/[token]/presentation";

/**
 * One response for every unusable nudge link — LAN-343, on the uniform
 * terminal contract LAN-79 set for this token family (UX-63/64/65). The words
 * are the answer link's rather than `/rsvp`'s, because those name an RSVP and
 * this link was never one. Unknown, expired, revoked, superseded,
 * event-started and cancelled all arrive here and read identically.
 */
export default function EventQuestionsLinkUnusable() {
  return (
    <PublicShell>
      <PageHeader title={TERMINAL_HEADING} />
      <Typography sx={{ fontSize: 15, color: "text.secondary", mt: 1.5 }}>
        {TERMINAL_BODY}
      </Typography>
      <Typography sx={{ fontSize: 14, color: "text.secondary", mt: 2 }}>
        {TERMINAL_PRIVACY_NOTE}
      </Typography>
    </PublicShell>
  );
}
