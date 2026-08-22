/**
 * The headline numbers, counted — D62, D73 and D74, LAN-152.
 *
 * Pure, because the counting is. What the database has to prove — that the view
 * and this agree, and that the board never reports a mismatch against nothing —
 * is in `./attendance.test.ts`, against the real schema.
 */
import { describe, expect, it } from "vitest";

import {
  isShowedPresence,
  summariseAttendance,
  type AttendanceParticipant,
} from "./attendance-vocabulary";

function participant(overrides: Partial<AttendanceParticipant> = {}): AttendanceParticipant {
  return {
    key: "player:one",
    displayName: "Avery Fielding",
    capacity: "player",
    rsvp: null,
    isWalkUp: false,
    presence: null,
    recordedAt: null,
    recordedByName: null,
    mismatch: null,
    ...overrides,
  };
}

describe("who counts as having shown up", () => {
  it("counts Present and Late, and nothing else", () => {
    // `late` is the one worth stating. Arriving at 20:20 is arriving; the
    // distinction the club draws with the word is punctuality, not presence,
    // and a turnout figure that dropped it would report fewer people than the
    // coach watched walk onto the pitch.
    expect(isShowedPresence("present")).toBe(true);
    expect(isShowedPresence("late")).toBe(true);
    expect(isShowedPresence("excused")).toBe(false);
    expect(isShowedPresence("absent")).toBe(false);
  });

  it("does not count an unrecorded person as anything", () => {
    expect(isShowedPresence(null)).toBe(false);
  });
});

describe("the summary", () => {
  it("reports nothing recorded for a register nobody has opened", () => {
    const summary = summariseAttendance([
      participant({ key: "a", rsvp: "yes" }),
      participant({ key: "b", rsvp: "no" }),
      participant({ key: "c" }),
    ]);

    expect(summary).toEqual({
      invited: 3,
      saidYes: 1,
      showed: 0,
      recorded: 0,
      walkUps: 0,
      registerSaved: false,
    });
  });

  it("reports a real zero for a register saved with everybody absent", () => {
    // D74's whole point, as a pair of assertions rather than a sentence: the
    // two states below differ only in `registerSaved`, and `showed` is `0` in
    // both. The screen prints "—" for the first and "0" for the second, and
    // this is the value it decides on.
    const summary = summariseAttendance([
      participant({ key: "a", rsvp: "yes", presence: "absent" }),
      participant({ key: "b", rsvp: "yes", presence: "absent" }),
    ]);

    expect(summary.registerSaved).toBe(true);
    expect(summary.showed).toBe(0);
    expect(summary.recorded).toBe(2);
  });

  it("treats a partly-filled sheet as saved, because somebody opened it", () => {
    const summary = summariseAttendance([
      participant({ key: "a", presence: "present" }),
      participant({ key: "b" }),
      participant({ key: "c" }),
    ]);

    expect(summary.registerSaved).toBe(true);
    expect(summary.recorded).toBe(1);
    expect(summary.showed).toBe(1);
  });

  it("counts a walk-up as recorded and as having shown, but never as invited", () => {
    // Invariant P6: a walk-up has no invitation, so `Showed / Invited` can
    // legitimately read `4 / 3`. That is not an error to clamp — it is the
    // club discovering somebody turned up who was never asked.
    const summary = summariseAttendance([
      participant({ key: "a", rsvp: "yes", presence: "present" }),
      participant({ key: "w", isWalkUp: true, presence: "present" }),
    ]);

    expect(summary.invited).toBe(1);
    expect(summary.walkUps).toBe(1);
    expect(summary.showed).toBe(2);
    expect(summary.recorded).toBe(2);
  });

  it("never counts a walk-up's absent answer as a yes, because it has none", () => {
    const summary = summariseAttendance([
      participant({ key: "w", isWalkUp: true, rsvp: "yes", presence: "present" }),
    ]);

    // Belt and braces on the frozen model's wall: even a row that somehow
    // arrived carrying both an RSVP and no invitation is not counted among the
    // people who said yes, because saying yes is something an invitation
    // carries.
    expect(summary.saidYes).toBe(0);
  });

  it("is all zeroes, and unsaved, for an event with nobody on it", () => {
    expect(summariseAttendance([])).toEqual({
      invited: 0,
      saidYes: 0,
      showed: 0,
      recorded: 0,
      walkUps: 0,
      registerSaved: false,
    });
  });
});
