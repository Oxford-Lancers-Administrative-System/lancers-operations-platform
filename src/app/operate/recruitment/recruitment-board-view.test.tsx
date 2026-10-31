// @vitest-environment jsdom
/**
 * `RecruitmentBoardView`'s phone card — `W1-01`'s approved mockup, its
 * correction round 1 (F-LAN204-004: the shipped card had dropped the roster
 * board's own voice-call quick action), and LAN-319.
 *
 * LAN-319 reverses round 1's other half. That correction made the card's
 * status a static chip, on the mockup's own drawing; Clint then found the
 * consequence in use — "THIS ONLY WORKS ON DESKTOP, NOT ON PHONE" — because
 * the board is where a status is changed and the phone is where recruitment
 * is run. The card now carries the same control the table's cell does, with
 * the same interrupt and the same confirm.
 *
 * jsdom renders both the desktop table and the phone card at once
 * (breakpoints are not evaluated), so this queries inside the phone card's
 * own test id rather than asserting on the whole document.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("./board-actions", () => ({
  setRecruitmentStatusAction: vi.fn(),
  flipRecruitmentProspectAction: vi.fn(),
}));
// LAN-404 — a server action, so it reaches `server-only` from a client test.
vi.mock("./group-preference-actions", () => ({
  saveRecruitmentCollapsedGroupsAction: vi.fn().mockResolvedValue(undefined),
}));

import { flipRecruitmentProspectAction, setRecruitmentStatusAction } from "./board-actions";
import { BOARD_SCROLLBAR_GUTTER_PX } from "../roster/board-columns";
import type { RecruitmentBoardRow } from "@/lib/services/recruitment-board";
import { templateColourFor } from "@/lib/services/event-template-input";
import type { Season } from "@/lib/services/seasons";
import RecruitmentBoardView from "./recruitment-board-view";

const SEASON: Season = {
  id: "season-1",
  label: "2026-27",
  status: "open",
  startsOn: null,
  endsOn: null,
};

function row(overrides: Partial<RecruitmentBoardRow> = {}): RecruitmentBoardRow {
  return {
    prospectId: "prospect-1",
    personId: "person-1",
    displayName: "Clementine Varrow",
    givenName: "Clementine",
    familyName: "Varrow",
    aliases: [],
    college: "Balliol",
    matriculationYear: 2026,
    expectedGraduationYear: 2029,
    degreeField: null,
    hasMobile: true,
    hasEmail: false,
    phoneForCall: "07700 900123",
    status: "engaged",
    source: "Taster session",
    firstContactOn: "2026-05-01T09:00:00.000Z",
    personalSent: false,
    recruitmentSent: false,
    consent: "granted",
    consentChangedAt: null,
    consentByOperator: false,
    playedBefore: null,
    watchedBefore: null,
    positionInterest: null,
    gearOwned: null,
    howTheyHeard: null,
    anythingElse: null,
    events: {},
    attendedAnyEvent: false,
    ...overrides,
  };
}

function renderBoard(rows: readonly RecruitmentBoardRow[]) {
  return render(
    <RecruitmentBoardView
      operatorPersonId="operator-1"
      season={SEASON}
      rows={rows}
      events={[]}
      totalInSeason={rows.length}
      initialSearch=""
      initialFilters={{}}
      initialSort={[]}
    />,
  );
}

describe("the phone card", () => {
  it("carries the table's own status control, not a chip that cannot be changed — LAN-319", () => {
    renderBoard([row()]);
    const card = screen.getByTestId("recruitment-card-prospect-1");
    expect(within(card).getByText("Engaged")).toBeInTheDocument();

    fireEvent.click(within(card).getByTestId("recruitment-card-status-select-prospect-1"));
    // Clicking opens the same `Select` the desktop cell opens, every value
    // offered — `Q-every-status-reachable`.
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Identified",
      "Engaged",
      "Committed",
      "Joined",
      "Declined",
      "Disengaged",
      "Void",
    ]);
  });

  it("interrupts a join from the card exactly as the record does, and writes nothing on cancel", () => {
    renderBoard([row()]);
    const card = screen.getByTestId("recruitment-card-prospect-1");

    fireEvent.click(within(card).getByTestId("recruitment-card-status-select-prospect-1"));
    fireEvent.click(screen.getByRole("option", { name: "Joined" }));

    expect(screen.getByText("Join Clementine Varrow?")).toBeInTheDocument();
    expect(screen.getByText("Create a season membership for 2026-27")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(flipRecruitmentProspectAction).not.toHaveBeenCalled();
    expect(setRecruitmentStatusAction).not.toHaveBeenCalled();
  });

  it("commits an uninterrupted status straight from the card", async () => {
    vi.mocked(setRecruitmentStatusAction).mockResolvedValue({ error: null });
    renderBoard([row()]);
    const card = screen.getByTestId("recruitment-card-prospect-1");

    fireEvent.click(within(card).getByTestId("recruitment-card-status-select-prospect-1"));
    fireEvent.click(screen.getByRole("option", { name: "Committed" }));

    await waitFor(() =>
      expect(setRecruitmentStatusAction).toHaveBeenCalledWith({
        prospectId: "prospect-1",
        toStatus: "committed",
        reason: undefined,
      }),
    );
  });

  it("carries its own separate call action, wired to the recruit's own number", () => {
    renderBoard([row({ phoneForCall: "07700 900123" })]);
    const card = screen.getByTestId("recruitment-card-prospect-1");
    const call = within(card).getByRole("link", { name: "Call" });
    expect(call).toHaveAttribute("href", "tel:07700 900123");
  });

  it("disables the call action rather than hiding it when no number is on file", () => {
    renderBoard([row({ phoneForCall: null })]);
    const card = screen.getByTestId("recruitment-card-prospect-1");
    // The call action is `component="a"` (an anchor, so `tel:` navigation
    // works without JS) — the same `../roster/roster-board.tsx` idiom. MUI's
    // `disabled` on a non-form element carries no native `disabled`
    // attribute for `toBeDisabled()` to see; it renders `aria-disabled`,
    // drops the `href`, and switches the accessible role from "link" to
    // "button" — which is exactly what this asserts, rather than a form
    // control's own `disabled` property.
    const call = within(card).getByRole("button", { name: "Call" });
    expect(call).toHaveAttribute("aria-disabled", "true");
    expect(call).not.toHaveAttribute("href");
  });

  it("still opens the record from the whole card, per the roster board's own tap-target rule", () => {
    renderBoard([row()]);
    const open = screen.getByTestId("recruitment-card-open");
    expect(open).toHaveAttribute("href", "/operate/recruitment/prospect-1");
  });
});

describe("the per-event RSVP and Attendance columns — sortable (Brian, 2026-09-02)", () => {
  const EVENT = {
    eventId: "event-1",
    name: "Taster session",
    date: "2026-05-10",
    colourKey: "teal",
  };

  function eventRows() {
    // Same status and first-contact date, so the *default* order (before any
    // sort click) is simply array order — array sort is stable — giving a
    // known "before" state for the reorder assertion below.
    const a = row({
      prospectId: "a",
      displayName: "Amory Vance",
      firstContactOn: "2026-05-01T09:00:00.000Z",
      events: { [EVENT.eventId]: { rsvp: "yes", attendance: "present" } },
    });
    const b = row({
      prospectId: "b",
      displayName: "Beatrix Nowell",
      firstContactOn: "2026-05-01T09:00:00.000Z",
      events: { [EVENT.eventId]: { rsvp: "no", attendance: "absent" } },
    });
    return [a, b];
  }

  function renderWithEvent(rows: readonly RecruitmentBoardRow[]) {
    return render(
      <RecruitmentBoardView
        operatorPersonId="operator-1"
        season={SEASON}
        rows={rows}
        events={[EVENT]}
        totalInSeason={rows.length}
        initialSearch=""
        initialFilters={{}}
        initialSort={[]}
      />,
    );
  }

  function rowOrder(): string[] {
    return screen
      .getAllByTestId(/^recruitment-row-/)
      .map((el) => el.getAttribute("data-testid")?.replace("recruitment-row-", "") ?? "");
  }

  it("draws the event's band head in its template colour, apart from Recruitment's", () => {
    renderWithEvent(eventRows());
    const head = (band: string) => screen.getByTestId(`band-toggle-${band}`).closest("th");
    expect(head("events:event-1")).toHaveStyle({
      backgroundColor: templateColourFor("teal").accent,
    });
    expect(head("recruitment")).not.toHaveStyle({
      backgroundColor: templateColourFor("teal").accent,
    });
  });

  it("sorts by RSVP on click, exactly as the person/recruitment columns already sort", () => {
    renderWithEvent(eventRows());
    expect(rowOrder()).toEqual(["a", "b"]); // unsorted: array order (a: yes, b: no)

    fireEvent.click(screen.getByRole("button", { name: "RSVP" }));
    expect(rowOrder()).toEqual(["b", "a"]); // ascending: "no" sorts before "yes"

    fireEvent.click(screen.getByRole("button", { name: "RSVP" }));
    expect(rowOrder()).toEqual(["a", "b"]); // second click reverses, the shared idiom
  });

  it("sorts by Attendance on click, exactly as the person/recruitment columns already sort", () => {
    renderWithEvent(eventRows());
    expect(rowOrder()).toEqual(["a", "b"]); // unsorted: array order (a: present, b: absent)

    fireEvent.click(screen.getByRole("button", { name: "Attendance" }));
    expect(rowOrder()).toEqual(["b", "a"]); // ascending: "absent" sorts before "present"

    fireEvent.click(screen.getByRole("button", { name: "Attendance" }));
    expect(rowOrder()).toEqual(["a", "b"]); // second click reverses, the shared idiom
  });

  // W-2, walk correction: `present`/`yes` rendered raw and lower-case,
  // sitting beside the correctly capitalised "Not recorded" — this fails
  // against the pre-fix `String(value)` pass-through and passes once these
  // cells render through the same `RSVP_LABEL`/`ATTENDANCE_LABEL` the record
  // page already uses.
  it("capitalises the RSVP and Attendance cells instead of the raw database enum", () => {
    renderWithEvent(eventRows());
    const rowA = within(screen.getByTestId("recruitment-row-a"));
    expect(rowA.getByText("Yes")).toBeInTheDocument();
    expect(rowA.getByText("Present")).toBeInTheDocument();
    expect(rowA.queryByText("yes")).toBeNull();
    expect(rowA.queryByText("present")).toBeNull();

    const rowB = within(screen.getByTestId("recruitment-row-b"));
    // `personalSent`/`recruitmentSent` also read "No" for this row (already
    // correctly capitalised, through `displayOf`'s own boolean case), so
    // "No" is asserted present rather than unique.
    expect(rowB.getAllByText("No").length).toBeGreaterThanOrEqual(1);
    expect(rowB.getByText("Absent")).toBeInTheDocument();
    expect(rowB.queryByText("no")).toBeNull();
    expect(rowB.queryByText("absent")).toBeNull();
  });

  it("renders 'Not recorded' for an event this recruit has no RSVP/attendance cell for", () => {
    renderWithEvent([row({ prospectId: "c", displayName: "Cassius Wren", events: {} })]);
    const rowC = within(screen.getByTestId("recruitment-row-c"));
    expect(rowC.getAllByText("Not recorded").length).toBeGreaterThanOrEqual(2);
  });
});

describe("First contact shows the date and time — LAN-486", () => {
  it("renders the instant on the club's clock, in the app's date-time format", () => {
    // 09:00 UTC on 1 May is 10:00 in London (BST).
    renderBoard([row({ firstContactOn: "2026-05-01T09:00:00.000Z" })]);
    const boardRow = within(screen.getByTestId("recruitment-row-prospect-1"));
    expect(boardRow.getByText("1 May 2026, 10:00")).toBeInTheDocument();
  });
});

describe("First contact sits immediately after Status — LAN-493", () => {
  it("draws the Status and First contact headers side by side, in that order", () => {
    renderBoard([row()]);
    const headers = screen
      .getAllByRole("columnheader")
      .map((header) => header.textContent?.trim() ?? "");
    const status = headers.findIndex((text) => text.startsWith("Status"));
    expect(status).toBeGreaterThanOrEqual(0);
    expect(headers[status + 1]).toMatch(/^First contact/);
  });
});

describe("W-2, walk correction — Played before / Watched before are capitalised", () => {
  it("renders 'Yes'/'No', not the raw 'yes'/'no' database enum", () => {
    // `personalSent`/`recruitmentSent` also render "Yes"/"No" (already
    // correctly capitalised, through `displayOf`'s own boolean case) —
    // pinned true here so this test's "Yes"/"No" assertions read
    // unambiguously off `playedBefore`/`watchedBefore` alone.
    renderBoard([
      row({
        playedBefore: "yes",
        watchedBefore: "no",
        personalSent: true,
        recruitmentSent: true,
      }),
    ]);
    const boardRow = within(screen.getByTestId("recruitment-row-prospect-1"));
    expect(boardRow.getAllByText("Yes").length).toBeGreaterThanOrEqual(1);
    expect(boardRow.getByText("No")).toBeInTheDocument();
    expect(boardRow.queryByText("yes")).toBeNull();
    expect(boardRow.queryByText("no")).toBeNull();
  });

  it("renders 'Not recorded' once no answer is on file, unchanged", () => {
    renderBoard([row({ playedBefore: null, watchedBefore: null })]);
    const boardRow = within(screen.getByTestId("recruitment-row-prospect-1"));
    expect(boardRow.getAllByText("Not recorded").length).toBeGreaterThanOrEqual(2);
  });
});

/**
 * LAN-395's other board. `recruitment-board-view.tsx` shares the roster
 * board's scroll container shape and the same constant, so the bar lands on
 * this board's last column for the same reason and is fixed by the same two
 * rules. Asserted here rather than taken on trust from the roster's own test:
 * they are two elements in two files, and only one of them was reported.
 */
