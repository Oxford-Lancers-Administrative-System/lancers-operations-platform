import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { PhoneIcon } from "./phone-icon";

describe("PhoneIcon", () => {
  it("renders a hidden inline svg", () => {
    const { container } = render(<PhoneIcon />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("aria-hidden");
  });
});
