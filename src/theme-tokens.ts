/**
 * The club's token values — LAN-225. A plain module with no `"use client"`
 * directive, so a Server Component (the kit's `Section`, the preview layout)
 * can read a hex value as a value. `src/theme.ts` is a client module because
 * the theme object it builds is handed to `ThemeProvider`; anything exported
 * from there arrives in a Server Component as a client reference, not a
 * string, which is why the values live here and the theme imports them.
 *
 * The measured contrast of every pair is recorded in `src/theme.ts`, nowhere
 * else, and recomputed by `src/theme.test.ts`.
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

/**
 * The semantic set — brief §1.2. The club palette has no green or red, so these
 * were chosen to sit with it: warm, slightly desaturated, every `main` passing
 * AA both as white-on-colour (filled chips) and as colour-on-white (outlined
 * chips and alert text). `light` is the tint an alert or a selected row sits on.
 */
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

/** Geist Mono, for identifiers and the import prompt only (brief §1.4). */
export const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";
