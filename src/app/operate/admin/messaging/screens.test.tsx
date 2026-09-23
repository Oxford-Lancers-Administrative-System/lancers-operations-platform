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
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

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
vi.mock("@/lib/services/recruitment-cycle", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/recruitment-cycle")>();
  return { ...actual, listRecruitmentCycleSteps: vi.fn() };
});
vi.mock("@/lib/services/onboarding-chase", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/onboarding-chase")>();
  return { ...actual, readOnboardingChaseSettings: vi.fn() };
});
// LAN-394. The page reads the messaging safety state alongside the schedule.
vi.mock("@/lib/services/messaging-safety", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/messaging-safety")>();
  return { ...actual, readMessagingSafetyStatus: vi.fn() };
});
vi.mock("./safety-actions", () => ({
  pauseMessagingAction: vi.fn(() =>
    Promise.resolve({ notice: null, error: null, refusal: null, candidates: null }),
  ),
  resumeMessagingAction: vi.fn(() =>
    Promise.resolve({ notice: null, error: null, refusal: null, candidates: null }),
  ),
}));
vi.mock("./actions", () => ({
  updateOneMessagingScheduleAction: vi.fn(() =>
    Promise.resolve({ notice: null, error: null, refusal: null, candidates: null }),
  ),
  updateRecruitmentCycleStepsAction: vi.fn(() =>
    Promise.resolve({ notice: null, error: null, refusal: null, candidates: null }),
  ),
  updateOnboardingChaseSettingsAction: vi.fn(() =>
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
import {
  listRecruitmentCycleSteps,
  type RecruitmentCycleStep,
} from "@/lib/services/recruitment-cycle";
import {
  readOnboardingChaseSettings,
  type OnboardingChaseSettings,
} from "@/lib/services/onboarding-chase";
import {
  readMessagingSafetyStatus,
  safetyThresholds,
  type MessagingSafetyStatus,
  type SafetyHoldRow,
} from "@/lib/services/messaging-safety";
import MessagingSchedulePage from "./page";
import { updateOneMessagingScheduleAction } from "./actions";

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

/**
 * The seven templates the migration seeds, by behavioural class — LAN-265.
 *
 * Fixed literals in `20260916090000_event_templates.sql`, so a fixture can name
 * one without reading it back; the page keys every row by the identifier and
 * labels it with the name.
 */
const TEMPLATE_IDS: Readonly<Record<string, string>> = {
  practice: "7e34a764-7ed1-535e-8cef-73e00a62eafc",
  strength_and_conditioning: "8fb4acfc-1d41-53b0-bda8-202f454a8629",
  chalk: "b547e0b3-f48c-5601-9dc6-e8725fc434f9",
  game: "67fbd6c7-1c6c-55d5-ab83-f85816c4c2ae",
  social: "8de00424-52a8-52ad-9c9f-a29823f9c4bf",
  recruitment: "ae03257b-292e-5a97-b6ef-c3a6a2b839d7",
  meeting: "660cdcb7-51e3-5a19-aaa2-08c5256af288",
};

const TEMPLATE_NAMES: Readonly<Record<string, string>> = {
  practice: "Practice",
  strength_and_conditioning: "Strength and conditioning",
  chalk: "Chalk",
  game: "Game",
  social: "Social",
  recruitment: "Recruitment",
  meeting: "Meeting",
};

function schedule(overrides: Partial<MessagingSchedule> = {}): MessagingSchedule {
  return {
    templateId: "7e34a764-7ed1-535e-8cef-73e00a62eafc",
    templateName: "Practice",
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
    recruitInvitationLeadDays: null,
    recruitFollowUpCadenceHours: null,
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
    templateId: base.templateId,
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
    recruitLadder: null,
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
    const identity = {
      templateId: TEMPLATE_IDS[eventType],
      templateName: TEMPLATE_NAMES[eventType],
      eventType,
    };
    const row = schedule(
      eventType === "recruitment"
        ? { ...identity, recruitInvitationLeadDays: 5, recruitFollowUpCadenceHours: 72 }
        : identity,
    );
    return { schedule: row, preview: plan(row) };
  });
}

/**
 * The four cycle steps, seeded as LAN-199/the migration ship them. No
 * `enabled` field — Brian, 2026-09-01: "the toggles were completely
 * invented… Remove the toggles." The database column survives untouched;
 * `RecruitmentCycleStep` simply no longer carries it.
 */
function cycleSteps(): RecruitmentCycleStep[] {
  return [
    { step: "welcome", offsetHours: 0, updatedAt: new Date("2026-08-25T00:00:00Z") },
    {
      step: "details_reminder",
      offsetHours: 96,
      updatedAt: new Date("2026-08-25T00:00:00Z"),
    },
    {
      step: "interest_ask",
      offsetHours: 72,
      updatedAt: new Date("2026-08-25T00:00:00Z"),
    },
    {
      step: "interest_reminder",
      offsetHours: 144,
      updatedAt: new Date("2026-08-25T00:00:00Z"),
    },
  ];
}

function onboardingChaseSettings(
  overrides: Partial<OnboardingChaseSettings> = {},
): OnboardingChaseSettings {
  return {
    firstChaseAfterHours: 48,
    chaseCount: 4,
    chaseIntervalDays: 3,
    updatedAt: new Date("2026-08-25T00:00:00Z"),
    ...overrides,
  };
}

/** The section's normal state: sending, nothing waiting, nothing held. */
function safetyStatus(overrides: Partial<MessagingSafetyStatus> = {}): MessagingSafetyStatus {
  return {
    state: "sending_normally",
    globalScopeId: "33333333-3333-4333-8333-333333333333",
    globalVersion: 1,
    pausedAt: null,
    pausedByName: null,
    pausedReason: null,
    emergencyStopped: false,
    lastChangeAt: new Date("2026-09-17T09:00:00Z"),
    dueWaiting: 0,
    oldestDueMinutes: 0,
    heldBySafety: 0,
    scheduledAhead: 4,
    queueWarning: false,
    admittedInPacingWindow: 0,
    admittedInHour: 3,
    admittedInDay: 12,
    admittedInWeek: 40,
    pacingLimit: 50,
    dayLimit: 3_000,
    capacityWarning: false,
    thresholds: safetyThresholds(),
    holds: [],
    unresolvedAttempts: 0,
    oldestUnresolvedMinutes: 0,
    audit: [],
    policyDecision: "Brian, 17 September 2026",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
  signedIn(administrator());
  vi.mocked(listMessagingSchedulesWithPreview).mockResolvedValue(rows());
  vi.mocked(listRecruitmentCycleSteps).mockResolvedValue(cycleSteps());
  vi.mocked(readOnboardingChaseSettings).mockResolvedValue(onboardingChaseSettings());
  vi.mocked(readMessagingSafetyStatus).mockResolvedValue(safetyStatus());
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

  it("omits the standing schedule-rule banner", async () => {
    render(await MessagingSchedulePage());

    expect(screen.queryByTestId("schedule-rule")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/quiet hours/i)).not.toBeInTheDocument();
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

    // Seven event types, plus LAN-203's two recruitment cycle rows
    // (`cycle-step-row`, Brian 2026-09-01: Welcome and its details reminder
    // collapsed onto one row), plus LAN-218's own Onboarding row — each is
    // its own form on the same one-row-one-save law, so the total grows with
    // the page rather than staying fixed at seven.
    // LAN-394 added the eleventh: the Messaging safety section's one control,
    // which obeys the same law — its own form, its own reason, its own submit.
    const forms = container.querySelectorAll("form");
    expect(forms).toHaveLength(11);
    const cycleRows = screen.getAllByTestId("cycle-step-row");
    expect(cycleRows).toHaveLength(2);
    for (const row of cycleRows) expect(row.tagName).toBe("FORM");

    const rowsFound = screen.getAllByTestId("schedule-row");
    const practiceRow = rowsFound[0];
    expect(practiceRow.querySelector('button[type="submit"]')).toHaveTextContent("Save practice");
    const gameRow = rowsFound.find((row) => row.textContent?.includes("Game"))!;
    expect(gameRow.querySelector('button[type="submit"]')).toHaveTextContent("Save game");
  });

  it("scopes each row's hidden template to its own form", async () => {
    // LAN-265 rekeyed the table, so the hidden field a row posts is the
    // template's identifier rather than the class it happens to carry.
    const { container } = render(await MessagingSchedulePage());

    const hiddenInputs = container.querySelectorAll('input[name="templateId"]');
    expect(Array.from(hiddenInputs).map((input) => (input as HTMLInputElement).value)).toEqual(
      EVENT_TYPES.map((eventType) => TEMPLATE_IDS[eventType]),
    );
  });
});

// ---------------------------------------------------------------------------
// LAN-203 — the page's three sections
// ---------------------------------------------------------------------------

describe("the page's three sections — W10, Brian 2026-08-31", () => {
  it("reads as Recruitment, then Onboarding, then Event messaging, in that order", async () => {
    // LAN-218, W11: "Onboarding is not in the right place. It should be
    // right below recruitment... below recruitment, above events." — Brian,
    // and the reason `W11-01` was reshot to match.
    render(await MessagingSchedulePage());

    // LAN-394 added the fourth, and Brian put it at the bottom: the controls
    // that stop the club messaging anybody sit below the schedule they govern,
    // with a link to them from the top of the page whenever they are in use.
    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      "Recruitment",
      "Onboarding",
      "Event messaging",
      "Messaging safety",
    ]);
  });

  it("configures exactly three values — no give-up value, no quiet hours, no escalation office", async () => {
    vi.mocked(readOnboardingChaseSettings).mockResolvedValue(
      onboardingChaseSettings({ firstChaseAfterHours: 48, chaseCount: 4, chaseIntervalDays: 3 }),
    );
    render(await MessagingSchedulePage());

    const section = screen.getByTestId("onboarding-section");
    expect(section.textContent).not.toMatch(/not built yet/i);
    expect(section.querySelectorAll("form")).toHaveLength(1);

    expect(within(section).getByLabelText("First chase after joining")).toHaveValue(48);
    expect(within(section).getByLabelText("Ask this many times")).toHaveValue(4);
    expect(within(section).getByLabelText("Every")).toHaveValue(3);

    // No give-up value, no quiet hours, no per-item owner, no escalation
    // office — `OD7-cadence-is-the-config`'s own boundary.
    expect(section.textContent).not.toMatch(/give up/i);
    expect(section.textContent).not.toMatch(/quiet hours/i);
    expect(section.textContent).not.toMatch(/president/i);
  });

  it("the QR code is not on this page at all — W10: 'This workflow is the cycle and nothing else'", async () => {
    render(await MessagingSchedulePage());
    expect(screen.queryByText(/qr code/i)).not.toBeInTheDocument();
  });
});

