import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * The `redirectTo` contract every sign-in surface must satisfy, asserted the
 * same way on each of them.
 *
 * LAN-225 made `/` a second sign-in surface (audit B8), and the review of that
 * change found the hole this file closes: `/login`'s suite tested the guard
 * thoroughly, `/`'s did not, and an open redirect injected at `/` alone left
 * the root's tests green. A destination that survives when it should have been
 * dropped is an open redirect; one that is dropped when it should have
 * survived strands an operator.
 *
 * It is one shared contract rather than a copied block so that a case added
 * here is immediately asserted on every surface — which is the drift that
 * produced the gap in the first place.
 */

/** Destinations `safeRelativeDestination` must refuse, and why each is here. */
export const ATTACKER_CONTROLLED_DESTINATIONS = [
  // Absolute, off-site.
  "https://evil.example/steal",
  // Protocol-relative: no scheme, still leaves the origin.
  "//evil.example",
  // Backslash-prefixed, which browsers normalise into the protocol-relative form.
  "/\\evil.example",
  // Not relative at all, so not a destination this application can own.
  "operate",
];

/** Where a refused or absent destination lands: the operator shell, never `/`. */
export const DEFAULT_DESTINATION = "/operate";

/**
 * Runs the contract against one sign-in surface.
 *
 * `show` renders the page under test with the given search parameters, exactly
 * as a request would arrive at it.
 */
export function describeSignInDestinationContract(
  surface: string,
  show: (params: Record<string, string | string[] | undefined>) => Promise<unknown>,
) {
  describe(`${surface}: the requested destination survives, or is replaced`, () => {
    it("carries a safe path into the form", async () => {
      const { container } = (await show({
        redirectTo: "/operate/events/8f2/attendance",
      })) as ReturnType<typeof render>;

      expect(container.querySelector('input[name="redirectTo"]')).toHaveValue(
        "/operate/events/8f2/attendance",
      );
    });

    it.each(ATTACKER_CONTROLLED_DESTINATIONS)(
      "replaces the attacker-controlled destination %s with the operator shell",
      async (candidate) => {
        const { container } = (await show({ redirectTo: candidate })) as ReturnType<typeof render>;

        expect(container.querySelector('input[name="redirectTo"]')).toHaveValue(
          DEFAULT_DESTINATION,
        );
      },
    );

    it("defaults to the operator shell when nothing was requested", async () => {
      const { container } = (await show({})) as ReturnType<typeof render>;

      expect(container.querySelector('input[name="redirectTo"]')).toHaveValue(DEFAULT_DESTINATION);
    });

    it("guards the first value when the parameter is repeated", async () => {
      // `searchParams` hands back an array when the key appears twice, and
      // `safeRelativeDestination` deliberately takes the first entry. The point
      // is that it is still *guarded*: a safe first value survives, and a
      // trailing hostile one is simply not read.
      const { container } = (await show({
        redirectTo: ["/operate/roster", "https://evil.example"],
      })) as ReturnType<typeof render>;

      expect(container.querySelector('input[name="redirectTo"]')).toHaveValue("/operate/roster");
    });

    it("does not fall through to a later value when the first is hostile", async () => {
      // The failure that would matter: refusing the first entry and then
      // reaching past it for something that parses, which would let an
      // attacker smuggle a destination behind a rejected one.
      const { container } = (await show({
        redirectTo: ["https://evil.example", "/operate/roster"],
      })) as ReturnType<typeof render>;

      expect(container.querySelector('input[name="redirectTo"]')).toHaveValue(DEFAULT_DESTINATION);
    });

    it("keeps the sign-in form's own action reachable", async () => {
      await show({});

      expect(screen.getByRole("button", { name: "Sign in" })).toBeVisible();
    });
  });
}
