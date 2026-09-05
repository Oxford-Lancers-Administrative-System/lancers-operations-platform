import { describe, expect, it } from "vitest";
import { allowedItemResolutions, allowedItemStatuses } from "@/lib/services/onboarding-item-shapes";
import type { RosterBoardRow } from "@/lib/services/roster-board";
import { buildColumns, redactRow, visibleColumns } from "./board-columns";

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
    college: "Hallamshire",
    matriculationYear: 2024,
    expectedGraduationYear: 2027,
    degreeField: "Engineering",
    hasMobile: true,
    hasEmail: true,
    missingCount: 0,
    phoneForCall: "+44 7700 900101",
    itemsTotal: 2,
    itemsResolved: 2,
    requiredOutstanding: 0,
    offencePosition: "QB",
    defencePosition: null,
    specialTeamsPosition: null,
    blueNumbers: ["7"],
    whiteNumbers: [],
    coachGroup: "Offense",
    formalwear: { tie: true, bowtie: false, socks: true },
    blues: "Half",
    eligibility: "eligible",
    availability: "green",
    bps: "No",
    onboardingItems: {},
    ...overrides,
  };
}

/**
 * `REQ-authority`: "column visibility renders from the viewer's category
 * grants, so widening access later drops restricted columns automatically."
 * These prove the mechanism at the data layer — the layer the acceptance
 * criterion actually means by "absent from the payload" — independently of
 * whether any particular role is narrowed today.
 */
describe("visibleColumns / redactRow — the grant-driven mechanism", () => {
  it("keeps every column for a role holding person_record_authority", () => {
    const columns = buildColumns(POSITION_OPTIONS);
    const visible = visibleColumns(columns, ["secretary"]);
    expect(visible).toHaveLength(columns.length);
  });

  it("drops every column for a role holding nothing — the coach case", () => {
    const columns = buildColumns(POSITION_OPTIONS);
    const visible = visibleColumns(columns, ["head_coach"]);
    expect(visible).toHaveLength(0);
  });

  it("redacts a row to only identity fields plus the call-only phone when no column is granted", () => {
    const columns = buildColumns(POSITION_OPTIONS);
    const visible = visibleColumns(columns, ["head_coach"]);
    const redacted = redactRow(row(), visible);

    expect(Object.keys(redacted).sort()).toEqual(
      ["aliases", "displayName", "membershipId", "personId", "phoneForCall"].sort(),
    );
    // The restricted and season facts are absent, not merely unset.
    expect("status" in redacted).toBe(false);
    expect("college" in redacted).toBe(false);
    expect("availability" in redacted).toBe(false);
    expect("blueNumbers" in redacted).toBe(false);
  });

  it("carries every field once a column is granted, mapped from its own key", () => {
    const columns = buildColumns(POSITION_OPTIONS);
    const redacted = redactRow(row(), columns);
    expect(redacted.status).toBe("active");
    expect(redacted.matriculationYear).toBe(2024); // "matriculation" column -> matriculationYear field
    expect(redacted.expectedGraduationYear).toBe(2027); // "graduation" column -> expectedGraduationYear field
    expect(redacted.degreeField).toBe("Engineering"); // "degree" column -> degreeField field
    expect(redacted.blueNumbers).toEqual(["7"]);
    expect(redacted.availability).toBe("green");
  });
});

describe("buildColumns — positions are sourced from the season vocabulary passed in", () => {
  it("never carries a hardcoded position list", () => {
    const columns = buildColumns(POSITION_OPTIONS);
    const offence = columns.find((column) => column.key === "offencePosition");
    expect(offence?.options).toEqual(["QB"]);

    const widerVocabulary = buildColumns({
      offence: [
        { code: "QB", label: "Quarterback" },
        { code: "RB", label: "Running Back" },
      ],
      defence: [],
      specialTeams: [],
    });
    const widerOffence = widerVocabulary.find((column) => column.key === "offencePosition");
    expect(widerOffence?.options).toEqual(["QB", "RB"]);
  });

  it("is exactly twenty-eight columns including Player", () => {
    // Correction round 2, item 5 (WP-operator-record, LAN-217) added seven
    // onboarding-item columns to the twenty-one this test used to name.
    const columns = buildColumns(POSITION_OPTIONS);
    expect(columns.length + 1).toBe(28);
  });
});

