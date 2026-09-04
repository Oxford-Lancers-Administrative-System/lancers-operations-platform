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
import { act, fireEvent, render, screen, within } from "@testing-library/react";

const routerPush = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  usePathname: () => "/operate/roster",
  useRouter: () => ({ push: routerPush, replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("../../login/actions", () => ({ signOut: vi.fn() }));
vi.mock("@/lib/services/roster-board", () => ({ listRosterBoard: vi.fn() }));
// Every board cell's server action, mocked so opening and committing a cell in
// these tests never reaches a service or a database — the writes themselves
// are proved for real in `src/lib/services/roster-board.test.ts` and
// `src/lib/services/membership.test.ts`.
vi.mock("./board-actions", () => ({
  commitAvailabilityAction: vi.fn().mockResolvedValue({ error: null }),
  commitBluesAction: vi.fn().mockResolvedValue({ error: null }),
  commitCoachGroupAction: vi.fn().mockResolvedValue({ error: null }),
  commitEligibilityAction: vi.fn().mockResolvedValue({ error: null }),
  commitEntryAction: vi.fn().mockResolvedValue({ error: null }),
  commitFormalwearItemAction: vi.fn().mockResolvedValue({ error: null }),
  commitJerseyNumbersAction: vi.fn().mockResolvedValue({ error: null }),
  commitPositionAction: vi.fn().mockResolvedValue({ error: null }),
}));
vi.mock("./actions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./actions")>();
  return { ...actual, setMembershipStatusAction: vi.fn().mockResolvedValue({ error: null }) };
});

import { resolveOperatorAccess, type ResolvedOperator } from "@/lib/auth/operator";
import type { RosterBoardData, RosterBoardRow } from "@/lib/services/roster-board";
import { listRosterBoard } from "@/lib/services/roster-board";
import { setMembershipStatusAction } from "./actions";
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
    aliases: [],
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

describe("LAN-215 — the Add players menu", () => {
  beforeEach(() => signedInAs(["secretary"]));

  it("replaces the old single Add player button with a two-entry menu, Brian's own wording", async () => {
    givenBoard();
    render(await RosterPage(pageProps()));

    expect(screen.queryByRole("button", { name: "Add player" })).not.toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: "Add players" });

    await act(async () => {
      fireEvent.click(trigger);
    });

    const addOne = screen.getByRole("menuitem", { name: /Add one player/ });
    const bulkImport = screen.getByRole("menuitem", { name: /Bulk import players/ });
    expect(addOne).toHaveAttribute("href", "/operate/roster/new");
    expect(bulkImport).toHaveAttribute("href", "/operate/roster/import");
  });

  it("offers the same menu from the genuinely-empty season's own call to action", async () => {
    // The heading keeps its own "Add players" trigger even on an empty
    // season (unchanged by this package), so the empty state's own copy of
    // it is the second of two — this proves the second one carries the same
    // two entries, not that there is exactly one trigger on the page.
    givenBoard({ rows: [], totalInSeason: 0 });
    render(await RosterPage(pageProps()));

    expect(screen.queryByRole("button", { name: "Add player" })).not.toBeInTheDocument();
    const triggers = screen.getAllByRole("button", { name: "Add players" });
    expect(triggers.length).toBeGreaterThanOrEqual(1);

    await act(async () => {
      fireEvent.click(triggers[triggers.length - 1]);
    });

    expect(screen.getAllByRole("menuitem", { name: /Add one player/ })[0]).toHaveAttribute(
      "href",
      "/operate/roster/new",
    );
    expect(screen.getAllByRole("menuitem", { name: /Bulk import players/ })[0]).toHaveAttribute(
      "href",
      "/operate/roster/import",
    );
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

// ---------------------------------------------------------------------------
// LAN-186 item 11 — filtering moves to the browser, never a re-fetch
// ---------------------------------------------------------------------------

describe("filtering never re-fetches the board (item 11)", () => {
  beforeEach(() => {
    signedInAs(["secretary"]);
    routerPush.mockClear();
  });

  it("changing a column's own filter never calls router.push, and never re-fetches", async () => {
    givenBoard({
      rows: [
        row({ membershipId: "a", status: "active" }),
        row({ membershipId: "b", status: "onboarding" }),
      ],
    });
    render(await RosterPage(pageProps()));
    const fetchesSoFar = vi.mocked(listRosterBoard).mock.calls.length;

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Filter Status" }));
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole("menuitem", { name: "Onboarding" }));
    });

    // The board narrowed to the one onboarding row — the filter did apply —
    // and it did so without asking Next.js to re-render this route: no
    // `router.push`, and `listRosterBoard()` was never called again.
    expect(screen.getAllByTestId("roster-row")).toHaveLength(1);
    expect(routerPush).not.toHaveBeenCalled();
    expect(vi.mocked(listRosterBoard).mock.calls.length).toBe(fetchesSoFar);
  });

  it("still keeps the URL in step, via history rather than navigation", async () => {
    givenBoard({ rows: [row({ status: "active" })] });
    const replaceState = vi.spyOn(window.history, "replaceState");
    render(await RosterPage(pageProps()));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Filter Status" }));
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole("menuitem", { name: "Active" }));
    });

    expect(replaceState).toHaveBeenCalledWith(null, "", expect.stringContaining("status=active"));
    replaceState.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// LAN-186 owner walkthrough — the Status column is a free in-cell select
