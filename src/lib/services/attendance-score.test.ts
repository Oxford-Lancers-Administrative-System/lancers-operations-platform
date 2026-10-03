// @vitest-environment node
/**
 * The attendance score's rule — LAN-457, Brian's rule of 2 October 2026. Pure:
 * every case the ticket names, against `scoreAttendance` alone.
 */
import { describe, expect, it } from "vitest";
import {
  attendanceRatio,
  BPS_EVENT_TYPE,
  formatAttendanceTally,
  scoreAttendance,
  type AttendanceScoreInput,
} from "./attendance-score";

const TODAY = "2026-10-02";

function invitation(overrides: Partial<AttendanceScoreInput> = {}): AttendanceScoreInput {
  return {
    isMandatory: true,
    eventType: "practice",
    eventStatus: "approved",
    scheduledOn: "2026-09-20",
    capacity: "player",
    messaged: true,
    presence: "present",
    ...overrides,
  };
}

describe("scoreAttendance — LAN-457", () => {
  it("counts Present and Late as attended", () => {
    const score = scoreAttendance(
      [invitation({ presence: "present" }), invitation({ presence: "late" })],
      TODAY,
    );
    expect(score.mandatory).toEqual({ attended: 2, counted: 2 });
  });

  it("removes Excused from the equation entirely: ten mandatory, nine attended, one excused is 9/9", () => {
    const inputs = [
      ...Array.from({ length: 9 }, () => invitation({ presence: "present" })),
      invitation({ presence: "excused" }),
    ];
    expect(scoreAttendance(inputs, TODAY).mandatory).toEqual({ attended: 9, counted: 9 });
  });

  it("counts an unexcused Absent against the player: in the bottom number, not the top", () => {
    const score = scoreAttendance(
      [invitation({ presence: "present" }), invitation({ presence: "absent" })],
      TODAY,
    );
    expect(score.mandatory).toEqual({ attended: 1, counted: 2 });
  });

  it("treats an invitation never messaged as excused, even when the register marks it", () => {
    const score = scoreAttendance(
      [
        invitation({ presence: "present" }),
        invitation({ messaged: false, presence: "absent" }),
        invitation({ messaged: false, presence: "present" }),
      ],
      TODAY,
    );
    expect(score.all).toEqual({ attended: 1, counted: 1 });
  });

  it("leaves out a happened event with no register mark", () => {
    const score = scoreAttendance(
      [invitation({ presence: "present" }), invitation({ presence: null })],
      TODAY,
    );
    expect(score.all).toEqual({ attended: 1, counted: 1 });
  });

  it("leaves out an event that has not happened, and one that was cancelled", () => {
    const score = scoreAttendance(
      [
        invitation({ presence: "present" }),
        invitation({ scheduledOn: "2026-10-09", presence: "absent" }),
        invitation({ scheduledOn: null, presence: "absent" }),
        invitation({ eventStatus: "cancelled", presence: "absent" }),
        invitation({ eventStatus: "draft", presence: "absent" }),
      ],
      TODAY,
    );
    expect(score.all).toEqual({ attended: 1, counted: 1 });
  });

  it("counts today's event once its register is marked", () => {
    const score = scoreAttendance([invitation({ scheduledOn: TODAY, presence: "absent" })], TODAY);
    expect(score.all).toEqual({ attended: 0, counted: 1 });
  });

  it("counts only invitations made to the player as a player", () => {
    const score = scoreAttendance(
      [
        invitation({ presence: "present" }),
        invitation({ capacity: "committee", presence: "absent" }),
      ],
      TODAY,
    );
    expect(score.all).toEqual({ attended: 1, counted: 1 });
  });

  it("splits Mandatory, BPS (strength and conditioning) and All events", () => {
    const score = scoreAttendance(
      [
        invitation({ isMandatory: true, presence: "present" }),
        invitation({ isMandatory: false, eventType: BPS_EVENT_TYPE, presence: "present" }),
        invitation({ isMandatory: false, eventType: BPS_EVENT_TYPE, presence: "absent" }),
        invitation({ isMandatory: true, eventType: BPS_EVENT_TYPE, presence: "late" }),
        invitation({ isMandatory: false, eventType: "social", presence: "absent" }),
      ],
      TODAY,
    );
    expect(score.mandatory).toEqual({ attended: 2, counted: 2 });
    expect(score.bps).toEqual({ attended: 2, counted: 3 });
    expect(score.all).toEqual({ attended: 3, counted: 5 });
  });

  it("is zero over zero for a player with nothing counted", () => {
    const score = scoreAttendance([invitation({ presence: "excused" })], TODAY);
    expect(score.all).toEqual({ attended: 0, counted: 0 });
    expect(attendanceRatio(score.all)).toBeNull();
    expect(formatAttendanceTally(score.all)).toBeNull();
  });
});

describe("formatAttendanceTally", () => {
  it("prints the ticket's own figures", () => {
    expect(formatAttendanceTally({ attended: 9, counted: 9 })).toBe("9/9 · 100%");
    expect(formatAttendanceTally({ attended: 4, counted: 6 })).toBe("4/6 · 67%");
    expect(formatAttendanceTally({ attended: 18, counted: 25 })).toBe("18/25 · 72%");
  });
});
