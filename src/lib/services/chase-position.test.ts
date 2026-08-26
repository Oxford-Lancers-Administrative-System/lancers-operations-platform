import { describe, expect, it } from "vitest";
import {
  CHASE_STOPPED,
  chasePositionLabel,
  ESCALATED_TO_PRESIDENT,
  formatChaseDue,
  type ChaseJobFact,
} from "./chase-position";

/**
 * W4, W5. Acceptance evidence: "an unanswered person shows the rung already
 * sent and the next one due; an answered person shows none", "an escalated
 * person reads Escalated to the President and shows no further player-facing
 * rung", "a person whose answer arrives reads Chase stopped in the same
 * transaction that cancels their remaining jobs".
 */
describe("chasePositionLabel", () => {
  function job(overrides: Partial<ChaseJobFact>): ChaseJobFact {
    return {
      jobType: "reminder",
      channel: "whatsapp",
      ladderRung: 1,
      status: "pending",
      scheduledFor: null,
      ...overrides,
    };
  }

  it("shows nothing for a walk-up", () => {
    expect(
      chasePositionLabel({
        responseState: "awaiting_response",
        isWalkUp: true,
        escalated: false,
        jobs: [],
      }),
    ).toBeNull();
  });

  it("shows nothing for an answered person who was never chased", () => {
    expect(
      chasePositionLabel({
        responseState: "responded_yes",
        isWalkUp: false,
        escalated: false,
        jobs: [job({ jobType: "invitation", ladderRung: 0, status: "completed" })],
      }),
    ).toBeNull();
  });

  it("reads Chase stopped for an answer that cancelled a running chase", () => {
    expect(
      chasePositionLabel({
        responseState: "responded_no",
        isWalkUp: false,
        escalated: false,
        jobs: [
          job({ jobType: "invitation", ladderRung: 0, status: "completed" }),
          job({ jobType: "reminder", ladderRung: 1, status: "cancelled" }),
        ],
      }),
    ).toBe(CHASE_STOPPED);
  });

  it("reads Escalated to the President and names no further rung", () => {
    const label = chasePositionLabel({
      responseState: "expired_without_response",
      isWalkUp: false,
      escalated: true,
      jobs: [
        job({ jobType: "invitation", ladderRung: 0, status: "completed" }),
        job({ jobType: "reminder", ladderRung: 1, status: "completed" }),
        job({ jobType: "escalation", channel: "whatsapp", ladderRung: null, status: "pending" }),
      ],
    });
    expect(label).toBe(ESCALATED_TO_PRESIDENT);
  });

  it("shows the invitation sent and the first WhatsApp reminder due", () => {
    const due = new Date("2026-09-10T17:00:00Z");
    const label = chasePositionLabel({
      responseState: "awaiting_response",
      isWalkUp: false,
      escalated: false,
      jobs: [
        job({ jobType: "invitation", ladderRung: 0, status: "completed" }),
        job({
          jobType: "reminder",
          ladderRung: 1,
          channel: "whatsapp",
          status: "pending",
          scheduledFor: due,
        }),
      ],
    });
    expect(label).toBe(`Invitation delivered · WhatsApp 2 ${formatChaseDue(due)}`);
  });

  it("names the second WhatsApp reminder sent and the email rung due, lower-cased mid-sentence", () => {
    const due = new Date("2026-09-12T09:00:00Z");
    const label = chasePositionLabel({
      responseState: "awaiting_response",
      isWalkUp: false,
      escalated: false,
      jobs: [
        job({ jobType: "invitation", ladderRung: 0, status: "completed" }),
        job({ jobType: "reminder", ladderRung: 1, channel: "whatsapp", status: "completed" }),
        job({
          jobType: "reminder",
          ladderRung: 2,
          channel: "email",
          status: "pending",
          scheduledFor: due,
        }),
      ],
    });
    expect(label).toBe(`WhatsApp 2 sent · email ${formatChaseDue(due)}`);
  });

  it("shows only the last rung sent when nothing further is scheduled", () => {
    const label = chasePositionLabel({
      responseState: "awaiting_response",
      isWalkUp: false,
      escalated: false,
      jobs: [
        job({ jobType: "invitation", ladderRung: 0, status: "completed" }),
        job({ jobType: "reminder", ladderRung: 1, channel: "whatsapp", status: "completed" }),
      ],
    });
    expect(label).toBe("WhatsApp 2 sent");
  });

  it("formats the due time as weekday and 24-hour clock", () => {
    expect(formatChaseDue(new Date("2026-09-10T17:00:00Z"))).toMatch(/^\w{3} \d{2}:\d{2}$/);
  });
});
