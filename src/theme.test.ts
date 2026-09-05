import { describe, expect, it } from "vitest";
import theme from "./theme";

describe("MUI baseline theme", () => {
  it("exposes the palette the app is built against", () => {
    expect(theme.palette.mode).toBe("light");
    expect(theme.palette.primary.main).toBe("#0b3d91");
  });

  it("enables CSS variables so SSR does not flash unstyled content", () => {
    // `cssVariables: true` makes MUI emit CSS custom properties, which is what
    // `theme.vars` exposes. Asserting on `vars` checks the effect, not the input.
    expect(theme.vars).toBeDefined();
    expect(theme.vars?.palette.primary.main).toMatch(/^var\(--mui-/);
  });
});
