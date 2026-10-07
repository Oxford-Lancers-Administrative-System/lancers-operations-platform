"use client";

import { useId, useState, type ReactNode } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Collapse from "@mui/material/Collapse";

import { DisclosureChevron } from "@/components/controlled-section";

/**
 * LAN-481 (Brian, 7 October 2026): "Attendance should literally be a
 * dropdown in the box itself." The response block is the toggle — its label,
 * counts and bar are the button — and the panel opens in place below the bar,
 * inside the same card. Closed on arrival.
 */
export function ResponseBlockToggle({
  capacity,
  panel,
  children,
}: {
  capacity: string;
  /** What opens below the bar: the capacity's names. */
  panel: ReactNode;
  /** The block itself: label, counts and bar. */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <>
      <ButtonBase
        component="div"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-controls={panelId}
        data-testid={`response-toggle-${capacity}`}
        sx={{
          display: "flex",
          width: "100%",
          alignItems: "flex-start",
          gap: 1,
          p: 2,
          textAlign: "left",
          justifyContent: "flex-start",
          borderRadius: 1,
          "&.Mui-focusVisible": {
            outline: "2px solid",
            outlineColor: "primary.light",
            outlineOffset: -2,
          },
        }}
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>{children}</Box>
        <Box sx={{ color: "primary.main", display: "flex" }}>
          <DisclosureChevron open={open} />
        </Box>
      </ButtonBase>
      <Collapse in={open} unmountOnExit>
        <Box id={panelId} sx={{ px: 2, pb: 2 }}>
          {panel}
        </Box>
      </Collapse>
    </>
  );
}
