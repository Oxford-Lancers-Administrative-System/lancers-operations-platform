import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

import { BANNER } from "./presentation";

/**
 * One response for every unresolvable durable link. LAN-172.
 *
 * An unknown token, a revoked one, and one whose season has closed all render
 * here identically — `resolvePersonTokenIn` already collapses the three to
 * `unknown` before this file is ever reached, so there is no state here to
 * keep separate. Same reasoning as `src/app/a/[token]/not-found.tsx` and
 * `src/app/rsvp/[token]/not-found.tsx`.
 */
export default function PlayerHomeUnusable() {
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
            This link can’t be used
          </Typography>
          <Typography sx={{ fontSize: 15, color: "text.secondary", mt: 1.5 }}>
            Request the latest message from the club for a current link to your page.
          </Typography>
          <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 2 }}>
            For privacy, we can’t provide more information about this link.
          </Typography>
        </Paper>
      </Box>
    </Box>
  );
}
