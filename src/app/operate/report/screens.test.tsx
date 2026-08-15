/**
 * The Monday report screen — LAN-81.
 *
 * Rewritten after Brian's 15 August 2026 review. The screen it used to test —
 * six counted categories, a preview step, a Generate button, a version list and
 * an "Open first action" that jumped to an anchor — is gone, and so are the
 * assertions that pinned it. What replaced it is two lists and a date field.
 *
 * Three properties survive the redesign unchanged, and they are the ones worth
 * having:
 *
 *   * **The screen renders stored content.** It is handed a snapshot and must
 *     render *that*, never a recomputation.
 *
 *   * **The authorization binding.** The capability map is tested exhaustively
 *     elsewhere and the *wiring* is not, so gating this page on the wrong
 *     capability would pass typecheck and the whole suite. These tests drive
 *     the real gate with real role codes.
 *
 *   * **No protected data reaches an unauthorized reader.** Not one name, not
 *     one reason, in the markup.
 *
 * The service layer is mocked. What is under test is the screen.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  usePathname: () => "/operate/report",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("../../login/actions", () => ({ signOut: vi.fn() }));
vi.mock("@/lib/services/weekly-report", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/weekly-report")>();
  return { ...actual, readReportForDate: vi.fn() };
});

import { NotFound } from "@/lib/db";
import { resolveOperatorAccess, type ResolvedOperator } from "@/lib/auth/operator";
import {
  readReportForDate,
  REPORT_CONTENT_SCHEMA,
  type EventOutcome,
  type GridRow,
  type StoredReport,
  type UpcomingEvent,
  type WeeklyReportContent,
} from "@/lib/services/weekly-report";
import ReportPage from "./page";
import {
  AVAILABILITY_HEADLINE,
  GRID_EMPTY,
  GRID_HEADLINE,
  LAST_WEEK_HEADLINE,
  NEXT_WEEK_HEADLINE,
  NOTHING_AT_ALL,
  ONBOARDING_HEADLINE,
  RECRUITMENT_HEADLINE,
  REPORT_HEADLINE,
  WALK_UPS_HEADLINE,
} from "./presentation";

const REPORT_ON = "2026-10-19";

function operator(roleCodes: string[]): ResolvedOperator {
  return {
    authUserId: "00000000-0000-4000-8000-000000000001",
    personId: "00000000-0000-4000-8000-000000000002",
    displayName: "Morgan Pike",
    roleCodes,
    isActive: true,
  };
}

function signedInAs(roleCodes: string[]): void {
  vi.mocked(resolveOperatorAccess).mockResolvedValue({
    state: "active",
    operator: operator(roleCodes),
  });
}

function props(query: Record<string, string> = {}) {
  return {
    params: Promise.resolve({}),
    searchParams: Promise.resolve({ date: REPORT_ON, ...query }),
  } as unknown as PageProps<"/operate/report">;
}

const PRACTICE = "event-practice";
const SOCIAL = "event-social";

const LAST_WEEK: EventOutcome[] = [
  {
    id: PRACTICE,
    name: "Practice — week 3",
    eventType: "practice",
    status: "occurred",
    on: "2026-10-14",
    isMandatory: true,
    solicitsResponse: true,
    invited: 24,
    respondedYes: 18,
    respondedNo: 3,
    noAnswer: 3,
    present: 14,
    late: 1,
    excused: 1,
    absent: 2,
    turnoutPercent: 63,
    registerTaken: true,
    walkUps: 1,
    neverInvited: 1,
  },
  {
    id: SOCIAL,
    name: "Club social",
    eventType: "social",
    status: "occurred",
    on: "2026-10-16",
    isMandatory: false,
    solicitsResponse: true,
    invited: 30,
    respondedYes: 22,
    respondedNo: 5,
    noAnswer: 3,
    present: 0,
    late: 0,
    excused: 0,
    absent: 0,
    turnoutPercent: null,
    registerTaken: false,
    walkUps: 0,
    neverInvited: 0,
  },
];

const GRID_ROWS: GridRow[] = [
  {
    person: "Leo Hartwell",
    problems: 2,
    cells: [
      { eventId: PRACTICE, state: "said_yes_absent", reason: null },
      { eventId: SOCIAL, state: "no_rsvp", reason: null },
    ],
  },
  {
    person: "Kit Ashdown",
    problems: 1,
    cells: [{ eventId: SOCIAL, state: "not_attending", reason: "Coursework deadline." }],
  },
];

const NEXT_WEEK: UpcomingEvent[] = [
  {
    id: "event-next-practice",
    name: "Practice — week 4",
    eventType: "practice",
    status: "approved",
    on: "2026-10-21",
    isMandatory: true,
    solicitsResponse: true,
    invited: 24,
    answered: 9,
  },
  {
    id: "event-next-draft",
    name: "Varsity warm-up",
    eventType: "fixture",
    status: "draft",
    on: "2026-10-24",
    isMandatory: false,
    solicitsResponse: true,
    invited: 0,
    answered: 0,
  },
];

function content(overrides: Partial<WeeklyReportContent> = {}): WeeklyReportContent {
  return {
    schema: REPORT_CONTENT_SCHEMA,
    metricDefinitionVersion: "LAN-81.3",
    reportOn: REPORT_ON,
    lookBack: { from: "2026-10-12", to: "2026-10-18" },
    lookAhead: { from: "2026-10-19", to: "2026-10-26" },
    season: { id: "season-1", label: "2026-27" },
    lastWeek: LAST_WEEK,
    grid: {
      columns: [
        { eventId: PRACTICE, label: "Practice", on: "2026-10-14" },
        { eventId: SOCIAL, label: "Club social", on: "2026-10-16" },
      ],
      rows: GRID_ROWS,
    },
    availability: [
      { person: "Emrys Netherby", level: "red", since: "2026-10-01", reviewOn: "2026-11-01" },
      { person: "Zephyr", level: "orange", since: "2026-09-28", reviewOn: null },
    ],
    nextWeek: NEXT_WEEK,
    walkUps: [{ person: "Devon Skye", event: "Practice — week 3", on: "2026-10-14" }],
    recruitment: [],
    onboarding: [
      { person: "Rowan Delacourt", membershipStatus: "active", outstanding: "Kit sorted" },
      {
        person: "Sim Trelawney",
        membershipStatus: "onboarding",
        outstanding: "BUCS Play registration",
      },
    ],
    attendance: { present: 14, late: 1, excused: 1, absent: 2, eventsWithNoRegister: 1 },
    availabilityCounts: { green: 31, orange: 4, red: 2 },
    ...overrides,
  };
}

function stored(overrides: Partial<StoredReport> = {}): StoredReport {
  return {
    id: "00810081-0081-4081-8081-000000000002",
    seasonId: "season-1",
    reportOn: REPORT_ON,
    version: 2,
    supersedesId: "00810081-0081-4081-8081-000000000001",
    metricDefinitionVersion: "LAN-81.3",
    dataAsOf: "2026-10-19T07:04:00Z",
    generatedAt: "2026-10-19T07:05:00Z",
    generatedByName: "Morgan Pike",
    content: content(),
    isSuperseded: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  signedInAs(["secretary"]);
  vi.mocked(readReportForDate).mockResolvedValue(stored());
});

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

describe("who reaches the report at all", () => {
  it.each(["president", "vice_president", "secretary", "general_manager"])(
    "admits %s",
    async (code) => {
      signedInAs([code]);

      const { container } = render(await ReportPage(props()));

      expect(container.textContent).toContain(REPORT_HEADLINE);
    },
  );

  it.each(["treasurer", "it_officer", "social_secretary"])(
    "refuses %s with no report content at all",
    async (code) => {
      signedInAs([code]);

      const { container } = render(await ReportPage(props()));

      expect(container.textContent).toContain("You do not have access to this action");
      expect(container.textContent).not.toContain(GRID_HEADLINE);
      // Not one stored name, and not one reason, in the payload.
      for (const secret of [
        "Leo Hartwell",
        "Kit Ashdown",
        "Coursework deadline",
        "Emrys Netherby",
      ]) {
        expect(container.innerHTML).not.toContain(secret);
      }
    },
  );

  it("reads nothing at all for a refused operator", async () => {
    signedInAs(["treasurer"]);

    render(await ReportPage(props()));

    // The gate runs before the read, so a refused caller does not even cause a
    // query — and, since opening the report files a snapshot, does not cause a
    // write either.
    expect(readReportForDate).not.toHaveBeenCalled();
  });

  it("sends a caller with no session to the login page, keeping the route", async () => {
    vi.mocked(resolveOperatorAccess).mockResolvedValue({ state: "no_session" } as never);

    await expect(ReportPage(props())).rejects.toThrow(
      "REDIRECT:/login?redirectTo=%2Foperate%2Freport",
    );
  });

  it("files the snapshot as the operator who opened it", async () => {
    signedInAs(["president"]);

    await ReportPage(props());

    expect(readReportForDate).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000002",
      REPORT_ON,
    );
  });
});

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

describe("the report", () => {
  it("puts the sections in the order Brian asked for", async () => {
    const { container } = render(await ReportPage(props()));
    const text = container.textContent ?? "";

    const order = [
      LAST_WEEK_HEADLINE,
      GRID_HEADLINE,
      AVAILABILITY_HEADLINE,
      NEXT_WEEK_HEADLINE,
      WALK_UPS_HEADLINE,
      RECRUITMENT_HEADLINE,
      ONBOARDING_HEADLINE,
    ].map((headline) => text.indexOf(headline));

    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((left, right) => left - right)).toEqual(order);
  });

  it("counts each section in its own heading", async () => {
    render(await ReportPage(props()));

    expect(screen.getByTestId("section-last-week")).toHaveAttribute("data-count", "2");
    expect(screen.getByTestId("section-grid")).toHaveAttribute("data-count", "2");
    expect(screen.getByTestId("section-availability")).toHaveAttribute("data-count", "2");
    expect(screen.getByTestId("section-next-week")).toHaveAttribute("data-count", "2");
    expect(screen.getByTestId("section-walk-ups")).toHaveAttribute("data-count", "1");
    expect(screen.getByTestId("section-onboarding")).toHaveAttribute("data-count", "2");
  });
});

describe("last week", () => {
  it("shows the RSVP numbers and the turnout for each event", async () => {
    render(await ReportPage(props()));

    const row = screen.getByTestId(`event-${PRACTICE}`);
    const text = row.textContent ?? "";
    expect(text).toContain("Practice — week 3");
    expect(text).toContain("24");
    expect(text).toContain("18");
    expect(text).toContain("63%");
  });

  /**
   * A register nobody took must never read as nobody turning up. Those are
   * opposite operational facts and the same 0%.
   */
  it("says no register rather than nought per cent", async () => {
    render(await ReportPage(props()));

    const row = screen.getByTestId(`event-${SOCIAL}`);
    expect(row).toHaveAttribute("data-register", "missing");
    expect(row.textContent).toContain("no register");
    expect(row.textContent).not.toContain("0%");
  });

  it("carries the walk-up and the approval defect on the event's own row", async () => {
    render(await ReportPage(props()));

    const flags = screen.getByTestId(`flags-${PRACTICE}`).textContent ?? "";
    expect(flags).toContain("1 walk-up");
    expect(flags).toContain("1 approved, never invited");
    // And there is no bucket collecting them elsewhere.
    expect(screen.queryByTestId("section-fix")).toBeNull();
  });

  it("links each event to itself", async () => {
    render(await ReportPage(props()));

    expect(screen.getByRole("link", { name: "Practice — week 3" })).toHaveAttribute(
      "href",
      `/operate/events/${PRACTICE}`,
    );
  });

  it("names the week it covers", async () => {
    const { container } = render(await ReportPage(props()));

    expect(container.textContent).toContain("12 – 18 October");
  });
});

