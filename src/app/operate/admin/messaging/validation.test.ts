import { describe, expect, it } from "vitest";
import { readOneScheduleChange, scheduleChanged, SCHEDULE_FIELDS } from "./validation";
import type { MessagingSchedule, MessagingScheduleChange } from "@/lib/services/messaging-schedule";

const VALID: MessagingScheduleChange = {
  rsvpByDays: 2,
  invitationLeadDays: 5,
  reminderCadenceHours: 24,
  whatsappReminderCount: 2,
  emailReminderCount: 1,
  escalationHours: 12,
};

/** `scheduleChanged`'s `current` reads a full stored row, not a bare change. */
const CURRENT: MessagingSchedule = {
  eventType: "practice",
  ...VALID,
  recruitInvitationLeadDays: null,
  recruitFollowUpCadenceHours: null,
  updatedAt: new Date("2026-08-25T00:00:00Z"),
};

/** One row's own form submission — every one of its six fields, well formed. */
function rowFormData(overrides: Record<string, string> = {}): FormData {
  const data = new FormData();
  data.set("rsvpByDays", String(VALID.rsvpByDays));
  data.set("invitationLeadDays", String(VALID.invitationLeadDays));
  data.set("reminderCadenceHours", String(VALID.reminderCadenceHours));
  data.set("whatsappReminderCount", String(VALID.whatsappReminderCount));
  data.set("emailReminderCount", String(VALID.emailReminderCount));
  data.set("escalationHours", String(VALID.escalationHours));
  for (const [key, value] of Object.entries(overrides)) data.set(key, value);
  return data;
}

describe("readOneScheduleChange", () => {
  it("reads one event type's row when every field is well formed", () => {
    const result = readOneScheduleChange("practice", rowFormData());

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.change).toEqual(VALID);
  });

  it("refuses a blank field, naming the type and the field", () => {
    const result = readOneScheduleChange("game", rowFormData({ rsvpByDays: "" }));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a refusal");
    expect(result.message).toMatch(/Game/);
    expect(result.message).toMatch(/player rsvp by/i);
  });

  it("refuses a non-integer value", () => {
    const result = readOneScheduleChange("social", rowFormData({ reminderCadenceHours: "24.5" }));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a refusal");
    expect(result.message).toMatch(/whole number/i);
  });

  it.each([
    ["rsvpByDays", "61"],
    ["invitationLeadDays", "121"],
    ["reminderCadenceHours", "0"],
    ["reminderCadenceHours", "721"],
    ["whatsappReminderCount", "11"],
    ["emailReminderCount", "-1"],
    ["escalationHours", "721"],
  ])("refuses %s out of its bounds (%s)", (field, value) => {
    const result = readOneScheduleChange("chalk", rowFormData({ [field]: value }));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a refusal");
    expect(result.message).toMatch(/between/i);
  });

  it("refuses an invitation lead shorter than the RSVP deadline it precedes", () => {
    const result = readOneScheduleChange(
      "meeting",
      rowFormData({ rsvpByDays: "5", invitationLeadDays: "3" }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a refusal");
    expect(result.message).toMatch(/on or before the RSVP deadline/);
  });

  it("accepts the invitation lead exactly equal to the RSVP deadline", () => {
    // Any event type but "recruitment" — LAN-203 gives that one two further
    // required fields (below), which is not what this case is testing.
    const result = readOneScheduleChange(
      "game",
      rowFormData({ rsvpByDays: "5", invitationLeadDays: "5" }),
    );

    expect(result.ok).toBe(true);
  });

  it("also reads the Recruits group's two fields on the Recruitment row alone", () => {
    const data = rowFormData();
    data.set("recruitInvitationLeadDays", "5");
    data.set("recruitFollowUpCadenceHours", "72");

    const result = readOneScheduleChange("recruitment", data);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.change.recruitInvitationLeadDays).toBe(5);
    expect(result.change.recruitFollowUpCadenceHours).toBe(72);
  });

  it("refuses the Recruitment row when the Recruits group is left blank", () => {
    const result = readOneScheduleChange("recruitment", rowFormData());

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a refusal");
    expect(result.message).toMatch(/recruits' first invitation/i);
  });

  it("leaves a non-Recruitment row's change with no recruit fields, even if the form somehow carried them", () => {
    const data = rowFormData();
    data.set("recruitInvitationLeadDays", "5");
    data.set("recruitFollowUpCadenceHours", "72");

    const result = readOneScheduleChange("game", data);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.change.recruitInvitationLeadDays).toBeUndefined();
    expect(result.change.recruitFollowUpCadenceHours).toBeUndefined();
  });
});

