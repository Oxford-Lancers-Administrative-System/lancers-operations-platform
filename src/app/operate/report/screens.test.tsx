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
import { render, screen, within } from "@testing-library/react";

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
  type ChaseItem,
  type FixItem,
  type StoredReport,
  type WeeklyReportContent,
} from "@/lib/services/weekly-report";
import ReportPage from "./page";
import {
  AVAILABILITY_NOTE,
  CHASE_EMPTY,
  CHASE_HEADLINE,
  FIX_EMPTY,
  FIX_HEADLINE,
  NOTHING_AT_ALL,
  ONBOARDING_HEADLINE,
  REPORT_HEADLINE,
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

const CHASE: ChaseItem[] = [
  {
    kind: "said_yes_absent",
    person: "Leo Hartwell",
    what: "Said yes, marked absent",
    event: "Team Practice",
    on: "2026-10-14",
    isMandatory: true,
    reason: null,
  },
  {
    kind: "no_answer",
    person: "Nia Sorrell",
    what: "Never answered",
    event: "Team Practice",
    on: "2026-10-14",
    isMandatory: true,
    reason: null,
  },
  {
    kind: "said_no",
    person: "Kit Ashdown",
    what: "Not attending",
    event: "Club social",
    on: "2026-10-13",
    isMandatory: false,
    reason: "Coursework deadline.",
  },
];

const FIX: FixItem[] = [
  {
    kind: "register_not_taken",
    event: "Chalk — week 3",
    on: "2026-10-15",
    what: "Register never taken — 12 people were asked",
    person: null,
  },
  {
    kind: "approved_never_invited",
    event: "Team Practice",
    on: "2026-10-14",
    what: "Approved for this event and never invited",
    person: "Ivo Marchetti",
  },
];

function content(overrides: Partial<WeeklyReportContent> = {}): WeeklyReportContent {
  return {
    schema: REPORT_CONTENT_SCHEMA,
    metricDefinitionVersion: "LAN-81.2",
    reportOn: REPORT_ON,
    window: { from: "2026-10-12", to: "2026-10-18" },
    season: { id: "season-1", label: "2026-27" },
    chase: CHASE,
    fix: FIX,
    onboarding: [
      { person: "Rowan Delacourt", membershipStatus: "active", outstanding: "Kit sorted" },
      {
        person: "Sim Trelawney",
        membershipStatus: "onboarding",
        outstanding: "BUCS Play registration",
      },
    ],
    events: [
      {
        id: "event-1",
        name: "Team Practice",
        eventType: "practice",
        status: "occurred",
        on: "2026-10-14",
        solicitsResponse: true,
        isMandatory: true,
        invited: 24,
        recorded: 15,
      },
    ],
    responseBreakdown: [
      {
        eventId: "event-1",
        eventName: "Team Practice",
        on: "2026-10-14",
        respondedYes: 18,
        respondedNo: 3,
        awaitingResponse: 3,
        expiredWithoutResponse: 0,
        cancelled: 0,
        neverInvited: 0,
      },
    ],
    attendance: { present: 24, late: 2, excused: 1, absent: 2, eventsWithNoRegister: 1 },
    availability: { green: 31, orange: 4, red: 2 },
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
    metricDefinitionVersion: "LAN-81.2",
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
      expect(container.textContent).not.toContain(CHASE_HEADLINE);
      // Not one stored name, and not one reason, in the payload.
      for (const secret of ["Leo Hartwell", "Kit Ashdown", "Coursework deadline"]) {
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
  it("leads with the two lists, chase before fix", async () => {
    const { container } = render(await ReportPage(props()));

    const text = container.textContent ?? "";
    expect(text).toContain(CHASE_HEADLINE);
    expect(text).toContain(FIX_HEADLINE);
    expect(text.indexOf(CHASE_HEADLINE)).toBeLessThan(text.indexOf(FIX_HEADLINE));
    expect(text.indexOf(FIX_HEADLINE)).toBeLessThan(text.indexOf(ONBOARDING_HEADLINE));
  });

  it("counts each list in its own heading, rather than in a row of tiles", async () => {
    render(await ReportPage(props()));

    expect(screen.getByTestId("section-chase")).toHaveAttribute("data-count", "3");
    expect(screen.getByTestId("section-fix")).toHaveAttribute("data-count", "2");
    expect(screen.getByTestId("section-onboarding")).toHaveAttribute("data-count", "2");
  });

  it("names every person to chase, in the order the snapshot stored them", async () => {
    render(await ReportPage(props()));

    const text = screen.getByTestId("section-chase").textContent ?? "";
    for (const person of ["Leo Hartwell", "Nia Sorrell", "Kit Ashdown"]) {
      expect(text).toContain(person);
    }
    // Stored order is preserved — the service decided it, and re-sorting on
    // screen would make the snapshot and the screen disagree.
    expect(text.indexOf("Leo Hartwell")).toBeLessThan(text.indexOf("Nia Sorrell"));
    expect(text.indexOf("Nia Sorrell")).toBeLessThan(text.indexOf("Kit Ashdown"));
  });

  it("puts the reason beside the person who gave it", async () => {
    render(await ReportPage(props()));

    const chase = screen.getByTestId("section-chase");
    expect(within(chase).getByText(/Coursework deadline/)).toBeVisible();
    expect(chase.textContent).toContain("Kit Ashdown");
  });

  it("says what each chase is, and marks a mandatory event as one", async () => {
    render(await ReportPage(props()));

    const chase = screen.getByTestId("section-chase").textContent ?? "";
    expect(chase).toContain("Said yes, absent");
    expect(chase).toContain("Never answered");
    expect(chase).toContain("Not attending");
    expect(chase).toContain("(mandatory)");
  });

  it("names the thing to fix, and the person where the defect is about one", async () => {
    render(await ReportPage(props()));

    const fix = screen.getByTestId("section-fix").textContent ?? "";
    expect(fix).toContain("Chalk — week 3");
    expect(fix).toContain("Register never taken");
    expect(fix).toContain("Ivo Marchetti");
    expect(fix).toContain("never invited");
    // A fix is never worded as somebody to chase.
    expect(fix).not.toMatch(/chase|remind/i);
  });

  it("shows the week's numbers, and availability as levels with the sentence saying why", async () => {
    render(await ReportPage(props()));

    expect(screen.getByTestId("availability-levels").textContent).toBe(
      "Active 31 · Limited 4 · Unavailable 2",
    );
    expect(screen.getByTestId("week-in-numbers").textContent).toContain(AVAILABILITY_NOTE);
    expect(screen.getByTestId("week-attendance").textContent).toContain("Present 24");
  });

  it("names the reporting date and the seven days it covers", async () => {
    const { container } = render(await ReportPage(props()));

    expect(container.textContent).toContain("Monday, 19 October 2026");
    expect(container.textContent).toContain("Covering Monday 12 – Sunday 18 October 2026");
  });
});

// ---------------------------------------------------------------------------
// What the review removed
// ---------------------------------------------------------------------------

describe("what the 15 August review removed", () => {
  it("offers no preview, no generate, no version list and no first action", async () => {
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
    expect(screen.getByTestId("stored-note").textContent).toMatch(/kept exactly as it was/);
  });

  it("distinguishes a quiet week from a week nobody recorded", async () => {
    vi.mocked(readReportForDate).mockResolvedValue(
      stored({ content: content({ chase: [], fix: [] }) }),
    );

    render(await ReportPage(props()));

    expect(screen.getByTestId("nothing-at-all").textContent).toBe(NOTHING_AT_ALL);
    expect(screen.getByTestId("empty-chase").textContent).toBe(CHASE_EMPTY);
    expect(screen.getByTestId("empty-fix").textContent).toBe(FIX_EMPTY);
  });

  it("does not claim an all-clear when only one list is empty", async () => {
    vi.mocked(readReportForDate).mockResolvedValue(stored({ content: content({ chase: [] }) }));

    render(await ReportPage(props()));

    expect(screen.queryByTestId("nothing-at-all")).toBeNull();
    expect(screen.getByTestId("empty-chase")).toBeVisible();
  });

  it("stays readable when the snapshot used earlier metric definitions", async () => {
    vi.mocked(readReportForDate).mockResolvedValue(
      stored({
        metricDefinitionVersion: "LAN-81.1",
        content: { schema: "lancers.monday-exception-report.v1", exceptions: [] },
      }),
    );

    const { container } = render(await ReportPage(props()));

    expect(screen.getByTestId("other-metric-version")).toBeVisible();
    // Its metadata is still there, and nothing was invented to fill the gap.
    expect(screen.getByTestId("stored-note")).toBeVisible();
    expect(container.textContent).not.toContain(CHASE_HEADLINE);
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
