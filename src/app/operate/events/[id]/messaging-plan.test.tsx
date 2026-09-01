/**
 * The messaging plan disclosure — LAN-203, REQ-approval-shows-both-ladders.
 *
 * `planForDisplay`/`frozenPlanForDisplay` are pure and covered directly; the
 * disclosure itself is rendered to prove the two-audience grouping actually
 * appears on screen — a "Regular players" and a "Recruits" heading, each
 * with its own rows, and never a heading at all when there is no recruit
 * ladder to tell apart from the player one.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("server-only", () => ({}));

import { MessagingPlanDisclosure, frozenPlanForDisplay, planForDisplay } from "./messaging-plan";
import type {
  FrozenMessagingPlan,
  MessagingPlan,
  MessagingSchedule,
} from "@/lib/services/messaging-schedule";

const SCHEDULE: MessagingSchedule = {
  eventType: "recruitment",
  rsvpByDays: 2,
  invitationLeadDays: 5,
  reminderCadenceHours: 24,
  whatsappReminderCount: 2,
  emailReminderCount: 1,
  escalationHours: 12,
  recruitInvitationLeadDays: 5,
  recruitFollowUpCadenceHours: 72,
  updatedAt: new Date("2026-08-25T00:00:00Z"),
};

function planWithRecruitLadder(overrides: Partial<MessagingPlan> = {}): MessagingPlan {
  const invitationAt = new Date("2026-09-15T19:00:00Z");
  const responseDeadlineAt = new Date("2026-09-20T19:00:00Z");
  const recruitInvitationAt = new Date("2026-09-15T19:00:00Z");
  return {
    eventType: "recruitment",
    schedule: SCHEDULE,
    eventStartsAt: new Date("2026-09-22T19:00:00Z"),
    responseDeadlineAt,
    configuredDeadlineAt: responseDeadlineAt,
    deadlineClamped: false,
    invitationAt,
    configuredInvitationAt: invitationAt,
    dispatchesImmediately: false,
    lateApproval: false,
    rungs: [{ rung: 0, kind: "invitation", channel: "whatsapp", at: invitationAt }],
    escalationAt: new Date("2026-09-21T07:00:00Z"),
    recruitLadder: {
      invitationAt: recruitInvitationAt,
      configuredInvitationAt: recruitInvitationAt,
      dispatchesImmediately: false,
      followUpAt: new Date("2026-09-18T19:00:00Z"),
    },
    ...overrides,
  };
}

describe("planForDisplay / frozenPlanForDisplay", () => {
  it("carries the recruit ladder's two rungs through, invitation then the one follow-up", () => {
    const display = planForDisplay(planWithRecruitLadder());
    expect(display.recruit).not.toBeNull();
    expect(display.recruit?.rungs).toHaveLength(2);
    expect(display.recruit?.rungs[0].kind).toBe("invitation");
    expect(display.recruit?.rungs[1].kind).toBe("reminder");
    expect(display.recruit?.rungs[1].rung).toBe(1);
  });

  it("carries no recruit block for an event type with no recruit ladder", () => {
    const display = planForDisplay(planWithRecruitLadder({ recruitLadder: null }));
    expect(display.recruit).toBeNull();
  });

  it("carries just the invitation rung when the follow-up had no runway", () => {
    const display = planForDisplay(
      planWithRecruitLadder({
        recruitLadder: {
          invitationAt: new Date("2026-09-15T19:00:00Z"),
          configuredInvitationAt: new Date("2026-09-15T19:00:00Z"),
          dispatchesImmediately: false,
          followUpAt: null,
        },
      }),
    );
    expect(display.recruit?.rungs).toHaveLength(1);
  });

  it("reads the frozen recruit ladder back the same way, from event_messaging_plans columns", () => {
    const frozen: FrozenMessagingPlan = {
      eventId: "00000000-0000-4000-8000-000000000001",
      schedule: SCHEDULE,
      responseDeadlineAt: new Date("2026-09-20T19:00:00Z"),
      invitationAt: new Date("2026-09-17T19:00:00Z"),
      escalationAt: new Date("2026-09-21T07:00:00Z"),
      dispatchesImmediately: false,
      lateApproval: false,
      whatsappRemindersScheduled: 1,
      emailRemindersScheduled: 1,
      frozenAt: new Date("2026-09-01T00:00:00Z"),
      recruitLadder: {
        invitationAt: new Date("2026-09-15T19:00:00Z"),
        dispatchesImmediately: false,
        followUpAt: new Date("2026-09-18T19:00:00Z"),
      },
    };
    const display = frozenPlanForDisplay(frozen);
    expect(display.recruit?.rungs).toHaveLength(2);
  });
});

describe("MessagingPlanDisclosure — REQ-approval-shows-both-ladders", () => {
  it("groups the two ladders under 'Regular players' and 'Recruits' headings", () => {
    render(
      <MessagingPlanDisclosure
        display={planForDisplay(planWithRecruitLadder())}
        audienceSize={3}
        recruitAudienceSize={2}
        approved={false}
      />,
    );

    const headings = screen.getAllByTestId("plan-audience-heading");
    expect(headings.map((node) => node.textContent)).toEqual(["Regular players", "Recruits"]);

    // The recruit block's own rows read "2 recruits", not the player count.
    const recruitRows = screen.getByTestId("recruit-plan-rows");
    expect(within(recruitRows).getByText("2 recruits")).toBeInTheDocument();
    expect(within(recruitRows).getByText("Unanswered")).toBeInTheDocument();
    // Never an escalation row in the recruit block.
    expect(within(recruitRows).queryByText(/President/i)).not.toBeInTheDocument();
  });

  it("never shows a heading at all when there is no recruit ladder", () => {
    render(
      <MessagingPlanDisclosure
        display={planForDisplay(planWithRecruitLadder({ recruitLadder: null }))}
        audienceSize={5}
        approved={false}
      />,
    );

    expect(screen.queryByTestId("plan-audience-heading")).not.toBeInTheDocument();
    expect(screen.queryByTestId("recruit-plan-rows")).not.toBeInTheDocument();
  });

  it("still shows the player ladder's own President escalation row untouched, beside the recruit block", () => {
    render(
      <MessagingPlanDisclosure
        display={planForDisplay(planWithRecruitLadder())}
        audienceSize={3}
        recruitAudienceSize={2}
        approved={false}
      />,
    );

    const playerRows = screen.getByTestId("plan-rows");
    expect(within(playerRows).getByText("President")).toBeInTheDocument();
  });
});
