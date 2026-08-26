/**
 * The messaging schedule page — W7, LAN-171.
 *
 * Mocked, like the rest of Administration's screen tests: the arithmetic
 * behind the worked example is proved against the real database in
 * `messaging-schedule.test.ts`, and what this file proves is the screen's own
 * behaviour — who may open it, and what it renders from an already-resolved
 * plan.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("@/lib/services/messaging-schedule", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/messaging-schedule")>();
  return { ...actual, listMessagingSchedulesWithPreview: vi.fn() };
});
vi.mock("./actions", () => ({
  updateOneMessagingScheduleAction: vi.fn(() =>
    Promise.resolve({ notice: null, error: null, refusal: null, candidates: null }),
  ),
}));

import { resolveOperatorAccess, type ResolvedOperator } from "@/lib/auth/operator";
import {
  listMessagingSchedulesWithPreview,
  type MessagingPlan,
  type MessagingSchedule,
  type MessagingScheduleWithPreview,
} from "@/lib/services/messaging-schedule";
import MessagingSchedulePage from "./page";

function administrator(seat = "president"): ResolvedOperator {
  return {
    authUserId: "11111111-1111-4111-8111-111111111111",
    personId: "22222222-2222-4222-8222-222222222222",
    displayName: "Rowan Ashfield",
    roleCodes: [seat],
    isActive: true,
  };
}

function signedIn(operator: ResolvedOperator | null) {
  vi.mocked(resolveOperatorAccess).mockResolvedValue(
    operator === null ? { state: "no_session" } : { state: "active", operator },
  );
}

function schedule(overrides: Partial<MessagingSchedule> = {}): MessagingSchedule {
  return {
    eventType: "practice",
    rsvpByDays: 2,
    // An arbitrary lead chosen only so the baseline fixture below carries no
    // gap warning by construction — not a claim about the seeded default,
    // which is untouched (OWNER-LAN171-06, round 3) and does carry a gap.
    invitationLeadDays: 4,
    reminderCadenceHours: 24,
    whatsappReminderCount: 2,
    emailReminderCount: 1,
    escalationHours: 12,
    updatedAt: new Date("2026-08-25T00:00:00Z"),
    ...overrides,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/**
 * A plan derived from `base`'s own fields, so the baseline fixture carries no
 * gap warning by construction — this screen's own rendering, not a claim
 * about what the seeded default currently produces. A test that wants a gap
 * overrides `invitationAt` and `rungs` explicitly, as "warns when a row's own
 * configuration leaves a gap…" does.
 *
 * `whatsappReminderCount` counts the invitation as WhatsApp #1 (Q-19,
 * OWNER-LAN171-05), so the number of WhatsApp *reminder* rungs after it is
 * one fewer — the same arithmetic `resolveMessagingPlanIn` now applies.
 */
function plan(base: MessagingSchedule, overrides: Partial<MessagingPlan> = {}): MessagingPlan {
  const eventStartsAt = new Date("2026-09-22T19:00:00Z");
  const responseDeadlineAt = new Date(eventStartsAt.getTime() - base.rsvpByDays * DAY_MS);
  const invitationAt = new Date(eventStartsAt.getTime() - base.invitationLeadDays * DAY_MS);
  const whatsappRemindersAfterInvitation = Math.max(0, base.whatsappReminderCount - 1);
  const wanted = whatsappRemindersAfterInvitation + base.emailReminderCount;
  const rungs = [
    { rung: 0, kind: "invitation" as const, channel: "whatsapp" as const, at: invitationAt },
    ...Array.from({ length: wanted }, (_, index) => ({
      rung: index + 1,
      kind: "reminder" as const,
      channel: (index < whatsappRemindersAfterInvitation ? "whatsapp" : "email") as
        "whatsapp" | "email",
      at: new Date(invitationAt.getTime() + (index + 1) * base.reminderCadenceHours * HOUR_MS),
    })),
  ];
  return {
    eventType: base.eventType,
    schedule: base,
    eventStartsAt,
    responseDeadlineAt,
    configuredDeadlineAt: responseDeadlineAt,
    deadlineClamped: false,
    invitationAt,
    configuredInvitationAt: invitationAt,
    dispatchesImmediately: false,
    lateApproval: false,
    rungs,
    escalationAt: new Date(responseDeadlineAt.getTime() + base.escalationHours * HOUR_MS),
    ...overrides,
  };
}

