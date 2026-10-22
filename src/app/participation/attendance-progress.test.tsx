/**
 * LAN-504 — the attendance cards as rendered: one per group, the headline, four
 * values, a bar with no remainder, and a dropdown of names laid out 2x2 — Brian's
 * walk of 22 October 2026.
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import type { AttendanceProgressRow } from "@/lib/services/event-attendance-progress";
import { AttendanceProgress } from "./attendance-progress";

function row(
  capacity: string,
  presence: AttendanceProgressRow["presence"],
  answer: AttendanceProgressRow["answer"],
  displayName: string,
): AttendanceProgressRow {
  return { capacity, isWalkUp: false, answer, presence, displayName };
}

const PEOPLE: AttendanceProgressRow[] = [
  row("player", "present", "no", "Pat"),
  row("player", "present", "yes", "Pam"),
  row("player", "late", null, "Lee"),
  row("player", "absent", "yes", "Abe"),
  row("player", "excused", "yes", "Eve"),
  row("player", null, "yes", "Ned"),
  row("player", null, null, "Nobody"),
  row("coach", "present", "yes", "Coach One"),
  row("coach", "present", null, "Coach Two"),
];

describe("the attendance cards", () => {
  it("titles each card by its group, then headlines attended against expected", () => {
    render(<AttendanceProgress people={PEOPLE} />);

    const players = screen.getByTestId("attendance-progress-player");
    expect(within(players).getByText("Players — Attendance")).toBeTruthy();
    expect(within(players).getByTestId("attendance-headline").textContent).toBe(
      "3 attended / 6 expected",
    );
    expect(within(players).getByTestId("attendance-present").dataset.count).toBe("2");
    expect(within(players).getByTestId("attendance-late").dataset.count).toBe("1");
    expect(within(players).getByTestId("attendance-no-show").dataset.count).toBe("2");
    expect(within(players).getByTestId("attendance-excused").dataset.count).toBe("1");
    expect(within(players).getByText("No-show")).toBeTruthy();
    expect(players.textContent).not.toContain("%");
    expect(players.textContent?.toLowerCase()).not.toContain("not recorded");

    const coaches = screen.getByTestId("attendance-progress-coach");
    expect(within(coaches).getByText("Coaches — Attendance")).toBeTruthy();
    expect(within(coaches).getByTestId("attendance-headline").textContent).toBe(
      "2 attended / 2 expected",
    );
    expect(screen.queryByTestId("attendance-progress-recruit")).toBeNull();
  });

  it("draws the bar across the expected people with no remainder", () => {
    render(<AttendanceProgress people={PEOPLE} />);

    const players = within(screen.getByTestId("attendance-progress-player"));
    const widths = ["present", "late", "no-show", "excused"].map((key) =>
      Number(players.getByTestId(`attendance-bar-${key}`).dataset.width),
    );
    expect(widths).toEqual([2, 1, 2, 1]);
    expect(widths.reduce((a, b) => a + b, 0)).toBe(6);
    expect(players.queryByTestId("attendance-bar-not-recorded")).toBeNull();
    expect(players.getByTestId("attendance-bar").getAttribute("aria-label")).toBe(
      "Players — Attendance: 2 present, 1 late, 2 no-show, 1 excused, of 6 expected",
    );
  });

  it("opens in place onto the names, closed on arrival, in Present, Late, No-show, Excused order", () => {
    render(<AttendanceProgress people={PEOPLE} />);

    expect(screen.queryByTestId("attendance-names-player-grid")).toBeNull();
    const toggle = screen.getByTestId("response-toggle-attendance-player");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(toggle);

    const grid = screen.getByTestId("attendance-names-player-grid");
    const headings = within(grid)
      .getAllByText(/ · \d+$/)
      .map((node) => node.textContent);
    expect(headings).toEqual(["Present · 2", "Late · 1", "No-show · 2", "Excused · 1"]);
    const present = within(screen.getByTestId("attendance-names-player-present"));
    expect(present.getByText("Pam")).toBeTruthy();
    expect(present.getByText("Pat")).toBeTruthy();
    expect(
      within(screen.getByTestId("attendance-names-player-late")).getByText("Lee"),
    ).toBeTruthy();
    expect(
      within(screen.getByTestId("attendance-names-player-no-show")).getByText("Ned"),
    ).toBeTruthy();
    expect(
      within(screen.getByTestId("attendance-names-player-excused")).getByText("Eve"),
    ).toBeTruthy();
    expect(within(grid).queryByText("Nobody")).toBeNull();
  });

  it("renders nothing with nobody expected", () => {
    const { container } = render(<AttendanceProgress people={[]} />);
    expect(container.textContent).toBe("");
  });
});
