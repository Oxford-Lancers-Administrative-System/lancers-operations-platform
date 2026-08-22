#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  markConfigApplied,
  prepareRuntime,
  readSession,
  renderedConfigFingerprint,
  updateLease,
} from "./lib/local-supabase-coordinator.mjs";
import { ensureLocalReviewAccount, readLocalReviewAccount } from "./lib/local-review-account.mjs";

const repoPath = process.cwd();
const operation = process.argv[2];

function run(command, args, env = process.env, echo = true) {
  const result = spawnSync(command, args, {
    cwd: repoPath,
    env,
    encoding: "utf8",
    stdio: ["inherit", "pipe", "pipe"],
  });
  if (echo && result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) process.exit(result.status ?? 1);
  return result.stdout;
}

/** Stopping a stack that is not running is not a failure worth aborting on. */
function runTolerant(command, args, env = process.env) {
  spawnSync(command, args, {
    cwd: repoPath,
    env,
    encoding: "utf8",
    stdio: ["inherit", "pipe", "pipe"],
  });
}

function localEnvironment(lease, account) {
  return {
    ...process.env,
    SUPABASE_DB_URL: `postgresql://postgres:postgres@127.0.0.1:${lease.ports.db}/postgres`,
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${lease.ports.api}`,
    SUPABASE_WORKDIR: lease.runtimeRoot,
    PORT: String(lease.applicationPort),
    ...(account ? { TEST_USER_EMAIL: account.email, TEST_USER_PASSWORD: account.password } : {}),
  };
}

function provisionReviewState(lease, account) {
  const env = localEnvironment(lease, account);
  for (const script of [
    "scripts/seed-local.mjs",
    "scripts/create-test-user.mjs",
    "scripts/link-test-operator.mjs",
    // LAN-110's coach login. The operator login above holds committee seats and
    // therefore gets the operator's board, which is correct — so the coach
    // surface needs its own login or it cannot be looked at at all. Local only,
    // same protected password, no hosted counterpart.
    "scripts/link-review-coach.mjs",
  ])
    run(process.execPath, [script], env);
}

try {
  const session = readSession(repoPath);
  const lease = await updateLease({ repoPath, token: session.token });
  const cli = path.join(repoPath, "node_modules", ".bin", "supabase");
  const cliEnv = {
    ...process.env,
    XDG_CONFIG_HOME: path.join(repoPath, ".lancers-runtime", "xdg"),
    SUPABASE_TELEMETRY_DISABLED: "1",
  };
  const cliArgs = (command, extra = []) => [command, ...extra, "--workdir", lease.runtimeRoot];

  // The per-slot runtime config is rendered from the tracked one, and until
  // LAN-125 it was rendered only when the lease was first acquired. An edit to
  // `supabase/config.toml` — a redirect allow-list entry, an email template —
  // then had no effect until the slot happened to be released and taken again,
  // which is a stale-configuration bug that looks like a code fault. Re-render
  // before anything that reads it.
  if (["start", "reset"].includes(operation)) {
    prepareRuntime(repoPath, lease);
  }

  // LAN-148. `supabase start` against containers that are already up is a
  // no-op, and `db reset` rebuilds the database without restarting Auth. A
  // re-fenced stack would therefore keep serving the previous holder's
  // `site_url` and redirect allow-list while every rendered file said
  // otherwise — invisible from the filesystem, and fatal to a recovery link.
  // Restart when the applied configuration no longer matches the rendered one,
  // and record what was actually applied.
  const applyRenderedConfig = async () => {
    const fingerprint = renderedConfigFingerprint(repoPath, lease);
    // A null `appliedConfig` is not "nothing is running" — it is "this holder
    // has never applied anything", which is exactly the re-fenced case where
    // the containers still serve the previous holder's site URL and redirect
    // allow-list. Unproven is treated as drifted.
    if (lease.appliedConfig !== fingerprint) {
      console.log(`Applying this holder's configuration to ${lease.slot}; restarting the stack.`);
      runTolerant(cli, cliArgs("stop", ["--no-backup"]), cliEnv);
    }
    return fingerprint;
  };

  if (operation === "start") {
    const reviewAccount = ensureLocalReviewAccount(repoPath);
    const fingerprint = await applyRenderedConfig();
    run(cli, cliArgs("start"), cliEnv, false);
    await markConfigApplied({ repoPath, token: session.token, fingerprint });
    const raw = run(cli, cliArgs("status", ["-o", "json"]), cliEnv, false);
    const status = JSON.parse(raw);
    const envFile = [
      `NEXT_PUBLIC_SUPABASE_URL=${status.API_URL}`,
      `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${status.PUBLISHABLE_KEY}`,
      `NEXT_PUBLIC_SUPABASE_ANON_KEY=${status.ANON_KEY}`,
      `SUPABASE_SECRET_KEY=${status.SECRET_KEY}`,
      `SUPABASE_SERVICE_ROLE_KEY=${status.SERVICE_ROLE_KEY}`,
      `SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:${lease.ports.db}/postgres`,
      `PORT=${lease.applicationPort}`,
      `TEST_USER_EMAIL=${reviewAccount.email}`,
      "",
    ].join("\n");
    fs.writeFileSync(path.join(repoPath, ".env.local"), envFile, { mode: 0o600 });
    provisionReviewState(lease, reviewAccount);
    console.log(`Started ${lease.slot} local Supabase stack on API port ${lease.ports.api}.`);
  } else if (operation === "stop") run(cli, cliArgs("stop", ["--no-backup"]), cliEnv);
  else if (operation === "reset") {
    const reviewAccount = ensureLocalReviewAccount(repoPath);
    const fingerprint = await applyRenderedConfig();
    if (lease.appliedConfig !== fingerprint) {
      run(cli, cliArgs("start"), cliEnv, false);
      await markConfigApplied({ repoPath, token: session.token, fingerprint });
    }
    run(cli, cliArgs("db", ["reset", "--local", "--yes"]), cliEnv);
    provisionReviewState(lease, reviewAccount);
  } else if (operation === "status") {
    const raw = run(cli, cliArgs("status", ["-o", "json"]), cliEnv, false);
    const status = JSON.parse(raw);
    console.log(
      JSON.stringify({
        slot: lease.slot,
        projectId: lease.projectId,
        applicationPort: lease.applicationPort,
        ports: lease.ports,
        running: Boolean(status.API_URL && status.DB_URL),
      }),
    );
  } else if (
    ["seed", "seed-user", "link-operator", "link-coach", "types-generate"].includes(operation)
  ) {
    const scripts = {
      seed: "scripts/seed-local.mjs",
      "seed-user": "scripts/create-test-user.mjs",
      "link-operator": "scripts/link-test-operator.mjs",
      "link-coach": "scripts/link-review-coach.mjs",
      "types-generate": "scripts/generate-types.mjs",
    };
    const env = ["seed-user", "link-operator", "link-coach"].includes(operation)
      ? localEnvironment(lease, readLocalReviewAccount(repoPath))
      : localEnvironment(lease);
    run(process.execPath, [scripts[operation]], env);
  } else throw new Error("Unknown guarded database operation.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
