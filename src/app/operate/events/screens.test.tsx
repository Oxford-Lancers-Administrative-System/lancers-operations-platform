/**
 * UX-30, UX-31, UX-32 and UX-33 — LAN-76, matrix rows 8, 9, 10 and 12.
 *
 * These render the real pages with the service layer mocked, so what is under
 * test is the screen: which facts it states, which actions it offers, and — for
 * the two pre-approval states — that it says plainly that no invitation exists
 * and none can. The writes themselves are proved against the real database in
 * `src/lib/services/events.test.ts`.
 *
 * "States no invitations exist" is taken to mean the DOM contains the sentence,
 * not that a human would notice it: a server-rendered page ships its markup to
 * the browser, and an assertion on `container.textContent` is the closest a
 * test gets to reading the screen.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("server-only", () => ({}));
const routerPush = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  usePathname: () => "/operate/events",
  useRouter: () => ({ push: routerPush, replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("../../login/actions", () => ({ signOut: vi.fn() }));
vi.mock("@/lib/services/events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/events")>();
  return {
    ...actual,
    listCurrentSeasonEvents: vi.fn(),
    // LAN-153 put the operator tier's own guard in front of the list. Both are
    // stubbed: `listEventsForOperator` is what the list reads, and the coach's
    // narrowed list still reads the unguarded call.
    listEventsForOperator: vi.fn(),
    readEvent: vi.fn(),
    createEventDraft: vi.fn(),
    updateEventDraft: vi.fn(),
    abandonEventDraft: vi.fn(),
    deleteEventDraft: vi.fn(),
    readEventQuestions: vi.fn(),
  };
});
vi.mock("@/lib/services/seasons", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/seasons")>();
  return { ...actual, listTerms: vi.fn(), listTermWindows: vi.fn(), readCurrentSeason: vi.fn() };
});
vi.mock("@/lib/services/attendance", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/attendance")>();
  return { ...actual, readEventAttendanceSummary: vi.fn() };
});
vi.mock("@/lib/services/event-templates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/event-templates")>();
  return {
    ...actual,
    readEventFormDefaults: vi.fn(),
    readEventTemplate: vi.fn(),
    listEventTemplates: vi.fn(),
  };
});
// LAN-157. The event page reads the participation table and the live club
// link. Both are proved elsewhere — `src/app/participation/screens.test.tsx`
// for the rendering, `src/lib/services/participation.test.ts` for the payload —
// and this file's subject is the rest of the page.
vi.mock("@/lib/services/participation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/participation")>();
  return {
    ...actual,
    readOperatorParticipation: vi.fn().mockResolvedValue(null),
    readEventClubLink: vi.fn().mockResolvedValue(null),
    issueEventClubLink: vi.fn(),
  };
});
vi.mock("@/lib/services/event-approval", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/event-approval")>();
  return {
    ...actual,
    readApprovalPreview: vi.fn(),
    readEventAudience: vi.fn(),
    approveEvent: vi.fn(),
    saveEventAudience: vi.fn(),
  };
});

import { NotFound } from "@/lib/db";
import { resolveOperatorAccess, type ResolvedOperator } from "@/lib/auth/operator";
import {
  EVENT_SORT_COLUMNS,
  EVENT_STATUS_FILTERS,
  EVENT_STATUSES,
  EVENT_TYPES,
  listCurrentSeasonEvents,
  listEventsForOperator,
  readEvent,
  readEventQuestions,
  type EventDetail,
  type EventListEntry,
} from "@/lib/services/events";
import { listTermWindows } from "@/lib/services/seasons";
import { readEventFormDefaults, readEventTemplate } from "@/lib/services/event-templates";
import type { EventTypeFormDefaults } from "@/lib/services/event-template-input";
import {
  readApprovalPreview,
  readEventAudience,
  type AudienceMember,
} from "@/lib/services/event-approval";
import { summariseAudienceGroups, type AudienceCandidate } from "@/lib/services/audience-selection";
import {
  readEventAttendanceSummary,
  summariseAttendance,
  type AttendanceSummary,
} from "@/lib/services/attendance";
import {
  issueEventClubLink,
  readEventClubLink,
  readOperatorParticipation,
} from "@/lib/services/participation";
import type { OperatorParticipation } from "@/lib/services/participation-view";
import { todayInClubZone } from "@/lib/club-time";
import { DERIVED_STATE_LABELS, labelFor, STATUS_LABELS, TYPE_LABELS } from "./presentation";
import EventsPage from "./page";
import NewEventPage from "./new/page";
import EventDetailPage from "./[id]/page";
import EditEventPage from "./[id]/edit/page";

const EVENT_ID = "33333333-3333-4333-8333-333333333333";

/**
 * A calendar operator — one of the four roles Brian's clarification names.
 *
 * `reader()` below is the other case that now matters: a linked, active
 * operator who may see the club calendar and change nothing on it.
 */
function operator(roleCodes: string[] = ["secretary"]): ResolvedOperator {
  return {
    authUserId: "11111111-1111-4111-8111-111111111111",
    personId: "22222222-2222-4222-8222-222222222222",
    displayName: "Rowan Ashdown",
    roleCodes,
    isActive: true,
  };
}

/** An operator with no calendar role. The Treasurer is deliberately one. */
function reader(): ResolvedOperator {
  return operator(["treasurer"]);
}

