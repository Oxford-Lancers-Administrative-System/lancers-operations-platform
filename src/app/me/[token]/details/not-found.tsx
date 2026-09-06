import { PublicShell } from "@/components/public-shell";
import { PageHeader } from "@/components/page-header";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { CLOSE, TERMINAL_BODY, TERMINAL_HEADING, TERMINAL_PRIVACY_NOTE } from "./presentation";

/**
 * One response for every unusable link on this route — LAN-216, `W4-09`.
 *
 * `unknown`, `revoked` and a closed season all resolve to the same outcome
 * upstream (`resolvePersonTokenIn` collapses all three to `"unknown"`), and
 * this is the one page every one of them renders: the shape
 * `src/app/a/[token]/not-found.tsx` already ships — 404, the same heading,
 * the same privacy line, one `Close`, no variant that could let the three
 * diverge. The only change from that shipped page is `TERMINAL_BODY` itself:
 * the shipped sentence talks about an event having started, which is the
 * answer link's own business and untrue of this collection link.
 */
export default function PlayerDetailsUnusable() {
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
