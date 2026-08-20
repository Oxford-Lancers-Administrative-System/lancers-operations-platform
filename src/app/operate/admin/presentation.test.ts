/**
 * How Administration says things — LAN-133.
 *
 * The functions here decide sectioning, wording and dates, and each of them
 * encodes a decision that would be invisible in a screenshot: which section an
 * operator with two seats falls in, whether a deactivated holder still reads as
 * the holder, whether a delivery failure carries its reason. Those are asserted
 * here rather than through a rendered page, because a render test proves the
 * text appeared and not that the rule behind it is right.
 */
import { describe, expect, it } from "vitest";
import type { DirectoryOperator, DirectoryRole } from "@/lib/services/administration-directory";
import {
  accountStateColour,
  accountStateLabel,
  describeHolders,
  describeInvitationProgress,
  describePeriod,
  describeSeats,
  formatDay,
  formatInstant,
  membershipStatusLabel,
  NOT_ASSIGNED,
  operatorSections,
  permissionsLine,
  permissionsPreview,
  permissionsSummary,
  sectionLabelForGroup,
  UNASSIGNED_SECTION_LABEL,
} from "./presentation";

function seat(overrides: Partial<DirectoryRole> = {}): DirectoryRole {
  return {
    roleAssignmentId: "assignment",
    roleId: "role",
    code: "president",
    label: "President",
    groupCode: "club_committee",
    groupLabel: "Club Committee",
    groupSortOrder: 2,
    effectiveFrom: "2026-08-18",
    effectiveTo: null,
    scheduled: false,
    ...overrides,
  };
}

const COACHING = seat({
  code: "head_coach",
  label: "Head Coach",
  groupCode: "coaching_staff",
  groupLabel: "Coaching Staff",
  groupSortOrder: 3,
});

const STANDING = seat({
  code: "general_manager",
  label: "General Manager",
  groupCode: "operational_administration",
  groupLabel: "Operational Administration",
  groupSortOrder: 1,
});

function person(name: string, roles: DirectoryRole[]): DirectoryOperator {
  return {
    operatorAccountId: `account-${name}`,
    personId: `person-${name}`,
    displayName: name,
    loginEmail: `${name}@example.test`,
    state: "active",
    invitedAt: null,
    activatedAt: null,
    deliveryFailedAt: null,
    deliveryFailureReason: null,
    emailRehomePendingAt: null,
    roles,
  };
}

describe("the Operators sections", () => {
  it("names the three approved sections for the three catalogue groups", () => {
    expect(sectionLabelForGroup("operational_administration", "Operational Administration")).toBe(
      "Standing Officers",
    );
    expect(sectionLabelForGroup("club_committee", "Club Committee")).toBe("Club Officers");
    expect(sectionLabelForGroup("coaching_staff", "Coaching Staff")).toBe("Coaches");
  });

  it("falls back to a group's own label rather than merging it into another", () => {
    expect(sectionLabelForGroup("life_members", "Life Members")).toBe("Life Members");
  });

  it("orders the sections by the catalogue, not by who happens to be first", () => {
    const sections = operatorSections([
      person("Casey", [COACHING]),
      person("Clint", [seat()]),
      person("Stewart", [STANDING]),
    ]);

    expect(sections.map((section) => section.label)).toEqual([
      "Standing Officers",
      "Club Officers",
      "Coaches",
    ]);
  });

  it("puts somebody with two seats in one section, the earliest group they sit in", () => {
    const sections = operatorSections([person("Clint", [COACHING, seat()])]);

    expect(sections).toHaveLength(1);
    expect(sections[0].label).toBe("Club Officers");
    expect(sections[0].operators).toHaveLength(1);
  });

  it("keeps an operator with no seat, in a section of their own, last", () => {
    const sections = operatorSections([person("Avery", []), person("Stewart", [STANDING])]);

    expect(sections.map((section) => section.label)).toEqual([
      "Standing Officers",
      UNASSIGNED_SECTION_LABEL,
    ]);
  });

  it("omits a section nobody is in", () => {
    const sections = operatorSections([person("Stewart", [STANDING])]);

    expect(sections).toHaveLength(1);
  });

  it("says the seats an operator holds, and says so when there are none", () => {
    expect(describeSeats([seat(), COACHING])).toBe("President · Head Coach");
    expect(describeSeats([])).toBe("No current role");
  });
});

