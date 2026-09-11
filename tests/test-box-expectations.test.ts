// @vitest-environment node
import { describe, it, expect } from "vitest";
import { plannedRungs, compareExpectation } from "../scripts/test-box/expectations.mjs";
describe("LAN-222 independent expectations", () => {
  it("finds an absent invitation without depending on a job existing", () => {
    const expected = plannedRungs({
      capacity: "player",
      invitation_at: "2026-09-10T12:00:00Z",
      reminder_cadence_hours: 24,
      whatsapp_reminders_scheduled: 2,
      email_reminders_scheduled: 1,
    });
    expect(expected.map((r) => [r.channel, r.at])).toEqual([
      ["whatsapp", "2026-09-10T12:00:00.000Z"],
      ["whatsapp", "2026-09-11T12:00:00.000Z"],
      ["whatsapp", "2026-09-12T12:00:00.000Z"],
      ["email", "2026-09-13T12:00:00.000Z"],
    ]);
    expect(compareExpectation(expected[0], null, Date.parse("2026-09-10T13:00:00Z"))).toBe(
      "missing",
    );
  });
  it("keeps the recruit ladder separate", () =>
    expect(
      plannedRungs({
        capacity: "recruit",
        invitation_at: "2026-09-10T12:00:00Z",
        recruit_invitation_at: "2026-09-11T12:00:00Z",
        recruit_follow_up_at: null,
      }),
    ).toHaveLength(1));
  it("distinguishes reminders sent before and after an answer", () => {
    const expected = { at: "2026-09-11T12:00:00Z", withheldSince: "2026-09-11T13:00:00Z" };
    expect(compareExpectation(expected, { accepted_at: "2026-09-11T12:00:00Z" }, 0)).toBe(
      "observed",
    );
    expect(compareExpectation(expected, { accepted_at: "2026-09-11T14:00:00Z" }, 0)).toBe(
      "unexpected",
    );
    expect(compareExpectation(expected, { status: "cancelled" }, 0)).toBe("correctly_withheld");
  });
});
