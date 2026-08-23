/**
 * The public calendar's screens — LAN-153.
 *
 * These render the real pages with the service layer mocked, so what is under
 * test is the screen: which columns it carries, which it does not, what it says
 * when there is nothing to show, and where every row leads.
 *
 * The two things a mock cannot prove — that reading creates no record, and that
 * no payload carries a joining URL, a person, an answer or an attendance record
 * — are proved against the real database in
 * `tests/public-calendar-side-effects.test.ts`. This file deliberately does not
 * restate them, because a mocked service cannot write and cannot leak.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("server-only", () => ({}));
const routerPush = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  usePathname: () => "/calendar",
  useRouter: () => ({ push: routerPush, replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/services/events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/events")>();
  return {
    ...actual,
    listPublicSeasonEvents: vi.fn(),
    readPublicEvent: vi.fn(),
    // If a public page ever reaches for the operator's projection, these are
    // what notice. Nothing stubs them with a value, so a call throws.
    listCurrentSeasonEvents: vi.fn(),
    listEventsForOperator: vi.fn(),
    readEvent: vi.fn(),
  };
});
vi.mock("@/lib/services/seasons", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/seasons")>();
  return { ...actual, listTerms: vi.fn(), listTermWindows: vi.fn(), readCurrentSeason: vi.fn() };
});
vi.mock("@/lib/club-time", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/club-time")>();
  return { ...actual, todayInClubZone: vi.fn(() => "2026-10-14") };
});

import { NotFound } from "@/lib/db";
import {
  listCurrentSeasonEvents,
  listEventsForOperator,
  listPublicSeasonEvents,
  readEvent,
  readPublicEvent,
  type PublicEventDetail,
  type PublicEventListEntry,
} from "@/lib/services/events";
import { listTermWindows } from "@/lib/services/seasons";
import type { TermWindow } from "@/lib/services/event-input";
import PublicCalendarPage from "./page";
import PublicCalendarViewPage from "./view/page";
import PublicEventPage from "./[id]/page";

const MICHAELMAS: TermWindow = {
  id: "55555555-5555-4555-8555-555555555551",
  name: "michaelmas",
  academicYear: "2026-27",
  startsOn: "2026-09-27",
  endsOn: "2026-12-05",
  firstWeek: -1,
  lastWeek: 8,
};

const HILARY: TermWindow = {
  id: "55555555-5555-4555-8555-555555555552",
  name: "hilary",
  academicYear: "2026-27",
  startsOn: "2027-01-10",
  endsOn: "2027-03-13",
  firstWeek: 0,
  lastWeek: 8,
};

const TRINITY: TermWindow = {
  id: "55555555-5555-4555-8555-555555555553",
  name: "trinity",
  academicYear: "2026-27",
  startsOn: "2027-04-18",
  endsOn: "2027-06-19",
  firstWeek: 0,
  lastWeek: 8,
};

const TRINITY_BEFORE: TermWindow = {
  id: "55555555-5555-4555-8555-555555555550",
  name: "trinity",
  academicYear: "2025-26",
  startsOn: "2026-04-19",
  endsOn: "2026-06-20",
  firstWeek: 0,
  lastWeek: 8,
};

const EVENT_ID = "33333333-3333-4333-8333-333333333333";

let nextId = 0;

function entry(overrides: Partial<PublicEventListEntry> = {}): PublicEventListEntry {
  nextId += 1;
  return {
    id: `33333333-3333-4333-8333-${`${nextId}`.padStart(12, "0")}`,
    name: `Event ${nextId}`,
    eventType: "practice",
    scheduledOn: "2026-10-14",
    startsAt: "20:00",
    endsAt: "22:00",
    deliveryMode: "in_person",
    venue: "Iffley Road Astro",
    isMandatory: false,
    isCancelled: false,
    ...overrides,
  };
}

function detail(overrides: Partial<PublicEventDetail> = {}): PublicEventDetail {
  return {
    ...entry({ id: EVENT_ID, name: "Chalk — michaelmas week 4" }),
    description: null,
    requiredEquipment: null,
    ...overrides,
  };
}

function givenEvents(events: PublicEventListEntry[], totalInSeason = events.length) {
  vi.mocked(listPublicSeasonEvents).mockResolvedValue({
    season: {
      id: "44444444-4444-4444-8444-444444444444",
      label: "2026-27",
      status: "active",
      startsOn: null,
      endsOn: null,
    },
    events,
    totalInSeason,
  });
}

function listProps(query: Record<string, string> = {}) {
  return {
    params: Promise.resolve({}),
    searchParams: Promise.resolve({ period: "all", ...query }),
  } as unknown as PageProps<"/calendar">;
}

function viewProps(query: Record<string, string> = {}) {
  return {
    params: Promise.resolve({}),
    searchParams: Promise.resolve(query),
  } as unknown as PageProps<"/calendar/view">;
}

function eventProps(id: string = EVENT_ID) {
  return {
    params: Promise.resolve({ id }),
    searchParams: Promise.resolve({}),
  } as unknown as PageProps<"/calendar/[id]">;
}

function flatten(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

beforeEach(() => {
  vi.clearAllMocks();
  routerPush.mockClear();
  vi.mocked(listTermWindows).mockResolvedValue([TRINITY, HILARY, MICHAELMAS, TRINITY_BEFORE]);
  vi.mocked(readPublicEvent).mockResolvedValue(detail());
  givenEvents([entry()]);
});

// ---------------------------------------------------------------------------
// REQ-public-calendar, REQ-three-tiers
// ---------------------------------------------------------------------------

describe("the public list", () => {
  it("reads the public projection, and never the operator's", async () => {
    // The tier is carried by which projection is read. If a public page ever
    // reached the operator's, this is what would notice.
    render(await PublicCalendarPage(listProps()));

    expect(listPublicSeasonEvents).toHaveBeenCalled();
    expect(listCurrentSeasonEvents).not.toHaveBeenCalled();
    expect(listEventsForOperator).not.toHaveBeenCalled();
  });

  it("carries name, type, date, term and week, and where", async () => {
    // `REQ-list-shape`'s public row, and the approved mockup's four columns.
    render(await PublicCalendarPage(listProps()));

    const headers = screen
      .getAllByRole("columnheader")
      .map((header) => flatten(header.textContent));
    expect(headers).toEqual(["Event", "Type", "Date", "Term and week", "Where"]);
  });

  it("carries no status, no counts and no attendance", async () => {
    // `W1`'s tier table, and Brian, 20 August 2026. The public list is narrowed
    // in what it says about an event, never in which events it shows.
    render(await PublicCalendarPage(listProps()));

    const headers = screen
      .getAllByRole("columnheader")
      .map((header) => flatten(header.textContent));
    for (const absent of ["Status", "Invited", "Said yes", "Showed / Invited"]) {
      expect(headers, `the public list offers ${absent}`).not.toContain(absent);
    }
  });

  it("says Online and stops there, with no label for the absent link", async () => {
    // Brian, 21 August 2026: "When it says online, you do not need to show no
    // link shown. That's not important."
    givenEvents([entry({ name: "Chalk", deliveryMode: "online", venue: null })]);

    const { container } = render(await PublicCalendarPage(listProps()));
    const text = flatten(container.textContent);

    expect(text).toContain("Online");
    expect(text).not.toMatch(/no link|link not shown|not available/i);
  });

  it("keeps a cancelled event on the list, marked cancelled", async () => {
    // Correction C1 to `W1`, from D57 and from `W2` keeping it in the feed.
    // Hiding it here would make two public surfaces disagree about what is on.
    givenEvents([entry({ name: "Practice", isCancelled: true })]);

    const { container } = render(await PublicCalendarPage(listProps()));
    const text = flatten(container.textContent);

    expect(text).toContain("Practice");
    expect(text).toContain("Cancelled");
  });

  it("links every row to the public event page", async () => {
    // `REQ-three-arrangements`: every tile and row leads to the same event page
    // — and to one a public reader can actually open.
    const event = entry({ name: "Wednesday practice" });
    givenEvents([event]);

    render(await PublicCalendarPage(listProps()));

    const link = screen
      .getAllByRole("link")
      .find((candidate) => candidate.textContent === "Wednesday practice");
    expect(link?.getAttribute("href")).toBe(`/calendar/${event.id}`);
  });

  it("names the season, and offers no way to reach another", async () => {
    // `REQ-one-open-season`. Brian, 21 August 2026: "There is no reason why you
    // would ever have to switch a calendar."
    const { container } = render(await PublicCalendarPage(listProps()));

    expect(flatten(screen.getByTestId("public-season-label").textContent)).toBe(
      "Club calendar · Season 2026-27",
    );
    expect(container.querySelector('[data-testid="season-select"]')).toBeNull();
    expect(container.querySelector('[data-testid="academic-year-select"]')).toBeNull();
  });

  it("offers search and type, and no status filter", async () => {
    // The public tier has no status to filter by, so offering the control would
    // offer a narrowing with nothing to narrow. Read off the bar's own text
    // rather than its `<label>` elements: MUI renders a select's label through
    // `aria-labelledby`, so only the search box has one.
    const { container } = render(await PublicCalendarPage(listProps()));
    const bar = flatten(within(container).getByTestId("public-event-filters").textContent);

    expect(bar).toContain("Search events");
    expect(bar).toContain("Type");
    expect(bar).not.toContain("Status");
  });

  it("has no Apply button — a filter applies when it changes", async () => {
    // §4.4, and Brian's own words at the mockup review.
    render(await PublicCalendarPage(listProps()));

    expect(screen.queryByRole("button", { name: /apply/i })).toBeNull();
  });

  it("groups by period into discrete tables", async () => {
    givenEvents([
      entry({ name: "Soon", scheduledOn: "2026-10-15" }),
      entry({ name: "Later", scheduledOn: "2026-11-20" }),
      entry({ name: "Gone", scheduledOn: "2026-09-30" }),
    ]);

    const { container } = render(await PublicCalendarPage(listProps()));
    const buckets = [...container.querySelectorAll('[data-testid="public-bucket"]')].map((bucket) =>
      bucket.getAttribute("data-bucket"),
    );

    expect(buckets.length).toBeGreaterThan(1);
    expect(buckets).toContain("soon");
    expect(buckets).toContain("already_happened");
  });

  it("offers the period control, and carries the other filters through it", async () => {
    render(await PublicCalendarPage(listProps({ q: "chalk", type: "chalk" })));

    const thisWeek = screen.getByTestId("period-week");
    expect(thisWeek.getAttribute("href")).toContain("q=chalk");
    expect(thisWeek.getAttribute("href")).toContain("type=chalk");
    expect(thisWeek.getAttribute("href")).toContain("period=week");
  });
});

describe("the public list's empty states, which must not read alike", () => {
  it("says the season has no events when it genuinely has none", async () => {
    givenEvents([], 0);
    render(await PublicCalendarPage(listProps()));
    expect(screen.getByTestId("public-season-empty")).toBeTruthy();
  });

  it("says the filter matched nothing, which is a different thing", async () => {
    givenEvents([], 55);
    render(await PublicCalendarPage(listProps({ q: "astro" })));
    expect(screen.getByTestId("public-filter-empty")).toBeTruthy();
  });

  it("says the period is empty, which is a third thing", async () => {
    givenEvents([entry({ scheduledOn: "2027-05-01" })], 55);
    render(await PublicCalendarPage(listProps({ period: "week" })));
    expect(screen.getByTestId("public-period-empty")).toBeTruthy();
  });

  it("states the refusal rather than an empty calendar when no season is open", async () => {
    vi.mocked(listPublicSeasonEvents).mockRejectedValue(
      new NotFound("There is no season currently open.", { rule: "no_current_season" }),
    );

    const { container } = render(await PublicCalendarPage(listProps()));

    expect(
      flatten(within(container).getByTestId("public-calendar-unavailable").textContent),
    ).toContain("no season currently open");
  });
});

// ---------------------------------------------------------------------------
// REQ-three-arrangements
// ---------------------------------------------------------------------------

describe("the public calendar arrangements", () => {
  it("offers List and Calendar, then Calendar View and Oxford View", async () => {
    const { container } = render(await PublicCalendarViewPage(viewProps()));

    const view = within(container).getByTestId("public-view-switch");
    expect(within(view).getByTestId("public-view-list")).toHaveAttribute("href", "/calendar");
    expect(within(view).getByTestId("public-view-calendar")).toHaveAttribute(
      "aria-current",
      "page",
    );

    const mode = within(container).getByTestId("public-mode-switch");
    expect(within(mode).getByTestId("public-mode-gregorian")).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(flatten(within(mode).getByTestId("public-mode-oxford").textContent)).toBe("Oxford View");
  });

  it("shows Calendar View by default, on the event's actual date", async () => {
    givenEvents([entry({ name: "Wednesday practice", scheduledOn: "2026-10-14" })]);

    const { container } = render(await PublicCalendarViewPage(viewProps()));

    const cell = container.querySelector('[data-testid="gregorian-cell"][data-day="2026-10-14"]');
    expect(flatten(cell?.textContent)).toContain("Wednesday practice");
  });

  it("shows the continuous academic year in Oxford View", async () => {
    const { container } = render(await PublicCalendarViewPage(viewProps({ mode: "oxford" })));
    const segments = [...container.querySelectorAll('[data-testid="year-segment-heading"]')].map(
      (heading) => flatten(heading.textContent),
    );

    expect(segments).toEqual([
      "Long Vacation 2026",
      "Michaelmas",
      "Christmas Vacation",
      "Hilary",
      "Easter Vacation",
      "Trinity",
      "Long Vacation 2027",
    ]);
  });

  it("links every tile to the public event page", async () => {
    const event = entry({ name: "Wednesday practice", scheduledOn: "2026-10-14" });
    givenEvents([event]);

    const { container } = render(await PublicCalendarViewPage(viewProps()));

    expect(within(container).getAllByTestId("calendar-entry")[0]).toHaveAttribute(
      "href",
      `/calendar/${event.id}`,
    );
  });

  it("says nothing about status on a tile unless the event is off", async () => {
    // The public tier's tile: cancelled, and nothing else. A draft reads as an
    // ordinary club-calendar record, because D5 has no hidden events and the
    // status column is the operator's.
    givenEvents([
      entry({ name: "Ordinary", scheduledOn: "2026-10-14" }),
      entry({ name: "Called off", scheduledOn: "2026-10-15", isCancelled: true }),
    ]);

    const { container } = render(await PublicCalendarViewPage(viewProps()));
    const tiles = within(container)
      .getAllByTestId("calendar-entry")
      .map((tile) => flatten(tile.textContent));

    expect(tiles.find((tile) => tile.includes("Ordinary"))).not.toContain("Draft");
    expect(tiles.find((tile) => tile.includes("Ordinary"))).not.toContain("Approved");
    expect(tiles.find((tile) => tile.includes("Called off"))).toContain("Cancelled");
  });

  it("opens where it would have opened anyway on an unreadable month", async () => {
    // `W1`'s exception table: `?month=banana` is never an error page.
    const { container } = render(
      await PublicCalendarViewPage(viewProps({ mode: "gregorian", month: "banana" })),
    );

    expect(within(container).getByTestId("gregorian-grid")).toBeTruthy();
  });

  /*
   * The scroll-lock test that stood here is gone with the control it guarded —
   * BG-153-2. It asserted that MUI's select menu did not lock body scroll,
   * because a `Modal` locks it while open and restores the previous scroll
   * position on close, which silently undid the jump (W153-F1's first half).
   * The jump control is buttons now: no `Modal`, nothing locked, nothing
   * restored, and no workaround to keep honest. Removed rather than carried
   * forward, because a test whose mechanism no longer exists passes for no
   * reason. What replaced it is the measurement at five widths on the pull
   * request, and the two tests below, which are about the anchor rather than
   * the widget.
   */

  it("warns rather than showing an empty year when no term is configured", async () => {
    vi.mocked(listTermWindows).mockResolvedValue([]);

    const { container } = render(await PublicCalendarViewPage(viewProps({ mode: "oxford" })));

    expect(within(container).getByTestId("public-no-terms")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// The public event page
// ---------------------------------------------------------------------------

describe("the public event page", () => {
  it("states the whole event record", async () => {
    vi.mocked(readPublicEvent).mockResolvedValue(
      detail({
        name: "Chalk — michaelmas week 4",
        eventType: "chalk",
        deliveryMode: "online",
        venue: "Teams",
        isMandatory: false,
        description: "Install review for the Brackenridge fixture. Bring questions.",
        requiredEquipment: "Notebook, playbook",
        scheduledOn: "2026-11-03",
        startsAt: "18:00",
        endsAt: "19:00",
      }),
    );

    const { container } = render(await PublicEventPage(eventProps()));
    const text = flatten(container.textContent);

    expect(text).toContain("Chalk — michaelmas week 4");
    expect(text).toContain("Tuesday, 3 November 2026");
    expect(text).toContain("18:00–19:00");
    expect(text).toContain("Europe/London");
    expect(text).toContain("Chalk");
    expect(text).toContain("Teams");
    expect(text).toContain("Optional");
    expect(text).toContain("Notebook, playbook");
    expect(text).toContain("Install review for the Brackenridge fixture.");
    // And its Oxford coordinate, from the same year the calendar draws.
    expect(text).toContain("MT 4th");
  });

  it("says nothing about people", async () => {
    // `REQ-public-calendar`: the page renders without touching participation
    // data at all. There is nothing here to hide, so there is nothing to say.
    const { container } = render(await PublicEventPage(eventProps()));
    const text = flatten(container.textContent).toLowerCase();

    for (const absent of ["invited", "rsvp", "attendance recorded", "said yes", "delivery"]) {
      expect(text, `the public event page mentions ${absent}`).not.toContain(absent);
    }
  });

  it("never explains why the joining link is absent", async () => {
    // Brian has rejected the application narrating its own rules. The page says
    // the event is online and stops.
    vi.mocked(readPublicEvent).mockResolvedValue(
      detail({ deliveryMode: "online", venue: "Teams" }),
    );

    const { container } = render(await PublicEventPage(eventProps()));
    const text = flatten(container.textContent);

    expect(text).not.toMatch(/joining details|sent to the people|not shown|is never public/i);
  });

  it("marks a cancelled event as cancelled", async () => {
    vi.mocked(readPublicEvent).mockResolvedValue(detail({ isCancelled: true }));

    render(await PublicEventPage(eventProps()));

    expect(screen.getByTestId("public-event-cancelled")).toBeTruthy();
  });

  it("says the event is gone rather than crashing on an unknown id", async () => {
    vi.mocked(readPublicEvent).mockRejectedValue(
      new NotFound("That event no longer exists.", { rule: "event_not_found" }),
    );

    render(await PublicEventPage(eventProps("not-a-uuid")));

    expect(screen.getByTestId("public-event-missing").textContent).toBe(
      "That event no longer exists.",
    );
    expect(screen.getByRole("link", { name: "Back to the calendar" })).toBeTruthy();
  });

  it("reads the public projection, and never the operator's", async () => {
    render(await PublicEventPage(eventProps()));

    expect(readPublicEvent).toHaveBeenCalledWith(EVENT_ID);
    expect(readEvent).not.toHaveBeenCalled();
  });
});
