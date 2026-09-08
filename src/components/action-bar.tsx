import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

/**
 * A form's foot — LAN-225, brief §2. Replaces form footers built five ways
 * (audit A8, E10, F5): primary, secondary, cancel, in that order, left-aligned
 * on a desktop and sticky at the bottom of a phone so the one button the
 * reader needs is never 5,000px away.
 *
 * `note` is the one sentence a disabled control owes the reader —
 * `docs/ux/standards.md` rule 4 — and nothing else goes here.
 */
export function ActionBar({
  primary,
  secondary,
  cancel,
  note,
  testId,
}: {
  primary: ReactNode;
  secondary?: ReactNode;
  cancel?: ReactNode;
  /** What would enable the primary action, when it is disabled. */
  note?: string;
  testId?: string;
}) {
  return (
    <Box
      component="footer"
      sx={{
        position: { xs: "sticky", md: "static" },
        bottom: 0,
        // A number, not a theme function: this is a Server Component and a function
        // inside `sx` cannot cross to the client. MUI's appBar is 1100.
        zIndex: 1099,
        bgcolor: { xs: "background.paper", md: "transparent" },
        borderTop: { xs: 1, md: 0 },
        borderColor: "divider",
        mx: { xs: -2, md: 0 },
        px: { xs: 2, md: 0 },
        py: { xs: 1.5, md: 0 },
      }}
      data-testid={testId ?? "action-bar"}
    >
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1.5}
        sx={{ alignItems: { xs: "stretch", sm: "center" } }}
      >
        {primary}
        {secondary ?? null}
        {cancel ?? null}
      </Stack>
      {note ? (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mt: 1 }}
          data-testid="action-bar-note"
        >
          {note}
        </Typography>
      ) : null}
    </Box>
  );
}
