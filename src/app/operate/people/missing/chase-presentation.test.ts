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
    expect(formatChaseNext({ kind: "unmessageable", reason: "under_18" })).toBe(
      "Unmessageable · under 18",
    );
    expect(
      formatChaseNext({ kind: "terminal_failure", reason: "WhatsApp could not deliver." }),
    ).toBe("Delivery failed · WhatsApp could not deliver.");
    expect(formatChaseNext({ kind: "no_automated_chase" })).toBe("No automated chase");
  });

  // Correction round 1, C-1 (Brian, 2026-09-03 walkthrough): Jorvik
  // Kirkbride and Kenelm Netherby, an email and no phone, "his nudge
  // reported failed" — the row must plainly say there is no number, not
  // reuse the generic "Unmessageable" wording.
  it("names a missing number plainly — C-1", () => {
    expect(formatChaseNext({ kind: "unmessageable", reason: "no_channel" })).toBe(
      "No phone number on file",
    );
  });

  // Correction round 1, C-5: the real, stored reason is shown, never the old
  // fixed "needs a person" text — and a defensive fallback for the one case
  // that should never occur in practice, a terminally failed attempt with no
  // recorded reason at all.
  it("falls back to a plain statement when a terminal failure carries no recorded reason — C-5", () => {
    expect(formatChaseNext({ kind: "terminal_failure", reason: null })).toBe(
      "Delivery failed · the reason was not recorded",
    );
  });
});

describe("chaseNeedsAHuman", () => {
  it("flags exactly the three states a human has to work", () => {
    expect(chaseNeedsAHuman({ kind: "exhausted" })).toBe(true);
    expect(chaseNeedsAHuman({ kind: "unmessageable", reason: "no_channel" })).toBe(true);
    expect(chaseNeedsAHuman({ kind: "unmessageable", reason: "under_18" })).toBe(true);
    expect(chaseNeedsAHuman({ kind: "terminal_failure", reason: null })).toBe(true);
    expect(chaseNeedsAHuman({ kind: "scheduled", at: new Date() })).toBe(false);
    expect(chaseNeedsAHuman({ kind: "no_automated_chase" })).toBe(false);
  });
});

describe("isNudgeable", () => {
  it("offers a nudge for every state except unmessageable — the queue warns, it never refuses", () => {
    expect(isNudgeable({ kind: "exhausted" })).toBe(true);
    expect(isNudgeable({ kind: "terminal_failure", reason: null })).toBe(true);
    expect(isNudgeable({ kind: "scheduled", at: new Date() })).toBe(true);
    expect(isNudgeable({ kind: "no_automated_chase" })).toBe(true);
    expect(isNudgeable({ kind: "unmessageable", reason: "under_18" })).toBe(false);
  });

  // Correction round 1, C-1/C-3: no number, no nudge offered at all —
  // "nudge doesn't do anything… the president needs to go off and get their
  // real phone number."
  it("refuses a nudge when there is no reachable number — C-1/C-3", () => {
    expect(isNudgeable({ kind: "unmessageable", reason: "no_channel" })).toBe(false);
  });
});
