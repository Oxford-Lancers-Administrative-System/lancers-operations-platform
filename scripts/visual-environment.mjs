#!/usr/bin/env node
/**
 * The supervisor that owns a pending visual environment (LAN-148 §B).
 *
 * `start` spawns a detached child that holds the Next application and refreshes
 * the database lease on a timer, then returns immediately. The worker that
 * called it can exit, be killed, or finish its receipt; the environment stays
 * up, authenticated and seeded, until it is approved, rejected, obsoleted or
 * explicitly abandoned. That interval — between the agent finishing and Brian
 * looking — is the whole reason it exists, and it is exactly the interval the
 * old worker-owned child process could not survive.
 *
 * `supervise` is the child. `status` reports without changing anything.
 * `release` stops the application and hands the slot back.
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { config } from "dotenv";
import { readSession, releaseLease, updateLease } from "./lib/local-supabase-coordinator.mjs";
import {
  ENVIRONMENT_DISPOSITIONS,
  environmentDefects,
  newEnvironmentId,
  readEnvironment,
  supervisorAlive,
  writeEnvironment,
} from "./lib/visual-environment.mjs";

const repoPath = process.cwd();
const [operation, ...rest] = process.argv.slice(2);
const option = (name) => {
  const index = rest.indexOf(name);
  return index === -1 ? undefined : rest[index + 1];
};

const LIVENESS_INTERVAL_MS = 60_000;
const headSha = () =>
  execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoPath, encoding: "utf8" }).trim();

/** One probe of the running application: it answers, on its own port. */
async function proveLive(url) {
  const response = await fetch(url, { redirect: "manual" }).catch(() => null);
  return Boolean(response && response.status < 500);
}

try {
  if (operation === "start") {
    const session = readSession(repoPath);
    const lease = await updateLease({ repoPath, token: session.token });
    const existing = readEnvironment(repoPath);
    if (existing && existing.disposition === "pending" && supervisorAlive(existing)) {
      console.log(`${existing.environmentId} is already supervised at ${existing.url}.`);
    } else {
      const sha = headSha();
      const record = {
        environmentId: newEnvironmentId(sha, lease.slot),
        headSha: sha,
        url: `http://127.0.0.1:${lease.applicationPort}`,
        slot: lease.slot,
        applicationPort: lease.applicationPort,
        disposition: "pending",
        livenessIntervalMs: LIVENESS_INTERVAL_MS,
        startedAt: new Date().toISOString(),
        lastLiveness: null,
        supervisorPid: null,
      };
      writeEnvironment(repoPath, record);
      const logFile = path.join(repoPath, ".lancers-runtime", "visual-environment.log");
      const log = fs.openSync(logFile, "a");
      const child = spawn(
        process.execPath,
        [path.join(repoPath, "scripts", "visual-environment.mjs"), "supervise"],
        {
          cwd: repoPath,
          detached: true,
          stdio: ["ignore", log, log],
        },
      );
      child.unref();
      writeEnvironment(repoPath, { ...record, supervisorPid: child.pid });
      console.log(
        `${record.environmentId} supervised at ${record.url} (head ${sha}). It outlives this session.`,
      );
    }
  } else if (operation === "supervise") {
    // The child. It owns the application and the lease until it is told to stop.
    const session = readSession(repoPath);
    const lease = await updateLease({ repoPath, token: session.token });
    config({ path: path.join(repoPath, ".env.local"), quiet: true });
    const app = spawn(
      path.join(repoPath, "node_modules", ".bin", "next"),
      ["dev", "-p", String(lease.applicationPort)],
      {
        cwd: repoPath,
        env: { ...process.env, PORT: String(lease.applicationPort) },
        stdio: "inherit",
      },
    );
    const stop = () => {
      app.kill("SIGTERM");
      process.exit(0);
    };
    process.on("SIGTERM", stop);
    process.on("SIGINT", stop);

    // Repair rather than report: a lease that stops being refreshed is how the
    // first live mission lost its environments, and Brian is never given a
    // command to fix one.
    const beat = async () => {
      const record = readEnvironment(repoPath);
      if (!record || record.disposition !== "pending") stop();
      try {
        await updateLease({ repoPath, token: session.token });
        const live = await proveLive(`${record.url}/login`);
        writeEnvironment(repoPath, {
          ...record,
          lastLiveness: live ? new Date().toISOString() : record.lastLiveness,
          lastProbe: { at: new Date().toISOString(), live },
        });
      } catch (error) {
        console.error(`supervisor: ${error.message}`);
      }
    };

    // Prove it as soon as it answers, not one interval later. Waiting made
    // `status` report "never proved itself live" for the first minute of an
    // environment that was already serving, which is a readiness gate failing
    // on its own startup delay.
    const settle = async () => {
      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline) {
        const record = readEnvironment(repoPath);
        if (!record || record.disposition !== "pending") return;
        if (await proveLive(`${record.url}/login`)) return beat();
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
    };
    void settle();
    setInterval(beat, LIVENESS_INTERVAL_MS).unref?.();
    // Keep the process alive for the application's sake.
    await new Promise(() => {});
  } else if (operation === "status") {
    const record = readEnvironment(repoPath);
    const defects = environmentDefects(record, { headSha: headSha() });
    console.log(
      JSON.stringify({ environment: record, live: defects.length === 0, defects }, null, 2),
    );
    if (defects.length) process.exitCode = 2;
  } else if (operation === "disposition") {
    const value = option("--set");
    if (!ENVIRONMENT_DISPOSITIONS.includes(value)) {
      throw new Error(`Disposition must be one of ${ENVIRONMENT_DISPOSITIONS.join(", ")}.`);
    }
    const record = readEnvironment(repoPath);
    if (!record) throw new Error("No visual environment is recorded.");
    writeEnvironment(repoPath, {
      ...record,
      disposition: value,
      dispositionAt: new Date().toISOString(),
      dispositionNote: option("--note") ?? null,
    });
    console.log(`${record.environmentId} is now ${value}.`);
  } else if (operation === "release") {
    const record = readEnvironment(repoPath);
    if (record?.supervisorPid && supervisorAlive(record)) {
      try {
        process.kill(record.supervisorPid, "SIGTERM");
      } catch {
        // Already gone; releasing the lease below is still the right thing.
      }
    }
    if (record) {
      writeEnvironment(repoPath, {
        ...record,
        disposition: record.disposition === "pending" ? "abandoned" : record.disposition,
        releasedAt: new Date().toISOString(),
      });
    }
    const session = readSession(repoPath);
    const lease = await releaseLease({ repoPath, token: session.token, slot: session.slot });
    console.log(`Released ${lease.slot}.`);
  } else {
    throw new Error(
      "Usage: visual-environment <start|status|disposition --set <state> [--note <why>]|release>",
    );
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