describe("who needs chasing", () => {
  it("gives each person one row, whatever went wrong across the week", async () => {
    render(await ReportPage(props()));

    const rows = screen.getAllByTestId("grid-row");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("Leo Hartwell");
    expect(rows[0]).toHaveAttribute("data-problems", "2");
  });

  it("marks each cell, and explains the marks", async () => {
    render(await ReportPage(props()));

    const grid = screen.getByTestId("section-grid").textContent ?? "";
    expect(grid).toContain("yes*");
    expect(grid).toContain("—");
    expect(screen.getByTestId("grid-legend").textContent).toContain("said yes, did not attend");
  });

  it("keeps the reason with the person who gave it", async () => {
    render(await ReportPage(props()));

    expect(screen.getByTestId("section-grid").innerHTML).toContain("Coursework deadline.");
  });

  it("has one column per event, headed and dated", async () => {
    render(await ReportPage(props()));

    const head = screen.getByTestId("section-grid").querySelectorAll("thead th");
    // Person, then one per event.
    expect(head).toHaveLength(3);
    expect(head[1].textContent).toContain("Practice");
    expect(head[1].textContent).toContain("Wed 14 Oct");
  });
});

describe("next week", () => {
  it("shows what is coming, with its state and whether anything has gone out", async () => {
    render(await ReportPage(props()));

    const approved = screen.getByTestId("upcoming-event-next-practice");
    expect(approved).toHaveAttribute("data-status", "approved");
    expect(approved.textContent).toContain("9 of 24 answered");

    const draft = screen.getByTestId("upcoming-event-next-draft");
    expect(draft).toHaveAttribute("data-status", "draft");
    expect(draft.textContent).toContain("No invitations sent");
  });

  it("links each one to itself, because this screen does not edit", async () => {
    render(await ReportPage(props()));

    expect(screen.getByRole("link", { name: "Practice — week 4" })).toHaveAttribute(
      "href",
      "/operate/events/event-next-practice",
    );
  });

  it("names the week ahead it covers", async () => {
    const { container } = render(await ReportPage(props()));

    expect(container.textContent).toContain("19 – 26 October");
  });
});

