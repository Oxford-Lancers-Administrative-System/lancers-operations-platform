import { describe, expect, it } from "vitest";
import {
  CHASE_STOPPED,
  chasePositionLabel,
  ESCALATED_TO_PRESIDENT,
  ESCALATION_NOT_DELIVERED,
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
        escalationJobStatus: null,
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
        escalationJobStatus: null,
        jobs: [job({ jobType: "invitation", ladderRung: 0, status: "completed" })],
      }),
    ).toBeNull();
  });

  it("reads Chase stopped only when a reminder actually went out before the answer arrived", () => {
    expect(
      chasePositionLabel({
        responseState: "responded_no",
        isWalkUp: false,
        escalated: false,
        escalationJobStatus: null,
        jobs: [
          job({ jobType: "invitation", ladderRung: 0, status: "completed" }),
          job({ jobType: "reminder", ladderRung: 1, status: "completed" }),
          job({ jobType: "reminder", ladderRung: 2, status: "cancelled" }),
        ],
      }),
    ).toBe(CHASE_STOPPED);
  });

  // OWNER-LAN173-04. On an ordinary event everybody answers and every one of
  // their still-pending rungs is cancelled in the same transaction — the old
  // "any cancelled or completed non-invitation job" reading made that
  // cancellation alone read "Chase stopped" on every row, which restates the
  // Answer column and tells an operator nothing. A reminder that was only
  // ever cancelled, never sent, is not a chase that ran and then stopped.
  it("shows nothing for an answer that only cancelled a reminder nothing had sent yet", () => {
    expect(
      chasePositionLabel({
        responseState: "responded_no",
        isWalkUp: false,
        escalated: false,
        escalationJobStatus: null,
        jobs: [
          job({ jobType: "invitation", ladderRung: 0, status: "completed" }),
          job({ jobType: "reminder", ladderRung: 1, status: "cancelled" }),
        ],
      }),
    ).toBeNull();
  });

  // F-B1, mechanism 4. `escalationJobStatus` — never `jobs` — is what decides
  // this branch: an escalation job is addressed to the office about the
  // *event*, so it is keyed to `event_id`/`person_id`, never to one
  // invitation, and neither real caller (`participation.ts`, `follow-ups.ts`)
  // can ever place one in `jobs`. An earlier version of this test passed a
  // fabricated escalation entry inside `jobs` and asserted on `escalated:
  // true` alone — exactly the defect's own shape: that assertion could not
  // have caught the regression these four tests now name, because nothing
  // here ever read that entry, before the fix or after it.
  it("reads Escalated to the President once the escalation job has actually sent", () => {
    const label = chasePositionLabel({
      responseState: "expired_without_response",
      isWalkUp: false,
      escalated: true,
      escalationJobStatus: "completed",
      jobs: [
        job({ jobType: "invitation", ladderRung: 0, status: "completed" }),
        job({ jobType: "reminder", ladderRung: 1, status: "completed" }),
      ],
    });
    expect(label).toBe(ESCALATED_TO_PRESIDENT);
  });

  it("reads Escalated to the President while an accepted message awaits its delivery callback", () => {
    // `processing` — Meta accepted it, delivery unconfirmed. Read as sent,
    // the same standard the ladder's own `sent` lookup a few tests below
    // uses (`status === "completed" || status === "processing"`).
    const label = chasePositionLabel({
      responseState: "expired_without_response",
      isWalkUp: false,
      escalated: true,
      escalationJobStatus: "processing",
      jobs: [],
    });
    expect(label).toBe(ESCALATED_TO_PRESIDENT);
  });

  it("reads Escalation not delivered, never Escalated to the President, for a terminally failed job", () => {
    // The regression F-B1 names directly: three people read "Escalated to
    // the President" while their own escalation job was `failed`, attempt 1,
    // `next_attempt_at` null — never looked at again.
    const label = chasePositionLabel({
      responseState: "expired_without_response",
      isWalkUp: false,
      escalated: true,
      escalationJobStatus: "failed",
      jobs: [],
    });
    expect(label).toBe(ESCALATION_NOT_DELIVERED);
  });

  it("reads Escalation not delivered, not Escalated, while the office is vacant and no job exists", () => {
    // `escalationJobStatus: null` with `escalated: true` is the "escalation
    // held: no President in post" state — a flag with no job at all. This
    // sentence must not claim the President was told either.
    const label = chasePositionLabel({
      responseState: "expired_without_response",
      isWalkUp: false,
      escalated: true,
      escalationJobStatus: null,
      jobs: [],
    });
    expect(label).toBe(ESCALATION_NOT_DELIVERED);
  });

  it("shows the invitation sent and the first WhatsApp reminder due", () => {
    const due = new Date("2026-09-10T17:00:00Z");
    const label = chasePositionLabel({
      responseState: "awaiting_response",
      isWalkUp: false,
      escalated: false,
      escalationJobStatus: null,
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
      escalationJobStatus: null,
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
      escalationJobStatus: null,
      jobs: [
        job({ jobType: "invitation", ladderRung: 0, status: "completed" }),
        job({ jobType: "reminder", ladderRung: 1, channel: "whatsapp", status: "completed" }),
      ],
    });
    expect(label).toBe("WhatsApp 2 sent");
  });

  it("formats the due time as weekday and 12-hour clock", () => {
    expect(formatChaseDue(new Date("2026-09-10T17:00:00Z"))).toMatch(
      /^\w{3} \d{1,2}:\d{2} (am|pm)$/,
    );
  });
});