describe("the recruitment cycle section — REQ-recruitment-cycle", () => {
  // Brian, 2026-09-01: "the top two bars here should be made as one" —
  // Welcome now draws exactly two rows: Welcome (covering `welcome` and its
  // own `details_reminder`) and Recruitment questionnaire.
  it("draws exactly two rows: Welcome, Recruitment questionnaire", async () => {
    render(await MessagingSchedulePage());

    const labels = screen.getAllByTestId("cycle-step-row-label").map((node) => node.textContent);
    expect(labels).toEqual(["Welcome", "Recruitment questionnaire"]);
  });

  it("never draws a per-step on/off control — the toggles were invented and removed (Brian, 2026-09-01)", async () => {
    const { container } = render(await MessagingSchedulePage());

    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("shows Welcome as one card, two offsets — the first message at 0h, the second (details reminder) after N hours", async () => {
    render(await MessagingSchedulePage());

    const welcomeRow = screen.getAllByTestId("cycle-step-row")[0];
    const firstField = welcomeRow.querySelector(
      'input[name="step_welcome_offsetHours"]',
    ) as HTMLInputElement;
    const secondField = welcomeRow.querySelector(
      'input[name="step_details_reminder_offsetHours"]',
    ) as HTMLInputElement;
    expect(firstField.value).toBe("0");
    expect(secondField.value).toBe("96");
  });

  it("shows the Recruitment questionnaire row carrying both the ask and its reminder — LAN-199", async () => {
    render(await MessagingSchedulePage());

    const questionnaireRow = screen.getAllByTestId("cycle-step-row")[1];
    const askField = questionnaireRow.querySelector(
      'input[name="step_interest_ask_offsetHours"]',
    ) as HTMLInputElement;
    const reminderField = questionnaireRow.querySelector(
      'input[name="step_interest_reminder_offsetHours"]',
    ) as HTMLInputElement;
    expect(askField.value).toBe("72");
    expect(reminderField.value).toBe("144");
  });

  it("carries a hidden steps field naming which database rows each form covers", async () => {
    const { container } = render(await MessagingSchedulePage());

    const hidden = Array.from(container.querySelectorAll('input[name="steps"]')).map(
      (input) => (input as HTMLInputElement).value,
    );
    expect(hidden).toEqual(["welcome,details_reminder", "interest_ask,interest_reminder"]);
  });
});

describe("the Recruitment event row's two audiences — DEC-split-on-the-schedule", () => {
  it("splits into Regular players and Recruits, in that order, within one row", async () => {
    render(await MessagingSchedulePage());

    const recruitmentRow = screen
      .getAllByTestId("schedule-row")
      .find((row) => row.textContent?.startsWith("Recruitment"))!;
    expect(recruitmentRow).toBeDefined();

    // LAN-416 qualifies the second heading: a recruit can be invited to any
    // event type now, and these fields govern the recruitment one alone.
    const groupHeadings = recruitmentRow.querySelectorAll('[data-testid="audience-group-heading"]');
    expect(Array.from(groupHeadings).map((node) => node.textContent)).toEqual([
      "Regular players",
      "Recruits on a recruitment event",
    ]);
  });

  it("carries the Regular players' unchanged six fields, including a President field", async () => {
    render(await MessagingSchedulePage());

    const recruitmentRow = screen
      .getAllByTestId("schedule-row")
      .find((row) => row.textContent?.startsWith("Recruitment"))!;
    for (const label of ["RSVP by", "First inv.", "Cadence", "WhatsApp", "Email", "President"]) {
      expect(recruitmentRow.textContent).toContain(label);
    }
  });

  it("carries the Recruits group's own two fields and their values, with no President field for them", async () => {
    render(await MessagingSchedulePage());

    const recruitmentRow = screen
      .getAllByTestId("schedule-row")
      .find((row) => row.textContent?.startsWith("Recruitment"))!;

    const invitation = recruitmentRow.querySelector(
      'input[name="recruitInvitationLeadDays"]',
    ) as HTMLInputElement;
    const followUp = recruitmentRow.querySelector(
      'input[name="recruitFollowUpCadenceHours"]',
    ) as HTMLInputElement;
    expect(invitation.value).toBe("5");
    expect(followUp.value).toBe("72");

    // "No escalation field at all" for Recruits (REQ-two-ladders): neither
    // recruit field's own box mentions the President, which belongs to
    // Regular players alone.
    expect(invitation.closest("[data-field]")?.textContent).not.toMatch(/president/i);
    expect(followUp.closest("[data-field]")?.textContent).not.toMatch(/president/i);
  });

  it("saves the Recruits group's fields through the same one row, one submit as Regular players", async () => {
    const { container } = render(await MessagingSchedulePage());

    const recruitmentForm = Array.from(container.querySelectorAll("form")).find((form) =>
      form.querySelector(`input[name="templateId"][value="${TEMPLATE_IDS.recruitment}"]`),
    )!;
    expect(recruitmentForm).toBeDefined();
    expect(recruitmentForm.querySelectorAll('button[type="submit"]')).toHaveLength(1);
    expect(recruitmentForm.querySelector('input[name="recruitInvitationLeadDays"]')).not.toBeNull();
  });

  it("every other event type's row has no Recruits group at all", async () => {
    render(await MessagingSchedulePage());

    const practiceRow = screen
      .getAllByTestId("schedule-row")
      .find((row) => row.textContent?.startsWith("Practice"))!;
    expect(practiceRow.querySelectorAll('[data-testid="audience-group-heading"]')).toHaveLength(0);
    expect(practiceRow.querySelector('input[name="recruitInvitationLeadDays"]')).toBeNull();
  });
});

/**
 * LAN-250. `docs/ux/standards.md` rule 1 — "a result never outlives the thing
 * it describes" — held for every submit that actually started, because every
 * panel claims the outcome slot on `onSubmit`. It did not hold for a submit
 * the browser's own `min`/`max` check blocked before it started: no request
 * fired, `onSubmit` never ran, and the previous refusal stayed on screen
 * naming a field the operator could see was no longer blank. jsdom does not
 * run native constraint validation, so the trigger under test is the edit
 * itself, which is the trigger the fix uses.
 */
describe("a saved result never outlives the values it described — LAN-250", () => {
  const BLANK_REFUSAL = "Practice: player rsvp by cannot be left blank.";

  it("clears the server's message as soon as the field it named is edited", async () => {
    vi.mocked(updateOneMessagingScheduleAction).mockResolvedValue({
      notice: null,
      error: BLANK_REFUSAL,
      refusal: null,
      candidates: null,
    });

    render(await MessagingSchedulePage());
    const practiceRow = screen
      .getAllByTestId("schedule-row")
      .find((row) => row.textContent?.startsWith("Practice"))!;

    await act(async () => {
      fireEvent.submit(practiceRow);
    });
    expect(practiceRow.textContent).toContain(BLANK_REFUSAL);

    await act(async () => {
      fireEvent.change(practiceRow.querySelector('input[name="rsvpByDays"]')!, {
        target: { value: "999999" },
      });
    });
    expect(practiceRow.textContent).not.toContain(BLANK_REFUSAL);
  });

  it("shows the next result, so clearing is not silence", async () => {
    vi.mocked(updateOneMessagingScheduleAction).mockResolvedValue({
      notice: null,
      error: BLANK_REFUSAL,
      refusal: null,
      candidates: null,
    });

    render(await MessagingSchedulePage());
    const practiceRow = screen
      .getAllByTestId("schedule-row")
      .find((row) => row.textContent?.startsWith("Practice"))!;

    await act(async () => {
      fireEvent.submit(practiceRow);
    });
    await act(async () => {
      fireEvent.change(practiceRow.querySelector('input[name="rsvpByDays"]')!, {
        target: { value: "3" },
      });
    });

    vi.mocked(updateOneMessagingScheduleAction).mockResolvedValue({
      notice: "Practice saved.",
      error: null,
      refusal: null,
      candidates: null,
    });
    await act(async () => {
      fireEvent.submit(practiceRow);
    });

    expect(practiceRow.textContent).toContain("Practice saved.");
  });

  it("leaves the other rows' results alone — the edit is this row's own", async () => {
    vi.mocked(updateOneMessagingScheduleAction).mockResolvedValue({
      notice: null,
      error: BLANK_REFUSAL,
      refusal: null,
      candidates: null,
    });

    render(await MessagingSchedulePage());
    const rowsOnScreen = screen.getAllByTestId("schedule-row");
    const practiceRow = rowsOnScreen.find((row) => row.textContent?.startsWith("Practice"))!;
    const otherRow = rowsOnScreen.find((row) => !row.textContent?.startsWith("Practice"))!;

    await act(async () => {
      fireEvent.submit(practiceRow);
    });
    await act(async () => {
      fireEvent.change(otherRow.querySelector('input[name="rsvpByDays"]')!, {
        target: { value: "4" },
      });
    });

    expect(practiceRow.textContent).toContain(BLANK_REFUSAL);
  });
});

// ---------------------------------------------------------------------------
// LAN-394 — the Messaging safety section
//
// Brian's visual pass of 18 September 2026: "This is an emergency page. When I
// get here I need to work immediately." Two jobs, in this order — stop a
// runaway, then find and clear a blockage — so what these prove is the order,
// the colour and the one act that clears each cause, not the arithmetic behind
// them. That is proved against the real database in `messaging-safety.test.ts`.
// ---------------------------------------------------------------------------

/** One held person or number, with everything the section reads from it. */
function hold(overrides: Partial<SafetyHoldRow> = {}): SafetyHoldRow {
  return {
    scopeId: "55555555-5555-4555-8555-555555555555",
    version: 2,
    kind: "person",
    label: "Wilfred Ashcombe",
    reasonCode: "person_hold",
    since: new Date("2026-09-17T08:00:00Z"),
    people: [{ personId: "44444444-4444-4444-8444-444444444444", name: "Wilfred Ashcombe" }],
    shared: false,
    pausedByName: null,
    pausedReason: null,
    cooldownUntil: null,
    limitReached: "daily",
    ...overrides,
  };
}

describe("Messaging safety — LAN-394", () => {
  it("opens on the status and the control, then the counts, then the rest", async () => {
    render(await MessagingSchedulePage());

    const section = screen.getByTestId("messaging-safety");
    const headings = within(section)
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent);
    // Brian's second pass of 18 September 2026: "The narrative UI is really
    // terrible. 'Is it running away?' — for God's sake, have a professional
    // tone." Same order, same content, noun phrases throughout.
    expect(headings).toEqual([
      "Messaging status",
      "Messages sent",
      "Waiting",
      "People held back",
      "Limits and current use",
      "Recent changes",
    ]);
    for (const heading of headings) expect(heading).not.toContain("?");

    // The status and its control come before any of them: an emergency page
    // opens on what is happening and the one control that changes it.
    const text = section.textContent;
    expect(text.indexOf("Sending normally")).toBeLessThan(text.indexOf("Messages sent"));
    expect(text.indexOf("Pause messaging")).toBeLessThan(text.indexOf("Messages sent"));
  });

  it("reads as Sending normally, on the application's own green chip", async () => {
    render(await MessagingSchedulePage());

    const chip = screen.getByTestId("safety-state");
    expect(chip).toHaveTextContent("Sending normally");
    // The one status vocabulary's colours, not a panel painted by this section.
    expect(chip).toHaveAttribute("data-domain", "messagingSafety");
    expect(chip.className).toMatch(/MuiChip-colorSuccess/);
    // The one sentence the section carries. Somebody about to stop every
    // message the club sends is owed the three facts that decide whether they
    // should: what stops, what does not, and what may still arrive.
    expect(screen.getByTestId("messaging-safety").textContent).toContain(
      "Signups and replies continue to be saved",
    );
    expect(screen.queryByTestId("messaging-paused-banner")).not.toBeInTheDocument();
  });

  it("dresses every part of the section in a component the application already uses", async () => {
    // Brian, 18 September 2026: "The UX at the top is completely invented. We
    // should find UX we already use in the app and do that." The status, the
    // counts and what is waiting are all `Fact` rows; the held people are
    // `RowCard`s; the state is a `StatusChip`; there is no panel of this
    // section's own.
    vi.mocked(readMessagingSafetyStatus).mockResolvedValue(safetyStatus({ holds: [hold()] }));

    const { container } = render(await MessagingSchedulePage());
    const section = screen.getByTestId("messaging-safety");

    // `StatusChip`, from the one vocabulary.
    expect(screen.getByTestId("safety-state")).toHaveAttribute("data-domain", "messagingSafety");
    // `Fact` rows, carrying their own label — the record pages' own idiom.
    for (const [testId, label] of [
      ["safety-rate-day", "Last 24 hours"],
      ["safety-due", "Due now"],
      ["safety-held-count", "Messages held back"],
    ] as const) {
      expect(screen.getByTestId(testId), testId).toHaveAttribute("data-label", label);
    }
    expect(within(section).getAllByTestId("fact").length).toBeGreaterThan(0);
    // `RowCard`, the person line the roster and Administration boards use.
    expect(screen.getByTestId("safety-hold-person").className).toMatch(/MuiCard-root/);
    // And nothing of this section's own: the invented status panel carried a
    // severity of its own, and there is no longer anything to carry one.
    expect(container.querySelector("[data-severity]")).toBeNull();
  });

  it.each([
    ["messages_waiting", "Messages waiting", "Warning"],
    ["provider_cooling_down", "Provider cooling down", "Warning"],
    ["paused", "Paused", "Error"],
    ["emergency_stopped", "Emergency stop", "Error"],
    ["unavailable", "Safety status unavailable", "Error"],
  ] as const)("says %s on a chip in the vocabulary's own colour", async (state, label, colour) => {
    vi.mocked(readMessagingSafetyStatus).mockResolvedValue(safetyStatus({ state }));

    render(await MessagingSchedulePage());

    const chip = screen.getByTestId("safety-state");
    expect(chip).toHaveTextContent(label);
    expect(chip).toHaveAttribute("data-status", state);
    expect(chip.className).toMatch(new RegExp(`MuiChip-color${colour}`));
  });

  it("carries why, who and when in the same block as the state", async () => {
    vi.mocked(readMessagingSafetyStatus).mockResolvedValue(
      safetyStatus({
        state: "paused",
        pausedAt: new Date("2026-09-17T10:00:00Z"),
        pausedByName: "Rowan Ashfield",
        pausedReason: "Imported the wrong number list",
      }),
    );

    render(await MessagingSchedulePage());

    const block = screen.getByTestId("safety-status-block");
    expect(block).toHaveTextContent("Imported the wrong number list");
    expect(block).toHaveTextContent("Rowan Ashfield");
    expect(block).toHaveTextContent("17 Sep");
    // The control is in the same block, not a scroll away from the state.
    expect(within(block).getByTestId("safety-resume")).toBeInTheDocument();
  });

  it("puts a paused state at the top of the page as well as at the bottom", async () => {
    vi.mocked(readMessagingSafetyStatus).mockResolvedValue(
      safetyStatus({ state: "paused", pausedAt: new Date("2026-09-17T10:00:00Z") }),
    );

    render(await MessagingSchedulePage());

    expect(screen.getByTestId("messaging-paused-banner")).toHaveTextContent("Messaging is paused.");
    expect(screen.getByTestId("safety-state")).toHaveTextContent("Paused");
    expect(screen.getByTestId("safety-resume")).toBeInTheDocument();
    expect(screen.queryByTestId("safety-pause")).not.toBeInTheDocument();
  });

  it("offers a one-tap reason, and a free-text field that nothing waits for", async () => {
    const { container } = render(await MessagingSchedulePage());

    const presets = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[name="reasonPreset"]'),
    ).map((input) => input.value);
    expect(presets).toEqual(["Runaway sends", "Provider outage", "Testing"]);
    // Nothing is chosen for the operator, and the note beside the presets is
    // optional — the preset alone is a complete reason (`safety-actions`).
    for (const input of container.querySelectorAll<HTMLInputElement>(
      'input[name="reasonPreset"]',
    )) {
      expect(input.checked).toBe(false);
    }
    const note = screen.getByLabelText("Anything else (optional)");
    expect(note).not.toBeRequired();
  });

  it("says how many were sent in five minutes, an hour and a day", async () => {
    // Brian, 18 September 2026: "Just say what the thing is: how many messages
    // were sent in the last 24 hours."
    vi.mocked(readMessagingSafetyStatus).mockResolvedValue(
      safetyStatus({ admittedInPacingWindow: 4, admittedInHour: 120, admittedInDay: 1_450 }),
    );

    render(await MessagingSchedulePage());

    const rows = ["pacing", "hour", "day"].map((key) => screen.getByTestId(`safety-rate-${key}`));
    expect(rows.map((row) => row.getAttribute("data-label"))).toEqual([
      "Last 5 minutes",
      "Last hour",
      "Last 24 hours",
    ]);
    expect(rows[0]).toHaveTextContent("4 of 50");
    expect(rows[2]).toHaveTextContent("1,450 of 3,000");
    // No ceiling governs an hour, so the row is the count and nothing else.
    expect(rows[1]).toHaveTextContent("120");
    expect(rows[1].textContent).not.toContain("of");
    // Below every threshold, so no row carries a word about one.
    for (const row of rows) expect(within(row).queryByText(/limit/i)).not.toBeInTheDocument();
  });

  it.each([
    [39, 2_399, null],
    [40, 2_400, "Nearing limit"],
    [50, 3_000, "At limit"],
  ] as const)("reads %s in five minutes and %s in a day as %s", async (pacing, day, word) => {
    vi.mocked(readMessagingSafetyStatus).mockResolvedValue(
      safetyStatus({ admittedInPacingWindow: pacing, admittedInDay: day }),
    );

    render(await MessagingSchedulePage());

    for (const key of ["pacing", "day"]) {
      const row = screen.getByTestId(`safety-rate-${key}`);
      // Colour is never the only signal: an amber reading says amber in words.
      if (word === null) {
        expect(within(row).queryByText(/limit/i), key).not.toBeInTheDocument();
      } else {
        expect(within(row).getByText(word), key).toBeInTheDocument();
      }
    }
  });

  it("says nothing is holding messages when nothing is", async () => {
    render(await MessagingSchedulePage());

    const row = screen.getByTestId("safety-nothing-blocking");
    expect(row).toHaveAttribute("data-label", "Holding");
    expect(row).toHaveTextContent("Nothing");
    expect(screen.queryAllByTestId("safety-blocker")).toHaveLength(0);
    expect(screen.getByTestId("safety-no-holds")).toHaveTextContent("Nobody");
  });

  it("names every cause that is blocking, each with the act that clears it", async () => {
    vi.mocked(readMessagingSafetyStatus).mockResolvedValue(
      safetyStatus({
        state: "paused",
        pausedAt: new Date("2026-09-17T10:00:00Z"),
        dueWaiting: 3,
        oldestDueMinutes: 7,
        holds: [
          hold({
            scopeId: "66666666-6666-4666-8666-666666666666",
            kind: "provider",
            label: "WhatsApp",
            reasonCode: "provider_cooldown",
            people: [],
            limitReached: null,
            cooldownUntil: new Date("2026-09-17T08:05:00Z"),
          }),
          hold(),
        ],
      }),
    );

    render(await MessagingSchedulePage());

    // One label–value row per cause, in the same idiom as every other row.
    const blockers = screen
      .getAllByTestId("safety-blocker")
      .map((row) => [row.getAttribute("data-label"), row.textContent]);
    expect(blockers).toEqual([
      ["Paused", "PausedResume"],
      ["WhatsApp cooling down", expect.stringMatching(/^WhatsApp cooling downuntil \d{2}:\d{2}$/)],
      ["People held back", "People held back1"],
    ]);
    expect(screen.getByTestId("safety-due")).toHaveTextContent("3 — oldest 7 min");
    expect(screen.queryByTestId("safety-nothing-blocking")).not.toBeInTheDocument();
  });

  it("lists a held person by name, with the limit they reached and their own Resume", async () => {
    vi.mocked(readMessagingSafetyStatus).mockResolvedValue(safetyStatus({ holds: [hold()] }));

    render(await MessagingSchedulePage());

    const card = screen.getByTestId("safety-hold-person");
    expect(within(card).getByRole("link", { name: "Wilfred Ashcombe" })).toHaveAttribute(
      "href",
      "/operate/people/44444444-4444-4444-8444-444444444444",
    );
    expect(card).toHaveTextContent("Daily limit reached");
    expect(card).toHaveTextContent("17 Sep");
    expect(within(card).getByTestId("safety-resume-person")).toBeInTheDocument();
  });

  it("says which ceiling a hold reached, and falls back to the code once it cannot", async () => {
    vi.mocked(readMessagingSafetyStatus).mockResolvedValue(
      safetyStatus({ holds: [hold({ limitReached: "weekly" })] }),
    );
    render(await MessagingSchedulePage());
    expect(screen.getByTestId("safety-hold-person")).toHaveTextContent("Weekly limit reached");

    cleanup();
    // Once the counting fields have aged out there is nothing left to read the
    // window back from, and the stored reason code is all the section has.
    vi.mocked(readMessagingSafetyStatus).mockResolvedValue(
      safetyStatus({ holds: [hold({ limitReached: null })] }),
    );
    render(await MessagingSchedulePage());
    expect(screen.getByTestId("safety-hold-person")).toHaveTextContent(
      "Held — this person's limit reached",
    );
  });

  it("keeps a provider cooldown out of People held back — it is not a person", async () => {
    vi.mocked(readMessagingSafetyStatus).mockResolvedValue(
      safetyStatus({
        state: "provider_cooling_down",
        holds: [
          hold({
            kind: "provider",
            label: "WhatsApp",
            reasonCode: "provider_cooldown",
            people: [],
            limitReached: null,
            cooldownUntil: new Date("2026-09-17T08:05:00Z"),
          }),
        ],
      }),
    );

    render(await MessagingSchedulePage());

    expect(screen.getByTestId("safety-no-holds")).toHaveTextContent("Nobody");
    // A provider cools down on its own; there is nothing for an operator to
    // resume, so nothing is offered.
    expect(screen.queryByTestId("safety-resume-provider")).not.toBeInTheDocument();
    // It appears under Waiting instead, as the cause it is, with the time it ends.
    const blocker = screen.getAllByTestId("safety-blocker")[0];
    expect(blocker).toHaveAttribute("data-label", "WhatsApp cooling down");
    expect(blocker.textContent).toMatch(/until \d{2}:\d{2}$/);
  });

  it("names a held number by the people it reaches, never by its fingerprint", async () => {
    vi.mocked(readMessagingSafetyStatus).mockResolvedValue(
      safetyStatus({
        state: "messages_waiting",
        dueWaiting: 3,
        oldestDueMinutes: 7,
        holds: [
          hold({
            kind: "destination",
            label: "One number or address",
            reasonCode: "destination_hold",
            people: [
              { personId: "p1", name: "Wilfred Ashcombe" },
              { personId: "p2", name: "Marged Ashcombe" },
            ],
            shared: true,
          }),
        ],
      }),
    );

    render(await MessagingSchedulePage());

    const card = screen.getByTestId("safety-hold-destination");
    expect(card).toHaveTextContent("Wilfred Ashcombe, Marged Ashcombe");
    expect(card).toHaveTextContent("Shared by more than one person");
    // Two people share it, so there is no one record to open.
    expect(within(card).queryByRole("link")).not.toBeInTheDocument();
    // The fingerprint is server-side only and never reaches a browser payload.
    expect(screen.getByTestId("messaging-safety").textContent).not.toMatch(/[0-9a-f]{64}/);
  });

  it("offers the controls to every seat that can open the page: the core four and the IT Officer", async () => {
    for (const seat of [
      "president",
      "vice_president",
      "secretary",
      "general_manager",
      "it_officer",
    ]) {
      cleanup();
      signedIn(administrator(seat));
      render(await MessagingSchedulePage());
      expect(screen.getByTestId("safety-pause"), seat).toBeInTheDocument();
    }

    // LAN-407 (Brian, 21 September 2026): the IT Officer holds the controls
    // too, so every seat that can open this page can also pause it. The action
    // behind each control still guards independently — `safety-actions.test.ts`
    // proves a seat without the capability is refused at the server.
  });

  it("shows the limits, read-only, with the decision that set them", async () => {
    const { container } = render(await MessagingSchedulePage());

    const section = screen.getByTestId("messaging-safety");
    expect(section.textContent).toContain("50 per 5 minutes");
    expect(section.textContent).toContain("3,000 per 24 hours");
    expect(section.textContent).toContain("Brian, 17 September 2026");

    // Read-only means read-only: the limits are constants in code, and there
    // is nothing on this page that could change one.
    const inputs = Array.from(container.querySelectorAll("input"))
      .map((input) => input.getAttribute("name"))
      .filter((name): name is string => name !== null);
    expect(inputs).not.toContain("limit");
    expect(section.textContent).not.toContain("send all now");
    expect(section.textContent.toLowerCase()).not.toContain("clear counters");
  });
});
