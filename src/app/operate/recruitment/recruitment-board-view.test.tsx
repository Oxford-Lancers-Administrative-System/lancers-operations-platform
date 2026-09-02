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
import { render, screen, within } from "@testing-library/react";

vi.mock("./board-actions", () => ({
  setRecruitmentStatusAction: vi.fn(),
  flipRecruitmentProspectAction: vi.fn(),
}));

import type { RecruitmentBoardRow } from "@/lib/services/recruitment-board";
import type { Season } from "@/lib/services/seasons";
import RecruitmentBoardView from "./recruitment-board-view";

const SEASON: Season = { id: "season-1", label: "2026-27", startsOn: null, endsOn: null };

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
    expect(within(card).getByRole("button", { name: "Call" })).toBeDisabled();
  });

  it("still opens the record from the whole card, per the roster board's own tap-target rule", () => {
    renderBoard([row()]);
    const open = screen.getByTestId("recruitment-card-open");
    expect(open).toHaveAttribute("href", "/operate/recruitment/prospect-1");
  });
});
