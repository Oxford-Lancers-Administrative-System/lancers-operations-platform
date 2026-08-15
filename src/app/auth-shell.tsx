import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

/**
 * The frame the three unauthenticated screens share — UX-01 and LAN-125's two
 * recovery routes.
 *
 * It exists so that sign-in, forgot-password and reset-password are visibly one
 * application rather than three MUI defaults, and it stops there. UX-01's
 * wireframe is a centred card under a "LANCERS OPERATIONS" wordmark on a tinted
 * ground, and that is all this is. No logo: `public/` holds no approved club
 * asset, and inventing one is a branding decision nobody made. No navigation:
 * these pages have one job each.
 *
 * Centred vertically on a desktop viewport and top-aligned on a phone, because
 * a 375px screen with the keyboard open has no vertical room to give away.
 */
export default function AuthShell({
  heading,
  intro,
  children,
}: {
  heading: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box
      sx={{
        minHeight: "100dvh",
        bgcolor: "grey.100",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: { xs: "flex-start", md: "center" },
        px: 2,
        py: { xs: 4, md: 6 },
      }}
    >
      <Box sx={{ width: "100%", maxWidth: 520 }}>
        <Typography
          variant="overline"
          component="p"
          sx={{ fontWeight: 800, letterSpacing: "0.12em", color: "text.secondary", mb: 1.5 }}
        >
          Lancers Operations
        </Typography>
        <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 4 } }}>
          <Stack spacing={3}>
            <Stack spacing={1}>
              <Typography variant="h5" component="h1" sx={{ fontWeight: 800 }}>
                {heading}
              </Typography>
              {intro ? (
                <Typography variant="body2" color="text.secondary">
                  {intro}
                </Typography>
              ) : null}
            </Stack>
            {children}
          </Stack>
        </Paper>
      </Box>
    </Box>
  );
}
