import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { readSession, updateLease } from "../../lib/local-supabase-coordinator.mjs";
import { readLocalReviewAccount } from "../../lib/local-review-account.mjs";

/**
 * Photograph one intake screen out of the running application.
 *
 * LAN-166. The first ledger-driven intake spent about half its five hours
 * drawing pages that already existed, because the artifact the standards tell
 * an agent to copy — `assets/mockup-exemplar.html` — has no current side at
 * all. Its author then rebuilt a Playwright capture loop roughly six times,
 * and burned five turns on `generate_link`/`otp` dead ends, while
 * `scripts/visual-preflight.mjs` had been signing into this application at a
 * measured 375px the whole time.
 *
 * So this shares that script's proven core rather than restating it: the same
 * lease, the same protected machine-local review account, the same real login
 * form, the same read-back of the width the browser actually reports. What is
 * new is one idea — a screen may also be photographed a second time with the
 * proposal evaluated into the live DOM, so both sides of a modified surface
 * are photographs of the same running page differing only by the proposal.
 *
 * No password is printed, stored in the evidence, or passed on a command line.
 */

/**
 * Both frames a mockup screen must show. The phone width is the one that
 * cannot be produced honestly by resizing a window on the review machine, so
 * it is measured and recorded rather than asserted — the same reason
 * `visual-review-readiness.mjs` demands a measured 375.
 */
export const SHOOT_VIEWPORTS = [
  { label: "desktop", width: 1280, height: 900, exact: false },
  { label: "phone375", width: 375, height: 812, exact: true },
];

export const SHOTS_DIR = path.join("mockups", "shots");
export const SHOTS_FILE = path.join(SHOTS_DIR, "shots.json");

const SCREEN_ID = /^W[0-9]+-[0-9]{2}[a-z]?$/;

export function readShots(ledgerRoot) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(ledgerRoot, SHOTS_FILE), "utf8"));
    return Array.isArray(parsed.screens) ? parsed : { screens: [] };
  } catch (error) {
    if (error.code === "ENOENT") return { screens: [] };
    throw error;
  }
}

/**
 * How many screens in this ledger were photographed at a browser-measured
 * 375px, so the hub can state a fact instead of repeating a promise. The first
 * intake's hub claimed every screen was rendered "at a true 375" when both
 * frames were the same desktop markup in a narrow box.
 */
export function measuredScreenCount(ledgerRoot) {
  return readShots(ledgerRoot).screens.filter((screen) =>
    SHOOT_VIEWPORTS.filter((viewport) => viewport.exact).every((viewport) =>
      (screen.captures ?? []).some(
        (capture) =>
          capture.viewport === viewport.label && capture.measuredWidth === viewport.width,
      ),
    ),
  ).length;
}

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

/**
 * Capture one screen. `mutate` is JavaScript evaluated in the page after the
 * current-state screenshot; supplying it is what makes a screen's proposed
 * side a photograph rather than a drawing.
 */
export async function shootScreen({
  repoPath,
  ledgerRoot,
  screenId,
  route,
  mutate = null,
  mutateFile = null,
}) {
  if (!SCREEN_ID.test(screenId))
    throw new Error(`Screen id must match Wn-nn, for example W5-01; received ${screenId}.`);
  if (!route.startsWith("/"))
    throw new Error(`Route must be an application path beginning with /; received ${route}.`);

  const headSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoPath,
    encoding: "utf8",
  }).trim();
  let lease;
  try {
    const session = readSession(repoPath);
    lease = await updateLease({ repoPath, token: session.token });
  } catch (error) {
    // The first intake lost turns to environment failures that reported
    // themselves as file-system errors. Say what to do instead.
    throw new Error(
      `No local Supabase lease in this worktree, so there is no running application to photograph. Acquire one with \`npm run db:acquire -- <issue>\` and start the app before shooting. (${error.message})`,
    );
  }
  const account = readLocalReviewAccount(repoPath);
  const origin = `http://127.0.0.1:${lease.applicationPort}`;

  const outputDir = path.join(ledgerRoot, SHOTS_DIR);
  fs.mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch();
  const captures = [];
  try {
    for (const viewport of SHOOT_VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
      });
      const page = await context.newPage();

      await page.goto(`${origin}/login`, { waitUntil: "domcontentloaded" });
      await page.fill('input[type="email"]', account.email);
      await page.fill('input[type="password"]', account.password);
      await Promise.all([
        page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 }),
        page.click('button[type="submit"]'),
      ]);

      await page.goto(`${origin}${route}`, { waitUntil: "networkidle" });

      // The measurement itself: what the browser says, not what we asked for.
      const seen = await page.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
      }));
      if (viewport.exact && seen.width !== viewport.width) {
        throw new Error(
          `${viewport.label}: the browser context measured ${seen.width}px, not ${viewport.width}px.`,
        );
      }

      const sides = [{ side: "current", script: null }];
      if (mutate !== null) sides.push({ side: "proposed", script: mutate });

      for (const { side, script } of sides) {
        if (script !== null) await page.evaluate(script);
        const file = `${screenId}-${side}-${viewport.label}.png`;
        await page.screenshot({ path: path.join(outputDir, file), fullPage: true });
        captures.push({
          side,
          viewport: viewport.label,
          requestedWidth: viewport.width,
          measuredWidth: seen.width,
          measuredHeight: seen.height,
          file: path.posix.join("shots", file),
        });
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }

  const record = {
    id: screenId,
    route,
    headSha,
    slot: lease.slot,
    // The proposal is retained by hash so a screen cannot silently be
    // rephotographed against a different change than the one approved.
    proposal:
      mutate === null ? null : { file: mutateFile, sha256: sha256(mutate), bytes: mutate.length },
    captures,
    at: new Date().toISOString(),
  };

  const shots = readShots(ledgerRoot);
  shots.screens = [...shots.screens.filter((screen) => screen.id !== screenId), record].sort(
    (left, right) => left.id.localeCompare(right.id),
  );
  fs.writeFileSync(
    path.join(ledgerRoot, SHOTS_FILE),
    `${JSON.stringify(shots, null, 2)}\n`,
    "utf8",
  );
  return record;
}
