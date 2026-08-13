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
  return { ...actual, readApprovalPreview: vi.fn(), approveEvent: vi.fn() };
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
import { readApprovalPreview } from "@/lib/services/event-approval";
import type { AudienceCandidate } from "@/lib/services/audience-selection";
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
  routerPush.mockClear();
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
  givenAudience();
});

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
) {
  vi.mocked(readApprovalPreview).mockResolvedValue({
    event: detail(),
    catalogue: {
      candidates,
      counts: {
        player: candidates.filter((entry) => entry.capacity === "player").length,
        coach: candidates.filter((entry) => entry.capacity === "coach").length,
        committee: candidates.filter((entry) => entry.capacity === "committee").length,
      },
    },
    deadline: deadline ? { ...deadline, rule: { daysBefore: 2, atTime: "18:00" } } : null,
  });
}

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
    expect(text).toContain("Wed 14 Oct 2026, 20:00");
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

    it("navigates with the value that was chosen, not the one before it", async () => {
      givenList([listEntry()]);
      render(await EventsPage(listProps()));

      choose("Status", "Occurred");

      expect(routerPush).toHaveBeenCalledTimes(1);
      const url = routerPush.mock.calls[0][0] as string;
      expect(url).toContain("status=occurred");
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

  it("does not print the operator's own name back at them", async () => {
    const { container } = render(await NewEventPage());
    const text = flatten(container.textContent);

    expect(text).not.toContain("Owner");
    expect(text).not.toContain("Entered by");
    expect(text).not.toContain("Created by");
    expect([...container.querySelectorAll("input")].map((node) => node.value)).not.toContain(
      "Rowan Ashdown",
    );
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

  it("offers edit, abandon and the way in to approval", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail());

    render(await EventDetailPage(detailProps()));

    expect(screen.getByRole("link", { name: "Edit draft" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Abandon draft" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Choose audience and approve" })).toBeEnabled();

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

    expect(screen.queryByRole("button", { name: "Choose audience and approve" })).toBeNull();
    expect(screen.queryByTestId("audience-builder")).toBeNull();
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

describe("an event awaiting approval, which nothing here creates", () => {
  it("reads, and offers no action at all", async () => {
    // `pending_approval` stays in the enum and seeded rows use it, so the screen
    // still has to render one. Brian removed the step that produced it.
    vi.mocked(readEvent).mockResolvedValue(detail({ status: "pending_approval" }));

    render(await EventDetailPage(detailProps()));

    expect(screen.getByTestId("event-detail").dataset.status).toBe("pending_approval");
    expect(screen.queryByRole("button", { name: "Withdraw submission" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Edit draft" })).toBeNull();
    expect(flatten(screen.getByTestId("approval-note").textContent)).toContain(
      "Approval is not built yet",
    );
  });

  it("keeps the no-invitations statement while the event is pending", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail({ status: "pending_approval" }));

    render(await EventDetailPage(detailProps()));

    expect(screen.getByTestId("no-invitations-note")).toBeVisible();
  });
});

describe("a saved event is a draft, and there is nothing to submit", () => {
  it("offers edit and abandon, and no submission", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail());

    render(await EventDetailPage(detailProps()));

    expect(screen.getByRole("link", { name: "Edit draft" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Abandon draft" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Submit for approval" })).toBeNull();
    expect(screen.queryByRole("button", { name: /submit/i })).toBeNull();
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
    expect(screen.queryByRole("button", { name: "Choose audience and approve" })).toBeNull();
  });

  it("has no confirmation screen for a submission that cannot happen", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail({ status: "pending_approval" }));

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

// ---------------------------------------------------------------------------
// UX-40, UX-41, UX-42 and UX-43 — LAN-77
// ---------------------------------------------------------------------------

/** Opens the builder from the event detail, as an approver would. */
async function openBuilder() {
  vi.mocked(readEvent).mockResolvedValue(detail());
  const view = render(await EventDetailPage(detailProps()));
  fireEvent.click(screen.getByRole("button", { name: "Choose audience and approve" }));
  return view;
}

function selectionKeys(): string[] {
  return [...document.querySelectorAll('input[name="audienceKey"]')].map(
    (input) => (input as HTMLInputElement).value,
  );
}

describe("UX-40 — building the audience", () => {
  it("opens with nothing selected and no group applied", async () => {
    await openBuilder();

    expect(screen.getByTestId("audience-builder")).toBeVisible();
    expect(screen.getByTestId("review-selection").textContent).toBe("Review 0 selected");

    // The rule this screen exists to keep: no default, no silent whole roster.
    for (const box of screen.getAllByRole("checkbox")) {
      expect(box).not.toBeChecked();
    }
  });

  it("offers the derived groups with the number each one adds", async () => {
    await openBuilder();

    expect(screen.getByRole("button", { name: "All active players (3)" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "All active coaches (1)" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "All active committee (1)" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Everyone active (5)" })).toBeEnabled();
  });

  it("selects a whole group on one press, and clears it again", async () => {
    await openBuilder();

    fireEvent.click(screen.getByRole("button", { name: "All active players (3)" }));
    expect(screen.getByTestId("review-selection").textContent).toBe("Review 3 selected");

    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(screen.getByTestId("review-selection").textContent).toBe("Review 0 selected");
  });

  it("counts one person holding two capacities once, and says why", async () => {
    await openBuilder();

    // Morgan Pike is an active player and the Secretary. Both groups include
    // them; one invitation is what the club will send.
    fireEvent.click(screen.getByRole("button", { name: "Everyone active (5)" }));

    expect(screen.getByTestId("review-selection").textContent).toBe("Review 4 selected");
    expect(flatten(screen.getByTestId("dedupe-note").textContent)).toBe(
      "5 selections resolve to 4 people — somebody holds more than one capacity and is invited once.",
    );
  });

  it("adds an individual to a group without duplicating anybody", async () => {
    await openBuilder();

    fireEvent.click(screen.getByRole("button", { name: "All active players (3)" }));
    // Already inside the group — ticking them again must not add a second row.
    fireEvent.click(screen.getByRole("checkbox", { name: "Include Avery Fielding as Player" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Include Avery Fielding as Player" }));

    expect(screen.getByTestId("review-selection").textContent).toBe("Review 3 selected");
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
});

describe("UX-42 — an empty audience is refused before anything is written", () => {
  it("shows the refusal rather than the confirmation", async () => {
    await openBuilder();

    fireEvent.click(screen.getByTestId("review-selection"));

    const refusal = screen.getByTestId("empty-audience-refusal");
    expect(flatten(refusal.textContent)).toContain("The resolved audience is empty");
    expect(flatten(refusal.textContent)).toContain("No invitations or notification jobs");
    expect(flatten(refusal.textContent)).toContain(
      "Approval is refused on the server even if this screen is bypassed",
    );
    expect(screen.queryByRole("button", { name: "Approve event" })).toBeNull();
  });

  it("offers a way back to building", async () => {
    await openBuilder();
    fireEvent.click(screen.getByTestId("review-selection"));

    fireEvent.click(screen.getByRole("button", { name: "Build audience" }));
    expect(screen.getByTestId("audience-builder")).toBeVisible();
  });
});

describe("UX-41 — confirming exactly who will be asked", () => {
  async function reachReview() {
    await openBuilder();
    fireEvent.click(screen.getByRole("button", { name: "All active players (3)" }));
    fireEvent.click(screen.getByTestId("review-selection"));
  }

  it("names every invitee, with the capacity each is invited in", async () => {
    await reachReview();

    const list = within(screen.getByTestId("resolved-audience"));
    expect(list.getByText("Avery Fielding")).toBeVisible();
    expect(list.getByText("Samira Quinn")).toBeVisible();
    expect(list.getByText("Morgan Pike")).toBeVisible();
    expect(list.getAllByText("Player")).toHaveLength(3);

    expect(flatten(screen.getByTestId("audience-total").textContent)).toBe("3Confirmed audience");
    expect(flatten(screen.getByTestId("audience-defects").textContent)).toBe("0Audience defects");
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
    givenAudience(AUDIENCE, {
      at: new Date("2026-10-17T09:00:00Z"),
      configuredAt: new Date("2026-10-16T17:00:00Z"),
      clamped: true,
    });
    await reachReview();

    const deadline = flatten(screen.getByTestId("deadline-fact").textContent);
    expect(deadline).toContain("Due immediately");
    expect(deadline).toContain("has already passed");
  });

  it("shows no deadline at all for an event that asks for no response", async () => {
    givenAudience(AUDIENCE, null);
    await reachReview();

    const deadline = flatten(screen.getByTestId("deadline-fact").textContent);
    expect(deadline).toContain("No deadline");
    expect(deadline).toContain("nothing expires");
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

  it("states that the audience is frozen by approval", async () => {
    await reachReview();

    expect(flatten(screen.getByTestId("approval-review").textContent)).toContain(
      "The audience is frozen once approved",
    );
  });

  it("posts the confirmed selection, and only that", async () => {
    await reachReview();

    expect(screen.getByRole("button", { name: "Approve event" })).toBeEnabled();
    expect(selectionKeys().sort()).toEqual(
      [
        "player:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
        "player:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
        "player:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
      ].sort(),
    );
  });

  it("goes back to the builder without losing the selection", async () => {
    await reachReview();

    fireEvent.click(screen.getByRole("button", { name: "Back to audience" }));

    expect(screen.getByTestId("audience-builder")).toBeVisible();
    expect(screen.getByTestId("review-selection").textContent).toBe("Review 3 selected");
  });
});

describe("UX-43 — the event is approved", () => {
  function approved() {
    return detail({ status: "approved", audienceCount: 42, invitationCount: 42 });
  }

  it("reports what now exists, and that none of it has been delivered", async () => {
    vi.mocked(readEvent).mockResolvedValue(approved());

    render(await EventDetailPage(detailProps({ approved: "1" })));

    const note = flatten(screen.getByTestId("event-approved-note").textContent);
    expect(note).toContain("Event approved — 42 invitations created");
    expect(note).toContain("queued job waiting for automated delivery");

    expect(flatten(screen.getByTestId("audience-fact").textContent)).toContain("42 confirmed");
    expect(flatten(screen.getByTestId("distribution-fact").textContent)).toContain(
      "nothing delivered yet",
    );
  });

  it("offers no way to change the audience afterwards", async () => {
    vi.mocked(readEvent).mockResolvedValue(approved());

    render(await EventDetailPage(detailProps({ approved: "1" })));

    // The freeze, as an absence rather than as a sentence: LAN-77 ships no
    // post-approval audience edit, no late addition and no resend.
    expect(screen.queryByRole("button", { name: "Choose audience and approve" })).toBeNull();
    expect(screen.queryByTestId("audience-builder")).toBeNull();
    expect(readApprovalPreview).not.toHaveBeenCalled();
  });

  it("does not congratulate somebody merely visiting an approved event", async () => {
    vi.mocked(readEvent).mockResolvedValue(approved());

    render(await EventDetailPage(detailProps()));

    expect(screen.queryByTestId("event-approved-note")).toBeNull();
  });
});
