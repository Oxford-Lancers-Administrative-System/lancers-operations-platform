// @vitest-environment node
/**
 * LAN-420 — the per-capacity counting, tested directly.
 *
 * The screens prove that the blocks render; this proves what they say. Pure —
 * no database, no React.
 */
import { describe, expect, it } from "vitest";

import {
  responseBand,
  responseProgressByCapacity,
  type ResponseProgressRow,
} from "./event-response-progress";

function invitee(
  capacity: string,
  answer: "yes" | "no" | null,
  extra: Partial<ResponseProgressRow> = {},
): ResponseProgressRow {
  return { capacity, isWalkUp: false, answer, ...extra };
}

/** `count` invitees of one capacity, `yes` of whom said yes and `no` of whom said no. */
function cohort(capacity: string, count: number, yes: number, no: number): ResponseProgressRow[] {
  return Array.from({ length: count }, (_, at) =>
    invitee(capacity, at < yes ? "yes" : at < yes + no ? "no" : null),
  );
}

describe("one block per capacity present in the audience", () => {
  it("shows Recruits, Players and Coaches in Stewart's order", () => {
    const blocks = responseProgressByCapacity([
      ...cohort("coach", 2, 1, 0),
      ...cohort("player", 4, 2, 1),
      ...cohort("recruit", 3, 1, 1),
    ]);

    expect(blocks.map((block) => block.label)).toEqual(["Recruits", "Players", "Coaches"]);
  });

  it("shows no block for a capacity nobody was invited under", () => {
    const blocks = responseProgressByCapacity(cohort("player", 3, 1, 0));

    expect(blocks.map((block) => block.capacity)).toEqual(["player"]);
  });

  it("shows Committee on the same terms as the rest", () => {
    const blocks = responseProgressByCapacity([
      ...cohort("player", 1, 1, 0),
      ...cohort("committee", 2, 0, 2),
    ]);

    expect(blocks.map((block) => block.label)).toEqual(["Players", "Committee"]);
    expect(blocks[1]).toMatchObject({ invited: 2, yes: 0, no: 2, percent: 100 });
  });

  it("returns nothing at all for an audience with no invitations", () => {
    expect(responseProgressByCapacity([])).toEqual([]);
  });
});

describe("what each block counts", () => {
  it("reads yes against invited, and no on its own", () => {
    const [block] = responseProgressByCapacity(cohort("player", 10, 4, 3));

    expect(block).toMatchObject({ invited: 10, yes: 4, no: 3, responded: 7 });
  });

  // "The block counts invitations, not people on the roster, so a late-added
  // invitee raises the denominator."
  it("raises the denominator when somebody is added late", () => {
    const before = responseProgressByCapacity(cohort("player", 4, 3, 0));
    const after = responseProgressByCapacity([
      ...cohort("player", 4, 3, 0),
      invitee("player", null),
    ]);

    expect(before[0].invited).toBe(4);
    expect(after[0].invited).toBe(5);
    expect(after[0].yes).toBe(3);
  });

  it("leaves a walk-up out of every block — they were never invited", () => {
    const blocks = responseProgressByCapacity([
      ...cohort("player", 2, 2, 0),
      invitee("player", null, { isWalkUp: true }),
    ]);

    expect(blocks[0].invited).toBe(2);
  });

  // LAN-420: "A person invited under two capacities counts once, under the
  // first of Recruits, Coaches, Players, Committee."
  it("counts a player who also coaches once, as a coach", () => {
    const blocks = responseProgressByCapacity([
      invitee("player", "yes", { capacities: ["player", "coach"] }),
    ]);

    expect(blocks.map((block) => block.capacity)).toEqual(["coach"]);
    expect(blocks[0]).toMatchObject({ invited: 1, yes: 1 });
  });

  it("counts a recruit who also plays once, as a recruit", () => {
    const blocks = responseProgressByCapacity([
      invitee("player", "no", { capacities: ["player", "recruit"] }),
    ]);

    expect(blocks.map((block) => block.capacity)).toEqual(["recruit"]);
  });

  it("ignores a capacity that is not one of the four", () => {
    expect(responseProgressByCapacity([invitee("visitor", "yes")])).toEqual([]);
  });
});

describe("the bar's colour — Stewart's gates at 50 % and 75 %", () => {
  it("is red below 50 %, orange to below 75 %, green at 75 % and above", () => {
    expect(responseBand(0)).toBe("low");
    expect(responseBand(49)).toBe("low");
    expect(responseBand(50)).toBe("middling");
    expect(responseBand(74)).toBe("middling");
    expect(responseBand(75)).toBe("high");
    expect(responseBand(100)).toBe("high");
  });

  // The issue's own acceptance: "bar colour at 40 %, 60 % and 80 % response".
  it("bands a 40 %, a 60 % and an 80 % block red, orange and green", () => {
    const [recruits] = responseProgressByCapacity(cohort("recruit", 10, 2, 2));
    const [players] = responseProgressByCapacity(cohort("player", 10, 4, 2));
    const [coaches] = responseProgressByCapacity(cohort("coach", 10, 6, 2));

    expect(recruits).toMatchObject({ percent: 40, band: "low" });
    expect(players).toMatchObject({ percent: 60, band: "middling" });
    expect(coaches).toMatchObject({ percent: 80, band: "high" });
  });

  it("does not round a block up over a gate", () => {
    // 3 of 4 is 75 and green; 2 of 3 is 66 and orange; 74.9 would be orange too.
    expect(responseProgressByCapacity(cohort("player", 4, 3, 0))[0]).toMatchObject({
      percent: 75,
      band: "high",
    });
    expect(responseProgressByCapacity(cohort("player", 3, 2, 0))[0]).toMatchObject({
      percent: 66,
      band: "middling",
    });
  });

  it("counts a no toward the bar exactly as a yes does", () => {
    // The bar is "have they answered", not "are they coming" — Stewart's
    // "TOTAL RESPONSES (Y+N) / TOTAL UNITS".
    const [block] = responseProgressByCapacity(cohort("player", 4, 0, 3));

    expect(block).toMatchObject({ yes: 0, no: 3, percent: 75, band: "high" });
  });
});
