import { describe, expect, it } from "vitest";
import { allowedItemStates } from "@/lib/services/onboarding-item-shapes";
import type { RosterBoardRow } from "@/lib/services/roster-board";
import { buildColumns, redactRow, visibleColumns } from "./board-columns";

const POSITION_OPTIONS = {
  offence: [{ code: "QB", label: "Quarterback" }],
  defence: [{ code: "CB", label: "Cornerback" }],
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
    offenceBackupPosition: null,
    defencePosition: null,
    defenceBackupPosition: null,
    blueNumbers: ["7"],
    whiteNumbers: [],
    coachingGroups: ["Offense"],
    offensivePositionGroups: [],
    defensivePositionGroups: [],
    formalwear: { tie: true, bowtie: false },
    specialTeams: {},
    kit: {},
    warmupSmallGroup: null,
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
    });
    const widerOffence = widerVocabulary.find((column) => column.key === "offencePosition");
    expect(widerOffence?.options).toEqual(["QB", "RB"]);
  });

  it("groups every column into the order Brian and Stewart settled (LAN-387, LAN-401)", () => {
    const columns = buildColumns(POSITION_OPTIONS);
    const bandsInOrder: string[] = [];
    for (const column of columns) {
      if (bandsInOrder[bandsInOrder.length - 1] !== column.band) bandsInOrder.push(column.band);
    }
    expect(bandsInOrder).toEqual([
      "person",
      "onboarding",
      "membership",
      // LAN-412: Stewart's own category, immediately after Membership.
      "availability",
      "coaching",
      "offensive",
      "defensive",
      "specialTeams",
      // LAN-401: Stewart's warmup groups, between Special teams and Kit.
      "warmup",
      "kit",
    ]);
  });

  it("gives the Warmup group its one column (LAN-401)", () => {
    const columns = buildColumns(POSITION_OPTIONS);
    const warmup = columns.filter((column) => column.band === "warmup");
    expect(warmup.map((column) => column.key)).toEqual(["warmupSmallGroup"]);
    expect(warmup[0].label).toBe("Small Group Assignment");
    expect(warmup[0].options).toEqual([
      "Kings",
      "Raider",
      "Bear",
      "Phoenix",
      "Cavalier",
      "Blue",
      "Gold",
      "Lancer",
    ]);
  });

  it("gives the Membership group exactly the facts the call named, in order", () => {
    const columns = buildColumns(POSITION_OPTIONS);
    expect(
      columns.filter((column) => column.band === "membership").map((column) => column.key),
    ).toEqual([
      "status",
      "entry",
      "blueNumbers",
      "whiteNumbers",
      "blues",
      "eligibility",
      // LAN-412 took Availability out of this group; BPS is simply last here now.
      "bps",
    ]);
  });

  it("gives the Availability group its one column, and nothing else (LAN-412)", () => {
    const columns = buildColumns(POSITION_OPTIONS);
    const availability = columns.filter((column) => column.band === "availability");
    expect(availability.map((column) => column.key)).toEqual(["availability"]);
    expect(availability[0].label).toBe("Availability");
    // The values, the picker and who may write are unchanged by the regrouping.
    expect(availability[0].edit).toBe("select");
    expect(availability[0].options).toEqual(["green", "orange", "red"]);
    expect(availability[0].requires).toBe("person_record_authority");
  });

  it("pairs a primary and a backup a side, both on the season's own vocabulary", () => {
    const columns = buildColumns(POSITION_OPTIONS);
    const offensive = columns.filter((column) => column.band === "offensive");
    expect(offensive.map((column) => column.label)).toEqual([
      "Primary position",
      "Backup position",
    ]);
    expect(offensive[0].options).toEqual(offensive[1].options);

    const defensive = columns.filter((column) => column.band === "defensive");
    expect(defensive.map((column) => column.label)).toEqual([
      "Primary position",
      "Backup position",
    ]);
  });

  it("leaves the multi-selects uncapped and the coaching group's three values as written", () => {
    const columns = buildColumns(POSITION_OPTIONS);
    const coaching = columns.find((column) => column.key === "coachingGroups")!;
    expect(coaching.edit).toBe("multiselect");
    expect(coaching.options).toEqual(["Offense", "Defense", "Special Teams"]);
    expect(columns.find((column) => column.key === "offensivePositionGroups")?.options).toEqual([
      "Offensive Line",
      "Quarterbacks",
      "Runningbacks",
      "Wide Receivers",
    ]);
    expect(columns.find((column) => column.key === "defensivePositionGroups")?.options).toEqual([
      "Defensive Line",
      "Linebackers",
      "Defensive Backs",
    ]);
  });

  it("gives special teams six squads of four cells, each on its own list (LAN-374)", () => {
    const columns = buildColumns(POSITION_OPTIONS).filter(
      (column) => column.band === "specialTeams",
    );
    expect(columns).toHaveLength(24);
    expect(columns.slice(0, 4).map((column) => column.label)).toEqual([
      "Starting Position",
      "Backup Position 1",
      "Backup Position 2",
      "Backup Position 3",
    ]);
    expect(columns[0].groupHeading).toBe("Kick Return");
    expect(columns[0].key).toBe("st:kick_return:starting");
    // Each squad's list is its own — the punt squad's Longsnapper is not on
    // the kick-return squad's list, and Field Goal Block offers one value.
    expect(columns[0].options).not.toContain("Longsnapper");
    expect(columns[columns.length - 1].options).toEqual(["DEF ON FIELD"]);
  });

  it("moves Formalwear into Kit with Tie and Bow tie only", () => {
    const columns = buildColumns(POSITION_OPTIONS);
    const formalwear = columns.find((column) => column.key === "formalwear")!;
    expect(formalwear.band).toBe("kit");
    expect(formalwear.options).toEqual(["tie", "bowtie"]);
    expect(formalwear.optionLabels).toEqual({ tie: "Tie", bowtie: "Bow tie" });
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
// LAN-412 makes Availability a group of its own, immediately after Membership,
// so the two are still adjacent — BPS ends one group and Availability begins
// the next.
describe("buildColumns — column order (correction round 5, LAN-412)", () => {
  it("keeps BPS immediately before Availability, across the group boundary", () => {
    const columns = buildColumns(POSITION_OPTIONS).map((column) => column.key);
    const bpsIndex = columns.indexOf("bps");
    const availabilityIndex = columns.indexOf("availability");

    expect(bpsIndex).toBeGreaterThanOrEqual(0);
    expect(availabilityIndex).toBe(bpsIndex + 1);
  });

  it("leaves BPS last in Membership now that Availability has left it", () => {
    const membership = buildColumns(POSITION_OPTIONS)
      .filter((column) => column.band === "membership")
      .map((column) => column.key);

    expect(membership[membership.length - 1]).toBe("bps");
  });
});

/**
 * D-002 (correction round 6): the actual defect — every onboarding column's
 * offered set IS its own item's displayable set, `allowedItemStates`, and
 * nothing else. There is no second, wider "resolution" vocabulary any more
 * for a column's `options` to have accidentally kept reading, which is
 * exactly how BUCS Play kept offering "Waived · Not applicable · Reopen"
 * after round 5's own fix: the words changed, the underlying list did not.
 */
describe("buildColumns — every onboarding column's offered set IS its own item's displayable set (D-002)", () => {
  const ONBOARDING_COLUMN_ITEM_CODES: Readonly<Record<string, string>> = {
    subsInvoiced: "subs_invoiced",
    subsPaid: "subs_paid",
    // kitDistributed is deliberately absent: LAN-375 made it derived, so it
    // is an onboarding column that offers nothing at all. Its own assertion
    // is below.
    bucsPlay: "bucs_play",
    hudlAccess: "hudl_access",
    squadPhoto: "photo",
    commsGroup: "comms_groups",
  };

  it("gives each onboarding column exactly its own item's allowedItemStates — never a shared list", () => {
    const columns = buildColumns(POSITION_OPTIONS);
    for (const [columnKey, itemCode] of Object.entries(ONBOARDING_COLUMN_ITEM_CODES)) {
      const column = columns.find((candidate) => candidate.key === columnKey)!;
      expect(column.edit).toBe("onboarding");
      expect(column.itemCode).toBe(itemCode);
      expect(column.options).toEqual(allowedItemStates(itemCode));
    }

    // BUCS Play and Hudl access are proof the columns are not all reading
    // one shared array any more: Brian's own table gives them genuinely
    // different lists (four states against three), not just different words
    // painted over the same four.
    const bucs = columns.find((column) => column.key === "bucsPlay")!;
    const hudl = columns.find((column) => column.key === "hudlAccess")!;
    expect(bucs.options).not.toEqual(hudl.options);
  });

  it("opens no control at all on Kit Distributed — it reads the kit issued (LAN-375)", () => {
    const column = buildColumns(POSITION_OPTIONS).find(
      (candidate) => candidate.key === "kitDistributed",
    )!;
    expect(column.band).toBe("onboarding");
    expect(column.edit).toBe("none");
    expect(column.itemCode).toBe("kit_sorted");
  });

  it("offers reopen, waived (outside Subscription paid), or not_applicable nowhere", () => {
    const columns = buildColumns(POSITION_OPTIONS);
    for (const [columnKey, itemCode] of Object.entries(ONBOARDING_COLUMN_ITEM_CODES)) {
      const column = columns.find((candidate) => candidate.key === columnKey)!;
      expect(column.options).not.toContain("not_applicable");
      expect(column.options).not.toContain("reopen" as never);
      if (itemCode !== "subs_paid") expect(column.options).not.toContain("waived");
    }
  });
});
