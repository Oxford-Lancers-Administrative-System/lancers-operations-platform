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
vi.mock("@/lib/services/participation", () => ({
  readClubLinkParticipation: vi.fn(),
}));

import {
  EMPTY_FILTERS,
  type ClubLinkParticipation,
  type OperatorParticipation,
  type OperatorParticipationPerson,
  type ParticipationFilters,
  type ParticipationQuestion,
} from "@/lib/services/participation-view";
import { readClubLinkParticipation } from "@/lib/services/participation";

import ClubLinkPage from "../e/[token]/page";
import { EventFacts, HeadlineNumbers } from "./event-facts";
import { CopyLinkButton } from "./copy-link";
import { ParticipationFilterBar } from "./participation-filters";
import { ParticipationTable } from "./participation-table";
import { QuestionCounts } from "./question-counts";
import {
  CLUB_LINK_UNAVAILABLE_HEADLINE,
  DISCREPANCY_MARK,
  NO_MATCHING_PEOPLE,
  NOBODY_ASKED,
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
  startsAt: "20:00:00",
  endsAt: "22:30:00",
  venue: "Iffley Road Astro",
  deliveryMode: "in_person",
  description: "Full contact.",
  requiredEquipment: "Gumshield, boots",
  isMandatory: true,
  termLabel: "hilary",
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
    }
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
  it("shows the event, the three numbers and the table", async () => {
    readClubLink.mockResolvedValue({ state: "live", participation: CLUB });
    const { container } = await renderClubLink("a-token");

    expect(container.textContent).toContain("Practice — hilary week 5");
    expect(screen.getByTestId("headline-invited").textContent).toBe("3");
    expect(screen.getByTestId("headline-said-yes").textContent).toBe("2");
    expect(screen.getByTestId("headline-showed").textContent).toBe("1 / 3");
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
 * The table is a **server** component, and jsdom is not a server.
 *
 * These render it through `react-dom/server` instead, which catches a component
 * that throws without a DOM, without `act`, and without hydration papering over
 * it — the class of failure jsdom is worst at noticing.
 *
 * **It is not the whole guard, and the reason is worth writing down.**
 * `<Stack divider={…}>` compiled, passed every jsdom test in this file, passed
 * `renderToStaticMarkup` here, and survived `next build` — and then threw
 * "Element type is invalid … got: undefined" inside Next's own server runtime,
 * so every request for the operator page and the club link returned **500**
 * while the browser recovered on the client and looked perfect. It was found by
 * loading the real page and reading the status code, and that is still the only
 * thing in this repository that would find the next one. The browser preflight
 * earns its place; this file does not replace it.
 */
describe("rendering on the server, which is where it actually runs", () => {
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
});
