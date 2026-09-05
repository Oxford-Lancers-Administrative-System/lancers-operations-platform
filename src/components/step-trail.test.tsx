import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StepTrail } from "./step-trail";

const STEPS = [
  { label: "Your details", status: "complete", statusLabel: "Saved" },
  { label: "Code of conduct", status: "outstanding", statusLabel: "Outstanding" },
  { label: "Photo release", status: "complete", statusLabel: "Agreed" },
  { label: "BUCS Play", status: "outstanding", statusLabel: "Outstanding" },
  { label: "Hudl", status: "outstanding", statusLabel: "Outstanding" },
] as const;

describe("StepTrail", () => {
  it("numbers every step and marks exactly one as the current one", () => {
    render(<StepTrail steps={STEPS} currentIndex={1} />);
    const steps = screen.getAllByRole("listitem");
    expect(steps).toHaveLength(5);
    expect(steps[0]).toHaveTextContent("1. Your details");
    expect(steps[1]).toHaveAttribute("aria-current", "step");
    expect(steps.filter((step) => step.getAttribute("aria-current") === "step")).toHaveLength(1);
  });

  it("is a map and not a set of controls — no step is a link", () => {
    render(<StepTrail steps={STEPS} currentIndex={0} />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("marks nothing current for a summary that is on no step", () => {
    render(<StepTrail steps={STEPS} currentIndex={-1} />);
    expect(screen.queryByRole("listitem", { current: "step" })).toBeNull();
  });
});
