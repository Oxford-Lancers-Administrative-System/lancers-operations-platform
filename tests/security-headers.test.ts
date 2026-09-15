/**
 * The response headers the production audit found missing — LAN-352.
 *
 * `curl -D - https://app.oxfordlancers.com/login` on 2026-09-15 came back with
 * HSTS from Firebase and nothing else: no frame protection, no sniffing
 * protection, no permissions policy, and `X-Powered-By: Next.js`. This pins the
 * set `next.config.ts` now sends so that a later tidy cannot drop one silently.
 *
 * The private-link headers (`Cache-Control`, the `no-referrer` policy and
 * `X-Robots-Tag`) are the proxy's and are asserted in
 * `tests/operate-route-protection.test.ts`; the proxy's `Referrer-Policy` must
 * keep winning on those routes, which is why the global value here is the
 * weaker `strict-origin-when-cross-origin` and the test below checks the
 * proxy still names the stricter one.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import nextConfig, { SECURITY_HEADERS } from "../next.config";

const REQUIRED: Record<string, RegExp> = {
  "X-Content-Type-Options": /^nosniff$/,
  "X-Frame-Options": /^DENY$/,
  "Referrer-Policy": /^strict-origin-when-cross-origin$/,
  "Permissions-Policy": /camera=\(\)/,
  "Content-Security-Policy": /frame-ancestors 'none'/,
};

describe("the security headers every response carries", () => {
  it("applies the full set to every path", async () => {
    const entries = await nextConfig.headers!();
    const everything = entries.find((entry) => entry.source === "/(.*)");
    expect(everything, "no catch-all headers() entry").toBeDefined();
    for (const [key, pattern] of Object.entries(REQUIRED)) {
      const header = everything!.headers.find((h) => h.key === key);
      expect(header, `${key} missing`).toBeDefined();
      expect(header!.value).toMatch(pattern);
    }
    expect(everything!.headers).toEqual([...SECURITY_HEADERS]);
  });

  it("does not name the framework", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it("leaves script and style policy to a deliberate nonce change", () => {
    const csp = SECURITY_HEADERS.find((h) => h.key === "Content-Security-Policy")!.value;
    expect(csp).not.toMatch(/script-src|style-src|default-src/);
  });

  it("keeps the proxy's stricter referrer policy on private links", () => {
    const proxy = readFileSync(path.join(process.cwd(), "src/proxy.ts"), "utf8");
    expect(proxy).toMatch(/\["Referrer-Policy", "no-referrer"\]/);
  });
});
