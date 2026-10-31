"use client";

import { useState, type ReactNode } from "react";
import Box from "@mui/material/Box";
import ClickAwayListener from "@mui/material/ClickAwayListener";
import IconButton from "@mui/material/IconButton";
import SvgIcon from "@mui/material/SvgIcon";
import Tooltip from "@mui/material/Tooltip";
import {
  BRIEF_BODY_SIZE,
  BRIEF_CALLOUT,
  BRIEF_GOLD,
  BRIEF_HEADING_SIZE,
  BRIEF_INK,
  BRIEF_NAVY,
  BRIEF_PAPER,
  BRIEF_RULE,
  BRIEF_TITLE_SIZE,
} from "@/lib/event-brief/style";

/**
 * The formatting guide — LAN-508, round 2. A "?" at the end of the toolbar.
 * Hover or focus (desktop) or a tap (phone) opens one card: what you type on
 * the left, what the brief draws on the right. The right-hand column is set in
 * the brief's own sizes and colours (`event-brief/style.ts`), the numbers the
 * PNG and the email are drawn from, so it matches the Preview.
 *
 * Labels and values only. Escape closes it; the button carries the name.
 */

const HELP_PATH =
  "M11 18h2v-2h-2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8m0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4";

/** The itinerary's time column, narrowed to fit the card. */
const GUIDE_TIME_WIDTH = 64;

const ROWS: readonly { type: string; looks: ReactNode }[] = [
  {
    type: "# Game day",
    looks: (
      <Box
        component="span"
        sx={{
          display: "block",
          color: BRIEF_NAVY,
          fontSize: BRIEF_TITLE_SIZE,
          lineHeight: 1.15,
          fontWeight: 700,
        }}
      >
        Game day
      </Box>
    ),
  },
  {
    type: "## Itinerary",
    looks: (
      <Box
        component="span"
        sx={{
          display: "block",
          color: BRIEF_NAVY,
          fontSize: BRIEF_HEADING_SIZE,
          fontWeight: 700,
          pb: "4px",
          borderBottom: `2px solid ${BRIEF_GOLD}`,
        }}
      >
        Itinerary
      </Box>
    ),
  },
  { type: "**both**", looks: <Box component="strong">both</Box> },
  {
    type: "- Helmet",
    looks: (
      <Box component="span" sx={{ display: "flex" }}>
        <Box component="span" sx={{ width: 22, flexShrink: 0, pl: "6px" }}>
          •
        </Box>
        Helmet
      </Box>
    ),
  },
  {
    type: "> Kit check",
    looks: (
      <Box
        component="span"
        sx={{
          display: "block",
          bgcolor: BRIEF_CALLOUT,
          borderLeft: `4px solid ${BRIEF_GOLD}`,
          p: "10px 12px",
        }}
      >
        Kit check
      </Box>
    ),
  },
  {
    type: "- 12:00 Event name",
    looks: (
      <Box
        component="span"
        sx={{ display: "flex", py: "4px", borderBottom: `1px solid ${BRIEF_RULE}` }}
      >
        <Box component="span" sx={{ width: GUIDE_TIME_WIDTH, flexShrink: 0, fontWeight: 700 }}>
          12:00
        </Box>
        Event name
      </Box>
    ),
  },
];

function GuideCard() {
  return (
    <Box
      data-testid="brief-format-guide-card"
      sx={{
        width: { xs: "calc(100vw - 48px)", sm: 460 },
        maxWidth: 460,
        bgcolor: BRIEF_PAPER,
        color: BRIEF_INK,
        fontSize: BRIEF_BODY_SIZE,
        lineHeight: 1.45,
        p: 1.5,
        borderRadius: 1,
      }}
    >
      <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
        <Box component="thead" sx={{ position: "absolute", left: -9999 }}>
          <tr>
            <th>You type</th>
            <th>It looks like</th>
          </tr>
        </Box>
        <tbody>
          {ROWS.map((row) => (
            <Box
              component="tr"
              key={row.type}
              data-testid="brief-format-guide-row"
              sx={{ borderBottom: `1px solid ${BRIEF_RULE}`, "&:last-child": { border: 0 } }}
            >
              <Box
                component="td"
                sx={{
                  py: 1,
                  pr: 1.5,
                  width: "40%",
                  verticalAlign: "middle",
                  fontFamily: "ui-monospace, Menlo, monospace",
                  fontSize: 14,
                  whiteSpace: "nowrap",
                }}
              >
                {row.type}
              </Box>
              <Box component="td" sx={{ py: 1, verticalAlign: "middle" }}>
                {row.looks}
              </Box>
            </Box>
          ))}
        </tbody>
      </Box>
    </Box>
  );
}

export function BriefFormatGuide({ disabled = false }: { disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <ClickAwayListener onClickAway={() => setOpen(false)}>
      <Box component="span" sx={{ display: "inline-flex" }}>
        <Tooltip
          open={open}
          onOpen={() => setOpen(true)}
          onClose={() => setOpen(false)}
          title={<GuideCard />}
          placement="bottom-start"
          // A tap opens it through the click below; the touch listener would double up.
          disableTouchListener
          slotProps={{
            popper: { sx: { zIndex: 1500 } },
            tooltip: {
              sx: {
                bgcolor: BRIEF_PAPER,
                color: BRIEF_INK,
                p: 0,
                maxWidth: "none",
                boxShadow: 6,
                border: `1px solid ${BRIEF_RULE}`,
              },
            },
          }}
        >
          <span>
            <IconButton
              size="small"
              aria-label="Formatting guide"
              aria-expanded={open}
              disabled={disabled}
              onClick={() => setOpen((value) => !value)}
              data-testid="brief-format-guide"
            >
              <SvgIcon fontSize="small">
                <path d={HELP_PATH} />
              </SvgIcon>
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    </ClickAwayListener>
  );
}
