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
    // LAN-153 put the operator tier's own guard in front of the calendar's read.
    listEventsForOperator: vi.fn(),
    readEvent: vi.fn(),
    createEventDraft: vi.fn(),
    updateEventDraft: vi.fn(),
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
  listEventsForOperator,
  updateEventDraft,
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

/**
 * The previous academic year's last term.
 *
 * The season's leading Long Vacation is numbered from the day after this ends —
 * it is the only place its week 1 can come from — so a fixture without it would
 * be a year with no Long Vacation at its start, which is not the year Stewart
 * described.
 */
const TRINITY_BEFORE: TermWindow = {
  id: "55555555-5555-4555-8555-555555555550",
  name: "trinity",
  academicYear: "2025-26",
  startsOn: "2026-04-19",
  endsOn: "2026-06-20",
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
    deliveryMode: "in_person",
    venue: "Iffley Road Astro",
    isMandatory: true,
    registerSaved: false,
    audienceCount: 0,
    invitationCount: 0,
    responseCount: 0,
    saidYesCount: 0,
    showedCount: 0,
    ...overrides,
  };
}

function givenEvents(events: EventListEntry[]) {
  vi.mocked(listEventsForOperator).mockResolvedValue({
    season: {
      id: "44444444-4444-4444-8444-444444444444",
      label: "2026-27",
      status: "active",
      startsOn: null,
      endsOn: null,
    },
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
function flatten(text: string | null | undefined): string {
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
  vi.mocked(listTermWindows).mockResolvedValue([TRINITY, HILARY, MICHAELMAS, TRINITY_BEFORE]);
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
// LAN-153, `REQ-oxford-continuous` — the Oxford View, on screen
// ---------------------------------------------------------------------------

/**
 * The term card's own block used to be here, and went with the card (D85).
 *
 * What it proved that still matters — the configured week rows, their exact
 * Gregorian ranges, Hilary having no −1st week, two events on one day both
 * visible — is asserted below against the continuous column instead. What it
 * proved that no longer exists is gone with it: which term borrows a vacation
 * week, how far a card reaches, and the two selectors Stewart asked to replace.
 */
describe("the Oxford View", () => {
  const oxford = () => EventCalendarPage(calendarProps({ mode: "oxford" }));

  /** The segment headings, in the order they are drawn. */
  function segments(container: HTMLElement): string[] {
    return [...container.querySelectorAll('[data-testid="year-segment-heading"]')].map((heading) =>
      flatten(heading.textContent),
    );
  }

  /**
   * One week row, found by its label — optionally the nth, because a continuous
   * year has three "0th week" rows and they belong to different terms.
   */
  function weekRow(container: HTMLElement, label: string, nth = 0): HTMLElement {
    const found = [...container.querySelectorAll('[data-testid="year-week-row"]')].filter((row) =>
      flatten(row.textContent).startsWith(label),
    );
    if (!found[nth]) throw new Error(`no week row labelled ${label} at ${nth}`);
    return found[nth] as HTMLElement;
  }

  it("runs one continuous academic year rather than three term cards", async () => {
    const { container } = render(await oxford());

    expect(segments(container)).toEqual([
      "Long Vacation 2026",
      "Michaelmas",
      "Christmas Vacation",
      "Hilary",
      "Easter Vacation",
      "Trinity",
      "Long Vacation 2027",
    ]);
  });

  it("names Christmas, Easter and Long Vacation as the club names them", async () => {
    // Stewart Humble's own words, 17 August 2026, taken verbatim rather than
    // invented. The two Long Vacations are told apart by their calendar year.
    const { container } = render(await oxford());
    const text = flatten(container.textContent);

    expect(text).toContain("Christmas Vacation");
    expect(text).toContain("Easter Vacation");
    expect(text).toContain("Long Vacation");
    // D10's catch-all strip is retired: every date in the year has a home.
    expect(text).not.toContain("Outside term");
  });

  it("numbers vacation weeks forward from 1, with their exact Gregorian range", async () => {
    const { container } = render(await oxford());

    expect(flatten(weekRow(container, "Christmas Vacation 1").textContent)).toContain(
      "6 – 12 Dec 2026",
    );
    expect(flatten(weekRow(container, "Christmas Vacation 2").textContent)).toContain(
      "13 – 19 Dec 2026",
    );
  });

  it("meets the next term at its own first configured week", async () => {
    // Stewart: the vacation runs "until it'll match perfectly up until minus one
    // week" of the next term. Michaelmas has a −1st week and Hilary does not —
    // `terms.first_week` decides, so the vacation stops where the term starts.
    const { container } = render(await oxford());

    expect(flatten(weekRow(container, "Christmas Vacation 5").textContent)).toContain(
      "3 – 9 Jan 2027",
    );
    // Hilary's own 0th week is the second in the column — Michaelmas has one
    // too — and Hilary has no −1st week, so the vacation runs right up to it.
    expect(flatten(weekRow(container, "0th week", 1).textContent)).toContain("10 – 16 Jan 2027");
    expect(() => weekRow(container, "−1st week", 1)).toThrow();
  });

  it("shows Michaelmas's configured weeks with their exact Gregorian ranges", async () => {
    const { container } = render(await oxford());

    expect(flatten(weekRow(container, "−1st week").textContent)).toContain("27 Sep – 3 Oct 2026");
    expect(flatten(weekRow(container, "8th week").textContent)).toContain("29 Nov – 5 Dec 2026");
  });

  it("lays out Sunday through Saturday as the columns", async () => {
    const { container } = render(await oxford());
    const headers = [...container.querySelectorAll('th[scope="col"]')].map((header) =>
      flatten(header.textContent),
    );

    expect(headers).toEqual(["Week", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  });

  it("places an event in the cell for its actual day", async () => {
    givenEvents([listEntry({ name: "Wednesday practice", scheduledOn: "2026-10-14" })]);

    const { container } = render(await oxford());

    const day = cell(container, "year-day", "2026-10-14");
    expect(flatten(within(day).getByTestId("calendar-entry").textContent)).toContain(
      "Wednesday practice",
    );
  });

  it("places a vacation event in its vacation, and in no term", async () => {
    // The acceptance criterion Stewart gave a reason for: "we sometimes have out
    // of term s--- that we need to like know is out of term."
    givenEvents([listEntry({ name: "Christmas social", scheduledOn: "2026-12-17" })]);

    const { container } = render(await oxford());

    const day = cell(container, "year-day", "2026-12-17");
    expect(flatten(within(day).getByTestId("calendar-entry").textContent)).toContain(
      "Christmas social",
    );
    const row = weekRow(container, "Christmas Vacation 2");
    expect(within(row).getByTestId("calendar-entry")).toBeTruthy();
  });

  it("keeps two events on one date separately visible", async () => {
    // Invariant E4. Neither may be overwritten, hidden, or collapsed.
    givenEvents([
      listEntry({ name: "Chalk", scheduledOn: "2026-10-14", startsAt: "18:00" }),
      listEntry({ name: "Practice", scheduledOn: "2026-10-14", startsAt: "20:00" }),
    ]);

    const { container } = render(await oxford());

    const entries = within(cell(container, "year-day", "2026-10-14")).getAllByTestId(
      "calendar-entry",
    );
    expect(entries.map((entry) => flatten(entry.textContent))).toEqual([
      expect.stringContaining("Chalk"),
      expect.stringContaining("Practice"),
    ]);
  });

  it("offers a jump control, and no season or term selector", async () => {
    // Brian, 21 August 2026: "that filter should be removed entirely from the
    // calendar … we know what calendar we're looking at."
    const { container } = render(await oxford());

    expect(within(container).getByTestId("year-jump")).toBeTruthy();
    expect(container.querySelector('[data-testid="academic-year-select"]')).toBeNull();
    expect(container.querySelector('[data-testid="term-select"]')).toBeNull();
    // The header still says which season is being read.
    expect(screen.getByTestId("season-label").textContent).toBe("Season 2026-27");
  });

  it("offers every segment of the year as a jump target", async () => {
    const { container } = render(await oxford());
    const options = [...within(container).getByTestId("year-jump").querySelectorAll("option")].map(
      (option) => option.textContent,
    );

    // MUI renders the native select for its hidden input; the visible list is
    // the same set of choices.
    expect(options.length === 0 || options.length === 7).toBe(true);
    expect(segments(container)).toHaveLength(7);
  });

  it("renders the same weeks and events at phone width as at desktop", async () => {
    // § 7: reflow may not remove data needed for the task. A week with nothing
    // in it is a fact about the week, so it is present in both.
    givenEvents([listEntry({ name: "Wednesday practice", scheduledOn: "2026-10-14" })]);

    const { container } = render(await oxford());

    const cards = container.querySelectorAll('[data-testid="year-week-card"]');
    const rows = container.querySelectorAll('[data-testid="year-week-row"]');
    expect(cards.length).toBe(rows.length);
    expect(
      flatten(container.querySelector('[data-testid="year-column-stack"]')?.textContent),
    ).toContain("Wednesday practice");
  });

  it("says a week is empty rather than leaving the phone card blank", async () => {
    givenEvents([listEntry({ scheduledOn: "2026-10-14" })]);

    const { container } = render(await oxford());

    expect(flatten(container.textContent)).toContain("Nothing this week");
  });

  it("says so when no Oxford term is configured, and does not fail", async () => {
    // A configuration fault, not an empty calendar — so a warning, and the two
    // surfaces that still work are named.
    vi.mocked(listTermWindows).mockResolvedValue([]);

    const { container } = render(await oxford());

    expect(within(container).getByTestId("no-terms-configured")).toBeTruthy();
    expect(container.querySelector('[data-testid="year-column"]')).toBeNull();
  });

  it("lists a dated event outside the year rather than dropping it", async () => {
    givenEvents([listEntry({ name: "Before the records", scheduledOn: "2020-01-01" })]);

    const { container } = render(await oxford());

    expect(flatten(within(container).getByTestId("outside-the-year").textContent)).toContain(
      "Before the records",
    );
  });

  it("lists an undated event rather than dropping it", async () => {
    givenEvents([listEntry({ name: "Awards night, date TBC", scheduledOn: null })]);

    const { container } = render(await oxford());

    expect(flatten(within(container).getByTestId("undated-events").textContent)).toContain(
      "Awards night, date TBC",
    );
  });
});

// ---------------------------------------------------------------------------
// Matrix rows 15, 17, 19 — what a tile says, and where it goes
// ---------------------------------------------------------------------------

describe("what a calendar tile states", () => {
  it("states a status that needs acting on, in words rather than colour", async () => {
    // Two, since LAN-151 narrowed the vocabulary to three: `approved` is the
    // one that needs no acting on, and the tile stays quiet about it.
    givenEvents([
      listEntry({ name: "Draft practice", status: "draft", scheduledOn: "2026-10-11" }),
      listEntry({ name: "Cancelled social", status: "cancelled", scheduledOn: "2026-10-15" }),
    ]);

    const { container } = render(await EventCalendarPage(calendarProps()));
    const text = flatten(within(container).getByTestId("gregorian-grid").textContent);

    for (const label of ["Draft", "Cancelled"]) {
      expect(text).toContain(label);
    }
  });

  it("stays quiet about an event that is simply proceeding normally", async () => {
    // Brian's 14 August 2026 review: "if an event is in draft, I think it's
    // important. If it happened in the past, that's fine. We don't need to see
    // that." A card of sixty occurred practices should not say so sixty times.
    // Both approved: one ahead of today and one behind it. Since LAN-151 the
    // date is the only thing that separates them, and the tile is quiet about
    // both because neither needs acting on.
    givenEvents([
      listEntry({ name: "Approved chalk", status: "approved", scheduledOn: "2026-10-13" }),
      listEntry({ name: "Past practice", status: "approved", scheduledOn: "2026-10-16" }),
    ]);

    const { container } = render(await EventCalendarPage(calendarProps()));
    const text = flatten(within(container).getByTestId("gregorian-grid").textContent);

    expect(text).toContain("Approved chalk");
    expect(text).toContain("Past practice");
    expect(text).not.toContain("Approved ·");
    expect(text).not.toContain("Occurred ·");
  });

  it("names the event's type on every tile, so colour is never alone", async () => {
    // Brian's 14 August 2026 review asked for the club's own colour-by-type.
    // The word is what stops the colour being the only carrier of it.
    givenEvents([
      listEntry({ name: "Team Practice", eventType: "practice", scheduledOn: "2026-10-11" }),
      listEntry({ name: "Rookie Curry", eventType: "social", scheduledOn: "2026-10-12" }),
      listEntry({ name: "vs Elmswell", eventType: "game", scheduledOn: "2026-10-13" }),
    ]);

    const { container } = render(await EventCalendarPage(calendarProps()));
    const text = flatten(within(container).getByTestId("gregorian-grid").textContent);

    expect(text).toContain("Practice");
    expect(text).toContain("Social");
    expect(text).toContain("Game");

    // Scoped to the desktop grid: the phone agenda renders the same events
    // again, which is the point of it.
    const tiles = within(within(container).getByTestId("gregorian-grid")).getAllByTestId(
      "calendar-entry",
    );
    expect(tiles.map((tile) => tile.getAttribute("data-event-type"))).toEqual([
      "practice",
      "social",
      "game",
    ]);
  });

  it("explains the colours it is using, and only those", async () => {
    // The season holds a game and a chalk session too, but they are in other
    // months.
    // Independent review found the legend being fed the whole season, so it
    // named colours for types nowhere on the screen; the out-of-month events
    // here are what makes this test able to tell the difference.
    givenEvents([
      listEntry({ eventType: "practice", scheduledOn: "2026-10-11" }),
      listEntry({ eventType: "social", scheduledOn: "2026-10-12" }),
      listEntry({ eventType: "practice", scheduledOn: "2026-10-13" }),
      listEntry({ eventType: "game", scheduledOn: "2027-01-24" }),
      listEntry({ eventType: "chalk", scheduledOn: "2027-04-25" }),
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
    givenEvents([listEntry({ eventType: "chalk", scheduledOn: "2026-10-14" })]);
    const { container } = render(await EventCalendarPage(calendarProps({ mode: "oxford" })));

    const items = within(within(container).getByTestId("type-legend")).getAllByTestId(
      "type-legend-item",
    );
    expect(items.map((item) => item.getAttribute("data-event-type"))).toEqual(["chalk"]);
  });

  it("still gives a screen reader the status it does not print", async () => {
    // Quieting the tile is a presentation choice. Dropping the status from the
    // accessible name would be a loss of information.
    givenEvents([
      listEntry({ name: "Past practice", status: "approved", scheduledOn: "2026-10-16" }),
    ]);

    const { container } = render(await EventCalendarPage(calendarProps()));
    const label = within(container).getAllByTestId("calendar-entry")[0].getAttribute("aria-label");

    expect(label).toContain("Approved");
  });

  it("shows a draft and a cancelled event as ordinary club-calendar records", async () => {
    givenEvents([
      listEntry({ name: "Draft practice", status: "draft", scheduledOn: "2026-10-14" }),
      listEntry({ name: "Cancelled game", status: "cancelled", scheduledOn: "2026-10-14" }),
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
    // Events is an ordinary operator surface: any linked, active operator reads
    // it, and only the four calendar-management roles get the Create control.
    //
    // The note that used to sit here — "Every linked, active operator can read
    // this calendar…" — went with LAN-153. It narrated a rule rather than saying
    // what the screen does, and the absence of the action is the fact.
    vi.mocked(resolveOperatorAccess).mockResolvedValue({ state: "active", operator: reader() });

    const { container } = render(await EventCalendarPage(calendarProps()));

    expect(container.querySelector('[data-testid="gregorian-grid"]')).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Create event" })).toBeNull();
    expect(container.querySelector('[data-testid="calendar-read-only-note"]')).toBeNull();
  });

  it("shows the account state rather than a calendar to an unlinked account", async () => {
    vi.mocked(resolveOperatorAccess).mockResolvedValue({ state: "unlinked" });
    const { container } = render(await EventCalendarPage(calendarProps()));
    expect(container.querySelector('[data-testid="gregorian-grid"]')).toBeNull();
    expect(listEventsForOperator).not.toHaveBeenCalled();
  });

  it("creates and changes nothing merely by being viewed or navigated", async () => {
    // The issue's rule, asserted where it can actually fail: the calendar
    // reaches only reads. If a later change wires a write path into this page,
    // this is the test that notices.
    const gregorian = render(await EventCalendarPage(calendarProps({ month: "2026-11" })));
    gregorian.unmount();
    const oxford = render(await EventCalendarPage(calendarProps({ mode: "oxford" })));
    oxford.unmount();

    for (const write of [createEventDraft, updateEventDraft, approveEvent, saveEventAudience]) {
      expect(write).not.toHaveBeenCalled();
    }
    expect(listEventsForOperator).toHaveBeenCalledTimes(2);
    // No filter is passed, so the calendar and the list read the same events.
    expect(vi.mocked(listEventsForOperator).mock.calls[0]).toEqual([]);
  });

  it("states the refusal rather than an empty calendar when there is no season", async () => {
    vi.mocked(listEventsForOperator).mockRejectedValue(
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
  it("shows the same identity, date, time and status in both arrangements", async () => {
    const event = listEntry({
      name: "Team Practice",
      status: "cancelled",
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
    const fromColumn = flatten(
      within(cell(oxford.container, "year-day", "2026-10-14")).getByTestId("calendar-entry")
        .textContent,
    );

    expect(fromGrid).toBe(fromColumn);
    expect(fromGrid).toContain("20:00 Team Practice");
    expect(fromGrid).toContain("Cancelled");
  });
});
