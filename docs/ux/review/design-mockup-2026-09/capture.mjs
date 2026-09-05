// Scratch batch capture for LAN-225 — per-route timeouts (local-run-traps §4).
// Signs in through the real login, walks the preview routes at both viewports,
// writes full-page PNGs into the review folder and a manifest with the measured
// viewport. Never prints the password. Evidence for `db:review-ready` still comes
// from one small `npm run visual:preflight` run afterwards.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
const W = process.cwd();
const { readSession, updateLease } = await import(
  `${W}/scripts/lib/local-supabase-coordinator.mjs`
);
const { readLocalReviewAccount } = await import(`${W}/scripts/lib/local-review-account.mjs`);

const OUT = path.join(W, "docs/ux/review/design-mockup-2026-09/screens");
fs.mkdirSync(OUT, { recursive: true });

const ROUTES = [
  { id: "S1-roster", route: "/design-preview/roster" },
  { id: "S2-player", route: "/design-preview/player" },
  { id: "S3-event", route: "/design-preview/event" },
  { id: "S4-event-new", route: "/design-preview/event-new" },
  { id: "S5-rsvp", route: "/design-preview/rsvp" },
  { id: "S5-rsvp-unusable", route: "/design-preview/rsvp-unusable" },
  { id: "S6-report", route: "/design-preview/report" },
  { id: "S7-login", route: "/design-preview/login" },
  { id: "S8-operators", route: "/design-preview/operators" },
  { id: "S8-operator", route: "/design-preview/operator" },
  { id: "S9-player-home", route: "/design-preview/player-home" },
  { id: "S10-player-details", route: "/design-preview/player-details" },
  { id: "S10b-player-agreement", route: "/design-preview/player-agreement" },
  { id: "S11-answer", route: "/design-preview/answer" },
  { id: "K-kit", route: "/design-preview/kit" },
  { id: "index", route: "/design-preview" },
];
const VIEWPORTS = [
  { label: "desktop", width: 1440, height: 900 },
  { label: "phone", width: 375, height: 812 },
];
/** One viewport-sized phone shot each of the two forms whose foot is sticky. */
const STICKY_PROOFS = [
  { id: "S4-actionbar", route: "/design-preview/event-new" },
  { id: "S10-actionbar", route: "/design-preview/player-details" },
];

const session = readSession(W);
const lease = await updateLease({ repoPath: W, token: session.token });
const account = readLocalReviewAccount(W);
const origin = `http://127.0.0.1:${lease.applicationPort}`;
const browser = await chromium.launch();
const manifest = [];

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  // Two things a full-page capture would otherwise say that are not true.
  //
  // `next dev` floats its dev-tools badge in the bottom-left corner, which is
  // exactly where the shell's account block puts **Sign out**. It never ships,
  // so a capture that shows it sitting on top of a real control misrepresents
  // the design rather than documenting it.
  //
  // And a `position: sticky` foot — `ActionBar` on a phone — is painted once
  // per stitched tile by a full-page capture, so it lands in the *middle* of
  // the form rather than at the foot of the viewport where it belongs. That is
  // how "Save draft / Save and choose audience / Cancel" ended up sitting on
  // top of the Where field in S4's 4 September phone capture. The whole-page
  // shot therefore unsticks it — a still photograph cannot show pinning
  // anyway — and `STICKY_PROOFS` below takes one viewport-sized shot of each
  // sticky foot doing its job.
  await context.addInitScript(() => {
    const style = document.createElement("style");
    style.textContent =
      "nextjs-portal, [data-nextjs-dev-tools-button] { display: none !important }" +
      "html.capture-unstick [data-testid='action-bar'] { position: static !important }";
    document.addEventListener("DOMContentLoaded", () => document.head.append(style));
  });
  const page = await context.newPage();
  await page.goto(`${origin}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.fill('input[type="email"]', account.email);
  await page.fill('input[type="password"]', account.password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 }),
    page.click('button[type="submit"]'),
  ]);
  const seen = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  console.log(`${vp.label}: measured ${seen.width}x${seen.height}`);

  for (const entry of ROUTES) {
    const file = `${entry.id}--${vp.label}.png`;
    const started = Date.now();
    try {
      await page.goto(`${origin}${entry.route}`, {
        waitUntil: "domcontentloaded",
        timeout: 90_000,
      });
      await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
      await page.waitForTimeout(400);
      await page.evaluate(() => document.documentElement.classList.add("capture-unstick"));
      await page.screenshot({ path: path.join(OUT, file), fullPage: true, timeout: 60_000 });
      const size = await page.evaluate(() => ({ h: document.documentElement.scrollHeight }));
      manifest.push({
        id: entry.id,
        route: entry.route,
        viewport: vp.label,
        measured: seen,
        file,
        pageHeight: size.h,
        ms: Date.now() - started,
      });
      console.log(`  ${file} (${size.h}px, ${Date.now() - started}ms)`);
    } catch (error) {
      manifest.push({
        id: entry.id,
        route: entry.route,
        viewport: vp.label,
        file,
        error: String(error.message).slice(0, 200),
      });
      console.log(`  ${file} FAILED: ${String(error.message).slice(0, 120)}`);
    }
  }

  if (vp.label === "phone") {
    // The sticky feet, viewport only, doing what the whole-page shots unstick.
    for (const proof of STICKY_PROOFS) {
      const file = `${proof.id}--phone.png`;
      try {
        await page.goto(`${origin}${proof.route}`, {
          waitUntil: "domcontentloaded",
          timeout: 90_000,
        });
        await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(OUT, file), fullPage: false });
        manifest.push({
          id: proof.id,
          route: `${proof.route} (sticky foot, viewport only)`,
          viewport: "phone",
          measured: seen,
          file,
        });
        console.log(`  ${file}`);
      } catch (error) {
        console.log(`  ${file} FAILED: ${String(error.message).slice(0, 120)}`);
      }
    }

    // S0: the drawer open, viewport only.
    try {
      await page.goto(`${origin}/design-preview/roster`, {
        waitUntil: "domcontentloaded",
        timeout: 90_000,
      });
      await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
      await page.click('button[aria-label="Open navigation"]', { timeout: 10_000 });
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(OUT, "S0-drawer--phone.png"), fullPage: false });
      manifest.push({
        id: "S0-drawer",
        route: "/design-preview/roster (drawer open)",
        viewport: "phone",
        measured: seen,
        file: "S0-drawer--phone.png",
      });
      console.log("  S0-drawer--phone.png");
    } catch (error) {
      console.log(`  S0-drawer FAILED: ${String(error.message).slice(0, 120)}`);
    }
  }
  await context.close();
}
await browser.close();
fs.writeFileSync(
  path.join(OUT, "..", "manifest.json"),
  JSON.stringify(
    {
      headSha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
      at: new Date().toISOString(),
      captures: manifest,
    },
    null,
    2,
  ) + "\n",
);
console.log("done");
