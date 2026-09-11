import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

/**
 * One labelled fact — LAN-225, brief §2. `stacked` (overline label above a
 * value) or `inline` (label beside it). An absent value renders **not
 * recorded** in the one style the application uses (`REQ-not-recorded`),
 * never blank or a dash.
 */
export const NOT_RECORDED = "not recorded";

export function NotRecorded() {
  return (
    <Typography
      component="span"
      variant="body2"
      sx={{ color: "text.disabled", fontStyle: "italic" }}
      data-testid="not-recorded"
    >
      {NOT_RECORDED}
    </Typography>
  );
}

function isAbsent(value: ReactNode): boolean {
  return value === null || value === undefined || value === "";
}

export function Fact({
  label,
  value,
  note,
  provenance,
  layout = "stacked",
  emphasis = false,
  multiline = false,
  testId,
}: {
  label: string;
  value: ReactNode;
  /** One short line under the value. */
  note?: string;
  /** Who recorded it, or when — shown only when known. */
  provenance?: ReactNode;
  layout?: "stacked" | "inline";
  /** The value at `body1` 600, for the one or two facts a card is opened to find. */
  emphasis?: boolean;
  /** For a multi-line typed value where line breaks matter (LAN-264). `pre-line`, not `pre` — spaces still collapse. Off by default. */
  multiline?: boolean;
  testId?: string;
}) {
  const rendered = isAbsent(value) ? (
    <NotRecorded />
  ) : typeof value === "string" || typeof value === "number" ? (
    <Typography
      variant={emphasis ? "body1" : "body2"}
      sx={{ fontWeight: emphasis ? 600 : 400, ...(multiline ? { whiteSpace: "pre-line" } : {}) }}
    >
      {value}
    </Typography>
  ) : (
    value
  );

  const trailing = (
    <>
      {note ? (
        <Typography variant="caption" component="p" color="text.secondary" sx={{ mt: 0.25 }}>
          {note}
        </Typography>
      ) : null}
      {provenance ? (
        <Box sx={{ mt: 0.5 }} data-testid="fact-provenance">
          {typeof provenance === "string" ? (
            <Typography variant="caption" color="text.secondary">
              {provenance}
            </Typography>
          ) : (
            provenance
          )}
        </Box>
      ) : null}
    </>
  );

  if (layout === "inline") {
    return (
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={{ xs: 0.25, sm: 2 }}
        sx={{ py: 1, alignItems: { sm: "baseline" } }}
        data-testid={testId ?? "fact"}
        data-label={label}
      >
        <Typography
          variant="body2"
          color="text.secondary"
          component="dt"
          sx={{ minWidth: { sm: 200 }, flexShrink: 0 }}
        >
          {label}
        </Typography>
        <Box component="dd" sx={{ m: 0, minWidth: 0, flexGrow: 1 }}>
          {rendered}
          {trailing}
        </Box>
      </Stack>
    );
  }

  return (
    <Box sx={{ minWidth: 0 }} data-testid={testId ?? "fact"} data-label={label}>
      <Typography
        variant="overline"
        component="dt"
        color="text.secondary"
        sx={{ display: "block" }}
      >
        {label}
      </Typography>
      <Box component="dd" sx={{ m: 0 }}>
        {rendered}
        {trailing}
      </Box>
    </Box>
  );
}

/** Stacked facts in a responsive grid — one column on a phone, `columns` from `sm` up. */
export function FactGrid({
  columns = 2,
  children,
  testId,
}: {
  columns?: 1 | 2 | 3 | 4;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <Box
      component="dl"
      sx={{
        m: 0,
        display: "grid",
        gap: 2.5,
        gridTemplateColumns: { xs: "1fr", sm: `repeat(${columns}, minmax(0, 1fr))` },
      }}
      data-testid={testId}
    >
      {children}
    </Box>
  );
}

/** Inline facts, one under another, ruled — the record section's body. */
export function FactList({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <Box
      component="dl"
      sx={{
        m: 0,
        "& > *": { borderTop: 1, borderColor: "divider" },
        "& > *:first-of-type": { borderTop: 0 },
      }}
      data-testid={testId}
    >
      {children}
    </Box>
  );
}
