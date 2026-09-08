/**
 * The participation table and the club-link page — W7-01, W7-02, W7-03, W7-04.
 * LAN-157.
 *
 * ## Every control is driven, and the assertion is on what changed
 *
 * This mission has shipped five surfaces that looked right and were inert: a
 * dead status filter, a jump control that rewrote the address bar while
 * scrolling nothing, a browser check that read back its own keystroke, and a
 * guard that asserted against a string constant rather than the query that ran.
 * A test proving a handler fired would have passed every one of them.
 *
 * So each control below is driven and then the **rendered rows** are compared:
 * a filter is proved by the names that survive it, a sort by the order they
 * come out in, and the copy button by the value it put on the clipboard.
 *
 * ## Every negative assertion has a positive control
 *
 * "The club-link page has no Delivery column" is worthless alone — it passes on
 * a blank page. Each one is paired with the operator rendering of the same
 * data, which does have it.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));

const routerPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/operate/events/event-1",
  redirect: vi.fn(),
  notFound: vi.fn(),
}));
// R157C-B1. `next/link`'s own scroll-restoration control (`scroll={false}`) is
// a prop `<Link>` consumes internally — it never lands on the rendered `<a>`,
// so a DOM assertion on the real component cannot see it. This stand-in keeps
// every other prop (href, data-sort, style, children) exactly as the real
// `<Link>` renders them, and additionally surfaces `scroll` as `data-scroll`
// so the sort-links test below can prove the prop was actually passed rather
// than merely believing the source read correctly.
vi.mock("next/link", () => ({
  default: ({
    href,
    scroll,
    children,
    ...rest
  }: {
    href: string;
    scroll?: boolean;
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} data-scroll={String(scroll)} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/services/participation", () => ({
  readClubLinkParticipation: vi.fn(),
}));
// R157-B4. The club link is rate limited before its token is resolved, so the
// page reads request headers. Real limiter, mocked headers — the throttle is a
// behaviour under test below, not something stubbed out.
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// LAN-170. `recordOperatorAnswerAction` runs for real below — the same
// pattern the attendance screen's own suite uses — with only the session
// resolution and the database write stubbed. That proves the real action
// wires the dialog's `FormData` through correctly, which a mock of the action
// itself could not.
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("@/lib/services/rsvp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/rsvp")>();
  return { ...actual, recordOperatorRsvpResponse: vi.fn() };
});

import {
  EMPTY_FILTERS,
  type ClubLinkParticipation,
  type OperatorParticipation,
  type OperatorParticipationPerson,
  type ParticipationFilters,
  type ParticipationQuestion,
} from "@/lib/services/participation-view";
import { readClubLinkParticipation } from "@/lib/services/participation";
import {
  allowPublicLinkRequest,
  CLUB_LINK_MAX_PER_LINK,
  RATE_LIMIT_MAX_PER_LINK,
  resetRsvpRateLimit,
} from "@/lib/rsvp/public-surface";

import { labelFor, TYPE_LABELS } from "@/lib/services/event-vocabulary";
import { resolveOperatorAccess } from "@/lib/auth/operator";
import { recordOperatorRsvpResponse } from "@/lib/services/rsvp";
import { ConstraintViolated } from "@/lib/db/errors";

import ClubLinkPage from "../e/[token]/page";
import { EventFacts, HeadlineNumbers } from "./event-facts";
import { CopyLinkButton } from "./copy-link";
import { ParticipationFilterBar } from "./participation-filters";
import { ParticipationTable } from "./participation-table";
import { QuestionCounts } from "./question-counts";
import {
  ANSWER_NONE,
  CLUB_LINK_UNAVAILABLE_HEADLINE,
  DELIVERY_NOT_QUEUED,
  DISCREPANCY_LEGEND,
  DISCREPANCY_MARK,
  EVENT_QUESTIONS_HEADING,
  formatTermAndWeek,
  NO_MATCHING_PEOPLE,
  NOBODY_ASKED,
  NOT_RECORDED,
  NOTHING,
  REASON_PLACEHOLDER,
  RECORD_ANSWER,
  RESPONSE_NO_LABEL,
  RESPONSE_YES_LABEL,
  recordAnswerDialogTitle,
  recordAnswerEventSubtitle,
  SORTABLE_NOTE,
  TABLE_HEADINGS,
} from "./presentation";

const LIFT: ParticipationQuestion = {
  id: "11111111-1111-4111-8111-111111111111",
  prompt: "Lift?",
  answerType: "boolean",
  sortOrder: 0,
  appliesToCapacities: ["player", "coach", "committee", "guest", "recruit"],
};

const JOINING_URL = "https://teams.example.invalid/l/meetup-join/lan157";

const EVENT = {
  id: "event-1",
  name: "Practice — hilary week 5",
  status: "approved",
  eventType: "practice",
  scheduledOn: "2027-02-17",
  // Minute precision, matching what `readEventIn`'s own `asTime` actually
  // returns to `readEventFactsIn` (`events.ts`, `participation.ts`) — not a
  // raw `time` column value with seconds, which nothing in the real payload
  // ever carries this far.
  startsAt: "20:00",
  endsAt: "22:30",
  venue: "Iffley Road Astro",
  deliveryMode: "in_person",
  description: "Full contact.",
  requiredEquipment: "Gumshield, boots",
  isMandatory: true,
  // As `events.termLabel` is actually built — `<term name> <academic year>`
  // (`src/lib/services/events.ts`) — not the bare term name the club link used
  // to key a lookup on. W157-F2.
  termLabel: "hilary 2026-27",
  weekNumber: 5,
};

const PEOPLE: OperatorParticipationPerson[] = [
  {
    key: "player:1",
    displayName: "Alaric Brindlewood",
    capacity: "player",
    isWalkUp: false,
    invitedAt: "2027-02-15T18:00:00.000Z",
    answer: "yes",
    reason: null,
    presence: "absent",
    discrepancy: "said_yes_marked_absent",
    answers: { [LIFT.id]: "Yes" },
    delivery: "delivered",
  },
  {
    key: "player:2",
    displayName: "Bar Sedgewick",
    capacity: "player",
    isWalkUp: false,
    invitedAt: "2027-02-15T18:00:00.000Z",
    answer: "no",
    reason: "Away with the course all week",
    presence: null,
    discrepancy: null,
    answers: {},
    delivery: "failed",
  },
  {
    key: "committee:3",
    displayName: "Fen Marchbanks",
    capacity: "committee",
    isWalkUp: false,
    invitedAt: "2027-02-15T18:00:00.000Z",
    answer: "yes",
    reason: null,
    presence: "late",
    discrepancy: null,
    answers: { [LIFT.id]: "No" },
    delivery: "delivered",
  },
];

/**
 * Invariant P6's row: attended, never asked — W157-F7's subject.
 *
 * Kept out of `PEOPLE` so that every existing count and order assertion in this
 * file is unchanged, and added to the payloads that need it below.
 */
const WALK_UP: OperatorParticipationPerson = {
  key: "walkup:4",
  displayName: "Jorvik Kirkbride",
  capacity: "",
  isWalkUp: true,
  invitedAt: null,
  answer: null,
  reason: null,
  presence: "present",
  discrepancy: null,
  answers: {},
  delivery: null,
};

const OPERATOR: OperatorParticipation = {
  tier: "operator",
  event: { ...EVENT, joiningUrl: JOINING_URL },
  questions: [LIFT],
  people: PEOPLE,
  headline: { invited: 3, saidYes: 2, showed: 1, registerSaved: true },
};

