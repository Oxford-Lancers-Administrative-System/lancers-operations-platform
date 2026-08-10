import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Home from "./page";

describe("home page", () => {
  it("renders and offers the sign-in and protected routes", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { name: /lancers operations platform/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: /protected page/i })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  });
});
