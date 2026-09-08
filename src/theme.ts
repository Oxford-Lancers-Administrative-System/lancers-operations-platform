"use client";

import { createTheme } from "@mui/material/styles";

/**
 * The club's tokens — LAN-225, from `docs/ux/review/design-audit-2026-09/brief.md` §1.
 *
 * ## Contrast — measured, WCAG 2.x, every pair a text colour is drawn in
 *
 * AA is 4.5 for text and 3.0 for large text and UI components. Recorded here
 * and nowhere else; `src/theme.test.ts` recomputes each pair from the values
 * below and fails if one drifts under the line. Pairs the palette forbids are
 * listed so nobody has to rediscover why.
 *
 * | Foreground            | Background          | Ratio | Used for                                  |
 * | --------------------- | ------------------- | ----- | ----------------------------------------- |
 * | Charcoal `#211D1C`    | White `#FFFFFF`     | 16.70 | body text on paper                        |
 * | Charcoal              | Ground `#F6F5F2`    | 15.32 | body text on the page ground              |
 * | Charcoal              | Sky Blue `#B9D6F2`  | 11.11 | text on a selected row / active tint      |
 * | Charcoal              | Gold `#C09723`      |  6.12 | text on a gold band                       |
 * | Charcoal              | Ochre `#E2C044`     |  9.43 | text on a highlighted row                 |
 * | Charcoal              | Lemon `#F7EF66`     | 13.91 | text on a callout band                    |
 * | Secondary `#5A5754`   | White               |  7.18 | captions, helper text, table sublines     |
 * | Secondary             | Ground              |  6.58 | captions on the page ground               |
 * | White                 | Oxford Blue `#002147`| 16.05| sidebar text, contained primary buttons   |
 * | White                 | Oxford Blue dark `#001633` | 18.06 | contained primary button, hover   |
 * | White                 | Royal Blue `#1D42A6`|  8.82 | info chips, focus ring on dark ground     |
 * | Sky Blue `#B9D6F2`    | Oxford Blue         | 10.67 | sidebar secondary lines                   |
 * | Oxford Blue           | Sky Blue            | 10.67 | the active navigation item                |
 * | Oxford Blue           | Gold                |  5.88 | crest lettering, a gold accent band       |
 * | Royal Blue            | White               |  8.82 | links, outlined info chips                |
 * | Royal Blue            | Ground              |  8.09 | links on the page ground                  |
 * | Old Gold `#8D7149`    | White               |  4.57 | overlines and secondary emphasis (AA, not AAA) |
 * | Success `#1E6F3C`     | White / on tint `#E3F1E7` | 6.19 / 5.30 | outlined chip text; alert text |
 * | Warning `#9A5B00`     | White / on tint `#FBF1DC` | 5.43 / 4.84 | outlined chip text; alert text |
 * | Error `#B3261E`       | White / on tint `#FBE7E5` | 6.54 / 5.50 | outlined chip text; alert text |
 * | Info `#1D42A6`        | White / on tint `#E3EBF8` | 8.82 / 7.35 | outlined chip text; alert text |
 * | Neutral `#5A5754`     | White / on tint `#ECEAE6` | 7.18 / 5.97 | outlined chip text; alert text |
 * | White                 | Success / Warning / Error / Info / Neutral | 6.19 / 5.43 / 6.54 / 8.82 / 7.18 | filled chips |
 * | Charcoal              | each semantic tint  | ≥ 13.90 | alert body text                         |
 *
 * Forbidden, and why (the brief's §1.1 rules, enforced by never being tokens):
 *
 * - White on Gold 2.73, on Ochre 1.77, on Lemon 1.20, on Sky Blue 1.50 — the
 *   four never carry white text; they are grounds under Charcoal or Oxford Blue.
 * - Gold, Ochre, Lemon on White (2.73, 1.77, 1.20) — never text, icon or a chip
 *   outline that must be read; a gold rule is decoration.
 * - Royal Blue on Oxford Blue 1.82 — the two blues never stack as text on
 *   ground; sidebar text is white or Sky Blue.
 * - Old Gold on Oxford Blue 3.51 — large text or a rule only.
 * - `text.disabled` `#8C8987` on White 3.47 — a disabled control is exempt from
 *   AA (WCAG 1.4.3) and is never the only way to read a value.
 *
 * ## What is decided here, and by whom
 *
 * Six of the brief's open decisions (§4) were taken on the recommendation each
 * one carries, and each is Brian's to overturn at visual review: Geist stays;
 * light only, `cssVariables` left on so dark can follow; compact tables and
 * comfortable forms; the crest in the shell; sentence-case buttons; and the
 * copy findings H1 (login alert), A6 (`Sep`), E9 (pickers over native dates)
 * riding as labelled deltas on the screens that carry them.
 */

