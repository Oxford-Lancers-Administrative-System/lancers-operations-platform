import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import {
  BANNER,
  CLOSE,
  TERMINAL_BODY,
  TERMINAL_HEADING,
  TERMINAL_PRIVACY_NOTE,
} from "./presentation";

/**
 * One response for every unusable answer link. LAN-172, following LAN-79's
 * `src/app/rsvp/[token]/not-found.tsx` exactly.
 *
 * `unknown`, `revoked` and `event_started` all render here, at `404`, with
 * identical copy, presentation and headers — `REQ-no-false-rsvp`'s sibling
 * requirement that these stay publicly indistinguishable. `page.tsx` is the
 * only caller that may reach this file, by calling `notFound()`; there is no
 * prop, search parameter or variant here that could let the three states
 * diverge.
 */
export default function AnswerLinkUnusable() {
  return (
    <Box sx={{ minHeight: "100dvh", bgcolor: "grey.100", py: { xs: 3, sm: 6 }, px: 2 }}>
      <Box sx={{ maxWidth: 720, mx: "auto" }}>
        <Typography
          component="p"
          sx={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.08em",
            color: "text.secondary",
            mb: 2,
          }}
        >
          {BANNER}
        </Typography>
        <Paper elevation={0} sx={{ p: { xs: 2.5, sm: 4 }, borderRadius: 2 }}>
          <Typography component="h1" sx={{ fontSize: { xs: 24, sm: 28 }, fontWeight: 700 }}>
            {TERMINAL_HEADING}
          </Typography>
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
        </Paper>
      </Box>
    </Box>
  );
}
