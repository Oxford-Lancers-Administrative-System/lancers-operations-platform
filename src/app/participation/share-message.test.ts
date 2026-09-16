import { describe, expect, it } from "vitest";

import { buildShareMessage } from "./share-message";

/**
 * LAN-384. The copied text is exactly four lines: the event, when and where,
 * the two counts, and the link. No names, nothing else.
 */
describe("buildShareMessage", () => {
  const FACTS = {
    eventName: "Tuesday Practice",
    scheduledOn: "2026-10-14",
    startsAt: "20:00",
    endsAt: "22:30",
    venue: "University Parks",
    saidYes: 12,
    saidNo: 3,
    url: "https://lancers.example/e/TOKEN",
  };

  it("is the four lines, in order, and the seeded counts read as the issue writes them", () => {
    expect(buildShareMessage(FACTS)).toBe(
      [
        "Tuesday Practice",
        "Wednesday, 14 October, 20:00–22:30 at University Parks",
        "12 yes, 3 no so far",
        "https://lancers.example/e/TOKEN",
      ].join("\n"),
    );
    expect(buildShareMessage(FACTS).split("\n")).toHaveLength(4);
  });

  it("carries no name of anybody", () => {
    expect(buildShareMessage(FACTS)).not.toMatch(/[A-Z][a-z]+ [A-Z][a-z]+ said/);
  });

  it("drops the parts an event does not carry rather than inventing them", () => {
    expect(buildShareMessage({ ...FACTS, scheduledOn: null, startsAt: null, endsAt: null })).toBe(
      ["Tuesday Practice", "University Parks", "12 yes, 3 no so far", FACTS.url].join("\n"),
    );
    expect(buildShareMessage({ ...FACTS, venue: null }).split("\n")[1]).toBe(
      "Wednesday, 14 October, 20:00–22:30",
    );
    expect(buildShareMessage({ ...FACTS, endsAt: null }).split("\n")[1]).toBe(
      "Wednesday, 14 October, 20:00 at University Parks",
    );
  });

  it("reads zero as zero, never as an absence", () => {
    expect(buildShareMessage({ ...FACTS, saidYes: 0, saidNo: 0 }).split("\n")[2]).toBe(
      "0 yes, 0 no so far",
    );
  });
});