function listEntry(overrides: Partial<EventListEntry> = {}): EventListEntry {
  return {
    id: EVENT_ID,
    name: "Wednesday practice",
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

function detail(overrides: Partial<EventDetail> = {}): EventDetail {
  return {
    ...listEntry(),
    description: null,
    requiredEquipment: null,
    joiningUrl: null,
    origin: "club_controlled",
    termId: null,
    termLabel: "michaelmas 2026-27",
    weekNumber: 2,
    createdByName: "Rowan Ashdown",
    decisionReason: null,
    seasonId: "44444444-4444-4444-8444-444444444444",
    ...overrides,
  };
}

/**
 * The list, asked for **All events** unless a test says otherwise.
 *
 * LAN-153 made the list open on a period, and the period is measured against
 * the real club clock — which no fixture can pin, because the page reads it
 * itself. Asking for the widest bucket keeps every assertion below about what
 * the screen *says* rather than about what today's date happens to be. The
 * bucketing itself is asserted in `src/lib/services/event-periods.test.ts`,
 * where today is an argument, and against real dates further down this file.
 */
function listProps(query: Record<string, string> = {}) {
  return {
    params: Promise.resolve({}),
    searchParams: Promise.resolve({ period: "all", ...query }),
  } as unknown as PageProps<"/operate/events">;
}

function newProps(query: Record<string, string> = {}) {
  return {
    params: Promise.resolve({}),
    searchParams: Promise.resolve(query),
  } as unknown as PageProps<"/operate/events/new">;
}

function detailProps(query: Record<string, string> = {}) {
  return {
    params: Promise.resolve({ id: EVENT_ID }),
    searchParams: Promise.resolve(query),
  } as unknown as PageProps<"/operate/events/[id]">;
}

function editProps() {
  return {
    params: Promise.resolve({ id: EVENT_ID }),
    searchParams: Promise.resolve({}),
  } as unknown as PageProps<"/operate/events/[id]/edit">;
}

/** Text with runs of whitespace collapsed, so wrapping cannot break a match. */
function flatten(text: string | null): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

/**
 * The headline numbers the detail page reads — LAN-152.
 *
 * Built through `summariseAttendance` rather than as an object literal, so a
 * fixture cannot claim a combination the real derivation never produces —
 * `registerSaved: false` beside a non-zero `showed`, for instance, which is the
 * exact state D74 says must be unreachable.
 */
function summary(overrides: Partial<AttendanceSummary> = {}): AttendanceSummary {
  return { ...summariseAttendance([]), invited: 37, saidYes: 21, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  routerPush.mockClear();
  vi.mocked(resolveOperatorAccess).mockResolvedValue({ state: "active", operator: operator() });
  vi.mocked(readEventAttendanceSummary).mockResolvedValue(summary());
  vi.mocked(listTermWindows).mockResolvedValue([
    {
      id: "55555555-5555-4555-8555-555555555555",
      name: "michaelmas",
      academicYear: "2026-27",
      startsOn: "2026-09-27",
      endsOn: "2026-12-05",
      firstWeek: -1,
      lastWeek: 8,
    },
  ]);
  vi.mocked(readEventQuestions).mockResolvedValue([]);
  // LAN-154. Seven templates, all of them undecided, so a test that is not
  // about inheritance sees the form the operator sees before anybody has
  // configured a type — every field empty and nothing arriving from anywhere.
  vi.mocked(readEventFormDefaults).mockResolvedValue(
    Object.fromEntries(EVENT_TYPES.map((type) => [type, formDefaults()])),
  );
  vi.mocked(readEventTemplate).mockResolvedValue({
    eventType: "practice",
    defaultVenue: null,
    defaultDeliveryMode: null,
    defaultDurationMinutes: null,
    defaultDescription: null,
    defaultRequiredEquipment: null,
    defaultIsMandatory: null,
    audienceGroups: [],
    questions: [],
  });
  givenAudience();
});

/** A template that has decided nothing, in the shape the form fills itself from. */
function formDefaults(overrides: Partial<EventTypeFormDefaults> = {}): EventTypeFormDefaults {
  return {
    deliveryMode: "in_person",
    venue: "",
    description: "",
    requiredEquipment: "",
    attendance: "optional",
    durationMinutes: null,
    questions: [],
    ...overrides,
  };
}

/**
 * Three people the audience builder can offer — a player, a coach, and somebody
 * who is both a player and on the committee.
 *
 * The overlap is not decoration: it is the case the resolved count exists to
 * make visible, and a fixture without it would let a screen that forgot to
 * de-duplicate pass.
 */
function candidate(overrides: Partial<AudienceCandidate> = {}): AudienceCandidate {
  const capacity = overrides.capacity ?? "player";
  const anchorId = overrides.anchorId ?? "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
  return {
    key: `${capacity}:${anchorId}`,
    capacity,
    anchorId,
    personId: "pppppppp-pppp-4ppp-8ppp-ppppppppppp1",
    displayName: "Avery Fielding",
    standing: "Active",
    unit: "Both",
    contact: "+44 7700 900101",
    ...overrides,
    // Recomputed last: an override of capacity or anchor has to move the key
    // with it, or the fixture would carry a key the resolver cannot match.
    ...(overrides.key ? { key: overrides.key } : {}),
  };
}

const OVERLAP_PERSON = "pppppppp-pppp-4ppp-8ppp-ppppppppppp3";

const AUDIENCE: AudienceCandidate[] = [
  candidate(),
  candidate({
    anchorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
    personId: "pppppppp-pppp-4ppp-8ppp-ppppppppppp2",
    displayName: "Samira Quinn",
    unit: "Offence",
    key: "player:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
  }),
  candidate({
    anchorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
    personId: OVERLAP_PERSON,
    displayName: "Morgan Pike",
    unit: "Defence",
    key: "player:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
  }),
  candidate({
    capacity: "coach",
    anchorId: "pppppppp-pppp-4ppp-8ppp-ppppppppppp4",
    personId: "pppppppp-pppp-4ppp-8ppp-ppppppppppp4",
    displayName: "Casey North",
    standing: "Head Coach",
    unit: null,
    contact: "casey.north@example.invalid",
    key: "coach:pppppppp-pppp-4ppp-8ppp-ppppppppppp4",
  }),
  candidate({
    capacity: "committee",
    anchorId: OVERLAP_PERSON,
    personId: OVERLAP_PERSON,
    displayName: "Morgan Pike",
    standing: "Secretary",
    unit: null,
    key: `committee:${OVERLAP_PERSON}`,
  }),
];

function givenAudience(
  candidates: AudienceCandidate[] = AUDIENCE,
  deadline: { at: Date; configuredAt: Date; clamped: boolean } | null = {
    at: new Date("2026-10-12T17:00:00Z"),
    configuredAt: new Date("2026-10-12T17:00:00Z"),
    clamped: false,
  },
  /** The audience already stored against the draft. Empty until one is saved. */
  audience: AudienceMember[] = [],
) {
  vi.mocked(readEventAudience).mockResolvedValue(audience);
  vi.mocked(readApprovalPreview).mockResolvedValue({
    event: detail(),
    audience,
    catalogue: {
      candidates,
      counts: {
        player: candidates.filter((entry) => entry.capacity === "player").length,
        coach: candidates.filter((entry) => entry.capacity === "coach").length,
        committee: candidates.filter((entry) => entry.capacity === "committee").length,
        recruit: candidates.filter((entry) => entry.capacity === "recruit").length,
      },
    },
    deadline: deadline ? { ...deadline, rule: { daysBefore: 2, atTime: "18:00" } } : null,
    // LAN-154. The review reads all three: the questions it shows as a player
    // will meet them, the group shape it leads with, and the completeness gate.
    questions: [],
    groupSummary: summariseAudienceGroups(
      candidates,
      audience.map((member) => `${member.capacity}:${member.anchorId}`),
      "practice",
    ),
    missing: [],
  });
}

function givenList(events: EventListEntry[], totalInSeason = events.length) {
  const list = {
    season: {
      id: "season",
      label: "2026-27",
      status: "active",
      startsOn: null,
      endsOn: null,
    },
    events,
    totalInSeason,
  };
  vi.mocked(listEventsForOperator).mockResolvedValue(list);
  vi.mocked(listCurrentSeasonEvents).mockResolvedValue(list);
}

// ---------------------------------------------------------------------------
// UX-30
// ---------------------------------------------------------------------------

describe("UX-30 — the current season's events", () => {
  it("names the season it is listing", async () => {
    givenList([listEntry()]);

    render(await EventsPage(listProps()));

    expect(screen.getByTestId("season-label").textContent).toBe("Season 2026-27");
  });

  it("shows date, type, status, term and week, and where the event is", async () => {
    givenList([listEntry()]);

    const { container } = render(await EventsPage(listProps()));
    const text = flatten(container.textContent);

    expect(text).toContain("Wednesday practice");
    expect(text).toContain("Wed 14 Oct 2026");
    expect(text).toContain("20:00");
    expect(text).toContain("Iffley Road Astro");
    expect(text).toContain("Draft");
    expect(text).toContain("Practice");
    // LAN-153's Term and week column, derived from the date through the same
    // academic year the Oxford View draws. 14 October 2026 is Michaelmas 1st
    // week on the club's own MT26 card, whose weeks 1–8 run from 11 October.
    expect(text).toContain("MT 1st");
  });

  it("links the event's name to the event, which is what an operator clicks", async () => {
    // Brian, 21 August 2026: "the event itself should be a hyperlink that leads
    // to the event page itself".
    givenList([listEntry()]);

    render(await EventsPage(listProps()));

    const link = screen
      .getAllByRole("link")
      .find((candidate) => candidate.textContent === "Wednesday practice");
    expect(link?.getAttribute("href")).toBe(`/operate/events/${EVENT_ID}`);
  });

  /**
   * Q-6, the other half. The filter finding the events is no use if the list
   * then reads `Approved` against every one of them — Brian asked to "easily
   * tell which ones happened versus not", and the column is where he looks.
   */
  describe("the Status column, which says what an event is now", () => {
    const PAST = "2020-10-14";
    const AHEAD = "2099-01-01";

    function statusChipsOf(container: HTMLElement): string[] {
      return [...container.querySelectorAll('[data-testid="event-row"] .MuiChip-label')].map(
        (chip) => chip.textContent ?? "",
      );
    }

    it("reads Occurred against an approved event whose date has passed", async () => {
      givenList([listEntry({ status: "approved", scheduledOn: PAST })]);

      const { container } = render(await EventsPage(listProps()));

      expect(statusChipsOf(container)).toEqual(["Occurred"]);
    });

    it("still reads Approved against one that is still to come", async () => {
      givenList([listEntry({ status: "approved", scheduledOn: AHEAD })]);

      const { container } = render(await EventsPage(listProps()));

      expect(statusChipsOf(container)).toEqual(["Approved"]);
    });

    it("never reads Occurred against a draft or a cancellation, whatever the date", async () => {
      // A draft nobody approved did not happen, and a cancelled event did not
      // happen by definition. Both are past-dated here so that the date alone
      // cannot be what decides.
      givenList([
        listEntry({ id: "e1", status: "draft", scheduledOn: PAST }),
        listEntry({ id: "e2", status: "cancelled", scheduledOn: PAST }),
      ]);

      const { container } = render(await EventsPage(listProps()));

      expect(statusChipsOf(container)).toEqual(["Draft", "Cancelled"]);
    });

    it("says the same word on the phone card as in the table", async () => {
      givenList([listEntry({ status: "approved", scheduledOn: PAST })]);

      const { container } = render(await EventsPage(listProps()));
      const cardChips = [
        ...container.querySelectorAll('[data-testid="event-card"] .MuiChip-label'),
      ].map((chip) => chip.textContent);

      expect(cardChips[0]).toBe("Occurred");
      expect(statusChipsOf(container)[0]).toBe("Occurred");
    });
  });

  it("keeps the status on the phone card, which the operator needs at 375px", async () => {
    givenList([listEntry({ status: "cancelled" })]);

    render(await EventsPage(listProps()));

    const card = screen.getByTestId("event-card");
    expect(flatten(card.textContent)).toContain("Cancelled");
  });

  /**
   * `REQ-list-shape`, and D73/D74 as LAN-152 established them.
   *
   * The Audience column went with LAN-153: it read "Chosen at approval" for
   * everything a calendar operator can create, which answered nobody's
   * question. Three counts replaced it, and the third one is the one the club
   * is most likely to misread.
   */
  describe("the three counts an operator asks about", () => {
    it("carries Invited, Said yes and Showed against invited", async () => {
      givenList([
        listEntry({
          status: "approved",
          invitationCount: 47,
          saidYesCount: 31,
          showedCount: 20,
          registerSaved: true,
        }),
      ]);

      const { container } = render(await EventsPage(listProps()));
      const text = flatten(container.textContent);

      expect(text).toContain("Invited");
      expect(text).toContain("Said yes");
      expect(text).toContain("Showed / Invited");
      expect(screen.getAllByTestId("showed-against-invited")[0].textContent).toBe("20 / 47");
    });

    it("reads an em dash until a register has been saved", async () => {
      // D74. An event nobody has got round to must not read as a disaster.
      givenList([
        listEntry({
          status: "approved",
          invitationCount: 47,
          saidYesCount: 31,
          showedCount: 0,
          registerSaved: false,
        }),
      ]);

      render(await EventsPage(listProps()));

      expect(screen.getAllByTestId("showed-against-invited")[0].textContent).toBe("— / 47");
    });

    it("reads a real zero once a register has been saved with everybody absent", async () => {
      // The other half of D74: `0 / 47` is a register that was taken, and it is
      // a different fact from one that was not.
      givenList([
        listEntry({
          status: "approved",
          invitationCount: 47,
          saidYesCount: 31,
          showedCount: 0,
          registerSaved: true,
        }),
      ]);

      render(await EventsPage(listProps()));

      expect(screen.getAllByTestId("showed-against-invited")[0].textContent).toBe("0 / 47");
    });

    it("states the counts as raw pairs and never as a percentage", async () => {
      // D62. "43%" is the same fact with the two numbers the club wanted taken
      // out of it.
      givenList([
        listEntry({
          status: "approved",
          invitationCount: 47,
          saidYesCount: 31,
          showedCount: 20,
          registerSaved: true,
        }),
      ]);

      const { container } = render(await EventsPage(listProps()));

      expect(flatten(container.textContent)).not.toContain("%");
    });
  });

  it("shows neither an occurrence column nor a response count", async () => {
    // Both went in Brian's clarification: occurrence is internal vocabulary for
    // a decision this screen cannot make, and RSVP counts are excluded from
    // this pass.
    givenList([listEntry({ status: "approved", invitationCount: 42, responseCount: 34 })]);

    const { container } = render(await EventsPage(listProps()));
    const text = flatten(container.textContent);

    expect(text).not.toContain("Occurrence");
    expect(text).not.toContain("Awaiting assertion");
    expect(text).not.toContain("34 responses");
  });

  it("offers every column as a sort, in the query string", async () => {
    // `REQ-list-shape`: "Every column sorts."
    givenList([listEntry()]);

    render(await EventsPage(listProps()));

    for (const column of [
      "name",
      "type",
      "date",
      "term",
      "status",
      "invited",
      "said_yes",
      "showed",
    ]) {
      // By its own test id rather than by searching every link for the sort
      // key: the period buttons carry the current sort in their hrefs too, and
      // a `find` over all links picks one of those up instead of the header.
      const header = screen.getAllByTestId(`sort-${column}`)[0];
      expect(header, `no sortable header for ${column}`).toBeDefined();
      expect(header.getAttribute("href")).toContain(`sort=${column}`);
    }
  });

  it("sorts Term and week identically to Date, because it is the same ordering", async () => {
    // `REQ-list-shape`. Not two orderings that agree — one expression, asked for
    // two ways. Injecting a different SQL expression for `term` fails this.
    expect(EVENT_SORT_COLUMNS.term.sql).toBe(EVENT_SORT_COLUMNS.date.sql);
    expect(EVENT_SORT_COLUMNS.term.default).toBe(EVENT_SORT_COLUMNS.date.default);
  });

  it("flips the direction of the column already sorted, and keeps the filter", async () => {
    givenList([listEntry()]);

    render(await EventsPage(listProps({ sort: "date", dir: "asc", q: "practice" })));

    const dateHeader = screen.getAllByTestId("sort-date")[0];
    expect(dateHeader?.getAttribute("href")).toContain("dir=desc");
    expect(dateHeader?.getAttribute("href")).toContain("q=practice");
    // And the period travels with it, so sorting does not widen or narrow what
    // is in view.
    expect(dateHeader?.getAttribute("href")).toContain("period=all");
  });

  it("has no Apply button — a filter applies when it changes", async () => {
    givenList([listEntry()]);

    render(await EventsPage(listProps()));

    expect(screen.queryByRole("button", { name: "Apply" })).toBeNull();
  });

  /**
   * The defect Brian found on the real screen, and the reason these exist.
   *
   * The first version submitted the surrounding form from the select's
   * `onChange`. MUI's select is a combobox backed by a hidden input that React
   * writes on the *next* render, so the submit carried the previous value and
   * choosing a status navigated to `?status=` — the selection appeared to clear
   * itself and nothing filtered. No render test caught it because none of them
   * changed a filter.
   */
  describe("choosing a filter", () => {
    /** Opens a MUI select and clicks one of its options. */
    function choose(label: string, option: string) {
      fireEvent.mouseDown(screen.getByRole("combobox", { name: label }));
      const listbox = screen.getByRole("listbox");
      fireEvent.click(within(listbox).getByRole("option", { name: option }));
    }

    /** Opens a MUI select and reads back what it offers, in order. */
    function optionsOf(label: string): string[] {
      fireEvent.mouseDown(screen.getByRole("combobox", { name: label }));
      return within(screen.getByRole("listbox"))
        .getAllByRole("option")
        .map((option) => option.textContent ?? "");
    }

    /**
     * LAN-151 changed both vocabularies underneath these two controls, and a
     * filter list frozen against the old one would offer a value the database
     * can no longer return — a filter that always finds nothing, which reads as
     * a broken control rather than as an empty result.
     *
     * So the expectation is derived from the vocabulary rather than typed out:
     * the ninth event type or the fourth status has to appear here, or fail.
     * `src/lib/services/events.test.ts` is what ties those constants to the
     * enums the database actually holds.
     */
    it("offers exactly the statuses the model has, and nothing retired", async () => {
      givenList([listEntry()]);
      render(await EventsPage(listProps()));

      expect(optionsOf("Status")).toEqual([
        "All statuses",
        ...EVENT_STATUS_FILTERS.map((value) =>
          value in STATUS_LABELS
            ? labelFor(STATUS_LABELS, value)
            : labelFor(DERIVED_STATE_LABELS, value),
        ),
      ]);
    });

    /**
     * Q-6, answered 2026-08-22. Brian: "I want to be able to see the status on
     * the status filter, and I want to see the events that occurred, to easily
     * be able to tell which ones happened versus not."
     */
    it("offers Occurred beside the three stored states", async () => {
      givenList([listEntry()]);
      render(await EventsPage(listProps()));

      expect(optionsOf("Status")).toEqual([
        "All statuses",
        "Draft",
        "Approved",
        "Occurred",
        "Cancelled",
      ]);
    });

    it("keeps Occurred out of the stored vocabulary it sits beside", () => {
      // The filter offers four things and the enum holds three. If this ever
      // fails, somebody has widened `event_status` — which D30 forbids and
      // which no migration in this branch does.
      expect(EVENT_STATUSES).not.toContain("occurred");
      expect(EVENT_STATUS_FILTERS).toEqual([
        ...EVENT_STATUSES.slice(0, 2),
        "occurred",
        "cancelled",
      ]);
    });

    it("filters by Occurred through the service, not by pretending it is a status", async () => {
      givenList([listEntry()]);
      render(await EventsPage(listProps()));

      choose("Status", "Occurred");

      const url = routerPush.mock.calls[0][0] as string;
      expect(url).toContain("status=occurred");
    });

    it("offers exactly the event types the model has, and nothing retired", async () => {
      givenList([listEntry()]);
      render(await EventsPage(listProps()));

      expect(optionsOf("Type")).toEqual([
        "All types",
        ...EVENT_TYPES.map((type) => labelFor(TYPE_LABELS, type)),
      ]);
    });

    it("navigates with the value that was chosen, not the one before it", async () => {
      givenList([listEntry()]);
      render(await EventsPage(listProps()));

      choose("Status", "Cancelled");

      expect(routerPush).toHaveBeenCalledTimes(1);
      const url = routerPush.mock.calls[0][0] as string;
      expect(url).toContain("status=cancelled");
      expect(url).not.toContain("status=&");
    });

    it("keeps the filters already applied, so they narrow together", async () => {
      givenList([listEntry()]);
      render(await EventsPage(listProps({ status: "draft", q: "practice" })));

      choose("Type", "Practice");

      const url = routerPush.mock.calls[0][0] as string;
      expect(url).toContain("type=practice");
      expect(url).toContain("status=draft");
      expect(url).toContain("q=practice");
    });

    it("keeps the sort when a filter changes", async () => {
      givenList([listEntry()]);
      render(await EventsPage(listProps({ sort: "venue", dir: "asc" })));

      choose("Status", "Draft");

      const url = routerPush.mock.calls[0][0] as string;
      expect(url).toContain("sort=venue");
      expect(url).toContain("dir=asc");
    });

    it("clears a filter back to all, without dropping the others", async () => {
      givenList([listEntry()]);
      render(await EventsPage(listProps({ status: "draft", type: "practice" })));

      choose("Status", "All statuses");

      const url = routerPush.mock.calls[0][0] as string;
      expect(url).not.toContain("status=");
      expect(url).toContain("type=practice");
    });

    it("mirrors the current filters into the search form, so Enter keeps them", async () => {
      givenList([listEntry()]);
      const { container } = render(await EventsPage(listProps({ status: "draft" })));

      const hidden = container.querySelector<HTMLInputElement>(
        'input[type="hidden"][name="status"]',
      );
      expect(hidden?.value).toBe("draft");
    });
  });

  it("distinguishes a season with no events from a filter that matched none", async () => {
    givenList([], 0);
    const empty = render(await EventsPage(listProps()));
    expect(empty.getByTestId("events-empty").textContent).toContain("This season has no events");
    empty.unmount();

    givenList([], 12);
    const filtered = render(await EventsPage(listProps({ q: "nothing" })));
    expect(filtered.getByTestId("events-filter-empty").textContent).toContain("Clear them");
  });

  it("passes the query string through as the filter", async () => {
    givenList([listEntry()]);

    render(await EventsPage(listProps({ q: "practice", status: "draft", type: "practice" })));

    expect(vi.mocked(listEventsForOperator).mock.calls[0][0]).toEqual({
      search: "practice",
      status: "draft",
      eventType: "practice",
      sort: "date",
      // Soonest first, because the list opens on what is upcoming (D84).
      direction: "asc",
      // Q-6. The page reads the club's clock once and hands it down, so the
      // derived `occurred` filter and every row's Status column cannot straddle
      // midnight and disagree.
      today: todayInClubZone(),
    });
  });

  it("explains itself rather than crashing when no season is open", async () => {
    vi.mocked(listEventsForOperator).mockRejectedValue(new NotFound("No season is open."));

    render(await EventsPage(listProps()));

    expect(screen.getByTestId("events-unavailable").textContent).toBe("No season is open.");
  });
});

// ---------------------------------------------------------------------------
// UX-31
// ---------------------------------------------------------------------------

describe("UX-31 — creating an event", () => {
  it("carries the wireframe's heading and its draft boundary note", async () => {
    render(await NewEventPage(newProps()));

    expect(screen.getByRole("heading", { name: "Create event" })).toBeVisible();
    expect(flatten(screen.getByTestId("draft-boundary-note").textContent)).toBe(
      "Draft events have no invitations, responses or attendance. Saving a draft does not " +
        "distribute anything.",
    );
  });

  it("asks where the event is, and says what the venue field then means", async () => {
    // D20 replaced the response-solicited choice on this form. In person or
    // online is a property of the event, and it decides whether the venue field
    // takes an address or a destination (D21).
    const { container } = render(await NewEventPage(newProps()));

    const inPerson = container.querySelector<HTMLInputElement>(
      'input[name="deliveryMode"][value="in_person"]',
    );
    const online = container.querySelector<HTMLInputElement>(
      'input[name="deliveryMode"][value="online"]',
    );

    expect(inPerson).not.toBeNull();
    expect(online).not.toBeNull();
    // In person is the default, because that is what the club runs.
    expect(inPerson?.checked).toBe(true);
    expect(online?.checked).toBe(false);

    // D86: the zone is stated, because the date input renders in the browser's
    // locale and the time fields carry no zone of their own.
    expect(flatten(screen.getByTestId("club-time-zone-note").textContent)).toContain(
      "Europe/London",
    );

    // D23's replacement sentence, so nobody reads the removal as the club no
    // longer wanting an answer.
    expect(flatten(screen.getByTestId("everyone-answers-note").textContent)).toContain(
      "asked to answer",
    );
  });

  it("starts attendance on the type's template answer, visibly", async () => {
    // LAN-76 left this unanswered so that an event never quietly claimed
    // attendance was expected. D15 and W8 moved the answer onto the template, so
    // the control now starts on what the template says — visible, and one click
    // from the other. The Practice template here says mandatory.
    vi.mocked(readEventFormDefaults).mockResolvedValue(
      Object.fromEntries(
        EVENT_TYPES.map((type) => [
          type,
          formDefaults(type === "practice" ? { attendance: "mandatory" } : {}),
        ]),
      ),
    );

    const { container } = render(await NewEventPage(newProps()));

    const checked = container.querySelectorAll<HTMLInputElement>(
      'input[name="attendance"]:checked',
    );
    expect([...checked].map((input) => input.value)).toEqual(["mandatory"]);
  });

  it("starts attendance on optional where the template does not say", async () => {
    // "Optional" claims nothing, which is the direction the original rule was
    // protecting — an event never says the club expects you when nobody decided.
    const { container } = render(await NewEventPage(newProps()));

    const checked = container.querySelectorAll<HTMLInputElement>(
      'input[name="attendance"]:checked',
    );
    expect([...checked].map((input) => input.value)).toEqual(["optional"]);
  });

  it("offers only the event types this form can fully describe", async () => {
    const { container } = render(await NewEventPage(newProps()));
    const options = [...container.querySelectorAll('li[role="option"]')].map((node) =>
      node.getAttribute("data-value"),
    );

    // Rendered lazily by MUI's menu; the hidden input carries the value instead.
    const selected = container.querySelector<HTMLInputElement>('input[name="eventType"]');
    expect(selected?.value).toBe("practice");
    expect(options).not.toContain("fixture");
  });

  it("asks for no term, no week and no origin", async () => {
    // All three are derived. Brian's clarification: "Do not allow operators to
    // independently choose date, term and week", and "do not expose an
    // unexplained Origin choice to the operator".
    const { container } = render(await NewEventPage(newProps()));

    expect(container.querySelector('[name="termId"]')).toBeNull();
    expect(container.querySelector('[name="weekNumber"]')).toBeNull();
    expect(container.querySelector('[name="origin"]')).toBeNull();
  });

  it("does not print the operator's own name back at them", async () => {
    const { container } = render(await NewEventPage(newProps()));
    const text = flatten(container.textContent);

    expect(text).not.toContain("Owner");
    expect(text).not.toContain("Entered by");
    expect(text).not.toContain("Created by");
    expect([...container.querySelectorAll("input")].map((node) => node.value)).not.toContain(
      "Rowan Ashdown",
    );
  });

  it("offers a way straight on to the audience, and no lecture about it", async () => {
    // The "who it goes to is chosen during approval" note went with D47: the
    // audience arrives from the type's template, so the sentence was no longer
    // true. Nothing replaced it — the second submit button is the route on.
    render(await NewEventPage(newProps()));

    expect(screen.queryByTestId("audience-comes-later")).toBeNull();
    expect(screen.getByTestId("save-and-choose-audience")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// W154C-F1 — a date the browser's segmented editor can leave mid-edit must
// not crash the form.
// ---------------------------------------------------------------------------

describe("W154C-F1 — a malformed date does not crash the derived-term alert", () => {
  // Chrome's segmented `type="date"` editor lets an operator land on a value
  // like `20261-12-11` — a five-digit year, mid-edit — which is neither empty
  // nor a parseable date. `formatLongDate` only guards falsy input, so handing
  // it a value like this threw `RangeError: Invalid time value` and took the
  // whole form down with it. `scheduledOn === ""` was not a narrow enough
  // guard; this is the input value the walker used to reproduce the crash.
  const MALFORMED_DATE = "20261-12-11";

  it("on the create form: falls back to the placeholder instead of throwing", async () => {
    const { container } = render(await NewEventPage(newProps()));

    const dateField = container.querySelector<HTMLInputElement>('input[name="scheduledOn"]');
    expect(dateField).not.toBeNull();

    // If the guard regresses to `scheduledOn === ""`, this line throws inside
    // React's render and the test fails with the RangeError itself, not an
    // assertion mismatch.
    fireEvent.change(dateField!, { target: { value: MALFORMED_DATE } });

    expect(flatten(screen.getByTestId("derived-term").textContent)).toBe(
      "Choose a date and the Oxford term and week are worked out from it.",
    );
  });

  it("on the edit form: falls back to the placeholder instead of throwing", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail());

    const { container } = render(await EditEventPage(editProps()));

    const dateField = container.querySelector<HTMLInputElement>('input[name="scheduledOn"]');
    expect(dateField).not.toBeNull();

    fireEvent.change(dateField!, { target: { value: MALFORMED_DATE } });

    expect(flatten(screen.getByTestId("derived-term").textContent)).toBe(
      "Choose a date and the Oxford term and week are worked out from it.",
    );
  });
});

// ---------------------------------------------------------------------------
// W154C-F3 — the opponent helper text only fits a Game.
// ---------------------------------------------------------------------------

describe("W154C-F3 — the Name field only mentions an opponent for a Game", () => {
  it("says nothing about an opponent for the default type, Practice", async () => {
    const { container } = render(await NewEventPage(newProps()));

    expect(container.querySelector('input[name="eventType"]')?.getAttribute("value")).toBe(
      "practice",
    );
    expect(
      flatten(container.querySelector('[data-field="name"]')?.textContent ?? ""),
    ).not.toContain("opponent");
  });

  it("says nothing about an opponent for Social, Meeting or any other non-Game type", async () => {
    const { container } = render(await NewEventPage(newProps()));

    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Type" }));
    fireEvent.click(screen.getByRole("option", { name: "Social" }));

    expect(
      flatten(container.querySelector('[data-field="name"]')?.textContent ?? ""),
    ).not.toContain("opponent");
  });

  it("names the opponent only once the type is Game", async () => {
    const { container } = render(await NewEventPage(newProps()));

    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Type" }));
    fireEvent.click(screen.getByRole("option", { name: "Game" }));

    expect(flatten(container.querySelector('[data-field="name"]')?.textContent ?? "")).toContain(
      "The opponent goes in the name.",
    );
  });
});

// ---------------------------------------------------------------------------
// The three headline numbers — REQ-headline-numbers, D62, D73, D74. LAN-152.
// ---------------------------------------------------------------------------

describe("the event's headline numbers", () => {
  function invited() {
    return detail({ status: "approved", audienceCount: 37, invitationCount: 37 });
  }

  it("puts invited, said yes and showed at the top of the event", async () => {
    vi.mocked(readEvent).mockResolvedValue(invited());
    vi.mocked(readEventAttendanceSummary).mockResolvedValue(summary());

    render(await EventDetailPage(detailProps()));

    expect(flatten(screen.getByTestId("headline-invited").textContent)).toBe("37Invited");
    expect(flatten(screen.getByTestId("headline-said-yes").textContent)).toBe("21Said yes");
  });

  it("reads an em dash against the invited count before any register is saved", async () => {
    // D74. An event nobody has got round to must not read like an event nobody
    // attended, and this is the string that keeps the two apart.
    vi.mocked(readEvent).mockResolvedValue(invited());
    vi.mocked(readEventAttendanceSummary).mockResolvedValue(summary());

    render(await EventDetailPage(detailProps()));

    expect(flatten(screen.getByTestId("headline-showed").textContent)).toBe("— / 37Showed");
  });

  it("reads 0 / 37 once a register is saved with everybody absent", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail({ status: "approved", invitationCount: 37 }));
    vi.mocked(readEventAttendanceSummary).mockResolvedValue(
      summary({ showed: 0, recorded: 37, registerSaved: true }),
    );

    render(await EventDetailPage(detailProps()));

    expect(flatten(screen.getByTestId("headline-showed").textContent)).toBe("0 / 37Showed");
  });

  it("explains neither value in words, and never as a percentage", async () => {
    // The packet is explicit: "the application does not explain the difference
    // in words", and D62 asks for raw pairs. Both are assertions about what is
    // *absent* from the payload, which is the only way to state them.
    vi.mocked(readEvent).mockResolvedValue(detail({ status: "approved", invitationCount: 37 }));
    vi.mocked(readEventAttendanceSummary).mockResolvedValue(
      summary({ showed: 20, recorded: 30, registerSaved: true }),
    );

    const { container } = render(await EventDetailPage(detailProps()));
    const text = flatten(container.textContent).toLowerCase();

    expect(text).not.toContain("%");
    expect(text).not.toContain("washout");
    expect(text).not.toContain("turnout rate");
    expect(text).not.toContain("nobody came");
    expect(text).not.toContain("not yet recorded because");
  });

  it("shows nothing at all on a draft, which has nobody to count", async () => {
    // `invitationCount` is structurally zero below approval — invariant P1 —
    // so three zeroes would be three facts about nothing.
    vi.mocked(readEvent).mockResolvedValue(detail());

    render(await EventDetailPage(detailProps()));

    expect(screen.queryByTestId("headline-numbers")).toBeNull();
    expect(readEventAttendanceSummary).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// UX-32
// ---------------------------------------------------------------------------

describe("UX-32 — a draft event", () => {
  it("states that it has no invitations and cannot have any yet", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail());

    render(await EventDetailPage(detailProps()));

    expect(flatten(screen.getByTestId("no-invitations-note").textContent)).toBe(
      "A draft can carry no invitations, responses or attendance. " +
        "Nothing is sent until the designated approver approves it.",
    );
    expect(flatten(screen.getByTestId("distribution-fact").textContent)).toContain(
      "Nothing distributed",
    );
    expect(flatten(screen.getByTestId("distribution-fact").textContent)).toContain(
      "No invitations or responses",
    );
  });

  it("says a draft with nobody in its audience has none yet", async () => {
    // D47: a type whose template names groups arrives with an audience, so a
    // draft with none has genuinely not had one chosen — by the template or by
    // anybody. The fact says that, and explains nothing further.
    vi.mocked(readEvent).mockResolvedValue(detail());

    render(await EventDetailPage(detailProps()));

    const audience = flatten(screen.getByTestId("audience-fact").textContent);
    expect(audience).toContain("Not chosen yet");
    expect(audience).not.toContain("Chosen at approval");
    expect(audience).not.toContain("approval step");
  });

  it("offers edit and the way in to approval, and no way to abandon", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail());

    render(await EventDetailPage(detailProps()));

    expect(screen.getByRole("link", { name: "Edit draft" })).toBeVisible();
    // **Abandon draft** went with the `withdrawn` status it produced. An
    // abandoned draft is deleted (D29), and that path is this mission's W4 work
    // package rather than this screen's.
    expect(screen.queryByRole("button", { name: "Abandon draft" })).toBeNull();
    expect(screen.getByRole("link", { name: "Choose audience and approve" })).toBeVisible();

    // Approval itself is still two deliberate steps away: the audience has to
    // be built and then confirmed. Nothing on the first screen approves.
    expect(screen.queryByRole("button", { name: /^approve event$/i })).toBeNull();
  });

  it("tells an operator who cannot approve who can, and offers them nothing", async () => {
    vi.mocked(resolveOperatorAccess).mockResolvedValue({
      state: "active",
      operator: operator(["treasurer"]),
    });
    vi.mocked(readEvent).mockResolvedValue(detail());

    render(await EventDetailPage(detailProps()));

    expect(screen.queryByRole("link", { name: "Choose audience and approve" })).toBeNull();
    expect(screen.queryByTestId("audience-builder")).toBeNull();
  });

  it("states the record's own fields — where it is, what to bring, what it is", async () => {
    // REQ-event-record. "Response requested" was one of the two flags this
    // stated, and D23 removed it; description (D18), required equipment (D17)
    // and in-person-or-online (D20) are what the record carries now.
    vi.mocked(readEvent).mockResolvedValue(
      detail({
        isMandatory: false,
        description: "Full contact. Bring everything.",
        requiredEquipment: "Gumshield, cleats",
      }),
    );

    const { container } = render(await EventDetailPage(detailProps()));
    const text = flatten(container.textContent);

    expect(text).toContain("Optional");
    expect(text).toContain("In person");
    expect(flatten(screen.getByTestId("venue-fact").textContent)).toContain("Iffley Road Astro");
    expect(flatten(screen.getByTestId("equipment-fact").textContent)).toContain("Gumshield");
    expect(flatten(screen.getByTestId("description-fact").textContent)).toContain("Full contact");
  });

  it("shows an online event's destination and its joining link, on the operator tier", async () => {
    // REQ-no-joining-url: the link is on the operator's own page and nowhere
    // public. The label for the venue field follows where the event is (D21).
    vi.mocked(readEvent).mockResolvedValue(
      detail({
        deliveryMode: "online",
        venue: "Microsoft Teams",
        joiningUrl: "https://teams.example.invalid/l/meetup-join/chalk",
      }),
    );

    render(await EventDetailPage(detailProps()));

    expect(flatten(screen.getByTestId("venue-fact").textContent)).toContain("Destination");
    expect(flatten(screen.getByTestId("venue-fact").textContent)).toContain("Microsoft Teams");
    expect(flatten(screen.getByTestId("joining-url-fact").textContent)).toContain(
      "https://teams.example.invalid/l/meetup-join/chalk",
    );
    expect(flatten(screen.getByTestId("joining-url-fact").textContent)).toContain(
      "Never shown on the public calendar",
    );
  });

  it("carries no joining link for an in-person event", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail());

    const { container } = render(await EventDetailPage(detailProps()));

    expect(screen.queryByTestId("joining-url-fact")).toBeNull();
    expect(container.innerHTML).not.toContain("meetup-join");
  });

  it("shows the date, term coordinates, origin and owner", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail());

    const { container } = render(await EventDetailPage(detailProps()));
    const text = flatten(container.textContent);

    // A draft carries the stored status alone: the derived state only says
    // something the stored one does not for an approved event.
    expect(flatten(screen.getByTestId("event-subtitle").textContent)).toBe(
      "Draft · Wednesday, 14 October 2026 · 20:00–22:00",
    );
    expect(text).toContain("Michaelmas 2026-27 · Week 2");

    // Neither who entered it nor where its schedule comes from. Both answer a
    // question nobody asked, and both are still recorded — in
    // `owner_person_id`, `origin` and every audit row.
    expect(screen.queryByTestId("entered-by-fact")).toBeNull();
    expect(screen.queryByTestId("origin-fact")).toBeNull();
    expect(text).not.toContain("Entered by");
    expect(text).not.toContain("Who sets the date");
  });

  it("shows the derived state beside the stored one, but only for an approved event", async () => {
    // D30, on the surface it matters on. "Approved" says what the club decided;
    // "Upcoming" or "Occurred" says where the date has got to, and the screen
    // never collapses the two into one word.
    vi.mocked(readEvent).mockResolvedValue(detail({ status: "approved" }));
    const upcoming = render(await EventDetailPage(detailProps()));
    expect(flatten(screen.getByTestId("event-subtitle").textContent)).toContain(
      "Approved · Upcoming",
    );
    upcoming.unmount();

    vi.mocked(readEvent).mockResolvedValue(
      detail({ status: "approved", scheduledOn: "2020-10-14" }),
    );
    const past = render(await EventDetailPage(detailProps()));
    expect(flatten(screen.getByTestId("event-subtitle").textContent)).toContain(
      "Approved · Occurred",
    );
    past.unmount();

    // And a cancelled event says it once, not twice.
    vi.mocked(readEvent).mockResolvedValue(detail({ status: "cancelled" }));
    render(await EventDetailPage(detailProps()));
    const subtitle = flatten(screen.getByTestId("event-subtitle").textContent);
    expect(subtitle).toContain("Cancelled");
    expect(subtitle).not.toContain("Cancelled · Cancelled");
  });

  it("says so plainly when the event has no date yet", async () => {
    vi.mocked(readEvent).mockResolvedValue(
      detail({ scheduledOn: null, startsAt: null, endsAt: null }),
    );

    render(await EventDetailPage(detailProps()));

    expect(flatten(screen.getByTestId("event-subtitle").textContent)).toBe("Draft · No date yet");
  });

  it("explains an event it cannot find", async () => {
    vi.mocked(readEvent).mockRejectedValue(new NotFound("That event no longer exists."));

    render(await EventDetailPage(detailProps()));

    expect(screen.getByTestId("event-unavailable").textContent).toBe(
      "That event no longer exists.",
    );
  });
});

