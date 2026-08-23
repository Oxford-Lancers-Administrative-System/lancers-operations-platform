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
  limitsLine,
  membershipStatusLabel,
  NO_CYCLE,
  NOT_ASSIGNED,
  operatorSections,
  permissionsLine,
  permissionsPreview,
  permissionsSummary,
  sectionLabelForGroup,
  UNASSIGNED_SECTION_LABEL,
  UNREADABLE_DATE,
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

  /**
   * LAN-141 finding 9, and the reason it is a defect rather than a preference.
   *
   * The first version placed each account once, under the earliest group it sat
   * in, so a coach who also held a committee seat was absent from **Coaches**
   * altogether. `DEC-one-person-multiple-capacities` makes that combination
   * ordinary, and `REQ-coach-operator-onboarding` requires Administration to
   * "visually separate Coaching Staff" — which a section that silently omits
   * some of the club's coaches does not do.
   */
  it("shows somebody with two seats under both parts of the club they serve", () => {
    const sections = operatorSections([person("Clint", [COACHING, seat()])]);

    expect(sections.map((section) => section.label)).toEqual(["Club Officers", "Coaches"]);
    expect(sections[0].operators).toHaveLength(1);
    expect(sections[1].operators).toHaveLength(1);
    expect(sections[1].operators[0].displayName).toBe("Clint");
  });

  /** Once per section, not once per seat: two coaching seats are still one row. */
  it("lists somebody once in a section however many of its seats they hold", () => {
    const sections = operatorSections([
      person("Casey", [COACHING, { ...COACHING, roleAssignmentId: "b", code: "head_coach" }]),
    ]);

    expect(sections).toHaveLength(1);
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
    expect(
      describeHolders({ scope: "season" as const, vacant: true, cycleMissing: false, holders: [] }),
    ).toBe(NOT_ASSIGNED);
  });

  it("keeps a deactivated holder as the holder", () => {
    const text = describeHolders({
      scope: "season" as const,
      vacant: false,
      cycleMissing: false,
      holders: [holder({ accessDeactivated: true, operatorState: "deactivated" as const })],
    });

    expect(text).toContain("Clint Grohmann");
    expect(text).toContain("access deactivated");
    expect(text).not.toContain(NOT_ASSIGNED);
  });

  it("distinguishes a seat with no operating year from a vacant one", () => {
    expect(
      describeHolders({
        scope: "season" as const,
        vacant: true,
        cycleMissing: true,
        holders: [],
      }),
    ).toBe(NO_CYCLE.season);
  });

  /**
   * LAN-141 finding 4, found independently by three of the four hunters.
   *
   * `cycleMissing` short-circuited **ahead of** the holders, so under a season
   * marked `closing` — an ordinary status every season reaches — this cell read
   * "No season under way" for every coaching seat in the club, while role
   * detail named the live holder and the Operators index printed a third
   * answer. Assignments are written open-ended and outlive the cycle that
   * started them, so a missing cycle says nothing whatever about who is in post.
   */
  it("names the holder even when the seat's operating year has gone", () => {
    const text = describeHolders({
      scope: "season" as const,
      vacant: false,
      cycleMissing: true,
      holders: [holder({})],
      scheduled: [],
    });

    expect(text).toBe("Clint Grohmann");
    expect(text).not.toContain(NO_CYCLE.season);
  });

  it("names a successor even when the seat's operating year has gone", () => {
    const text = describeHolders({
      scope: "season" as const,
      vacant: true,
      cycleMissing: true,
      holders: [],
      scheduled: [{ displayName: "Alwyn Cholmondley", effectiveFrom: "2026-09-01" }],
    });

    expect(text).toContain("Alwyn Cholmondley");
    expect(text).not.toContain(NO_CYCLE.season);
  });

  /**
   * The ten committee seats hang off the committee year, not the season, and
   * telling the Treasurer's reader that no season is under way answers a
   * question nobody asked — LAN-141 finding 8.
   */
  it("says which operating year is missing, in the seat's own terms", () => {
    expect(
      describeHolders({
        scope: "committee_year" as const,
        vacant: true,
        cycleMissing: true,
        holders: [],
        scheduled: [],
      }),
    ).toBe(NO_CYCLE.committee_year);
  });

  /**
   * The words themselves, and not just which constant was chosen — the
   * independent review of PR #58.
   *
   * Every assertion above compares `describeHolders(...)` against
   * `NO_CYCLE.committee_year` or `NO_CYCLE.season`, which pins the *selection*
   * and leaves the *strings* free. Swapping the two values — giving the
   * committee-year seat the sentence "No season under way" — therefore passed
   * all 3769 unit tests while reproducing LAN-141 finding 8 word for word: the
   * Treasurer's row answering a question about the season.
   *
   * The constant is the right home for the copy, and a test that compares a
   * function's output against the constant it returns is the right test for the
   * selection. What was missing is the one below, which reads the constant.
   */
  it("uses each cycle's own word, and never the other one's", () => {
    expect(NO_CYCLE.committee_year).toBe("No committee year recorded");
    expect(NO_CYCLE.season).toBe("No season under way");

    // The property the exact strings above exist to protect, stated
    // independently of them: neither sentence may mention the other cycle.
    // A rewording that kept both sentences honest would fail the two lines
    // above and pass these; a rewording that swapped them fails both.
    expect(NO_CYCLE.committee_year).toMatch(/committee year/i);
    expect(NO_CYCLE.committee_year).not.toMatch(/season/i);
    expect(NO_CYCLE.season).toMatch(/season/i);
    expect(NO_CYCLE.season).not.toMatch(/committee year/i);
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
   * The other half of the same rule — LAN-141 finding 11.
   *
   * This column's own note claimed to follow the roles index's rule and
   * followed half of it: a scheduled start was shown, a scheduled end was not,
   * on the page an administrator scans to see who is leaving. Brian asked for
   * both directions at once — "I like showing the successors and also showing
   * people when they go".
   */
  it("says when a seat somebody currently holds is due to end", () => {
    const seats = describeSeats([seat({ effectiveTo: "2026-08-27" })]);

    expect(seats).toContain("President");
    expect(seats).toContain("ends 27 Aug 2026");
  });

  it("says both dates when a seat has not begun and already has an end", () => {
    const seats = describeSeats([
      seat({ effectiveFrom: "2026-09-01", effectiveTo: "2027-06-01", scheduled: true }),
    ]);

    expect(seats).toContain("from 1 Sept 2026");
    expect(seats).toContain("ends 1 Jun 2027");
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
        scope: "season" as const,
        vacant: false,
        cycleMissing: false,
        holders: [holder({})],
        scheduled: [],
      });

      expect(text).toBe("Clint Grohmann");
    });

    it("shows a holder and when the seat empties", () => {
      const text = describeHolders({
        scope: "season" as const,
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
        scope: "season" as const,
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
        describeHolders({
          scope: "season" as const,
          vacant: true,
          cycleMissing: false,
          holders: [],
          scheduled: [],
        }),
      ).toBe(NOT_ASSIGNED);
    });

    it("still says a deactivated holder holds the seat, and when it ends", () => {
      const text = describeHolders({
        scope: "season" as const,
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

  /**
   * LAN-141: with no recorded moment the cell said the single word "Failed",
   * beside a chip that already read "Delivery failed". It repeated the state
   * and did not say that what was missing was the *time* rather than the
   * failure.
   */
  it("says a delivery failed at a time nobody recorded, rather than just Failed", () => {
    const line = describeInvitationProgress({
      state: "delivery_failed",
      invitedAt: null,
      activatedAt: null,
      deliveryFailedAt: null,
      deliveryFailureReason: null,
    });

    expect(line).not.toBe("Failed");
    expect(line).toContain("not recorded");
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

  /**
   * LAN-141 finding 10.
   *
   * General Manager and President hold the same nine grants, so the Permissions
   * panel said word-for-word the same thing on both pages — in the mission
   * whose subtlest locked decision (`DEC-two-tier-operating-model`) is that one
   * of them outranks the other. `DEC-two-tier-operating-model` was enforced
   * everywhere and visible nowhere.
   *
   * What separates them is already data, so this asserts the *difference*
   * rather than the sentences: whichever way the wording is revised, the two
   * strongest seats in the club must not read identically.
   */
  it("tells the General Manager and the President apart", () => {
    expect(permissionsLine("general_manager")).toBe(permissionsLine("president"));

    const gm = limitsLine("general_manager");
    const president = limitsLine("president");

    expect(gm).not.toBeNull();
    expect(president).not.toBeNull();
    expect(gm).not.toBe(president);
  });

  it("says what each administering seat may not do, from the enforced table", () => {
    // Nobody may manage the General Manager: `PROTECTED_LEADERSHIP_AUTHORITY`
    // gives that tier an empty management list on purpose.
    //
    // Asserted as the whole clause rather than as "the General Manager", which
    // the line always contains and which therefore tests nothing. An earlier
    // version of this package weakened all three of these to that substring
    // when the copy was corrected, and moved the burden onto a derived check
    // that could not carry it — after which a verb could be deleted from the
    // sentence with the whole suite green. The wording changed; the strength of
    // the assertion should not have.
    const MANAGEMENT_CLAUSE =
      "assign, replace or end the role of, deactivate or restore access for, " +
      "or resend or correct an invitation for";

    expect(limitsLine("general_manager")).toContain(`${MANAGEMENT_CLAUSE} the General Manager`);
    expect(limitsLine("president")).toContain(`${MANAGEMENT_CLAUSE} the General Manager`);
    expect(limitsLine("it_officer")).toContain(`${MANAGEMENT_CLAUSE} the President`);

    // The asymmetry that is easiest to get wrong: recovery is permitted where
    // management is not, so the IT Officer's limits name neither recovery.
    expect(limitsLine("it_officer")).not.toContain("recover email access");
    expect(limitsLine("president")).toContain("recover email access for the President");

    // `DEC-no-self-removal`, on every one of them.
    for (const code of ["general_manager", "president", "it_officer"]) {
      expect(limitsLine(code)).toContain("act on their own account");
    }
  });

  /**
   * Telling a Kit Manager which seats they may not manage would imply they may
   * manage the rest.
   */
  it("says nothing about limits for a seat that does not administer at all", () => {
    expect(limitsLine("kit_manager")).toBeNull();
    expect(limitsLine("head_coach")).toBeNull();
    expect(limitsLine("vice_president")).toBeNull();
  });

  /**
   * LAN-141 finding 12: all ten coaching seats hold `attendance_recorder` and
   * `attendance_recording`, and their two `action` strings were written by
   * different issues and never read side by side — "record attendance for an
   * occurred event" above "record attendance for an event that has occurred".
   * As sentences they were the same sentence.
   *
   * W-F7 then found the survivor was also false: the register opens on D71's
   * buffer, before the event has occurred, and the walker proved a coach may
   * record against a session that has not happened. The pair still has to read
   * apart, and both halves now have to be true.
   */
  it("gives a coach two permission phrases a reader can tell apart", () => {
    const items = permissionsSummary("head_coach").items;

    expect(new Set(items).size).toBe(items.length);
    for (const left of items) {
      for (const right of items) {
        if (left === right) continue;
        // Not merely unequal: unequal after the filler words a reader skips.
        expect(gist(left)).not.toBe(gist(right));
      }
    }
  });
});

/** One phrase reduced to the words that carry it, so near-duplicates collide. */
function gist(phrase: string): string {
  const filler = new Set(["a", "an", "the", "for", "that", "has", "on", "of", "own"]);
  return phrase
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/)
    .filter((word) => word !== "" && !filler.has(word))
    .sort()
    .join(" ");
}

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

  /**
   * LAN-141: three shapes of unreadable, one answer, and none of them the raw
   * value.
   *
   * Showing the stored string was the first fix and was wrong in both
   * directions — `"2026-13-45"` reached the screen unchanged, and an invalid
   * `Date` reached it as the JavaScript artefact `"Invalid Date"`, on pages
   * where every other date reads `27 Aug 2026`. Neither is a sentence a club
   * officer can act on, and the second looks like a value rather than a fault.
   * Not throwing is still the rule: one bad row must not take the page with it.
   */
  it("says a date could not be read, rather than showing the raw value", () => {
    expect(formatInstant("not a date")).toBe(UNREADABLE_DATE);
    expect(formatDay("not a date")).toBe(UNREADABLE_DATE);
    expect(formatDay("2026-13-45")).toBe(UNREADABLE_DATE);
    expect(formatDay(new Date("nonsense"))).toBe(UNREADABLE_DATE);
    expect(formatInstant(new Date("nonsense"))).toBe(UNREADABLE_DATE);
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
