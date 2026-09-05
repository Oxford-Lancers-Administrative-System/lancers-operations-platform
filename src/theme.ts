"use client";

import { createTheme } from "@mui/material/styles";

/**
 * Material UI baseline theme.
 *
 * Scope note: this ticket establishes the theme file only. No component work,
 * no design system, no branded palette beyond a neutral placeholder. Widen this
 * deliberately when UI work is actually scheduled.
 */
const theme = createTheme({
  cssVariables: true,
  palette: {
    mode: "light",
    primary: { main: "#0b3d91" },
    secondary: { main: "#b3122b" },
  },
  typography: {
    fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
  },
  shape: { borderRadius: 8 },
});

export default theme;
