import { describe, expect, it } from "vitest";
import type { RosterBoardRow } from "@/lib/services/roster-board";
import { buildColumns } from "./board-columns";
import { applyBoard, displayOf, filterOptions, NOT_RECORDED, onboardingLabel } from "./board-data";

const POSITION_OPTIONS = {
  offence: [{ code: "QB", label: "Quarterback" }],
  defence: [{ code: "CB", label: "Cornerback" }],
  specialTeams: [{ code: "KO", label: "Kickoff" }],
};

function row(overrides: Partial<RosterBoardRow> = {}): RosterBoardRow {
  return {
    membershipId: "m1",
    personId: "p1",
    displayName: "Avery Fielding",
    aliases: [],
    status: "active",
    entry: "returning",
    college: null,
    matriculationYear: null,
    expectedGraduationYear: null,
    degreeField: null,
    hasMobile: false,
    hasEmail: false,
    missingCount: 0,
    phoneForCall: null,
    itemsTotal: 0,
    itemsResolved: 0,
    requiredOutstanding: 0,
    offencePosition: null,
    defencePosition: null,
    specialTeamsPosition: null,
    blueNumbers: [],
    whiteNumbers: [],
    coachGroup: null,
    formalwear: { tie: false, bowtie: false, socks: false },
    blues: "None",
    eligibility: null,
    availability: null,
    ...overrides,
  };
}

const COLUMNS = buildColumns(POSITION_OPTIONS);
const STATUS_COLUMN = COLUMNS.find((c) => c.key === "status")!;
const COLLEGE_COLUMN = COLUMNS.find((c) => c.key === "college")!;
const MISSING_COLUMN = COLUMNS.find((c) => c.key === "missing")!;

describe("applyBoard — search, filter and sort together", () => {
  const rows = [
    row({ membershipId: "1", displayName: "Bertram Fielding", status: "active", missingCount: 0 }),
    row({ membershipId: "2", displayName: "Samira Quinn", status: "onboarding", missingCount: 2 }),
    row({ membershipId: "3", displayName: "Ari", status: "active", missingCount: 1 }),
  ];

  it("finds a player by a substring of their display name", () => {
    const applied = applyBoard(rows, {
      search: "Quinn",
      filters: {},
      sort: { key: "displayName", direction: "asc" },
    });
    expect(applied.visible.map((r) => r.membershipId)).toEqual(["2"]);
  });

  /**
   * LAN186-F1: the board's search has to find a player by an alias that is
   * **not** their display name — `person_aliases`, the same substrate
   * `person-record.ts`'s `searchPeople` already reads. "Sam" here is a
   * substring of the alias only; it appears nowhere in either row's display
   * name, so a match proves the alias was actually searched rather than the
   * name coincidentally containing it.
   */
  it("finds a player by an alias that is not their display name", () => {
    const withAliases = [
      row({ membershipId: "1", displayName: "Bertram Fielding", aliases: [] }),
      row({ membershipId: "2", displayName: "Samira Quinn", aliases: ["Sammy"] }),
      row({ membershipId: "3", displayName: "Ari", aliases: [] }),
    ];
    const applied = applyBoard(withAliases, {
      search: "Sammy",
      filters: {},
      sort: { key: "displayName", direction: "asc" },
    });
    expect(applied.visible.map((r) => r.membershipId)).toEqual(["2"]);
  });

  it("combines onboarding-incomplete-style and status filters — acceptance criterion 10", () => {
    const applied = applyBoard(rows, {
      search: "",
      filters: { status: "active", missing: "Yes" },
      sort: { key: "displayName", direction: "asc" },
    });
    expect(applied.visible.map((r) => r.membershipId)).toEqual(["3"]);
    expect(applied.isFiltered).toBe(true);
    expect(applied.activeFilters).toEqual([
      ["status", "active"],
      ["missing", "Yes"],
    ]);
  });

  it("sorts by name and flips with direction", () => {
    const asc = applyBoard(rows, {
      search: "",
      filters: {},
      sort: { key: "displayName", direction: "asc" },
    });
    expect(asc.visible.map((r) => r.displayName)).toEqual([
      "Ari",
      "Bertram Fielding",
      "Samira Quinn",
    ]);
    const desc = applyBoard(rows, {
      search: "",
      filters: {},
      sort: { key: "displayName", direction: "desc" },
    });
    expect(desc.visible.map((r) => r.displayName)).toEqual([
      "Samira Quinn",
      "Bertram Fielding",
      "Ari",
    ]);
  });

  it("sorts a column with a missing value last in either direction", () => {
    const withGaps = [
      row({ membershipId: "a", college: "Wadham" }),
      row({ membershipId: "b", college: null }),
      row({ membershipId: "c", college: "Balliol" }),
    ];
    const asc = applyBoard(withGaps, {
      search: "",
      filters: {},
      sort: { key: "college", direction: "asc" },
    });
    expect(asc.visible.map((r) => r.membershipId)).toEqual(["c", "a", "b"]);
    const desc = applyBoard(withGaps, {
      search: "",
      filters: {},
      sort: { key: "college", direction: "desc" },
    });
    expect(desc.visible.map((r) => r.membershipId)).toEqual(["a", "c", "b"]);
  });

  it("reports nothing filtered when search and filters are both empty", () => {
    const applied = applyBoard(rows, {
      search: "",
      filters: {},
      sort: { key: "displayName", direction: "asc" },
    });
    expect(applied.isFiltered).toBe(false);
    expect(applied.visible).toHaveLength(3);
  });
});

describe("filterOptions", () => {
  it("offers the fixed set for a column with one, e.g. Status", () => {
    expect(filterOptions(STATUS_COLUMN, [])).toEqual([
      "onboarding",
      "active",
      "inactive",
      "departed",
      "archived",
    ]);
  });

  it("derives options from the data for a free column, e.g. College, with Not recorded when a row has none", () => {
    const rows = [row({ college: "Wadham" }), row({ college: null }), row({ college: "Balliol" })];
    expect(filterOptions(COLLEGE_COLUMN, rows)).toEqual(["Balliol", "Wadham", NOT_RECORDED]);
  });

  it("offers Yes/No for Missing regardless of the data", () => {
    expect(filterOptions(MISSING_COLUMN, [])).toEqual(["Yes", "No"]);
  });
});

describe("displayOf — REQ-not-recorded", () => {
  it("never renders a blank or a default for an absent value", () => {
    expect(displayOf(row({ college: null }), COLLEGE_COLUMN)).toBe(NOT_RECORDED);
  });

  it("renders the value when present", () => {
    expect(displayOf(row({ college: "Wadham" }), COLLEGE_COLUMN)).toBe("Wadham");
  });
});

describe("onboardingLabel", () => {
  it("distinguishes no items, complete, outstanding and non-blocking", () => {
    expect(onboardingLabel(row({ itemsTotal: 0 }))).toBe("No items configured");
    expect(onboardingLabel(row({ itemsTotal: 3, itemsResolved: 3 }))).toBe("Complete");
    expect(onboardingLabel(row({ itemsTotal: 3, itemsResolved: 1, requiredOutstanding: 2 }))).toBe(
      "2 outstanding",
    );
    expect(onboardingLabel(row({ itemsTotal: 3, itemsResolved: 2, requiredOutstanding: 0 }))).toBe(
      "1 outstanding, none blocking",
    );
  });
});