// ---------------------------------------------------------------------------
// UX-33 and the pending event
// ---------------------------------------------------------------------------

describe("an approved event, which this screen never edits", () => {
  it("reads, and offers neither the editor nor a way back", async () => {
    // This used to be about `pending_approval`, the state Brian removed the
    // step for and LAN-151 removed from the enum. `approved` is what is left on
    // the far side of the drafting screens: it reads, and this route changes
    // nothing about it. Amending one in place is W5's, in this mission.
    vi.mocked(readEvent).mockResolvedValue(detail({ status: "approved" }));

    render(await EventDetailPage(detailProps()));

    expect(screen.getByTestId("event-detail").dataset.status).toBe("approved");
    expect(screen.queryByRole("button", { name: "Withdraw submission" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Edit draft" })).toBeNull();
    expect(screen.queryByRole("link", { name: /choose audience/i })).toBeNull();
  });

  it("drops the no-invitations statement once the event is approved", async () => {
    // It used to be kept for `pending_approval` too. LAN-151 removed that
    // status from the enum, so `draft` is the only state the rule applies to —
    // and an approved event has invitations, which is what the note said it
    // could not have.
    vi.mocked(readEvent).mockResolvedValue(detail({ status: "approved" }));

    render(await EventDetailPage(detailProps()));

    expect(screen.queryByTestId("no-invitations-note")).toBeNull();
  });
});

describe("a saved event is a draft, and there is nothing to submit", () => {
  it("offers edit, and neither submission nor any of the retired actions", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail());

    render(await EventDetailPage(detailProps()));

    expect(screen.getByRole("link", { name: "Edit draft" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Submit for approval" })).toBeNull();
    expect(screen.queryByRole("button", { name: /submit/i })).toBeNull();

    // REQ-occurrence-retired, on the surface it names: no screen offers any of
    // these four. **Abandon draft** goes with them, because the status it
    // produced is gone (D29 deletes an abandoned draft instead).
    for (const gone of [
      "Abandon draft",
      "Mark occurred",
      "Mark not held",
      "Confirm what happened",
      "Correct this to not held",
    ]) {
      expect(screen.queryByRole("button", { name: gone }), gone).toBeNull();
    }
  });

  it("says nothing has been sent, to an approver and to an operator who is not one", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail());

    // The approver reads it under the action they are about to take.
    const approver = render(await EventDetailPage(detailProps()));
    expect(flatten(approver.container.textContent)).toContain(
      "Nothing is sent until you have chosen who this event is for and approved it.",
    );
    approver.unmount();

    // Everybody else reads the structural rule, which is on the page for every
    // pre-approval event regardless of role. LAN-76's criterion — a draft states
    // plainly that nothing has gone out — holds for both readers.
    vi.mocked(resolveOperatorAccess).mockResolvedValue({
      state: "active",
      operator: operator(["treasurer"]),
    });
    render(await EventDetailPage(detailProps()));
    expect(flatten(screen.getByTestId("no-invitations-note").textContent)).toContain(
      "Nothing is sent until the designated approver approves it",
    );
    expect(screen.queryByRole("link", { name: "Choose audience and approve" })).toBeNull();
  });

  it("has no confirmation screen for a submission that cannot happen", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail({ status: "approved" }));

    render(await EventDetailPage(detailProps({ submitted: "1" })));

    expect(screen.queryByRole("heading", { name: "Event submitted for approval" })).toBeNull();
    expect(screen.getByTestId("event-detail")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// The edit view
// ---------------------------------------------------------------------------

describe("the edit view — UX-31 against an existing draft", () => {
  it("opens with the draft's own values", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail());

    const { container } = render(await EditEventPage(editProps()));

    expect(container.querySelector<HTMLInputElement>('input[name="name"]')?.value).toBe(
      "Wednesday practice",
    );
    expect(container.querySelector<HTMLInputElement>('input[name="venue"]')?.value).toBe(
      "Iffley Road Astro",
    );
    expect(
      container.querySelector<HTMLInputElement>('input[name="attendance"][value="mandatory"]')
        ?.checked,
    ).toBe(true);
    // D20: where the event is, prefilled from the draft.
    expect(
      container.querySelector<HTMLInputElement>('input[name="deliveryMode"][value="in_person"]')
        ?.checked,
    ).toBe(true);
  });

  it("shows the term and week derived from the draft's date", async () => {
    // 14 October 2026 is Michaelmas week 1 — derived in the browser as the
    // operator changes the date, and derived again server-side on save.
    vi.mocked(readEvent).mockResolvedValue(detail());

    const { container } = render(await EditEventPage(editProps()));

    expect(flatten(screen.getByTestId("derived-term").textContent)).toContain(
      "Michaelmas 2026-27, Week 1",
    );
    expect(container.querySelector('[name="termId"]')).toBeNull();
    expect(container.querySelector('[name="weekNumber"]')).toBeNull();
  });

  it("carries the event id, so the edit cannot land on another event", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail());

    const { container } = render(await EditEventPage(editProps()));

    expect(container.querySelector<HTMLInputElement>('input[name="eventId"]')?.value).toBe(
      EVENT_ID,
    );
  });

  it("refuses to open an editor for an event that is not a draft", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail({ status: "approved" }));

    render(await EditEventPage(editProps()));

    expect(flatten(screen.getByTestId("edit-refused").textContent)).toBe(
      "Only a draft can be edited. This event is approved.",
    );
    expect(screen.queryByTestId("event-form")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Brian's clarification — who the calendar is managed by
// ---------------------------------------------------------------------------

describe("an operator without a calendar role reads the calendar and changes nothing", () => {
  beforeEach(() => {
    vi.mocked(resolveOperatorAccess).mockResolvedValue({ state: "active", operator: reader() });
  });

  it("still sees the club's events — Events is an ordinary operator surface", async () => {
    givenList([listEntry()]);

    const { container } = render(await EventsPage(listProps()));

    expect(flatten(container.textContent)).toContain("Wednesday practice");
    expect(screen.queryByTestId("operator-not-permitted")).toBeNull();
  });

  it("is offered no Create event action", async () => {
    givenList([listEntry()]);

    render(await EventsPage(listProps()));

    expect(screen.queryByRole("link", { name: "Create event" })).toBeNull();
  });

  it("is not told to create the first event when the season is empty", async () => {
    givenList([], 0);

    render(await EventsPage(listProps()));

    expect(flatten(screen.getByTestId("events-empty").textContent)).toBe(
      "This season has no events yet.",
    );
  });

  it("opens a draft and is offered none of its actions", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail());

    const { container } = render(await EventDetailPage(detailProps()));

    expect(flatten(container.textContent)).toContain("Wednesday practice");
    expect(screen.queryByRole("link", { name: "Edit draft" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Abandon draft" })).toBeNull();
    expect(flatten(screen.getByTestId("read-only-note").textContent)).toContain(
      "President, Vice-President, Secretary and General Manager",
    );
  });

  it("is refused the editor outright, and told what it needs", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail());

    render(await EditEventPage(editProps()));

    expect(screen.getByTestId("operator-not-permitted")).toBeVisible();
    expect(flatten(screen.getByTestId("required-role").textContent)).toContain("President");
    expect(readEvent).not.toHaveBeenCalled();
  });

  it("is refused the create form, and told what it needs", async () => {
    render(await NewEventPage(newProps()));

    expect(screen.getByTestId("operator-not-permitted")).toBeVisible();
    expect(flatten(screen.getByTestId("required-role").textContent)).toContain("General Manager");
  });

  it("is never told which roles it holds", async () => {
    const { container } = render(await NewEventPage(newProps()));

    expect(container.innerHTML.toLowerCase()).not.toContain("treasurer");
  });
});

describe("each of the four calendar roles is offered the actions", () => {
  it.each(["president", "vice_president", "secretary", "general_manager"])(
    "%s can reach the editor and the draft's actions",
    async (role) => {
      vi.mocked(resolveOperatorAccess).mockResolvedValue({
        state: "active",
        operator: operator([role]),
      });
      vi.mocked(readEvent).mockResolvedValue(detail());

      const editor = render(await NewEventPage(newProps()));
      expect(editor.getByTestId("event-form")).toBeVisible();
      editor.unmount();

      render(await EventDetailPage(detailProps()));
      expect(screen.getByRole("link", { name: "Edit draft" })).toBeVisible();
    },
  );
});

// ---------------------------------------------------------------------------
// The boundary the shell already owns, re-checked on these routes
// ---------------------------------------------------------------------------

describe("every event route guards itself", () => {
  it.each([
    ["the list", () => EventsPage(listProps()), "%2Foperate%2Fevents"],
    ["the editor", () => NewEventPage(newProps()), "%2Foperate%2Fevents"],
    ["the detail", () => EventDetailPage(detailProps()), "%2Foperate%2Fevents"],
    ["the edit view", () => EditEventPage(editProps()), "%2Foperate%2Fevents"],
  ])("%s redirects a request with no session", async (_name, page, encoded) => {
    vi.mocked(resolveOperatorAccess).mockResolvedValue({ state: "no_session" });

    await expect(page()).rejects.toThrow(`REDIRECT:/login?redirectTo=${encoded}`);
  });

  it.each([
    ["the list", () => EventsPage(listProps())],
    ["the editor", () => NewEventPage(newProps())],
    ["the detail", () => EventDetailPage(detailProps())],
    ["the edit view", () => EditEventPage(editProps())],
  ])("%s shows an unlinked account the account state and no club data", async (_name, page) => {
    vi.mocked(resolveOperatorAccess).mockResolvedValue({ state: "unlinked" });
    vi.mocked(readEvent).mockResolvedValue(detail());
    givenList([listEntry()]);

    const { container } = render(await page());

    expect(screen.getByTestId("operator-account-state")).toBeVisible();
    expect(container.textContent).not.toContain("Wednesday practice");
    expect(readEvent).not.toHaveBeenCalled();
    expect(listCurrentSeasonEvents).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// UX-40, UX-41, UX-42 and UX-43 — LAN-77
// ---------------------------------------------------------------------------

/**
 * Every approval screen is now a `?step=` of the event route, rendered from the
 * audience **stored against the draft** rather than from client state. So these
 * tests drive the step rather than clicking through one component, which is also
 * how the real screens behave after `Edit draft` and back.
 */
function member(overrides: Partial<AudienceMember> = {}): AudienceMember {
  return {
    id: `member-${overrides.anchorId ?? "1"}`,
    capacity: "player",
    anchorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    personId: "pppppppp-pppp-4ppp-8ppp-ppppppppppp1",
    displayName: "Avery Fielding",
    standing: "Active",
    stillSelectable: true,
    ...overrides,
  };
}

const SAVED_AUDIENCE: AudienceMember[] = [
  member(),
  member({
    anchorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
    personId: "pppppppp-pppp-4ppp-8ppp-ppppppppppp2",
    displayName: "Samira Quinn",
  }),
  member({
    capacity: "coach",
    anchorId: "pppppppp-pppp-4ppp-8ppp-ppppppppppp4",
    personId: "pppppppp-pppp-4ppp-8ppp-ppppppppppp4",
    displayName: "Casey North",
    standing: "Head Coach",
  }),
];

/**
 * What "Everyone active" resolves to, as it would be **saved**: one row per
 * person, so the two capacities Morgan Pike holds collapse to one.
 */
const SAVED_EVERYONE: AudienceMember[] = [
  member(),
  member({
    anchorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
    personId: "pppppppp-pppp-4ppp-8ppp-ppppppppppp2",
    displayName: "Samira Quinn",
  }),
  member({
    anchorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
    personId: OVERLAP_PERSON,
    displayName: "Morgan Pike",
  }),
  member({
    capacity: "coach",
    anchorId: "pppppppp-pppp-4ppp-8ppp-ppppppppppp4",
    personId: "pppppppp-pppp-4ppp-8ppp-ppppppppppp4",
    displayName: "Casey North",
    standing: "Head Coach",
  }),
];

describe("UX-40 — building the audience", () => {
  async function openBuilder() {
    vi.mocked(readEvent).mockResolvedValue(detail());
    return render(await EventDetailPage(detailProps({ step: "audience" })));
  }

  it("opens with nothing selected when the draft has no audience yet", async () => {
    await openBuilder();

    expect(screen.getByTestId("audience-builder")).toBeVisible();
    expect(screen.getByTestId("review-selection").textContent).toBe("Review 0 selected");

    // The rule this screen exists to keep: no default, no silent whole roster.
    for (const box of screen.getAllByRole("checkbox")) {
      expect(box).not.toBeChecked();
    }
  });

  it("re-opens with the audience already saved on the draft", async () => {
    givenAudience(AUDIENCE, undefined, SAVED_AUDIENCE);
    await openBuilder();

    // The whole point of storing it: Edit draft and back must not lose it.
    expect(screen.getByTestId("review-selection").textContent).toBe("Review 3 selected");
    expect(
      screen.getAllByRole("checkbox").filter((box) => (box as HTMLInputElement).checked),
    ).toHaveLength(3);
  });

  it("offers everyone-active first, and counts people rather than rows", async () => {
    await openBuilder();

    const groups = screen
      .getAllByRole("button")
      .map((button) => button.textContent)
      .filter((label) => label?.includes("active"));

    // Brian asked for everyone first, and for the counts to be people: the
    // fixture holds five rows for four humans, and the button says four.
    expect(groups[0]).toBe("Everyone active (4)");
    expect(groups).toContain("All active players (3)");
    expect(groups).toContain("All active coaches (1)");
    expect(groups).toContain("All active committee (1)");
  });

  it("lights a group when its people are all in, and clears it when pressed again", async () => {
    await openBuilder();

    const everyone = screen.getByRole("button", { name: "Everyone active (4)" });
    expect(everyone).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(everyone);
    expect(everyone).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("review-selection").textContent).toBe("Review 4 selected");

    fireEvent.click(everyone);
    expect(everyone).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("review-selection").textContent).toBe("Review 0 selected");
  });

  it("stops claiming a group is in when one of its people is unticked", async () => {
    await openBuilder();

    fireEvent.click(screen.getByRole("button", { name: "All active players (3)" }));
    expect(screen.getByRole("button", { name: "All active players (3)" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Include Avery Fielding as Player" }));

    expect(screen.getByRole("button", { name: "All active players (3)" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByTestId("review-selection").textContent).toBe("Review 2 selected");
  });

  it("stays lit when reopened from a saved audience", async () => {
    // The bug this catches, found in the browser and by nothing else: a saved
    // audience holds ONE key per person, and "Everyone active" spans several
    // keys for anybody holding two capacities. Comparing keys rather than people
    // left the button dark while every one of its people was already invited.
    const everyone = SAVED_EVERYONE.map((member) => `${member.capacity}:${member.anchorId}`);
    givenAudience(AUDIENCE, undefined, SAVED_EVERYONE);
    vi.mocked(readEvent).mockResolvedValue(detail());

    render(await EventDetailPage(detailProps({ step: "audience" })));

    expect(everyone).toHaveLength(4);
    expect(screen.getByTestId("review-selection").textContent).toBe("Review 4 selected");
    expect(screen.getByRole("button", { name: "Everyone active (4)" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("undoing a narrower group keeps somebody another group put there", async () => {
    // The defect independent review found, and the reason the test that used to
    // sit here could not find it: it pressed "Everyone active", the one group
    // whose keys cover every selected key, so removing by person and removing by
    // key are indistinguishable there.
    //
    // Morgan Pike is an active player AND on the committee. The players group
    // put them in; undoing the committee group must not take them out.
    await openBuilder();

    fireEvent.click(screen.getByRole("button", { name: "All active players (3)" }));
    expect(screen.getByTestId("review-selection").textContent).toBe("Review 3 selected");

    fireEvent.click(screen.getByRole("button", { name: "All active committee (1)" }));
    expect(screen.getByTestId("review-selection").textContent).toBe("Review 3 selected");

    fireEvent.click(screen.getByRole("button", { name: "All active committee (1)" }));

    expect(screen.getByTestId("review-selection").textContent).toBe("Review 3 selected");
    expect(screen.getByRole("checkbox", { name: "Include Morgan Pike as Player" })).toBeChecked();
  });

  it("never shrinks the audience when an already-lit group is pressed", async () => {
    // The one-press variant, which needs no undo at all.
    //
    // Casey North is the only coach and is not a player, so selecting the
    // players leaves the coaches button dark. The committee button is the one
    // that lights, because its sole member Morgan Pike IS a selected player —
    // and pressing a lit button must never subtract.
    await openBuilder();

    fireEvent.click(screen.getByRole("button", { name: "All active players (3)" }));
    const before = screen.getByTestId("review-selection").textContent;

    expect(screen.getByRole("button", { name: "All active committee (1)" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "All active committee (1)" }));

    expect(screen.getByTestId("review-selection").textContent).toBe(before);
    for (const name of ["Avery Fielding", "Samira Quinn", "Morgan Pike"]) {
      expect(screen.getByRole("checkbox", { name: `Include ${name} as Player` })).toBeChecked();
    }
  });

  it("clears the whole selection when everyone-active is un-pressed", async () => {
    givenAudience(AUDIENCE, undefined, SAVED_EVERYONE);
    vi.mocked(readEvent).mockResolvedValue(detail());

    render(await EventDetailPage(detailProps({ step: "audience" })));

    // The case the old test covered, kept: for this one group, its keys are all
    // the keys, so pressing it does clear everything.
    fireEvent.click(screen.getByRole("button", { name: "Everyone active (4)" }));

    expect(screen.getByTestId("review-selection").textContent).toBe("Review 0 selected");
    for (const box of screen.getAllByRole("checkbox")) {
      expect(box).not.toBeChecked();
    }
  });

  it("counts one person holding two capacities once", async () => {
    await openBuilder();

    // Morgan Pike is an active player and the Secretary. One invitation.
    fireEvent.click(screen.getByRole("button", { name: "Everyone active (4)" }));

    expect(screen.getByTestId("review-selection").textContent).toBe("Review 4 selected");
    // And no sentence explaining the arithmetic — Brian removed it.
    expect(screen.queryByTestId("dedupe-note")).toBeNull();
    expect(flatten(screen.getByTestId("audience-builder").textContent)).not.toContain(
      "selections resolve to",
    );
  });

  it("sorts the chosen people to the top", async () => {
    await openBuilder();

    const names = () =>
      screen
        .getAllByRole("checkbox")
        .map((box) => box.getAttribute("aria-label") ?? "")
        .map((label) => label.replace(/^Include /, "").replace(/ as .*$/, ""));

    expect(names()[0]).toBe("Avery Fielding");

    // Ticking somebody further down moves them to the front, which is both the
    // review order Brian asked for and the feedback that the tick registered.
    fireEvent.click(screen.getByRole("checkbox", { name: "Include Samira Quinn as Player" }));
    expect(names()[0]).toBe("Samira Quinn");
  });

  it("searches by name, role and contact", async () => {
    await openBuilder();

    fireEvent.change(screen.getByLabelText("Search name, role or contact"), {
      target: { value: "casey" },
    });
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);

    fireEvent.change(screen.getByLabelText("Search name, role or contact"), {
      target: { value: "Head Coach" },
    });
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);

    fireEvent.change(screen.getByLabelText("Search name, role or contact"), {
      target: { value: "nobody at all" },
    });
    expect(screen.getByTestId("no-candidates")).toBeVisible();
  });

  it("posts exactly the ticked people to be saved", async () => {
    await openBuilder();
    fireEvent.click(screen.getByRole("button", { name: "All active players (3)" }));

    const posted = [...document.querySelectorAll('input[name="audienceKey"]')].map(
      (input) => (input as HTMLInputElement).value,
    );
    expect(posted.sort()).toEqual(
      [
        "player:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
        "player:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
        "player:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
      ].sort(),
    );
  });
});

describe("UX-42 — an empty audience is refused before anything is written", () => {
  it("shows the refusal rather than the confirmation", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail());
    givenAudience(AUDIENCE, undefined, []);

    render(await EventDetailPage(detailProps({ step: "review" })));

    const refusal = screen.getByTestId("empty-audience-refusal");
    expect(flatten(refusal.textContent)).toContain("The resolved audience is empty");
    expect(flatten(refusal.textContent)).toContain("No invitations or notification jobs");
    expect(flatten(refusal.textContent)).toContain(
      "Approval is refused on the server even if this screen is bypassed",
    );
    expect(screen.queryByRole("button", { name: "Approve event" })).toBeNull();
    expect(screen.getByRole("link", { name: "Build audience" })).toBeVisible();
  });
});

describe("UX-41 — confirming exactly who will be asked", () => {
  async function reachReview(
    audience: AudienceMember[] = SAVED_AUDIENCE,
    deadline?: Parameters<typeof givenAudience>[1],
  ) {
    vi.mocked(readEvent).mockResolvedValue(detail());
    givenAudience(AUDIENCE, deadline, audience);
    return render(await EventDetailPage(detailProps({ step: "review" })));
  }

  it("names every invitee, with the capacity each is invited in", async () => {
    await reachReview();

    const list = within(screen.getByTestId("resolved-audience"));
    expect(list.getByText("Avery Fielding")).toBeVisible();
    expect(list.getByText("Samira Quinn")).toBeVisible();
    expect(list.getByText("Casey North")).toBeVisible();
    expect(list.getAllByText("Player")).toHaveLength(2);
    expect(list.getAllByText("Coach")).toHaveLength(1);

    expect(flatten(screen.getByTestId("audience-total").textContent)).toBe("3Confirmed audience");
  });

  it("shows the deadline the club's rule produces, in Oxford's own time", async () => {
    await reachReview();

    // 12 October 2026 at 17:00Z is 18:00 in British Summer Time — the case a
    // UTC-rendered deadline would show an hour early for half a season.
    expect(flatten(screen.getByTestId("deadline-fact").textContent)).toContain(
      "Monday, 12 October 2026 at 18:00",
    );
  });

  it("warns that responses are due immediately when the deadline has passed", async () => {
    await reachReview(SAVED_AUDIENCE, {
      at: new Date("2026-10-17T09:00:00Z"),
      configuredAt: new Date("2026-10-16T17:00:00Z"),
      clamped: true,
    });

    const deadline = flatten(screen.getByTestId("deadline-fact").textContent);
    expect(deadline).toContain("Due immediately");
    expect(deadline).toContain("has already passed");
  });

  it("shows no deadline at all for an event that asks for no response", async () => {
    await reachReview(SAVED_AUDIENCE, null);

    const deadline = flatten(screen.getByTestId("deadline-fact").textContent);
    expect(deadline).toContain("No deadline");
    expect(deadline).toContain("nothing expires");
  });

  it("says somebody has gone inactive, and that they will still be invited", async () => {
    await reachReview([
      ...SAVED_AUDIENCE,
      member({
        anchorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9",
        personId: "pppppppp-pppp-4ppp-8ppp-ppppppppppp9",
        displayName: "Gone Away",
        standing: "No longer listed",
        stillSelectable: false,
      }),
    ]);

    // Brian's ruling: the confirmed list is honoured as-is. So this is
    // information, not an obstacle — and the approve button stays.
    expect(flatten(screen.getByTestId("stale-audience-note").textContent)).toContain(
      "no longer active. They will still be invited",
    );
    expect(flatten(screen.getByTestId("audience-defects").textContent)).toBe("1No longer active");
    expect(screen.getByRole("button", { name: "Approve event" })).toBeEnabled();
  });

  it("says delivery is automated and begins only after approval", async () => {
    await reachReview();

    const text = flatten(screen.getByTestId("approval-review").textContent);
    expect(text).toContain("Automated 1:1 WhatsApp");
    expect(text).toContain("Begins only after approval");
    // Manual posting is never this slice's delivery path, and the screen must
    // not offer it as one.
    expect(text.toLowerCase()).not.toContain("copy");
    expect(text.toLowerCase()).not.toContain("paste");
  });

  it("does not explain what approving does", async () => {
    // Brian, 2026-08-21: "You don't really have to explain what approving does
    // because we already know what it is ... That's over-explaining for no
    // reason." The paragraph about confirming the list, creating invitations,
    // queueing delivery and freezing the audience is gone, and nothing replaced
    // it. The screen shows what is being approved; the button says what it does.
    await reachReview();

    const review = flatten(screen.getByTestId("approval-review").textContent);
    expect(review).not.toContain("The audience is frozen once approved");
    expect(review).not.toContain("Approval is limited to the designated approver");
    expect(review).not.toContain("queues automated delivery");
  });

  it("posts the event and no audience at all", async () => {
    await reachReview();

    // The audience is already stored, so there is no list for a browser to
    // alter between confirming and approving.
    expect(screen.getByRole("button", { name: "Approve event" })).toBeEnabled();
    expect(document.querySelectorAll('input[name="audienceKey"]')).toHaveLength(0);
    expect(
      within(screen.getByTestId("approve-form")).getByDisplayValue(EVENT_ID),
    ).toBeInTheDocument();
  });

  it("offers a way back to the builder", async () => {
    await reachReview();

    expect(screen.getByRole("link", { name: "Back to audience" })).toHaveAttribute(
      "href",
      `/operate/events/${EVENT_ID}?step=audience`,
    );
  });
});

describe("UX-43 — the event is approved", () => {
  function approved() {
    return detail({ status: "approved", audienceCount: 3, invitationCount: 3 });
  }

  it("reports what now exists, and that none of it has been delivered", async () => {
    vi.mocked(readEvent).mockResolvedValue(approved());
    vi.mocked(readEventAudience).mockResolvedValue(SAVED_AUDIENCE);

    render(await EventDetailPage(detailProps({ approved: "1" })));

    const note = flatten(screen.getByTestId("event-approved-note").textContent);
    expect(note).toContain("Event approved — 3 invitations created");
    expect(note).toContain("queued job waiting for automated delivery");

    expect(flatten(screen.getByTestId("audience-fact").textContent)).toContain("3 confirmed");
    expect(flatten(screen.getByTestId("distribution-fact").textContent)).toContain(
      "nothing delivered yet",
    );
  });

  it("names who was invited, which is the question an approved event raises", async () => {
    vi.mocked(readEvent).mockResolvedValue(approved());
    vi.mocked(readEventAudience).mockResolvedValue(SAVED_AUDIENCE);

    render(await EventDetailPage(detailProps()));

    const list = within(screen.getByTestId("event-audience"));
    expect(list.getByText("Avery Fielding")).toBeVisible();
    expect(list.getByText("Casey North")).toBeVisible();
  });

  it("offers no way to change the audience afterwards", async () => {
    vi.mocked(readEvent).mockResolvedValue(approved());
    vi.mocked(readEventAudience).mockResolvedValue(SAVED_AUDIENCE);

    render(await EventDetailPage(detailProps({ approved: "1" })));

    // The freeze, as an absence rather than as a sentence: LAN-77 ships no
    // post-approval audience edit, no late addition and no resend.
    expect(screen.queryByRole("link", { name: /audience/i })).toBeNull();
    expect(screen.queryByTestId("audience-builder")).toBeNull();
    expect(readApprovalPreview).not.toHaveBeenCalled();
  });

  it("does not congratulate somebody merely visiting an approved event", async () => {
    vi.mocked(readEvent).mockResolvedValue(approved());
    vi.mocked(readEventAudience).mockResolvedValue(SAVED_AUDIENCE);

    render(await EventDetailPage(detailProps()));

    expect(screen.queryByTestId("event-approved-note")).toBeNull();
  });
});

/**
 * W7-01, W7-02 and W7-04 on the operator's own event page — LAN-157.
 *
 * The table's own behaviour is proved in `src/app/participation/screens.test.tsx`
 * and its payload against the database in
 * `src/lib/services/participation.test.ts`. What is under test here is the
 * **wiring**: that the page reads it, renders it in place of the audience list
 * once there are invitations, and offers the share control.
 */
describe("the participation table on the event page", () => {
  const PARTICIPATION: OperatorParticipation = {
    tier: "operator",
    event: {
      id: EVENT_ID,
      name: "Team practice",
      status: "approved",
      eventType: "practice",
      scheduledOn: "2027-02-17",
      startsAt: "20:00:00",
      endsAt: "22:30:00",
      venue: "Iffley Road Astro",
      deliveryMode: "in_person",
      description: null,
      requiredEquipment: null,
      isMandatory: true,
      termLabel: null,
      weekNumber: null,
      joiningUrl: null,
    },
    questions: [],
    people: [
      {
        key: "player:1",
        displayName: "Avery Fielding",
        capacity: "player",
        isWalkUp: false,
        invitedAt: "2027-02-15T18:00:00.000Z",
        answer: "yes",
        reason: null,
        presence: "absent",
        discrepancy: "said_yes_marked_absent",
        answers: {},
        delivery: "delivered",
      },
    ],
    headline: { invited: 1, saidYes: 1, showed: 0, registerSaved: true },
  };

  function approvedWithInvitations() {
    return detail({ status: "approved", audienceCount: 3, invitationCount: 3 });
  }

  it("replaces the audience list once there are invitations to describe", async () => {
    vi.mocked(readEvent).mockResolvedValue(approvedWithInvitations());
    vi.mocked(readEventAudience).mockResolvedValue(SAVED_AUDIENCE);
    vi.mocked(readOperatorParticipation).mockResolvedValue(PARTICIPATION);

    render(await EventDetailPage(detailProps()));

    // W7: "the audience list becomes the full table."
    expect(screen.getByTestId("participation-table")).toBeVisible();
    expect(screen.queryByTestId("event-audience")).toBeNull();
    expect(screen.getByTestId("participation-table").getAttribute("data-tier")).toBe("operator");
    expect(screen.getAllByText("Delivered").length).toBeGreaterThan(0);
  });

  it("keeps the audience list for a draft, which has no table to show", async () => {
    // The counterweight: a draft carries an audience and no invitations, so
    // there is nothing to put in the answer and attendance columns.
    vi.mocked(readEvent).mockResolvedValue(detail({ audienceCount: 3 }));
    vi.mocked(readEventAudience).mockResolvedValue(SAVED_AUDIENCE);
    vi.mocked(readOperatorParticipation).mockResolvedValue(null as never);

    render(await EventDetailPage(detailProps()));

    expect(screen.getByTestId("event-audience")).toBeVisible();
    expect(screen.queryByTestId("participation-table")).toBeNull();
    expect(readOperatorParticipation).not.toHaveBeenCalled();
  });
});

describe("sharing the club link — W7-04", () => {
  function approvedEvent() {
    return detail({ status: "approved", audienceCount: 3, invitationCount: 0 });
  }

  it("offers Share link on an approved event and not on a draft", async () => {
    vi.mocked(readEvent).mockResolvedValue(approvedEvent());
    vi.mocked(readEventAudience).mockResolvedValue(SAVED_AUDIENCE);
    const approved = render(await EventDetailPage(detailProps()));
    expect(approved.getByTestId("share-link-button")).toBeVisible();
    approved.unmount();

    // A draft has no participation table to share.
    vi.mocked(readEvent).mockResolvedValue(detail({ audienceCount: 3 }));
    const draft = render(await EventDetailPage(detailProps()));
    expect(draft.queryByTestId("share-link-button")).toBeNull();
  });

  it("shows the link, and creates nothing by being opened", async () => {
    vi.mocked(readEvent).mockResolvedValue(approvedEvent());
    vi.mocked(readEventAudience).mockResolvedValue(SAVED_AUDIENCE);
    vi.mocked(readEventClubLink).mockResolvedValue({ linkId: "link-1", token: "a-token" });
    vi.stubEnv("APP_BASE_URL", "https://club.example");
    vi.stubEnv("CLUB_LINK_SECRET", "a-signing-key-long-enough-to-be-accepted");

    render(await EventDetailPage(detailProps({ share: "1" })));

    expect(screen.getByTestId("club-link-url").textContent).toBe("https://club.example/e/a-token");
    // Reading is reading: opening the dialog must not mint a token.
    expect(issueEventClubLink).not.toHaveBeenCalled();
    expect(screen.queryByTestId("issue-club-link")).toBeNull();
    vi.unstubAllEnvs();
  });

  it("offers to create one when there is none, rather than showing an empty box", async () => {
    vi.mocked(readEvent).mockResolvedValue(approvedEvent());
    vi.mocked(readEventAudience).mockResolvedValue(SAVED_AUDIENCE);
    vi.mocked(readEventClubLink).mockResolvedValue(null);
    vi.stubEnv("CLUB_LINK_SECRET", "a-signing-key-long-enough-to-be-accepted");

    render(await EventDetailPage(detailProps({ share: "1" })));

    expect(screen.getByTestId("issue-club-link")).toBeVisible();
    expect(screen.queryByTestId("club-link-url")).toBeNull();
    vi.unstubAllEnvs();
  });

  it("says a deployment that cannot sign cannot sign, as content and not an error", async () => {
    // `docs/ux/standards.md` rule 6: a guard firing correctly is not an error
    // page. And the control that would fail is not offered.
    vi.mocked(readEvent).mockResolvedValue(approvedEvent());
    vi.mocked(readEventAudience).mockResolvedValue(SAVED_AUDIENCE);
    vi.mocked(readEventClubLink).mockResolvedValue(null);
    vi.stubEnv("CLUB_LINK_SECRET", "");

    render(await EventDetailPage(detailProps({ share: "1" })));

    expect(flatten(screen.getByTestId("share-blocked").textContent)).toContain(
      "CLUB_LINK_SECRET is not set",
    );
    expect(screen.queryByTestId("issue-club-link")).toBeNull();
    vi.unstubAllEnvs();
  });

  it("says what a holder of the link can do, and does not justify the design", async () => {
    vi.mocked(readEvent).mockResolvedValue(approvedEvent());
    vi.mocked(readEventAudience).mockResolvedValue(SAVED_AUDIENCE);
    vi.mocked(readEventClubLink).mockResolvedValue({ linkId: "link-1", token: "a-token" });
    vi.stubEnv("APP_BASE_URL", "https://club.example");
    vi.stubEnv("CLUB_LINK_SECRET", "a-signing-key-long-enough-to-be-accepted");

    render(await EventDetailPage(detailProps({ share: "1" })));

    const panel = flatten(screen.getByTestId("share-panel").textContent);
    expect(panel).toContain("Anyone with this link can see who was asked");
    expect(panel).toContain("cannot change anything and do not need an account");
    // The mockup's second paragraph is D81's reasoning, and Brian has rejected
    // that copy shape five times on this mission.
    expect(panel).not.toMatch(/not a secret/i);
    expect(panel).not.toMatch(/prerogative/i);
    // There is no send-to-WhatsApp: the club cannot message groups.
    expect(panel).not.toMatch(/whatsapp/i);
    vi.unstubAllEnvs();
  });
});

describe("a draft that already carries an audience", () => {
  it("shows who it is for, and that nothing has been sent", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail({ audienceCount: 3 }));
    vi.mocked(readEventAudience).mockResolvedValue(SAVED_AUDIENCE);

    render(await EventDetailPage(detailProps()));

    expect(flatten(screen.getByTestId("audience-fact").textContent)).toContain(
      "3 chosen, not yet approved",
    );
    expect(within(screen.getByTestId("event-audience")).getByText("Avery Fielding")).toBeVisible();
    expect(screen.getByRole("link", { name: "Review audience and approve" })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// LAN-154 — questions, deleting a draft, duplicating one, and the review's shape
// ---------------------------------------------------------------------------

describe("the questions an event asks are read on its page (amendment W4-A1)", () => {
  it("shows each one as a player will meet it", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail());
    vi.mocked(readEventQuestions).mockResolvedValue([
      {
        id: "q1",
        prompt: "Can you get yourself to the ground?",
        answerType: "boolean",
        choices: null,
        isRequired: true,
        sortOrder: 0,
        fromTemplate: true,
      },
      {
        id: "q2",
        prompt: "Which shirt size?",
        answerType: "choice",
        choices: ["S", "M", "L"],
        isRequired: false,
        sortOrder: 1,
        fromTemplate: false,
      },
    ]);

    render(await EventDetailPage(detailProps()));

    const panel = flatten(screen.getByTestId("event-questions").textContent);
    expect(panel).toContain("Can you get yourself to the ground?");
    expect(panel).toContain("Required");
    expect(panel).toContain("S · M · L");
  });

  it("says an event asks nothing extra, rather than showing an empty list", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail());

    render(await EventDetailPage(detailProps()));

    expect(screen.getByTestId("no-event-questions")).toBeVisible();
  });
});

describe("the type's template fills the form in, field by field (D40-D47)", () => {
  /** Two templates that disagree about everything the form inherits. */
  function twoTemplates() {
    vi.mocked(readEventFormDefaults).mockResolvedValue(
      Object.fromEntries(
        EVENT_TYPES.map((type) => [
          type,
          type === "practice"
            ? formDefaults({
                venue: "Iffley Road Astro",
                description: "Full contact.",
                requiredEquipment: "Gumshield",
                attendance: "mandatory",
                questions: [
                  {
                    prompt: "Bringing a gumshield?",
                    answerType: "boolean",
                    required: "optional",
                    choices: "",
                    fromTemplate: "true",
                  },
                ],
              })
            : type === "social"
              ? formDefaults({
                  venue: "The Kings Arms",
                  description: "Come along.",
                  requiredEquipment: "",
                  attendance: "optional",
                  questions: [
                    {
                      prompt: "Eating?",
                      answerType: "boolean",
                      required: "optional",
                      choices: "",
                      fromTemplate: "true",
                    },
                  ],
                })
              : formDefaults(),
        ]),
      ),
    );
  }

  /** Switches the Type control the way an operator does. */
  function chooseType(label: string) {
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Type" }));
    fireEvent.click(screen.getByRole("option", { name: label }));
  }

  function valueOf(name: string): string {
    return (
      document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`)?.value ??
      ""
    );
  }

  it("opens a blank create form on its type's template", async () => {
    twoTemplates();

    render(await NewEventPage(newProps()));

    expect(valueOf("venue")).toBe("Iffley Road Astro");
    expect(valueOf("requiredEquipment")).toBe("Gumshield");
  });

  it("swaps every untouched field when the type changes", async () => {
    twoTemplates();
    render(await NewEventPage(newProps()));

    chooseType("Social");

    expect(valueOf("venue")).toBe("The Kings Arms");
    expect(valueOf("description")).toBe("Come along.");
    expect(valueOf("requiredEquipment")).toBe("");
  });

  it("keeps a field the operator wrote, which is D41's whole point", async () => {
    // Picking the wrong type first must not cost somebody the description they
    // have just written.
    twoTemplates();
    render(await NewEventPage(newProps()));
    fireEvent.change(screen.getByRole("textbox", { name: /Description/ }), {
      target: { value: "Walkthrough only — the pitch is frozen." },
    });

    chooseType("Social");

    expect(valueOf("description")).toBe("Walkthrough only — the pitch is frozen.");
    // …while the fields nobody touched still move.
    expect(valueOf("venue")).toBe("The Kings Arms");
  });

  it("swaps the template's questions and keeps the operator's own", async () => {
    // D42: a question that came with the type leaves with it; one the operator
    // wrote is theirs.
    twoTemplates();
    render(await NewEventPage(newProps()));
    fireEvent.click(screen.getByTestId("add-question"));
    const written = screen.getAllByRole("textbox", { name: /^Question$/ });
    fireEvent.change(written[written.length - 1], { target: { value: "Need a lift?" } });

    chooseType("Social");

    const prompts = [
      ...document.querySelectorAll<HTMLInputElement>('input[name="questionPrompt"]'),
    ].map((input) => input.value);
    expect(prompts).toContain("Need a lift?");
    expect(prompts).toContain("Eating?");
    expect(prompts).not.toContain("Bringing a gumshield?");
  });

  it("fills the end from the start and the type's default length (D78)", async () => {
    vi.mocked(readEventFormDefaults).mockResolvedValue(
      Object.fromEntries(EVENT_TYPES.map((type) => [type, formDefaults({ durationMinutes: 120 })])),
    );
    render(await NewEventPage(newProps()));

    fireEvent.change(document.querySelector('input[name="startsAt"]')!, {
      target: { value: "20:00" },
    });

    expect(valueOf("endsAt")).toBe("22:00");
  });

  it("leaves an end the operator set themselves", async () => {
    vi.mocked(readEventFormDefaults).mockResolvedValue(
      Object.fromEntries(EVENT_TYPES.map((type) => [type, formDefaults({ durationMinutes: 120 })])),
    );
    render(await NewEventPage(newProps()));

    fireEvent.change(document.querySelector('input[name="endsAt"]')!, {
      target: { value: "21:00" },
    });
    fireEvent.change(document.querySelector('input[name="startsAt"]')!, {
      target: { value: "20:00" },
    });

    expect(valueOf("endsAt")).toBe("21:00");
  });
});

describe("deleting a draft — REQ-delete-draft, D29", () => {
  it("offers Delete on the draft's own page", async () => {
    // Brian, 2026-08-21: "there should be a Delete Event button ... I don't know
    // where that button exists on this event."
    vi.mocked(readEvent).mockResolvedValue(detail());

    render(await EventDetailPage(detailProps()));

    expect(screen.getByTestId("open-delete-draft")).toBeVisible();
  });

  it("offers it nowhere on an approved event", async () => {
    // An approved event is cancelled, never deleted, because people have been
    // told about it. The rule is enforced in the service; this is the courtesy.
    vi.mocked(readEvent).mockResolvedValue(detail({ status: "approved" }));

    render(await EventDetailPage(detailProps()));

    expect(screen.queryByTestId("open-delete-draft")).toBeNull();
  });

  it("offers it nowhere on a cancelled event either", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail({ status: "cancelled" }));

    render(await EventDetailPage(detailProps()));

    expect(screen.queryByTestId("open-delete-draft")).toBeNull();
  });

  it("offers nothing to an operator who cannot manage the calendar", async () => {
    vi.mocked(resolveOperatorAccess).mockResolvedValue({
      state: "active",
      operator: operator(["treasurer"]),
    });
    vi.mocked(readEvent).mockResolvedValue(detail());

    render(await EventDetailPage(detailProps()));

    expect(screen.queryByTestId("open-delete-draft")).toBeNull();
  });

  it("confirms first, naming the event", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail());
    render(await EventDetailPage(detailProps()));

    fireEvent.click(screen.getByTestId("open-delete-draft"));

    expect(screen.getByTestId("delete-draft-dialog")).toBeVisible();
    expect(flatten(screen.getByTestId("delete-draft-name").textContent)).toBe("Wednesday practice");
  });

  it("says it cannot be brought back, and that nobody will be told", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail());
    render(await EventDetailPage(detailProps()));

    fireEvent.click(screen.getByTestId("open-delete-draft"));

    const dialog = flatten(screen.getByTestId("delete-draft-dialog").textContent);
    expect(dialog).toContain("cannot be brought back");
    expect(dialog).toContain("nobody will be told it is gone");
  });

  it("does not pre-announce the rule about approved events", async () => {
    // Brian, 2026-08-21: "That warning should pop up if you try to delete an
    // approved event ... I don't think it needs to be called out there
    // specifically." It belongs where somebody runs into it.
    vi.mocked(readEvent).mockResolvedValue(detail());
    render(await EventDetailPage(detailProps()));

    fireEvent.click(screen.getByTestId("open-delete-draft"));

    const dialog = flatten(screen.getByTestId("delete-draft-dialog").textContent).toLowerCase();
    expect(dialog).not.toContain("approved");
    expect(dialog).not.toContain("cancel");
  });

  it("offers a way out of the dialog that is not deleting", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail());
    render(await EventDetailPage(detailProps()));

    fireEvent.click(screen.getByTestId("open-delete-draft"));

    expect(screen.getByRole("button", { name: "Keep it" })).toBeEnabled();
  });

  it("posts only which event, so a browser cannot widen what is deleted", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail());
    render(await EventDetailPage(detailProps()));
    fireEvent.click(screen.getByTestId("open-delete-draft"));

    const form = screen.getByTestId("confirm-delete-draft").closest("form")!;
    const names = [...form.querySelectorAll("input")].map((input) => input.getAttribute("name"));
    expect(names).toEqual(["eventId"]);
  });
});

describe("duplicating an event — D39", () => {
  it("opens the create form prefilled, and writes nothing on the way", async () => {
    // Brian, 2026-08-22: duplicate opens the create form prefilled, and nothing
    // is written until the operator saves.
    vi.mocked(readEvent).mockResolvedValue(detail());

    render(await EventDetailPage(detailProps()));

    expect(screen.getByTestId("duplicate-event").getAttribute("href")).toBe(
      `/operate/events/new?from=${EVENT_ID}`,
    );
  });

  it("is offered on a past event too, which is the one usually worth copying", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail({ status: "approved" }));

    render(await EventDetailPage(detailProps()));

    expect(screen.getByTestId("duplicate-event")).toBeVisible();
  });

  it("carries the source's facts into the form, and never its date", async () => {
    // A duplicate is the next one of something. Carrying last Wednesday's date
    // over would be the one field guaranteed to be wrong.
    vi.mocked(readEvent).mockResolvedValue(
      detail({ name: "vs Bath", venue: "Iffley Road Astro", scheduledOn: "2026-10-14" }),
    );

    const { container } = render(await NewEventPage(newProps({ from: EVENT_ID })));

    expect(container.querySelector<HTMLInputElement>('input[name="name"]')?.value).toBe("vs Bath");
    expect(container.querySelector<HTMLInputElement>('input[name="scheduledOn"]')?.value).toBe("");
    expect(flatten(screen.getByTestId("duplicated-from").textContent)).toContain("vs Bath");
  });

  it("opens an empty form when the source has since been deleted", async () => {
    // A link rendered before somebody deleted the draft is not a reason to
    // refuse a new event.
    vi.mocked(readEvent).mockRejectedValue(
      new NotFound("That event no longer exists.", { rule: "event_not_found" }),
    );

    const { container } = render(await NewEventPage(newProps({ from: EVENT_ID })));

    expect(container.querySelector<HTMLInputElement>('input[name="name"]')?.value).toBe("");
    expect(screen.queryByTestId("duplicated-from")).toBeNull();
  });
});

describe("the approval review leads with the audience's shape", () => {
  it("names the groups before the people, with the headcount", async () => {
    // Brian, 2026-08-21: "it should say at the very top what groups it would be
    // ... You don't have to show me how it's done."
    vi.mocked(readEvent).mockResolvedValue(detail());
    givenAudience(AUDIENCE, undefined, SAVED_AUDIENCE);

    render(await EventDetailPage(detailProps({ step: "review" })));

    const shape = flatten(screen.getByTestId("audience-shape").textContent);
    expect(shape).toContain("Who will be asked");
    expect(shape).toMatch(/\d+ (person|people)/);
  });

  it("puts the shape above the names, not instead of them", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail());
    givenAudience(AUDIENCE, undefined, SAVED_AUDIENCE);

    const { container } = render(await EventDetailPage(detailProps({ step: "review" })));

    const html = container.innerHTML;
    expect(html.indexOf('data-testid="audience-shape"')).toBeLessThan(
      html.indexOf('data-testid="resolved-audience"'),
    );
    expect(
      within(screen.getByTestId("resolved-audience")).getByText("Avery Fielding"),
    ).toBeVisible();
  });
});
