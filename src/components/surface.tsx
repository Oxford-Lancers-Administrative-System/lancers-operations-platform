import type { ReactNode } from "react";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";

/** An untitled card in a public stack: no invented heading over a form or step map. */
export function Surface({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 4 } }} data-testid={testId}>
      <Stack spacing={2}>{children}</Stack>
    </Paper>
  );
}
