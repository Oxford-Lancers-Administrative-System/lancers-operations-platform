/**
 * The root is the sign-in screen, not LAN-71's bootstrap scaffold (audit B8,
 * LAN-225).
 *
 * The scaffold's own words are asserted absent. It described the repository as
 * an "infrastructure scaffold" whose only job was to prove the deployment loop,
 * and offered a route to `/dashboard`; a paraphrase-tolerant assertion would
 * let that back in.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Home from "./page";

async function renderHome(searchParams: Record<string, string> = {}) {
  render(await Home({ searchParams: Promise.resolve(searchParams), params: Promise.resolve({}) }));
}

describe("home page", () => {
  it("is the sign-in screen", async () => {
    await renderHome();

    expect(screen.getByRole("heading", { name: /sign in to lancers operations/i })).toBeVisible();
    expect(screen.getByLabelText(/email address/i)).toBeVisible();
    expect(screen.getByLabelText(/password/i)).toBeVisible();
  });

  it("no longer offers the bootstrap scaffold or its protected route", async () => {
    await renderHome();

    expect(screen.queryByText(/infrastructure scaffold/i)).toBeNull();
    expect(screen.queryByRole("link", { name: /protected page/i })).toBeNull();
    for (const link of screen.queryAllByRole("link")) {
      expect(link.getAttribute("href") ?? "").not.toBe("/dashboard");
    }
  });
});
