import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ValueChoice } from "./value-choice";

describe("ValueChoice", () => {
  it("keeps the selected native radio value in the comparison form", () => {
    const { container } = render(
      <form>
        <ValueChoice name="email" value="survivor" text="Survivor email" defaultSelected />
        <ValueChoice name="email" value="other" text="Other email" />
      </form>,
    );
    const form = container.querySelector("form")!;
    expect(new FormData(form).get("email")).toBe("survivor");
    fireEvent.click(screen.getByRole("radio", { name: "Other email" }));
    expect(new FormData(form).get("email")).toBe("other");
    expect(screen.getByRole("radio", { name: "Survivor email" })).not.toBeChecked();
  });

  it("renders a read-only comparison without a control or posted value", () => {
    render(<ValueChoice value="unchanged" text="Same value" />);
    expect(screen.getByText("Same value")).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });
});
