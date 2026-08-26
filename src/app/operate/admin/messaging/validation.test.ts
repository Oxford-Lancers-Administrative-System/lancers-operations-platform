import { describe, expect, it } from "vitest";
import {
  readScheduleChanges,
  scheduleChanged,
  scheduleFieldName,
  SCHEDULE_EVENT_TYPES,
} from "./validation";
import type { MessagingScheduleChange } from "@/lib/services/messaging-schedule";

const VALID: MessagingScheduleChange = {
  rsvpByDays: 2,
  invitationLeadDays: 5,
  reminderCadenceHours: 24,
  whatsappReminderCount: 2,
  emailReminderCount: 1,
  escalationHours: 12,
};

/** A complete, valid form submission — every one of the seven types, unchanged. */
function completeFormData(overrides: Record<string, string> = {}): FormData {
  const data = new FormData();
  for (const eventType of SCHEDULE_EVENT_TYPES) {
    data.set(scheduleFieldName(eventType, "rsvpByDays"), String(VALID.rsvpByDays));
    data.set(scheduleFieldName(eventType, "invitationLeadDays"), String(VALID.invitationLeadDays));
    data.set(
      scheduleFieldName(eventType, "reminderCadenceHours"),
      String(VALID.reminderCadenceHours),
    );
    data.set(
      scheduleFieldName(eventType, "whatsappReminderCount"),
      String(VALID.whatsappReminderCount),
    );
    data.set(scheduleFieldName(eventType, "emailReminderCount"), String(VALID.emailReminderCount));
    data.set(scheduleFieldName(eventType, "escalationHours"), String(VALID.escalationHours));
  }
  for (const [key, value] of Object.entries(overrides)) data.set(key, value);
  return data;
}

describe("readScheduleChanges", () => {
  it("reads all seven event types when every field is well formed", () => {
    const result = readScheduleChanges(completeFormData());

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.changes.size).toBe(7);
    expect(result.changes.get("practice")).toEqual(VALID);
  });

  it("refuses a blank field, naming the type and the field", () => {
    const result = readScheduleChanges(
      completeFormData({ [scheduleFieldName("game", "rsvpByDays")]: "" }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a refusal");
    expect(result.message).toMatch(/Game/);
    expect(result.message).toMatch(/player rsvp by/i);
  });

  it("refuses a non-integer value", () => {
    const result = readScheduleChanges(
      completeFormData({ [scheduleFieldName("social", "reminderCadenceHours")]: "24.5" }),
    );

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
    const result = readScheduleChanges(
      completeFormData({ [scheduleFieldName("chalk", field)]: value }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a refusal");
    expect(result.message).toMatch(/between/i);
  });

  it("refuses an invitation lead shorter than the RSVP deadline it precedes", () => {
    const result = readScheduleChanges(
      completeFormData({
        [scheduleFieldName("meeting", "rsvpByDays")]: "5",
        [scheduleFieldName("meeting", "invitationLeadDays")]: "3",
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a refusal");
    expect(result.message).toMatch(/on or before the RSVP deadline/);
  });

  it("accepts the invitation lead exactly equal to the RSVP deadline", () => {
    const result = readScheduleChanges(
      completeFormData({
        [scheduleFieldName("recruitment", "rsvpByDays")]: "5",
        [scheduleFieldName("recruitment", "invitationLeadDays")]: "5",
      }),
    );

    expect(result.ok).toBe(true);
  });
});

describe("scheduleChanged", () => {
  it("is false for two identical changes", () => {
    expect(scheduleChanged(VALID, { ...VALID })).toBe(false);
  });

  it("is true when exactly one field differs", () => {
    expect(scheduleChanged(VALID, { ...VALID, escalationHours: 6 })).toBe(true);
  });
});
