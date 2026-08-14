/**
 * UX-80, UX-81, UX-82 and UX-83 — LAN-81.
 *
 * Four screens on one route, and the two properties that matter most are both
 * screen properties rather than service ones:
 *
 *   * **The stored report reads stored content.** UX-81 is handed a snapshot
 *     and must render *that*, not a fresh computation. So the preview service
 *     is mocked to throw here: if the screen ever calls it, the test fails
 *     rather than passing on numbers that happen to agree.
 *
 *   * **The authorization binding.** The capability map is tested exhaustively
 *     elsewhere and the *wiring* is not, so gating this page on the wrong
 *     capability — or on the ordinary-operator floor — would pass typecheck and
 *     the whole suite. These tests drive the real gate with real role codes.
 *
 * The service layer is mocked. What is under test is the screen: who reaches
 * it, what it states, and what it offers.
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
  return {
    ...actual,
    previewWeeklyReport: vi.fn(),
    readCurrentReport: vi.fn(),
    listReportVersions: vi.fn(),
  };
});

import { NotFound } from "@/lib/db";
import { resolveOperatorAccess, type ResolvedOperator } from "@/lib/auth/operator";
import {
  listReportVersions,
  previewWeeklyReport,
  readCurrentReport,
  REPORT_CONTENT_SCHEMA,
  type ExceptionSection,
  type ReportPreview,
  type StoredReport,
  type WeeklyReportContent,
} from "@/lib/services/weekly-report";
import ReportPage from "./page";
import {
  AVAILABILITY_NOTE,
  EMPTY_HEADLINE,
  EMPTY_IS_NOT_AN_ALL_CLEAR,
  OPEN_FIRST_ACTION,
  PREVIEW_HEADLINE,
  PREVIEW_MEANING,
  REPORT_HEADLINE,
  STORED_ONLY_NOTE,
  VERSIONS_HEADLINE,
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

function section(overrides: Partial<ExceptionSection> = {}): ExceptionSection {
  return {
    key: "nonresponses",
    position: 1,
    title: "Nonresponses",
    count: 8,
    summary: "8 players across 2 events",
    note: "Review queue",
    isApprovalDefect: false,
    items: [
      {
        person: "Leo Hartwell",
        event: "Team Practice",
        on: "2026-10-14",
        detail: "Outstanding",
      },
    ],
    ...overrides,
  };
}

function content(overrides: Partial<WeeklyReportContent> = {}): WeeklyReportContent {
  return {
    schema: REPORT_CONTENT_SCHEMA,
    metricDefinitionVersion: "LAN-81.1",
    reportOn: REPORT_ON,
    window: { from: "2026-10-12", to: "2026-10-18" },
    season: { id: "season-1", label: "2026-27" },
    exceptions: [
      section(),
      section({
        key: "not_attending",
        position: 2,
        title: "Not attending",
        count: 5,
        summary: "5 responses and reasons",
        note: "Academic 3 · Injury 2",
        items: [
          { person: "Nia Sorrell", event: "Team Practice", on: "2026-10-14", detail: "Injury" },
        ],
      }),
      section({
        key: "mismatches",
        position: 3,
        title: "RSVP / attendance mismatches",
        count: 3,
        summary: "3 records",
        note: "Attending but absent 2",
        items: [],
      }),
      section({
        key: "absences",
        position: 4,
        title: "Absences / missing attendance",
        count: 2,
        summary: "2 absences",
        note: "1 incomplete register",
        items: [],
      }),
      section({
        key: "onboarding",
        position: 5,
        title: "Onboarding exceptions",
        count: 2,
        summary: "2 members",
        note: "Required item outstanding",
        items: [],
      }),
      section({
        key: "uninvited_audience",
        position: 6,
        title: "Uninvited audience defects",
        count: 1,
        summary: "1 approval defect",
        note: "Approved but never invited — requires review",
        isApprovalDefect: true,
        items: [
          {
            person: "Ivo Marchetti",
            event: "Team Practice",
            on: "2026-10-14",
            detail: "Confirmed in the audience and never invited",
          },
        ],
      }),
    ],
    events: [
      {
        id: "event-1",
        name: "Team Practice",
        eventType: "practice",
        status: "occurred",
        on: "2026-10-14",
        solicitsResponse: true,
      },
    ],
    responseBreakdown: [],
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
    metricDefinitionVersion: "LAN-81.1",
    dataAsOf: "2026-10-19T07:04:00Z",
    generatedAt: "2026-10-19T07:05:00Z",
    generatedByName: "Morgan Pike",
    content: content(),
    isSuperseded: false,
    ...overrides,
  };
}

function preview(overrides: Partial<ReportPreview> = {}): ReportPreview {
  const body = overrides.content ?? content();
  return {
    season: { id: "season-1", label: "2026-27", status: "active" },
    reportOn: REPORT_ON,
    window: body.window,
    content: body,
    computedAt: "2026-10-19T07:05:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  signedInAs(["secretary"]);
  vi.mocked(previewWeeklyReport).mockResolvedValue(preview());
  vi.mocked(readCurrentReport).mockResolvedValue(stored());
  vi.mocked(listReportVersions).mockResolvedValue([
    stored(),
    stored({
      id: "00810081-0081-4081-8081-000000000001",
      version: 1,
      supersedesId: null,
      dataAsOf: "2026-10-19T06:40:00Z",
      generatedAt: "2026-10-19T06:42:00Z",
      isSuperseded: true,
    }),
  ]);
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

  it.each(["head_coach", "offence_coach", "defence_coach", "treasurer", "it_officer"])(
    "refuses %s with UX-05 and no report content",
    async (code) => {
      signedInAs([code]);

      const { container } = render(await ReportPage(props()));

      expect(container.textContent).toContain("You do not have access to this action");
      expect(container.textContent).not.toContain(REPORT_HEADLINE);
      // Not a single stored name, count or reason in the payload.
      expect(container.innerHTML).not.toContain("Leo Hartwell");
      expect(container.innerHTML).not.toContain("Nia Sorrell");
      expect(container.innerHTML).not.toContain("Injury");
    },
  );

  it("reads nothing at all for a refused operator", async () => {
    signedInAs(["head_coach"]);

    render(await ReportPage(props()));

    // The gate runs before the read, so a refused caller does not even cause a
    // query. Authorization that refuses *after* reading has already read.
    expect(readCurrentReport).not.toHaveBeenCalled();
    expect(previewWeeklyReport).not.toHaveBeenCalled();
    expect(listReportVersions).not.toHaveBeenCalled();
  });

  it("sends a caller with no session to the login page, keeping the route", async () => {
    vi.mocked(resolveOperatorAccess).mockResolvedValue({ state: "no_session" } as never);

    await expect(ReportPage(props())).rejects.toThrow(
      "REDIRECT:/login?redirectTo=%2Foperate%2Freport",
    );
  });
});

// ---------------------------------------------------------------------------
// UX-81 — the stored snapshot
// ---------------------------------------------------------------------------

describe("UX-81 — the stored snapshot", () => {
  it("renders the stored content and never recomputes it", async () => {
    // The one assertion this whole screen exists for. If the page ever asks the
    // preview for its numbers, this fails.
    vi.mocked(previewWeeklyReport).mockRejectedValue(
      new Error("the stored report recomputed its content"),
    );

    const { container } = render(await ReportPage(props()));

    expect(screen.getByTestId("stored-report")).toBeVisible();
    expect(container.textContent).toContain(STORED_ONLY_NOTE);
    expect(previewWeeklyReport).not.toHaveBeenCalled();
  });

  it("shows the snapshot metadata the wireframe names", async () => {
    render(await ReportPage(props()));

    expect(screen.getByTestId("meta-version").textContent).toContain("v2");
    expect(screen.getByTestId("meta-metric-version").textContent).toContain("LAN-81.1");
    expect(screen.getByTestId("meta-generated-by").textContent).toContain("Morgan Pike");
    expect(screen.getByTestId("snapshot-stamp").textContent).toBe(
      "Generated 19 Oct 2026, 08:05 · Data as of 08:04",
    );
  });

  it("leads with the six exception categories, in the approved order", async () => {
    render(await ReportPage(props()));

    const rendered = [
      "nonresponses",
      "not_attending",
      "mismatches",
      "absences",
      "onboarding",
      "uninvited_audience",
    ];
    const positions = rendered.map((key) => {
      const element = screen.getByTestId(`exception-${key}`);
      return document.body.innerHTML.indexOf(element.outerHTML.slice(0, 60));
    });
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("labels the uninvited audience an approval defect, and nothing else one", async () => {
    render(await ReportPage(props()));

    expect(screen.getByTestId("approval-defect-uninvited_audience")).toBeVisible();
    for (const key of ["nonresponses", "not_attending", "mismatches", "absences", "onboarding"]) {
      expect(screen.queryByTestId(`approval-defect-${key}`)).toBeNull();
    }
    // And it never reads as a chase.
    const card = screen.getByTestId("exception-uninvited_audience");
    expect(card.textContent).toMatch(/never invited/i);
    expect(card.textContent).not.toMatch(/chase|remind|follow up/i);
  });

  it("opens each stored list from the snapshot's own items", async () => {
    render(await ReportPage(props()));

    // Present rather than visible: the card is collapsed until the reader opens
    // it, which is what the wireframe's **Open stored list** affordance means
    // and what keeps six categories legible on a phone. The names come from the
    // snapshot's own `items`, which is the property under test.
    const nonresponses = screen.getByTestId("exception-nonresponses");
    expect(within(nonresponses).getByText(/Leo Hartwell/)).toBeInTheDocument();
    expect(within(nonresponses).getByTestId("open-stored-list-nonresponses")).toBeVisible();

    const defects = screen.getByTestId("exception-uninvited_audience");
    expect(within(defects).getByText(/Ivo Marchetti/)).toBeInTheDocument();
  });

  it("shows availability as levels only, with the sentence that says why", async () => {
    render(await ReportPage(props()));

    expect(screen.getByTestId("availability-levels").textContent).toBe(
      "Active 31 · Limited 4 · Unavailable 2",
    );
    expect(screen.getByTestId("availability-panel").textContent).toContain(AVAILABILITY_NOTE);
  });

  it("points Open first action at the first category that has anything in it", async () => {
    vi.mocked(readCurrentReport).mockResolvedValue(
      stored({
        content: content({
          exceptions: content().exceptions.map((entry) =>
            entry.key === "nonresponses" ? { ...entry, count: 0, items: [] } : entry,
          ),
        }),
      }),
    );

    render(await ReportPage(props()));

    expect(screen.getByTestId("open-first-action")).toHaveAttribute(
      "href",
      "#section-not_attending",
    );
    expect(screen.getByTestId("open-first-action").textContent).toBe(OPEN_FIRST_ACTION);
  });

  it("offers no first action when the snapshot records no exception at all", async () => {
    vi.mocked(readCurrentReport).mockResolvedValue(
      stored({
        content: content({
          exceptions: content().exceptions.map((entry) => ({ ...entry, count: 0, items: [] })),
        }),
      }),
    );

    render(await ReportPage(props()));

    expect(screen.queryByTestId("open-first-action")).toBeNull();
    expect(screen.getByTestId("view-report-versions")).toBeVisible();
  });

  it("stays readable when the snapshot used other metric definitions", async () => {
    vi.mocked(readCurrentReport).mockResolvedValue(
      stored({
        metricDefinitionVersion: "master-table-v1",
        content: { squad_size: 42, note: "recovered from the master table" },
      }),
    );

    const { container } = render(await ReportPage(props()));

    expect(screen.getByTestId("other-metric-version")).toBeVisible();
    expect(screen.getByTestId("meta-metric-version").textContent).toContain("master-table-v1");
    // Its metadata is still there, and nothing was invented to fill the gap.
    expect(screen.getByTestId("snapshot-stamp")).toBeVisible();
    expect(container.textContent).not.toContain("Nonresponses");
  });
});

// ---------------------------------------------------------------------------
// UX-80 — the preview
// ---------------------------------------------------------------------------

describe("UX-80 — the preview", () => {
  it("computes rather than reading a snapshot, and says so", async () => {
    const { container } = render(await ReportPage(props({ preview: "1" })));

    expect(screen.getByTestId("report-preview")).toBeVisible();
    expect(container.textContent).toContain(PREVIEW_HEADLINE);
    expect(container.textContent).toContain(PREVIEW_MEANING);
    expect(previewWeeklyReport).toHaveBeenCalledWith(REPORT_ON);
    expect(readCurrentReport).not.toHaveBeenCalled();
  });

  it("names the reporting date and the seven days it covers", async () => {
    const { container } = render(await ReportPage(props({ preview: "1" })));

    expect(container.textContent).toContain("Reporting date · Monday, 19 October 2026");
    expect(container.textContent).toContain("Covering Monday 12 – Sunday 18 October 2026");
  });

  it("shows the four summary tiles the wireframe counts", async () => {
    render(await ReportPage(props({ preview: "1" })));

    expect(screen.getByTestId("tile-nonresponses").textContent).toContain("8");
    expect(screen.getByTestId("tile-not_attending").textContent).toContain("5");
    expect(screen.getByTestId("tile-mismatches").textContent).toContain("3");
    expect(screen.getByTestId("tile-absences").textContent).toContain("2");
  });

  it("numbers its six cards, as the preview wireframe does", async () => {
    const { container } = render(await ReportPage(props({ preview: "1" })));

    for (const title of [
      "1. Nonresponses",
      "2. Not attending",
      "3. RSVP / attendance mismatches",
      "4. Absences / missing attendance",
      "5. Onboarding exceptions",
      "6. Audience defects",
    ]) {
      expect(container.textContent).toContain(title);
    }
  });

  it("shows counts without the stored names, because nothing is stored yet", async () => {
    const { container } = render(await ReportPage(props({ preview: "1" })));

    expect(screen.queryByTestId("open-stored-list-nonresponses")).toBeNull();
    expect(container.innerHTML).not.toContain("Leo Hartwell");
  });

  it("offers exactly one control that writes", async () => {
    render(await ReportPage(props({ preview: "1" })));

    expect(screen.getByTestId("generate-report")).toBeVisible();
    const forms = document.querySelectorAll("form");
    // The generate form, and the two `GET` date forms that navigate. A second
    // writing form on this route would be a second way to file a snapshot.
    expect(document.querySelectorAll('form:not([method="get"])')).toHaveLength(1);
    expect(forms.length).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// UX-82 — the version list
// ---------------------------------------------------------------------------

describe("UX-82 — report versions", () => {
  it("lists every version, newest first, with the current one marked", async () => {
    const { container } = render(await ReportPage(props({ versions: "1" })));

    expect(container.textContent).toContain(VERSIONS_HEADLINE);
    expect(screen.getByTestId("version-2")).toHaveAttribute("data-current", "true");
    expect(screen.getByTestId("version-1")).toHaveAttribute("data-current", "false");
    expect(within(screen.getByTestId("version-2")).getByText("Current")).toBeVisible();
    expect(within(screen.getByTestId("version-1")).getByText("Superseded")).toBeVisible();
  });

  it("says what each version supersedes, and shows a dash for the first", async () => {
    render(await ReportPage(props({ versions: "1" })));

    expect(screen.getByTestId("version-2").textContent).toContain("v1");
    expect(screen.getByTestId("version-1").textContent).toContain("—");
  });

  it("shows generated and data-as-of separately, because they differ", async () => {
    render(await ReportPage(props({ versions: "1" })));

    const row = screen.getByTestId("version-2");
    expect(row.textContent).toContain("19 Oct, 08:05");
    expect(row.textContent).toContain("19 Oct, 08:04");
  });

  it("offers a way back to the current report", async () => {
    render(await ReportPage(props({ versions: "1" })));

    expect(screen.getByTestId("open-current-report")).toHaveAttribute(
      "href",
      `/operate/report?date=${REPORT_ON}`,
    );
  });
});

// ---------------------------------------------------------------------------
// UX-83 — nothing stored
// ---------------------------------------------------------------------------

describe("UX-83 — no stored report for this date", () => {
  beforeEach(() => {
    vi.mocked(readCurrentReport).mockResolvedValue(null);
  });

  it("says an absent snapshot is not an all-clear", async () => {
    const { container } = render(await ReportPage(props()));

    expect(container.textContent).toContain(EMPTY_HEADLINE);
    expect(screen.getByTestId("not-an-all-clear").textContent).toBe(EMPTY_IS_NOT_AN_ALL_CLEAR);
  });

  it("offers the preview and another date, and nothing that writes", async () => {
    render(await ReportPage(props()));

    expect(screen.getByTestId("preview-report")).toHaveAttribute(
      "href",
      `/operate/report?date=${REPORT_ON}&preview=1`,
    );
    expect(screen.getByTestId("report-date-form")).toBeVisible();
    expect(screen.queryByTestId("generate-report")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

describe("a refusal keeps the operator on the route with a way out", () => {
  it("shows the refusal and the date control rather than a stack trace", async () => {
    vi.mocked(readCurrentReport).mockRejectedValue(
      new NotFound("There is no season currently open.", { rule: "no_current_season" }),
    );

    render(await ReportPage(props()));

    expect(screen.getByTestId("report-unavailable").textContent).toBe(
      "There is no season currently open.",
    );
    expect(screen.getByTestId("report-date-form")).toBeVisible();
  });

  it("does not swallow a failure that is not a refusal", async () => {
    vi.mocked(readCurrentReport).mockRejectedValue(new TypeError("boom"));

    await expect(ReportPage(props())).rejects.toBeInstanceOf(TypeError);
  });
});
