/**
 * Lights-out's own arithmetic — LAN-433. Pure: no database, no clock but the
 * instants each test names. The dispatch-time hold itself is proved against
 * the database in `messaging-scheduler.test.ts`.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { TEMPLATE_NAMES } from "@/lib/delivery/templates";
import type { MessageKind } from "@/lib/delivery/provider";
import { backoffFrom } from "../delivery";
import {
  JOB_TYPE_MESSAGE_KINDS,
  LIGHTS_OUT_EXEMPT,
  LIGHTS_OUT_EXEMPT_JOB_TYPES,
  isJobTypeLightsOutExempt,
  isLightsOut,
  lastLightsOutReleaseAt,
  lightsOutReleaseAt,
} from "./lights-out";

/** 2026-10-01 is BST (UTC+1): London wall-clock HH:MM on that day, as an instant. */
function bst(hhmm: string, day = "2026-10-01"): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const [y, mo, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h - 1, m));
}

/** 2026-12-01 is GMT (UTC+0). */
function gmt(hhmm: string, day = "2026-12-01"): Date {
  return new Date(`${day}T${hhmm}:00Z`);
}

describe("isLightsOut — 22:00 inclusive to 07:00 exclusive, club time", () => {
  it.each([
    ["21:59", false],
    ["22:00", true],
    ["22:01", true],
    ["23:59", true],
    ["00:00", true],
    ["06:59", true],
    ["07:00", false],
    ["12:00", false],
  ])("at %s BST it reads %s", (hhmm, expected) => {
    expect(isLightsOut(bst(hhmm))).toBe(expected);
  });

  it.each([
    ["21:59", false],
    ["22:00", true],
    ["06:59", true],
    ["07:00", false],
  ])("at %s GMT it reads %s", (hhmm, expected) => {
    expect(isLightsOut(gmt(hhmm))).toBe(expected);
  });

  it("follows the club's clock, not UTC: 21:30 UTC in summer is 22:30 in Oxford", () => {
    expect(isLightsOut(new Date("2026-07-01T21:30:00Z"))).toBe(true);
    expect(isLightsOut(new Date("2026-07-01T06:30:00Z"))).toBe(false);
  });
});

describe("lightsOutReleaseAt — the next 07:00", () => {
  it("is now itself outside the window", () => {
    const at = bst("21:59");
    expect(lightsOutReleaseAt(at)).toEqual(at);
  });

  it("is tomorrow's 07:00 from 22:00 or 22:01", () => {
    expect(lightsOutReleaseAt(bst("22:00"))).toEqual(bst("07:00", "2026-10-02"));
    expect(lightsOutReleaseAt(bst("22:01"))).toEqual(bst("07:00", "2026-10-02"));
  });

  it("is this morning's 07:00 from 06:59", () => {
    expect(lightsOutReleaseAt(bst("06:59"))).toEqual(bst("07:00"));
    expect(lightsOutReleaseAt(gmt("06:59"))).toEqual(gmt("07:00"));
  });

  it("rolls over the end of a month and a year", () => {
    expect(lightsOutReleaseAt(bst("23:00", "2026-09-30"))).toEqual(bst("07:00", "2026-10-01"));
    expect(lightsOutReleaseAt(gmt("23:00", "2026-12-31"))).toEqual(gmt("07:00", "2027-01-01"));
  });
});

