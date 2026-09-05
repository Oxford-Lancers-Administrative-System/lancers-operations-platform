import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { STATUS_VOCABULARY, StatusChip, statusStyle } from "./status-chip";

describe("StatusChip", () => {
  it("always carries the word, and reads its colour from the one vocabulary", () => {
    render(<StatusChip domain="membership" status="active" label="Active" testId="chip" />);
    const chip = screen.getByTestId("chip");
    expect(chip).toHaveTextContent("Active");
    expect(chip.className).toMatch(/MuiChip-colorSuccess/);
    expect(chip.className).toMatch(/MuiChip-filled/);
  });

  it("draws derived and secondary facts outlined", () => {
    render(<StatusChip domain="event" status="cancelled" label="Cancelled" testId="chip" />);
    expect(screen.getByTestId("chip").className).toMatch(/MuiChip-outlined/);
    expect(screen.getByTestId("chip").className).toMatch(/MuiChip-colorError/);
  });

  it("reads an unclassified code as neutral, never as a failure", () => {
    expect(statusStyle("delivery", "something_new")).toEqual({
      colour: "neutral",
      variant: "filled",
    });
  });

  /**
   * The brief's consequences, pinned: Occurred stops being orange, Cancelled
   * stops being orange on the calendar and blue on the record, Excused reads the
   * same on the attendance sheet and the participation table.
   */
  it("gives the audit's inconsistent states one answer each", () => {
    expect(STATUS_VOCABULARY.event.occurred.colour).toBe("neutral");
    expect(STATUS_VOCABULARY.event.cancelled).toEqual({ colour: "error", variant: "outlined" });
    expect(STATUS_VOCABULARY.attendance.excused.colour).toBe("info");
    expect(STATUS_VOCABULARY.recruitment.engaged.colour).toBe("info");
    expect(STATUS_VOCABULARY.operator.invitation_pending.colour).toBe("warning");
  });
});