const EVENT_TYPES = [
  "practice",
  "strength_and_conditioning",
  "chalk",
  "game",
  "social",
  "recruitment",
  "meeting",
];

function rows(): MessagingScheduleWithPreview[] {
  return EVENT_TYPES.map((eventType) => {
    const row = schedule({ eventType });
    return { schedule: row, preview: plan(row) };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
  signedIn(administrator());
  vi.mocked(listMessagingSchedulesWithPreview).mockResolvedValue(rows());
});

describe("who may open the messaging schedule", () => {
  // `delivery_administration`: the four calendar roles, plus the transitional
  // IT Officer seat — the same set `event-approval` and `delivery` already
  // trust with this workflow.
  it.each(["president", "vice_president", "secretary", "general_manager", "it_officer"])(
    "opens it for the %s",
    async (seatCode) => {
      signedIn(administrator(seatCode));

      render(await MessagingSchedulePage());

      expect(screen.getByText("Messaging schedule")).toBeInTheDocument();
      expect(screen.getAllByTestId("schedule-row")).toHaveLength(7);
    },
  );

  it("refuses the Treasurer, naming the requirement rather than the seat", async () => {
    signedIn(administrator("treasurer"));

    const { container } = render(await MessagingSchedulePage());

    expect(container.textContent).toContain("You do not have access to this action");
    expect(container.innerHTML).not.toContain("treasurer");
  });

  it("refuses a narrow attendance recorder", async () => {
    signedIn({ ...administrator(), roleCodes: ["head_coach"] });

    const { container } = render(await MessagingSchedulePage());

    expect(container.textContent).toContain("Attendance recording is the only operator surface");
  });

  it("sends a signed-out visitor to sign in", async () => {
    signedIn(null);

    await expect(MessagingSchedulePage()).rejects.toThrow(/^REDIRECT:\/login\?redirectTo=/);
  });
});

describe("the table", () => {
  it("shows the six editable values for every event type", async () => {
    render(await MessagingSchedulePage());

    const practiceRow = screen.getAllByTestId("schedule-row")[0];
    expect(practiceRow).toHaveTextContent("Practice");
    expect(practiceRow.querySelector('input[name="rsvpByDays"]')).toHaveValue(2);
    expect(practiceRow.querySelector('input[name="invitationLeadDays"]')).toHaveValue(4);
    expect(practiceRow.querySelector('input[name="reminderCadenceHours"]')).toHaveValue(24);
    expect(practiceRow.querySelector('input[name="whatsappReminderCount"]')).toHaveValue(2);
    expect(practiceRow.querySelector('input[name="emailReminderCount"]')).toHaveValue(1);
    expect(practiceRow.querySelector('input[name="escalationHours"]')).toHaveValue(12);
  });

  it("states there are no quiet hours", async () => {
    render(await MessagingSchedulePage());

    expect(screen.getByTestId("schedule-rule").textContent).toMatch(/no quiet hours/i);
  });

  it("keeps every row's worked example closed by default, on every row (OWNER-LAN171-09)", async () => {
    render(await MessagingSchedulePage());

    for (const row of screen.getAllByTestId("schedule-row")) {
      expect(row.textContent).not.toContain("Player RSVP deadline");
    }
  });

  it("reveals the worked example only once a row is opened", async () => {
    render(await MessagingSchedulePage());

    const first = screen.getAllByTestId("schedule-row")[0];
    expect(first.textContent).not.toContain("Player RSVP deadline");

    fireEvent.click(first.querySelector('[data-testid="schedule-row-toggle"]')!);

    expect(first.textContent).toContain("Player RSVP deadline");
    expect(first.textContent).toContain("The event");
  });

  it("never draws the gap-before-the-deadline callout, even when a row's own configuration leaves one (OWNER-LAN171-07)", async () => {
    const withGap = rows();
    const gameIndex = withGap.findIndex((row) => row.schedule.eventType === "game");
    const invitationAt = new Date("2026-09-01T19:00:00Z");
    const responseDeadlineAt = new Date("2026-09-15T19:00:00Z");
    withGap[gameIndex] = {
      ...withGap[gameIndex],
      preview: {
        ...withGap[gameIndex].preview,
        invitationAt,
        responseDeadlineAt,
        rungs: [
          { rung: 0, kind: "invitation", channel: "whatsapp", at: invitationAt },
          { rung: 1, kind: "reminder", channel: "whatsapp", at: new Date("2026-09-02T19:00:00Z") },
        ],
      },
    };
    vi.mocked(listMessagingSchedulesWithPreview).mockResolvedValue(withGap);

    render(await MessagingSchedulePage());

    // The row carrying the gap does not open itself (OWNER-LAN171-09 governs
    // every row, with no exception for one that would have warned), and
    // opening it by hand never surfaces the retired callout, though the
    // worked example around it still renders.
    const rowsFound = screen.getAllByTestId("schedule-row");
    const gameCard = rowsFound.find((row) => row.textContent?.includes("Game"))!;
    expect(gameCard.textContent).not.toContain("Player RSVP deadline");

    fireEvent.click(gameCard.querySelector('[data-testid="schedule-row-toggle"]')!);

    expect(gameCard.textContent).toContain("Player RSVP deadline");
    expect(gameCard.querySelector('[data-testid="schedule-row-warning"]')).toBeNull();
    expect(gameCard.textContent).not.toMatch(/lands \d+ days? before the deadline/);
  });
});

describe("the grid shape — OWNER-LAN171-03", () => {
  it("shows a short, untruncated label and a unit for every day/hour field", async () => {
    render(await MessagingSchedulePage());

    const practiceRow = screen.getAllByTestId("schedule-row")[0];

    for (const label of ["RSVP by", "First inv.", "Cadence", "WhatsApp", "Email", "President"]) {
      expect(practiceRow.textContent).toContain(label);
    }
    // Brian's screenshot: "WhatsApp reminde…", truncated. The count label is
    // "WhatsApp" alone now (it counts the invitation, Q-19), never
    // "WhatsApp reminders".
    expect(practiceRow.textContent).not.toMatch(/WhatsApp reminder/i);
    expect(practiceRow.textContent).not.toContain("…");
  });

  it("carries units in the input group beside RSVP by, First inv., Cadence and President", async () => {
    render(await MessagingSchedulePage());

    const practiceRow = screen.getAllByTestId("schedule-row")[0];
    const adornments = Array.from(practiceRow.querySelectorAll(".MuiInputAdornment-root")).map(
      (node) => node.textContent,
    );

    expect(adornments).toEqual(expect.arrayContaining(["days", "days", "h", "h"]));
  });
});

describe("field explanations — OWNER-LAN171-08", () => {
  it("says what cadence, President escalation, WhatsApp and Email actually count, at the field", async () => {
    render(await MessagingSchedulePage());

    const practiceRow = screen.getAllByTestId("schedule-row")[0];

    expect(practiceRow.textContent).toMatch(/gap between messages/i);
    expect(practiceRow.textContent).toMatch(
      /hours after the rsvp deadline before the president is told/i,
    );
    expect(practiceRow.textContent).toMatch(/including the invitation/i);
    // Q-19: the WhatsApp count includes the invitation, so nothing reading
    // "reminders" may describe it — including this new explanation.
    expect(practiceRow.textContent).not.toMatch(/whatsapp reminder/i);
  });
});

describe("one save button per row — OWNER-LAN171-04", () => {
  it("gives every row its own form and its own save button, not one for the page", async () => {
    const { container } = render(await MessagingSchedulePage());

    const forms = container.querySelectorAll("form");
    expect(forms).toHaveLength(7);

    const rowsFound = screen.getAllByTestId("schedule-row");
    const practiceRow = rowsFound[0];
    expect(practiceRow.querySelector('button[type="submit"]')).toHaveTextContent("Save practice");
    const gameRow = rowsFound.find((row) => row.textContent?.includes("Game"))!;
    expect(gameRow.querySelector('button[type="submit"]')).toHaveTextContent("Save game");
  });

  it("scopes each row's hidden event type to its own form", async () => {
    const { container } = render(await MessagingSchedulePage());

    const hiddenInputs = container.querySelectorAll('input[name="eventType"]');
    expect(Array.from(hiddenInputs).map((input) => (input as HTMLInputElement).value)).toEqual(
      EVENT_TYPES,
    );
  });
});