describe("the board's scrollbar gutter — LAN-395", () => {
  it("reserves the scrollbar's width on the scrolling element", () => {
    renderBoard([row()]);

    const table = screen.getByTestId("recruitment-board-table");
    expect(window.getComputedStyle(table).getPropertyValue("scrollbar-gutter")).toBe("stable");
    expect(window.getComputedStyle(table).paddingRight).toBe(`${BOARD_SCROLLBAR_GUTTER_PX}px`);
    expect(window.getComputedStyle(table).overflow).toBe("auto");
  });
});

describe("Personal sent follows Person information, as the record does — LAN-423", () => {
  function renderWith(access: {
    recruit_person: "none" | "view" | "edit";
    recruit_details: "none" | "view" | "edit";
  }) {
    return render(
      <RecruitmentBoardView
        operatorPersonId="operator-1"
        season={SEASON}
        rows={[row()]}
        events={[]}
        totalInSeason={1}
        initialSearch=""
        initialFilters={{}}
        initialSort={[]}
        access={{ ...access, recruit_events: "none" }}
      />,
    );
  }

  it("is not shown to a Recruit-details-only seat, as column or filter", () => {
    const { container } = renderWith({ recruit_person: "none", recruit_details: "view" });
    expect(container.querySelector('[data-testid="recruitment-filter-personal-sent"]')).toBeNull();
    expect(within(container).queryAllByText("Personal sent")).toEqual([]);
  });

  it("is shown to a Person-information seat without Recruit details", () => {
    const { container } = renderWith({ recruit_person: "view", recruit_details: "none" });
    expect(
      container.querySelector('[data-testid="recruitment-filter-personal-sent"]'),
    ).not.toBeNull();
    expect(within(container).getAllByText("Personal sent").length).toBeGreaterThan(0);
  });
});

