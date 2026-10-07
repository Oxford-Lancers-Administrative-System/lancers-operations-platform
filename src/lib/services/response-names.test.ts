// @vitest-environment node
/** LAN-458 — the name-and-response box's grouping, tested directly. Pure. */
import { describe, expect, it } from "vitest";

import { responseProgressByCapacity } from "./event-response-progress";
import { responseNamesByAnswer, responseNamesByCapacity } from "./response-names";

function person(displayName: string, answer: "yes" | "no" | null, isWalkUp = false) {
  return { displayName, answer, isWalkUp };
}

describe("the name-and-response box", () => {
  it("groups every invitee by answer, Yes then No then No response, names in order", () => {
    const groups = responseNamesByAnswer([
      person("Wren Ashdown", null),
      person("Cato Bellamy", "yes"),
      person("Avery Fielding", "yes"),
      person("Odo Pellingham", "no"),
      person("Bram Quillon", null),
    ]);

    expect(groups.map((group) => [group.label, group.names])).toEqual([
      ["Yes", ["Avery Fielding", "Cato Bellamy"]],
      ["No", ["Odo Pellingham"]],
      ["No response", ["Bram Quillon", "Wren Ashdown"]],
    ]);
  });

  it("includes nonresponders and leaves out walk-ups, who were never invited", () => {
    const groups = responseNamesByAnswer([
      person("Avery Fielding", null),
      person("Tamsin Walkup", null, true),
    ]);

    expect(groups.flatMap((group) => group.names)).toEqual(["Avery Fielding"]);
    expect(groups[2].names).toEqual(["Avery Fielding"]);
  });

  it("keeps all three groups when one is empty", () => {
    const groups = responseNamesByAnswer([person("Avery Fielding", "yes")]);

    expect(groups.map((group) => [group.group, group.names.length])).toEqual([
      ["yes", 1],
      ["no", 0],
      ["none", 0],
    ]);
  });
});

/**
 * LAN-481 — the box split by Recruits, Players and Coaches, through the
 * response blocks' own classifier.
 */
describe("the name-and-response box by capacity", () => {
  function invitee(
    displayName: string,
    capacity: string,
    answer: "yes" | "no" | null,
    extra: { isWalkUp?: boolean; countsAsCoach?: boolean } = {},
  ) {
    return { displayName, capacity, answer, isWalkUp: extra.isWalkUp ?? false, ...extra };
  }

  const MIXED = [
    invitee("Rhea Recruit", "recruit", "yes"),
    invitee("Rory Recruit", "recruit", null),
    invitee("Pia Player", "player", "yes"),
    invitee("Piers Player", "player", "no"),
    invitee("Pell Player", "player", null),
    invitee("Cora Coach", "coach", "no"),
    invitee("Gwen Manager", "committee", "yes", { countsAsCoach: true }),
    invitee("Ivo Officer", "committee", null, { countsAsCoach: true }),
    invitee("Tobias Treasurer", "committee", "yes", { countsAsCoach: false }),
    invitee("Wynn Walkup", "player", "yes", { isWalkUp: true }),
    invitee("Vera Visitor", "visitor", "yes"),
  ];

  it("gives one section per capacity present, in the blocks' order", () => {
    expect(responseNamesByCapacity(MIXED).map((section) => section.label)).toEqual([
      "Recruits",
      "Players",
      "Coaches",
    ]);
    expect(
      responseNamesByCapacity([invitee("Pia Player", "player", "yes")]).map((one) => one.label),
    ).toEqual(["Players"]);
    expect(
      responseNamesByCapacity([
        invitee("Pia Player", "player", "yes"),
        invitee("Cora Coach", "coach", null),
      ]).map((one) => one.capacity),
    ).toEqual(["player", "coach"]);
    expect(responseNamesByCapacity([])).toEqual([]);
  });

  it("groups each section Yes, No, No response", () => {
    const named = Object.fromEntries(
      responseNamesByCapacity(MIXED).map((section) => [
        section.capacity,
        section.groups.map((group) => [group.label, group.names]),
      ]),
    );

    expect(named).toEqual({
      recruit: [
        ["Yes", ["Rhea Recruit"]],
        ["No", []],
        ["No response", ["Rory Recruit"]],
      ],
      player: [
        ["Yes", ["Pia Player", "Tobias Treasurer"]],
        ["No", ["Piers Player"]],
        ["No response", ["Pell Player"]],
      ],
      coach: [
        ["Yes", ["Gwen Manager"]],
        ["No", ["Cora Coach"]],
        ["No response", ["Ivo Officer"]],
      ],
    });
  });

  it("puts a General Manager or IT Officer under Coaches and another committee seat under Players", () => {
    const sections = responseNamesByCapacity(MIXED);
    const coaches = sections.find((section) => section.capacity === "coach")!;
    const players = sections.find((section) => section.capacity === "player")!;

    const all = (section: typeof coaches) => section.groups.flatMap((group) => group.names);
    expect(all(coaches)).toEqual(expect.arrayContaining(["Gwen Manager", "Ivo Officer"]));
    expect(all(players)).toContain("Tobias Treasurer");
    expect(all(players)).not.toContain("Gwen Manager");
  });

  it("lists every counted invitee exactly once, and nobody the blocks do not count", () => {
    const names = responseNamesByCapacity(MIXED).flatMap((section) =>
      section.groups.flatMap((group) => group.names),
    );

    expect([...names].sort()).toEqual(
      MIXED.filter((one) => !one.isWalkUp && one.capacity !== "visitor")
        .map((one) => one.displayName)
        .sort(),
    );
    expect(new Set(names).size).toBe(names.length);
  });

  it("agrees with the response blocks' counts, section by section", () => {
    const blocks = responseProgressByCapacity(MIXED);
    const sections = responseNamesByCapacity(MIXED);

    expect(sections.map((section) => section.capacity)).toEqual(
      blocks.map((block) => block.capacity),
    );
    for (const block of blocks) {
      const section = sections.find((one) => one.capacity === block.capacity)!;
      const [yes, no, none] = section.groups.map((group) => group.names.length);
      expect({ yes, no, invited: yes + no + none }).toEqual({
        yes: block.yes,
        no: block.no,
        invited: block.invited,
      });
    }
  });
});