describe("holders", () => {
  const holder = (overrides = {}) => ({
    displayName: "Clint Grohmann",
    scheduled: false,
    accessDeactivated: false,
    effectiveTo: null as string | null,
    operatorState: "active" as const,
    ...overrides,
  });

  it("says Not assigned only for a seat nobody holds", () => {
    expect(describeHolders({ vacant: true, cycleMissing: false, holders: [] })).toBe(NOT_ASSIGNED);
  });

  it("keeps a deactivated holder as the holder", () => {
    const text = describeHolders({
      vacant: false,
      cycleMissing: false,
      holders: [holder({ accessDeactivated: true, operatorState: "deactivated" as const })],
    });

    expect(text).toContain("Clint Grohmann");
    expect(text).toContain("access deactivated");
    expect(text).not.toContain(NOT_ASSIGNED);
  });

  it("distinguishes a seat with no operating year from a vacant one", () => {
    expect(describeHolders({ vacant: true, cycleMissing: true, holders: [] })).toBe(
      "No season under way",
    );
  });

  it("dates a seat that has not begun instead of naming it flatly", () => {
    const seats = describeSeats([
      {
        roleAssignmentId: "a",
        roleId: "r",
        code: "offence_coach",
        label: "Offensive Coordinator",
        groupCode: "coaching_staff",
        groupLabel: "Coaching Staff",
        groupSortOrder: 3,
        effectiveFrom: "2026-09-01",
        effectiveTo: null,
        scheduled: true,
      },
    ]);

    expect(seats).toContain("Offensive Coordinator");
    expect(seats).toContain("from 1 Sept 2026");
  });

  /**
   * The four states Brian fixed on 20 August 2026. Each is asserted for what a
   * reader can tell from the cell, and each asserts the *current* answer is
   * still there — the scheduled half is context, and a version that replaced
   * the headline with it would pass a looser test.
   */
  describe("the four states of a seat", () => {
    it("shows a holder alone when nothing is scheduled", () => {
      const text = describeHolders({
        vacant: false,
        cycleMissing: false,
        holders: [holder({})],
        scheduled: [],
      });

      expect(text).toBe("Clint Grohmann");
    });

    it("shows a holder and when the seat empties", () => {
      const text = describeHolders({
        vacant: false,
        cycleMissing: false,
        holders: [holder({ effectiveTo: "2026-08-27" })],
        scheduled: [],
      });

      expect(text).toContain("Clint Grohmann");
      expect(text).toContain("ends 27 Aug 2026");
      expect(text).not.toContain(NOT_ASSIGNED);
    });

    it("shows Not assigned and who is coming, in that order", () => {
      const text = describeHolders({
        vacant: true,
        cycleMissing: false,
        holders: [],
        scheduled: [{ displayName: "Alwyn Cholmondley", effectiveFrom: "2026-09-01" }],
      });

      expect(text).toContain(NOT_ASSIGNED);
      expect(text).toContain("Alwyn Cholmondley from 1 Sept 2026");
      expect(text.indexOf(NOT_ASSIGNED)).toBeLessThan(text.indexOf("Alwyn Cholmondley"));
    });

    it("shows Not assigned alone when nobody is coming", () => {
      expect(
        describeHolders({ vacant: true, cycleMissing: false, holders: [], scheduled: [] }),
      ).toBe(NOT_ASSIGNED);
    });

    it("still says a deactivated holder holds the seat, and when it ends", () => {
      const text = describeHolders({
        vacant: false,
        cycleMissing: false,
        holders: [
          holder({
            accessDeactivated: true,
            operatorState: "deactivated" as const,
            effectiveTo: "2026-09-30",
          }),
        ],
        scheduled: [],
      });

      expect(text).toContain("access deactivated");
      expect(text).toContain("ends 30 Sept 2026");
      expect(text).not.toContain(NOT_ASSIGNED);
    });
  });
});

describe("account state", () => {
  it("uses the club's word for every state", () => {
    expect(accountStateLabel("invitation_pending")).toBe("Invitation pending");
    expect(accountStateLabel("delivery_failed")).toBe("Delivery failed");
    expect(accountStateLabel("active")).toBe("Active");
    expect(accountStateLabel("deactivated")).toBe("Deactivated");
    expect(accountStateLabel("email_change_pending")).toBe("Email change pending");
  });

  it("gives the two states that mean 'cannot sign in and needs sending again' distinct colour", () => {
    expect(accountStateColour("active")).toBe("success");
    expect(accountStateColour("delivery_failed")).toBe("error");
    expect(accountStateColour("deactivated")).toBe("default");
  });

  it("carries the delivery failure reason into the invitation line — LAN131-A5", () => {
    const line = describeInvitationProgress({
      state: "delivery_failed",
      invitedAt: new Date("2026-08-18T13:00:00Z"),
      activatedAt: null,
      deliveryFailedAt: new Date("2026-08-18T14:22:00Z"),
      deliveryFailureReason: "Use Forgot password instead.",
    });

    expect(line).toContain("Use Forgot password instead.");
  });

  it("still says a delivery failed when the transport gave no reason", () => {
    const line = describeInvitationProgress({
      state: "delivery_failed",
      invitedAt: null,
      activatedAt: null,
      deliveryFailedAt: new Date("2026-08-18T14:22:00Z"),
      deliveryFailureReason: null,
    });

    expect(line).toContain("Failed");
  });

  it("reports acceptance, then sending, then neither", () => {
    expect(
      describeInvitationProgress({
        state: "active",
        invitedAt: new Date("2026-08-18T13:00:00Z"),
        activatedAt: new Date("2026-08-19T09:00:00Z"),
        deliveryFailedAt: null,
        deliveryFailureReason: null,
      }),
    ).toBe("Accepted 19 Aug 2026");

    expect(
      describeInvitationProgress({
        state: "invitation_pending",
        invitedAt: new Date("2026-08-18T13:09:00Z"),
        activatedAt: null,
        deliveryFailedAt: null,
        deliveryFailureReason: null,
      }),
    ).toBe("Sent 18 Aug 2026, 14:09");

    expect(
      describeInvitationProgress({
        state: "invitation_pending",
        invitedAt: null,
        activatedAt: null,
        deliveryFailedAt: null,
        deliveryFailureReason: null,
      }),
    ).toBe("No invitation recorded");
  });
});

