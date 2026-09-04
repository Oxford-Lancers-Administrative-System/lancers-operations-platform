import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

/**
 * A headline number — LAN-225, brief §2. Replaces the two byte-identical
 * `Metric`s on the event and delivery pages and the report's bare bold
 * numbers (audit E3), and the record head's mixed chip-and-number row (C5).
 *
 * Value at `h2`, label at `body2`, an optional caption. `value` may be a node
 * for the one case where the headline is a status rather than a count — the
 * record's Membership chip — so that row still reads as one row of metrics.
 * Nothing is coloured or compared against a target: a quiet week is a fact.
 */
export function Metric({
  value,
  label,
  caption,
  testId,
}: {
  value: ReactNode;
  label: string;
  caption?: string;
  testId?: string;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2, minWidth: 0 }} data-testid={testId}>
      {typeof value === "string" || typeof value === "number" ? (
        <Typography variant="h2" component="p">
          {value}
        </Typography>
      ) : (
        <Box sx={{ minHeight: 28, display: "flex", alignItems: "center" }}>{value}</Box>
      )}
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
        {label}
      </Typography>
      {caption ? (
        <Typography variant="caption" component="p" color="text.secondary">
          {caption}
        </Typography>
      ) : null}
    </Paper>
  );
}

/** Metrics side by side: two across on a phone, up to `columns` from `sm`. */
export function MetricRow({
  columns = 3,
  children,
  testId,
}: {
  columns?: 2 | 3 | 4 | 5;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <Box
      sx={{
        display: "grid",
        gap: 2,
        gridTemplateColumns: {
          xs: "repeat(2, minmax(0, 1fr))",
          sm: `repeat(${columns}, minmax(0, 1fr))`,
        },
      }}
      data-testid={testId}
    >
      {children}
    </Box>
  );
}
