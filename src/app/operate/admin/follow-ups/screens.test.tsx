/**
 * The Follow-ups queue — W5.
 *
 * The service layer is mocked; what is under test is the screen — who reaches
 * it, what it groups and sorts, and what each status reads.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  usePathname: () => "/operate/admin/follow-ups",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("@/lib/services/follow-ups", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/follow-ups")>();
  return { ...actual, readFollowUpsQueue: vi.fn() };
});
// OWNER-LAN173-05. "This term" reads `@/app/calendar/year`'s own segment
// boundaries (the Events list and Calendar's), which in turn reads term
// windows out of the database — mocked here to a fixed answer so the date
// filter's tests do not depend on the real clock or real term data, the same
// way `@/app/calendar/screens.test.tsx` pins `todayInClubZone`.
vi.mock("@/lib/club-time", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/club-time")>();
  return { ...actual, todayInClubZone: vi.fn(() => "2026-09-13") };
});
vi.mock("@/lib/services/seasons", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/seasons")>();
  return { ...actual, readCurrentSeason: vi.fn() };
});
vi.mock("@/app/calendar/year", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/calendar/year")>();
  return { ...actual, readEventYear: vi.fn() };
});

import { readEventYear } from "@/app/calendar/year";
import { resolveOperatorAccess, type ResolvedOperator } from "@/lib/auth/operator";
import { readFollowUpsQueue, type FollowUpEvent } from "@/lib/services/follow-ups";
import { readCurrentSeason } from "@/lib/services/seasons";
import FollowUpsPage from "./page";

function operator(roleCodes: string[]): ResolvedOperator {
  return {
    authUserId: "00000000-0000-4000-8000-000000000001",
    personId: "00000000-0000-4000-8000-000000000002",
    displayName: "Casey Operator",
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

async function renderPage(query: Record<string, string> = {}) {
  const element = await FollowUpsPage({ searchParams: Promise.resolve(query) } as never);
  return render(element);
}

const HAWKS: FollowUpEvent = {
  eventId: "event-hawks",
  eventName: "vs Harewell Hawks",
  scheduledOn: "2026-09-13",
  deadline: new Date("2026-09-13T17:00:00Z"),
  people: [
    {
      invitationId: "invitation-1",
      personName: "Gideon Thornbury",
      deadline: new Date("2026-09-13T17:00:00Z"),
      chasePosition: "WhatsApp 2 sent · email Fri 09:00",
      status: "escalated",
    },
    {
      invitationId: "invitation-2",
      personName: "Marlowe Fairhurst",
      deadline: new Date("2026-09-13T17:00:00Z"),
      chasePosition: null,
      status: "delivery_problem",
    },
    {
      invitationId: "invitation-3",
      personName: "Peregrine Oakhanger",
      deadline: new Date("2026-09-13T17:00:00Z"),
      chasePosition: null,
      status: "escalation_held",
    },
  ],
};

const PRACTICE: FollowUpEvent = {
  eventId: "event-practice",
  eventName: "Practice — hilary week 3",
  scheduledOn: "2026-09-16",
  deadline: new Date("2026-09-17T18:00:00Z"),
  people: [
    {
      invitationId: "invitation-4",
      personName: "Rufus",
      deadline: new Date("2026-09-17T18:00:00Z"),
      chasePosition: "Invitation delivered · WhatsApp 2 Wed 09:00",
      status: "chasing",
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readFollowUpsQueue).mockResolvedValue([HAWKS, PRACTICE]);
  signedInAs(["secretary"]);
  // "This term" only: today (2026-09-13, mocked above) inside a term running
  // 2026-09-10 to 2026-09-14 — wide enough to hold HAWKS (09-13), narrow
  // enough to exclude PRACTICE (09-16), so a test can tell "This term" apart
  // from "This month" (which holds both) without hand-verifying real term
  // dates.
  vi.mocked(readCurrentSeason).mockResolvedValue({
    id: "season-1",
    label: "2026-27",
    status: "current",
    startsOn: "2026-08-01",
    endsOn: null,
  });
  vi.mocked(readEventYear).mockResolvedValue({
    currentSegmentStartsOn: "2026-09-10",
    currentSegmentEndsOn: "2026-09-14",
  } as never);
});

describe("who may open the Follow-ups queue", () => {
  it("admits any linked, active operator", async () => {
    signedInAs([]);
    const { container } = await renderPage();
    expect(container.querySelector('[data-testid="follow-ups-screen"]')).not.toBeNull();
  });

  it("redirects to login with no session", async () => {
    vi.mocked(resolveOperatorAccess).mockResolvedValue({ state: "no_session" });
    await expect(renderPage()).rejects.toThrow(
      "REDIRECT:/login?redirectTo=%2Foperate%2Fadmin%2Ffollow-ups",
    );
  });
});

describe("the queue itself", () => {
  it("lists every outstanding person across both events, and says nobody compiled it", async () => {
    const { container } = await renderPage();
    expect(container.textContent).toContain("4 people across 2 approved events");
    expect(container.textContent).toContain("nobody compiles this list");
    expect(screen.getAllByTestId("follow-ups-row")).toHaveLength(4);
  });

  it("names the event against each person, repeated down the rows", async () => {
    await renderPage();
    const rows = screen.getAllByTestId("follow-ups-row");
    expect(rows[0].textContent).toContain("vs Harewell Hawks");
    expect(rows.filter((row) => row.textContent?.includes("vs Harewell Hawks"))).toHaveLength(3);
  });

  it("carries the chase position beside each unresolved person", async () => {
    const { container } = await renderPage();
    expect(container.textContent).toContain("WhatsApp 2 sent · email Fri 09:00");
    expect(container.textContent).toContain("Invitation delivered · WhatsApp 2 Wed 09:00");
  });

  it.each([
    ["escalated", "Escalated"],
    ["delivery_problem", "Delivery problem"],
    ["escalation_held", "Escalation held: no President in post"],
    ["chasing", "Chasing"],
  ])("labels the %s status as %s", async (status, label) => {
    vi.mocked(readFollowUpsQueue).mockResolvedValue([
      {
        ...HAWKS,
        people: [
          { ...HAWKS.people[0], status: status as FollowUpEvent["people"][number]["status"] },
        ],
      },
    ]);
    const { container } = await renderPage();
    expect(container.textContent).toContain(label);
  });

  it("says so, rather than showing an empty table, when nobody is outstanding", async () => {
    vi.mocked(readFollowUpsQueue).mockResolvedValue([]);
    const { container } = await renderPage();
    expect(container.querySelector('[data-testid="follow-ups-empty"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="follow-ups-table"]')).toBeNull();
  });

  it("filters to the name searched for, across every event", async () => {
    const { container } = await renderPage({ q: "Rufus" });
    expect(screen.getAllByTestId("follow-ups-row")).toHaveLength(1);
    expect(container.textContent).toContain("Rufus");
    expect(container.textContent).not.toContain("Gideon Thornbury");
  });

  /**
   * OWNER-LAN173-01, W5-01. The mockup draws search plus a Status dropdown,
   * and the data already backs the chip in the last column — this is that
   * dropdown, filtering the same flattened rows the table renders.
   */
  it.each([
    ["escalated", "Gideon Thornbury"],
    ["delivery_problem", "Marlowe Fairhurst"],
    ["escalation_held", "Peregrine Oakhanger"],
    ["chasing", "Rufus"],
  ])("narrows to the %s status via Status", async (status, expectedName) => {
    const { container } = await renderPage({ status });
    const rows = screen.getAllByTestId("follow-ups-row");
    expect(rows).toHaveLength(1);
    expect(container.textContent).toContain(expectedName);
  });

  it("shows everybody when Status is left at All", async () => {
    const { container } = await renderPage({ status: "" });
    expect(screen.getAllByTestId("follow-ups-row")).toHaveLength(4);
    expect(container.textContent).toContain("Gideon Thornbury");
    expect(container.textContent).toContain("Rufus");
  });

  it("combines Status and search rather than either alone", async () => {
    const { container } = await renderPage({ status: "escalated", q: "Rufus" });
    expect(container.querySelector('[data-testid="follow-ups-empty"]')).not.toBeNull();
    expect(container.textContent).toContain("No one matches this search.");
  });

  it("never builds the mockup's undefined Entry dropdown", async () => {
    const { container } = await renderPage();
    // OWNER-LAN173-01: W5-01 draws a second dropdown, "Entry", with no spec
    // text defining what it filters. Dropped rather than guessed at.
    expect(container.textContent).not.toContain("Entry");
  });

  it("never prints a raw ISO date", async () => {
    const { container } = await renderPage();
    expect(container.innerHTML).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

/**
 * OWNER-LAN173-05: "at the very least, these columns should be sortable" —
 * reusing the participation table's own link-and-arrow mechanism
 * (`@/lib/services/participation-view`'s `sortColumnHref`/`sortColumnState`,
 * `SortableColumnHeading`) rather than a second one.
 */
describe("sorting the queue", () => {
  it("heads every column with a link that sorts by it, carrying the other filters", async () => {
    const { container } = await renderPage({ q: "e", status: "escalated" });
    const columns = ["person", "event", "when", "deadline", "chase", "status"];
    for (const column of columns) {
      const link = container.querySelector(`a[data-sort="${column}"]`);
      expect(link, column).not.toBeNull();
      const href = link!.getAttribute("href")!;
      expect(href, column).toContain(`sort=${column}`);
      // The defect `participation-view.test.ts` already guards against: a
      // sort must not silently drop a filter that narrowed the view.
      expect(href, column).toContain("q=e");
      expect(href, column).toContain("status=escalated");
    }
  });

  it("defaults to soonest event first, exactly as before this correction", async () => {
    await renderPage();
    const rows = screen.getAllByTestId("follow-ups-row");
    expect(rows.map((row) => row.querySelector("td")?.textContent)).toEqual([
      "Gideon Thornbury",
      "Marlowe Fairhurst",
      "Peregrine Oakhanger",
      "Rufus",
    ]);
  });

  it("sorts by Person, descending, across every event rather than within one", async () => {
    const { container } = await renderPage({ sort: "person", dir: "desc" });
    const rows = screen.getAllByTestId("follow-ups-row");
    expect(rows.map((row) => row.querySelector("td")?.textContent)).toEqual([
      "Rufus",
      "Peregrine Oakhanger",
      "Marlowe Fairhurst",
      "Gideon Thornbury",
    ]);
    const link = container.querySelector('a[data-sort="person"]')!;
    expect(link.getAttribute("href")).toContain("dir=asc");
  });

  it("sorts by Status", async () => {
    await renderPage({ sort: "status", dir: "asc" });
    const rows = screen.getAllByTestId("follow-ups-row");
    // Alphabetically: chasing, delivery_problem, escalated, escalation_held.
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Rufus"),
      expect.stringContaining("Marlowe Fairhurst"),
      expect.stringContaining("Gideon Thornbury"),
      expect.stringContaining("Peregrine Oakhanger"),
    ]);
  });

  it("falls back to the default sort for an unrecognised column, rather than erroring", async () => {
    const { container } = await renderPage({ sort: "nonsense" });
    expect(container.querySelector('[data-testid="follow-ups-table"]')).not.toBeNull();
    expect(screen.getAllByTestId("follow-ups-row")).toHaveLength(4);
  });
});