describe("permissions", () => {
  it("projects the enforced capability map, never a hand-written sentence", () => {
    const summary = permissionsSummary("general_manager");

    expect(summary.empty).toBe(false);
    expect(summary.items).toContain("manage operator accounts and role assignments");
  });

  it("says plainly that a seat carries nothing, rather than showing an empty list", () => {
    const summary = permissionsSummary("kit_manager");

    expect(summary.empty).toBe(true);
    expect(permissionsLine("kit_manager")).toContain("no privileged actions");
  });

  it("reads as a sentence in a table cell", () => {
    expect(permissionsLine("general_manager")).toMatch(/^Can .+\.$/);
  });

  it("shortens a long summary for the index, and counts what it left out", () => {
    const full = permissionsSummary("general_manager");
    const preview = permissionsPreview("general_manager");

    expect(preview).toContain(full.items[0]);
    expect(preview).toContain(full.items[2]);
    expect(preview).not.toContain(full.items[3]);
    expect(preview).toContain(`and ${full.items.length - 3} more.`);
    // Nothing is reworded to fit: every phrase shown is the map's own.
    expect(permissionsLine("general_manager")).toContain(full.items[3]);
  });

  it("leaves a short summary whole", () => {
    const preview = permissionsPreview("head_coach");

    expect(preview).not.toContain("more.");
    expect(preview).toBe(permissionsLine("head_coach"));
  });

  it("says the empty sentence on the index too", () => {
    expect(permissionsPreview("kit_manager")).toContain("no privileged actions");
  });
});

describe("dates", () => {
  it("renders a stored calendar date as the same day everywhere", () => {
    expect(formatDay("2026-08-18")).toBe("18 Aug 2026");
    expect(formatDay("2026-01-01")).toBe("1 Jan 2026");
  });

  it("renders a recorded moment on club time", () => {
    // 22:30 UTC on 18 August is 23:30 in London — the club's own evening.
    expect(formatInstant(new Date("2026-08-18T22:30:00Z"))).toBe("18 Aug 2026, 23:30");
  });

  /**
   * The audit projections hand out `occurredAt` as an ISO **string**, not a
   * `Date`, and reading a string as a calendar date appended a second time to
   * it — `new Date("…Z" + "T00:00:00Z")` — which is invalid, which threw out of
   * `Intl.DateTimeFormat` and took the whole server-rendered record page down.
   * The agent's browser preflight found it; this is what keeps it found.
   */
  it("renders an ISO instant string, and does not read it as a calendar date", () => {
    expect(formatInstant("2026-08-18T22:30:00.123Z")).toBe("18 Aug 2026, 23:30");
    expect(formatDay("2026-08-18T22:30:00.123Z")).toBe("18 Aug 2026");
  });

  it("shows an unreadable value rather than throwing out of the page", () => {
    expect(formatInstant("not a date")).toBe("not a date");
    expect(formatDay("not a date")).toBe("not a date");
  });

  it("says an open-ended assignment is open-ended", () => {
    expect(
      describePeriod({ effectiveFrom: "2026-08-18", effectiveTo: null, scheduled: false }),
    ).toBe("From 18 Aug 2026");
  });

  it("says a closed one is closed, and a future one has not begun", () => {
    expect(
      describePeriod({ effectiveFrom: "2026-08-18", effectiveTo: "2027-06-01", scheduled: false }),
    ).toBe("18 Aug 2026 – 1 Jun 2027");
    expect(
      describePeriod({ effectiveFrom: "2026-09-01", effectiveTo: null, scheduled: true }),
    ).toBe("Starts 1 Sept 2026");
  });
});

describe("player membership", () => {
  it("uses the roster's own word for a status", () => {
    expect(membershipStatusLabel("active")).toBe("Active");
    expect(membershipStatusLabel("carried_forward")).toBe("Carried forward");
  });

  it("renders an unmapped status as itself rather than as a blank", () => {
    expect(membershipStatusLabel("something_new")).toBe("something_new");
  });
});