/**
 * LAN-495 — the Sort sheet, as on the roster. It replaced LAN-426's phone
 * select, so the cases LAN-426 proved are kept here in its terms: first name,
 * last name and status, either way; status alphabetical; remembered per board.
 */
describe("LAN-495 — the Recruits board's Sort sheet", () => {
  const RECRUITS = [
    row({
      prospectId: "p-zed",
      displayName: "Zed Adams",
      givenName: "Zed",
      familyName: "Adams",
      status: "joined",
      college: "Keble",
      firstContactOn: "2026-10-07T18:31:00.000Z",
    }),
    row({
      prospectId: "p-amy",
      displayName: "Amy Young",
      givenName: "Amy",
      familyName: "Young",
      status: "committed",
      college: "Balliol",
      firstContactOn: "2026-10-07T08:05:00.000Z",
    }),
    row({
      prospectId: "p-mia",
      displayName: "Mia Brown",
      givenName: "Mia",
      familyName: "Brown",
      status: "identified",
      college: "Balliol",
      firstContactOn: null,
    }),
  ];

  function cardOrder(): string[] {
    return [...document.querySelectorAll('[data-testid^="recruitment-card-p-"]')]
      .map((card) => card.getAttribute("data-testid") ?? "")
      .filter((id) => /^recruitment-card-p-[a-z]+$/.test(id))
      .map((id) => id.replace("recruitment-card-", ""));
  }

  function tableOrder(): string[] {
    return [...document.querySelectorAll('[data-testid^="recruitment-row-p-"]')].map((row) =>
      (row.getAttribute("data-testid") ?? "").replace("recruitment-row-", ""),
    );
  }

  /** Picks from the menu `testId` opens — the newest listbox, as a closing one can linger. */
  async function pick(testId: string, label: string) {
    fireEvent.mouseDown(within(screen.getByTestId(testId)).getByRole("combobox"));
    const listboxes = await screen.findAllByRole("listbox");
    fireEvent.click(within(listboxes.at(-1)!).getByRole("option", { name: label }));
  }

  /** The options of the menu `testId` opens — the newest listbox, as a closing one can linger. */
  async function optionsOf(testId: string): Promise<(string | null)[]> {
    fireEvent.mouseDown(within(screen.getByTestId(testId)).getByRole("combobox"));
    const listboxes = await screen.findAllByRole("listbox");
    return within(listboxes.at(-1)!)
      .getAllByRole("option")
      .map((option) => option.textContent);
  }

  beforeEach(() => {
    window.history.replaceState(null, "", "/operate/recruitment");
    window.localStorage.clear();
  });

  it("opens the bottom sheet from the phone bar with three rows, Clear and Done", () => {
    renderBoard(RECRUITS);
    expect(screen.getByTestId("recruitment-sort-phone")).toHaveTextContent(/^Sort$/);
    fireEvent.click(screen.getByTestId("recruitment-sort-phone"));
    const sheet = screen.getByTestId("recruitment-sort-sheet");
    expect(within(sheet).getByText("Sort by")).toBeInTheDocument();
    expect(within(sheet).getAllByText("Then by")).toHaveLength(2);
    expect(within(sheet).getByRole("button", { name: "Clear" })).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Done" })).toBeInTheDocument();
  });

  it("offers First name, Last name, Recruit and every visible column in board order", async () => {
    renderBoard(RECRUITS);
    fireEvent.click(screen.getByTestId("recruitment-sort-phone"));
    fireEvent.mouseDown(within(screen.getByTestId("sort-field-1")).getByRole("combobox"));
    const options = (await screen.findAllByRole("option")).map((option) => option.textContent);
    expect(options.slice(0, 11)).toEqual([
      "None",
      "First name",
      "Last name",
      "Recruit",
      "College",
      "Matric",
      "Grad",
      "Degree field",
      "Contactable",
      "Status",
      "First contact",
    ]);
  });

  it("sorts by first name, last name and status, either way, and status alphabetically", async () => {
    renderBoard(RECRUITS);
    fireEvent.click(screen.getByTestId("recruitment-sort-phone"));

    await pick("sort-field-1", "First name");
    expect(cardOrder()).toEqual(["p-amy", "p-mia", "p-zed"]);
    await pick("sort-order-1", "Z–A");
    expect(cardOrder()).toEqual(["p-zed", "p-mia", "p-amy"]);
    await pick("sort-field-1", "Last name");
    expect(cardOrder()).toEqual(["p-amy", "p-mia", "p-zed"]);
    await pick("sort-order-1", "A–Z");
    expect(cardOrder()).toEqual(["p-zed", "p-mia", "p-amy"]);
    // Committed, Identified, Joined — the alphabet, not the recruitment ladder.
    await pick("sort-field-1", "Status");
    expect(cardOrder()).toEqual(["p-amy", "p-mia", "p-zed"]);
    expect(window.localStorage.getItem("lancers:board-phone-sort:recruitment")).toBe("status:asc");
    expect(window.location.search).toBe("?sort=status:asc");
  });

  it("words a date's orders by time and sorts First contact by instant, blank last", async () => {
    renderBoard(RECRUITS);
    fireEvent.click(screen.getByTestId("recruitment-sort-phone"));
    await pick("sort-field-1", "First contact");
    expect(await optionsOf("sort-order-1")).toEqual(["Oldest first", "Newest first"]);
    fireEvent.click(
      within(screen.getAllByRole("listbox").at(-1)!).getByRole("option", { name: "Newest first" }),
    );
    expect(cardOrder()).toEqual(["p-zed", "p-amy", "p-mia"]);
  });

  it("applies a second key to the first key's ties, and the same order in table and cards", async () => {
    renderBoard(RECRUITS);
    fireEvent.click(screen.getByTestId("recruitment-sort-phone"));
    await pick("sort-field-1", "College");
    await pick("sort-field-2", "First name");
    await pick("sort-order-2", "Z–A");
    // Balliol (Mia, Amy — first name Z–A), then Keble.
    expect(cardOrder()).toEqual(["p-mia", "p-amy", "p-zed"]);
    expect(tableOrder()).toEqual(cardOrder());
    expect(window.location.search).toBe("?sort=college:asc,firstName:desc");
    expect(screen.getByTestId("recruitment-sort-phone")).toHaveTextContent("Sort (2)");
  });

  it("does not offer a field chosen higher up", async () => {
    renderBoard(RECRUITS);
    fireEvent.click(screen.getByTestId("recruitment-sort-phone"));
    await pick("sort-field-1", "College");
    const options = await optionsOf("sort-field-2");
    expect(options).not.toContain("College");
    expect(options).toContain("First name");
  });

  it("numbers the Sorted by chips, and removing one moves the later keys up", async () => {
    renderBoard(RECRUITS);
    fireEvent.click(screen.getByTestId("recruitment-sort-phone"));
    await pick("sort-field-1", "College");
    await pick("sort-field-2", "First name");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    const chips = screen.getByTestId("recruitment-sort-chips");
    expect(within(chips).getByText("Sorted by")).toBeInTheDocument();
    expect(within(chips).getByText("1 College A–Z")).toBeInTheDocument();
    expect(within(chips).getByText("2 First name A–Z")).toBeInTheDocument();

    const first = within(chips).getByText("1 College A–Z").closest(".MuiChip-root")!;
    fireEvent.click(first.querySelector(".MuiChip-deleteIcon")!);
    expect(within(screen.getByTestId("recruitment-sort-chips")).getByText("1 First name A–Z"));
    expect(window.location.search).toBe("?sort=firstName:asc");
  });

  it("Clear returns to the ladder, then newest first contact", async () => {
    renderBoard(RECRUITS);
    fireEvent.click(screen.getByTestId("recruitment-sort-phone"));
    await pick("sort-field-1", "First name");
    fireEvent.click(screen.getByTestId("recruitment-sort-clear"));
    // Identified, Committed, Joined — the default W1 ladder order.
    expect(cardOrder()).toEqual(["p-mia", "p-amy", "p-zed"]);
    expect(window.location.search).toBe("");
    expect(window.localStorage.getItem("lancers:board-phone-sort:recruitment")).toBeNull();
    expect(screen.queryByTestId("recruitment-sort-chips")).not.toBeInTheDocument();
  });

  it("a heading's tap changes key 1 only and keeps the rest; a second tap flips it", () => {
    window.history.replaceState(null, "", "/operate/recruitment?sort=college:asc,firstName:desc");
    render(
      <RecruitmentBoardView
        operatorPersonId="operator-1"
        season={SEASON}
        rows={RECRUITS}
        events={[]}
        totalInSeason={RECRUITS.length}
        initialSearch=""
        initialFilters={{}}
        initialSort={[
          { key: "college", direction: "asc" },
          { key: "firstName", direction: "desc" },
        ]}
      />,
    );
    const table = screen.getByTestId("recruitment-board-table");
    fireEvent.click(within(table).getByRole("button", { name: /^Status/ }));
    expect(window.location.search).toBe("?sort=status:asc,firstName:desc");
    fireEvent.click(within(table).getByRole("button", { name: /^Status/ }));
    expect(window.location.search).toBe("?sort=status:desc,firstName:desc");
    // Every sorted column shows its arrow.
    const active = table.querySelectorAll(".MuiTableSortLabel-root.Mui-active");
    expect([...active].map((label) => label.textContent)).toEqual(["Status"]);
  });

  it("restores the remembered sort in every layout when the URL carries none", () => {
    window.localStorage.setItem("lancers:board-phone-sort:recruitment", "lastName:asc");
    renderBoard(RECRUITS);
    expect(cardOrder()).toEqual(["p-zed", "p-mia", "p-amy"]);
    expect(tableOrder()).toEqual(["p-zed", "p-mia", "p-amy"]);
    expect(window.location.search).toBe("?sort=lastName:asc");
  });

  it("drops a remembered key this viewer can no longer see", () => {
    window.localStorage.setItem("lancers:board-phone-sort:recruitment", "status:desc,lastName:asc");
    render(
      <RecruitmentBoardView
        operatorPersonId="operator-1"
        season={SEASON}
        rows={RECRUITS}
        events={[]}
        totalInSeason={RECRUITS.length}
        initialSearch=""
        initialFilters={{}}
        initialSort={[]}
        access={{ recruit_person: "edit", recruit_details: "none", recruit_events: "none" }}
        mayMoveToJoined={false}
      />,
    );
    expect(window.location.search).toBe("?sort=lastName:asc");
    expect(cardOrder()).toEqual(["p-zed", "p-mia", "p-amy"]);
  });
});