describe("SCHEDULE_FIELDS", () => {
  it("carries a short grid label and a unit for every day/hour field, and no unit for a plain count", () => {
    const byKey = Object.fromEntries(SCHEDULE_FIELDS.map((field) => [field.key, field]));

    expect(byKey.rsvpByDays).toMatchObject({ label: "RSVP by", unit: "days" });
    expect(byKey.invitationLeadDays).toMatchObject({ label: "First inv.", unit: "days" });
    expect(byKey.reminderCadenceHours).toMatchObject({ label: "Cadence", unit: "h" });
    expect(byKey.escalationHours).toMatchObject({ label: "President", unit: "h" });

    // Q-19 / OWNER-LAN171-05: the count includes the invitation, so the grid
    // label is "WhatsApp" alone, never "WhatsApp reminders".
    expect(byKey.whatsappReminderCount.label).toBe("WhatsApp");
    expect(byKey.whatsappReminderCount.label).not.toMatch(/reminder/i);
    expect(byKey.emailReminderCount.label).toBe("Email");

    // No label is truncated to an ellipsis anywhere in this table — Brian's
    // "WhatsApp reminde…" screenshot.
    for (const field of SCHEDULE_FIELDS) {
      expect(field.label).not.toMatch(/…/);
    }
  });

  it("explains what cadence, President escalation, WhatsApp and Email actually count (OWNER-LAN171-08)", () => {
    const byKey = Object.fromEntries(SCHEDULE_FIELDS.map((field) => [field.key, field]));

    expect(byKey.reminderCadenceHours.helperText).toMatch(/between messages/i);
    expect(byKey.escalationHours.helperText).toMatch(/after the rsvp deadline/i);
    expect(byKey.escalationHours.helperText).toMatch(/president is told/i);
    // Q-19: the WhatsApp count includes the invitation, so its explanation
    // must say so and must never call the invitation a reminder.
    expect(byKey.whatsappReminderCount.helperText).toMatch(/including the invitation/i);
    expect(byKey.whatsappReminderCount.helperText).not.toMatch(/reminder/i);
    expect(byKey.emailReminderCount.helperText).toBeTruthy();
  });
});

describe("scheduleChanged", () => {
  it("is false for two identical changes", () => {
    expect(scheduleChanged(CURRENT, { ...VALID })).toBe(false);
  });

  it("is true when exactly one field differs", () => {
    expect(scheduleChanged(CURRENT, { ...VALID, escalationHours: 6 })).toBe(true);
  });

  it("is false when a non-Recruitment row's proposed change carries no recruit fields", () => {
    // `recruitInvitationLeadDays`/`recruitFollowUpCadenceHours` are undefined
    // on every row's proposed change but the Recruitment row's own — they
    // must never be compared against `current`'s stored `null`.
    expect(scheduleChanged(CURRENT, { ...VALID })).toBe(false);
  });

  it("is true when the Recruitment row's own recruit fields change", () => {
    const recruitmentCurrent: MessagingSchedule = {
      ...CURRENT,
      eventType: "recruitment",
      recruitInvitationLeadDays: 5,
      recruitFollowUpCadenceHours: 72,
    };
    expect(
      scheduleChanged(recruitmentCurrent, {
        ...VALID,
        recruitInvitationLeadDays: 5,
        recruitFollowUpCadenceHours: 96,
      }),
    ).toBe(true);
    expect(
      scheduleChanged(recruitmentCurrent, {
        ...VALID,
        recruitInvitationLeadDays: 5,
        recruitFollowUpCadenceHours: 72,
      }),
    ).toBe(false);
  });
});
