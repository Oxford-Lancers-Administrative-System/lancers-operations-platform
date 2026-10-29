// @vitest-environment node
/**
 * The brief image's crest and fonts — LAN-508 round 3. Read once and kept,
 * but a failed read is not kept: the next render reads the file again, as it
 * would after any transient failure.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const failNext = vi.hoisted(() => ({ crest: 0 }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  const readFile = (async (...args: Parameters<typeof actual.readFile>) => {
    if (String(args[0]).endsWith("icon-mark.svg") && failNext.crest > 0) {
      failNext.crest -= 1;
      throw Object.assign(new Error("EMFILE: too many open files"), { code: "EMFILE" });
    }
    return actual.readFile(...args);
  }) as typeof actual.readFile;
  return { ...actual, default: { ...actual, readFile }, readFile };
});

import { renderBriefPng } from "./image";

describe("the brief image's crest", () => {
  it("retries a failed crest read on the next render instead of failing forever", async () => {
    failNext.crest = 1;
    await expect(renderBriefPng("# First")).rejects.toThrow("EMFILE");
    const png = await renderBriefPng("# Second");
    expect([...png.slice(1, 4)].map((code) => String.fromCharCode(code)).join("")).toBe("PNG");
  }, 30_000);
});
