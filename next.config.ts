import type { NextConfig } from "next";

/**
 * The response headers every page and route carries (LAN-352).
 *
 * The production audit found the deployed service sending none of these:
 * Firebase Hosting adds `Strict-Transport-Security`, and `src/proxy.ts` adds
 * `Cache-Control`, `Referrer-Policy` and `X-Robots-Tag` to the private-link
 * pages, but nothing stopped a page being framed, a response being sniffed, or
 * the browser handing a camera or microphone to a page that never asked.
 *
 * Why here and not `src/proxy.ts`: the proxy sets the three headers Next
 * itself rewrites on a dynamic render (`Cache-Control` above all), because a
 * `headers()` entry loses that fight. These are not among the headers Next
 * touches, so the config is the cheaper and more visible home, and it also
 * covers the static assets and API routes the proxy never runs for.
 *
 * The Content-Security-Policy is deliberately the part that cannot break a
 * page: it forbids framing, base-tag hijack, cross-site form posts and
 * plugins, and says nothing about scripts or styles. A script policy needs a
 * per-request nonce, which in Next lives in the proxy — an owner-gated file —
 * and MUI's Emotion styles need `'unsafe-inline'` until a nonce reaches them
 * too. That is a separate, deliberate change, not a header to add blind.
 */
export const SECURITY_HEADERS: ReadonlyArray<{ key: string; value: string }> = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  },
];

const nextConfig: NextConfig = {
  // `X-Powered-By: Next.js` names the framework to anyone who asks; nothing
  // legitimate reads it.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: [...SECURITY_HEADERS] }];
  },
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
