// @vitest-environment node
/** LAN-458 — the name-and-response box's grouping, tested directly. Pure. */
import { describe, expect, it } from "vitest";

import { responseNamesByAnswer } from "./response-names";

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
