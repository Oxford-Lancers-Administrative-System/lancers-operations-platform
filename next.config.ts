import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits .next/standalone with a minimal server and only the traced
  // node_modules. This is what the Cloud Run container ships.
  output: "standalone",
  turbopack: {
    root: process.cwd(),
  },
  /**
   * The loopback address the review environment is served on — and nothing else.
   *
   * `next dev` refuses a request for one of its own `/_next/*` resources when
   * the browser sends an `Origin` whose **hostname** is not allowed, and its
   * defaults are `localhost` and `**.localhost` only. `127.0.0.1` is not among
   * them, although it is the same machine by any other name.
   *
   * That is not academic. Two client chunks — the MUI/Emotion bundle and the
   * one holding `src/theme.ts` — are requested with `crossorigin`, so they
   * carry an `Origin` header and came back `403`. One failed chunk stops the
   * client entry initialising, React never hydrates, and every MUI `Select` in
   * the application renders as an inert box that shows no value and opens no
   * menu. Brian found it as "the status dropdown does not work, and I can't
   * see it" on `/operate/events`; the roster's filters were dead in exactly the
   * same way, and so was every other control on the page.
   *
   * The zero-command visual handoff (ADR 0020) hands him
   * `http://127.0.0.1:<port>` — `scripts/visual-environment.mjs` and
   * `scripts/visual-preflight.mjs` both build it — which is why this is the
   * host that has to be named. It grants nothing that `localhost` did not
   * already have: both resolve to this machine's loopback interface, and the
   * option has no effect at all outside `next dev`, so the deployed container
   * is untouched. `tests/review-environment-dev-origin.test.ts` ties the two
   * together, so moving the review URL to a host this list does not cover fails
   * a test rather than a browser.
   */
  allowedDevOrigins: ["127.0.0.1"],
  // Surfaced on /api/health so a running revision can be tied back to a commit.
  env: {
    GIT_COMMIT_SHA: process.env.GIT_COMMIT_SHA ?? "unknown",
  },
};

export default nextConfig;
