/**
 * The review URL and the dev server have to agree about the host — LAN-151,
 * finding VG-002.
 *
 * `next dev` blocks a request for one of its own `/_next/*` resources when the
 * browser sends an `Origin` header whose hostname is not allowed, and it allows
 * `localhost` and `**.localhost` unless `allowedDevOrigins` says otherwise. The
 * zero-command visual environment (ADR 0020) hands Brian
 * `http://127.0.0.1:<port>`, which is a different hostname by that rule even
 * though it is the same machine.
 *
 * What that cost: two client chunks are requested with `crossorigin`, so they
 * carry an `Origin`, so they came back `403`, so the client entry never
 * initialised and React never hydrated. Every MUI `Select` in the application —
 * the events list's Status and Type filters, the roster's, the forms' —
 * rendered as an inert box that showed no value and opened no menu. A full
 * `npm run verify` was green throughout, and the screenshot preflight could not
 * see it either, because a dead control is screenshot-identical to a live one.
 *
 * So the assertion is the relationship rather than either half of it: every
 * origin those scripts hand to a browser must be one this dev server will
 * actually serve its own resources to. Moving the review URL to another host,
 * or dropping the host from `allowedDevOrigins`, now fails here instead of in
 * Brian's browser.
 *
 * The matcher is Next's own — the exact function `blockCrossSiteDEV` calls — so
 * this cannot pass by re-implementing the rule more generously than the server
 * applies it.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isCsrfOriginAllowed } from "next/dist/server/app-render/csrf-protection";
import nextConfig from "../next.config";

/** What `blockCrossSiteDEV` allows before `allowedDevOrigins` is consulted. */
const NEXT_DEV_DEFAULT_ORIGINS = ["**.localhost", "localhost"];

/** The scripts that build the URL a browser is pointed at. */
const REVIEW_URL_SOURCES = [
  "scripts/visual-environment.mjs",
  "scripts/visual-preflight.mjs",
] as const;

/**
 * The hosts those scripts serve the application on.
 *
 * Read out of the source rather than restated here, so that changing the URL
 * changes what this test checks. `http://<host>:${…}` is the shape both use.
 */
function reviewHostsIn(relativePath: string): string[] {
  const source = readFileSync(path.join(process.cwd(), relativePath), "utf8");
  const hosts = [...source.matchAll(/http:\/\/([^:/`$\s]+):\$\{/g)].map((match) => match[1]);
  return [...new Set(hosts)];
}

describe("the review environment's URL and the dev server's origin check", () => {
  it("names a host in every script that hands one to a browser", () => {
    for (const source of REVIEW_URL_SOURCES) {
      expect(reviewHostsIn(source), `${source} builds no application URL`).not.toHaveLength(0);
    }
  });

  it("serves its own dev resources to every host the review environment uses", () => {
    const allowed = [...NEXT_DEV_DEFAULT_ORIGINS, ...(nextConfig.allowedDevOrigins ?? [])];

    for (const source of REVIEW_URL_SOURCES) {
      for (const host of reviewHostsIn(source)) {
        expect(
          isCsrfOriginAllowed(host, allowed),
          `${source} serves the application on ${host}, which next dev would refuse ` +
            "its own /_next chunks to — add it to allowedDevOrigins in next.config.ts",
        ).toBe(true);
      }
    }
  });

  it("allows the loopback address and nothing wider", () => {
    // The whole grant, stated once: this machine, by its other name. A wildcard
    // or a LAN address here would be a different decision from the one made.
    expect(nextConfig.allowedDevOrigins).toEqual(["127.0.0.1"]);
  });
});
