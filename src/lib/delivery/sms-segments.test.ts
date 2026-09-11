import { describe, expect, it } from "vitest";

import { isGsm7, measureSms, nonGsm7Characters } from "./sms-segments";

describe("GSM-7 membership", () => {
  it("accepts plain ASCII copy, line breaks and the pound sign", () => {
    expect(isGsm7("Oxford Lancers: Sam, practice Thu 18 Sep 19:00.\nYes: https://x/a/b\n£5")).toBe(
      true,
    );
  });

  it("names the characters that would force UCS-2, once each", () => {
    expect(nonGsm7Characters("a — b — c “quoted” 🙂")).toEqual(["—", "“", "”", "🙂"]);
  });
});

describe("segment arithmetic", () => {
  it("fits 160 GSM-7 characters in one segment and splits at 153 after that", () => {
    expect(measureSms("a".repeat(160)).segments).toBe(1);
    expect(measureSms("a".repeat(161)).segments).toBe(2);
    expect(measureSms("a".repeat(306)).segments).toBe(2);
    expect(measureSms("a".repeat(307)).segments).toBe(3);
  });

  it("charges two septets for an extension-table character", () => {
    const measured = measureSms("a".repeat(158) + "{");
    expect(measured.units).toBe(160);
    expect(measured.segments).toBe(1);
    expect(measureSms("a".repeat(159) + "{").segments).toBe(2);
  });

  it("drops the whole message to UCS-2 for one em dash", () => {
    const measured = measureSms("a".repeat(100) + "—");
    expect(measured.encoding).toBe("ucs2");
    expect(measured.segments).toBe(2);
    expect(measured.offenders).toEqual(["—"]);
  });

  it("counts an empty body as zero segments", () => {
    expect(measureSms("").segments).toBe(0);
  });
});
