"use client";

import { createTheme } from "@mui/material/styles";

/**
 * The club's tokens — LAN-225, from
 * `docs/ux/review/design-audit-2026-09/brief.md` §1. Contrast (WCAG 2.x, AA
 * 4.5 text / 3.0 large-text-and-components) is measured and recorded here
 * only; `src/theme.test.ts` recomputes each pair and fails if one drifts.
 */

import { CLUB, LAYOUT, RADIUS, SEMANTIC } from "@/theme-tokens";

export { CLUB, SEMANTIC } from "@/theme-tokens";

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
      contrastText: CLUB.charcoal, // never white on Gold (2.73); Charcoal on Gold is 6.12
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
    // Brief §1.4. h4-h6 alias h1-h3 so pages picking by habit land on this scale, not MUI's defaults.
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
