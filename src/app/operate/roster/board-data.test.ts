import { describe, expect, it } from "vitest";
import type { RosterBoardRow } from "@/lib/services/roster-board";
import { buildColumns } from "./board-columns";
import {
  applyBoard,
  displayOf,
  filterOptions,
  NOT_RECORDED,
  onboardingLabel,
  optionListLabel,
} from "./board-data";

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
    bps: "No",
    onboardingItems: {},
    ...overrides,
  };
}

const COLUMNS = buildColumns(POSITION_OPTIONS);
const STATUS_COLUMN = COLUMNS.find((c) => c.key === "status")!;
const COLLEGE_COLUMN = COLUMNS.find((c) => c.key === "college")!;
const MISSING_COLUMN = COLUMNS.find((c) => c.key === "missing")!;
const OFFENCE_COLUMN = COLUMNS.find((c) => c.key === "offencePosition")!;
const ELIGIBILITY_COLUMN = COLUMNS.find((c) => c.key === "eligibility")!;
const SUBS_PAID_COLUMN = COLUMNS.find((c) => c.key === "subsPaid")!;
const SUBS_INVOICED_COLUMN = COLUMNS.find((c) => c.key === "subsInvoiced")!;
const KIT_DISTRIBUTED_COLUMN = COLUMNS.find((c) => c.key === "kitDistributed")!;
const BUCS_PLAY_COLUMN = COLUMNS.find((c) => c.key === "bucsPlay")!;

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

// D-002 (correction round 3, Q-14, Brian): "Subscription paid" is blank —
// nothing at all — until "Subscription invoiced" is itself complete. The
// board's own convention renders that blank as `NOT_RECORDED`, same as any
// other genuinely absent value, rather than a new rendering rule.
describe("displayOf — Subscription paid is blank until invoiced (D-002)", () => {
  it("reads Not recorded when Subscription invoiced is still pending, whatever its own stored status", () => {
    const withPending = row({
      onboardingItems: {
        subs_invoiced: { id: "i1", status: "pending" },
        subs_paid: { id: "i2", status: "pending" },
      },
    });
    expect(displayOf(withPending, SUBS_PAID_COLUMN)).toBe(NOT_RECORDED);
  });

  it("reads its own status once Subscription invoiced is complete", () => {
    const withInvoiced = row({
      onboardingItems: {
        subs_invoiced: { id: "i1", status: "complete" },
        subs_paid: { id: "i2", status: "waived" },
      },
    });
    expect(displayOf(withInvoiced, SUBS_PAID_COLUMN)).toBe("Waived");
  });
});

/**
 * LAN-186 items 7 and 9: a position column's stored value IS the season
 * vocabulary's code, so the fuller name `optionLabels` also carries must never
 * render — the reverse of every other select column, which shows the fuller
 * label and never the raw code beside it.
 */
describe("displayOf — positions show the code alone, never the full name (item 7)", () => {
  it('shows "QB", not "Quarterback", though the column carries both', () => {
    expect(displayOf(row({ offencePosition: "QB" }), OFFENCE_COLUMN)).toBe("QB");
  });

  it("still says Not recorded when nothing is assigned", () => {
    expect(displayOf(row({ offencePosition: null }), OFFENCE_COLUMN)).toBe(NOT_RECORDED);
  });
});

describe("displayOf — every other select column shows the label alone (item 9)", () => {
  it('shows "Eligible", never "eligible · Eligible"', () => {
    const text = displayOf(row({ eligibility: "eligible" }), ELIGIBILITY_COLUMN);
    expect(text).toBe("Eligible");
    expect(text).not.toContain("eligible ·");
  });
});

/**
 * Brian's walkthrough of the built board, correcting item 7's dropdown half:
 * "In the dropdown, it shouldn't just be the name. If it says QB, it should
 * be QB-quarterback." The cell half of item 7 (above) stands unchanged — only
 * an *open list of choices* pairs the code with the full name, read from the
 * column's own `optionLabels`, itself sourced from the season vocabulary (S3)
 * by `readPositionOptions()` — never a hardcoded map.
 */
describe("optionListLabel — a position's open list of choices pairs the code with the full name (walkthrough correction of item 7)", () => {
  it('shows "QB — Quarterback", not "QB" alone', () => {
    expect(optionListLabel(OFFENCE_COLUMN, "QB")).toBe("QB — Quarterback");
  });

  it("falls back to the code alone if the vocabulary carries no label for it", () => {
    expect(optionListLabel(OFFENCE_COLUMN, "ZZ")).toBe("ZZ");
  });
});

/**
 * Item 9 stands for every other select column: eligibility and availability's
 * value and label are the same word, so pairing them the way positions are
 * now paired would reintroduce exactly the `"eligible · Eligible"` echo this
 * round already removed.
 */
describe("optionListLabel — every other select column still shows the label alone (item 9 stands)", () => {
  it('shows "Eligible", never "eligible · Eligible"', () => {
    const text = optionListLabel(ELIGIBILITY_COLUMN, "eligible");
    expect(text).toBe("Eligible");
    expect(text).not.toContain("eligible ·");
  });
});

/**
 * D-002 (correction round 4, `WP-operator-record`, LAN-217) — the actual
 * defect Brian named: "Subscription invoiced is invoiced-or-not, never
 * Complete." Proves the board's own closed cell and open dropdown read the
 * per-item word, not the generic status label a flat map would produce.
 */
describe("displayOf / optionListLabel — the board reads each item's own word (D-002)", () => {
  it('shows "Invoiced", never the generic "Complete", for Subscription invoiced', () => {
    const invoiced = row({ onboardingItems: { subs_invoiced: { id: "i1", status: "complete" } } });
    expect(displayOf(invoiced, SUBS_INVOICED_COLUMN)).toBe("Invoiced");
    expect(displayOf(invoiced, SUBS_INVOICED_COLUMN)).not.toBe("Complete");
  });

  it('shows "Confirmed", never "Complete", for BUCS Play — "invited, claimed, confirmed"', () => {
    const confirmed = row({ onboardingItems: { bucs_play: { id: "i1", status: "complete" } } });
    expect(displayOf(confirmed, BUCS_PLAY_COLUMN)).toBe("Confirmed");
  });

  it("still shows Yes/No for Kit Distributed once the pre-conversion in rawValue is gone", () => {
    expect(
      displayOf(
        row({ onboardingItems: { kit_sorted: { id: "i1", status: "complete" } } }),
        KIT_DISTRIBUTED_COLUMN,
      ),
    ).toBe("Yes");
    expect(
      displayOf(
        row({ onboardingItems: { kit_sorted: { id: "i1", status: "pending" } } }),
        KIT_DISTRIBUTED_COLUMN,
      ),
    ).toBe("No");
  });

  it("offers Kit Distributed's reopen as No in the open dropdown, never the generic Reopen", () => {
    expect(optionListLabel(KIT_DISTRIBUTED_COLUMN, "reopen")).toBe("No");
    expect(optionListLabel(BUCS_PLAY_COLUMN, "reopen")).toBe("Reopen");
  });

  it("throws rather than silently rendering a status this item's own model says it cannot occupy", () => {
    // This is Brian's exact defect, made structurally impossible: Sub
    // invoiced can never be "invited" — a hardcoded label map would happily
    // print a word for it anyway, so this only stays passing while the board
    // reads `itemStatusLabel`'s guard instead.
    const corrupted = row({ onboardingItems: { subs_invoiced: { id: "i1", status: "invited" } } });
    expect(() => displayOf(corrupted, SUBS_INVOICED_COLUMN)).toThrow();
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
