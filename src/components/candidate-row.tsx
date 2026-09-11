import type { ReactNode } from "react";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

/**
 * A duplicate-person match — LAN-225, brief §2. Name, facts in the club's
 * words ("Matched first name", never `given_name`), status chips, one action.
 *
 * Decision history: docs/ux/tickets/LAN-231-design-rollout.md
 */
export function CandidateRow({
  name,
  facts = [],
  matched = [],
  chips,
  action,
  testId,
}: {
  name: string;
  /** College, year, a contact — what tells two people apart. */
  facts?: ReadonlyArray<string>;
  /** "Matched first name", "Matched email". */
  matched?: ReadonlyArray<string>;
  chips?: ReactNode;
  action: { label: string; href?: string; onClick?: () => void; disabled?: boolean };
  testId?: string;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }} data-testid={testId ?? "candidate-row"}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}
      >
        <Stack spacing={0.5} sx={{ minWidth: 0 }}>
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: "center", flexWrap: "wrap", gap: 0.75 }}
          >
            <Typography variant="subtitle1" component="p">
              {name}
            </Typography>
            {chips ?? null}
          </Stack>
          {facts.length > 0 ? (
            <Typography variant="body2" color="text.secondary">
              {facts.join(" · ")}
            </Typography>
          ) : null}
          {matched.length > 0 ? (
            <Typography variant="caption" color="text.secondary" data-testid="candidate-matched">
              {matched.join(" · ")}
            </Typography>
          ) : null}
        </Stack>
        <Button
          variant="outlined"
          href={action.href}
          onClick={action.onClick}
          disabled={action.disabled}
          sx={{ flexShrink: 0 }}
        >
          {action.label}
        </Button>
      </Stack>
    </Paper>
  );
}
