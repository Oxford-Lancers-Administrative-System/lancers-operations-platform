import type { ReactNode } from "react";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

/**
 * What a list says when it has nothing to list — LAN-225, brief §2, and
 * `docs/ux/standards.md` rule 5: a failed search names what was searched for
 * and links to the action that resolves it. It never states a constraint and
 * stops. Replaces `EmptyPeople`, `EmptyQueue` and the inline "no rows" copy
 * (audit E7).
 */
export function EmptyState({
  title,
  searched,
  description,
  action,
  actions,
  testId,
}: {
  title: string;
  /** The terms the reader searched for, echoed so they can see what found nothing. */
  searched?: string;
  description?: ReactNode;
  /** The route that resolves it — create the record, clear the filter. */
  action?: { href: string; label: string };
  /** Existing recovery choices when an empty list has more than one. */
  actions?: ReactNode;
  testId?: string;
}) {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 3 } }} data-testid={testId ?? "empty-state"}>
      <Stack spacing={1.5} sx={{ alignItems: "flex-start" }}>
        <Typography variant="h3" component="h2">
          {title}
        </Typography>
        {searched ? (
          <Typography variant="body2" color="text.secondary" data-testid="empty-state-searched">
            Nothing matches <strong>{searched}</strong>.
          </Typography>
        ) : null}
        {description ? (
          <Typography variant="body2" color="text.secondary">
            {description}
          </Typography>
        ) : null}
        {actions ?? null}
        {action ? (
          <Button href={action.href} variant="outlined" data-testid="empty-state-action">
            {action.label}
          </Button>
        ) : null}
      </Stack>
    </Paper>
  );
}
