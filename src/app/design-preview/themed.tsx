"use client";

import type { ReactNode } from "react";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import clubTheme from "./club-theme";

/**
 * The club theme, applied to the preview subtree and nowhere else.
 *
 * It used to be `src/theme.ts` — the application's one global theme, mounted
 * by the root layout — which meant merging this branch would have repainted
 * every page in the application at once, half-finished: the real `/operate`
 * pages would have taken the new tokens without the new components. Brian,
 * 5 September 2026: make it self-contained enough to merge without issues.
 *
 * So the theme lives here now. MUI's `ThemeProvider` nests, and the inner one
 * wins for its subtree, so `/design-preview/**` gets the club's colours while
 * the root layout's theme keeps the rest of the application exactly as it is.
 * `CssBaseline` is scoped the same way — `enableColorScheme` is deliberately
 * off, because that writes to `:root` and would reach outside this subtree.
 *
 * The implementation mission's first act is to move `club-theme.ts` to
 * `src/theme.ts` and delete this file; that is the one edit that turns the
 * proposal into the application, and it is meant to be deliberate.
 */
export function Themed({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider theme={clubTheme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
