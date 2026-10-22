// @vitest-environment node
/**
 * LAN-504 — an occurred event's attendance per group, counted directly. Pure.
 * Brian's walk of 22 October 2026: attended = present + late; expected = said
 * yes, plus anyone marked present or late who did not.
 */
import { describe, expect, it } from "vitest";

import type { AttendancePresence } from "./attendance-vocabulary";
import {
  attendanceProgressByCapacity,
  formatAttendanceHeadline,
  showsAttendanceProgress,
  tallyAttendance,
  type AttendanceProgressRow,
} from "./event-attendance-progress";
import { responseProgressByCapacity } from "./event-response-progress";

function row(
  capacity: string,
  presence: AttendancePresence | null,
  answer: AttendanceProgressRow["answer"] = null,
  extra: Partial<AttendanceProgressRow> = {},
): AttendanceProgressRow {
  return { capacity, isWalkUp: false, answer, presence, displayName: "Somebody", ...extra };
}

describe("attended and expected", () => {
  it("attended is present plus late; expected is everyone who said yes plus anyone marked present or late", () => {
    const tally = tallyAttendance([
      row("player", "present", "yes"),
      row("player", "late", "yes"),
      row("player", "absent", "yes"),
      row("player", null, "yes"),
      row("player", "excused", "yes"),
      // Came without saying yes: a walk-up, said no, no answer.
      row("player", "present", null, { isWalkUp: true }),
      row("player", "present", "no"),
      row("player", "late", null),
    ]);

    expect(tally).toEqual({
      attended: 5,
      expected: 8,
      present: 3,
      late: 2,
      noShow: 2,
      excused: 1,
    });
    expect(formatAttendanceHeadline(tally)).toBe("5 attended / 8 expected");
  });

  it("a said-yes person with no register mark is a no-show", () => {
    expect(tallyAttendance([row("player", null, "yes")])).toMatchObject({
      noShow: 1,
      expected: 1,
      attended: 0,
    });
  });

  it("counts nobody who is not expected: said no or never answered and not marked present or late", () => {
    expect(
      tallyAttendance([
        row("player", null, "no"),
        row("player", null, null),
        row("player", "absent", "no"),
        row("player", "absent", null),
        row("player", "excused", "no"),
        row("player", "excused", null),
      ]),
    ).toEqual({ attended: 0, expected: 0, present: 0, late: 0, noShow: 0, excused: 0 });
  });

  it("the four counts always add up to expected", () => {
    const t = tallyAttendance([
      row("player", "present", "no"),
      row("player", "absent", "yes"),
      row("player", "late"),
      row("player", "excused", "yes"),
      row("player", null, "yes"),
      row("player", null),
    ]);
    expect(t.present + t.late + t.noShow + t.excused).toBe(t.expected);
    expect(t.attended).toBe(t.present + t.late);
  });
});

describe("attendance per group", () => {
  it("counts a walk-up, somebody who said no but came, and somebody who never answered but came", () => {
    const [recruits, players] = attendanceProgressByCapacity([
      row("recruit", "present", null, { isWalkUp: true, displayName: "Walker" }),
      row("player", "present", "no", { displayName: "Said No" }),
      row("player", "late", null, { displayName: "No Answer" }),
      row("player", null, "yes", { displayName: "Unmarked" }),
      row("player", "excused", "yes", { displayName: "Away" }),
    ]);

    expect(recruits).toMatchObject({ capacity: "recruit", attended: 1, expected: 1, present: 1 });
    expect(recruits.names.present).toEqual(["Walker"]);
    expect(players).toMatchObject({
      capacity: "player",
      label: "Players",
      attended: 2,
      expected: 4,
      present: 1,
      late: 1,
      noShow: 1,
      excused: 1,
    });
    expect(players.names).toEqual({
      present: ["Said No"],
      late: ["No Answer"],
      noShow: ["Unmarked"],
      excused: ["Away"],
    });
  });

  it("the coach example: one coach said yes, two came, so 2 attended / 2 expected, both present", () => {
    const [coaches] = attendanceProgressByCapacity([
      row("coach", "present", "yes"),
      row("coach", "present", null),
    ]);
    expect(formatAttendanceHeadline(coaches)).toBe("2 attended / 2 expected");
    expect(coaches).toMatchObject({ present: 2, late: 0, noShow: 0, excused: 0 });
  });

  it("lists names A-Z within each bucket", () => {
    const [players] = attendanceProgressByCapacity([
      row("player", "present", "yes", { displayName: "Zed" }),
      row("player", "present", "yes", { displayName: "Abe" }),
    ]);
    expect(players.names.present).toEqual(["Abe", "Zed"]);
  });

  it("uses the RSVP cards' groups and order, folding committee as they do", () => {
    const rows = [
      row("coach", "present", "yes"),
      row("committee", "late", "yes"),
      row("committee", "present", "yes", { countsAsCoach: true }),
      row("player", null, "yes"),
      row("recruit", "absent", "yes"),
    ];

    const attendance = attendanceProgressByCapacity(rows);
    const rsvp = responseProgressByCapacity(rows);

    expect(attendance.map((block) => block.label)).toEqual(["Recruits", "Players", "Coaches"]);
    expect(attendance.map((block) => block.expected)).toEqual(rsvp.map((block) => block.yes));
    expect(attendance[1]).toMatchObject({ late: 1, noShow: 1, expected: 2 });
    expect(attendance[2]).toMatchObject({ present: 2, expected: 2 });
  });

  it("shows no card for a group nobody is expected in", () => {
    expect(
      attendanceProgressByCapacity([row("player", "present", "yes")]).map((b) => b.capacity),
    ).toEqual(["player"]);
    expect(attendanceProgressByCapacity([row("coach", null, "no")])).toEqual([]);
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