import { CLUB, LAYOUT, RADIUS, SEMANTIC } from "@/theme-tokens";

export { CLUB, LAYOUT, RADIUS, SEMANTIC, FONT_MONO } from "@/theme-tokens";

declare module "@mui/material/styles" {
  interface Palette {
    neutral: Palette["primary"];
  }
  interface PaletteOptions {
    neutral?: PaletteOptions["primary"];
  }
}

declare module "@mui/material/Chip" {
  interface ChipPropsColorOverrides {
    neutral: true;
  }
}

declare module "@mui/material/Alert" {
  interface AlertPropsColorOverrides {
    neutral: true;
  }
}

declare module "@mui/material/Button" {
  interface ButtonPropsColorOverrides {
    neutral: true;
  }
}

const FONT_SANS = "var(--font-geist-sans), system-ui, sans-serif";

const theme = createTheme({
  cssVariables: true,
  spacing: 8,
  shape: { borderRadius: RADIUS.control },
  palette: {
    mode: "light",
    primary: {
      main: CLUB.oxfordBlue,
      light: CLUB.royalBlue,
      dark: CLUB.oxfordBlueDark,
      contrastText: CLUB.white,
    },
    secondary: {
      main: CLUB.gold,
      light: CLUB.ochre,
      dark: CLUB.oldGold,
      // Never white on Gold (2.73). Charcoal on Gold is 6.12.
      contrastText: CLUB.charcoal,
    },
    success: { ...SEMANTIC.success, contrastText: CLUB.white },
    warning: { ...SEMANTIC.warning, contrastText: CLUB.white },
    error: { ...SEMANTIC.error, contrastText: CLUB.white },
    info: { ...SEMANTIC.info, contrastText: CLUB.white },
    neutral: { ...SEMANTIC.neutral, contrastText: CLUB.white },
    text: {
      primary: CLUB.charcoal,
      secondary: CLUB.charcoal70,
      disabled: CLUB.charcoal50,
    },
    background: { default: CLUB.ground, paper: CLUB.white },
    divider: "rgba(33, 29, 28, 0.12)",
    action: {
      hover: "rgba(0, 33, 71, 0.04)",
      selected: "rgba(185, 214, 242, 0.45)",
      focus: "rgba(29, 66, 166, 0.16)",
    },
  },
  typography: {
    fontFamily: FONT_SANS,
    // Brief §1.4. `h1` is the one `display` title per page; `h2`/`h3` follow.
    // `h4`–`h6` alias the same three tiers so the shipped pages, which still
    // pick their heading variant by habit, land on the scale rather than on
    // MUI's defaults until the kit replaces them.
    h1: { fontSize: 28, lineHeight: "34px", fontWeight: 700, letterSpacing: "-0.01em" },
    h2: { fontSize: 22, lineHeight: "28px", fontWeight: 700 },
    h3: { fontSize: 17, lineHeight: "24px", fontWeight: 600 },
    h4: { fontSize: 28, lineHeight: "34px", fontWeight: 700, letterSpacing: "-0.01em" },
    h5: { fontSize: 22, lineHeight: "28px", fontWeight: 700 },
    h6: { fontSize: 17, lineHeight: "24px", fontWeight: 600 },
    subtitle1: { fontSize: 15, lineHeight: "22px", fontWeight: 600 },
    subtitle2: { fontSize: 13, lineHeight: "18px", fontWeight: 600 },
    body1: { fontSize: 15, lineHeight: "22px" },
    body2: { fontSize: 13, lineHeight: "18px" },
    caption: { fontSize: 12, lineHeight: "16px" },
    overline: {
      fontSize: 11,
      lineHeight: "16px",
      fontWeight: 600,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
    },
    button: { fontSize: 14, lineHeight: "20px", fontWeight: 600, textTransform: "none" },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        // G5. One focus ring, Royal Blue, offset so it reads on every ground.
        ":focus-visible": { outline: `2px solid ${CLUB.royalBlue}`, outlineOffset: 2 },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: RADIUS.control, paddingLeft: 16, paddingRight: 16 },
        sizeMedium: { minHeight: LAYOUT.touchTarget },
        sizeSmall: { minHeight: 36 },
        contained: {
          variants: [
            {
              props: { color: "primary" },
              style: { "&:hover": { backgroundColor: CLUB.oxfordBlueDark } },
            },
          ],
        },
        // A10: destructive actions are outlined `error`; a filled red is reserved
        // for the confirmation inside a panel.
        outlined: {
          variants: [{ props: { color: "error" }, style: { borderColor: SEMANTIC.error.main } }],
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: RADIUS.pill, fontWeight: 600 },
        sizeSmall: { height: 24, fontSize: 12 },
        // G2. An outlined chip's text is the semantic `main`, which passes AA on
        // white; the border is the same colour at full strength.
        outlined: { borderWidth: 1 },
      },
    },
    MuiAlert: {
      defaultProps: { variant: "standard" },
      styleOverrides: {
        root: { borderRadius: RADIUS.control, alignItems: "flex-start" },
        // E2 / G1. Standard alerts sit on the semantic tint with Charcoal body
        // text (≥ 13.90) and the icon in the semantic `main`.
        standard: {
          color: CLUB.charcoal,
          variants: (["success", "warning", "error", "info"] as const).map((severity) => ({
            props: { severity },
            style: {
              backgroundColor: SEMANTIC[severity].light,
              "& .MuiAlert-icon": { color: SEMANTIC[severity].main },
            },
          })),
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderBottomColor: "rgba(33, 29, 28, 0.12)", fontSize: 13, lineHeight: "18px" },
        head: {
          fontWeight: 600,
          color: CLUB.charcoal70,
          backgroundColor: CLUB.white,
          whiteSpace: "nowrap",
        },
        sizeSmall: { padding: "6px 12px" },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: { "&.Mui-selected": { backgroundColor: "rgba(185, 214, 242, 0.45)" } },
      },
    },
    MuiTextField: {
      defaultProps: { fullWidth: true },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { borderRadius: RADIUS.control, backgroundColor: CLUB.white },
        notchedOutline: { borderColor: "rgba(33, 29, 28, 0.28)" },
      },
    },
    MuiFormHelperText: {
      styleOverrides: { root: { marginLeft: 0 } },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: "none" },
        outlined: { borderColor: "rgba(33, 29, 28, 0.12)" },
        rounded: { borderRadius: RADIUS.control },
      },
    },
    MuiCard: {
      defaultProps: { variant: "outlined" },
    },
    MuiDrawer: {
      styleOverrides: { paper: { borderRadius: 0 } },
    },
    MuiDialog: {
      styleOverrides: { paper: { borderRadius: RADIUS.surface } },
    },
    MuiMenu: {
      styleOverrides: { paper: { borderRadius: RADIUS.surface } },
    },
    MuiLink: {
      defaultProps: { underline: "hover" },
      styleOverrides: {
        // G6. One link style: Royal Blue, underlined on hover and focus.
        root: { color: CLUB.royalBlue, fontWeight: 500 },
      },
    },
    MuiListItemButton: {
      styleOverrides: { root: { borderRadius: RADIUS.control } },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: { backgroundColor: CLUB.charcoal, fontSize: 12, borderRadius: RADIUS.control },
      },
    },
  },
});

export default theme;
