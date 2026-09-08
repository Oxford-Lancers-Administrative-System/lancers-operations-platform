import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
vi.mock("./login/actions", () => ({ signIn: vi.fn(), signOut: vi.fn() }));
import Home from "./page";
import LoginPage from "./login/page";

describe("root sign-in page (B8)", () => {
  it("shares the login screen and preserves its destination", async () => {
    expect(Home).toBe(LoginPage);
    const { container } = render(
      await Home({
        params: Promise.resolve({}),
        searchParams: Promise.resolve({ redirectTo: "/operate/roster" }),
      }),
    );
    expect(screen.getByRole("heading", { name: "Sign in to Lancers Operations" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeVisible();
    expect(container.querySelector('input[name="redirectTo"]')).toHaveValue("/operate/roster");
    expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute(
      "href",
      "/forgot-password?redirectTo=%2Foperate%2Froster",
    );
    expect(container.textContent).not.toContain("infrastructure scaffold");
  });
});