describe("availability, walk-ups, recruitment and onboarding", () => {
  it("names who is not available, since when, and when to review", async () => {
    render(await ReportPage(props()));

    const availability = screen.getByTestId("section-availability").textContent ?? "";
    expect(availability).toContain("Emrys Netherby");
    expect(availability).toContain("Unavailable");
    expect(availability).toContain("since Thu 1 Oct");
    expect(availability).toContain("review Sun 1 Nov");
  });

  /**
   * Brian, 15 August 2026, on the caption under the availability counts:
   * "You should level only, no narrative or diagnosis record anywhere. Get
   * that shit out of there."
   *
   * The absence is still real — the schema has no column that could hold a
   * note — and the sentence explaining it now lives in the code that maintains
   * it rather than on his Monday morning.
   */
  it("does not explain the absence of a narrative", async () => {
    const { container } = render(await ReportPage(props()));
    const text = container.textContent ?? "";

    expect(text).not.toMatch(/narrative/i);
    expect(text).not.toMatch(/diagnosis/i);
  });

  it("names each remaining section for a thing the club has a word for", async () => {
    const { container } = render(await ReportPage(props()));
    const text = container.textContent ?? "";

    expect(text).toContain(WALK_UPS_HEADLINE);
    expect(text).toContain(RECRUITMENT_HEADLINE);
    expect(text).toContain(ONBOARDING_HEADLINE);
    // The abstract bucket Brian rejected is gone, and not renamed.
    expect(text).not.toMatch(/fix these things/i);
    expect(text).not.toMatch(/needs correcting/i);
  });

  it("says so plainly when a section is empty", async () => {
    render(await ReportPage(props()));

    expect(screen.getByTestId("empty-recruitment")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// What successive reviews removed
// ---------------------------------------------------------------------------

describe("what the reviews removed", () => {
  it("offers no preview, no generate, no version list and no abstract buckets", async () => {
    const { container } = render(await ReportPage(props()));

    const text = container.textContent ?? "";
    for (const gone of [
      "Preview report",
      "Generate report",
      "View report versions",
      "Open first action",
      "Open stored list",
      "Snapshot version",
      "Metric definitions",
      "Chase these people",
      "Fix these things",
    ]) {
      expect(text, `"${gone}" is still on the screen`).not.toContain(gone);
    }
  });

  it("never puts a version number in front of the reader", async () => {
    const { container } = render(await ReportPage(props()));

    expect(container.textContent).not.toMatch(/\bv[12]\b/);
    expect(container.textContent).not.toMatch(/superseded/i);
  });

  it("has exactly one form, and it only navigates", async () => {
    render(await ReportPage(props()));

    const forms = [...document.querySelectorAll("form")];
    expect(forms).toHaveLength(1);
    expect(forms[0].getAttribute("method")).toBe("get");
  });

  it("prints the date instruction once, not twice", async () => {
    // The first build labelled the field "Choose another date" and put a button
    // reading the same words beside it. Brian met both on the first screen he
    // opened.
    const { container } = render(await ReportPage(props()));
    const text = container.textContent ?? "";

    expect(text).not.toContain("Choose another date");
    // One control, labelled once. `textContent` finds the words twice because
    // MUI's outlined field repeats its label in the notch legend, which is its
    // own markup rather than a second instruction — so this counts controls.
    expect(screen.getAllByLabelText(/Reporting date/)).toHaveLength(1);
    expect(container.querySelectorAll("label")).toHaveLength(1);
    expect(text).toContain("Show report");
  });
});

// ---------------------------------------------------------------------------
// Stored content, and the states around it
// ---------------------------------------------------------------------------

describe("the screen reads stored content", () => {
  it("renders the snapshot it was handed and computes nothing", async () => {
    // The only service function this page may call is the one that returns a
    // snapshot. If it ever grows a recompute path, this count changes.
    const { container } = render(await ReportPage(props()));

    expect(readReportForDate).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Leo Hartwell");
    expect(container.textContent).toContain("Practice — week 3");
    expect(screen.getByTestId("stored-note").textContent).toMatch(/kept exactly as it was/);
  });

  it("distinguishes a quiet week from a week nobody recorded", async () => {
    vi.mocked(readReportForDate).mockResolvedValue(
      stored({
        content: content({
          lastWeek: [],
          nextWeek: [],
          grid: { columns: [], rows: [] },
        }),
      }),
    );

    render(await ReportPage(props()));

    expect(screen.getByTestId("nothing-at-all").textContent).toBe(NOTHING_AT_ALL);
    expect(screen.getByTestId("empty-grid").textContent).toBe(GRID_EMPTY);
  });

  it("does not claim a quiet week when only the grid is empty", async () => {
    vi.mocked(readReportForDate).mockResolvedValue(
      stored({ content: content({ grid: { columns: [], rows: [] } }) }),
    );

    render(await ReportPage(props()));

    // Last week and next week still have events, so the week was not quiet.
    expect(screen.queryByTestId("nothing-at-all")).toBeNull();
    expect(screen.getByTestId("empty-grid")).toBeVisible();
  });

  it("stays readable when the snapshot used earlier metric definitions", async () => {
    vi.mocked(readReportForDate).mockResolvedValue(
      stored({
        metricDefinitionVersion: "LAN-81.2",
        content: { schema: "lancers.monday-report.v2", chase: [], fix: [] },
      }),
    );

    const { container } = render(await ReportPage(props()));

    expect(screen.getByTestId("other-metric-version")).toBeVisible();
    // Its metadata is still there, and nothing was invented to fill the gap.
    expect(screen.getByTestId("stored-note")).toBeVisible();
    expect(container.textContent).not.toContain(GRID_HEADLINE);
  });
});

describe("a refusal keeps the operator on the route with a way out", () => {
  it("shows the refusal and the date control rather than a stack trace", async () => {
    vi.mocked(readReportForDate).mockRejectedValue(
      new NotFound("There is no season currently open.", { rule: "no_current_season" }),
    );

    render(await ReportPage(props()));

    expect(screen.getByTestId("report-unavailable").textContent).toBe(
      "There is no season currently open.",
    );
    expect(screen.getByTestId("report-date-form")).toBeVisible();
  });

  it("does not swallow a failure that is not a refusal", async () => {
    vi.mocked(readReportForDate).mockRejectedValue(new TypeError("boom"));

    await expect(ReportPage(props())).rejects.toBeInstanceOf(TypeError);
  });
});
