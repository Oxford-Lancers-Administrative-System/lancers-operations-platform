/**
 * `DEC-w2-09` through `DEC-w2-11`, and LAN-183's acceptance criterion that
 * "every correct form of a number saves" while "malformed emails and numbers
 * are refused per field, naming the rule". Pure — no database, no mocks.
 */
import { describe, expect, it } from "vitest";

import {
  DEFAULT_CALLING_CODE,
  validateAcademicYear,
  validateDateOfBirth,
  validateEmailAddress,
  validatePhoneNumber,
} from "./person-validation";

describe("validateEmailAddress", () => {
  it("accepts an ordinary address", () => {
    const result = validateEmailAddress("bertram.fielding@example.com");
    expect(result.valid).toBe(true);
    expect(result.rule).toBe("email_well_formed");
  });

  it("refuses a blank value, naming the rule", () => {
    const result = validateEmailAddress("   ");
    expect(result.valid).toBe(false);
    expect(result.rule).toBe("email_blank");
  });

  it.each(["not-an-email", "missing-at.example.com", "two@@example.com", "trailing@space "])(
    "refuses %s as not well formed",
    (value) => {
      const result = validateEmailAddress(value);
      expect(result.valid).toBe(false);
      expect(result.rule).toBe("email_not_well_formed");
    },
  );
});

describe("validatePhoneNumber — every correct form saves", () => {
  it.each([
    ["+44 7700 900123", "447700900123"],
    ["+447700900123", "447700900123"],
    ["0044 7700 900123", "447700900123"],
    ["07700 900123", "447700900123"],
    ["07700900123", "447700900123"],
    ["44 7700 900123", "447700900123"],
  ])("accepts %s", (raw, expectedE164) => {
    const result = validatePhoneNumber(raw);
    expect(result.valid).toBe(true);
    expect(result.rule).toBe("phone_e164_convertible");
    expect(result).toHaveProperty("e164", expectedE164);
  });

  it("accepts a correct number from another country, written with its own country code", () => {
    // A French mobile number, +33 6 12 34 56 78 — no length table for "33",
    // so the generic 8–15 digit range applies and nothing narrows it further.
    const result = validatePhoneNumber("+33 6 12 34 56 78");
    expect(result.valid).toBe(true);
    expect(result).toHaveProperty("e164", "33612345678");
  });

  it("accepts a US number written with its country code", () => {
    const result = validatePhoneNumber("+1 202 555 0173");
    expect(result.valid).toBe(true);
    expect(result).toHaveProperty("e164", "12025550173");
  });

  it("defaults a bare UK national number to the club's own calling code", () => {
    expect(DEFAULT_CALLING_CODE).toBe("44");
    const result = validatePhoneNumber("07911 123456");
    expect(result.valid).toBe(true);
    expect(result).toHaveProperty("e164", "447911123456");
  });
});

describe("validatePhoneNumber — the negative cases are their own acceptance criteria", () => {
  it("refuses a blank value", () => {
    const result = validatePhoneNumber("");
    expect(result.valid).toBe(false);
    expect(result.rule).toBe("phone_blank");
  });

  it("refuses text that is not phone-shaped", () => {
    const result = validatePhoneNumber("ask Sam");
    expect(result.valid).toBe(false);
    expect(result.rule).toBe("phone_not_numeric");
  });

  it("refuses an email typed into the phone field", () => {
    const result = validatePhoneNumber("bertram@example.com");
    expect(result.valid).toBe(false);
    expect(result.rule).toBe("phone_not_numeric");
  });

  it("refuses a UK number one digit short — Source Data Analysis §11.1", () => {
    const result = validatePhoneNumber("07700 90012");
    expect(result.valid).toBe(false);
    expect(result.rule).toBe("phone_wrong_length");
  });

  it("refuses a bare national number with no leading 0 and no country code", () => {
    // Ambiguous by DEC-w2-11: nothing says which country "7911123456" is in.
    const result = validatePhoneNumber("7911123456");
    expect(result.valid).toBe(false);
    expect(result.rule).toBe("phone_country_code_required");
  });

  it("refuses a non-UK national number with no country code", () => {
    const result = validatePhoneNumber("2025550173");
    expect(result.valid).toBe(false);
    expect(result.rule).toBe("phone_country_code_required");
  });

  it("refuses something with far too few digits to be a number", () => {
    const result = validatePhoneNumber("+44 123");
    expect(result.valid).toBe(false);
    expect(result.rule).toBe("phone_wrong_length");
  });

  it("refuses something with far too many digits to be a number", () => {
    const result = validatePhoneNumber("+44 7700 900123 900123 900123");
    expect(result.valid).toBe(false);
    expect(result.rule).toBe("phone_wrong_length");
  });
});

