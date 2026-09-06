import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import { BrandMark } from "./brand-mark";

/**
 * The frame every page reached without a session shares — LAN-225, brief §2.
 * Replaces the four public chromes the audit found (A9, F8, G3): `AuthShell`,
 * the RSVP and answer pages' `Shell`, the calendar's `PublicShell`, and the
 * pages with none.
 *
 * A full-bleed Oxford Blue masthead carrying the crest and the club's name,
 * one `<main>` landmark, and one card on the ground. `caption` is what the
 * page is ("Club calendar · Season 2026-27", "Sign in"); `action` is the one
 * control a masthead may carry (the calendar's subscribe link). No operator
 * navigation, no sign-in prompt where there is no account to sign in to.
 *
 * `width` is the measure: `narrow` for a form (login, reset), `medium` for a
 * page a player reads on a phone (RSVP, my page), `wide` for the calendar.
 *
 * `layout` is whether that measure holds one card or a stack the page fills
 * itself. `card` is the default at `narrow` and `medium` and is right for a
 * page that is one panel. `stack` is for a public page that is genuinely
 * several sections — the player's own invitations, the questionnaire's steps —
 * where one card around all of them would be a card around a whole page and
 * the sections inside it would be cards inside a card. `wide` is `stack`
 * because a calendar was never a panel.
 */
export function PublicShell({
  caption,
  action,
  width = "medium",
  layout,
  children,
  testId,
}: {
  caption?: string;
  action?: ReactNode;
  width?: "narrow" | "medium" | "wide";
  layout?: "card" | "stack";
  children: ReactNode;
  testId?: string;
}) {
  const maxWidth = width === "narrow" ? 520 : width === "medium" ? 720 : 1200;
  const asCard = (layout ?? (width === "wide" ? "stack" : "card")) === "card";
  return (
    <Box
      sx={{ minHeight: "100dvh", bgcolor: "background.default" }}
      data-testid={testId ?? "public-shell"}
    >
      <Box component="header" sx={{ bgcolor: "primary.main", color: "common.white" }}>
        <Stack
          direction="row"
          spacing={2}
          sx={{
            maxWidth: 1200,
            mx: "auto",
            px: { xs: 2, md: 3 },
            py: { xs: 1.5, md: 2 },
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <BrandMark tone="onDark" size={32} caption={caption} testId="public-brand" />
          {action ? (
            <Box
              sx={{
                "& .MuiButton-root": {
                  color: "common.white",
                  borderColor: "rgba(255,255,255,0.6)",
                },
              }}
            >
              {action}
            </Box>
          ) : null}
        </Stack>
      </Box>
      <Box component="main" sx={{ px: { xs: 2, md: 3 }, py: { xs: 2.5, md: 6 } }}>
        <Box sx={{ maxWidth, mx: "auto" }}>
          {!asCard ? (
            children
          ) : (
            <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 4 } }}>
              {children}
            </Paper>
          )}
        </Box>
      </Box>
    </Box>
  );
}
