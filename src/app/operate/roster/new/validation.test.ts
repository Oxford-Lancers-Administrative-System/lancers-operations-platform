/**
 * The intake form's shape checks. LAN-74, matrix row 10; LAN-215 (`W2`)
 * amended the required set.
 *
 * The interesting assertions here are the ones that prove these checks are
 * *permissive*. A validator that rejects a reversed top-level domain or a phone
 * number one digit short looks more rigorous and is actively wrong for this
 * club: those are real values in the real files, `contact_points.raw_value` has
 * no format constraint precisely so they survive, and a contact the system
 * refuses to store is a contact the club loses.
 *
 * So each check has a test for what it catches and a test for what it must let
 * through, and the second is the one that matters — except first name, last
 * name and mobile, which `W2`'s locked decision makes required at every tier
 * (`person-required.ts`'s recruit tier), joining first name as the form's own
 * required set.
 */
import { describe, expect, it } from "vitest";

import {
  EMAIL_SHAPE,
  EMPTY_VALUES,
  FAMILY_NAME_REQUIRED,
  GIVEN_NAME_REQUIRED,
  MOBILE_REQUIRED,
  PHONE_SHAPE,
  firstInvalidField,
  readIntakeValues,
  validateIntake,
  type IntakeFormValues,
} from "./validation";

/** Every required field filled with a valid value, so a test can override just the one it is about. */
function values(overrides: Partial<IntakeFormValues> = {}): IntakeFormValues {
  return {
    ...EMPTY_VALUES,
    givenName: "Avery",
    familyName: "Fielding",
    phone: "07700 900101",
    ...overrides,
  };
}

describe("the first name", () => {
  it("is required", () => {
    expect(validateIntake(values({ givenName: "" }))).toEqual({
      givenName: GIVEN_NAME_REQUIRED,
    });
  });

  it("is not satisfied by whitespace", () => {
    expect(validateIntake(values({ givenName: "   " }))).toEqual({
      givenName: GIVEN_NAME_REQUIRED,
    });
  });
});

describe("the last name", () => {
  it("is required — LAN-215, W2's locked decision", () => {
    expect(validateIntake(values({ familyName: "" }))).toEqual({
      familyName: FAMILY_NAME_REQUIRED,
    });
  });

  it("is not satisfied by whitespace", () => {
    expect(validateIntake(values({ familyName: "   " }))).toEqual({
      familyName: FAMILY_NAME_REQUIRED,
    });
  });
});

describe("first name, last name and mobile, filled in", () => {
  it("is enough — nothing else the form asks for is required", () => {
    expect(validateIntake(values())).toEqual({});
  });
});

describe("the email", () => {
  it("is optional", () => {
    expect(validateIntake(values({ email: "" }))).toEqual({});
  });

  it("catches an address with no @", () => {
    expect(validateIntake(values({ email: "avery.fielding.example.invalid" }))).toEqual({
      email: EMAIL_SHAPE,
    });
  });

  it("catches an address with nothing before or after the @", () => {
    expect(validateIntake(values({ email: "@example.invalid" }))).toEqual({ email: EMAIL_SHAPE });
    expect(validateIntake(values({ email: "avery@" }))).toEqual({ email: EMAIL_SHAPE });
  });

  it("accepts the club's real defects", () => {
    // A reversed TLD (SDA §11.1) and a trailing space — both present in the
    // seeded dataset because both are present in the club's workbooks.
    for (const email of [
      "avery.fielding@example.ac.ox",
      "avery.fielding@example.invalid ",
      " avery.fielding@example.invalid",
      "avery@localhost",
    ]) {
      expect(validateIntake(values({ email }))).toEqual({});
    }
  });
});

describe("the phone", () => {
  it("is required — LAN-215, W2's locked decision", () => {
    expect(validateIntake(values({ phone: "" }))).toEqual({ phone: MOBILE_REQUIRED });
  });

  it("catches something with no digits in it", () => {
    expect(validateIntake(values({ phone: "call the clubhouse" }))).toEqual({ phone: PHONE_SHAPE });
  });

  it("accepts every format the club actually writes", () => {
    for (const phone of [
      "07700 900101",
      "+44 7700 900101",
      "(07700) 900101",
      // One digit short — a real defect in the files, and still contactable
      // information somebody can correct later.
      "0770 900101",
    ]) {
      expect(validateIntake(values({ phone }))).toEqual({});
    }
  });
});

describe("firstInvalidField", () => {
  it("returns the first invalid field in screen order, not object order", () => {
    const errors = validateIntake(values({ givenName: "", email: "nope" }));
    // First name, last name, email, phone — the first name comes first.
    expect(firstInvalidField(errors)).toBe("givenName");
  });

  it("returns null when everything is valid", () => {
    expect(firstInvalidField({})).toBeNull();
  });
});

describe("readIntakeValues", () => {
  it("reads the four fields without altering them", () => {
    const data = new FormData();
    data.append("familyName", " Fielding ");
    data.append("givenName", "Avery");
    data.append("email", "avery@example.invalid ");
    data.append("intent", "check");

    expect(readIntakeValues(data)).toEqual({
      // Preserved exactly, including the spaces. Storing what was typed is the
      // whole point; trimming happens only inside a comparison.
      givenName: "Avery",
      familyName: " Fielding ",
      email: "avery@example.invalid ",
      phone: "",
    });
  });

  it("treats a missing field as empty rather than throwing", () => {
    expect(readIntakeValues(new FormData())).toEqual(EMPTY_VALUES);
  });
});
