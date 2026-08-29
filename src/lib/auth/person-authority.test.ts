/**
 * `REQ-authority`, `REQ-restricted-fields`, `Q-4`. LAN-183's acceptance
 * criterion: "a role outside the four offices reaches nothing: the restricted
 * fields are absent from the payload, proved by a test that inspects the
 * payload rather than the rendering." Pure — no database.
 */
import { describe, expect, it } from "vitest";

import { capabilityRoleCodes } from "./capabilities";
import {
  categoriesGranted,
  holdsFullPersonRecordAuthority,
  PERSON_CATEGORY_CAPABILITY,
  PERSON_FIELD_CATEGORIES,
  PERSON_RECORD_FIELD_CATEGORY,
  redactPersonRecord,
  roleCodesHoldCategory,
} from "./person-authority";

const FOUR_OFFICES = ["president", "vice_president", "secretary", "general_manager"];
const GRANTED = capabilityRoleCodes("person_record_authority");

const FULL_RECORD = {
  personId: "11111111-1111-1111-1111-111111111111",
  givenName: "Bertram",
  givenNameSource: null,
  familyName: "Fielding",
  familyNameSource: "Caspian Hallowfield",
  status: "active",
  college: "Merton",
  collegeSource: "Caspian Hallowfield",
  matriculationYear: 2023,
  matriculationYearSource: null,
  expectedGraduationYear: 2026,
  expectedGraduationYearSource: null,
  degreeField: "Materials Science",
  degreeFieldSource: null,
  dateOfBirth: "2005-01-01",
  dateOfBirthSource: null,
  emergencyContact: { givenName: "Jo", familyName: "Fielding", phone: "+447700900123" },
  contacts: [{ kind: "phone", rawValue: "+447700900123" }],
};

describe("the person-record capability — the four offices and the administrative seat", () => {
  it.each(FOUR_OFFICES)("grants every category to %s", (code) => {
    expect(holdsFullPersonRecordAuthority([code])).toBe(true);
  });

  it("grants nothing to a coaching seat, including contact — Q-4 verbatim", () => {
    expect(roleCodesHoldCategory(["head_coach"], "contact")).toBe(false);
    expect(categoriesGranted(["head_coach"]).size).toBe(0);
  });

  it("grants nothing to an operator holding no role at all", () => {
    expect(categoriesGranted([]).size).toBe(0);
  });

  it("is widened to it_officer, on the same LAN-124 precedent as every other capability", () => {
    expect(holdsFullPersonRecordAuthority(["it_officer"])).toBe(true);
  });

  it("reads role codes from the capability map, not a literal of its own", () => {
    // tests/capability-map-single-source.test.ts is the enforcement; this is
    // the same fact asserted from this module's own side — every category
    // resolves to exactly `capabilityRoleCodes("person_record_authority")`.
    expect(GRANTED.length).toBeGreaterThan(0);
    for (const category of PERSON_FIELD_CATEGORIES) {
      expect(PERSON_CATEGORY_CAPABILITY[category]).toBe("person_record_authority");
    }
  });
});

describe("redactPersonRecord — absent from the payload, not hidden in it", () => {
  it("returns the whole record to the four offices", () => {
    const visible = redactPersonRecord(FULL_RECORD, ["secretary"]);
    expect(visible).toEqual(FULL_RECORD);
  });

  it("strips date of birth and emergency contact for a role outside the four offices", () => {
    const visible = redactPersonRecord(FULL_RECORD, ["head_coach"]);
    expect(Object.keys(visible)).not.toContain("dateOfBirth");
    expect(Object.keys(visible)).not.toContain("dateOfBirthSource");
    expect(Object.keys(visible)).not.toContain("emergencyContact");
    expect(Object.keys(visible)).not.toContain("contacts");
    expect(Object.keys(visible)).not.toContain("college");
    expect(Object.keys(visible)).not.toContain("collegeSource");
    // Absent, not present-and-undefined: `in` reads own enumerable keys.
    expect("dateOfBirth" in visible).toBe(false);
    expect("dateOfBirthSource" in visible).toBe(false);
    expect("emergencyContact" in visible).toBe(false);
  });

  it("strips everything for a viewer holding no role at all", () => {
    const visible = redactPersonRecord(FULL_RECORD, []);
    expect(Object.keys(visible)).toEqual([]);
  });

  it("never emits a key this module has not named a category for", () => {
    const visible = redactPersonRecord({ ...FULL_RECORD, someFutureField: "x" }, FOUR_OFFICES);
    expect(Object.keys(visible)).not.toContain("someFutureField");
  });

  it("serialises with no restricted key present at all, for a coaching seat", () => {
    const visible = redactPersonRecord(FULL_RECORD, ["offence_coach"]);
    const serialised = JSON.stringify(visible);
    expect(serialised).not.toContain("dateOfBirth");
    expect(serialised).not.toContain("emergencyContact");
    expect(serialised).not.toContain("Fielding"); // the emergency contact's own family name
  });
});

describe("PERSON_RECORD_FIELD_CATEGORY — a derived caption is governed exactly as the value it describes", () => {
  // `Q-13`/LAN-184 added seven `*Source` keys with no `source` column of
  // their own — `readPersonRecord()` derives them from `audit_events`. Each
  // has to sit in the same category as the value field it is a caption for,
  // or a future partial-capability grant (`Q-4`'s own example — "coaching
  // seats may hold `contact`") could show *who supplied* a restricted fact to
  // a role that is refused the fact itself. Nothing distinguishes categories
  // behaviourally today (every category still reads one all-or-nothing
  // capability), so this asserts the table directly — the only way this gap
  // is provable before that day arrives.
  it.each([
    ["givenNameSource", "identity"],
    ["familyNameSource", "identity"],
    ["collegeSource", "academic"],
    ["matriculationYearSource", "academic"],
    ["expectedGraduationYearSource", "academic"],
    ["degreeFieldSource", "academic"],
    ["dateOfBirthSource", "restricted"],
  ])("%s is categorised %s, matching the field it captions", (key, category) => {
    expect(PERSON_RECORD_FIELD_CATEGORY[key]).toBe(category);
  });
});
