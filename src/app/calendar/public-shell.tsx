import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

/**
 * The frame the public calendar shares. LAN-153.
 *
 * ## What it deliberately is not
 *
 * No operator navigation, no sign-in prompt, no account state. This is the
 * club's own noticeboard, and the reader is "anyone with a browser and no
 * account" — `W1`'s primary actor. Offering them a sign-in they cannot use, or
 * an Events/Roster/Report rail they cannot open, would be describing an
 * application they are not in.
 *
 * No logo either: `public/` holds no approved club asset, and inventing one is a
 * branding decision nobody has made. The same reasoning `AuthShell` records.
 *
 * ## It says which season, and nothing about why
 *
 * `REQ-one-open-season` — one season is open, no surface offers a way to reach
 * another, and nothing qualifies itself by which season it means. The header
 * names the season because a reader landing here should know what year they are
 * looking at; it does not explain that there is only one, because the
 * application does not narrate its own rules.
 */
export default function PublicShell({
  seasonLabel,
  action,
  children,
}: {
  seasonLabel: string | null;
  /** The one action in the header, where a page has one. */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box sx={{ minHeight: "100dvh", bgcolor: "grey.100" }}>
      <Box
        component="header"
        sx={{ borderBottom: 1, borderColor: "divider", bgcolor: "background.paper" }}
      >
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          sx={{
            maxWidth: 1200,
            mx: "auto",
            px: { xs: 2, md: 3 },
            py: 2,
            alignItems: { sm: "center" },
            justifyContent: "space-between",
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="overline"
              component="p"
              sx={{ fontWeight: 800, letterSpacing: "0.12em", color: "text.secondary" }}
            >
              Oxford Lancers
            </Typography>
            <Typography variant="body2" color="text.secondary" data-testid="public-season-label">
              {seasonLabel === null ? "Club calendar" : `Club calendar · Season ${seasonLabel}`}
            </Typography>
          </Box>
          {action ?? null}
        </Stack>
      </Box>

      <Box
        component="main"
        sx={{ maxWidth: 1200, mx: "auto", px: { xs: 2, md: 3 }, py: { xs: 2.5, md: 4 } }}
      >
        {children}
      </Box>
    </Box>
  );
}
