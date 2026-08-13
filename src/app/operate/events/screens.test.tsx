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
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  usePathname: () => "/operate/events",
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("../../login/actions", () => ({ signOut: vi.fn() }));
vi.mock("@/lib/services/events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/events")>();
  return {
    ...actual,
    listCurrentSeasonEvents: vi.fn(),
    readEvent: vi.fn(),
    createEventDraft: vi.fn(),
    updateEventDraft: vi.fn(),
    submitEventForApproval: vi.fn(),
    withdrawEventSubmission: vi.fn(),
    abandonEventDraft: vi.fn(),
  };
});
vi.mock("@/lib/services/seasons", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/seasons")>();
  return { ...actual, listTerms: vi.fn(), listTermWindows: vi.fn(), readCurrentSeason: vi.fn() };
});

import { NotFound } from "@/lib/db";
import { resolveOperatorAccess, type ResolvedOperator } from "@/lib/auth/operator";
import {
  listCurrentSeasonEvents,
  readEvent,
  type EventDetail,
  type EventListEntry,
} from "@/lib/services/events";
import { listTermWindows } from "@/lib/services/seasons";
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
    venue: "Iffley Road Astro",
    isMandatory: true,
    solicitsResponse: true,
    audienceCount: 0,
    invitationCount: 0,
    responseCount: 0,
    ...overrides,
  };
}

function detail(overrides: Partial<EventDetail> = {}): EventDetail {
  return {
    ...listEntry(),
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

function listProps(query: Record<string, string> = {}) {
  return {
    params: Promise.resolve({}),
    searchParams: Promise.resolve(query),
  } as unknown as PageProps<"/operate/events">;
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveOperatorAccess).mockResolvedValue({ state: "active", operator: operator() });
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
});

