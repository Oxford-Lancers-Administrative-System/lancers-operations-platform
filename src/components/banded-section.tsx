"use client";

import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Band } from "./band-colours";
import { useBandColours } from "./band-colours-provider";
import { LockIcon } from "./lock-icon";

/**
 * `Section variant="banded"` — a filled overline band over a tinted body
 * (LAN-225). A client component since LAN-430, so the ten roster groups can
 * wear the colour the club chose (`useBandColours`); the head's text is the
 * swatch's own band text. Rendered only through `Section`.
 */
export default function BandedSection({
  title,
  band,
  action,
  collapsible,
  defaultOpen,
  onToggleOpen,
  children,
  testId,
  titleTestId,
  headingLevel,
  locked = false,
}: {
  title: string;
  band: Band;
  action?: ReactNode;
  collapsible: boolean;
  defaultOpen: boolean;
  onToggleOpen?: (open: boolean) => void;
  children?: ReactNode;
  testId?: string;
  titleTestId?: string;
  headingLevel: 2 | 3;
  /** LAN-432 — the head alone, a lock in place of the chevron, no action, no body. */
  locked?: boolean;
}) {
  const colours = useBandColours()[band];
  const bandHead = (
    <Stack
      direction="row"
      sx={{
        bgcolor: colours.header,
        color: colours.text,
        px: 2,
        py: 0.75,
        minHeight: 36,
        justifyContent: "space-between",
        alignItems: "center",
        gap: 2,
        flexWrap: "wrap",
      }}
    >
      <Typography
        variant="overline"
        component={headingLevel === 2 ? "h2" : "h3"}
        data-testid={titleTestId}
        sx={{ fontWeight: 700, color: "inherit" }}
      >
        {title}
      </Typography>
      {locked ? null : (action ?? null)}
      {locked ? (
        <LockIcon />
      ) : collapsible ? (
        <Box
          component="span"
          aria-hidden="true"
          data-disclosure-indicator
          sx={{
            width: 10,
            height: 10,
            flexShrink: 0,
            borderRight: "2px solid",
            borderBottom: "2px solid",
            borderColor: "currentColor",
            transform: "rotate(45deg)",
          }}
        />
      ) : null}
    </Stack>
  );

  if (locked) {
    return (
      <Paper
        variant="outlined"
        component="section"
        sx={{ overflow: "hidden" }}
        data-testid={testId ? `section-${testId}` : undefined}
        data-band={band}
        data-locked="true"
      >
        {bandHead}
      </Paper>
    );
  }

  // LAN-387: a roster group is collapsible on the record exactly as it is on
  // the board, so the band itself is the disclosure control here.
  if (collapsible) {
    return (
      <Paper
        component="details"
        variant="outlined"
        open={defaultOpen || undefined}
        onToggle={
          onToggleOpen
            ? (event) => onToggleOpen((event.currentTarget as HTMLDetailsElement).open)
            : undefined
        }
        sx={{
          overflow: "hidden",
          "& > summary": { cursor: "pointer", listStyle: "none" },
          "& > summary::-webkit-details-marker": { display: "none" },
          "& > summary:focus-visible": {
            outline: "2px solid",
            outlineColor: "primary.light",
            outlineOffset: -2,
          },
          "&[open] > summary [data-disclosure-indicator]": {
            transform: "translateY(3px) rotate(225deg)",
          },
        }}
        data-testid={testId ? `section-${testId}` : undefined}
        data-band={band}
      >
        <Box component="summary">{bandHead}</Box>
        <Box sx={{ bgcolor: colours.tint, px: 2, py: 0.5 }}>{children}</Box>
      </Paper>
    );
  }

  return (
    <Paper
      variant="outlined"
      component="section"
      sx={{ overflow: "hidden" }}
      data-testid={testId ? `section-${testId}` : undefined}
      data-band={band}
    >
      {bandHead}
      <Box sx={{ bgcolor: colours.tint, px: 2, py: 0.5 }}>{children}</Box>
    </Paper>
  );
}
