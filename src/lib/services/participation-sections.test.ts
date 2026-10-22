// @vitest-environment node
/**
 * LAN-497 — Everyone asked, grouped: Coaches first, the family's groups in
 * vocabulary order, No group last, each with its attendance tally. Pure.
 */
import { describe, expect, it } from "vitest";

import type { AttendancePresence } from "./attendance-vocabulary";
import { OFFENSIVE_POSITION_GROUP_VALUES } from "./roster-board/vocabulary";
import {
  anchorOf,
  participationSections,
  withGroupValues,
  type GroupedPerson,
} from "./participation-sections";

function person(
  name: string,
  capacity: string,
  answer: "yes" | "no" | null,
  presence: AttendancePresence | null,
  offensive: readonly string[] | null,
  extra: Partial<GroupedPerson> = {},
): GroupedPerson {
  return {
    key: `${capacity}:${name}`,
    displayName: name,
    capacity,
    isWalkUp: false,
    invitedAt: null,
    answer,
    reason: null,
    presence,
    discrepancy: null,
    answers: {},
    ...(offensive === null ? {} : { groups: { offensive } }),
    ...extra,
  };
}

const [FIRST, SECOND] = OFFENSIVE_POSITION_GROUP_VALUES;

describe("participation sections", () => {
  const people = [
    person("Cora", "coach", "yes", "present", [FIRST]),
    person("Ann", "player", "yes", "present", [FIRST]),
    person("Ben", "player", "yes", null, [FIRST, SECOND]),
    person("Cal", "player", "no", "late", [SECOND]),
    person("Dan", "player", null, null, []),
    person("Eli", "recruit", "yes", "absent", null),
    person("Walker", "recruit", null, "present", null, { isWalkUp: true }),
  ];

  const sections = participationSections(people, "offensive");

  it("puts Coaches first, as their own section, out of the family's groups", () => {
    expect(sections[0]).toMatchObject({ key: "coaches", label: "Coaches" });
    expect(sections[0].people.map((p) => p.displayName)).toEqual(["Cora"]);
    for (const section of sections.slice(1)) {
      expect(section.people.map((p) => p.displayName)).not.toContain("Cora");
    }
  });

  it("then one section per value somebody holds, in vocabulary order, then No group last", () => {
    expect(sections.map((s) => s.label)).toEqual([
      "Coaches",
      FIRST,
      SECOND,
      "No offensive position group",
    ]);
    expect(sections.at(-1)).toMatchObject({ key: "no-group", defaultOpen: false });
    expect(sections.slice(0, -1).every((s) => s.defaultOpen)).toBe(true);
  });

  it("keeps a player in several groups in each of them", () => {
    const names = (label: string) =>
      sections.find((s) => s.label === label)?.people.map((p) => p.displayName);
    expect(names(FIRST)).toEqual(["Ann", "Ben"]);
    expect(names(SECOND)).toEqual(["Ben", "Cal"]);
  });

  it("puts everyone with no value, a recruit and a walk-up included, under No group", () => {
    const none = sections.find((s) => s.key === "no-group");
    expect(none?.people.map((p) => p.displayName)).toEqual(["Dan", "Eli", "Walker"]);
  });

  it("gives each section its own attended / expected", () => {
    const tally = (label: string) => {
      const t = sections.find((s) => s.label === label)!.tally;
      return `${t.attended}/${t.expected}`;
    };
    expect(tally("Coaches")).toBe("1/1");
    // Ann present (yes), Ben said yes and has no mark: a no-show.
    expect(tally(FIRST)).toBe("1/2");
    // Ben a no-show, Cal said no but was late.
    expect(tally(SECOND)).toBe("1/2");
    // Dan out; Eli yes and absent, a no-show; Walker came.
    expect(tally("No offensive position group")).toBe("1/2");
  });

  it("omits a section nobody is in, and keeps a value outside the vocabulary", () => {
    const only = participationSections(
      [person("Zed", "player", "yes", null, ["Special Teams"])],
      "offensive",
    );
    expect(only.map((s) => s.label)).toEqual(["Special Teams"]);
  });
});

describe("hanging group values on rows", () => {
  it("looks a person up by the id their key ends in; a walk-up with none has none", () => {
    expect(anchorOf("player:abc-123")).toBe("abc-123");
    const rows = withGroupValues(
      [
        person("A", "player", null, null, null, { key: "player:m1" }),
        person("W", "recruit", null, null, null, { key: "recruit:p9" }),
      ],
      { m1: { offensive: [FIRST] } },
    );
    expect(rows[0].groups).toEqual({ offensive: [FIRST] });
    expect(rows[1].groups).toBeUndefined();
  });
});
