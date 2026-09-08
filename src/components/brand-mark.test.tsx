import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrandMark, CLUB_NAME, CREST_PATH } from "./brand-mark";

describe("BrandMark", () => {
  it("draws the crest from the canonical path and names the club", () => {
    render(<BrandMark caption="Operations" testId="mark" />);
    const crest = screen.getByTestId("mark").querySelector("img");
    expect(crest).toHaveAttribute("src", CREST_PATH);
    // Decorative: the name beside it is the accessible text.
    expect(crest).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText(CLUB_NAME)).toBeInTheDocument();
    expect(screen.getByText("Operations")).toBeInTheDocument();
  });

  it("omits the caption line when there is none", () => {
    render(<BrandMark tone="onLight" testId="mark" />);
    expect(screen.getByTestId("mark").querySelectorAll("p")).toHaveLength(1);
  });
});