/**
 * LAN-186's owner walkthrough, item 4: the three bespoke transition controls
 * are gone, replaced by one in-cell dropdown — Status is now `edit: "select"`
 * like every other season fact, not its own kind.
 */
describe("buildColumns — Status is an ordinary select column (item 4)", () => {
  it("carries `select`, not a bespoke edit kind, and the full status labels", () => {
    const columns = buildColumns(POSITION_OPTIONS);
    const status = columns.find((column) => column.key === "status")!;

    expect(status.edit).toBe("select");
    expect(status.options).toEqual(["onboarding", "active", "inactive", "departed", "archived"]);
    expect(status.optionLabels?.active).toBe("Active");
    expect(status.optionLabels?.onboarding).toBe("Onboarding");
  });
});

// Brian, 2026-09-05 (`WP-operator-record`, LAN-217, correction round 5): BPS
// sits immediately before Availability, and Availability is the last column.
describe("buildColumns — column order (correction round 5)", () => {
  it("puts BPS immediately before Availability, with Availability last", () => {
    const keys = buildColumns(POSITION_OPTIONS).map((column) => column.key);
    const bpsIndex = keys.indexOf("bps");
    const availabilityIndex = keys.indexOf("availability");

    expect(bpsIndex).toBeGreaterThanOrEqual(0);
    expect(availabilityIndex).toBe(bpsIndex + 1);
    expect(availabilityIndex).toBe(keys.length - 1);
  });
});

/**
 * D-002 (correction round 5): the actual defect — every onboarding column's
 * offered set must come from `onboarding-item-shapes.ts`, per item, never a
 * hardcoded list beside it. This fails immediately if a column's `options`
 * is ever replaced with a literal array again, because a hardcoded list here
 * would have to coincidentally reproduce every item's own shape to pass.
 */
describe("buildColumns — every onboarding column's offered set comes from the shared model (D-002)", () => {
  const ONBOARDING_COLUMN_ITEM_CODES: Readonly<Record<string, string>> = {
    subsInvoiced: "subs_invoiced",
    subsPaid: "subs_paid",
    kitDistributed: "kit_sorted",
    bucsPlay: "bucs_play",
    hudlAccess: "hudl_access",
    squadPhoto: "photo",
    commsGroup: "comms_groups",
  };

  it("gives each onboarding column exactly its own item's allowedItemResolutions — never one shared list", () => {
    const columns = buildColumns(POSITION_OPTIONS);
    for (const [columnKey, itemCode] of Object.entries(ONBOARDING_COLUMN_ITEM_CODES)) {
      const column = columns.find((candidate) => candidate.key === columnKey)!;
      expect(column.edit).toBe("onboarding");
      expect(column.itemCode).toBe(itemCode);
      expect(column.options).toEqual(allowedItemResolutions(itemCode));
    }

    // Kit Distributed's own binary reduction is proof the columns are not
    // all reading one shared array: its options genuinely differ from every
    // sibling's.
    const kit = columns.find((column) => column.key === "kitDistributed")!;
    const bucs = columns.find((column) => column.key === "bucsPlay")!;
    expect(kit.options).not.toEqual(bucs.options);
  });

  it("proves the offered set is never wider than the item's own allowedItemStatuses — no resolution reaches a status the item cannot occupy", () => {
    const columns = buildColumns(POSITION_OPTIONS);
    for (const [columnKey, itemCode] of Object.entries(ONBOARDING_COLUMN_ITEM_CODES)) {
      const column = columns.find((candidate) => candidate.key === columnKey)!;
      const statuses = allowedItemStatuses(itemCode);
      for (const resolution of column.options ?? []) {
        if (resolution === "reopen") continue;
        expect(statuses).toContain(resolution);
      }
    }
  });
});
