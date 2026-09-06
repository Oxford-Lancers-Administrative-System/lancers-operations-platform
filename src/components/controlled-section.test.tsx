import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ControlledSection } from "./controlled-section";

describe("ControlledSection", () => {
  it("keeps the owning screen in control of disclosure state", () => {
    const onToggle = vi.fn();
    const props = { title: "Attending", open: false, onToggle, panelId: "attending-panel" };
    const view = render(<ControlledSection {...props}>Participant rows</ControlledSection>);
    const toggle = screen.getByRole("button", { name: "Attending" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Participant rows")).toBeNull();
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    view.rerender(
      <ControlledSection {...props} open>
        Participant rows
      </ControlledSection>,
    );
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAttribute("aria-controls", "attending-panel");
    expect(document.getElementById("attending-panel")).toHaveTextContent("Participant rows");
  });

  it("shows a known zero count and the group's context without inventing a status", () => {
    render(
      <ControlledSection
        title="Recruits"
        description="This season"
        count={0}
        countTestId="count"
        open
        onToggle={() => {}}
        panelId="recruits-panel"
      >
        Rows
      </ControlledSection>,
    );
    expect(screen.getByTestId("count")).toHaveTextContent("0");
    expect(screen.getByText("This season")).toBeVisible();
    expect(document.querySelector("[data-domain]")).toBeNull();
  });
});
