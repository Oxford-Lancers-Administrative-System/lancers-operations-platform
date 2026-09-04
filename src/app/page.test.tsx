/**
 * The root is the sign-in screen, not LAN-71's bootstrap scaffold (audit B8,
 * LAN-225).
 *
 * The scaffold's own words are asserted absent. It described the repository as
 * an "infrastructure scaffold" whose only job was to prove the deployment loop,
 * and offered a route to `/dashboard`; a paraphrase-tolerant assertion would
 * let that back in.
 *
 * The `redirectTo` half runs the shared contract in
 * `sign-in-destination-contract`. Review of this change found that an open
 * redirect injected at `/` alone left this file green: `/login` had the
 * assertions and `/` did not, on the one route the change exists to create.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("./login/actions", () => ({ signIn: vi.fn(), signOut: vi.fn() }));

import Home from "./page";
import { describeSignInDestinationContract } from "./sign-in-destination-contract";

type RootSearchParams = Record<string, string | string[] | undefined>;

async function show(params: RootSearchParams = {}) {
  return render(
    await Home({ searchParams: Promise.resolve(params) } as unknown as Parameters<typeof Home>[0]),
  );
}

describe("home page", () => {
  it("is the sign-in screen", async () => {
    await show();

    expect(screen.getByRole("heading", { name: "Sign in to Lancers Operations" })).toBeVisible();
    expect(screen.getByLabelText(/email address/i)).toBeRequired();
    expect(screen.getByLabelText(/^password/i)).toHaveAttribute("type", "password");
  });

  it("no longer offers the bootstrap scaffold or its protected route", async () => {
    const { container } = await show();

    expect(container.textContent).not.toMatch(/infrastructure scaffold/i);
    expect(container.textContent).not.toMatch(/deployment loop/i);
    for (const link of Array.from(container.querySelectorAll("a"))) {
      expect(link.getAttribute("href") ?? "").not.toBe("/dashboard");
    }
  });
});

describeSignInDestinationContract("/", show);
