// @vitest-environment node
import { describe, expect, it } from "vitest";

import { SECURITY_HEADERS } from "../next.config";

/**
 * LAN-363. The Code of Conduct step renders its PDF with pdf.js, which runs
 * the parser in a Web Worker loaded from this origin (`/pdfjs/...`).
 *
 * The application's Content-Security-Policy deliberately names no `script-src`
 * and no `worker-src` (see `next.config.ts`), so nothing blocks it today. The
 * hazard is a later, well-meant tightening: a `script-src` that forgets that a
 * worker without its own `worker-src` falls back to `script-src`, and the
 * document silently stops rendering for every player on every phone — with
 * nothing failing in CI, because no test reads the header.
 *
 * This is that test. It does not forbid a policy; it requires that if one is
 * added, it still allows this origin's own worker.
 */

const SELF_SOURCES = ["'self'", "*", "https:"];

function directive(policy: string, name: string): string[] | null {
  for (const part of policy.split(";")) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (tokens[0] === name) return tokens.slice(1);
  }
  return null;
}

describe("the Content-Security-Policy and pdf.js's worker", () => {
  const policy = SECURITY_HEADERS.find((header) => header.key === "Content-Security-Policy")?.value;

  it("is present at all", () => {
    expect(policy).toBeDefined();
  });

  it("lets the worker this origin serves load — `worker-src`, or `script-src` behind it", () => {
    const sources = directive(policy!, "worker-src") ?? directive(policy!, "script-src");
    if (sources === null) {
      // No policy governs it: the browser's own default is "anything", and the
      // worker loads. Nothing to assert beyond saying so.
      expect(directive(policy!, "default-src")).toBeNull();
      return;
    }
    expect(
      sources.some((source) => SELF_SOURCES.includes(source)),
      `Content-Security-Policy would block /pdfjs/pdf.worker.min.mjs: ${sources.join(" ")}`,
    ).toBe(true);
  });

  it("lets this origin's own document be fetched by it", () => {
    const connect = directive(policy!, "connect-src") ?? directive(policy!, "default-src");
    if (connect === null) return;
    expect(connect.some((source) => SELF_SOURCES.includes(source))).toBe(true);
  });
});
