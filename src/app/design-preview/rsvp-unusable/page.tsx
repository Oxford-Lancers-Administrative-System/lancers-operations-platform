import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { PublicShell } from "@/components/public-shell";
import { gateShellPage } from "@/app/operate/gate";
import {
  CLOSE,
  TERMINAL_BODY,
  TERMINAL_HEADING,
  TERMINAL_PRIVACY_NOTE,
} from "@/app/rsvp/[token]/presentation";

/** S5's uniform sibling (UX-63/64/65), on the public shell (LAN-225). Copy unchanged from `rsvp/[token]/not-found.tsx`; contact button absent (address still deferred). */
export default async function RsvpUnusablePreviewPage() {
  const gate = await gateShellPage("/design-preview/rsvp-unusable");
  if ("screen" in gate) return gate.screen;

  return (
    <PublicShell caption="Your invitation" width="medium" testId="rsvp-unusable-preview">
      <Stack spacing={2}>
        <Typography variant="h1" component="h1">
          {TERMINAL_HEADING}
        </Typography>
        <Typography variant="body1" color="text.secondary">
          {TERMINAL_BODY}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {TERMINAL_PRIVACY_NOTE}
        </Typography>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ pt: 1 }}>
          <Button component="span" variant="text" sx={{ minHeight: 48 }}>
            {CLOSE}
          </Button>
        </Stack>
      </Stack>
    </PublicShell>
  );
}
