/**
 * The Follow-ups queue — W5.
 *
 * The service layer is mocked; what is under test is the screen — who reaches
 * it, what it groups and sorts, and what each status reads.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  usePathname: () => "/operate/admin/follow-ups",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
// LAN-322. The queue's own action, mocked: what is under test here is the
// screen — who is offered the control, what it is called with, and what the
// row says afterwards. `sendEventChases` itself is proved against the real
// database in `src/lib/services/follow-ups.test.ts`.
vi.mock("./actions", () => ({ chaseSelectedAction: vi.fn() }));
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
import { chaseSelectedAction } from "./actions";
import FollowUpsPage from "./page";
import { LAST_MESSAGE_NONE, RANGE_FROM_LABEL, RANGE_TO_LABEL, TABLE_PERSON } from "./presentation";

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

/** The delivery path's own recorded sentences, abbreviated to their load-bearing half. */
const NO_NUMBER = "No usable mobile number is recorded for this person.";
const UNCONFIGURED = "Automated delivery is not configured on this deployment.";

const HAWKS: FollowUpEvent = {
  eventId: "event-hawks",
  eventName: "vs Harewell Hawks",
  scheduledOn: "2026-09-13",
  deadline: new Date("2026-09-13T17:00:00Z"),
  people: [
    {
      invitationId: "invitation-1",
      personId: "person-gideon",
      personName: "Gideon Thornbury",
      deadline: new Date("2026-09-13T17:00:00Z"),
      chasePosition: "WhatsApp 2 sent · email Fri 09:00",
      status: "escalated",
      lastDelivery: {
        state: "delivered",
        channel: "whatsapp",
        at: new Date("2026-09-11T08:00:00Z"),
      },
      chaseable: true,
    },
    {
      invitationId: "invitation-2",
      personId: "person-marlowe",
      personName: "Marlowe Fairhurst",
      deadline: new Date("2026-09-13T17:00:00Z"),
      chasePosition: null,
      status: "delivery_problem",
      lastDelivery: { state: "failed", channel: "whatsapp", at: new Date("2026-09-11T08:00:00Z") },
      chaseable: true,
    },
    {
      invitationId: "invitation-3",
      personId: "person-peregrine",
      personName: "Peregrine Oakhanger",
      deadline: new Date("2026-09-13T17:00:00Z"),
      chasePosition: null,
      status: "escalation_held",
      lastDelivery: null,
      chaseable: true,
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
      personId: "person-rufus",
      personName: "Rufus",
      deadline: new Date("2026-09-17T18:00:00Z"),
      chasePosition: "Invitation delivered · WhatsApp 2 Wed 09:00",
      status: "chasing",
      lastDelivery: {
        state: "delivered",
        channel: "whatsapp",
        at: new Date("2026-09-10T08:00:00Z"),
      },
      chaseable: true,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
  vi.mocked(readFollowUpsQueue).mockResolvedValue([HAWKS, PRACTICE]);
  vi.mocked(chaseSelectedAction).mockResolvedValue({
    error: null,
    accepted: 0,
    refusals: [],
    notOutstandingInvitationIds: [],
  });
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
  it("lists every outstanding person across both events without standing instructions", async () => {
    const { container } = await renderPage();
    expect(container.textContent).toContain("4 people across 2 approved events");
    expect(container.textContent).not.toContain("nobody compiles this list");
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
 * `SortableHeader`) rather than a second one.
 */
/**
 * The Person cell, by name rather than by position: LAN-322 put a selection
 * checkbox in front of it for a seat that may chase, so the first `td` is no
 * longer the name.
 */
function personCells(): (string | undefined)[] {
  return screen
    .getAllByTestId("follow-ups-row")
    .map((row) => row.querySelector("td[data-cell='person']")?.textContent ?? undefined);
}

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
    expect(personCells()).toEqual([
      "Gideon Thornbury",
      "Marlowe Fairhurst",
      "Peregrine Oakhanger",
      "Rufus",
    ]);
  });

  it("sorts by Person, descending, across every event rather than within one", async () => {
    const { container } = await renderPage({ sort: "person", dir: "desc" });
    expect(personCells()).toEqual([
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

/**
 * LAN-281 — Clint's ask of 2026-09-09, and nothing beyond it.
 *
 * > "maybe a different structure that I quite like having it by player. I
 * > don't hate it. The only thing I think that would be good to filter is to
 * > just have it be like filter by a date range."
 *
 * and what he would use it for:
 *
 * > "I like the idea of having a date range and being like, okay, so like
 * > who's not responding to the stuff that we need them to respond to next
 * > week?"
 *
 * So: one range, over the event's own date, reaching forward as readily as
 * back, with the by-player organisation, sort and columns untouched. The
 * event-pivot view argued for in the same conversation is deliberately not
 * here, and the last test in this block is what keeps it out.
 */
describe("filtering the queue by a date range — LAN-281", () => {
  it("narrows to the events inside the range, and leaves the rest of the board alone", async () => {
    const { container } = await renderPage({ from: "2026-09-15", to: "2026-09-20" });

    const rows = screen.getAllByTestId("follow-ups-row");
    expect(rows).toHaveLength(1);
    expect(container.textContent).toContain("Rufus");
    expect(container.textContent).not.toContain("Gideon Thornbury");
  });

  it("answers 'who has not answered what is coming' — a range wholly in the future", async () => {
    // Today is 2026-09-13; this range is the week after it, which is the
    // question Clint said he would ask.
    const { container } = await renderPage({ from: "2026-09-14", to: "2026-09-21" });

    expect(screen.getAllByTestId("follow-ups-row")).toHaveLength(1);
    expect(container.textContent).toContain("Rufus");
  });

  it("takes one side on its own as an open-ended range", async () => {
    const onlyFrom = await renderPage({ from: "2026-09-14" });
    expect(within(onlyFrom.container).getAllByTestId("follow-ups-row")).toHaveLength(1);
    expect(onlyFrom.container.textContent).toContain("Rufus");
    cleanup();

    const onlyTo = await renderPage({ to: "2026-09-14" });
    expect(within(onlyTo.container).getAllByTestId("follow-ups-row")).toHaveLength(3);
    expect(onlyTo.container.textContent).not.toContain("Rufus");
  });

  it("includes both boundary days — a range is inclusive, as a person reading it expects", async () => {
    const { container } = await renderPage({ from: "2026-09-13", to: "2026-09-16" });
    expect(screen.getAllByTestId("follow-ups-row")).toHaveLength(4);
    expect(container.textContent).toContain("Gideon Thornbury");
    expect(container.textContent).toContain("Rufus");
  });

  it("narrows nothing when the URL carries something that is not a calendar day", async () => {
    // A hand-edited or stale link fails open. Emptying the queue over an
    // unreadable parameter would give an operator no way to see why.
    const { container } = await renderPage({ from: "next week", to: "2026-13-45" });
    expect(screen.getAllByTestId("follow-ups-row")).toHaveLength(4);
    expect(container.textContent).toContain("Rufus");
  });

  it("combines with search, Status and When rather than replacing any of them", async () => {
    const { container } = await renderPage({
      from: "2026-09-01",
      to: "2026-09-30",
      period: "week",
      status: "escalated",
    });

    expect(screen.getAllByTestId("follow-ups-row")).toHaveLength(1);
    expect(container.textContent).toContain("Gideon Thornbury");
  });

  it("carries the range through a sort link, so sorting never drops it", async () => {
    const { container } = await renderPage({ from: "2026-09-01", to: "2026-09-30" });

    const links = Array.from(container.querySelectorAll("a[href*='sort=']"));
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      const href = link.getAttribute("href") ?? "";
      expect(href).toContain("from=2026-09-01");
      expect(href).toContain("to=2026-09-30");
    }
  });

  it("gives both ends of the range an accessible name, which LAN-259 found the pinned filters lacking", async () => {
    await renderPage();

    // `getAllBy`, not `getBy`: the picker gives its accessible name to both
    // the editable field and the hidden input that carries `YYYY-MM-DD` to a
    // plain form post. What is proved is that the name is there at all, which
    // is what LAN-259 found missing next door.
    expect(screen.getAllByLabelText(RANGE_FROM_LABEL).length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText(RANGE_TO_LABEL).length).toBeGreaterThan(0);
  });

  it("keeps the by-player list Clint asked to keep — one row per person, no event-pivot view", async () => {
    const { container } = await renderPage({ from: "2026-09-01", to: "2026-09-30" });

    // Four people across two events, as before the filter existed: the rows
    // are still people, not events with people summarised beneath them.
    expect(screen.getAllByTestId("follow-ups-row")).toHaveLength(4);
    expect(container.textContent).toContain(TABLE_PERSON);
  });
});

describe("reaching the person and the event from a row — LAN-329", () => {
  it("links the person's name to their own record, on the desktop row and the phone card", async () => {
    await renderPage();
    const row = screen.getAllByTestId("follow-ups-row")[0];
    expect(within(row).getByRole("link", { name: "Gideon Thornbury" }).getAttribute("href")).toBe(
      "/operate/people/person-gideon",
    );

    const card = screen.getAllByTestId("follow-ups-card")[0];
    expect(within(card).getByRole("link", { name: "Gideon Thornbury" }).getAttribute("href")).toBe(
      "/operate/people/person-gideon",
    );
  });

  it("links the event's name to the event, where the answer can be recorded for them", async () => {
    await renderPage();
    const row = screen.getAllByTestId("follow-ups-row")[0];
    expect(within(row).getByRole("link", { name: "vs Harewell Hawks" }).getAttribute("href")).toBe(
      "/operate/events/event-hawks",
    );

    const card = screen.getAllByTestId("follow-ups-card")[0];
    expect(within(card).getByRole("link", { name: "vs Harewell Hawks" }).getAttribute("href")).toBe(
      "/operate/events/event-hawks",
    );
  });

  it("renders the name as plain text for a seat that cannot open a person record", async () => {
    signedInAs([]);
    await renderPage();
    const row = screen.getAllByTestId("follow-ups-row")[0];
    expect(within(row).queryByRole("link", { name: "Gideon Thornbury" })).toBeNull();
    expect(row.textContent).toContain("Gideon Thornbury");
    // The event is open to every seated operator, so that link stays.
    expect(within(row).getByRole("link", { name: "vs Harewell Hawks" })).not.toBeNull();
  });
});

describe("chasing several people from the queue — LAN-322", () => {
  it("offers no selection and no chase to a seat without delivery administration", async () => {
    signedInAs([]);
    await renderPage();
    expect(screen.queryAllByLabelText("Select Gideon Thornbury")).toHaveLength(0);
    expect(screen.queryByTestId("chase-selected")).toBeNull();
  });

  it("sends nothing until the operator presses the action", async () => {
    await renderPage();
    fireEvent.click(screen.getAllByLabelText("Select Gideon Thornbury")[0]);
    expect(screen.getByTestId("chase-selected")).not.toBeNull();
    expect(chaseSelectedAction).not.toHaveBeenCalled();
  });

  it("chases exactly the people selected, in one action", async () => {
    vi.mocked(chaseSelectedAction).mockResolvedValue({
      error: null,
      accepted: 2,
      refusals: [],
      notOutstandingInvitationIds: [],
    });
    await renderPage();
    fireEvent.click(screen.getAllByLabelText("Select Gideon Thornbury")[0]);
    fireEvent.click(screen.getAllByLabelText("Select Rufus")[0]);
    fireEvent.click(screen.getByTestId("chase-selected"));

    await waitFor(() => expect(chaseSelectedAction).toHaveBeenCalledTimes(1));
    expect(chaseSelectedAction).toHaveBeenCalledWith(["invitation-1", "invitation-4"]);
    await waitFor(() =>
      expect(screen.getByTestId("chase-notice").textContent).toContain("Chased 2 people."),
    );
  });

  it("names the people it could not chase, rather than only counting them", async () => {
    vi.mocked(chaseSelectedAction).mockResolvedValue({
      error: null,
      accepted: 1,
      refusals: [{ invitationId: "invitation-2", reason: NO_NUMBER }],
      notOutstandingInvitationIds: [],
    });
    await renderPage();
    fireEvent.click(screen.getAllByLabelText("Select Gideon Thornbury")[0]);
    fireEvent.click(screen.getByTestId("chase-selected"));

    await waitFor(() =>
      expect(screen.getByTestId("chase-refused").textContent).toContain("Marlowe Fairhurst"),
    );
  });

  /**
   * LAN-322's walk: the notice counted the refusals and named them, and said
   * nothing about why. Correcting a phone number, asking the club's
   * administrator to configure the deployment and leaving a recruit alone are
   * three different next actions, and the operator could not tell which one
   * this was.
   */
  it("says why each person could not be chased, beside their name", async () => {
    vi.mocked(chaseSelectedAction).mockResolvedValue({
      error: null,
      accepted: 0,
      refusals: [
        { invitationId: "invitation-2", reason: NO_NUMBER },
        { invitationId: "invitation-3", reason: UNCONFIGURED },
      ],
      notOutstandingInvitationIds: [],
    });
    await renderPage();
    fireEvent.click(screen.getAllByLabelText("Select Gideon Thornbury")[0]);
    fireEvent.click(screen.getByTestId("chase-selected"));

    await waitFor(() => expect(screen.getByTestId("chase-refused")).not.toBeNull());
    const lines = within(screen.getByTestId("chase-refused"))
      .getAllByRole("listitem")
      .map((item) => item.textContent);
    expect(lines).toEqual([
      `Marlowe Fairhurst — ${NO_NUMBER}`,
      `Peregrine Oakhanger — ${UNCONFIGURED}`,
    ]);
  });

  it("counts the rest rather than printing every name, when a whole queue is refused", async () => {
    // Measured at 375px against the seeded database: a select-all refused 559
    // people and the notice became an unreadable wall of names.
    const many = Array.from({ length: 12 }, (_, index) => ({
      ...HAWKS.people[0],
      invitationId: `invitation-many-${index}`,
      personId: `person-many-${index}`,
      personName: `Refused Person ${index}`,
    }));
    vi.mocked(readFollowUpsQueue).mockResolvedValue([{ ...HAWKS, people: many }]);
    vi.mocked(chaseSelectedAction).mockResolvedValue({
      error: null,
      accepted: 0,
      refusals: many.map((person) => ({
        invitationId: person.invitationId,
        reason: NO_NUMBER,
      })),
      notOutstandingInvitationIds: [],
    });
    await renderPage();
    fireEvent.click(screen.getAllByLabelText("Select Refused Person 0")[0]);
    fireEvent.click(screen.getByTestId("chase-selected"));

    await waitFor(() => expect(screen.getByTestId("chase-refused")).not.toBeNull());
    const notice = screen.getByTestId("chase-refused").textContent ?? "";
    expect(notice).toContain("12 people could not be chased");
    // Five names, in the order the queue itself lists them, then the count.
    expect(notice).toContain("Refused Person 0");
    expect(notice).toContain("and 7 more");
    expect(notice).not.toContain("Refused Person 9");
  });

  it("carries the same selection and chase on the phone card, not only the desktop table", async () => {
    await renderPage();
    const card = screen.getAllByTestId("follow-ups-card")[0];
    expect(within(card).getByLabelText("Select Gideon Thornbury")).not.toBeNull();
    expect(within(card).getByRole("button", { name: "Chase" })).not.toBeNull();
  });

  it("shows what was last sent, so a second operator does not chase the same person again", async () => {
    await renderPage();
    const row = screen.getAllByTestId("follow-ups-row")[0];
    expect(row.textContent).toContain("WhatsApp");
    expect(row.textContent).toContain("Delivered");

    const held = screen.getAllByTestId("follow-ups-row")[2];
    expect(held.textContent).toContain(LAST_MESSAGE_NONE);
  });

  it("offers no chase against a recruit — REQ-never-harsh", async () => {
    vi.mocked(readFollowUpsQueue).mockResolvedValue([
      { ...HAWKS, people: [{ ...HAWKS.people[0], chaseable: false }] },
    ]);
    await renderPage();
    expect(screen.queryAllByLabelText("Select Gideon Thornbury")).toHaveLength(0);
    expect(screen.getAllByTestId("follow-ups-row")[0].textContent).toContain(
      "Recruit — not chased from here",
    );
  });
});