/**
 * OWNER-LAN173-05: "we should be able to filter by date … the same columns
 * that are in the roster in the calendar (this week, this month, this
 * term)". `@/lib/services/event-periods` is that existing vocabulary —
 * `EVENT_PERIODS`/`PERIOD_LABELS`, the Events list's and Calendar's own —
 * reused verbatim rather than invented again for this one queue. Its fifth
 * and sixth words, "All upcoming" and "All events", are the two Brian did not
 * name; they are offered because dropping them would be inventing a smaller
 * vocabulary than the one that already exists.
 */
describe("filtering the queue by date", () => {
  it("does not narrow the queue by default — the existing behaviour, unaffected", async () => {
    const { container } = await renderPage();
    expect(screen.getAllByTestId("follow-ups-row")).toHaveLength(4);
    expect(container.textContent).toContain("Rufus");
    // Term data is not even read unless "This term" is actually chosen.
    expect(readCurrentSeason).not.toHaveBeenCalled();
    expect(readEventYear).not.toHaveBeenCalled();
  });

  it("narrows to This week — the week containing 2026-09-13, so Rufus's 09-16 event drops", async () => {
    const { container } = await renderPage({ period: "week" });
    const rows = screen.getAllByTestId("follow-ups-row");
    expect(rows).toHaveLength(3);
    expect(container.textContent).toContain("Gideon Thornbury");
    expect(container.textContent).not.toContain("Rufus");
    expect(readCurrentSeason).not.toHaveBeenCalled();
  });

  it("keeps everybody for This month — both events fall in September 2026", async () => {
    const { container } = await renderPage({ period: "month" });
    expect(screen.getAllByTestId("follow-ups-row")).toHaveLength(4);
    expect(container.textContent).toContain("Rufus");
  });

  it("reads the same term boundary the Events list and Calendar use, and only fetches it for This term", async () => {
    const { container } = await renderPage({ period: "term" });
    const rows = screen.getAllByTestId("follow-ups-row");
    expect(rows).toHaveLength(3);
    expect(container.textContent).toContain("Gideon Thornbury");
    expect(container.textContent).not.toContain("Rufus");
    expect(readCurrentSeason).toHaveBeenCalledTimes(1);
    expect(readEventYear).toHaveBeenCalledTimes(1);
  });

  it("shows nobody for This term rather than failing the page when no season is open", async () => {
    vi.mocked(readCurrentSeason).mockRejectedValue(new Error("no current season"));
    const { container } = await renderPage({ period: "term" });
    expect(container.querySelector('[data-testid="follow-ups-empty"]')).not.toBeNull();
    expect(container.textContent).toContain("No one matches this search.");
  });

  it("combines the date filter with search and Status, exactly as they already combine with each other", async () => {
    const { container } = await renderPage({ period: "week", status: "escalated" });
    const rows = screen.getAllByTestId("follow-ups-row");
    expect(rows).toHaveLength(1);
    expect(container.textContent).toContain("Gideon Thornbury");
  });

  it("never resurrects the mockup's dropped Entry dropdown alongside the new date filter", async () => {
    const { container } = await renderPage();
    expect(container.textContent).not.toContain("Entry");
  });
});
