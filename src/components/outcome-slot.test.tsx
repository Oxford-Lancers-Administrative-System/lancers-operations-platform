import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  ArrivalNotice,
  EMPTY_OUTCOME,
  Outcome,
  OutcomeSlotProvider,
  useOutcomeSlot,
} from "./outcome-slot";

function Panel({ name, notice }: { name: string; notice: string }) {
  const slot = useOutcomeSlot(name);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        slot.claim();
      }}
    >
      <button type="submit">{name}</button>
      <Outcome state={{ ...EMPTY_OUTCOME, notice }} showing={slot.showing} />
    </form>
  );
}

describe("OutcomeSlot", () => {
  it("shows the result of at most one action; starting another clears the previous", () => {
    render(
      <OutcomeSlotProvider>
        <ArrivalNotice severity="success">Arrived.</ArrivalNotice>
        <Panel name="resend" notice="Sent again." />
        <Panel name="correct" notice="Corrected." />
      </OutcomeSlotProvider>,
    );
    expect(screen.getByTestId("arrival-notice")).toBeInTheDocument();
    expect(screen.getAllByTestId("outcome-notice")).toHaveLength(2);

    fireEvent.click(screen.getByText("resend"));
    expect(screen.queryByTestId("arrival-notice")).toBeNull();
    expect(screen.getAllByTestId("outcome-notice")).toHaveLength(1);
    expect(screen.getByTestId("outcome-notice")).toHaveTextContent("Sent again.");

    fireEvent.click(screen.getByText("correct"));
    expect(screen.getByTestId("outcome-notice")).toHaveTextContent("Corrected.");
  });

  it("puts a refusal first and never draws it as an error", () => {
    render(<Outcome state={{ refusal: "Not yours to change.", error: "x", notice: "y" }} />);
    expect(screen.getByTestId("outcome-refusal")).toHaveTextContent("Not yours to change.");
    expect(screen.queryByTestId("outcome-error")).toBeNull();
  });
});