// ---------------------------------------------------------------------------

/**
 * The `data-testid="editable-cell"` that contains this exact closed text.
 *
 * The same word can legitimately appear more than once in this DOM — a band
 * label, a column header and a row's own value can all read "Onboarding", and
 * jsdom renders the phone cards alongside the desktop table (per this file's
 * own header note) — so this takes every match and keeps the one actually
 * sitting inside an editable cell, rather than asserting there is exactly one
 * match at all.
 */
function editableCellFor(text: string): HTMLElement {
  const board = screen.getByTestId("roster-board");
  const matches = within(board).getAllByText(text);
  const cell = matches
    .map((node) => node.closest('[data-testid="editable-cell"]'))
    .find((found): found is HTMLElement => found !== null);
  if (!cell) throw new Error(`"${text}" is not inside any editable cell on the board`);
  return cell;
}

describe("the Status column — one in-cell dropdown, no forms, no dialog", () => {
  beforeEach(() => signedInAs(["secretary"]));

  it("opens a plain select, not the old activate/deactivate controls", async () => {
    givenBoard({ rows: [row({ status: "onboarding" })] });
    render(await RosterPage(pageProps()));

    await act(async () => {
      fireEvent.click(editableCellFor("Onboarding"));
    });

    for (const label of ["Onboarding", "Active", "Inactive", "Departed", "Archived"]) {
      expect(screen.getByRole("option", { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: "Activate membership" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark inactive" })).not.toBeInTheDocument();
  });

  /**
   * The regression this exists to catch: an earlier version of this decision
   * put a confirmation on exactly this pair, and Brian withdrew it in the same
   * walkthrough (journal event 132's correction). Reintroducing that dialog is
   * what this test would fail on.
   */
  it("commits onboarding → active with no confirmation dialog anywhere in the DOM", async () => {
    givenBoard({ rows: [row({ status: "onboarding" })] });
    render(await RosterPage(pageProps()));

    await act(async () => {
      fireEvent.click(editableCellFor("Onboarding"));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("option", { name: "Active" }));
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText(/\bconfirm\b/i)).not.toBeInTheDocument();
    expect(setMembershipStatusAction).toHaveBeenCalledWith({
      membershipId: row().membershipId,
      status: "active",
    });
  });

  /**
   * Q-12's free ladder, exercised from the board itself: a destination a
   * transition table used to forbid outright — `active` straight to
   * `archived` — commits exactly like every other pick, no different dialog,
   * no different refusal.
   */
  it("commits a flip straight to `archived`, which no transition table permitted before", async () => {
    givenBoard({ rows: [row({ status: "active" })] });
    render(await RosterPage(pageProps()));

    await act(async () => {
      fireEvent.click(editableCellFor("Active"));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("option", { name: "Archived" }));
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(setMembershipStatusAction).toHaveBeenCalledWith({
      membershipId: row().membershipId,
      status: "archived",
    });
  });

  // No test here for "an operator who can see the board but cannot change
  // status": today `person_record_authority` (the board's own gate) is a
  // subset of `membership_activation`'s role list (`capabilities.ts`), so
  // every seat that reaches this page at all already holds the stronger
  // grant. The `canManageStatus` branch exists defensively — the same
  // "moot while four-role, build it anyway" reasoning `board-columns.ts`
  // states for column-level `requires` — and is exercised for a real role
  // combination on the player page instead, where the two grants differ
  // (`roster-screens.test.tsx`, "an operator who may not change status").
});

// ---------------------------------------------------------------------------
// LAN-186 item 9 — the label alone, never the raw value beside it
// ---------------------------------------------------------------------------

describe("select cells never echo the raw value beside the label (item 9)", () => {
  beforeEach(() => signedInAs(["secretary"]));

  it('offers Eligible / Pending / Ineligible / Expired, not "eligible · Eligible"', async () => {
    givenBoard({ rows: [row({ eligibility: "eligible" })] });
    render(await RosterPage(pageProps()));

    await act(async () => {
      fireEvent.click(editableCellFor("Eligible"));
    });

    for (const label of ["Eligible", "Pending", "Ineligible", "Expired"]) {
      expect(screen.getByRole("option", { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByText(/eligible\s*·\s*Eligible/i)).not.toBeInTheDocument();
  });

  it("shows the code alone in the cell; the open dropdown pairs it with the full name (item 7, corrected)", async () => {
    // Item 7's cell half stands unchanged: closed, the board shows the
    // club's vocabulary code and never the full name.
    givenBoard({ rows: [row({ offencePosition: "QB" })] });
    render(await RosterPage(pageProps()));

    expect(screen.getByText("QB")).toBeInTheDocument();
    expect(screen.queryByText("Quarterback")).not.toBeInTheDocument();

    // Item 7's dropdown half is superseded by Brian's walkthrough of the
    // built board: "If it says QB, it should be QB-quarterback." The open
    // list pairs the code with the full name; the code alone is gone from it.
    await act(async () => {
      fireEvent.click(editableCellFor("QB"));
    });

    expect(screen.getByRole("option", { name: "QB — Quarterback" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "QB" })).not.toBeInTheDocument();
  });

  /**
   * RVW-186-002: the in-cell editor and the column filter's own popover are
   * two separate render paths over the same `optionListLabel` — Q-14 asked
   * for the pairing in "the dropdown", and that covers both. No test opened
   * the filter popover for a position column, so a plausible future edit at
   * that one call site (`roster-board.tsx`, the filter `Menu`) could drop the
   * full name there and nothing would notice; this closes that gap.
   */
  it("pairs the code with the full name in a position column's filter popover too (RVW-186-002)", async () => {
    givenBoard({ rows: [row({ offencePosition: "QB" })] });
    render(await RosterPage(pageProps()));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Filter Offence" }));
    });

    expect(await screen.findByRole("menuitem", { name: "QB — Quarterback" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "QB" })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// LAN-186 item 15 — the phone card is a way into the record, not a mini board
// ---------------------------------------------------------------------------

describe("the phone card — a way into the record, not a miniature board", () => {
  beforeEach(() => signedInAs(["secretary"]));

  it("carries only the name, status and missing flag — nothing else from the twenty columns", async () => {
    givenBoard({
      rows: [
        row({
          displayName: "Avery Fielding",
          status: "active",
          missingCount: 2,
          coachGroup: "Offense",
          availability: "green",
        }),
      ],
    });
    render(await RosterPage(pageProps()));

    const card = screen.getAllByTestId("roster-card")[0];
    expect(within(card).getByText("Avery Fielding")).toBeInTheDocument();
    expect(within(card).getByText("Active")).toBeInTheDocument();
    expect(within(card).getByTestId("card-missing-flag")).toHaveTextContent("2 missing");
    // Nothing else the board carries for this row — position, coach group,
    // availability and the onboarding label are all desktop-table content.
    expect(within(card).queryByText("Offense")).not.toBeInTheDocument();
    expect(within(card).queryByText(/green/i)).not.toBeInTheDocument();
  });

  it("hides the missing flag entirely when nothing is missing", async () => {
    givenBoard({ rows: [row({ missingCount: 0 })] });
    render(await RosterPage(pageProps()));

    const card = screen.getAllByTestId("roster-card")[0];
    expect(within(card).queryByTestId("card-missing-flag")).not.toBeInTheDocument();
  });

  it("makes the whole card a link into the player's record", async () => {
    givenBoard({ rows: [row()] });
    render(await RosterPage(pageProps()));

    const card = screen.getAllByTestId("roster-card")[0];
    const open = within(card).getByTestId("roster-card-open");
    expect(open.tagName).toBe("A");
    expect(open).toHaveAttribute("href", `/operate/roster/${row().membershipId}`);
  });

  it("keeps the call button a separate control from the card-opening link", async () => {
    givenBoard({ rows: [row({ phoneForCall: "+44 7700 900101" })] });
    render(await RosterPage(pageProps()));

    const card = screen.getAllByTestId("roster-card")[0];
    const open = within(card).getByTestId("roster-card-open");
    const call = within(card).getByRole("link", { name: "Call" });

    expect(call).toHaveAttribute("href", "tel:+44 7700 900101");
    // Two independent tap targets: the call link is never a descendant of the
    // card-opening link, or a tap meant for one would always fire the other.
    expect(open.contains(call)).toBe(false);
    expect(call.contains(open)).toBe(false);
  });
});
