import { describe, expect, it } from "vitest";

import {
  applyParticipationView,
  discrepancyFor,
  EMPTY_FILTERS,
  isParticipationSort,
  participationSortHref,
  participationSortState,
  readParticipationFilters,
  type OperatorParticipationPerson,
  type ParticipationFilters,
  type ParticipationPerson,
  type ParticipationQuestion,
} from "./participation-view";

/**
 * The participation table's pure half — the discrepancy marker (D64, Q4), and
 * the filtering and sorting every column and every filter go through.
 *
 * This file is where the rules live rather than in the component, and that is
 * the point: the table is rendered twice, at two tiers, and a rule proved once
 * here holds on both.
 */

const LIFT: ParticipationQuestion = {
  id: "11111111-1111-4111-8111-111111111111",
  prompt: "Lift?",
  answerType: "boolean",
  sortOrder: 0,
};
const SHIRT: ParticipationQuestion = {
  id: "22222222-2222-4222-8222-222222222222",
  prompt: "Shirt",
  answerType: "text",
  sortOrder: 1,
};

function person(overrides: Partial<ParticipationPerson> & { displayName: string }) {
  const base: ParticipationPerson = {
    key: `player:${overrides.displayName}`,
    displayName: overrides.displayName,
    capacity: "player",
    isWalkUp: false,
    invitedAt: "2027-02-15T18:00:00.000Z",
    answer: null,
    reason: null,
    presence: null,
    discrepancy: null,
    answers: {},
  };
  return { ...base, ...overrides };
}

function operatorPerson(
  overrides: Partial<OperatorParticipationPerson> & { displayName: string },
): OperatorParticipationPerson {
  return { ...person(overrides), delivery: null, ...overrides };
}

// ---------------------------------------------------------------------------
// D64 — the marker
// ---------------------------------------------------------------------------

