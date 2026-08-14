import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import {
  BANNER,
  CLOSE,
  CONTACT_THE_CLUB,
  TERMINAL_BODY,
  TERMINAL_HEADING,
  TERMINAL_PRIVACY_NOTE,
} from "./presentation";

/**
 * UX-63, UX-64 and UX-65 — one response for every unusable link. LAN-79.
 *
 * ## Why these three screens are one file
 *
 * Brian's owner decision of 12 August 2026 requires that an unknown link, an
 * expired one, a revoked one and a link to an event that has already started be
 * *publicly indistinguishable*: identical copy, presentation, actions, `404 Not
 * Found` status, response body, headers and timing class.
 *
 * The safest way to make three things identical is to have only one of them.
 * `page.tsx` calls `notFound()` for every one of those states, Next renders
 * this file at `404`, and there is consequently no code path on which they
 * could diverge — not through a stray conditional, not through a prop, and not
 * through a later edit that only remembers two of the three. The states stay
 * distinct where the decision says they should: in the resolver, in secure
 * logs, in tests and in operational diagnostics.
 *
 * ## What is deliberately absent
 *
 * No event, no date, no player, no invitation, no expiry time, no token
 * history, and no hint about which of the four situations applies. The privacy
 * note says as much out loud, so that a player who is simply late is not left
 * thinking the page is broken.
 *
 * ## What this file must not gain
 *
 * A prop, a search parameter, a variant, or any branch at all. Every one of
 * those is a way for the four states to become three responses, and the whole
 * point of routing them here is that they cannot.
 */
export default function RsvpLinkUnusable() {
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
            {/*
              A mailto rather than a route: this holder has no account, and the
              approved page has no navigation into the operator area. The
              address is the club's published contact, carried in configuration
              so that changing it is not a code change.
            */}
            <Button
              href={`mailto:${process.env.NEXT_PUBLIC_CLUB_CONTACT_EMAIL ?? "committee@oxfordlancers.example"}`}
              variant="contained"
              sx={{ minHeight: 48, flex: 1 }}
            >
              {CONTACT_THE_CLUB}
            </Button>
            <Button href="/" variant="text" sx={{ minHeight: 48, flex: 1 }}>
              {CLOSE}
            </Button>
          </Stack>
        </Paper>
      </Box>
    </Box>
  );
}
