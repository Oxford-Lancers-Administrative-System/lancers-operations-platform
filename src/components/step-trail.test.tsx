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

  it("links a step that carries an href, the current one included", () => {
    // LAN-362: the strip read as navigation and was not, which is what Brian
    // reported. Marking a step current is not disabling it — the step you are
    // on still links to itself, or the strip reads as a row of controls with
    // one broken.
    const linked = STEPS.map((step, index) => ({ ...step, href: `/x?step=${index}` }));
    render(<StepTrail steps={linked} currentIndex={0} />);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(STEPS.length);
    expect(links.map((link) => link.getAttribute("href"))).toEqual(linked.map((step) => step.href));
  });

  it("draws a step with no href as plain text, not a dead link", () => {
    // How a sequence expresses a step it will not open yet. The questionnaire
    // gates none of its five, so it gives every one an href.
    render(<StepTrail steps={STEPS} currentIndex={0} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(STEPS.length);
  });

  it("still names every step once when they are links", () => {
    const linked = STEPS.map((step) => ({ ...step, href: `/x` }));
    render(<StepTrail steps={linked} currentIndex={1} />);
    const items = screen.getAllByRole("listitem");
    expect(items[1]).toHaveAttribute("aria-current", "step");
    expect(items[0]).toHaveTextContent("1. Your details");
  });

  it("marks nothing current for a summary that is on no step", () => {
    render(<StepTrail steps={STEPS} currentIndex={-1} />);
    expect(screen.queryByRole("listitem", { current: "step" })).toBeNull();
  });
});

describe("StepTrail never orphans a step", () => {
  /**
   * MUI compiles a responsive `sx` into a class rather than an inline style, so
   * the assertion reads the stylesheet Emotion injects rather than
   * `element.style`, which is empty by design.
   */
  const injectedCss = () =>
    Array.from(document.querySelectorAll("style"))
      .map((tag) => tag.textContent ?? "")
      .join("");

  it("lays the steps out as a grid, so a five-step sequence is one row and not four plus one", () => {
    render(<StepTrail steps={STEPS} currentIndex={1} />);
    // A wrapping row is what put Hudl alone on a second line and made it read
    // as the important step (Brian, 5 September 2026). A grid with one column
    // per step cannot wrap, whatever the count.
    expect(injectedCss()).toContain("repeat(5, minmax(0, 1fr))");
  });

  it("gives every step its own column, whatever the count", () => {
    render(<StepTrail steps={STEPS.slice(0, 3)} currentIndex={0} />);
    expect(injectedCss()).toContain("repeat(3, minmax(0, 1fr))");
  });
});