/** The same data, at the tier that has no delivery field and no joining URL. */
const CLUB: ClubLinkParticipation = {
  tier: "club_link",
  event: EVENT,
  questions: [LIFT],
  // The tier difference, made literal: the key is **removed** rather than set
  // to null, because that is what the service returns — and a fixture that
  // kept it would let a component read it and the test still pass.
  people: PEOPLE.map(({ delivery, ...rest }) => {
    void delivery;
    return rest;
  }),
  headline: OPERATOR.headline,
};

function filters(patch: Partial<ParticipationFilters> = {}): ParticipationFilters {
  return { ...EMPTY_FILTERS, ...patch };
}

function renderedNames(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-testid="participation-row"]')).map(
    (row) => row.querySelector("td")?.textContent?.replace(DISCREPANCY_MARK, "").trim() ?? "",
  );
}

beforeEach(() => {
  routerPush.mockReset();
});

// ---------------------------------------------------------------------------
// The table, at both tiers
// ---------------------------------------------------------------------------

describe("the participation table", () => {
  it("renders one row per person with every column W7 names", () => {
    const { container } = render(
      <ParticipationTable
        basePath="/operate/events/event-1"
        participation={OPERATOR}
        filters={filters()}
      />,
    );

    expect(renderedNames(container)).toEqual([
      "Alaric Brindlewood",
      "Bar Sedgewick",
      "Fen Marchbanks",
    ]);

    for (const heading of Object.values(TABLE_HEADINGS)) {
      expect(screen.getAllByText(heading).length).toBeGreaterThan(0);
    }
    // One column per question, headed by the question itself (D68).
    expect(screen.getAllByText("Lift?").length).toBeGreaterThan(0);

    const first = container.querySelector('[data-testid="participation-row"]')!;
    expect(first.textContent).toContain("Player");
    expect(first.textContent).toContain("Yes");
    expect(first.textContent).toContain("Absent");
    expect(first.textContent).toContain("Delivered");
    // And the reason, against the row that said no.
    expect(container.textContent).toContain("Away with the course all week");
  });

  it("shows the delivery column to an operator and not to a club-link reader", () => {
    // The positive control.
    const operator = render(
      <ParticipationTable
        basePath="/operate/events/event-1"
        participation={OPERATOR}
        filters={filters()}
      />,
    );
    expect(operator.container.querySelectorAll('[data-testid="delivery-cell"]').length).toBe(3);
    expect(operator.container.textContent).toContain(TABLE_HEADINGS.delivery);
    expect(operator.container.textContent).toContain("Delivered");
    operator.unmount();

    // And the assertion.
    const club = render(
      <ParticipationTable basePath="/e/token" participation={CLUB} filters={filters()} />,
    );
    expect(club.container.querySelectorAll('[data-testid="delivery-cell"]').length).toBe(0);
    expect(club.container.textContent).not.toContain(TABLE_HEADINGS.delivery);
    expect(club.container.textContent).not.toContain("Delivered");
    // The same three people, though: delivery is the only thing the tier loses.
    expect(renderedNames(club.container)).toEqual([
      "Alaric Brindlewood",
      "Bar Sedgewick",
      "Fen Marchbanks",
    ]);
  });

  it("marks the row where the two records disagree, and says what they say", () => {
    const { container } = render(
      <ParticipationTable basePath="/e/token" participation={CLUB} filters={filters()} />,
    );
    const marked = container.querySelectorAll("[data-discrepancy]");
    // Two renderings — the phone card and the desktop row — of one person.
    expect(marked.length).toBe(2);
    for (const mark of Array.from(marked)) {
      expect(mark.getAttribute("data-discrepancy")).toBe("said_yes_marked_absent");
      expect(mark.getAttribute("title")).toBe("Said yes, marked absent");
      expect(mark.textContent).toBe(DISCREPANCY_MARK);
    }
    // The person who agrees is in the same table and carries no marker.
    const rows = Array.from(container.querySelectorAll('[data-testid="participation-row"]'));
    const fen = rows.find((row) => row.textContent?.includes("Fen Marchbanks"))!;
    expect(fen.querySelector("[data-discrepancy]")).toBeNull();
  });

  it("distinguishes a filtered-empty table from an empty one", () => {
    // `slice-ux.md` § 9: a filter that matched nobody must not look like an
    // event nobody was invited to.
    const filtered = render(
      <ParticipationTable
        basePath="/e/token"
        participation={CLUB}
        filters={filters({ search: "nobody" })}
      />,
    );
    expect(filtered.container.textContent).toContain(NO_MATCHING_PEOPLE);
    expect(filtered.container.textContent).not.toContain(NOBODY_ASKED);
    filtered.unmount();

    const empty = render(
      <ParticipationTable
        basePath="/e/token"
        participation={{ ...CLUB, people: [] }}
        filters={filters()}
      />,
    );
    expect(empty.container.textContent).toContain(NOBODY_ASKED);
    expect(empty.container.textContent).not.toContain(NO_MATCHING_PEOPLE);
  });

  it("filters the rows it renders, not just the payload it was given", () => {
    const { container } = render(
      <ParticipationTable
        basePath="/e/token"
        participation={CLUB}
        filters={filters({ answer: "no" })}
      />,
    );
    expect(renderedNames(container)).toEqual(["Bar Sedgewick"]);
  });

  it("sorts the rows it renders", () => {
    const { container } = render(
      <ParticipationTable
        basePath="/e/token"
        participation={CLUB}
        filters={filters({ sort: "attendance" })}
      />,
    );
    // absent, late, then the one with nothing recorded.
    expect(renderedNames(container)).toEqual([
      "Alaric Brindlewood",
      "Fen Marchbanks",
      "Bar Sedgewick",
    ]);
  });

  it("heads every column with a link that sorts by it", () => {
    const { container } = render(
      <ParticipationTable
        basePath="/operate/events/event-1"
        participation={OPERATOR}
        filters={filters({ search: "bar" })}
      />,
    );
    const columns = ["name", "capacity", "invited", "delivery", "answer", "reason", "attendance"];
    for (const column of columns) {
      const link = container.querySelector(`a[data-sort="${column}"]`);
      expect(link, column).not.toBeNull();
      const href = link!.getAttribute("href")!;
      expect(href, column).toContain(`sort=${column}`);
      // And the filter travels with it, which is the defect that made the
      // events list appear to reset itself.
      expect(href, column).toContain("q=bar");
    }
    expect(container.querySelector(`a[data-sort="q:${LIFT.id}"]`)).not.toBeNull();
  });

  it("R157C-B1: does not scroll to the top when a column is sorted", () => {
    // Brian: "Whenever I go on this page and I sort it, it bounces me to the
    // top of the screen." Sorting re-orders rows already on screen; it must
    // not act like a fresh page load. Revert `scroll={false}` on the
    // `SortableHeading` `<Link>` and this fails, because the mocked `<Link>`
    // above reports `data-scroll="undefined"` — Next.js's own default.
    const { container } = render(
      <ParticipationTable
        basePath="/operate/events/event-1"
        participation={OPERATOR}
        filters={filters()}
      />,
    );
    const columns = ["name", "capacity", "invited", "delivery", "answer", "reason", "attendance"];
    for (const column of columns) {
      const link = container.querySelector(`a[data-sort="${column}"]`)!;
      expect(link.getAttribute("data-scroll"), column).toBe("false");
    }
  });

  it("offers no delivery heading to sort by at the club-link tier", () => {
    const { container } = render(
      <ParticipationTable basePath="/e/token" participation={CLUB} filters={filters()} />,
    );
    expect(container.querySelector('a[data-sort="delivery"]')).toBeNull();
    expect(container.querySelector('a[data-sort="answer"]')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The filter bar — driven, and asserted on the navigation it produced
// ---------------------------------------------------------------------------

describe("the filter bar", () => {
  it("navigates on each filter, carrying the others", () => {
    render(
      <ParticipationFilterBar
        basePath="/operate/events/event-1"
        filters={filters({ capacity: "player" })}
        showDelivery
      />,
    );

    for (const [testId, value, key] of [
      ["filter-answer", "no", "answer=no"],
      ["filter-attendance", "present", "att=present"],
      ["filter-delivery", "failed", "delivery=failed"],
      ["filter-capacity", "coach", "as=coach"],
    ] as const) {
      routerPush.mockReset();
      fireEvent.change(screen.getByTestId(testId), { target: { value } });
      expect(routerPush, testId).toHaveBeenCalledTimes(1);
      const href = routerPush.mock.calls[0][0] as string;
      expect(href, testId).toContain(key);
      // R157C-B2. Brian: "Whenever I add the filter, too, it also jumps me to
      // the top of the page." Revert `{ scroll: false }` on `apply` and this
      // fails — `router.push` is called with no second argument.
      expect(routerPush.mock.calls[0][1], testId).toEqual({ scroll: false });
    }
  });

  it("R157C-B2: does not scroll to the top when the search box changes", async () => {
    // The search box goes through the shared `push` callback rather than
    // `apply`, and the two were fixed at different call sites — this proves
    // the callback the debounced box actually uses, not just the select
    // controls above.
    render(<ParticipationFilterBar basePath="/e/token" filters={filters()} showDelivery={false} />);
    fireEvent.change(screen.getByTestId("filter-search"), { target: { value: "sedge" } });
    await waitFor(() => expect(routerPush).toHaveBeenCalled(), { timeout: 2000 });
    expect(routerPush.mock.calls[0][1]).toEqual({ scroll: false });
  });

  it("carries the half-typed search with a filter chosen inside the debounce", async () => {
    render(<ParticipationFilterBar basePath="/e/token" filters={filters()} showDelivery={false} />);
    fireEvent.change(screen.getByTestId("filter-search"), { target: { value: "wolver" } });
    routerPush.mockReset();
    fireEvent.change(screen.getByTestId("filter-answer"), { target: { value: "yes" } });

    const href = routerPush.mock.calls[0][0] as string;
    expect(href).toContain("q=wolver");
    expect(href).toContain("answer=yes");
  });

  it("filters as you type, without an Enter nothing on screen mentions", async () => {
    render(<ParticipationFilterBar basePath="/e/token" filters={filters()} showDelivery={false} />);
    fireEvent.change(screen.getByTestId("filter-search"), { target: { value: "sedge" } });
    await waitFor(() => expect(routerPush).toHaveBeenCalled(), { timeout: 2000 });
    expect(routerPush.mock.calls[0][0]).toContain("q=sedge");
  });

  it("offers a delivery filter only where the column exists", () => {
    const operator = render(
      <ParticipationFilterBar
        basePath="/operate/events/event-1"
        filters={filters()}
        showDelivery
      />,
    );
    expect(operator.container.querySelector('[data-testid="filter-delivery"]')).not.toBeNull();
    operator.unmount();

    const club = render(
      <ParticipationFilterBar basePath="/e/token" filters={filters()} showDelivery={false} />,
    );
    expect(club.container.querySelector('[data-testid="filter-delivery"]')).toBeNull();
    expect(club.container.querySelector('[data-testid="filter-answer"]')).not.toBeNull();
  });

  it("offers a way back to the unfiltered table once anything is filtered", () => {
    const none = render(
      <ParticipationFilterBar basePath="/e/token" filters={filters()} showDelivery={false} />,
    );
    expect(none.container.querySelector('[data-testid="filter-clear"]')).toBeNull();
    none.unmount();

    const some = render(
      <ParticipationFilterBar
        basePath="/e/token"
        filters={filters({ answer: "no" })}
        showDelivery={false}
      />,
    );
    expect(some.container.querySelector('[data-testid="filter-clear"]')!.getAttribute("href")).toBe(
      "/e/token",
    );
  });
});

// ---------------------------------------------------------------------------
// The club-link page — W7-03
// ---------------------------------------------------------------------------

const readClubLink = vi.mocked(readClubLinkParticipation);

async function renderClubLink(token: string, query: Record<string, string> = {}) {
  const element = await ClubLinkPage({
    params: Promise.resolve({ token }),
    searchParams: Promise.resolve(query),
  });
  return render(element);
}

describe("the club-link page", () => {
  beforeEach(() => {
    // The limiter is per-process module state. Left alone, the twenty-odd
    // renders in this file would spend one link's allowance and the later ones
    // would silently assert against the unavailable panel.
    resetRsvpRateLimit();
  });

  it("shows the event, the three numbers and the table", async () => {
    readClubLink.mockResolvedValue({ state: "live", participation: CLUB });
    const { container } = await renderClubLink("a-token");

    expect(container.textContent).toContain("Practice — hilary week 5");
    expect(screen.getByTestId("headline-invited").querySelector("p")?.textContent).toBe("3");
    expect(screen.getByTestId("headline-said-yes").querySelector("p")?.textContent).toBe("2");
    expect(screen.getByTestId("headline-showed").querySelector("p")?.textContent).toBe("1 / 3");
    expect(renderedNames(container)).toHaveLength(3);
  });

  it("carries no joining URL and no delivery, in the markup", async () => {
    // The payload assertion lives in `participation.test.ts`; this is the
    // rendering half — a server-rendered page ships its markup to the browser.
    readClubLink.mockResolvedValue({ state: "live", participation: CLUB });
    const { container } = await renderClubLink("a-token");
    expect(container.innerHTML).not.toContain(JOINING_URL);
    expect(container.innerHTML).not.toContain("joiningUrl");
    expect(container.textContent).not.toContain(TABLE_HEADINGS.delivery);

    // The positive control: the same event's operator table does carry it.
    const operator = render(
      <ParticipationTable
        basePath="/operate/events/event-1"
        participation={OPERATOR}
        filters={filters()}
      />,
    );
    expect(operator.container.textContent).toContain(TABLE_HEADINGS.delivery);
  });

  it("says the same thing for every kind of dead link, and names nobody", async () => {
    readClubLink.mockResolvedValue({ state: "unavailable" });
    const { container } = await renderClubLink("a-token");
    expect(container.textContent).toContain(CLUB_LINK_UNAVAILABLE_HEADLINE);
    for (const person of PEOPLE) {
      expect(container.textContent).not.toContain(person.displayName);
    }
    expect(container.querySelector('[data-testid="participation-table"]')).toBeNull();
  });

  it("applies a filter arriving in the query string", async () => {
    readClubLink.mockResolvedValue({ state: "live", participation: CLUB });
    const { container } = await renderClubLink("a-token", { answer: "no" });
    expect(renderedNames(container)).toEqual(["Bar Sedgewick"]);
  });

  it("points its sort links at its own token", async () => {
    readClubLink.mockResolvedValue({ state: "live", participation: CLUB });
    const { container } = await renderClubLink("a-token");
    expect(container.querySelector('a[data-sort="answer"]')!.getAttribute("href")).toContain(
      "/e/a-token?",
    );
  });

  // -------------------------------------------------------------------------
  // W157-F1 — a cancelled event says so, to the people with no other surface
  // -------------------------------------------------------------------------

  it("says a cancelled event is cancelled", async () => {
    // The defect this replaces: the whole head of the page for a cancelled
    // event read `Practice — hilary week 5 / Wednesday … / Mandatory / 31 said
    // yes`, and the string "cancel" appeared nowhere in the response. Every
    // reader of this link holds no account and has no other surface, so a
    // forwarded link for a cancelled session sent somebody to a locked pitch.
    readClubLink.mockResolvedValue({
      state: "live",
      participation: { ...CLUB, event: { ...CLUB.event, status: "cancelled" } },
    });
    const { container } = await renderClubLink("a-token");

    expect(container.querySelector('[data-testid="club-link-status"]')!.textContent).toBe(
      "Cancelled",
    );
    expect(container.textContent).toContain("Cancelled");
    // In the page's own head, beside the name and the date — not buried under
    // the table where a reader scanning the top would miss it.
    expect(container.querySelector("h1")!.textContent).toContain("Practice — hilary week 5");

    // And the reason is not disclosed at this tier, structurally: there is no
    // key on `ClubLinkEvent` to carry one.
    expect(Object.keys(CLUB.event)).not.toContain("decisionReason");
  });

  it("says nothing about status for an approved event", async () => {
    // The positive control for the assertion above: the chip is not simply
    // always rendered.
    readClubLink.mockResolvedValue({ state: "live", participation: CLUB });
    const { container } = await renderClubLink("a-token");
    expect(container.querySelector('[data-testid="club-link-status"]')).toBeNull();
    expect(container.textContent).not.toContain("Cancelled");
    expect(container.textContent).not.toContain("Approved");
  });

  // -------------------------------------------------------------------------
  // R157-B4 — the rate limit
  // -------------------------------------------------------------------------

  it("serves the terminal panel and reads nothing once a link is over its allowance", async () => {
    // Driven through the limiter directly rather than by rendering the page two
    // hundred and forty times. The allowance itself is proved in
    // `src/lib/rsvp/public-surface.test.ts`; what this file is for is that the
    // **page** consults it, and consults it *before* the read.
    //
    // That ordering is the whole point. Every club-link request is a write —
    // `use_count`, `last_used_at` — plus a full outer join and a question scan,
    // with `force-dynamic` and `no-store` so nothing caches.
    for (let request = 0; request <= CLUB_LINK_MAX_PER_LINK; request += 1) {
      allowPublicLinkRequest("club_link", "203.0.113.7", "a-token");
    }
    readClubLink.mockClear();
    readClubLink.mockResolvedValue({ state: "live", participation: CLUB });

    const { container } = await renderClubLink("a-token");

    expect(container.textContent).toContain(CLUB_LINK_UNAVAILABLE_HEADLINE);
    expect(container.querySelector('[data-testid="participation-table"]')).toBeNull();
    expect(
      readClubLink,
      "the page read the database for a throttled request",
    ).not.toHaveBeenCalled();
  });

  it("counts each link separately, so one hot link does not close another", async () => {
    // A club link is one token for a whole squad, and two events' links must
    // not share an allowance — otherwise a link somebody is hammering closes
    // the link for a different session.
    for (let request = 0; request <= CLUB_LINK_MAX_PER_LINK; request += 1) {
      allowPublicLinkRequest("club_link", "203.0.113.7", "hot-token");
    }
    readClubLink.mockResolvedValue({ state: "live", participation: CLUB });

    const { container } = await renderClubLink("a-quiet-token");
    expect(container.querySelector('[data-testid="participation-table"]')).not.toBeNull();
  });

  it("does not share a bucket with an RSVP token of the same value", async () => {
    // The two surfaces derive their tokens differently and have very different
    // allowances, so a shared per-link bucket would spend one on the other. An
    // RSVP token exhausted at twenty must not close a club link.
    for (let request = 0; request <= RATE_LIMIT_MAX_PER_LINK; request += 1) {
      allowPublicLinkRequest("rsvp", "203.0.113.7", "a-token");
    }
    readClubLink.mockResolvedValue({ state: "live", participation: CLUB });

    const { container } = await renderClubLink("a-token");
    expect(container.querySelector('[data-testid="participation-table"]')).not.toBeNull();
  });

  it("gives a whole squad room to open the same link at once", async () => {
    // The allowance is deliberately far above the RSVP one: an RSVP token
    // belongs to one player, and this token belongs to everybody the operator
    // shared it with. Fifty readers in a minute is the ordinary case, and
    // twenty a minute — the RSVP number — would have throttled it.
    expect(CLUB_LINK_MAX_PER_LINK).toBeGreaterThan(50);
    for (let reader = 0; reader < 50; reader += 1) {
      expect(
        allowPublicLinkRequest("club_link", `198.51.100.${reader}`, "a-token").allowed,
        `reader ${reader} was throttled`,
      ).toBe(true);
    }
    readClubLink.mockResolvedValue({ state: "live", participation: CLUB });
    const { container } = await renderClubLink("a-token");
    expect(container.querySelector('[data-testid="participation-table"]')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Copy link — W7-04
// ---------------------------------------------------------------------------

describe("copy link", () => {
  it("puts the link on the clipboard and says so", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(<CopyLinkButton url="https://club.example/e/abc" />);
    const button = screen.getByTestId("copy-club-link");
    expect(button.textContent).toBe("Copy link");
    fireEvent.click(button);

    expect(writeText).toHaveBeenCalledWith("https://club.example/e/abc");
    await waitFor(() => expect(screen.getByTestId("copy-club-link").textContent).toBe("Copied"));
  });

  it("survives a clipboard that refuses, because the URL is on the screen anyway", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(globalThis.navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(<CopyLinkButton url="https://club.example/e/abc" />);
    fireEvent.click(screen.getByTestId("copy-club-link"));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(screen.getByTestId("copy-club-link").textContent).toBe("Copy link");
  });
});

/**
 * Rendered through `react-dom/server`, which is **not** Next's server runtime.
 *
 * Corrected at R157-B1. This block used to be called "rendering on the server,
 * which is where it actually runs", and it is not where it actually runs. The
 * claim was tested and disproved: reintroducing `<Stack divider={<Divider
 * flexItem />}>` at `participation-table.tsx:249` passed all thirty tests in
 * this file **and** `npm run typecheck`, while the real page returned 500.
 *
 * So what these four actually buy is narrower than the old name promised, and
 * still worth having:
 *
 *   * they render without a DOM, without `act` and without hydration, so a
 *     component that throws in that environment is caught here rather than
 *     being papered over by a client-side recovery;
 *   * they assert real **content** — the operator table carries the delivery
 *     heading, the club-link table does not — and one of them is the rendering
 *     half of the tier boundary.
 *
 * What they do **not** buy is any guarantee about Next's own server runtime.
 * `renderToStaticMarkup` resolves a component reference that Next's renderer
 * rejects, `next build` compiled it, and every jsdom test passed. The only
 * thing in this repository that would find the next failure of that class is
 * loading the real page and reading its status code, which is what the browser
 * preflight does. A CI smoke job that fetched these routes and asserted 200
 * would be the automated version; it does not exist, and adding it is a change
 * to `.github/workflows/` that is not this package's.
 */
describe("rendering through react-dom/server, without a DOM or hydration", () => {
  it("renders the operator table without throwing", () => {
    const markup = renderToStaticMarkup(
      <ParticipationTable
        basePath="/operate/events/event-1"
        participation={OPERATOR}
        filters={filters()}
      />,
    );
    expect(markup).toContain("Alaric Brindlewood");
    expect(markup).toContain(TABLE_HEADINGS.delivery);
  });

  it("renders the club-link table without throwing, and without delivery", () => {
    const markup = renderToStaticMarkup(
      <ParticipationTable basePath="/e/token" participation={CLUB} filters={filters()} />,
    );
    expect(markup).toContain("Alaric Brindlewood");
    expect(markup).not.toContain(TABLE_HEADINGS.delivery);
  });

  it("renders the event facts and the headline without throwing", () => {
    const markup = renderToStaticMarkup(
      <>
        <EventFacts event={CLUB.event} />
        <HeadlineNumbers headline={CLUB.headline} />
      </>,
    );
    expect(markup).toContain("Iffley Road Astro");
    expect(markup).toContain("1 / 3");
  });

  it("renders an empty table and a filtered-empty table without throwing", () => {
    expect(
      renderToStaticMarkup(
        <ParticipationTable
          basePath="/e/token"
          participation={{ ...CLUB, people: [] }}
          filters={filters()}
        />,
      ),
    ).toContain(NOBODY_ASKED);
    expect(
      renderToStaticMarkup(
        <ParticipationTable
          basePath="/e/token"
          participation={CLUB}
          filters={filters({ search: "nobody" })}
        />,
      ),
    ).toContain(NO_MATCHING_PEOPLE);
  });
});

/**
 * D68's other half — the collapsed Questions section on the event page.
 *
 * "Answers are read in two places: a collapsed Questions section on the event
 * page showing counts, and the full participation view … one row per person and
 * one column per question."
 */
describe("the collapsed Questions section", () => {
  it("counts each answer, and starts collapsed", () => {
    const { container } = render(<QuestionCounts participation={OPERATOR} />);
    const line = container.querySelector('[data-testid="question-count"]')!;
    expect(line.textContent).toContain("Lift?");
    // Two people answered — one Yes, one No — and one gave no answer.
    expect(line.textContent).toContain("Yes 1");
    expect(line.textContent).toContain("No 1");
    expect(line.textContent).toContain("No answer 1");

    const details = container.querySelector("details")!;
    expect(details.hasAttribute("open")).toBe(false);
  });

  it("renders nothing at all for an event with no questions", () => {
    // Not an empty panel headed "Questions": there is nothing to collapse.
    const { container } = render(<QuestionCounts participation={{ ...OPERATOR, questions: [] }} />);
    expect(container.querySelector('[data-testid="question-counts"]')).toBeNull();
  });

  it("agrees with the column it summarises", () => {
    // The counts and the table are two readers of one fact — standards rule 7.
    const counts = render(<QuestionCounts participation={OPERATOR} />);
    const table = render(
      <ParticipationTable
        basePath="/operate/events/event-1"
        participation={OPERATOR}
        filters={filters()}
      />,
    );
    const cells = Array.from(
      table.container.querySelectorAll(`td[data-question="${LIFT.id}"]`),
    ).map((cell) => cell.textContent);
    expect(cells.filter((cell) => cell === "Yes")).toHaveLength(1);
    expect(cells.filter((cell) => cell === "No")).toHaveLength(1);
    expect(counts.container.textContent).toContain("Yes 1");
    expect(counts.container.textContent).toContain("No 1");
  });

  it("renders on the server without throwing", () => {
    expect(renderToStaticMarkup(<QuestionCounts participation={OPERATOR} />)).toContain("Lift?");
  });
});

describe("the phone presentation", () => {
  it("carries every fact the desktop row does, per person", () => {
    // Responsive reflow may not remove required information: the card is not
    // the row with columns dropped.
    const { container } = render(
      <ParticipationTable
        basePath="/operate/events/event-1"
        participation={OPERATOR}
        filters={filters()}
      />,
    );
    const cards = Array.from(container.querySelectorAll('[data-testid="participation-card"]'));
    expect(cards).toHaveLength(3);

    const alaric = cards.find((card) => card.textContent?.includes("Alaric Brindlewood"))!;
    expect(alaric.textContent).toContain("Player");
    expect(alaric.textContent).toContain("Yes");
    expect(alaric.textContent).toContain("Absent");
    expect(alaric.textContent).toContain("Delivered");
    expect(alaric.textContent).toContain("Lift?");
    expect(alaric.querySelector("[data-discrepancy]")).not.toBeNull();

    const bar = cards.find((card) => card.textContent?.includes("Bar Sedgewick"))!;
    expect(bar.textContent).toContain("Away with the course all week");
  });

  it("R157C-B5: labels each value with the desktop column that names it", () => {
    // Brian: "what I see is that nothing is recorded, nothing is queued,
    // without any labels or anything like that." Bar Sedgewick's attendance
    // is unrecorded and a second, otherwise-normal invitee's delivery is
    // nothing-queued — both bare values the finding named — plus an ordinary
    // Answer value, to prove the label is not special-cased to the empty
    // states alone.
    const nothingQueued: OperatorParticipationPerson = {
      ...PEOPLE[0],
      key: "player:9",
      displayName: "Ines Thornbury",
      delivery: null,
    };
    const { container } = render(
      <ParticipationTable
        basePath="/operate/events/event-1"
        participation={{ ...OPERATOR, people: [PEOPLE[0], PEOPLE[1], nothingQueued] }}
        filters={filters()}
      />,
    );
    const cards = Array.from(container.querySelectorAll('[data-testid="participation-card"]'));

    const alaric = cards.find((card) => card.textContent?.includes("Alaric Brindlewood"))!;
    // The label sits immediately in front of its value — no space in
    // `textContent` because the gap between them is layout (Stack spacing),
    // not a text node. Revert the `LabeledField` wrapper and this fails: the
    // card would read a bare "Yes" with no "Answer" in front of it.
    expect(alaric.textContent).toContain(`${TABLE_HEADINGS.answer}Yes`);

    const bar = cards.find((card) => card.textContent?.includes("Bar Sedgewick"))!;
    expect(bar.textContent).toContain(`${TABLE_HEADINGS.attendance}${NOT_RECORDED}`);

    const ines = cards.find((card) => card.textContent?.includes("Ines Thornbury"))!;
    expect(ines.textContent).toContain(`${TABLE_HEADINGS.delivery}${DELIVERY_NOT_QUEUED}`);
  });

  it("drops the delivery chip at the club-link tier", () => {
    const { container } = render(
      <ParticipationTable basePath="/e/token" participation={CLUB} filters={filters()} />,
    );
    const cards = Array.from(container.querySelectorAll('[data-testid="participation-card"]'));
    expect(cards).toHaveLength(3);
    for (const card of cards) {
      expect(card.textContent).not.toContain("Delivered");
      expect(card.textContent).not.toContain("Failed");
    }
  });

  // -------------------------------------------------------------------------
  // W157-F6 — copy that describes a capability the phone does not have
  // -------------------------------------------------------------------------

  it("omits standing sort help while retaining every sortable column", () => {
    for (const participation of [OPERATOR, CLUB]) {
      const { container, unmount } = render(
        <ParticipationTable
          basePath="/operate/events/event-1"
          participation={participation}
          filters={filters()}
        />,
      );
      expect(container.querySelector('[data-testid="sortable-note"]')).toBeNull();
      expect(container.textContent).not.toContain(SORTABLE_NOTE);
      expect(container.querySelectorAll("a[data-sort]").length).toBe(
        6 + participation.questions.length + (participation.tier === "operator" ? 1 : 0),
      );
      unmount();
    }
  });

  it("defines the discrepancy mark at every tier that renders one — R157C-A5", () => {
    // The finding. `DiscrepancyMark` is not tier-gated and the legend was, so a
    // coach opening `/e/<token>` met `≠` beside a player's name with nothing on
    // the page saying what it meant — and the comment beside the gate claimed
    // the opposite, which is how it survived a round. The rule asserted here is
    // the one that holds both together: wherever the mark renders, the sentence
    // that defines it renders too.
    for (const participation of [OPERATOR, CLUB]) {
      const { container, unmount } = render(
        <ParticipationTable
          basePath="/operate/events/event-1"
          participation={participation}
          filters={filters()}
        />,
      );
      const mark = container.querySelector("[data-discrepancy]");
      expect(mark, `${participation.tier} renders no mark to define`).not.toBeNull();
      expect(container.textContent, `${participation.tier} defines nothing`).toContain(
        DISCREPANCY_LEGEND,
      );
      // And on the card, which is the tier/width pair the finding was about.
      const card = container.querySelector('[data-testid="participation-card"] [data-discrepancy]');
      expect(card, `${participation.tier} renders no mark on the phone`).not.toBeNull();
      unmount();
    }
  });

  it("keeps the discrepancy legend visible without an empty help wrapper — R157C-A5", () => {
    for (const participation of [OPERATOR, CLUB]) {
      const { unmount } = render(
        <ParticipationTable
          basePath="/operate/events/event-1"
          participation={participation}
          filters={filters()}
        />,
      );
      expect(screen.getByText(DISCREPANCY_LEGEND)).toBeVisible();
      unmount();
    }
  });
});

// ---------------------------------------------------------------------------
// W157-F2 and W157-F7 — the two surfaces saying the same words
// ---------------------------------------------------------------------------

describe("the event facts", () => {
  it("says term and week exactly as the operator's event page says it", () => {
    // The defect: the club link had its own `TERM_LABELS` map keyed on the bare
    // term name while `events.termLabel` is `<name> <academic year>`, so the
    // lookup never matched and the raw lowercase value fell through with an
    // ordinal appended — `hilary 2026-27 · 5th week` against the operator's
    // `Hilary 2026-27 · Week 5`. Asserted against the operator page's own
    // formatter rather than against a copied string, so the two cannot drift.
    const { container } = render(<EventFacts event={CLUB.event} />);
    expect(container.textContent).toContain(formatTermAndWeek(EVENT.termLabel, EVENT.weekNumber));
    expect(container.textContent).toContain("Hilary 2026-27 · Week 5");
    expect(container.textContent).not.toContain("5th week");
    expect(container.textContent).not.toContain("hilary 2026-27 ·");
  });

  it("does not print an ordinal for a pre-season week", () => {
    // `-1th week` was the copy a pre-season event actually produced.
    const { container } = render(
      <EventFacts event={{ ...CLUB.event, termLabel: "michaelmas 2026-27", weekNumber: -1 }} />,
    );
    expect(container.textContent).toContain(formatTermAndWeek("michaelmas 2026-27", -1));
    expect(container.textContent).not.toContain("-1th");
  });

  it("names every event type in the club's own words — R157C-A1", () => {
    // The second half of the duplication `W157-F2` half-removed. This file kept
    // a private copy of the seven type names beside the `TERM_LABELS` map that
    // was deleted; byte-identical then, and one rename or one eighth type away
    // from falling through `?? event.eventType` and printing a raw
    // `strength_and_conditioning` to an unauthenticated audience — which is
    // exactly what the sibling copy did do.
    //
    // Asserted against `@/lib/services/event-vocabulary`'s map rather than
    // against copied strings, for the reason the term-and-week case above gives:
    // a test holding its own third copy would drift with the second.
    for (const eventType of Object.keys(TYPE_LABELS)) {
      const { container, unmount } = render(<EventFacts event={{ ...CLUB.event, eventType }} />);
      expect(container.textContent, eventType).toContain(labelFor(TYPE_LABELS, eventType));
      // And the enum value itself is not what a reader is shown. `chalk` and
      // `game` are their own labels, so the check only means anything for the
      // ones the club spells differently.
      if (labelFor(TYPE_LABELS, eventType) !== eventType) {
        expect(container.textContent, eventType).not.toContain(eventType);
      }
      unmount();
    }
  });
});

describe("a walk-up's row", () => {
  const withWalkUp: OperatorParticipation = {
    ...OPERATOR,
    people: [...PEOPLE, WALK_UP],
  };

  it("reads an em dash under Delivery, not `Nothing queued`", () => {
    // W157-F7. "Nothing queued" is a statement about delivering an invitation
    // to somebody who was never invited. Every other empty cell in this row
    // reads "—" and the approved mockup gives this one "—" too.
    const { container } = render(
      <ParticipationTable
        basePath="/operate/events/event-1"
        participation={withWalkUp}
        filters={filters()}
      />,
    );
    // The row, not the card: both carry `data-person`, and the card comes
    // first in the DOM.
    const row = container.querySelector(
      '[data-testid="participation-row"][data-person="walkup:4"]',
    )!;
    expect(row).not.toBeNull();
    expect(row.querySelector('[data-testid="delivery-cell"]')!.textContent).toBe(NOTHING);
    expect(row.textContent).not.toContain(DELIVERY_NOT_QUEUED);
  });

  it("still says `Nothing queued` for somebody who was invited", () => {
    // The positive control: the cell is not simply always a dash now. A person
    // with an invitation and no queued job is a real state, and it is the one
    // that sentence was written for.
    const invitedNothingQueued: OperatorParticipationPerson = {
      ...PEOPLE[0],
      key: "player:9",
      displayName: "Ines Thornbury",
      delivery: null,
    };
    const { container } = render(
      <ParticipationTable
        basePath="/operate/events/event-1"
        participation={{ ...OPERATOR, people: [invitedNothingQueued] }}
        filters={filters()}
      />,
    );
    expect(
      container.querySelector('[data-testid="participation-row"] [data-testid="delivery-cell"]')!
        .textContent,
    ).toBe(DELIVERY_NOT_QUEUED);
  });

  it("reads the em dash on the phone card too", () => {
    const { container } = render(
      <ParticipationTable
        basePath="/operate/events/event-1"
        participation={withWalkUp}
        filters={filters()}
      />,
    );
    const card = Array.from(container.querySelectorAll('[data-testid="participation-card"]')).find(
      (element) => element.getAttribute("data-person") === "walkup:4",
    )!;
    expect(card.textContent).not.toContain(DELIVERY_NOT_QUEUED);
  });
});

// ---------------------------------------------------------------------------
// Recording an answer in person — W3, LAN-170
// ---------------------------------------------------------------------------

const UNANSWERED_INVITATION_ID = "99999999-9999-4999-8999-999999999999";

function unanswered(
  overrides: Partial<OperatorParticipationPerson> = {},
): OperatorParticipationPerson {
  return {
    key: "player:unanswered",
    displayName: "Gideon Thornbury",
    capacity: "player",
    isWalkUp: false,
    invitedAt: "2027-02-15T18:00:00.000Z",
    answer: null,
    reason: null,
    presence: null,
    discrepancy: null,
    answers: {},
    delivery: null,
    invitationId: UNANSWERED_INVITATION_ID,
    ...overrides,
  };
}

const OPERATOR_WITH_UNANSWERED: OperatorParticipation = {
  ...OPERATOR,
  people: [...PEOPLE, unanswered()],
};

/**
 * The identical person, at the tier that never gets `invitationId` at all —
 * matching what `buildClubLinkParticipationIn`'s field-by-field reassembly
 * actually produces, rather than stripping the key off an operator fixture.
 */
const CLUB_WITH_UNANSWERED: ClubLinkParticipation = {
  ...CLUB,
  people: [
    ...CLUB.people,
    {
      key: "player:unanswered",
      displayName: "Gideon Thornbury",
      capacity: "player",
      isWalkUp: false,
      invitedAt: "2027-02-15T18:00:00.000Z",
      answer: null,
      reason: null,
      presence: null,
      discrepancy: null,
      answers: {},
    },
  ],
};

function resolvedOperator(personId = "operator-1") {
  return {
    state: "active" as const,
    operator: {
      authUserId: "auth-operator-1",
      personId,
      displayName: "Casey Operator",
      roleCodes: ["secretary"],
      isActive: true,
    },
  };
}

const RECORDED: Awaited<ReturnType<typeof recordOperatorRsvpResponse>> = {
  responseId: "response-1",
  response: "yes",
  respondedAt: new Date("2027-02-16T10:00:00.000Z"),
  invitationId: UNANSWERED_INVITATION_ID,
  cancelledJobs: 0,
};

// ---------------------------------------------------------------------------
// Chase position and the delivery column's two named exceptions — W4, W6
// ---------------------------------------------------------------------------

describe("the delivery column's exceptions and chase position", () => {
  it("shows an unanswered person's chase position beneath the delivery chip", () => {
    const withChase = {
      ...OPERATOR,
      people: [
        ...PEOPLE,
        unanswered({ delivery: "delivered", chasePosition: "WhatsApp 2 due Thu 18:00" }),
      ],
    };
    const { container } = render(
      <ParticipationTable
        basePath="/operate/events/event-1"
        participation={withChase}
        filters={filters()}
      />,
    );
    expect(container.textContent).toContain("WhatsApp 2 due Thu 18:00");
  });

  it("shows no chase position for an answered person", () => {
    // Alaric answered yes and carries no chasePosition — the ordinary case,
    // matching W4's own exceptions table.
    const { container } = render(
      <ParticipationTable
        basePath="/operate/events/event-1"
        participation={OPERATOR}
        filters={filters()}
      />,
    );
    expect(container.querySelector('[data-testid="chase-position"]')).toBeNull();
  });

  it("reads Not dispatched — no channel for a person with no usable route, and shows no chase position", () => {
    const withNoRoute = {
      ...OPERATOR,
      people: [
        ...PEOPLE,
        unanswered({ delivery: "failed", noUsableRoute: true, chasePosition: null }),
      ],
    };
    const { container } = render(
      <ParticipationTable
        basePath="/operate/events/event-1"
        participation={withNoRoute}
        filters={filters()}
      />,
    );
    const row = Array.from(container.querySelectorAll('[data-testid="participation-row"]')).find(
      (row) => row.textContent?.includes("Gideon Thornbury"),
    )!;
    expect(row.textContent).toContain("Not dispatched — no channel");
    expect(row.textContent).not.toContain("Failed");
    expect(row.querySelector('[data-testid="chase-position"]')).toBeNull();
  });

  it("reads WhatsApp unresponsive for a WhatsApp failure the email fallback carried, and keeps counting it", () => {
    const withFallback = {
      ...OPERATOR,
      people: [
        ...PEOPLE,
        unanswered({
          delivery: "failed",
          whatsappUnresponsive: true,
          chasePosition: "Email sent · escalation Sat 12:00",
        }),
      ],
    };
    const { container } = render(
      <ParticipationTable
        basePath="/operate/events/event-1"
        participation={withFallback}
        filters={filters()}
      />,
    );
    expect(container.textContent).toContain("WhatsApp unresponsive");
    // The chase ladder keeps reporting for a reached-by-fallback person —
    // only a genuine no-channel failure suppresses it.
    expect(container.textContent).toContain("Email sent · escalation Sat 12:00");
  });

  it("filters to exactly the failed and retryable people on 'Needs attention'", () => {
    const withMixedDelivery = {
      ...OPERATOR,
      people: [...PEOPLE, unanswered({ delivery: "retryable" })],
    };
    const { container } = render(
      <ParticipationTable
        basePath="/operate/events/event-1"
        participation={withMixedDelivery}
        filters={filters({ delivery: "attention" })}
      />,
    );
    // Bar Sedgewick (failed) and Gideon Thornbury (retryable) — not the two
    // delivered rows.
    expect(renderedNames(container)).toEqual(["Bar Sedgewick", "Gideon Thornbury"]);
  });
});

describe("recording an answer in person", () => {
  beforeEach(() => {
    vi.mocked(recordOperatorRsvpResponse).mockReset();
    vi.mocked(resolveOperatorAccess).mockReset();
  });

  it("offers Record answer only on the row with no answer, at the operator tier", () => {
    const { container } = render(
      <ParticipationTable
        basePath="/operate/events/event-1"
        participation={OPERATOR_WITH_UNANSWERED}
        filters={filters()}
      />,
    );
    // The desktop row and the phone card both render it for the same person
    // — two renderings of one control, never a second destination.
    const buttons = container.querySelectorAll('[data-testid="record-answer-open"]');
    expect(buttons.length).toBe(2);
    for (const button of Array.from(buttons)) {
      expect(button.textContent).toBe(RECORD_ANSWER);
    }
  });

  // OWNER-LAN170-05 (correction round 3): the button replaces the chip, it
  // never sits beside it — a stacked "No answer" chip above the control was
  // exactly what Brian called awkward.
  it("shows the button alone on an unanswered row — never a 'No answer' chip stacked above it", () => {
    render(
      <ParticipationTable
        basePath="/operate/events/event-1"
        participation={OPERATOR_WITH_UNANSWERED}
        filters={filters()}
      />,
    );
    expect(screen.queryByText(ANSWER_NONE)).not.toBeInTheDocument();
    // Every other row's answer is unaffected — an actual answer still shows
    // its chip and no control, the same as before this correction.
    expect(screen.getAllByText("Yes").length).toBeGreaterThan(0);
  });

  it("never offers it at the club-link tier, even for the identical unanswered person", () => {
    const { container } = render(
      <ParticipationTable
        basePath="/e/token"
        participation={CLUB_WITH_UNANSWERED}
        filters={filters()}
      />,
    );
    expect(container.querySelectorAll('[data-testid="record-answer-open"]').length).toBe(0);
  });

  it("never offers it for a walk-up, who was never invited and has no invitation to record against", () => {
    const operatorWithWalkUp: OperatorParticipation = { ...OPERATOR, people: [...PEOPLE, WALK_UP] };
    const { container } = render(
      <ParticipationTable
        basePath="/operate/events/event-1"
        participation={operatorWithWalkUp}
        filters={filters()}
      />,
    );
    expect(container.querySelectorAll('[data-testid="record-answer-open"]').length).toBe(0);
  });

  it("opens naming the person, with neither answer chosen and the submit button disabled", () => {
    render(
      <ParticipationTable
        basePath="/operate/events/event-1"
        participation={OPERATOR_WITH_UNANSWERED}
        filters={filters()}
      />,
    );
    fireEvent.click(screen.getAllByTestId("record-answer-open")[0]);

    expect(screen.getByText(recordAnswerDialogTitle("Gideon Thornbury"))).toBeInTheDocument();
    expect(screen.getByText(RESPONSE_YES_LABEL)).toBeInTheDocument();
    expect(screen.getByText(RESPONSE_NO_LABEL)).toBeInTheDocument();
    expect(screen.getByTestId("response-yes")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("response-no")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("record-answer-submit")).toBeDisabled();
  });

  // OWNER-LAN170-09 (correction round 4): `W3-02`/`W3-04` both draw a second
  // line under the title naming the event; the shipped dialog dropped it
  // with nothing authorising the omission. Structure/copy from the mockup,
  // date/time style from the application's own `formatDetailWhen` (Q-23) —
  // asserted via the same formatter the surface itself calls, not a second,
  // independently hand-written date string that could drift from it.
  it("names the event under the title, in the application's own date/time style", () => {
    render(
      <ParticipationTable
        basePath="/operate/events/event-1"
        participation={OPERATOR_WITH_UNANSWERED}
        filters={filters()}
      />,
    );
    fireEvent.click(screen.getAllByTestId("record-answer-open")[0]);

    expect(screen.getByTestId("record-answer-event-subtitle")).toHaveTextContent(
      recordAnswerEventSubtitle(OPERATOR_WITH_UNANSWERED.event),
    );
    // Concretely: the event's own name, then its long-form date and time
    // range — not the mockup's literal rendering, and not a bare ISO string.
    expect(screen.getByTestId("record-answer-event-subtitle")).toHaveTextContent(
      "Practice — hilary week 5 · Wednesday, 17 February 2027 · 20:00–22:30",
    );
  });

  // OWNER-LAN170-06 (correction round 3): a standard exclusive toggle group,
  // where the selected option looks selected whichever one it is — Brian
  // could not tell which he had picked when only Yes was ever allowed to look
  // chosen.
  it("shows whichever answer is selected as selected, including No", () => {
    render(
      <ParticipationTable
        basePath="/operate/events/event-1"
        participation={OPERATOR_WITH_UNANSWERED}
        filters={filters()}
      />,
    );
    fireEvent.click(screen.getAllByTestId("record-answer-open")[0]);

    const yes = screen.getByTestId("response-yes");
    const no = screen.getByTestId("response-no");
    expect(yes.className).not.toContain("Mui-selected");
    expect(no.className).not.toContain("Mui-selected");

    fireEvent.click(no);
    expect(no).toHaveAttribute("aria-pressed", "true");
    expect(yes).toHaveAttribute("aria-pressed", "false");
    // No is the one selected now, and it looks it — the exact fact Brian
    // could not previously see.
    expect(no.className).toContain("Mui-selected");
    expect(yes.className).not.toContain("Mui-selected");

    fireEvent.click(yes);
    expect(yes).toHaveAttribute("aria-pressed", "true");
    expect(no).toHaveAttribute("aria-pressed", "false");
    expect(yes.className).toContain("Mui-selected");
    expect(no.className).not.toContain("Mui-selected");
  });

  // OWNER-LAN170-07: one branch's fields at a time, and neither before a
  // choice is made.
  it("shows neither the reason nor the event's questions until an answer is chosen", () => {
    render(
      <ParticipationTable
        basePath="/operate/events/event-1"
        participation={OPERATOR_WITH_UNANSWERED}
        filters={filters()}
      />,
    );
    fireEvent.click(screen.getAllByTestId("record-answer-open")[0]);

    expect(screen.queryByPlaceholderText(REASON_PLACEHOLDER)).not.toBeInTheDocument();
    expect(screen.queryByText(EVENT_QUESTIONS_HEADING)).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("response-yes"));
    expect(screen.getByText(EVENT_QUESTIONS_HEADING)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(REASON_PLACEHOLDER)).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("response-no"));
    expect(screen.getByPlaceholderText(REASON_PLACEHOLDER)).toBeInTheDocument();
    expect(screen.queryByText(EVENT_QUESTIONS_HEADING)).not.toBeInTheDocument();
  });

  it("records a Yes through the real action, and closes the dialog on success", async () => {
    vi.mocked(resolveOperatorAccess).mockResolvedValue(resolvedOperator());
    vi.mocked(recordOperatorRsvpResponse).mockResolvedValue(RECORDED);

    render(
      <ParticipationTable
        basePath="/operate/events/event-1"
        participation={OPERATOR_WITH_UNANSWERED}
        filters={filters()}
      />,
    );
    fireEvent.click(screen.getAllByTestId("record-answer-open")[0]);
    fireEvent.click(screen.getByTestId("response-yes"));
    fireEvent.click(screen.getByTestId("record-answer-submit"));

    await waitFor(() => expect(recordOperatorRsvpResponse).toHaveBeenCalledTimes(1));
    const [personId, eventId, invitationId, submission] = vi.mocked(recordOperatorRsvpResponse).mock
      .calls[0];
    expect(personId).toBe("operator-1");
    expect(eventId).toBe("event-1");
    expect(invitationId).toBe(UNANSWERED_INVITATION_ID);
    expect(submission.response).toBe("yes");
    expect(submission.respondedAtDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(submission.respondedAtTime).toMatch(/^\d{2}:\d{2}$/);

    await waitFor(() =>
      expect(screen.queryByTestId("record-answer-submit")).not.toBeInTheDocument(),
    );
  });

  it("shows the server's refusal and keeps the dialog open with the choice intact", async () => {
    vi.mocked(resolveOperatorAccess).mockResolvedValue(resolvedOperator());
    vi.mocked(recordOperatorRsvpResponse).mockRejectedValue(
      new ConstraintViolated("Choose a reason before saving Not attending.", {
        rule: "rsvp_responses_no_requires_a_reason",
      }),
    );

    render(
      <ParticipationTable
        basePath="/operate/events/event-1"
        participation={OPERATOR_WITH_UNANSWERED}
        filters={filters()}
      />,
    );
    fireEvent.click(screen.getAllByTestId("record-answer-open")[0]);
    fireEvent.click(screen.getByTestId("response-no"));
    // Whitespace satisfies the browser's own `required` attribute, so the
    // submit actually reaches the server action — exactly the case
    // `composeReason`'s own test suite proves is not a reason.
    fireEvent.change(screen.getByPlaceholderText(REASON_PLACEHOLDER), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByTestId("record-answer-submit"));

    await waitFor(() =>
      expect(screen.getByTestId("record-answer-error")).toHaveTextContent(
        "Choose a reason before saving Not attending.",
      ),
    );
    // The dialog stayed open, and the operator's choice was not lost.
    expect(screen.getByTestId("response-no")).toHaveAttribute("aria-pressed", "true");
  });

  it("answers the event's own questions in the same form, and a blank one posts as blank rather than being dropped", async () => {
    vi.mocked(resolveOperatorAccess).mockResolvedValue(resolvedOperator());
    vi.mocked(recordOperatorRsvpResponse).mockResolvedValue(RECORDED);

    const TRANSPORT: ParticipationQuestion = {
      id: "question-transport",
      prompt: "Transport there?",
      answerType: "boolean",
      sortOrder: 0,
      appliesToCapacities: ["player"],
    };
    const SHIRT: ParticipationQuestion = {
      id: "question-shirt",
      prompt: "Shirt size",
      answerType: "text",
      sortOrder: 1,
      appliesToCapacities: ["player"],
    };
    const payload: OperatorParticipation = {
      ...OPERATOR_WITH_UNANSWERED,
      questions: [TRANSPORT, SHIRT],
    };

    render(
      <ParticipationTable
        basePath="/operate/events/event-1"
        participation={payload}
        filters={filters()}
      />,
    );
    fireEvent.click(screen.getAllByTestId("record-answer-open")[0]);
    fireEvent.click(screen.getByTestId("response-yes"));
    // The boolean question's own Yes button — distinct from the dialog's
    // "Yes, attending", which carries a different accessible name.
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    fireEvent.click(screen.getByTestId("record-answer-submit"));

    await waitFor(() => expect(recordOperatorRsvpResponse).toHaveBeenCalledTimes(1));
    const [, , , submission] = vi.mocked(recordOperatorRsvpResponse).mock.calls[0];
    expect(submission.questionAnswers?.["question-transport"]).toBe("Yes");
    // Left blank — partial answers are accepted, and this one stays
    // outstanding rather than blocking the answer that was given.
    expect(submission.questionAnswers?.["question-shirt"]).toBe("");
  });
});
