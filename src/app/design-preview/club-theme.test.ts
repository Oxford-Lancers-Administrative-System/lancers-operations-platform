import { describe, expect, it } from "vitest";
import theme, { CLUB, SEMANTIC } from "./club-theme";

/**
 * WCAG 2.x relative luminance and contrast, written out here rather than taken
 * from a dependency so the number the theme's comment block records is the
 * number this file computes.
 */
function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel(n >> 16) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrast(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return Math.round(((light + 0.05) / (dark + 0.05)) * 100) / 100;
}

const AA_TEXT = 4.5;
const AA_LARGE = 3;

describe("the club theme", () => {
  it("maps the nine club colours to MUI roles", () => {
    expect(theme.palette.mode).toBe("light");
    expect(theme.palette.primary.main).toBe(CLUB.oxfordBlue);
    expect(theme.palette.primary.light).toBe(CLUB.royalBlue);
    expect(theme.palette.secondary.main).toBe(CLUB.gold);
    expect(theme.palette.secondary.dark).toBe(CLUB.oldGold);
    expect(theme.palette.text.primary).toBe(CLUB.charcoal);
    expect(theme.palette.text.secondary).toBe(CLUB.charcoal70);
    expect(theme.palette.background.default).toBe(CLUB.ground);
    expect(theme.palette.background.paper).toBe(CLUB.white);
    expect(theme.palette.neutral.main).toBe(SEMANTIC.neutral.main);
  });

  it("enables CSS variables so SSR does not flash unstyled content", () => {
    expect(theme.vars).toBeDefined();
    expect(theme.vars?.palette.primary.main).toMatch(/^var\(--mui-/);
  });

  it("uses sentence-case buttons and the brief's type scale", () => {
    expect(theme.typography.button.textTransform).toBe("none");
    expect(theme.typography.h1.fontSize).toBe(28);
    expect(theme.typography.h2.fontSize).toBe(22);
    expect(theme.typography.h3.fontSize).toBe(17);
    expect(theme.typography.body1.fontSize).toBe(15);
    expect(theme.typography.body2.fontSize).toBe(13);
    expect(theme.typography.overline.letterSpacing).toBe("0.08em");
    expect(theme.shape.borderRadius).toBe(8);
  });

  /**
   * Every pair the comment block at the top of `theme.ts` records. The
   * expected figures are the ones written there; a change to either side has to
   * be a change to both.
   */
  const RECORDED: ReadonlyArray<[string, string, string, number]> = [
    ["Charcoal", CLUB.charcoal, CLUB.white, 16.7],
    ["Charcoal on ground", CLUB.charcoal, CLUB.ground, 15.32],
    ["Charcoal on Sky Blue", CLUB.charcoal, CLUB.skyBlue, 11.11],
    ["Charcoal on Gold", CLUB.charcoal, CLUB.gold, 6.12],
    ["Charcoal on Ochre", CLUB.charcoal, CLUB.ochre, 9.43],
    ["Charcoal on Lemon", CLUB.charcoal, CLUB.lemon, 13.91],
    ["Secondary text", CLUB.charcoal70, CLUB.white, 7.18],
    ["Secondary text on ground", CLUB.charcoal70, CLUB.ground, 6.58],
    ["White on Oxford Blue", CLUB.white, CLUB.oxfordBlue, 16.05],
    ["White on Oxford Blue dark", CLUB.white, CLUB.oxfordBlueDark, 18.06],
    ["White on Royal Blue", CLUB.white, CLUB.royalBlue, 8.82],
    ["Sky Blue on Oxford Blue", CLUB.skyBlue, CLUB.oxfordBlue, 10.67],
    ["Oxford Blue on Gold", CLUB.oxfordBlue, CLUB.gold, 5.88],
    ["Royal Blue on white", CLUB.royalBlue, CLUB.white, 8.82],
    ["Royal Blue on ground", CLUB.royalBlue, CLUB.ground, 8.09],
    ["Old Gold on white", CLUB.oldGold, CLUB.white, 4.57],
    ["White on success", CLUB.white, SEMANTIC.success.main, 6.19],
    ["White on warning", CLUB.white, SEMANTIC.warning.main, 5.43],
    ["White on error", CLUB.white, SEMANTIC.error.main, 6.54],
    ["White on info", CLUB.white, SEMANTIC.info.main, 8.82],
    ["White on neutral", CLUB.white, SEMANTIC.neutral.main, 7.18],
    ["Success on tint", SEMANTIC.success.main, SEMANTIC.success.light, 5.3],
    ["Warning on tint", SEMANTIC.warning.main, SEMANTIC.warning.light, 4.84],
    ["Error on tint", SEMANTIC.error.main, SEMANTIC.error.light, 5.5],
    ["Info on tint", SEMANTIC.info.main, SEMANTIC.info.light, 7.35],
    ["Neutral on tint", SEMANTIC.neutral.main, SEMANTIC.neutral.light, 5.97],
    ["Charcoal on success tint", CLUB.charcoal, SEMANTIC.success.light, 14.32],
    ["Charcoal on warning tint", CLUB.charcoal, SEMANTIC.warning.light, 14.89],
    ["Charcoal on error tint", CLUB.charcoal, SEMANTIC.error.light, 14.05],
    ["Charcoal on info tint", CLUB.charcoal, SEMANTIC.info.light, 13.92],
    ["Charcoal on neutral tint", CLUB.charcoal, SEMANTIC.neutral.light, 13.9],
  ];

  it.each(RECORDED)("%s meets AA at the recorded ratio", (_name, fg, bg, recorded) => {
    const measured = contrast(fg, bg);
    expect(measured).toBe(recorded);
    expect(measured).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("keeps the forbidden pairs out of the palette's text roles", () => {
    // These fail AA and are recorded as forbidden. If one ever becomes a text
    // role the theme has to say why.
    expect(contrast(CLUB.white, CLUB.gold)).toBeLessThan(AA_LARGE);
    expect(contrast(CLUB.white, CLUB.skyBlue)).toBeLessThan(AA_LARGE);
    expect(contrast(CLUB.royalBlue, CLUB.oxfordBlue)).toBeLessThan(AA_LARGE);
    expect(theme.palette.secondary.contrastText).toBe(CLUB.charcoal);
    expect(theme.palette.secondary.contrastText).not.toBe(CLUB.white);
  });

  it("puts every filled semantic chip on a colour white text can be read on", () => {
    for (const key of ["success", "warning", "error", "info", "neutral"] as const) {
      expect(theme.palette[key].contrastText).toBe(CLUB.white);
      expect(contrast(CLUB.white, theme.palette[key].main)).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });
});
