"use client";

import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Collapse from "@mui/material/Collapse";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

/**
 * A section whose disclosure is controlled by its reader. Attendance needs
 * this instead of an uncontrolled details element: searching opens all groups
 * and clearing the search restores the operator's previous choices.
 * The owning screen retains that state machine; the kit owns its presentation.
 */
export function ControlledSection({
  title,
  description,
  count,
  open,
  onToggle,
  panelId,
  toggleTestId,
  countTestId,
  children,
}: {
  title: string;
  description?: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  panelId: string;
  toggleTestId?: string;
  countTestId?: string;
  children: ReactNode;
}) {
  return (
    <Paper variant="outlined" component="section">
      <ButtonBase
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        data-testid={toggleTestId}
        sx={{
          width: "100%",
          gap: 1.5,
          p: 2.5,
          minHeight: 44,
          textAlign: "left",
          justifyContent: "flex-start",
        }}
      >
        <Box
          component="svg"
          aria-hidden
          viewBox="0 0 24 24"
          sx={{ width: 22, height: 22, flexShrink: 0, transform: open ? "rotate(90deg)" : "none" }}
        >
          <path
            d="M9 5l7 7-7 7"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h3" component="h3">
            {title}
          </Typography>
          {description ? (
            <Typography variant="body2" color="text.secondary">
              {description}
            </Typography>
          ) : null}
        </Box>
        {count !== undefined ? (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ ml: "auto" }}
            data-testid={countTestId}
          >
            {count}
          </Typography>
        ) : null}
      </ButtonBase>
      <Collapse in={open} unmountOnExit>
        <Box id={panelId} sx={{ px: { xs: 2.5, md: 4 }, pb: { xs: 2.5, md: 4 } }}>
          {children}
        </Box>
      </Collapse>
    </Paper>
  );
}
