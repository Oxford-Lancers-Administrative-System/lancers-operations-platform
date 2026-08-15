/**
 * The Events calendar screens — LAN-114, matrix rows 8, 11, 13 to 19.
 *
 * These render the real page with the service layer mocked, so what is under
 * test is the screen: which events it places, on which days, what it says about
 * the ones it cannot place, what it offers to whom, and — the point of several
 * of them — what it never calls.
 *
 * The projections themselves are proved separately and against the three
 * supplied OULAFC term cards in `src/lib/services/calendar.test.ts`. Nothing
 * here re-derives a week range; these tests ask whether the screen shows what
 * the projection produced.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("server-only", () => ({}));
const routerPush = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  usePathname: () => "/operate/events/calendar",
  useRouter: () => ({ push: routerPush, replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("../../../login/actions", () => ({ signOut: vi.fn() }));
vi.mock("@/lib/services/events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/events")>();
  return {
    ...actual,
    listCurrentSeasonEvents: vi.fn(),
    readEvent: vi.fn(),
    createEventDraft: vi.fn(),
    updateEventDraft: vi.fn(),
    abandonEventDraft: vi.fn(),
  };
});
vi.mock("@/lib/services/seasons", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/seasons")>();
  return { ...actual, listTerms: vi.fn(), listTermWindows: vi.fn(), readCurrentSeason: vi.fn() };
});
vi.mock("@/lib/services/event-approval", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/event-approval")>();
  return {
    ...actual,
    approveEvent: vi.fn(),
    saveEventAudience: vi.fn(),
    readApprovalPreview: vi.fn(),
    readEventAudience: vi.fn(),
  };
});
vi.mock("@/lib/club-time", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/club-time")>();
  return { ...actual, todayInClubZone: vi.fn(() => "2026-10-14") };
});

import { NotFound } from "@/lib/db";
import { resolveOperatorAccess, type ResolvedOperator } from "@/lib/auth/operator";
import {
  createEventDraft,
  listCurrentSeasonEvents,
  updateEventDraft,
  abandonEventDraft,
  type EventListEntry,
} from "@/lib/services/events";
import { approveEvent, saveEventAudience } from "@/lib/services/event-approval";
import { listTermWindows } from "@/lib/services/seasons";
import type { TermWindow } from "@/lib/services/event-input";
import EventCalendarPage from "./page";

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

/** One of the four calendar-management roles. */
function operator(roleCodes: string[] = ["secretary"]): ResolvedOperator {
  return {
    authUserId: "11111111-1111-4111-8111-111111111111",
    personId: "22222222-2222-4222-8222-222222222222",
    displayName: "Rowan Ashdown",
    roleCodes,
    isActive: true,
  };
}

/** A linked, active operator with no calendar role. The Treasurer is one. */
function reader(): ResolvedOperator {
  return operator(["treasurer"]);
}

let nextId = 0;

function listEntry(overrides: Partial<EventListEntry> = {}): EventListEntry {
  nextId += 1;
  return {
    id: `33333333-3333-4333-8333-${`${nextId}`.padStart(12, "0")}`,
    name: `Event ${nextId}`,
    eventType: "practice",
    status: "draft",
    scheduledOn: "2026-10-14",
    startsAt: "20:00",
    endsAt: "22:00",
    venue: "Iffley Road Astro",
    isMandatory: true,
    solicitsResponse: true,
    audienceCount: 0,
    invitationCount: 0,
    responseCount: 0,
    ...overrides,
  };
}

function givenEvents(events: EventListEntry[]) {
  vi.mocked(listCurrentSeasonEvents).mockResolvedValue({
    season: { id: "44444444-4444-4444-8444-444444444444", label: "2026-27", status: "active" },
    events,
    totalInSeason: events.length,
  });
}

function calendarProps(query: Record<string, string> = {}) {
  return {
    params: Promise.resolve({}),
    searchParams: Promise.resolve(query),
  } as unknown as PageProps<"/operate/events/calendar">;
}

/** Text with runs of whitespace collapsed, so wrapping cannot break a match. */
function flatten(text: string | null): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

