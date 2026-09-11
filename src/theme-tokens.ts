/**
 * The club's token values — LAN-225. A plain module, no `"use client"`, so a
 * Server Component can read a hex value as a value; `src/theme.ts` (a client
 * module) imports these rather than being imported. Contrast is recorded in
 * `src/theme.ts` and recomputed by `src/theme.test.ts`.
 *
 * Decision history: docs/ux/design-system.md
 */

/** The nine Figma brand-board styles, read 3 September 2026, plus the two neutrals the board does not supply. */
export const CLUB = Object.freeze({
  white: "#FFFFFF",
  oxfordBlue: "#002147",
  oxfordBlueDark: "#001633",
  royalBlue: "#1D42A6",
  skyBlue: "#B9D6F2",
  charcoal: "#211D1C",
  charcoal70: "#5A5754",
  charcoal50: "#8C8987",
  oldGold: "#8D7149",
  gold: "#C09723",
  ochre: "#E2C044",
  lemon: "#F7EF66",
  /** Warm off-white page ground. Not a brand colour; chosen to sit with the golds. */
  ground: "#F6F5F2",
});

/** The semantic set (brief §1.2) — chosen to sit with the club's palette, every `main` passing AA both directions. `light` is the tint an alert sits on. */
export const SEMANTIC = Object.freeze({
  success: { main: "#1E6F3C", light: "#E3F1E7", dark: "#155029" },
  warning: { main: "#9A5B00", light: "#FBF1DC", dark: "#6E4100" },
  error: { main: "#B3261E", light: "#FBE7E5", dark: "#8A1B15" },
  info: { main: "#1D42A6", light: "#E3EBF8", dark: "#153280" },
  neutral: { main: "#5A5754", light: "#ECEAE6", dark: "#3F3D3B" },
});

/** Radius tokens — brief §1.5. */
export const RADIUS = Object.freeze({ control: 8, pill: 16, surface: 12 });

/** Page geometry — brief §1.5. One gutter and one measure for every page. */
export const LAYOUT = Object.freeze({
  contentMaxWidth: 1200,
  gutterDesktop: 4,
  gutterPhone: 2,
  sidebarWidth: 226,
  drawerWidth: 280,
  touchTarget: 44,
});
