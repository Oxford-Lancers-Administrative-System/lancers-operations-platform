/**
 * LAN-211's own acceptance criteria, as tests.
 *
 * The two that matter most are the ones the ticket writes as requirements
 * rather than as behaviour: "an existing stored E.164 number round-trips
 * through the control without corruption, proved by test", and "what is stored
 * is still E.164 from the existing normaliser, and no second normaliser is
 * introduced". The first is the round-trip block below; the second is why
 * every expectation here is stated in terms of what `validatePhoneNumber`
 * finally returns, rather than in terms of a shape this module invented.
 *
 * Pure — no database, no rendering.
 */
import { describe, expect, it } from "vitest";

import {
  CALLING_COUNTRIES,
  DEFAULT_CALLING_CODE,
  EMPTY_PHONE_PARTS,
  joinPhoneParts,
  splitPhoneNumber,
  validatePhoneParts,
} from "./phone-parts";
import { validatePhoneNumber } from "./person-validation";

/** The club's own synthetic number. Ofcom reserves 07700 900xxx for exactly this. */
const UK_NATIONAL = "7700900123";
const UK_E164 = "447700900123";

describe("CALLING_COUNTRIES", () => {
  it("offers the United Kingdom first, because that is the club's default", () => {
    expect(CALLING_COUNTRIES[0]?.callingCode).toBe(DEFAULT_CALLING_CODE);
    expect(CALLING_COUNTRIES[0]?.name).toBe("United Kingdom");
  });

  it("carries no duplicate ISO codes", () => {
    const seen = new Set(CALLING_COUNTRIES.map((c) => c.iso));
    expect(seen.size).toBe(CALLING_COUNTRIES.length);
  });

  it("gives every country a digits-only calling code", () => {
    for (const country of CALLING_COUNTRIES) {
      expect(country.callingCode).toMatch(/^[0-9]{1,3}$/);
    }
  });
});

describe("splitPhoneNumber", () => {
  it("splits a stored E.164 value into the dropdown and the number box", () => {
    expect(splitPhoneNumber(UK_E164)).toEqual({
      callingCode: "44",
      nationalNumber: UK_NATIONAL,
    });
  });

  it("splits a number written with a + and spaces", () => {
    expect(splitPhoneNumber("+44 7700 900123")).toEqual({
      callingCode: "44",
      nationalNumber: UK_NATIONAL,
    });
  });

  it("splits the 00 international prefix the club's data also uses", () => {
    expect(splitPhoneNumber("0044 7700 900123")).toEqual({
      callingCode: "44",
      nationalNumber: UK_NATIONAL,
    });
  });

  it("drops the UK trunk zero from a number written in national form", () => {
    expect(splitPhoneNumber("07700 900123")).toEqual({
      callingCode: "44",
      nationalNumber: UK_NATIONAL,
    });
  });

  it("recognises another country's code", () => {
    // Ireland, +353.
    expect(splitPhoneNumber("+353851234567")).toEqual({
      callingCode: "353",
      nationalNumber: "851234567",
    });
  });

  it("prefers the longest matching calling code", () => {
    // `353` and `35` would both be prefixes if `35` were ever added; `44`
    // must never be read as `4`.
    expect(splitPhoneNumber("+447700900123").callingCode).toBe("44");
    expect(splitPhoneNumber("+35318001234").callingCode).toBe("353");
  });

  it("is an empty control on the club's own country for a blank value", () => {
    expect(splitPhoneNumber("")).toEqual(EMPTY_PHONE_PARTS);
    expect(splitPhoneNumber(null)).toEqual(EMPTY_PHONE_PARTS);
    expect(splitPhoneNumber(undefined)).toEqual(EMPTY_PHONE_PARTS);
    expect(EMPTY_PHONE_PARTS.callingCode).toBe(DEFAULT_CALLING_CODE);
  });

  it("shows a value it cannot split whole, rather than reinterpreting it", () => {
    // `contact_points.raw_value` is unvalidated at intake by design. A note in
    // the phone column is somebody's problem to look at, not this module's to
    // silently rewrite into digits.
    expect(splitPhoneNumber("ask Sam")).toEqual({
      callingCode: DEFAULT_CALLING_CODE,
      nationalNumber: "ask Sam",
    });
  });

  it("keeps a real country the dropdown does not carry whole", () => {
    // +260 (Zambia) is not in the list. Splitting it would put digits in the
    // wrong box; showing it whole tells the truth about what is on file.
    const parts = splitPhoneNumber("+260971234567");
    expect(parts.nationalNumber).toBe("+260971234567");
  });
});