/** The desktop grid's cell for a date, from either calendar. */
function cell(container: HTMLElement, testId: string, day: string): HTMLElement {
  const found = container.querySelector(`[data-testid="${testId}"][data-day="${day}"]`);
  if (!found) throw new Error(`no ${testId} for ${day}`);
  return found as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  routerPush.mockClear();
  vi.mocked(resolveOperatorAccess).mockResolvedValue({ state: "active", operator: operator() });
  vi.mocked(listTermWindows).mockResolvedValue([TRINITY, HILARY, MICHAELMAS]);
  givenEvents([listEntry()]);
});

// ---------------------------------------------------------------------------
// Matrix rows 18, 11 — the switches and where they lead
// ---------------------------------------------------------------------------

describe("the Events view switches", () => {
  it("offers List and Calendar, and marks Calendar as the current view", async () => {
    render(await EventCalendarPage(calendarProps()));

    const nav = screen.getByTestId("events-view-switch");
    expect(within(nav).getByTestId("view-list")).toHaveAttribute("href", "/operate/events");
    expect(within(nav).getByTestId("view-calendar")).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByTestId("view-list")).not.toHaveAttribute("aria-current");
    expect(nav).toHaveAttribute("aria-label", "Events view");
  });

  it("offers Gregorian and Oxford term, marking whichever is showing", async () => {
    const gregorian = render(await EventCalendarPage(calendarProps()));
    const gregorianNav = within(gregorian.container).getByTestId("calendar-mode-switch");
    expect(within(gregorianNav).getByTestId("mode-gregorian")).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(gregorianNav).getByTestId("mode-oxford")).not.toHaveAttribute("aria-current");
    gregorian.unmount();

    const oxford = render(await EventCalendarPage(calendarProps({ mode: "oxford" })));
    const oxfordNav = within(oxford.container).getByTestId("calendar-mode-switch");
    expect(within(oxfordNav).getByTestId("mode-oxford")).toHaveAttribute("aria-current", "page");
    expect(within(oxfordNav).getByTestId("mode-gregorian")).not.toHaveAttribute("aria-current");
  });

  it("shows the Gregorian calendar by default", async () => {
    const { container } = render(await EventCalendarPage(calendarProps()));
    expect(within(container).getByTestId("gregorian-view")).toBeTruthy();
    expect(container.querySelector('[data-testid="oxford-view"]')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Matrix rows 9, 10, 11 — the Gregorian calendar
// ---------------------------------------------------------------------------

describe("the Gregorian calendar", () => {
  it("opens on today's month and places the event on its actual date", async () => {
    const { container } = render(await EventCalendarPage(calendarProps()));

    expect(flatten(within(container).getByTestId("gregorian-grid").textContent)).toContain(
      "October 2026",
    );
    const wednesday = cell(container, "gregorian-cell", "2026-10-14");
    expect(within(wednesday).getByTestId("calendar-entry")).toBeTruthy();
    expect(flatten(wednesday.textContent)).toContain("20:00 Event");
  });

  it("navigates by month, and back to today, without leaving the Gregorian mode", async () => {
    const { container } = render(await EventCalendarPage(calendarProps({ month: "2026-11" })));

    expect(within(container).getByTestId("month-previous")).toHaveAttribute(
      "href",
      "/operate/events/calendar?mode=gregorian&month=2026-10",
    );
    expect(within(container).getByTestId("month-next")).toHaveAttribute(
      "href",
      "/operate/events/calendar?mode=gregorian&month=2026-12",
    );
    expect(within(container).getByTestId("month-today")).toHaveAttribute(
      "href",
      "/operate/events/calendar?mode=gregorian&month=2026-10",
    );
    expect(within(container).getByTestId("month-input")).toBeTruthy();

    // The Calendar switch keeps the month you are on, rather than sending you
    // back to the default one.
    expect(within(container).getByTestId("view-calendar")).toHaveAttribute(
      "href",
      "/operate/events/calendar?mode=gregorian&month=2026-11",
    );
  });

  it("falls back to a sensible month rather than failing on an unreadable one", async () => {
    const { container } = render(await EventCalendarPage(calendarProps({ month: "banana" })));
    expect(flatten(within(container).getByTestId("gregorian-grid").textContent)).toContain(
      "October 2026",
    );
  });

  it("says so when the month it is showing holds nothing", async () => {
    givenEvents([listEntry({ scheduledOn: "2027-01-20" })]);
    const { container } = render(await EventCalendarPage(calendarProps({ month: "2026-10" })));
    expect(within(container).getByTestId("month-empty")).toBeTruthy();
  });

  it("keeps two events on one date separately visible", async () => {
    givenEvents([
      listEntry({ name: "Team Practice", scheduledOn: "2026-10-14", startsAt: "20:00" }),
      listEntry({ name: "Team Chalk", scheduledOn: "2026-10-14", startsAt: "18:00" }),
    ]);

    const { container } = render(await EventCalendarPage(calendarProps()));
    const wednesday = cell(container, "gregorian-cell", "2026-10-14");
    const entries = within(wednesday).getAllByTestId("calendar-entry");

    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => flatten(entry.textContent))).toEqual([
      expect.stringContaining("18:00 Team Chalk"),
      expect.stringContaining("20:00 Team Practice"),
    ]);
  });

  it("renders the same days and events at phone width as at desktop", async () => {
    givenEvents([listEntry({ name: "Team Practice", scheduledOn: "2026-10-14" })]);
    const { container } = render(await EventCalendarPage(calendarProps()));

    const gridDays = [...container.querySelectorAll('[data-testid="gregorian-cell"]')].map((node) =>
      node.getAttribute("data-day"),
    );
    const agendaDays = [...container.querySelectorAll('[data-testid="gregorian-agenda-day"]')].map(
      (node) => node.getAttribute("data-day"),
    );

    expect(agendaDays).toEqual(gridDays);
    expect(flatten(within(container).getByTestId("gregorian-agenda").textContent)).toContain(
      "Team Practice",
    );
  });

  it("lists an event with no date rather than dropping it from the calendar", async () => {
    givenEvents([listEntry({ name: "Awards night", scheduledOn: null, startsAt: null })]);
    const { container } = render(await EventCalendarPage(calendarProps()));

    expect(flatten(within(container).getByTestId("undated-events").textContent)).toContain(
      "Awards night",
    );
  });
});

// ---------------------------------------------------------------------------
// Matrix rows 4, 5, 6, 7, 8 — the Oxford term card, on screen
// ---------------------------------------------------------------------------

describe("the Oxford term card", () => {
  it("shows the configured week rows with their exact Gregorian ranges", async () => {
    const { container } = render(await EventCalendarPage(calendarProps({ mode: "oxford" })));

    const rows = [...container.querySelectorAll('[data-testid="term-card-week"]')];
    expect(rows.map((row) => row.getAttribute("data-week"))).toEqual([
      "-1",
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
    ]);

    expect(flatten(rows[0].textContent)).toContain("−1st week");
    expect(flatten(rows[0].textContent)).toContain("27 Sep – 3 Oct 2026");
    expect(flatten(rows[1].textContent)).toContain("0th week");
    expect(flatten(rows[1].textContent)).toContain("4 – 10 Oct 2026");
    expect(flatten(rows[9].textContent)).toContain("8th week");
    expect(flatten(rows[9].textContent)).toContain("29 Nov – 5 Dec 2026");
  });

  it("lays out Sunday through Saturday as the columns", async () => {
    const { container } = render(await EventCalendarPage(calendarProps({ mode: "oxford" })));
    const headers = [...container.querySelectorAll('[data-testid="term-card-grid"] thead th')].map(
      (node) => flatten(node.textContent),
    );
    expect(headers).toEqual([
      "Week",
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ]);
  });

  it("gives Hilary no −1st week row, because it is not configured to have one", async () => {
    const { container } = render(
      await EventCalendarPage(calendarProps({ mode: "oxford", term: HILARY.id })),
    );
    const weeks = [...container.querySelectorAll('[data-testid="term-card-week"]')].map((row) =>
      row.getAttribute("data-week"),
    );
    expect(weeks).toEqual(["0", "1", "2", "3", "4", "5", "6", "7", "8"]);
    expect(flatten(container.textContent)).toContain("10 – 16 Jan 2027");
  });

  it("places an event in the cell for its actual day", async () => {
    givenEvents([
      listEntry({ name: "Team Practice", scheduledOn: "2026-10-14", startsAt: "20:00" }),
    ]);
    const { container } = render(await EventCalendarPage(calendarProps({ mode: "oxford" })));

    const wednesday = cell(container, "term-card-cell", "2026-10-14");
    expect(flatten(wednesday.textContent)).toContain("20:00 Team Practice");

    const week1 = container.querySelector('[data-testid="term-card-week"][data-week="1"]');
    expect(week1?.contains(wednesday)).toBe(true);
  });

  it("keeps two events on one date separately visible", async () => {
    givenEvents([
      listEntry({ name: "Team Practice", scheduledOn: "2026-10-14", startsAt: "20:00" }),
      listEntry({ name: "Team Chalk", scheduledOn: "2026-10-14", startsAt: "18:00" }),
    ]);

    const { container } = render(await EventCalendarPage(calendarProps({ mode: "oxford" })));
    const entries = within(cell(container, "term-card-cell", "2026-10-14")).getAllByTestId(
      "calendar-entry",
    );
    expect(entries).toHaveLength(2);
    expect(flatten(entries[0].textContent)).toContain("18:00 Team Chalk");
  });

  it("offers academic-year and term selection", async () => {
    const { container } = render(await EventCalendarPage(calendarProps({ mode: "oxford" })));
    expect(within(container).getByTestId("academic-year-select")).toBeTruthy();
    expect(within(container).getByTestId("term-select")).toBeTruthy();
  });

  it("puts an event just outside term on the card, in a dated context row", async () => {
    // Brian's 14 August 2026 review. 6 December 2026 is the day after
    // Michaelmas ends; it belongs on the card, not in a list beneath it.
    givenEvents([listEntry({ name: "Christmas dinner", scheduledOn: "2026-12-12" })]);

    const { container } = render(await EventCalendarPage(calendarProps({ mode: "oxford" })));

    const cell = container.querySelector('[data-testid="term-card-cell"][data-day="2026-12-12"]');
    expect(cell).not.toBeNull();
    expect(flatten(cell!.textContent)).toContain("Christmas dinner");

    const rows = [...container.querySelectorAll('[data-testid="term-card-week"]')];
    expect(rows[rows.length - 1].getAttribute("data-week")).toBe("after");
    expect(flatten(rows[rows.length - 1].textContent)).toContain("After term");
  });

  it("leaves another term's events to that term, and offers no link out", async () => {
    givenEvents([
      listEntry({ name: "Lancers vs Elmswell", scheduledOn: "2027-01-24" }),
      listEntry({ name: "Awards night", scheduledOn: null, startsAt: null }),
    ]);

    const { container } = render(await EventCalendarPage(calendarProps({ mode: "oxford" })));

    // No panel of other terms, and none of the links Brian asked to remove.
    expect(container.querySelector('[data-testid="other-term-link"]')).toBeNull();
    expect(flatten(container.textContent)).not.toContain("Lancers vs Elmswell");

    // One quiet line says where they are instead.
    expect(flatten(within(container).getByTestId("other-terms-note").textContent)).toContain(
      "appear on those terms’ cards",
    );

    // What genuinely has nowhere to go is still stated.
    expect(flatten(within(container).getByTestId("undated-events").textContent)).toContain(
      "Awards night",
    );
  });

  it("reports an event too far from any term to reach", async () => {
    givenEvents([listEntry({ name: "Summer camp", scheduledOn: "2027-09-20" })]);

    const { container } = render(
      await EventCalendarPage(calendarProps({ mode: "oxford", term: TRINITY.id })),
    );

    expect(flatten(within(container).getByTestId("far-from-any-term").textContent)).toContain(
      "Summer camp",
    );
  });

  it("renders the same weeks and events at phone width as at desktop", async () => {
    givenEvents([listEntry({ name: "Team Practice", scheduledOn: "2026-10-14" })]);
    const { container } = render(await EventCalendarPage(calendarProps({ mode: "oxford" })));

    const gridWeeks = [...container.querySelectorAll('[data-testid="term-card-week"]')].map(
      (node) => node.getAttribute("data-week"),
    );
    const agendaWeeks = [
      ...container.querySelectorAll('[data-testid="term-card-agenda-week"]'),
    ].map((node) => node.getAttribute("data-week"));

    expect(agendaWeeks).toEqual(gridWeeks);
    expect(flatten(within(container).getByTestId("term-card-agenda").textContent)).toContain(
      "Team Practice",
    );
  });

  it("says so when no Oxford term is configured, and does not fail", async () => {
    vi.mocked(listTermWindows).mockResolvedValue([]);
    const { container } = render(await EventCalendarPage(calendarProps({ mode: "oxford" })));
    expect(within(container).getByTestId("no-terms-configured")).toBeTruthy();
  });

  it("falls back to a configured term rather than failing on an unknown one", async () => {
    const { container } = render(
      await EventCalendarPage(calendarProps({ mode: "oxford", term: "not-a-term" })),
    );
    expect(within(container).getByTestId("term-card-grid")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Matrix rows 15, 17, 19 — what a tile says, and where it goes
// ---------------------------------------------------------------------------

describe("what a calendar tile states", () => {
  it("states a status that needs acting on, in words rather than colour", async () => {
    givenEvents([
      listEntry({ name: "Draft practice", status: "draft", scheduledOn: "2026-10-11" }),
      listEntry({ name: "Pending fixture", status: "pending_approval", scheduledOn: "2026-10-12" }),
      listEntry({ name: "Cancelled social", status: "cancelled", scheduledOn: "2026-10-15" }),
      listEntry({ name: "Not-held meeting", status: "not_held", scheduledOn: "2026-10-17" }),
      listEntry({ name: "Withdrawn taster", status: "withdrawn", scheduledOn: "2026-10-18" }),
      listEntry({ name: "Rejected trip", status: "rejected", scheduledOn: "2026-10-19" }),
    ]);

    const { container } = render(await EventCalendarPage(calendarProps()));
    const text = flatten(within(container).getByTestId("gregorian-grid").textContent);

    for (const label of [
      "Draft",
      "Pending approval",
      "Cancelled",
      "Not held",
      "Withdrawn",
      "Rejected",
    ]) {
      expect(text).toContain(label);
    }
  });

  it("stays quiet about an event that is simply proceeding normally", async () => {
    // Brian's 14 August 2026 review: "if an event is in draft, I think it's
    // important. If it happened in the past, that's fine. We don't need to see
    // that." A card of sixty occurred practices should not say so sixty times.
    givenEvents([
      listEntry({ name: "Approved chalk", status: "approved", scheduledOn: "2026-10-13" }),
      listEntry({ name: "Occurred camp", status: "occurred", scheduledOn: "2026-10-16" }),
    ]);

    const { container } = render(await EventCalendarPage(calendarProps()));
    const text = flatten(within(container).getByTestId("gregorian-grid").textContent);

    expect(text).toContain("Approved chalk");
    expect(text).toContain("Occurred camp");
    expect(text).not.toContain("Approved ·");
    expect(text).not.toContain("Occurred ·");
  });

  it("names the event's type on every tile, so colour is never alone", async () => {
    // Brian's 14 August 2026 review asked for the club's own colour-by-type.
    // The word is what stops the colour being the only carrier of it.
    givenEvents([
      listEntry({ name: "Team Practice", eventType: "practice", scheduledOn: "2026-10-11" }),
      listEntry({ name: "Rookie Curry", eventType: "social", scheduledOn: "2026-10-12" }),
      listEntry({ name: "vs Elmswell", eventType: "fixture", scheduledOn: "2026-10-13" }),
    ]);

    const { container } = render(await EventCalendarPage(calendarProps()));
    const text = flatten(within(container).getByTestId("gregorian-grid").textContent);

    expect(text).toContain("Practice");
    expect(text).toContain("Social");
    expect(text).toContain("Fixture");

    // Scoped to the desktop grid: the phone agenda renders the same events
    // again, which is the point of it.
    const tiles = within(within(container).getByTestId("gregorian-grid")).getAllByTestId(
      "calendar-entry",
    );
    expect(tiles.map((tile) => tile.getAttribute("data-event-type"))).toEqual([
      "practice",
      "social",
      "fixture",
    ]);
  });

  it("explains the colours it is using, and only those", async () => {
    // The season holds a fixture and a camp too, but they are in other months.
    // Independent review found the legend being fed the whole season, so it
    // named colours for types nowhere on the screen; the out-of-month events
    // here are what makes this test able to tell the difference.
    givenEvents([
      listEntry({ eventType: "practice", scheduledOn: "2026-10-11" }),
      listEntry({ eventType: "social", scheduledOn: "2026-10-12" }),
      listEntry({ eventType: "practice", scheduledOn: "2026-10-13" }),
      listEntry({ eventType: "fixture", scheduledOn: "2027-01-24" }),
      listEntry({ eventType: "camp", scheduledOn: "2027-04-25" }),
    ]);

    const { container } = render(await EventCalendarPage(calendarProps({ month: "2026-10" })));
    const legend = within(container).getByTestId("type-legend");
    const items = within(legend).getAllByTestId("type-legend-item");

    expect(items.map((item) => item.getAttribute("data-event-type"))).toEqual([
      "practice",
      "social",
    ]);
    expect(flatten(legend.textContent)).not.toContain("Fixture");
    expect(flatten(legend.textContent)).not.toContain("Camp");
    expect(legend).toHaveAttribute("aria-label", "What the calendar colours mean");
  });

  it("names an undated event's type, because that block is on the screen too", async () => {
    givenEvents([
      listEntry({ eventType: "practice", scheduledOn: "2026-10-11" }),
      listEntry({ eventType: "social", scheduledOn: null, startsAt: null }),
    ]);

    const { container } = render(await EventCalendarPage(calendarProps({ month: "2026-10" })));
    const items = within(within(container).getByTestId("type-legend")).getAllByTestId(
      "type-legend-item",
    );
    expect(items.map((item) => item.getAttribute("data-event-type"))).toEqual([
      "practice",
      "social",
    ]);
  });

  it("shows the same legend on the term card", async () => {
    givenEvents([listEntry({ eventType: "camp", scheduledOn: "2026-10-14" })]);
    const { container } = render(await EventCalendarPage(calendarProps({ mode: "oxford" })));

    const items = within(within(container).getByTestId("type-legend")).getAllByTestId(
      "type-legend-item",
    );
    expect(items.map((item) => item.getAttribute("data-event-type"))).toEqual(["camp"]);
  });

  it("still gives a screen reader the status it does not print", async () => {
    // Quieting the tile is a presentation choice. Dropping the status from the
    // accessible name would be a loss of information.
    givenEvents([
      listEntry({ name: "Occurred camp", status: "occurred", scheduledOn: "2026-10-16" }),
    ]);

    const { container } = render(await EventCalendarPage(calendarProps()));
    const label = within(container).getAllByTestId("calendar-entry")[0].getAttribute("aria-label");

    expect(label).toContain("Occurred");
  });

  it("shows a draft and a pending event as ordinary club-calendar records", async () => {
    givenEvents([
      listEntry({ name: "Draft practice", status: "draft", scheduledOn: "2026-10-14" }),
      listEntry({ name: "Pending fixture", status: "pending_approval", scheduledOn: "2026-10-14" }),
    ]);

    const { container } = render(await EventCalendarPage(calendarProps()));
    const entries = within(cell(container, "gregorian-cell", "2026-10-14")).getAllByTestId(
      "calendar-entry",
    );
    expect(entries).toHaveLength(2);
  });

  it("links every tile to the one event detail record", async () => {
    const event = listEntry({ scheduledOn: "2026-10-14" });
    givenEvents([event]);

    const gregorian = render(await EventCalendarPage(calendarProps()));
    expect(
      within(gregorian.container).getAllByTestId("calendar-entry")[0].getAttribute("href"),
    ).toBe(`/operate/events/${event.id}`);
    gregorian.unmount();

    const oxford = render(await EventCalendarPage(calendarProps({ mode: "oxford" })));
    expect(within(oxford.container).getAllByTestId("calendar-entry")[0].getAttribute("href")).toBe(
      `/operate/events/${event.id}`,
    );
  });

  it("gives a tile an accessible name carrying its date and status", async () => {
    givenEvents([
      listEntry({
        name: "Team Practice",
        status: "draft",
        scheduledOn: "2026-10-14",
        startsAt: "20:00",
      }),
    ]);

    const { container } = render(await EventCalendarPage(calendarProps()));
    const label = within(container).getAllByTestId("calendar-entry")[0].getAttribute("aria-label");

    expect(label).toContain("Team Practice");
    expect(label).toContain("Wed 14 Oct 2026");
    expect(label).toContain("Draft");
  });
});

// ---------------------------------------------------------------------------
// Matrix rows 13, 14, 16 — who may do what, and what viewing costs
// ---------------------------------------------------------------------------

describe("authorization and side effects", () => {
  it("offers Create to a calendar-management role", async () => {
    render(await EventCalendarPage(calendarProps()));
    expect(screen.getByRole("link", { name: "Create event" })).toBeTruthy();
  });

  it("gives an operator without a calendar role a read-only calendar", async () => {
    vi.mocked(resolveOperatorAccess).mockResolvedValue({ state: "active", operator: reader() });

    const { container } = render(await EventCalendarPage(calendarProps()));

    expect(container.querySelector('[data-testid="gregorian-grid"]')).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Create event" })).toBeNull();
    expect(within(container).getByTestId("calendar-read-only-note")).toBeTruthy();
  });

  it("shows the account state rather than a calendar to an unlinked account", async () => {
    vi.mocked(resolveOperatorAccess).mockResolvedValue({ state: "unlinked" });
    const { container } = render(await EventCalendarPage(calendarProps()));
    expect(container.querySelector('[data-testid="gregorian-grid"]')).toBeNull();
    expect(listCurrentSeasonEvents).not.toHaveBeenCalled();
  });

  it("creates and changes nothing merely by being viewed or navigated", async () => {
    // The issue's rule, asserted where it can actually fail: the calendar
    // reaches only reads. If a later change wires a write path into this page,
    // this is the test that notices.
    const gregorian = render(await EventCalendarPage(calendarProps({ month: "2026-11" })));
    gregorian.unmount();
    const oxford = render(await EventCalendarPage(calendarProps({ mode: "oxford" })));
    oxford.unmount();

    for (const write of [
      createEventDraft,
      updateEventDraft,
      abandonEventDraft,
      approveEvent,
      saveEventAudience,
    ]) {
      expect(write).not.toHaveBeenCalled();
    }
    expect(listCurrentSeasonEvents).toHaveBeenCalledTimes(2);
    // No filter is passed, so the calendar and the list read the same events.
    expect(vi.mocked(listCurrentSeasonEvents).mock.calls[0]).toEqual([]);
  });

  it("states the refusal rather than an empty calendar when there is no season", async () => {
    vi.mocked(listCurrentSeasonEvents).mockRejectedValue(
      new NotFound("There is no season currently open.", { rule: "no_current_season" }),
    );
    const { container } = render(await EventCalendarPage(calendarProps()));
    expect(flatten(within(container).getByTestId("calendar-unavailable").textContent)).toContain(
      "no season currently open",
    );
  });
});

// ---------------------------------------------------------------------------
// Matrix row 2 — the events are the list's events, on the list's dates
// ---------------------------------------------------------------------------

describe("one event, three presentations", () => {
  it("shows the same identity, date, time and status in both calendars", async () => {
    const event = listEntry({
      name: "Team Practice",
      status: "pending_approval",
      scheduledOn: "2026-10-14",
      startsAt: "20:00",
    });
    givenEvents([event]);

    const gregorian = render(await EventCalendarPage(calendarProps()));
    const fromGrid = flatten(
      within(cell(gregorian.container, "gregorian-cell", "2026-10-14")).getByTestId(
        "calendar-entry",
      ).textContent,
    );
    gregorian.unmount();

    const oxford = render(await EventCalendarPage(calendarProps({ mode: "oxford" })));
    const fromCard = flatten(
      within(cell(oxford.container, "term-card-cell", "2026-10-14")).getByTestId("calendar-entry")
        .textContent,
    );

    expect(fromGrid).toBe(fromCard);
    expect(fromGrid).toContain("20:00 Team Practice");
    expect(fromGrid).toContain("Pending approval");
  });
});
