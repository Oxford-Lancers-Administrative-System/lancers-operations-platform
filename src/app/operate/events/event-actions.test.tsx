/**
 * The occurrence-correction form keeps what the operator wrote — LAN-80,
 * matrix row 15 and `docs/ux/slice-ux.md` § 9's "Error: preserve safe input".
 *
 * This exists because the browser preflight found it broken. The refusal an
 * operator is most likely to meet on this form is "this event still has
 * attendance against it", which they resolve on another screen and come back
 * from — and the first implementation cleared the reason underneath them on the
 * re-render the action triggers, so the sentence they had written to explain a
 * correction was gone by the time they could make it.
 *
 * The form is rendered directly rather than through the page, because what is
 * under test is the component's own state across an action round trip, and a
 * page render would drag the whole shell in to prove one textarea.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("./actions", () => ({
  abandonEventDraftAction: vi.fn(),
  approveEventAction: vi.fn(),
  assertEventOutcomeAction: vi.fn(),
  correctEventOutcomeAction: vi.fn(),
}));

import { correctEventOutcomeAction } from "./actions";
import { CorrectOccurrenceForm } from "./event-actions";

const EVENT_ID = "33333333-3333-4333-8333-333333333333";

const REFUSAL =
  "This event still has 4 attendance records against it. Remove them before changing " +
  "what happened at the event.";

describe("CorrectOccurrenceForm", () => {
  it("keeps the reason on screen when the correction is refused", async () => {
    vi.mocked(correctEventOutcomeAction).mockResolvedValue({ error: REFUSAL });

    render(<CorrectOccurrenceForm eventId={EVENT_ID} currentStatus="occurred" />);

    fireEvent.click(screen.getByTestId("correct-occurrence-open"));

    const reason = screen.getByLabelText(/Why is this being corrected/);
    fireEvent.change(reason, { target: { value: "Recorded against the wrong Wednesday." } });

    fireEvent.click(screen.getByRole("button", { name: "Correct to not held" }));

    await waitFor(() => {
      expect(screen.getByTestId("correct-occurrence-error").textContent).toContain(
        "still has 4 attendance records",
      );
    });

    // The half that regressed: the refusal is shown *and* the sentence survives.
    expect(screen.getByLabelText(/Why is this being corrected/)).toHaveValue(
      "Recorded against the wrong Wednesday.",
    );
  });

  it("names the direction the correction goes, in both directions", () => {
    const { unmount } = render(
      <CorrectOccurrenceForm eventId={EVENT_ID} currentStatus="occurred" />,
    );
    expect(screen.getByTestId("correct-occurrence-open").textContent).toContain(
      "Correct this to not held",
    );
    unmount();

    render(<CorrectOccurrenceForm eventId={EVENT_ID} currentStatus="not_held" />);
    expect(screen.getByTestId("correct-occurrence-open").textContent).toContain(
      "Correct this to occurred",
    );
  });

  it("keeps the correction behind a disclosure, so it is not pressed by habit", () => {
    render(<CorrectOccurrenceForm eventId={EVENT_ID} currentStatus="occurred" />);

    // Nothing to type into, and nothing to submit, until it is opened.
    expect(screen.queryByLabelText(/Why is this being corrected/)).toBeNull();
    expect(screen.queryByTestId("correct-occurrence-form")).toBeNull();
  });
});
