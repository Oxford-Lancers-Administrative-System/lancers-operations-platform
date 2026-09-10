/**
 * `REQ-required-set`. LAN-183's acceptance criterion: "the required set
 * differs by rung, and last name is required at every one of them." Pure — no
 * database.
 */
import { describe, expect, it } from "vitest";

import {
  type AssembledStatus,
  type PersonFactPresence,
  missingRequiredFields,
  requiredFieldsFor,
} from "./person-required";

const NOTHING_RECORDED: PersonFactPresence = {
  givenName: false,
  familyName: false,
  mobile: false,
  collegeEmail: false,
  personalEmail: false,
  college: false,
  matriculationYear: false,
  expectedGraduationYear: false,
  degreeField: false,
  dateOfBirth: false,
  emergencyContact: false,
};

const EVERYTHING_RECORDED: PersonFactPresence = {
  givenName: true,
  familyName: true,
  mobile: true,
  collegeEmail: true,
  personalEmail: true,
  college: true,
  matriculationYear: true,
  expectedGraduationYear: true,
  degreeField: true,
  dateOfBirth: true,
  emergencyContact: true,
};

describe("requiredFieldsFor — the set differs by rung", () => {
  it("a recruit needs first name, last name, mobile and a college email", () => {
    // LAN-268 supersedes LAN-246's three-field minimum: the college email is
    // the club's proof that a recruit is actually at the university.
    expect(requiredFieldsFor("recruit")).toEqual([
      "given_name",
      "family_name",
      "mobile",
      "college_email",
    ]);
  });

  it.each(["onboarding", "active", "inactive"] as const)(
    "a %s player needs the full academic and safety set",
    (status) => {
      expect(requiredFieldsFor(status)).toEqual([
        "given_name",
        "family_name",
        "mobile",
        "personal_email",
        "college_email",
        "college",
        "matriculation_year",
        "expected_graduation_year",
        "degree_field",
        "date_of_birth",
        "emergency_contact",
      ]);
    },
  );

  it.each(["departed", "archived", null] as AssembledStatus[])(
    "a coach, committee member or alumnus (status %s) needs the everyone-else set",
    (status) => {
      expect(requiredFieldsFor(status)).toEqual([
        "given_name",
        "family_name",
        "mobile",
        "personal_email",
      ]);
    },
  );

  it.each(["departed", "archived", null] as AssembledStatus[])(
    "never asks status %s for a college email",
    (status) => {
      // LAN-268, and the one place the tiers stopped nesting. This rung is
      // where a coach, a committee member and an alumnus land: none of them
      // walks through a door that collects a college address, and an
      // alumnus's expires around graduation, so chasing them for one would be
      // a queue row nobody could ever clear.
      expect(requiredFieldsFor(status)).not.toContain("college_email");
    },
  );

  it("asks a recruit and a player for a college email", () => {
    expect(requiredFieldsFor("recruit")).toContain("college_email");
    for (const status of ["onboarding", "active", "inactive"] as const) {
      expect(requiredFieldsFor(status)).toContain("college_email");
    }
  });

  it("last name is required at every rung", () => {
    const statuses: AssembledStatus[] = [
      "recruit",
      "onboarding",
      "active",
      "inactive",
      "departed",
      "archived",
      null,
    ];
    for (const status of statuses) {
      expect(requiredFieldsFor(status)).toContain("family_name");
    }
  });
});

describe("missingRequiredFields", () => {
  it("flags a missing last name for a recruit with only a first name and mobile", () => {
    const presence: PersonFactPresence = {
      ...NOTHING_RECORDED,
      givenName: true,
      mobile: true,
      collegeEmail: true,
    };
    expect(missingRequiredFields("recruit", presence)).toEqual(["family_name"]);
  });

  it("reports nothing missing when every required fact for the rung is present", () => {
    expect(missingRequiredFields("recruit", EVERYTHING_RECORDED)).toEqual([]);
    expect(missingRequiredFields("active", EVERYTHING_RECORDED)).toEqual([]);
    expect(missingRequiredFields(null, EVERYTHING_RECORDED)).toEqual([]);
  });

  it("never flags a field this rung does not require, however incomplete the record is", () => {
    // A recruit with nothing at all is missing only the recruit tier's four
    // fields — never date of birth or emergency contact, which this rung does
    // not ask for.
    const missing = missingRequiredFields("recruit", NOTHING_RECORDED);
    expect(missing).toEqual(["given_name", "family_name", "mobile", "college_email"]);
    expect(missing).not.toContain("date_of_birth");
    expect(missing).not.toContain("emergency_contact");
  });

  it("flags the full academic set for an active player recorded with nothing", () => {
    expect(missingRequiredFields("active", NOTHING_RECORDED)).toEqual(requiredFieldsFor("active"));
  });
});
