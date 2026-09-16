// @vitest-environment node
/**
 * What the production build can serve — LAN-357, from the LAN-352 audit's
 * finding A9.
 *
 * `/design-preview` was seventeen pages of LAN-225 review scaffolding: the real
 * screens, on the real services, rendered with the proposed kit. Every one of
 * them called `gateShellPage` with the same capability as the page it mirrored,
 * so it was never an authorization bypass — but it shipped in the production
 * build, and any signed-in operator could reach internal preview UI that had
 * never been reviewed as a product surface. Brian: drop it.
 *
 * Deleted rather than excluded. Excluding a directory from one build is a
 * configuration somebody has to keep true; a directory that is not there cannot
 * come back by accident, and `git log` still has every line of it. This file is
 * what stops it being re-added without a decision.
 *
 * It reads the route tree as directories. No build, no server, no network: the
 * App Router's route surface *is* the directory tree under `src/app`, so a
 * folder that exists is a route that exists.
 */
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const REPO = path.resolve(import.meta.dirname, "..");
const APP = path.join(REPO, "src/app");

/** Every route segment directory under `src/app`, relative to it. */
async function routeDirectories(from: string = APP): Promise<string[]> {
  const entries = await readdir(from, { withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = path.join(from, entry.name);
    found.push(path.relative(APP, full));
    found.push(...(await routeDirectories(full)));
  }
  return found;
}

describe("the production route surface", () => {
  it("has no design-preview route, at any depth", async () => {
    await expect(stat(path.join(APP, "design-preview"))).rejects.toThrow();

    const directories = await routeDirectories();
    expect(directories.filter((directory) => directory.includes("design-preview"))).toEqual([]);
  });

  it("keeps the components those previews shared with live screens", async () => {
    // The previews rendered live screens with the kit, so deleting them must
    // not take a component a real route still mounts with it. `step-trail` is
    // the one two of them shared with `/onboarding/[token]` (LAN-362).
    for (const file of [
      "src/components/step-trail.tsx",
      "src/components/brand-mark.tsx",
      "src/theme.ts",
    ]) {
      const stats = await stat(path.join(REPO, file));
      expect(stats.isFile(), `${file} is missing`).toBe(true);
    }
  });
});