function givenList(events: EventListEntry[], totalInSeason = events.length) {
  vi.mocked(listCurrentSeasonEvents).mockResolvedValue({
    season: { id: "season", label: "2026-27", status: "active" },
    events,
    totalInSeason,
  });
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

  it("shows date, type, status and whether a response is solicited", async () => {
    givenList([listEntry()]);

    const { container } = render(await EventsPage(listProps()));
    const text = flatten(container.textContent);

    expect(text).toContain("Wednesday practice");
    expect(text).toContain("Wed 14 Oct, 20:00");
    expect(text).toContain("Iffley Road Astro");
    expect(text).toContain("Draft");
    expect(text).toContain("Practice");
    expect(text).toContain("Response requested");
  });

  it("keeps the status on the phone card, which the operator needs at 375px", async () => {
    givenList([listEntry({ status: "pending_approval" })]);

    render(await EventsPage(listProps()));

    const card = screen.getByTestId("event-card");
    expect(flatten(card.textContent)).toContain("Pending approval");
  });

  it("says when a draft's audience arrives, rather than that it is missing", async () => {
    givenList([listEntry()]);

    const { container } = render(await EventsPage(listProps()));
    const text = flatten(container.textContent);

    expect(text).toContain("Chosen at approval");
    expect(text).not.toContain("Not resolved");
    expect(flatten(screen.getByTestId("audience-note").textContent)).toContain(
      "chosen and confirmed during approval",
    );
  });

  it("counts an approved event's audience", async () => {
    givenList([listEntry({ status: "approved", audienceCount: 42, invitationCount: 42 })]);

    const { container } = render(await EventsPage(listProps()));

    expect(flatten(container.textContent)).toContain("42 invited");
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

  it("offers sorting by date, event, venue and status, in the query string", async () => {
    givenList([listEntry()]);

    render(await EventsPage(listProps()));

    for (const column of ["date", "name", "venue", "status"]) {
      const header = screen
        .getAllByRole("link")
        .find((link) => link.getAttribute("href")?.includes(`sort=${column}`));
      expect(header, `no sortable header for ${column}`).toBeDefined();
    }
  });

  it("flips the direction of the column already sorted, and keeps the filter", async () => {
    givenList([listEntry()]);

    render(await EventsPage(listProps({ sort: "date", dir: "desc", q: "practice" })));

    const dateHeader = screen
      .getAllByRole("link")
      .find((link) => link.getAttribute("href")?.includes("sort=date"));
    expect(dateHeader?.getAttribute("href")).toContain("dir=asc");
    expect(dateHeader?.getAttribute("href")).toContain("q=practice");
  });

  it("has no Apply button — a filter applies when it changes", async () => {
    givenList([listEntry()]);

    render(await EventsPage(listProps()));

    expect(screen.queryByRole("button", { name: "Apply" })).toBeNull();
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

    expect(vi.mocked(listCurrentSeasonEvents).mock.calls[0][0]).toEqual({
      search: "practice",
      status: "draft",
      eventType: "practice",
      sort: "date",
      direction: "desc",
    });
  });

  it("explains itself rather than crashing when no season is open", async () => {
    vi.mocked(listCurrentSeasonEvents).mockRejectedValue(new NotFound("No season is open."));

    render(await EventsPage(listProps()));

    expect(screen.getByTestId("events-unavailable").textContent).toBe("No season is open.");
  });
});

// ---------------------------------------------------------------------------
// UX-31
// ---------------------------------------------------------------------------

describe("UX-31 — creating an event", () => {
  it("carries the wireframe's heading and its draft boundary note", async () => {
    render(await NewEventPage());

    expect(screen.getByRole("heading", { name: "Create event" })).toBeVisible();
    expect(flatten(screen.getByTestId("draft-boundary-note").textContent)).toBe(
      "Draft events have no invitations, responses or attendance. Saving a draft does not " +
        "distribute anything.",
    );
  });

  it("makes the response-solicited choice explicit, with its meaning on screen", async () => {
    const { container } = render(await NewEventPage());

    const yes = container.querySelector<HTMLInputElement>(
      'input[name="solicitsResponse"][value="yes"]',
    );
    const no = container.querySelector<HTMLInputElement>(
      'input[name="solicitsResponse"][value="no"]',
    );

    expect(yes).not.toBeNull();
    expect(no).not.toBeNull();
    // Neither is preselected: the operator has to answer it.
    expect(yes?.checked).toBe(false);
    expect(no?.checked).toBe(false);

    expect(flatten(screen.getByTestId("solicits-meaning").textContent)).toContain(
      "asks its audience to answer",
    );
  });

  it("leaves attendance unanswered too, rather than defaulting it", async () => {
    const { container } = render(await NewEventPage());

    const checked = container.querySelectorAll('input[name="attendance"]:checked');
    expect(checked).toHaveLength(0);
  });

  it("offers only the event types this form can fully describe", async () => {
    const { container } = render(await NewEventPage());
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
    const { container } = render(await NewEventPage());

    expect(container.querySelector('[name="termId"]')).toBeNull();
    expect(container.querySelector('[name="weekNumber"]')).toBeNull();
    expect(container.querySelector('[name="origin"]')).toBeNull();
  });

  it("records who entered the event, without calling them its owner", async () => {
    const { container } = render(await NewEventPage());

    const createdBy = [...container.querySelectorAll("input")].find(
      (node) => node.value === "Rowan Ashdown",
    );
    expect(createdBy).toBeDefined();
    expect(createdBy?.readOnly).toBe(true);
    expect(flatten(container.textContent)).toContain("belongs to the club");
    expect(flatten(container.textContent)).not.toContain("Owner");
  });

  it("says the audience is chosen during approval", async () => {
    render(await NewEventPage());

    expect(flatten(screen.getByTestId("audience-comes-later").textContent)).toContain(
      "chosen and confirmed during the approval step",
    );
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
      "A draft or pending event can carry no invitations, responses or attendance. " +
        "Nothing is sent until the designated approver approves it.",
    );
    expect(flatten(screen.getByTestId("distribution-fact").textContent)).toContain(
      "Nothing distributed",
    );
    expect(flatten(screen.getByTestId("distribution-fact").textContent)).toContain(
      "No invitations or responses",
    );
  });

  it("says the audience is not resolved and is required before approval", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail());

    render(await EventDetailPage(detailProps()));

    const audience = flatten(screen.getByTestId("audience-fact").textContent);
    expect(audience).toContain("Chosen at approval");
    expect(audience).toContain("chosen and confirmed during the approval step");
  });

  it("offers submit, edit and abandon, and no approval", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail());

    render(await EventDetailPage(detailProps()));

    expect(screen.getByRole("button", { name: "Submit for approval" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Edit draft" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Abandon draft" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /approve event/i })).toBeNull();
  });

  it("shows the audience action as the unbuilt thing it is", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail());

    render(await EventDetailPage(detailProps()));

    expect(screen.getByRole("button", { name: "Build audience" })).toBeDisabled();
    expect(flatten(screen.getByTestId("audience-note").textContent)).toContain("LAN-77");
  });

  it("states both flags and the difference between them", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail({ isMandatory: false }));

    const { container } = render(await EventDetailPage(detailProps()));
    const text = flatten(container.textContent);

    expect(text).toContain("Optional");
    expect(text).toContain("Response requested");
    expect(flatten(screen.getByTestId("solicits-fact").textContent)).toContain(
      "asks its audience to answer",
    );
  });

  it("shows the date, term coordinates, origin and owner", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail());

    const { container } = render(await EventDetailPage(detailProps()));
    const text = flatten(container.textContent);

    expect(flatten(screen.getByTestId("event-subtitle").textContent)).toBe(
      "Draft · Wednesday, 14 October · 20:00–22:00",
    );
    expect(text).toContain("Michaelmas 2026-27 · Week 2");
    expect(flatten(screen.getByTestId("entered-by-fact").textContent)).toContain("Rowan Ashdown");
    expect(flatten(screen.getByTestId("entered-by-fact").textContent)).toContain(
      "Any calendar operator may edit this draft",
    );
    expect(flatten(screen.getByTestId("origin-fact").textContent)).toContain(
      "The club schedules this event itself",
    );
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

