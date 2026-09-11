import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

/**
 * A form's foot — LAN-225, brief §2. Primary, secondary, cancel, in order;
 * sticky at the bottom of a phone. `note` is the one sentence a disabled
 * control owes the reader (`docs/ux/standards.md` rule 4).
 */
export function ActionBar({
  primary,
  secondary,
  cancel,
  note,
  testId,
  sticky = true,
}: {
  primary: ReactNode;
  secondary?: ReactNode;
  cancel?: ReactNode;
  /** What would enable the primary action, when it is disabled. */
  note?: string;
  testId?: string;
  /** Repeated independent forms keep their own save control in flow. */
  sticky?: boolean;
}) {
  return (
    <Box
      component="footer"
      sx={{
        position: { xs: sticky ? "sticky" : "static", md: "static" },
        bottom: 0,
        zIndex: 1099, // a number, not a theme function: a Server Component, and MUI's appBar is 1100
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