// LAN-203, finding 3, Brian 2026-09-01: matriculation year and expected
// graduation were "parsed leniently; unparsable input is simply not
// recorded" -- this validates instead, on the same per-field, named-rule
// shape every other function in this module returns.
describe("validateAcademicYear", () => {
  it("accepts a plain four-digit year", () => {
    const result = validateAcademicYear("2024", "Matriculation year");
    expect(result.valid).toBe(true);
  });

  it("refuses a blank value, naming the field's own label", () => {
    const result = validateAcademicYear("   ", "Matriculation year");
    expect(result.valid).toBe(false);
    expect(result.rule).toBe("year_blank");
    expect(result.message).toContain("Matriculation year");
  });

  it("refuses non-numeric text instead of silently discarding it", () => {
    const result = validateAcademicYear("twenty-twenty-four", "Expected graduation");
    expect(result.valid).toBe(false);
    expect(result.rule).toBe("year_not_numeric");
    expect(result.message).toContain("Expected graduation");
  });

  it("refuses a year far outside any plausible range", () => {
    const result = validateAcademicYear("3050", "Expected graduation");
    expect(result.valid).toBe(false);
    expect(result.rule).toBe("year_out_of_range");
  });

  it("refuses a negative number written with a leading minus", () => {
    const result = validateAcademicYear("-2024", "Matriculation year");
    expect(result.valid).toBe(false);
    expect(result.rule).toBe("year_not_numeric");
  });
});

/**
 * LAN-245 and LAN-258 — the one rule both the player's questionnaire and the
 * operator's edit form ask before offering a save. `today` is pinned so the
 * boundary cases are the boundary cases and not whatever day CI runs on.
 */
describe("validateDateOfBirth", () => {
  const TODAY = new Date("2026-09-09T14:02:00Z");

  it("accepts an ordinary date of birth", () => {
    const result = validateDateOfBirth("2005-03-11", TODAY);
    expect(result.valid).toBe(true);
    expect(result.rule).toBe("date_of_birth_in_the_past");
  });

  it("refuses a date in the future, naming the database's own rule", () => {
    const result = validateDateOfBirth("2030-12-31", TODAY);
    expect(result.valid).toBe(false);
    expect(result.rule).toBe("people_date_of_birth_in_the_past");
    expect(result.message).toBe("A date of birth has to be in the past.");
  });

  it("refuses today itself — the constraint is strictly before today", () => {
    const result = validateDateOfBirth("2026-09-09", TODAY);
    expect(result.valid).toBe(false);
    expect(result.rule).toBe("people_date_of_birth_in_the_past");
  });

  it("accepts yesterday, so the boundary refuses one day and not two", () => {
    expect(validateDateOfBirth("2026-09-08", TODAY).valid).toBe(true);
  });

  it("refuses a blank value rather than treating it as a valid date", () => {
    const result = validateDateOfBirth("   ", TODAY);
    expect(result.valid).toBe(false);
    expect(result.rule).toBe("date_of_birth_blank");
  });

  it("refuses a value that is not written as a date at all", () => {
    const result = validateDateOfBirth("11 March 2005", TODAY);
    expect(result.valid).toBe(false);
    expect(result.rule).toBe("date_of_birth_not_a_date");
  });

  it("refuses a day that does not exist in its month, rather than rolling it forward", () => {
    const result = validateDateOfBirth("2005-02-30", TODAY);
    expect(result.valid).toBe(false);
    expect(result.rule).toBe("date_of_birth_not_a_date");
  });

  it("accepts 29 February in a leap year", () => {
    expect(validateDateOfBirth("2004-02-29", TODAY).valid).toBe(true);
  });

  it("refuses a year no living person was born in — a typed or picked typo", () => {
    const result = validateDateOfBirth("0002-01-01", TODAY);
    expect(result.valid).toBe(false);
    expect(result.rule).toBe("date_of_birth_out_of_range");
  });
});
