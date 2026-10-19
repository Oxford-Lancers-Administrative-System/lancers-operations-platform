// @vitest-environment node
/**
 * LAN-504 — an occurred event's attendance per group, counted directly. Pure.
 */
import { describe, expect, it } from "vitest";

import type { AttendancePresence } from "./attendance-vocabulary";
import {
  attendanceProgressByCapacity,
  showsAttendanceProgress,
  type AttendanceProgressRow,
} from "./event-attendance-progress";
import { responseProgressByCapacity } from "./event-response-progress";

function row(
  capacity: string,
  presence: AttendancePresence | null,
  extra: Partial<AttendanceProgressRow> = {},
): AttendanceProgressRow {
  return { capacity, isWalkUp: false, answer: null, presence, ...extra };
}

describe("attendance per group", () => {
  it("counts the four values and the not-recorded remainder, adding up to the group", () => {
    const [players] = attendanceProgressByCapacity([
      row("player", "present"),
      row("player", "present"),
      row("player", "late"),
      row("player", "absent"),
      row("player", "excused"),
      row("player", null),
      row("player", null),
    ]);

    expect(players).toMatchObject({
      capacity: "player",
      label: "Players",
      total: 7,
      present: 2,
      late: 1,
      noShow: 1,
      excused: 1,
      notRecorded: 2,
    });
    expect(
      players.present + players.late + players.noShow + players.excused + players.notRecorded,
    ).toBe(players.total);
  });

  it("counts from the attendance record, never the RSVP", () => {
    const [players] = attendanceProgressByCapacity([
      row("player", "present", { answer: "no" }),
      row("player", "absent", { answer: "yes" }),
      row("player", "late", { answer: null }),
      row("player", null, { answer: "yes" }),
    ]);

    expect(players).toMatchObject({ present: 1, late: 1, noShow: 1, notRecorded: 1, total: 4 });
  });

  it("uses the RSVP blocks' groups, order and denominators — committee folds, walk-ups are out", () => {
    const rows = [
      row("coach", "present"),
      row("committee", "late"),
      row("committee", "present", { countsAsCoach: true }),
      row("player", null),
      row("recruit", "absent"),
      row("player", "present", { isWalkUp: true }),
    ];

    const attendance = attendanceProgressByCapacity(rows);
    const rsvp = responseProgressByCapacity(rows);

    expect(attendance.map((block) => block.label)).toEqual(["Recruits", "Players", "Coaches"]);
    expect(attendance.map((block) => block.total)).toEqual(rsvp.map((block) => block.invited));
    expect(attendance[1]).toMatchObject({ late: 1, notRecorded: 1, total: 2 });
    expect(attendance[2]).toMatchObject({ present: 2, total: 2 });
  });

  it("shows no block for a group nobody was invited under", () => {
    expect(attendanceProgressByCapacity([row("player", "present")]).map((b) => b.capacity)).toEqual(
      ["player"],
    );
    expect(attendanceProgressByCapacity([])).toEqual([]);
  });
});

describe("which events show it", () => {
  const TODAY = "2026-10-21";

  it("shows on an approved event that has occurred", () => {
    expect(showsAttendanceProgress({ status: "approved", scheduledOn: "2026-10-20" }, TODAY)).toBe(
      true,
    );
  });

  it("does not show on an upcoming, today's, cancelled or draft event", () => {
    expect(showsAttendanceProgress({ status: "approved", scheduledOn: "2026-10-22" }, TODAY)).toBe(
      false,
    );
    expect(showsAttendanceProgress({ status: "approved", scheduledOn: TODAY }, TODAY)).toBe(false);
    expect(showsAttendanceProgress({ status: "cancelled", scheduledOn: "2026-10-20" }, TODAY)).toBe(
      false,
    );
    expect(showsAttendanceProgress({ status: "draft", scheduledOn: "2026-10-20" }, TODAY)).toBe(
      false,
    );
  });
});
