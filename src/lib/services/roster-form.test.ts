// @vitest-environment node
/**
 * The BAFRA roster form's own shaping — LAN-267.
 *
 * Pure: everything asserted here is the arithmetic of the printed page, which
 * is where a defect would actually reach the officials. The read itself
 * (`readRosterFormDataIn`) is exercised against the database in
 * `tests/roster-form-generation.test.ts`, so this file opens no connection.
 *
 * ## Nothing from the linked template appears here
 *
 * LAN-267: "The linked template carries the current coaching staff's names and
 * BAFA numbers. Those are real people and real registration numbers: do not
 * copy them into the repo, fixtures, tests or this ticket." Every name and
 * number below is invented for this file.
 */
import { describe, expect, it } from "vitest";

import {
  formNameOf,
  missingNumberWarning,
  printedPlayerRows,
  ROSTER_FORM_FIRST_NUMBER,
  ROSTER_FORM_LAST_NUMBER,
  type RosterFormCoachRow,
  type RosterFormPlayer,
} from "./roster-form-shape";

function player(overrides: Partial<RosterFormPlayer> = {}): RosterFormPlayer {
  return {
    membershipId: `m-${overrides.jerseyNumber ?? "x"}`,
    personId: `p-${overrides.jerseyNumber ?? "x"}`,
    givenName: "Wren",
    familyName: "Bellamy",
    studentNumber: "1234567",
    jerseyNumber: 7,
    rsvp: "yes",
    ...overrides,
  };
}

function coach(overrides: Partial<RosterFormCoachRow> = {}): RosterFormCoachRow {
  return {
    personId: "c-1",
    givenName: "Ashby",
    familyName: "Quillon",
    bafaRegistrationNumber: "BAFA-000111",
    roleLabel: "Head Coach",
    roleCode: "HC",
    ...overrides,
  };
}

describe("formNameOf — the officials' own order", () => {
  it("puts the surname first", () => {
    expect(formNameOf({ givenName: "Wren", familyName: "Bellamy" })).toBe("Bellamy, Wren");
  });

  it("prints a first-name-only record as the first name alone", () => {
    // 26% of the club's real records are first-name-only (Source Data Analysis
    // §11.1), and `people.family_name` is nullable for that reason. A form row
    // reading ", Wren" would look like a defect to whoever reads it.
    expect(formNameOf({ givenName: "Wren", familyName: null })).toBe("Wren");
  });
});

describe("printedPlayerRows — one row per jersey number, blanks kept", () => {
  it("prints a row for every number from 1 to 94", () => {
    const rows = printedPlayerRows([]);
    expect(rows).toHaveLength(ROSTER_FORM_LAST_NUMBER - ROSTER_FORM_FIRST_NUMBER + 1);
    expect(rows[0]?.jerseyNumber).toBe(ROSTER_FORM_FIRST_NUMBER);
    expect(rows.at(-1)?.jerseyNumber).toBe(ROSTER_FORM_LAST_NUMBER);
  });

  it("leaves every unused number blank rather than closing the gap", () => {
    const rows = printedPlayerRows([player({ jerseyNumber: 7 })]);
    expect(rows.filter((row) => row.name !== null)).toHaveLength(1);
    expect(rows[6]).toEqual({ jerseyNumber: 7, name: "Bellamy, Wren", studentNumber: "1234567" });
    expect(rows[5]).toEqual({ jerseyNumber: 6, name: null, studentNumber: null });
  });

  it("puts each player in their own number's row, in jersey order", () => {
    const rows = printedPlayerRows([
      player({ jerseyNumber: 44, givenName: "Tam", familyName: "Ferrow" }),
      player({ jerseyNumber: 2, givenName: "Isla", familyName: "Crane" }),
    ]);
    expect(rows[1]?.name).toBe("Crane, Isla");
    expect(rows[43]?.name).toBe("Ferrow, Tam");
  });

  it("prints a blank student number rather than omitting the player", () => {
    const rows = printedPlayerRows([player({ jerseyNumber: 12, studentNumber: null })]);
    expect(rows[11]?.name).toBe("Bellamy, Wren");
    expect(rows[11]?.studentNumber).toBeNull();
  });

  it("leaves out a ticked player with no number in this kit — there is no row for them", () => {
    const rows = printedPlayerRows([player({ jerseyNumber: null })]);
    expect(rows.every((row) => row.name === null)).toBe(true);
  });

  it("untickng two players removes exactly their two rows", () => {
    // LAN-267's own acceptance: "untick two players, generate".
    const squad = [
      player({ jerseyNumber: 3, membershipId: "a" }),
      player({ jerseyNumber: 21, membershipId: "b" }),
      player({ jerseyNumber: 55, membershipId: "c" }),
      player({ jerseyNumber: 88, membershipId: "d" }),
    ];
    const dressed = squad.filter((p) => p.membershipId !== "b" && p.membershipId !== "d");
    const rows = printedPlayerRows(dressed);
    expect(rows.filter((row) => row.name !== null).map((row) => row.jerseyNumber)).toEqual([3, 55]);
  });
});

describe("missingNumberWarning — who the operator has to chase", () => {
  it("names a dressed player with no student number", () => {
    const warning = missingNumberWarning(
      [player({ jerseyNumber: 9, studentNumber: null, givenName: "Rue", familyName: "Marlow" })],
      [],
    );
    expect(warning.players).toEqual(["Marlow, Rue"]);
  });

  it("treats a blank-but-present student number as missing", () => {
    const warning = missingNumberWarning([player({ jerseyNumber: 9, studentNumber: "   " })], []);
    expect(warning.players).toHaveLength(1);
  });

  it("names a coach with no BAFA number — the half the officials need", () => {
    const warning = missingNumberWarning(
      [],
      [coach({ bafaRegistrationNumber: null, givenName: "Peregrine", familyName: "Nash" })],
    );
    expect(warning.coaches).toEqual(["Nash, Peregrine"]);
  });

  it("names a ticked player who will not appear at all, separately from the blanks", () => {
    // The failure that silently loses somebody: ticked, but with no number in
    // this kit, so no row on the form exists to print them in.
    const warning = missingNumberWarning(
      [player({ jerseyNumber: null, givenName: "Corin", familyName: "Vale" })],
      [],
    );
    expect(warning.notDressable).toEqual(["Vale, Corin"]);
    expect(warning.players).toEqual([]);
  });

  it("names a ticked player wearing a number the form has no row for", () => {
    // The club's own roster carries a 99, and the officials' form stops at 94.
    // Without this the player is on nobody's list: not on the form, and not in
    // the warning either.
    const warning = missingNumberWarning(
      [player({ jerseyNumber: 99, givenName: "Fintan", familyName: "Glenrothes" })],
      [],
    );
    expect(warning.notDressable).toEqual(["Glenrothes, Fintan"]);
    expect(printedPlayerRows([player({ jerseyNumber: 99 })]).every((r) => r.name === null)).toBe(
      true,
    );
  });

  it("says nothing when every number is on file", () => {
    const warning = missingNumberWarning([player({ jerseyNumber: 9 })], [coach()]);
    expect(warning).toEqual({ players: [], coaches: [], notDressable: [] });
  });
});
