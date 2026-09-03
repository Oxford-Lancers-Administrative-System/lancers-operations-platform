/**
 * The shared phone and email predicates — LAN-215, B-007.
 *
 * `looksLikePhone` is tested as a table because B-007 names the exact five
 * shapes an operator's fix has to be proven against: a plain UK mobile, one
 * written with spaces, one with `+44`, a seven-digit nonsense string, and a
 * run of letters. It does not re-derive `toE164`'s own conversion table —
 * `src/lib/delivery/phone.test.ts` and `phone-shape.ts`'s own behaviour own
 * that — this file's job is proving the predicate answers correctly, not
 * re-proving the converter underneath it.
 */
import { describe, expect, it } from "vitest";

import { looksLikeEmail, looksLikePhone, EMAIL_SHAPE_MESSAGE, PHONE_SHAPE_MESSAGE } from "./contact";

describe("looksLikePhone", () => {
  it.each([
    ["a plain UK mobile", "07700900123", true],
    ["one written with spaces", "07700 900 123", true],
    ["one with +44", "+44 7700 900123", true],
    ["a seven-digit nonsense string", "1234567", false],
    ["a run of letters", "nonsense", false],
  ])("%s (%s) → %s", (_label, value, expected) => {
    expect(looksLikePhone(value)).toBe(expected);
  });

  it("refuses the exact nonsense Brian typed in — a bare seven-digit run", () => {
    // "I just popped in a nonsense number, and it allowed it in." The old
    // `looksLikePhone` accepted anything with seven or more digits; this is
    // the regression the fix exists to close.
    expect(looksLikePhone("1234567")).toBe(false);
  });

  it("refuses a number one digit short of a real UK mobile", () => {
    // The exact shape `roster-csv.ts` and the old validator both let through
    // on purpose. B-007 tightens it: a number that cannot reach E.164 can
    // never receive the welcome, so it is refused here even though the club's
    // real files contain it.
    expect(looksLikePhone("0770 900312")).toBe(false);
  });

  it("accepts a number with no country code that already carries the default calling code", () => {
    expect(looksLikePhone("447700900123")).toBe(true);
  });
});

describe("looksLikeEmail", () => {
  it("accepts an ordinary address", () => {
    expect(looksLikeEmail("avery.fielding@example.invalid")).toBe(true);
  });

  it("accepts the club's real, messy-but-genuine addresses — LAN-74 stays permissive here", () => {
    expect(looksLikeEmail("avery.fielding@example.ac.ox")).toBe(true);
    expect(looksLikeEmail(" avery.fielding@example.invalid ")).toBe(true);
  });

  it("refuses an address with no @", () => {
    expect(looksLikeEmail("avery.fielding.example.invalid")).toBe(false);
  });

  it("refuses an address with nothing before or after the @", () => {
    expect(looksLikeEmail("@example.invalid")).toBe(false);
    expect(looksLikeEmail("avery@")).toBe(false);
  });
});

describe("the two error sentences", () => {
  it("name what is wrong without narrating what to do next", () => {
    expect(PHONE_SHAPE_MESSAGE.length).toBeGreaterThan(10);
    expect(EMAIL_SHAPE_MESSAGE.length).toBeGreaterThan(10);
  });
});
