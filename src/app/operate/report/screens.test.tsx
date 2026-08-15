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
      { eventId: PRACTICE, rsvp: "yes", attendance: "absent", reason: null, isDiscrepancy: true },
      { eventId: SOCIAL, rsvp: null, attendance: null, reason: null, isDiscrepancy: true },
    ],
  },
  {
    person: "Kit Ashdown",
    problems: 1,
    cells: [
      {
        eventId: PRACTICE,
        rsvp: "yes",
        attendance: "present",
        reason: null,
        isDiscrepancy: false,
      },
      {
        eventId: SOCIAL,
        rsvp: "no",
        attendance: null,
        reason: "Coursework deadline.",
        isDiscrepancy: true,
      },
    ],
  },
];

const CLEAN_AND_ONE_BAD = {
  person: "Wren Aldercott",
  problems: 1,
  cells: [
    { eventId: PRACTICE, rsvp: "yes", attendance: "present", reason: null, isDiscrepancy: false },
    { eventId: SOCIAL, rsvp: "no", attendance: null, reason: null, isDiscrepancy: true },
  ],
};

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
    metricDefinitionVersion: "LAN-81.4",
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
      rows: [...GRID_ROWS, CLEAN_AND_ONE_BAD],
    },
    availability: [
      { person: "Emrys Netherby", level: "red", since: "2026-10-01", reviewOn: "2026-11-01" },
      { person: "Zephyr", level: "orange", since: "2026-09-28", reviewOn: null },
    ],
    nextWeek: NEXT_WEEK,
    walkUps: [{ person: "Devon Skye", event: "Practice — week 3", on: "2026-10-14" }],
    recruitment: [],
    onboarding: {
      columns: [
        { code: "subs_invoiced", label: "Subscription invoiced" },
        { code: "subs_paid", label: "Subscription paid" },
        { code: "kit_sorted", label: "Kit sorted" },
      ],
      rows: [
        {
          person: "Rowan Delacourt",
          membershipStatus: "active",
          cells: [
            { code: "subs_invoiced", status: "complete", isOutstanding: false },
            { code: "subs_paid", status: "pending", isOutstanding: true },
            { code: "kit_sorted", status: "invited", isOutstanding: true },
          ],
          outstanding: 2,
          applicable: 3,
        },
        {
          person: "Sim Trelawney",
          membershipStatus: "onboarding",
          cells: [
            { code: "subs_invoiced", status: "complete", isOutstanding: false },
            { code: "subs_paid", status: "not_applicable", isOutstanding: false },
            { code: "kit_sorted", status: "pending", isOutstanding: true },
          ],
          outstanding: 1,
          applicable: 2,
        },
      ],
    },
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
    metricDefinitionVersion: "LAN-81.5",
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
  it.each(["president", "vice_president", "secretary", "general_manager", "it_officer"])(
    "admits %s",
    async (code) => {
      signedInAs([code]);

      const { container } = render(await ReportPage(props()));

      expect(container.textContent).toContain(REPORT_HEADLINE);
    },
  );

  // `it_officer` moved to the admitted list above: LAN-124 made it the club's
  // administrative seat. `media_secretary` replaces it here so the refusal
  // still has three seats to prove itself against.
  it.each(["treasurer", "media_secretary", "social_secretary"])(
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
      { fileNew: false },
    );
  });

  /**
   * Brian's rule, 15 August 2026: pressing Show Report files a snapshot every
   * time; arriving, sorting and refreshing do not.
   */
  it("does not file a snapshot for somebody merely arriving", async () => {
    await ReportPage(props());

    expect(readReportForDate).toHaveBeenCalledWith(expect.any(String), REPORT_ON, {
      fileNew: false,
    });
  });

  it("does not file a snapshot for a re-sort", async () => {
    await ReportPage(props({ sort: "person" }));

    expect(readReportForDate).toHaveBeenCalledWith(expect.any(String), REPORT_ON, {
      fileNew: false,
    });
  });

  it("files one when Show Report was pressed, then takes the marker out of the URL", async () => {
    // The redirect is what stops a refresh filing a second snapshot nobody
    // asked for, which would record the browser rather than the club.
    await expect(ReportPage(props({ show: "1" }))).rejects.toThrow(
      `REDIRECT:/operate/report?date=${REPORT_ON}`,
    );

    expect(readReportForDate).toHaveBeenCalledWith(expect.any(String), REPORT_ON, {
      fileNew: true,
    });
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

    // Brian, 15 August: "Don't include the number. The numbers don't really
    // help." True of the two sections that carry a date instead — the count is
    // still on the element for tests and for nobody else.
    expect(screen.getByTestId("section-last-week")).toHaveAttribute("data-count", "2");
    expect(screen.getByTestId("section-grid")).toHaveAttribute("data-count", "3");
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

  it("names the week it covers, and does not count its own rows at the reader", async () => {
    const { container } = render(await ReportPage(props()));
    const text = container.textContent ?? "";

    expect(text).toContain("12 – 18 October");
    // The heading is the name and the span. A tally of table rows beside it is
    // what Brian asked to have taken out.
    expect(text).not.toMatch(/Last week's events\s*2/);
    expect(text).not.toMatch(/Attendance\s*2/);
  });
});

describe("attendance", () => {
  it("gives each person one row, whatever went wrong across the week", async () => {
    render(await ReportPage(props()));

    const rows = screen.getAllByTestId("grid-row");
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain("Leo Hartwell");
    expect(rows[0]).toHaveAttribute("data-problems", "2");
  });

  /**
   * Brian's own specification: two values under every event, so four events
   * gives the eight he counted. A single collapsed verdict hides the comparison
   * that is the entire subject of the section.
   */
  it("puts two sub-columns under each event", async () => {
    render(await ReportPage(props()));

    const heads = screen.getByTestId("section-grid").querySelectorAll("thead tr");
    expect(heads).toHaveLength(2);

    // Person, then one head per event spanning two columns, then Issues.
    const eventHeads = [...heads[0].querySelectorAll("th")].slice(1, -1);
    expect(eventHeads).toHaveLength(2);
    expect(eventHeads.every((head) => head.getAttribute("colspan") === "2")).toBe(true);

    const subHeads = [...heads[1].querySelectorAll("th")];
    expect(subHeads.map((head) => head.textContent)).toEqual([
      "RSVP",
      "Attended",
      "RSVP",
      "Attended",
    ]);
  });

  it("shows what each person said and what they then did", async () => {
    render(await ReportPage(props()));

    const leo = screen.getAllByTestId("grid-row")[0];
    const values = [...leo.querySelectorAll("td")].slice(1, -1).map((cell) => cell.textContent);
    // Practice: said yes, marked absent. Social: never answered, never recorded.
    // The trailing cell is the Issues count, checked separately.
    expect(values).toEqual(["Yes", "Absent", "—", "—"]);
  });

  it("keeps a value that agrees with itself alongside one that does not", async () => {
    render(await ReportPage(props()));

    const kit = screen.getAllByTestId("grid-row")[1];
    const values = [...kit.querySelectorAll("td")].slice(1, -1).map((cell) => cell.textContent);
    expect(values).toEqual(["Yes", "Present", "No", "—"]);
    // One discrepancy, not two: turning up after saying yes is not one.
    expect(kit).toHaveAttribute("data-problems", "1");
  });

  it("keeps the reason with what they said, not with what they did", async () => {
    render(await ReportPage(props()));

    expect(screen.getByTestId("section-grid").innerHTML).toContain("Coursework deadline.");
  });

  /**
   * Brian, 15 August 2026: "I want to do a count for the week of the number of
   * discrepancies … If they have 4 events and they don't attend any of the
   * events, that's a 4 out of 4, right? Versus 3 to 1."
   *
   * The denominator is their own week rather than the club's, which is what
   * makes the two comparable at all.
   */
  it("counts each person's discrepancies out of the events they were asked to", async () => {
    render(await ReportPage(props()));

    const issues = screen.getAllByTestId("grid-issues").map((cell) => cell.textContent);
    expect(issues).toContain("2 of 2");
    expect(issues).toContain("1 of 2");
  });

  it("orders by the proportion, so a bad short week outranks a mixed long one", async () => {
    render(await ReportPage(props()));

    const rows = screen.getAllByTestId("grid-row");
    // Leo is 2 of 2; Kit and Wren are each 1 of 2, split by name.
    expect(rows[0].textContent).toContain("Leo Hartwell");
    expect(rows[0].querySelector('[data-testid="grid-issues"]')?.textContent).toBe("2 of 2");
  });

  it("sorts the other way when asked, and by name when asked", async () => {
    const ascending = render(await ReportPage(props({ sort: "issues", dir: "asc" })));
    expect(
      ascending.container
        .querySelectorAll('[data-testid="grid-row"]')[0]
        ?.querySelector('[data-testid="grid-issues"]')?.textContent,
    ).toBe("1 of 2");
    ascending.unmount();

    const byName = render(await ReportPage(props({ sort: "person" })));
    const names = [...byName.container.querySelectorAll('[data-testid="grid-row"]')].map(
      (row) => row.querySelector("td")?.textContent,
    );
    expect(names).toEqual([...names].sort());
  });

  it("offers the ordering as links, so a sorted view survives a refresh", async () => {
    render(await ReportPage(props()));

    // In the URL rather than in component state: shareable, refreshable, and it
    // needs no JavaScript — the same reasoning as the date form beside it.
    expect(screen.getByRole("link", { name: "Issues" })).toHaveAttribute(
      "href",
      `/operate/report?date=${REPORT_ON}&sort=issues&dir=asc`,
    );
    // Both grids have a Person head now, so this scopes to the one under test.
    const grid = within(screen.getByTestId("section-grid"));
    expect(grid.getByRole("link", { name: "Person" })).toHaveAttribute(
      "href",
      `/operate/report?date=${REPORT_ON}&sort=person`,
    );
  });

  it("heads each event column with its name and date", async () => {
    render(await ReportPage(props()));

    const head = screen.getByTestId("section-grid").querySelectorAll("thead tr th");
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

  it("gives onboarding a column per item and a row per member who owes one", async () => {
    render(await ReportPage(props()));

    const heads = [...screen.getByTestId("section-onboarding").querySelectorAll("thead th")];
    // Person, three items, Outstanding.
    expect(heads).toHaveLength(5);
    expect(heads[1].textContent).toBe("Subscription invoiced");
    // Every item, not only the required ones — subscription paid is the one
    // that is deliberately not required and still worth finding.
    expect(heads[2].textContent).toBe("Subscription paid");

    expect(screen.getAllByTestId("onboarding-row")).toHaveLength(2);
  });

  it("counts what each member owes out of what applies to them", async () => {
    render(await ReportPage(props()));

    const counts = screen.getAllByTestId("onboarding-outstanding").map((cell) => cell.textContent);
    // Rowan owes two of three; Sim owes one of two, because one item is not
    // applicable and so is not part of their denominator.
    expect(counts).toEqual(["2 of 3", "1 of 2"]);
  });

  it("shows where each item has got to, and marks the ones still owed", async () => {
    render(await ReportPage(props()));

    const first = screen.getAllByTestId("onboarding-row")[0];
    const values = [...first.querySelectorAll("td")].slice(1, -1).map((cell) => cell.textContent);
    expect(values).toEqual(["Done", "Pending", "Invited"]);
  });

  it("sorts onboarding independently of the attendance grid", async () => {
    render(await ReportPage(props()));

    // Its own query parameters, so ordering one never reorders the other.
    const outstanding = screen.getByRole("link", { name: "Outstanding" });
    expect(outstanding).toHaveAttribute(
      "href",
      `/operate/report?date=${REPORT_ON}&osort=issues&odir=asc`,
    );
  });

  it("orders onboarding by the share of the list still owed", async () => {
    const byName = render(await ReportPage(props({ osort: "person" })));
    const names = [...byName.container.querySelectorAll('[data-testid="onboarding-row"]')].map(
      (row) => row.querySelector("td")?.textContent,
    );
    expect(names[0]).toContain("Rowan Delacourt");
    expect(names[1]).toContain("Sim Trelawney");
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
    // And the form marks a press, so the page can tell one from a visit.
    expect(document.querySelector('input[name="show"]')).toHaveAttribute("value", "1");
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
        metricDefinitionVersion: "LAN-81.4",
        content: { schema: "lancers.monday-report.v4", lastWeek: [], nextWeek: [], grid: {} },
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
