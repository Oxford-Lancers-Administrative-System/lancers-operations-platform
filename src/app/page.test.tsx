/**
 * The root sends a visitor to the one sign-in route.
 *
 * LAN-225 replaced LAN-71's bootstrap scaffold here (audit B8). The assertion
 * is the destination itself: a copy of the login form at `/` would be a second
 * canonical sign-in page, and the point of the change is that there is one.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    // The real `redirect` throws to unwind the render.
    throw new Error(`REDIRECT:${url}`);
  }),
}));

import Home from "./page";

describe("home page", () => {
  it("sends a visitor to the sign-in page", () => {
    expect(() => Home()).toThrow("REDIRECT:/login");
  });
});