describe("discrepancyFor", () => {
  it("marks the two cases the approved mockup marks", () => {
    // Alaric Brindlewood: said yes, then absent.
    expect(discrepancyFor({ answer: "yes", presence: "absent", isWalkUp: false })).toBe(
      "said_yes_marked_absent",
    );
    // Cassian Wolvercote: never answered, then present.
    expect(discrepancyFor({ answer: null, presence: "present", isWalkUp: false })).toBe(
      "never_answered_attended",
    );
  });

  it("marks somebody who said no and came", () => {
    expect(discrepancyFor({ answer: "no", presence: "present", isWalkUp: false })).toBe(
      "said_no_attended",
    );
    expect(discrepancyFor({ answer: "no", presence: "late", isWalkUp: false })).toBe(
      "said_no_attended",
    );
  });

  it("does not mark a yes with nothing recorded, however many others are recorded", () => {
    // The finding this package was handed: recording three people out of
    // forty-seven must not turn the other forty-four into exceptions. There is
    // no second record to disagree with, so there is no disagreement — the
    // Attendance column already says "Not recorded".
    expect(discrepancyFor({ answer: "yes", presence: null, isWalkUp: false })).toBeNull();
  });

  it("does not mark an excused absence", () => {
    // A recorded, accepted absence. Marking it would make the glyph a judgement.
    expect(discrepancyFor({ answer: "yes", presence: "excused", isWalkUp: false })).toBeNull();
  });

  it("does not mark a walk-up", () => {
    // The mockup leaves Wilfrid Danecroft unmarked: Capacity already says
    // Walk-up and Invitation sent already reads "—".
    expect(discrepancyFor({ answer: null, presence: "present", isWalkUp: true })).toBeNull();
  });

  it("does not mark agreement in either direction", () => {
    expect(discrepancyFor({ answer: "yes", presence: "present", isWalkUp: false })).toBeNull();
    expect(discrepancyFor({ answer: "yes", presence: "late", isWalkUp: false })).toBeNull();
    expect(discrepancyFor({ answer: "no", presence: "absent", isWalkUp: false })).toBeNull();
    expect(discrepancyFor({ answer: null, presence: "absent", isWalkUp: false })).toBeNull();
  });

  it("carries no date term at all", () => {
    // The stored view `rsvp_attendance_mismatches` restricts to events whose
    // date has passed, so it flags nothing during the session — precisely when
    // the register is open. This function takes no clock, which is the whole
    // reason the marker is derived here.
    expect(discrepancyFor.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Filtering — every filter, and every filter combining
// ---------------------------------------------------------------------------

const ROSTER: OperatorParticipationPerson[] = [
  operatorPerson({
    displayName: "Alaric Brindlewood",
    answer: "yes",
    presence: "absent",
    delivery: "delivered",
    answers: { [LIFT.id]: "Yes", [SHIRT.id]: "L" },
    discrepancy: "said_yes_marked_absent",
  }),
  operatorPerson({
    displayName: "Bar Sedgewick",
    answer: "no",
    reason: "Away with the course all week",
    delivery: "delivered",
  }),
  operatorPerson({
    displayName: "Cassian Wolvercote",
    answer: null,
    presence: "present",
    delivery: "failed",
    discrepancy: "never_answered_attended",
  }),
  operatorPerson({
    displayName: "Fen Marchbanks",
    capacity: "committee",
    answer: "yes",
    presence: "late",
    delivery: "delivered",
    answers: { [LIFT.id]: "No", [SHIRT.id]: "M" },
  }),
  operatorPerson({
    displayName: "Wilfrid Danecroft",
    key: "player:walkup",
    isWalkUp: true,
    invitedAt: null,
    presence: "present",
    delivery: null,
  }),
];

const names = (people: readonly ParticipationPerson[]) => people.map((one) => one.displayName);

function withFilters(patch: Partial<ParticipationFilters>): ParticipationFilters {
  return { ...EMPTY_FILTERS, ...patch };
}

describe("applyParticipationView filters", () => {
  it("returns everybody with no filters, sorted by name", () => {
    expect(names(applyParticipationView(ROSTER, EMPTY_FILTERS, []))).toEqual([
      "Alaric Brindlewood",
      "Bar Sedgewick",
      "Cassian Wolvercote",
      "Fen Marchbanks",
      "Wilfrid Danecroft",
    ]);
  });

  it("filters by name, case-insensitively and on a fragment", () => {
    expect(names(applyParticipationView(ROSTER, withFilters({ search: "wolver" }), []))).toEqual([
      "Cassian Wolvercote",
    ]);
  });

  it("filters to only the nos — Brian, 2026-08-21", () => {
    expect(names(applyParticipationView(ROSTER, withFilters({ answer: "no" }), []))).toEqual([
      "Bar Sedgewick",
    ]);
  });

  it("filters to nobody who answered", () => {
    // A walk-up has no answer because nobody asked, and is in this set: "no
    // answer" is the absence of one, which is what the filter names.
    expect(names(applyParticipationView(ROSTER, withFilters({ answer: "none" }), []))).toEqual([
      "Cassian Wolvercote",
      "Wilfrid Danecroft",
    ]);
  });

  it("filters to only players, and to only walk-ups", () => {
    expect(names(applyParticipationView(ROSTER, withFilters({ capacity: "player" }), []))).toEqual([
      "Alaric Brindlewood",
      "Bar Sedgewick",
      "Cassian Wolvercote",
    ]);
    expect(names(applyParticipationView(ROSTER, withFilters({ capacity: "walk_up" }), []))).toEqual(
      ["Wilfrid Danecroft"],
    );
  });

  it("filters by attendance, including the absence of a record", () => {
    expect(
      names(applyParticipationView(ROSTER, withFilters({ attendance: "present" }), [])),
    ).toEqual(["Cassian Wolvercote", "Wilfrid Danecroft"]);
    expect(
      names(applyParticipationView(ROSTER, withFilters({ attendance: "not_recorded" }), [])),
    ).toEqual(["Bar Sedgewick"]);
  });

  it("filters by delivery, including nothing queued", () => {
    expect(names(applyParticipationView(ROSTER, withFilters({ delivery: "failed" }), []))).toEqual([
      "Cassian Wolvercote",
    ]);
    expect(names(applyParticipationView(ROSTER, withFilters({ delivery: "none" }), []))).toEqual([
      "Wilfrid Danecroft",
    ]);
  });

  it("combines every filter", () => {
    // W7: "the filters combine and apply as you type".
    expect(
      names(
        applyParticipationView(
          ROSTER,
          withFilters({ capacity: "player", answer: "yes", attendance: "absent" }),
          [],
        ),
      ),
    ).toEqual(["Alaric Brindlewood"]);
  });

  it("returns nothing rather than everything when the filters match nobody", () => {
    // The failure that would make a filter look inert: falling back to the
    // unfiltered set on an empty match.
    expect(
      applyParticipationView(ROSTER, withFilters({ search: "nobody at all" }), []),
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Sorting — every column, including the question columns
// ---------------------------------------------------------------------------

describe("applyParticipationView sorting", () => {
  /**
   * The order each column actually produces, written out rather than asserted
   * as "different from the last one".
   *
   * "Reversing changes the order" is exactly the assertion that would have
   * passed on a sort that ignored its column and always ordered by name — the
   * class of defect this mission has shipped five times. Every expectation
   * below is a row order only that column produces.
   */
  const EXPECTED_ORDER: Readonly<Record<string, string[]>> = {
    // Committee, then the three players, then the walk-up sentinel last.
    capacity: [
      "Fen Marchbanks",
      "Alaric Brindlewood",
      "Bar Sedgewick",
      "Cassian Wolvercote",
      "Wilfrid Danecroft",
    ],
    // `no` before `yes` before the two with no answer; ties by name.
    answer: [
      "Bar Sedgewick",
      "Alaric Brindlewood",
      "Fen Marchbanks",
      "Cassian Wolvercote",
      "Wilfrid Danecroft",
    ],
    // Only Bar has a reason; everybody else ties and falls back to the name.
    reason: [
      "Bar Sedgewick",
      "Alaric Brindlewood",
      "Cassian Wolvercote",
      "Fen Marchbanks",
      "Wilfrid Danecroft",
    ],
    // absent, late, present, present, then the one not recorded.
    attendance: [
      "Alaric Brindlewood",
      "Fen Marchbanks",
      "Cassian Wolvercote",
      "Wilfrid Danecroft",
      "Bar Sedgewick",
    ],
    // delivered ×3 (by name), failed, then nothing queued.
    delivery: [
      "Alaric Brindlewood",
      "Bar Sedgewick",
      "Fen Marchbanks",
      "Cassian Wolvercote",
      "Wilfrid Danecroft",
    ],
  };

  it("sorts by the column it was asked for, not by the name", () => {
    for (const [column, order] of Object.entries(EXPECTED_ORDER)) {
      expect(
        names(applyParticipationView(ROSTER, withFilters({ sort: column }), [])),
        column,
      ).toEqual(order);
      // And none of them is the name order, which is what makes each of the
      // five above evidence that the column was read.
      expect(order, column).not.toEqual(names(applyParticipationView(ROSTER, EMPTY_FILTERS, [])));
    }
  });

  /**
   * Descending reverses the **column**, and the name tie-break stays
   * ascending inside each group.
   *
   * That is deliberate, and it is why these are written out rather than
   * derived by reversing the ascending list. Sorting descending by Answer puts
   * the people with no answer first, and inside that group A before Z is
   * predictable; Z before A would be a second reversal nobody asked for.
   */
  const EXPECTED_DESCENDING: Readonly<Record<string, string[]>> = {
    name: [
      "Wilfrid Danecroft",
      "Fen Marchbanks",
      "Cassian Wolvercote",
      "Bar Sedgewick",
      "Alaric Brindlewood",
    ],
    invited: [
      "Wilfrid Danecroft",
      "Alaric Brindlewood",
      "Bar Sedgewick",
      "Cassian Wolvercote",
      "Fen Marchbanks",
    ],
    capacity: [
      "Wilfrid Danecroft",
      "Alaric Brindlewood",
      "Bar Sedgewick",
      "Cassian Wolvercote",
      "Fen Marchbanks",
    ],
    answer: [
      "Cassian Wolvercote",
      "Wilfrid Danecroft",
      "Alaric Brindlewood",
      "Fen Marchbanks",
      "Bar Sedgewick",
    ],
    reason: [
      "Alaric Brindlewood",
      "Cassian Wolvercote",
      "Fen Marchbanks",
      "Wilfrid Danecroft",
      "Bar Sedgewick",
    ],
    attendance: [
      "Bar Sedgewick",
      "Cassian Wolvercote",
      "Wilfrid Danecroft",
      "Fen Marchbanks",
      "Alaric Brindlewood",
    ],
    delivery: [
      "Wilfrid Danecroft",
      "Cassian Wolvercote",
      "Alaric Brindlewood",
      "Bar Sedgewick",
      "Fen Marchbanks",
    ],
  };

  it("reverses every column, keeping the name tie-break ascending", () => {
    for (const [column, order] of Object.entries(EXPECTED_DESCENDING)) {
      expect(
        names(applyParticipationView(ROSTER, withFilters({ sort: column, direction: "desc" }), [])),
        column,
      ).toEqual(order);
    }
  });

  it("sorts by a question column", () => {
    const byLift = names(
      applyParticipationView(ROSTER, withFilters({ sort: `q:${LIFT.id}` }), [LIFT, SHIRT]),
    );
    // "No" before "Yes" before the unanswered rows, which sort last.
    expect(byLift.slice(0, 2)).toEqual(["Fen Marchbanks", "Alaric Brindlewood"]);
  });

  it("puts walk-ups and unsent invitations last when sorting by invitation", () => {
    const byInvited = names(applyParticipationView(ROSTER, withFilters({ sort: "invited" }), []));
    expect(byInvited[byInvited.length - 1]).toBe("Wilfrid Danecroft");
  });

  it("refuses a sort key that is not a column, and a question that is not this event's", () => {
    expect(isParticipationSort("q:not-a-question", [LIFT])).toBe(false);
    expect(isParticipationSort("drop table", [LIFT])).toBe(false);
    expect(isParticipationSort(`q:${LIFT.id}`, [LIFT])).toBe(true);
    // An unrecognised key falls back to the name order rather than throwing.
    expect(names(applyParticipationView(ROSTER, withFilters({ sort: "nonsense" }), []))).toEqual(
      names(applyParticipationView(ROSTER, EMPTY_FILTERS, [])),
    );
  });

  it("is total, so two people with the same value keep a stable order", () => {
    const twice = [
      person({ displayName: "Same Name", key: "player:a", answer: "yes" }),
      person({ displayName: "Same Name", key: "player:b", answer: "yes" }),
    ];
    const forwards = applyParticipationView(twice, withFilters({ sort: "answer" }), []);
    const backwards = applyParticipationView(
      [...twice].reverse(),
      withFilters({ sort: "answer" }),
      [],
    );
    expect(forwards.map((one) => one.key)).toEqual(backwards.map((one) => one.key));
  });
});

// ---------------------------------------------------------------------------
// The heading links
// ---------------------------------------------------------------------------

describe("participationSortHref", () => {
  it("carries every filter through a sort", () => {
    // The defect this exists to prevent: a table filtered to the eight people
    // who have not answered resetting itself when somebody sorts it.
    const href = participationSortHref(
      "/operate/events/abc",
      withFilters({ search: "wolver", capacity: "player", answer: "none", delivery: "failed" }),
      "attendance",
    );
    expect(href).toContain("q=wolver");
    expect(href).toContain("as=player");
    expect(href).toContain("answer=none");
    expect(href).toContain("delivery=failed");
    expect(href).toContain("sort=attendance");
    expect(href).toContain("dir=asc");
  });

  it("reverses the column that is already sorted, and never reverses another", () => {
    const filters = withFilters({ sort: "answer", direction: "asc" });
    expect(participationSortHref("/e/tok", filters, "answer")).toContain("dir=desc");
    expect(participationSortHref("/e/tok", filters, "name")).toContain("dir=asc");
  });

  it("treats the default order as name ascending", () => {
    expect(participationSortHref("/e/tok", EMPTY_FILTERS, "name")).toContain("dir=desc");
    expect(participationSortState(EMPTY_FILTERS, "name")).toEqual({
      active: true,
      direction: "asc",
    });
    expect(participationSortState(EMPTY_FILTERS, "answer")).toEqual({
      active: false,
      direction: "asc",
    });
  });
});

describe("readParticipationFilters", () => {
  it("reads every key the table uses", () => {
    expect(
      readParticipationFilters(
        {
          q: "wolver",
          as: "coach",
          answer: "yes",
          att: "late",
          delivery: "queued",
          sort: `q:${LIFT.id}`,
          dir: "desc",
        },
        [LIFT],
      ),
    ).toEqual({
      search: "wolver",
      capacity: "coach",
      answer: "yes",
      attendance: "late",
      delivery: "queued",
      sort: `q:${LIFT.id}`,
      direction: "desc",
    });
  });

  it("drops values no filter recognises rather than refusing the page", () => {
    const filters = readParticipationFilters(
      { answer: "maybe", att: "vanished", sort: "q:someone-elses-question", dir: "sideways" },
      [LIFT],
    );
    expect(filters.answer).toBe("");
    expect(filters.attendance).toBe("");
    expect(filters.sort).toBe("");
    expect(filters.direction).toBe("");
  });

  it("takes the first of a repeated parameter", () => {
    expect(readParticipationFilters({ q: ["one", "two"] }, []).search).toBe("one");
  });
});