describe("the two clock-change nights read as the wall clock says", () => {
  it("BST to GMT, 2026-10-25: 22:00 BST on the 24th to 07:00 GMT on the 25th", () => {
    const tenPm = new Date("2026-10-24T21:00:00Z"); // 22:00 BST
    expect(isLightsOut(new Date("2026-10-24T20:59:00Z"))).toBe(false); // 21:59 BST
    expect(isLightsOut(tenPm)).toBe(true);
    // 01:30 happens twice that night; both are inside.
    expect(isLightsOut(new Date("2026-10-25T00:30:00Z"))).toBe(true);
    expect(isLightsOut(new Date("2026-10-25T01:30:00Z"))).toBe(true);
    expect(isLightsOut(new Date("2026-10-25T06:59:00Z"))).toBe(true); // 06:59 GMT
    expect(isLightsOut(new Date("2026-10-25T07:00:00Z"))).toBe(false); // 07:00 GMT
    expect(lightsOutReleaseAt(tenPm)).toEqual(new Date("2026-10-25T07:00:00Z"));
  });

  it("GMT to BST, 2027-03-28: 22:00 GMT on the 27th to 07:00 BST on the 28th", () => {
    const tenPm = new Date("2027-03-27T22:00:00Z"); // 22:00 GMT
    expect(isLightsOut(new Date("2027-03-27T21:59:00Z"))).toBe(false);
    expect(isLightsOut(tenPm)).toBe(true);
    expect(isLightsOut(new Date("2027-03-28T05:59:00Z"))).toBe(true); // 06:59 BST
    expect(isLightsOut(new Date("2027-03-28T06:00:00Z"))).toBe(false); // 07:00 BST
    expect(lightsOutReleaseAt(tenPm)).toEqual(new Date("2027-03-28T06:00:00Z"));
  });
});

describe("a retry cannot bypass the hold", () => {
  it("a backoff that lands inside the window is held until the next 07:00", () => {
    const failedAt = bst("21:55");
    const retryAt = backoffFrom(1, failedAt);
    expect(retryAt.getTime()).toBeGreaterThanOrEqual(bst("22:00").getTime());
    expect(isLightsOut(retryAt)).toBe(true);
    expect(lightsOutReleaseAt(retryAt)).toEqual(bst("07:00", "2026-10-02"));
  });
});

describe("lastLightsOutReleaseAt — where the queue-age warning starts counting", () => {
  it("is this morning's 07:00 in the daytime and yesterday's overnight", () => {
    expect(lastLightsOutReleaseAt(bst("07:30"))).toEqual(bst("07:00"));
    expect(lastLightsOutReleaseAt(bst("23:00"))).toEqual(bst("07:00"));
    expect(lastLightsOutReleaseAt(bst("03:00", "2026-10-02"))).toEqual(bst("07:00"));
  });
});

describe("exactly three message kinds go at any hour", () => {
  it("names every kind, and exempts only the three an operator sent", () => {
    const every = Object.keys(TEMPLATE_NAMES).sort();
    expect(Object.keys(LIGHTS_OUT_EXEMPT).sort()).toEqual(every);
    expect(every).toEqual(
      [
        "cancellation",
        "change_notice",
        "escalation",
        "invitation",
        "nudge",
        "onboarding_chase",
        "onboarding_chase_escalation",
        "onboarding_welcome",
        "question_change",
        "recruit_details_reminder",
        "recruit_event_followup",
        "recruit_interest_ask",
        "recruit_interest_reminder",
        "recruit_welcome",
        "reminder",
      ].sort(),
    );
    const exempt = (Object.keys(LIGHTS_OUT_EXEMPT) as MessageKind[]).filter(
      (kind) => LIGHTS_OUT_EXEMPT[kind],
    );
    expect(exempt.sort()).toEqual(["cancellation", "change_notice", "question_change"]);
  });

  it("maps every kind to a job type, and exempts only the three notice job types", () => {
    const mapped = new Set(Object.values(JOB_TYPE_MESSAGE_KINDS).flat());
    expect([...mapped].sort()).toEqual(Object.keys(TEMPLATE_NAMES).sort());
    expect([...LIGHTS_OUT_EXEMPT_JOB_TYPES].sort()).toEqual([
      "cancellation_notice",
      "question_change_notice",
      "schedule_change_notice",
    ]);
    expect(isJobTypeLightsOutExempt("reminder")).toBe(false);
    expect(isJobTypeLightsOutExempt("other")).toBe(false);
    expect(isJobTypeLightsOutExempt("a_type_nobody_has_added_yet")).toBe(false);
  });
});
