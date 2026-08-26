#!/usr/bin/env node
/**
 * The local messaging ticker. LAN-169.
 *
 * ## What it is for
 *
 * The scheduler sweep runs when somebody POSTs to `/api/scheduler/messaging`.
 * In the deployed environment that somebody is Cloud Scheduler. On a developer
 * machine, and during a visual review, there is nobody — so the ladder never
 * advances, no reminder is ever sent, nothing escalates, and every screen this
 * mission builds shows a schedule that waits forever. This is the somebody.
 *
 * ## Why it is a separate process rather than a timer inside `next dev`
 *
 * Because a timer inside the application would also exist in the deployed
 * container, and would then be a second, invisible scheduler racing Cloud
 * Scheduler on however many instances happened to be warm. The two environments
 * would stop being the same application. A separate script is honest: the
 * deployed environment has an external trigger, and so does this one.
 *
 * ## Local only, and it refuses to be anything else
 *
 * The target must be loopback. Not "should be" — the check below is the whole
 * of the guard and there is no variable that lifts it. A ticker pointed at a
 * deployed host would be an unattended process making the club send messages on
 * a loop from somebody's laptop.
 *
 * Run it beside `npm run dev`:
 *
 *     npm run messaging:ticker
 *
 * It reads `.env.local` for the application port and the trigger token, which
 * `npm run db:start` writes, so it needs no configuration of its own.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const INTERVAL_MS = Number.parseInt(process.env.MESSAGING_TICK_MS ?? "15000", 10);

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function readEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(file, "utf8")
      .split("\n")
      .filter((line) => line.includes("=") && !line.trimStart().startsWith("#"))
      .map((line) => [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1)]),
  );
}

const repoPath = process.cwd();
const fileEnv = readEnvFile(path.join(repoPath, ".env.local"));
const env = { ...fileEnv, ...process.env };

const port = (env.PORT ?? "3000").trim();
const base = (env.APP_BASE_URL ?? `http://localhost:${port}`).trim().replace(/\/+$/, "");

let host;
try {
  host = new URL(base).hostname.toLowerCase();
} catch {
  console.error(`Refusing to tick: ${base} is not a URL.`);
  process.exit(1);
}

if (!LOOPBACK.has(host) && !host.endsWith(".localhost")) {
  console.error(
    `Refusing to tick ${base}. The messaging ticker is a local development affordance and ` +
      "only ever drives a loopback address; the deployed environment is triggered by Cloud " +
      "Scheduler. See docs/local-development.md.",
  );
  process.exit(1);
}

const token = (env.SCHEDULER_TRIGGER_TOKEN ?? "").trim();
if (token === "") {
  console.error(
    "Refusing to tick: SCHEDULER_TRIGGER_TOKEN is not set. The endpoint refuses an " +
      "unauthenticated caller, so a ticker without the token would only ever collect 401s. " +
      "Set it in .env.local — any value will do locally.",
  );
  process.exit(1);
}

const target = `${base}/api/scheduler/messaging`;
console.log(`Ticking ${target} every ${Math.round(INTERVAL_MS / 1000)}s. Ctrl-C to stop.`);

let stopping = false;
process.on("SIGINT", () => {
  stopping = true;
  console.log("\nStopped.");
  process.exit(0);
});

async function tick() {
  try {
    const response = await fetch(target, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      console.error(`  tick → ${response.status}`);
      return;
    }

    const summary = await response.json();
    // Only printed when it did something. A ticker that logs "0 dispatched"
    // every fifteen seconds buries the one line somebody is waiting for.
    if (
      summary.dispatched > 0 ||
      summary.flagsRaised > 0 ||
      summary.escalationsCreated > 0 ||
      summary.escalationsHeld > 0
    ) {
      console.log(
        `  dispatched ${summary.dispatched} (accepted ${summary.accepted}, refused ${summary.refused})` +
          `, flags ${summary.flagsRaised}, escalations ${summary.escalationsCreated}` +
          (summary.escalationsHeld > 0 ? `, held ${summary.escalationsHeld}` : ""),
      );
    }
  } catch (error) {
    console.error(`  tick → ${error instanceof Error ? error.message : "failed"}`);
  }
}

// Sequential rather than on an interval, so a slow sweep does not overlap
// itself. The dispatcher's claim would make an overlap safe; making it
// impossible is cheaper than relying on that being true forever.
while (!stopping) {
  await tick();
  await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
}
