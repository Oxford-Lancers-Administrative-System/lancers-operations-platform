// @vitest-environment jsdom
/**
 * `RecruitmentBoardView`'s phone card — `W1-01`'s approved mockup, and
 * correction round 1 (F-LAN204-004): the shipped card replaced the approved
 * mockup's static chip with a live, editable status control, and dropped the
 * roster board's own voice-call quick action entirely. jsdom renders both
 * the desktop table and the phone card at once (breakpoints are not
 * evaluated), so this queries inside the phone card's own test id rather
 * than asserting on the whole document.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("./board-actions", () => ({
  setRecruitmentStatusAction: vi.fn(),
  flipRecruitmentProspectAction: vi.fn(),
}));

import type { RecruitmentBoardRow } from "@/lib/services/recruitment-board";
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
    firstContactOn: "2026-05-01",
    personalSent: false,
    recruitmentSent: false,
    consent: "granted",
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
      initialSortKey={null}
      initialSortDirection="asc"
    />,
  );
}

describe("the phone card", () => {
  it("shows the status as a static chip, not an editable control", () => {
    renderBoard([row()]);
    const card = screen.getByTestId("recruitment-card-prospect-1");
    expect(within(card).getByText("Engaged")).toBeInTheDocument();
    // A live status control renders an MUI Select, exposed as role="combobox".
    expect(within(card).queryByRole("combobox")).toBeNull();
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
  const EVENT = { eventId: "event-1", name: "Taster session", date: "2026-05-10" };

  function eventRows() {
    // Same status and first-contact date, so the *default* order (before any
    // sort click) is simply array order — array sort is stable — giving a
    // known "before" state for the reorder assertion below.
    const a = row({
      prospectId: "a",
      displayName: "Amory Vance",
      firstContactOn: "2026-05-01",
      events: { [EVENT.eventId]: { rsvp: "yes", attendance: "present" } },
    });
    const b = row({
      prospectId: "b",
      displayName: "Beatrix Nowell",
      firstContactOn: "2026-05-01",
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
        initialSortKey={null}
        initialSortDirection="asc"
      />,
    );
  }

  function rowOrder(): string[] {
    return screen
      .getAllByTestId(/^recruitment-row-/)
      .map((el) => el.getAttribute("data-testid")?.replace("recruitment-row-", "") ?? "");
  }

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
