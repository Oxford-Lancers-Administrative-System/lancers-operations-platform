import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ValueChoice } from "./value-choice";

describe("ValueChoice", () => {
  it("keeps the selected native radio value in the comparison form", () => {
    const { container, rerender } = render(
      <form>
        <ValueChoice name="email" value="survivor" text="Survivor email" checked={false} />
        <ValueChoice name="email" value="other" text="Other email" checked={false} />
      </form>,
    );
    const form = container.querySelector("form")!;
    // LAN-256: nothing is selected until the caller says a side was chosen —
    // an untouched comparison posts no value for the field at all.
    expect(new FormData(form).get("email")).toBeNull();

    rerender(
      <form>
        <ValueChoice name="email" value="survivor" text="Survivor email" checked={false} />
        <ValueChoice name="email" value="other" text="Other email" checked />
      </form>,
    );
    expect(new FormData(form).get("email")).toBe("other");
    expect(screen.getByRole("radio", { name: "Survivor email" })).not.toBeChecked();
  });

  it("reports the value the operator picked rather than selecting it itself", () => {
    const onSelect = vi.fn();
    render(
      <ValueChoice
        name="email"
        value="loser"
        text="Other email"
        checked={false}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Other email" }));
    expect(onSelect).toHaveBeenCalledWith("loser");
    // Still unselected: the caller owns the answer, so a click that the caller
    // ignores must not leave the control looking answered.
    expect(screen.getByRole("radio", { name: "Other email" })).not.toBeChecked();
  });

  it("renders a read-only comparison without a control or posted value", () => {
    render(<ValueChoice value="unchanged" text="Same value" />);
    expect(screen.getByText("Same value")).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });
});
