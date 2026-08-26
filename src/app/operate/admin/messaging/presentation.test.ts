import { describe, expect, it } from "vitest";
import { buildSchedulePreview, formatScheduleWhen } from "./presentation";
import type { MessagingPlan, MessagingSchedule } from "@/lib/services/messaging-schedule";

const SCHEDULE: MessagingSchedule = {
  eventType: "practice",
  rsvpByDays: 2,
  invitationLeadDays: 5,
  reminderCadenceHours: 24,
  whatsappReminderCount: 2,
  emailReminderCount: 1,
  escalationHours: 12,
  updatedAt: new Date("2026-08-25T00:00:00Z"),
};

function planForSchedule(overrides: Partial<MessagingPlan> = {}): MessagingPlan {
  const invitationAt = new Date("2026-09-15T19:00:00Z");
  const responseDeadlineAt = new Date("2026-09-20T19:00:00Z");
  return {
    eventType: SCHEDULE.eventType,
    schedule: SCHEDULE,
    eventStartsAt: new Date("2026-09-22T19:00:00Z"),
    responseDeadlineAt,
    configuredDeadlineAt: responseDeadlineAt,
    deadlineClamped: false,
    invitationAt,
    configuredInvitationAt: invitationAt,
    dispatchesImmediately: false,
    lateApproval: false,
    rungs: [
      { rung: 0, kind: "invitation", channel: "whatsapp", at: invitationAt },
      { rung: 1, kind: "reminder", channel: "whatsapp", at: new Date("2026-09-16T19:00:00Z") },
      { rung: 2, kind: "reminder", channel: "whatsapp", at: new Date("2026-09-17T19:00:00Z") },
      { rung: 3, kind: "reminder", channel: "email", at: new Date("2026-09-18T19:00:00Z") },
    ],
    escalationAt: new Date("2026-09-21T07:00:00Z"),
    ...overrides,
  };
}

describe("formatScheduleWhen", () => {
  it("reads as a compact club-zone instant", () => {
    // 19:00 UTC in mid-September is 20:00 BST.
    expect(formatScheduleWhen(new Date("2026-09-15T19:00:00Z"))).toBe("Tue 15 Sep, 20:00");
  });
});

describe("buildSchedulePreview", () => {
  it("labels the invitation, every reminder in order, the deadline, escalation and the event", () => {
    const preview = buildSchedulePreview(planForSchedule(), SCHEDULE);

    expect(preview.steps.map((step) => step.label)).toEqual([
      "Invitation — WhatsApp",
      "Reminder 1 — WhatsApp",
      "Reminder 2 — WhatsApp",
      "Reminder 3 — email",
      "Player RSVP deadline",
      "President is told",
      "The event",
    ]);
  });

  it("marks only the last reminder as the last player message", () => {
    const preview = buildSchedulePreview(planForSchedule(), SCHEDULE);

    const reminders = preview.steps.filter((step) => step.label.startsWith("Reminder"));
    expect(reminders[0].note).toBe("24 h later");
    expect(reminders[1].note).toBe("24 h later");
    expect(reminders[2].note).toBe("24 h later, last player message");
  });

  it("names the day counts against the deadline and the invitation", () => {
    const preview = buildSchedulePreview(planForSchedule(), SCHEDULE);

    const invitation = preview.steps.find((step) => step.label === "Invitation — WhatsApp")!;
    expect(invitation.note).toBe("5 days before the event");
    const deadline = preview.steps.find((step) => step.label === "Player RSVP deadline")!;
    expect(deadline.note).toBe("2 days before the event");
  });

  it("carries no warning when the last reminder lands on the deadline", () => {
    // The default policy's own derivation: invitation + 3 × 24h cadence lands
    // exactly on the deadline.
    const preview = buildSchedulePreview(
      planForSchedule({
        rungs: [
          {
            rung: 0,
            kind: "invitation",
            channel: "whatsapp",
            at: new Date("2026-09-17T19:00:00Z"),
          },
          {
            rung: 1,
            kind: "reminder",
            channel: "whatsapp",
            at: new Date("2026-09-18T19:00:00Z"),
          },
          {
            rung: 2,
            kind: "reminder",
            channel: "whatsapp",
            at: new Date("2026-09-19T19:00:00Z"),
          },
          { rung: 3, kind: "reminder", channel: "email", at: new Date("2026-09-20T19:00:00Z") },
        ],
      }),
      SCHEDULE,
    );

    expect(preview.warning).toBeNull();
  });

  it("warns in days when the last reminder lands well before the deadline", () => {
    const preview = buildSchedulePreview(
      planForSchedule({
        invitationAt: new Date("2026-09-01T19:00:00Z"),
        rungs: [
          {
            rung: 0,
            kind: "invitation",
            channel: "whatsapp",
            at: new Date("2026-09-01T19:00:00Z"),
          },
          { rung: 1, kind: "reminder", channel: "whatsapp", at: new Date("2026-09-02T19:00:00Z") },
        ],
      }),
      SCHEDULE,
    );

    expect(preview.warning).toMatch(/lands 18 days before the deadline/);
    expect(preview.warning).toMatch(/Nobody is contacted in the 18 days that actually matter/);
  });

  it("names a late-approval configuration instead of a numeric gap", () => {
    const preview = buildSchedulePreview(
      planForSchedule({ lateApproval: true, escalationAt: null }),
      SCHEDULE,
    );

    expect(preview.warning).toMatch(/President is never told/);
  });

  it("omits the President row entirely when the plan never escalates", () => {
    const preview = buildSchedulePreview(
      planForSchedule({ lateApproval: true, escalationAt: null }),
      SCHEDULE,
    );

    expect(preview.steps.some((step) => step.label === "President is told")).toBe(false);
  });
});