describe("UX-33 — an event submitted for approval", () => {
  it("confirms the submission and says nothing was distributed", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail({ status: "pending_approval" }));

    render(await EventDetailPage(detailProps({ submitted: "1" })));

    expect(screen.getByRole("heading", { name: "Event submitted for approval" })).toBeVisible();
    expect(flatten(screen.getByTestId("pending-boundary-note").textContent)).toBe(
      "Pending approval still has no invitations, responses or attendance. Withdrawal returns " +
        "the event to draft.",
    );
    expect(screen.getByRole("link", { name: "View pending event" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Withdraw submission" })).toBeVisible();
  });

  it("shows the event itself once the confirmation flag is gone", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail({ status: "pending_approval" }));

    render(await EventDetailPage(detailProps()));

    expect(screen.queryByRole("heading", { name: "Event submitted for approval" })).toBeNull();
    expect(screen.getByTestId("event-detail").dataset.status).toBe("pending_approval");
    expect(screen.getByRole("button", { name: "Withdraw submission" })).toBeVisible();
  });

  it("keeps the no-invitations statement while the event is pending", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail({ status: "pending_approval" }));

    render(await EventDetailPage(detailProps()));

    expect(screen.getByTestId("no-invitations-note")).toBeVisible();
  });

  it("offers neither edit nor submit while the event is pending", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail({ status: "pending_approval" }));

    render(await EventDetailPage(detailProps()));

    expect(screen.queryByRole("link", { name: "Edit draft" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Submit for approval" })).toBeNull();
  });

  it("does not claim a submission an approved event never made", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail({ status: "approved" }));

    render(await EventDetailPage(detailProps({ submitted: "1" })));

    expect(screen.queryByRole("heading", { name: "Event submitted for approval" })).toBeNull();
    expect(screen.getByTestId("event-detail").dataset.status).toBe("approved");
    expect(screen.queryByTestId("no-invitations-note")).toBeNull();
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
    expect(
      container.querySelector<HTMLInputElement>('input[name="solicitsResponse"][value="yes"]')
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
    vi.mocked(readEvent).mockResolvedValue(detail({ status: "pending_approval" }));

    render(await EditEventPage(editProps()));

    expect(flatten(screen.getByTestId("edit-refused").textContent)).toBe(
      "Only a draft can be edited. This event is pending approval.",
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
    expect(screen.queryByRole("button", { name: "Submit for approval" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Edit draft" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Abandon draft" })).toBeNull();
    expect(flatten(screen.getByTestId("read-only-note").textContent)).toContain(
      "President, Vice-President, Secretary and General Manager",
    );
  });

  it("is offered no withdrawal on a pending event", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail({ status: "pending_approval" }));

    render(await EventDetailPage(detailProps()));

    expect(screen.queryByRole("button", { name: "Withdraw submission" })).toBeNull();
  });

  it("is refused the editor outright, and told what it needs", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail());

    render(await EditEventPage(editProps()));

    expect(screen.getByTestId("operator-not-permitted")).toBeVisible();
    expect(flatten(screen.getByTestId("required-role").textContent)).toContain("President");
    expect(readEvent).not.toHaveBeenCalled();
  });

  it("is refused the create form, and told what it needs", async () => {
    render(await NewEventPage());

    expect(screen.getByTestId("operator-not-permitted")).toBeVisible();
    expect(flatten(screen.getByTestId("required-role").textContent)).toContain("General Manager");
  });

  it("is never told which roles it holds", async () => {
    const { container } = render(await NewEventPage());

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

      const editor = render(await NewEventPage());
      expect(editor.getByTestId("event-form")).toBeVisible();
      editor.unmount();

      render(await EventDetailPage(detailProps()));
      expect(screen.getByRole("button", { name: "Submit for approval" })).toBeEnabled();
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
    ["the editor", () => NewEventPage(), "%2Foperate%2Fevents"],
    ["the detail", () => EventDetailPage(detailProps()), "%2Foperate%2Fevents"],
    ["the edit view", () => EditEventPage(editProps()), "%2Foperate%2Fevents"],
  ])("%s redirects a request with no session", async (_name, page, encoded) => {
    vi.mocked(resolveOperatorAccess).mockResolvedValue({ state: "no_session" });

    await expect(page()).rejects.toThrow(`REDIRECT:/login?redirectTo=${encoded}`);
  });

  it.each([
    ["the list", () => EventsPage(listProps())],
    ["the editor", () => NewEventPage()],
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
