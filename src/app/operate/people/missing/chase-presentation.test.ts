import { describe, expect, it } from "vitest";
import {
  chaseNeedsAHuman,
  formatChaseNext,
  formatLastContact,
  isNudgeable,
  NOT_YET_CONTACTED,
} from "./chase-presentation";

describe("formatLastContact", () => {
  it("names nobody contacted yet in words, not a blank cell", () => {
    expect(formatLastContact(null)).toBe(NOT_YET_CONTACTED);
  });

  it("names the welcome", () => {
    expect(
      formatLastContact({
        occurredAt: new Date("2026-08-12T09:00:00Z"),
        kind: "welcome",
        ordinal: null,
        byDisplayName: null,
      }),
    ).toBe("The welcome · 12 Aug 2026");
  });

  it("numbers a follow-up", () => {
    expect(
      formatLastContact({
        occurredAt: new Date("2026-08-26T09:00:00Z"),
        kind: "follow_up",
        ordinal: 2,
        byDisplayName: null,
      }),
    ).toBe("Follow-up 2 · 26 Aug 2026");
  });

  it("names the operator who nudged", () => {
    expect(
      formatLastContact({
        occurredAt: new Date("2026-09-01T18:00:00Z"),
        kind: "nudge",
        ordinal: null,
        byDisplayName: "Caspian",
      }),
    ).toBe("Nudge by Caspian · 1 Sept 2026");
  });
});

describe("formatChaseNext", () => {
  it("names a future scheduled date", () => {
    expect(formatChaseNext({ kind: "scheduled", at: new Date("2026-09-02T00:00:00Z") })).toBe(
      "2 Sept 2026",
    );
  });

  it("distinguishes exhausted, unmessageable and terminal failure — three different statements", () => {
    expect(formatChaseNext({ kind: "exhausted" })).toBe("Chase exhausted");
    expect(formatChaseNext({ kind: "unmessageable", reason: "no_consent" })).toBe(
      "Unmessageable · no consent",
    );
    expect(formatChaseNext({ kind: "unmessageable", reason: "under_18" })).toBe(
      "Unmessageable · under 18",
    );
    expect(formatChaseNext({ kind: "terminal_failure" })).toBe("Delivery failed · needs a person");
    expect(formatChaseNext({ kind: "no_automated_chase" })).toBe("No automated chase");
  });
});

describe("chaseNeedsAHuman", () => {
  it("flags exactly the three states a human has to work", () => {
    expect(chaseNeedsAHuman({ kind: "exhausted" })).toBe(true);
    expect(chaseNeedsAHuman({ kind: "unmessageable", reason: "no_consent" })).toBe(true);
    expect(chaseNeedsAHuman({ kind: "terminal_failure" })).toBe(true);
    expect(chaseNeedsAHuman({ kind: "scheduled", at: new Date() })).toBe(false);
    expect(chaseNeedsAHuman({ kind: "no_automated_chase" })).toBe(false);
  });
});

describe("isNudgeable", () => {
  it("offers a nudge for every state except unmessageable — the queue warns, it never refuses", () => {
    expect(isNudgeable({ kind: "exhausted" })).toBe(true);
    expect(isNudgeable({ kind: "terminal_failure" })).toBe(true);
    expect(isNudgeable({ kind: "scheduled", at: new Date() })).toBe(true);
    expect(isNudgeable({ kind: "no_automated_chase" })).toBe(true);
    expect(isNudgeable({ kind: "unmessageable", reason: "no_consent" })).toBe(false);
    expect(isNudgeable({ kind: "unmessageable", reason: "under_18" })).toBe(false);
  });
});
