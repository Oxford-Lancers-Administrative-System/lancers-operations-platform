import { describe, expect, it } from "vitest";
import { describeWhatsappSeamConsequence } from "./person-whatsapp-seam";

describe("describeWhatsappSeamConsequence", () => {
  it("warns, naming the old number and the season, when the answer is true", () => {
    const result = describeWhatsappSeamConsequence("+44 7700 900412", "2026-27", true);
    expect(result.warn).toBe(true);
    expect(result.message).toContain("+44 7700 900412");
    expect(result.message).toContain("2026-27");
    expect(result.message).toContain("rejoin");
    // Never claims anything about the new number — REQ-whatsapp-seam.
    expect(result.message).not.toMatch(/new number (is|is not)/i);
  });

  it("shows no banner when the answer is false", () => {
    expect(describeWhatsappSeamConsequence("+44 7700 900412", "2026-27", false)).toEqual({
      warn: false,
      message: null,
    });
  });

  it("shows no banner when the answer is not known", () => {
    expect(describeWhatsappSeamConsequence("+44 7700 900412", "2026-27", null)).toEqual({
      warn: false,
      message: null,
    });
  });
});
