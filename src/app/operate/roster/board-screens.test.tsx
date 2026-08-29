/**
 * `/operate/roster` — the redesigned board. LAN-186, W5.
 *
 * These render the real page with the service layer mocked, proving the
 * screen: the gate refuses a non-four-role operator before any data is read
 * (`REQ-authority`), the approved bands and columns render, both empty states
 * exist and are distinguishable, and the missing-data column links into the
 * queue. The writes are proved against the real database in
 * `src/lib/services/roster-board.test.ts`; the redaction mechanism is proved
 * without a database in `board-columns.test.ts`.
 *
 * ## What this file cannot see
 *
 * jsdom does not evaluate MUI breakpoints, so the desktop table and the phone
 * cards are both in this DOM. The wide-versus-condensed boundary is proved by
 * the browser preflight at a measured 1280 and 375, not here.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  usePathname: () => "/operate/roster",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("../../login/actions", () => ({ signOut: vi.fn() }));
vi.mock("@/lib/services/roster-board", () => ({ listRosterBoard: vi.fn() }));

import { resolveOperatorAccess, type ResolvedOperator } from "@/lib/auth/operator";
import type { RosterBoardData, RosterBoardRow } from "@/lib/services/roster-board";
import { listRosterBoard } from "@/lib/services/roster-board";
import RosterPage from "./page";

function operator(roleCodes: string[]): ResolvedOperator {
  return {
    authUserId: "11111111-1111-4111-8111-111111111111",
    personId: "22222222-2222-4222-8222-222222222222",
    displayName: "Morgan Pike",
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

function pageProps(query: Record<string, string> = {}) {
  return {
    params: Promise.resolve({}),
    searchParams: Promise.resolve(query),
  } as unknown as Parameters<typeof RosterPage>[0];
}

function row(overrides: Partial<RosterBoardRow> = {}): RosterBoardRow {
  return {
    membershipId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    personId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    displayName: "Avery Fielding",
    status: "active",
    entry: "returning",
    college: null,
    matriculationYear: null,
    expectedGraduationYear: null,
    degreeField: null,
    hasMobile: true,
    hasEmail: true,
    missingCount: 0,
    phoneForCall: "+44 7700 900101",
    itemsTotal: 2,
    itemsResolved: 2,
    requiredOutstanding: 0,
    offencePosition: "QB",
    defencePosition: null,
    specialTeamsPosition: null,
    blueNumbers: ["7"],
    whiteNumbers: [],
    coachGroup: null,
    formalwear: { tie: false, bowtie: false, socks: false },
    blues: "None",
    eligibility: null,
    availability: "green",
    ...overrides,
  };
}

function givenBoard(overrides: Partial<RosterBoardData> = {}): void {
  vi.mocked(listRosterBoard).mockResolvedValue({
    season: { id: "season", label: "2026-27", status: "active" },
    rows: [row()],
    totalInSeason: 1,
    jerseyHolders: { blue: { "7": "Avery Fielding" }, white: {} },
    positionOptions: {
      offence: [{ code: "QB", label: "Quarterback" }],
      defence: [{ code: "CB", label: "Cornerback" }],
      specialTeams: [{ code: "KO", label: "Kickoff" }],
    },
    ...overrides,
  } as RosterBoardData);
}

describe("REQ-authority — four-role only, for the grid and every column on it", () => {
  it("refuses a coach — LAN-110's narrow-recorder boundary, which fires ahead of any capability check — before the board is ever read", async () => {
    signedInAs(["head_coach"]);
    givenBoard();

    render(await RosterPage(pageProps()));

    expect(screen.getByTestId("operator-not-permitted")).toBeInTheDocument();
    expect(listRosterBoard).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "Roster" })).not.toBeInTheDocument();
  });

  it("refuses a single-purpose committee role, naming what the action needs", async () => {
    signedInAs(["kit_manager"]);
    givenBoard();

    render(await RosterPage(pageProps()));

    expect(screen.getByTestId("operator-not-permitted")).toBeInTheDocument();
    expect(screen.getByTestId("required-role")).toHaveTextContent("President");
    expect(listRosterBoard).not.toHaveBeenCalled();
  });

  for (const role of [
    "president",
    "vice_president",
    "secretary",
    "general_manager",
    "it_officer",
  ]) {
    it(`admits the ${role} seat`, async () => {
      signedInAs([role]);
      givenBoard();
      render(await RosterPage(pageProps()));
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Roster");
    });
  }
});

describe("the board itself", () => {
  beforeEach(() => signedInAs(["secretary"]));

  it("shows the heading, season and column count", async () => {
    givenBoard();
    render(await RosterPage(pageProps()));

    expect(screen.getByTestId("season-label")).toHaveTextContent("Season 2026-27");
    expect(screen.getByTestId("season-label")).toHaveTextContent("1 player");
    expect(screen.getByTestId("season-label")).toHaveTextContent("20 columns");
  });

  it("bands the columns as Person, Onboarding, Season", async () => {
    givenBoard();
    render(await RosterPage(pageProps()));

    const board = screen.getByTestId("roster-board");
    expect(within(board).getByText("Person")).toBeInTheDocument();
    // "Onboarding" is both the band label and its one column's label — both
    // legitimately present, so this asserts there are two rather than one.
    expect(within(board).getAllByText("Onboarding")).toHaveLength(2);
    expect(within(board).getByText("Season")).toBeInTheDocument();
  });

  it("carries the twenty approved columns, with raw email and phone gone", async () => {
    givenBoard();
    render(await RosterPage(pageProps()));

    const board = screen.getByTestId("roster-board");
    for (const label of [
      "Player",
      "College",
      "Contactable",
      "Missing",
      "Status",
      "Entry",
      "Offence",
      "Defence",
      "Special teams",
      "Blue #",
      "White #",
      "Coach group",
      "Formalwear",
      "Blues",
      "Eligibility",
      "Availability",
    ]) {
      expect(within(board).getByText(label)).toBeInTheDocument();
    }
    // "Email" legitimately appears as the Contactable column's own indicator
    // chip (not a raw value) — what must be gone is a column *header* named
    // for the value rather than the indicator.
    const headers = within(board)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent?.trim());
    expect(headers).not.toContain("Email");
    expect(headers).not.toContain("Phone");
  });

  it("renders the board inside its own named scroll container", async () => {
    // jsdom does not compute MUI's emotion-driven `overflow: auto`, so the
    // scrolling contract itself is proved by the browser preflight at 1280
    // and 375 — this only proves the container the wireframe calls for exists.
    givenBoard();
    render(await RosterPage(pageProps()));

    expect(screen.getByTestId("roster-board")).toBeInTheDocument();
  });

  it("links the missing-data flag into the queue LAN-184 owns", async () => {
    givenBoard({ rows: [row({ missingCount: 2 })] } as Partial<RosterBoardData>);
    render(await RosterPage(pageProps()));

    expect(screen.getByTestId("missing-count")).toHaveAttribute("href", "/operate/people/missing");
  });

  it("shows not recorded, never a blank, for a player with almost nothing recorded", async () => {
    givenBoard({
      rows: [
        row({
          college: null,
          coachGroup: null,
          eligibility: null,
        }),
      ],
    } as Partial<RosterBoardData>);
    render(await RosterPage(pageProps()));

    expect(screen.getAllByText("Not recorded").length).toBeGreaterThan(0);
  });

  it("carries the person-column caption pointing at the record", async () => {
    givenBoard();
    render(await RosterPage(pageProps()));

    expect(screen.getAllByText("edit on the record").length).toBeGreaterThan(0);
  });

  it("renders one card per membership for the condensed view", async () => {
    givenBoard();
    render(await RosterPage(pageProps()));

    expect(screen.getAllByTestId("roster-card")).toHaveLength(1);
  });

  it("offers voice call as the only channel action on the condensed card", async () => {
    givenBoard();
    render(await RosterPage(pageProps()));

    const card = screen.getAllByTestId("roster-card")[0];
    const call = within(card).getByRole("link", { name: "Call" });
    expect(call).toHaveAttribute("href", "tel:+44 7700 900101");
  });
});

describe("both empty states", () => {
  beforeEach(() => signedInAs(["secretary"]));

  it("tells a genuinely empty season apart from a filtered one", async () => {
    givenBoard({ rows: [], totalInSeason: 0 });
    render(await RosterPage(pageProps()));

    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "This season has no memberships yet",
    );
    expect(screen.getByTestId("roster-empty")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
  });

  it("shows the filtered-empty copy and Clear filters when a filter matches nothing", async () => {
    givenBoard({ rows: [row()], totalInSeason: 1 });
    render(await RosterPage(pageProps({ q: "zzzznobody" })));

    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "No memberships match these filters",
    );
    expect(screen.getByTestId("roster-filter-empty")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
  });
});

describe("the Filtered by chip bar", () => {
  beforeEach(() => signedInAs(["secretary"]));

  it("shows a chip for a filter set from the URL, whichever control it came from", async () => {
    givenBoard();
    render(await RosterPage(pageProps({ status: "active" })));

    const bar = screen.getByTestId("filter-chips");
    expect(within(bar).getByText(/Status:/)).toBeInTheDocument();
  });

  it("ignores a filter naming a column outside this viewer's grant", async () => {
    // Every four-role viewer holds every column today, so this proves the
    // fail-closed parsing in `page.tsx` rather than a live narrowing.
    givenBoard();
    render(await RosterPage(pageProps({ notAColumn: "whatever" })));

    expect(screen.queryByTestId("filter-chips")).not.toBeInTheDocument();
  });
});
