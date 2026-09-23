// @vitest-environment node
/**
 * LAN-420 — the per-capacity counting, tested directly.
 *
 * The screens prove that the blocks render; this proves what they say. Pure —
 * no database, no React.
 */
import { describe, expect, it } from "vitest";

import { responseProgressByCapacity, type ResponseProgressRow } from "./event-response-progress";

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

/**
 * The three widths the bar is drawn from — LAN-420, Brian's walk of 573bb9d4.
 *
 * There is no band and no gate any more, so there is nothing here that decides
 * a colour. What the bar needs is three counts that sum to `invited`, and that
 * is the property worth holding: the component hands `yes`, the remainder and
 * `no` straight to `flexGrow`, so if they ever stopped summing to the whole the
 * segments would silently stop being proportional to invited.
 */
describe("what the bar is drawn from", () => {
  it("leaves yes, no and the unanswered remainder summing to invited", () => {
    for (const block of responseProgressByCapacity([
      ...cohort("recruit", 10, 2, 2),
      ...cohort("player", 7, 7, 0),
      ...cohort("coach", 3, 0, 0),
    ])) {
      expect(block.yes + block.no + (block.invited - block.responded)).toBe(block.invited);
    }
  });

  it("leaves no remainder at all once everybody has answered", () => {
    const [block] = responseProgressByCapacity(cohort("player", 5, 3, 2));

    expect(block).toMatchObject({ invited: 5, yes: 3, no: 2, responded: 5, percent: 100 });
    expect(block.invited - block.responded).toBe(0);
  });

  it("leaves the whole width unanswered when nobody has answered", () => {
    const [block] = responseProgressByCapacity(cohort("recruit", 8, 0, 0));

    expect(block).toMatchObject({ invited: 8, yes: 0, no: 0, responded: 0, percent: 0 });
    expect(block.invited - block.responded).toBe(8);
  });

  it("counts a no toward responded exactly as a yes does", () => {
    // Answering is answering, whichever way — Stewart's "TOTAL RESPONSES
    // (Y+N) / TOTAL UNITS". What changed is only that it no longer buys a
    // colour: three of four answering is a bar three quarters coloured, and
    // all three of them said no.
    const [block] = responseProgressByCapacity(cohort("player", 4, 0, 3));

    expect(block).toMatchObject({ yes: 0, no: 3, responded: 3, percent: 75 });
  });

  it("does not round the figure up over a person", () => {
    expect(responseProgressByCapacity(cohort("player", 4, 3, 0))[0].percent).toBe(75);
    expect(responseProgressByCapacity(cohort("player", 3, 2, 0))[0].percent).toBe(66);
  });
});
