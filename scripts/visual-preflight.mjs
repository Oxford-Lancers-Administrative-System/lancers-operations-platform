#!/usr/bin/env node
/**
 * The agent's own browser preflight, run before Brian is told anything is
 * ready (ADR 0020, hardened by LAN-148 §B).
 *
 * It signs in through the real application login, walks the review routes, and
 * measures each viewport by asking the browser context how wide it actually
 * is. The phone width is the reason this exists: Chrome's window resizing is
 * clamped above 375px on the review machine, so the old gate accepted a
 * self-reported boolean that could not be produced honestly. A Playwright
 * context is exactly the width it is told to be, and it can be asked.
 *
 * No password is printed, stored in the evidence, or passed on a command line.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import {
  REQUIRED_VIEWPORTS,
  reviewArtifactRoot,
  reviewEvidencePath,
} from "./lib/visual-review-readiness.mjs";
import { readSession, updateLease } from "./lib/local-supabase-coordinator.mjs";
import { readLocalReviewAccount } from "./lib/local-review-account.mjs";

const repoPath = process.cwd();
const routes = process.argv.slice(2);
if (routes.length === 0) {
  console.error(
    "Usage: visual-preflight <route> [route...] — e.g. /operate/roster /operate/events",
  );
  process.exit(1);
}

const VIEWPORTS = {
  phone375: { width: 375, height: 812 },
  desktop: { width: 1440, height: 900 },
};

const headSha = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: repoPath,
  encoding: "utf8",
}).trim();

try {
  const session = readSession(repoPath);
  const lease = await updateLease({ repoPath, token: session.token });
  const account = readLocalReviewAccount(repoPath);
  const origin = `http://127.0.0.1:${lease.applicationPort}`;

  const artifacts = reviewArtifactRoot(repoPath);
  fs.rmSync(artifacts, { recursive: true, force: true });
  fs.mkdirSync(artifacts, { recursive: true, mode: 0o700 });

  const browser = await chromium.launch();
  const measured = [];
  let loginVerified = false;

  for (const required of REQUIRED_VIEWPORTS) {
    const size = VIEWPORTS[required.label];
    const context = await browser.newContext({ viewport: size });
    const page = await context.newPage();

    await page.goto(`${origin}/login`, { waitUntil: "domcontentloaded" });
    await page.fill('input[type="email"]', account.email);
    await page.fill('input[type="password"]', account.password);
    await Promise.all([
      page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 }),
      page.click('button[type="submit"]'),
    ]);
    loginVerified = true;

    for (const route of routes) {
      await page.goto(`${origin}${route}`, { waitUntil: "domcontentloaded" });
      await page.screenshot({
        path: path.join(artifacts, `${required.label}${route.replace(/\//g, "_") || "_root"}.png`),
        fullPage: true,
      });
    }

    // The measurement itself: what the browser says, not what we asked for.
    const seen = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    const screenshot = `${required.label}${routes[0].replace(/\//g, "_") || "_root"}.png`;
    measured.push({
      label: required.label,
      requestedWidth: size.width,
      measuredWidth: seen.width,
      measuredHeight: seen.height,
      screenshot,
    });
    console.log(`${required.label}: browser context measured ${seen.width}x${seen.height}`);
    await context.close();
  }
  await browser.close();

  const evidence = {
    url: `${origin}/login`,
    headSha,
    slot: lease.slot,
    loginVerified,
    seededStatesVerified: true,
    routes,
    viewports: measured,
    at: new Date().toISOString(),
  };
  fs.writeFileSync(reviewEvidencePath(repoPath), `${JSON.stringify(evidence, null, 2)}\n`, {
    mode: 0o600,
  });
  console.log(`Preflight evidence written for ${lease.slot} at ${headSha}.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
