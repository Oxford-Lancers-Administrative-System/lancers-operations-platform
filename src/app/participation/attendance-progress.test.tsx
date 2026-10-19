/**
 * LAN-504 — the attendance blocks as rendered: one per group, four values,
 * the not-recorded count, the percentage and the bar.
 */
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import type { AttendanceProgressRow } from "@/lib/services/event-attendance-progress";
import { AttendanceProgress } from "./attendance-progress";

function row(
  capacity: string,
  presence: AttendanceProgressRow["presence"],
  answer: AttendanceProgressRow["answer"] = null,
): AttendanceProgressRow {
  return { capacity, isWalkUp: false, answer, presence };
}

const PEOPLE: AttendanceProgressRow[] = [
  row("player", "present", "no"),
  row("player", "present", "yes"),
  row("player", "late"),
  row("player", "absent", "yes"),
  row("player", "excused"),
  row("player", null),
  row("coach", "present"),
  row("coach", null),
];

describe("the attendance blocks", () => {
  it("renders one block per group with the four values and the not-recorded count", () => {
    render(<AttendanceProgress people={PEOPLE} />);

    const players = screen.getByTestId("attendance-progress-player");
    expect(within(players).getByText("Players")).toBeTruthy();
    expect(within(players).getByTestId("attendance-present").dataset.count).toBe("2");
    expect(within(players).getByTestId("attendance-late").dataset.count).toBe("1");
    expect(within(players).getByTestId("attendance-no-show").dataset.count).toBe("1");
    expect(within(players).getByTestId("attendance-excused").dataset.count).toBe("1");
    expect(within(players).getByTestId("attendance-not-recorded").textContent).toBe(
      "1 not recorded / 6 invited",
    );
    expect(within(players).getByText("No-show")).toBeTruthy();
    expect(within(players).getByTestId("attendance-percent").textContent).toBe("50%");

    const coaches = screen.getByTestId("attendance-progress-coach");
    expect(within(coaches).getByTestId("attendance-percent").textContent).toBe("50%");
    expect(screen.queryByTestId("attendance-progress-recruit")).toBeNull();
  });

  it("draws the bar at the counts' widths", () => {
    render(<AttendanceProgress people={PEOPLE} />);

    const bar = within(screen.getByTestId("attendance-progress-player"));
    expect(bar.getByTestId("attendance-bar-present").dataset.width).toBe("2");
    expect(bar.getByTestId("attendance-bar-late").dataset.width).toBe("1");
    expect(bar.getByTestId("attendance-bar-not-recorded").dataset.width).toBe("1");
    expect(bar.getByTestId("attendance-bar-excused").dataset.width).toBe("1");
    expect(bar.getByTestId("attendance-bar-no-show").dataset.width).toBe("1");
  });

  it("renders nothing with nobody invited", () => {
    const { container } = render(<AttendanceProgress people={[]} />);
    expect(container.textContent).toBe("");
  });
});