describe("joinPhoneParts", () => {
  it("produces an explicit international number", () => {
    expect(joinPhoneParts("44", UK_NATIONAL)).toBe(`+44${UK_NATIONAL}`);
  });

  it("removes the domestic trunk prefix once a country has been picked", () => {
    // Otherwise `07700 900123` picked against the United Kingdom becomes
    // `+4407700900123`, which is nobody's number.
    expect(joinPhoneParts("44", "07700 900123")).toBe(`+44${UK_NATIONAL}`);
  });

  it("keeps every digit for a country with no trunk prefix", () => {
    // The North American plan has none, so a leading digit is a real digit.
    expect(joinPhoneParts("1", "2025550143")).toBe("+12025550143");
  });

  it("is empty for a blank number, so a caller can tell blank from wrong", () => {
    expect(joinPhoneParts("44", "")).toBe("");
    expect(joinPhoneParts("44", "   ")).toBe("");
  });

  it("passes something that is not a number through untouched, to be refused once", () => {
    // The refusal belongs to `validatePhoneNumber`, not to this function.
    expect(joinPhoneParts("44", "ask Sam")).toBe("ask Sam");
    expect(validatePhoneNumber(joinPhoneParts("44", "ask Sam")).valid).toBe(false);
  });
});

describe("round trip — LAN-211: an existing stored number is never corrupted", () => {
  const storedValues = [UK_E164, "447700900456", "447911123456", "353851234567", "12025550143"];

  it.each(storedValues)("%s survives split → join → normalise unchanged", (stored) => {
    const parts = splitPhoneNumber(stored);
    const joined = joinPhoneParts(parts.callingCode, parts.nationalNumber);
    const result = validatePhoneNumber(joined);
    expect(result.valid).toBe(true);
    expect(result.e164).toBe(stored);
  });

  it("normalises the two forms Brian named to the same stored value", () => {
    // LAN-275's own verification line: "+44 7700 900123 and 07700 900123
    // normalise to the same stored value".
    const typedInternational = splitPhoneNumber("+44 7700 900123");
    const typedNational = splitPhoneNumber("07700 900123");

    const a = validatePhoneNumber(
      joinPhoneParts(typedInternational.callingCode, typedInternational.nationalNumber),
    );
    const b = validatePhoneNumber(
      joinPhoneParts(typedNational.callingCode, typedNational.nationalNumber),
    );

    expect(a.e164).toBe(UK_E164);
    expect(b.e164).toBe(UK_E164);
    expect(a.e164).toBe(b.e164);
  });

  it("survives a re-edit that changes nothing", () => {
    // The failure LAN-211 names: "never corrupt one on an unrelated edit."
    let value = UK_E164;
    for (let pass = 0; pass < 5; pass += 1) {
      const parts = splitPhoneNumber(value);
      value = validatePhoneNumber(joinPhoneParts(parts.callingCode, parts.nationalNumber)).e164!;
    }
    expect(value).toBe(UK_E164);
  });
});

describe("validatePhoneParts — naming which half is wrong", () => {
  it("accepts a good pair and names no part", () => {
    const result = validatePhoneParts("44", UK_NATIONAL);
    expect(result.valid).toBe(true);
    expect(result.part).toBeNull();
    expect(result.e164).toBe(UK_E164);
  });

  it("accepts the national form with its trunk zero", () => {
    expect(validatePhoneParts("44", "07700 900123").e164).toBe(UK_E164);
  });

  it("names the country box when no code has been picked", () => {
    const result = validatePhoneParts("", UK_NATIONAL);
    expect(result.valid).toBe(false);
    expect(result.part).toBe("country");
    expect(result.message).toBe("Choose the country code.");
  });

  it("names the number box when it is blank", () => {
    const result = validatePhoneParts("44", "");
    expect(result.valid).toBe(false);
    expect(result.part).toBe("number");
    expect(result.rule).toBe("phone_blank");
  });

  it("names the number box, and the country code, for a wrong digit count", () => {
    // Source Data Analysis §11.1: the club's real data contains numbers one
    // digit short, and this is the case `toE164` exists to refuse.
    const result = validatePhoneParts("44", "770090012");
    expect(result.valid).toBe(false);
    expect(result.part).toBe("number");
    expect(result.rule).toBe("phone_wrong_length");
    expect(result.message).toContain("+44");
  });

  it("names the number box for something that is not digits", () => {
    const result = validatePhoneParts("44", "ask Sam");
    expect(result.valid).toBe(false);
    expect(result.part).toBe("number");
    expect(result.message).toContain("digits");
  });

  it("never reaches the ambiguous-country refusal, because the code is always explicit", () => {
    // The one refusal the split control makes structurally unreachable: a
    // number with no country code cannot be entered any more.
    for (const country of CALLING_COUNTRIES) {
      const result = validatePhoneParts(country.callingCode, "7700900123");
      expect(result.rule).not.toBe("phone_country_code_required");
    }
  });
});
