import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

/**
 * One refusal screen — LAN-225, brief §2, `docs/ux/standards.md` rule 6.
 * Replaces the four local `Refusal`s, `NotPermittedScreen`,
 * `CoachNotPermittedScreen` and `UnavailableScreen` (audit A2, C1, H3).
 *
 * A guard firing correctly is not an error page: a `display` title, one
 * sentence, one action. No second alert addressed to a reviewer, no stack
 * trace, and never a 404 for a page that exists. `requirement`, where the
 * refusal has one, is the guard's own sentence naming what the action needs
 * — never what the reader holds.
 */
export function Refusal({
  title,
  message,
  requirement,
  action,
  secondary,
  testId,
}: {
  title: string;
  /** One sentence, on the screen the person was already on. */
  message: string;
  /** The role or condition the action requires, in the guard's words. */
  requirement?: string;
  /** The one way forward. */
  action?: { href: string; label: string } | ReactNode;
  /** A second control, only where the wireframe has one (sign out on UX-05). */
  secondary?: ReactNode;
  testId?: string;
}) {
  const actionNode =
    action && typeof action === "object" && "href" in action ? (
      <Button href={action.href} variant="contained">
        {action.label}
      </Button>
    ) : (
      (action ?? null)
    );

  return (
    <Box sx={{ display: "flex", justifyContent: "center", py: { xs: 2, md: 6 } }}>
      <Paper
        variant="outlined"
        sx={{ maxWidth: 640, width: "100%", p: { xs: 2.5, md: 4 } }}
        data-testid={testId ?? "refusal"}
      >
        <Stack spacing={2} sx={{ alignItems: "flex-start" }}>
          <Typography variant="h1" component="h1">
            {title}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {message}
          </Typography>
          {requirement ? (
            <Typography variant="body1" sx={{ fontWeight: 600 }} data-testid="refusal-requirement">
              {requirement}
            </Typography>
          ) : null}
          {actionNode || secondary ? (
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1.5}
              sx={{ width: "100%", pt: 1 }}
            >
              {actionNode}
              {secondary ?? null}
            </Stack>
          ) : null}
        </Stack>
      </Paper>
    </Box>
  );
}
