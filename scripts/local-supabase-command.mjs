#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  assertMigrationsApplied,
  markConfigApplied,
  prepareRuntime,
  readSession,
  renderedConfigFingerprint,
  updateLease,
} from "./lib/local-supabase-coordinator.mjs";
import { ensureLocalReviewAccount, readLocalReviewAccount } from "./lib/local-review-account.mjs";
import { ensureLocalClubLinkSecret } from "./lib/local-club-link-secret.mjs";
import { connectLocal } from "./lib/local-db.mjs";

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

/**
 * Stopping a stack that is not running is not a failure worth aborting on. A
 * stop that fails while it *is* running is a different matter — the restart is
 * the only thing that makes Auth pick up this holder's redirect allow-list —
 * so the caller checks afterwards rather than trusting the exit code.
 */
function stopIfRunning(command, args, env = process.env) {
  spawnSync(command, args, {
    cwd: repoPath,
    env,
    encoding: "utf8",
    stdio: ["inherit", "pipe", "pipe"],
  });
}

/**
 * `supabase status` exits non-zero when the stack is not running — that is its
 * normal answer to "is anything up?", not a fault. Running it through `run()`
 * therefore killed the process before the caller could read the answer, which
 * made a stack that had never been started impossible to start: a freshly
 * allocated mission slot has `appliedConfig: null`, so the restart branch is
 * always taken, and the probe after the stop always aborted. Probe with a
 * runner that reports instead of exiting; the caller already treats an
 * unreadable answer as "not running".
 */
function probe(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    cwd: repoPath,
    env,
    encoding: "utf8",
    stdio: ["inherit", "pipe", "pipe"],
  });
  return result.status === 0 ? (result.stdout ?? "") : "";
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

/**
 * LAN-212: `supabase db reset` and `supabase start` both claim the stack is at
 * the tracked schema and can be wrong about it. Prove it against
 * `supabase_migrations.schema_migrations` before anything downstream (seeding,
 * a reviewer, an application boot) trusts that claim.
 */
async function assertStackAtTrackedMigrations(lease) {
  await assertMigrationsApplied({
    repoPath,
    queryAppliedVersions: async () => {
      const client = await connectLocal(
        `postgresql://postgres:postgres@127.0.0.1:${lease.ports.db}/postgres`,
      );
      try {
        const result = await client.query(
          "select version from supabase_migrations.schema_migrations order by version",
        );
        return result.rows.map((row) => row.version);
      } finally {
        await client.end();
      }
    },
  });
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
      stopIfRunning(cli, cliArgs("stop", ["--no-backup"]), cliEnv);
      // Prove the containers are actually down before starting again. A stop
      // that silently failed would leave `supabase start` a no-op, and the
      // fingerprint recorded afterwards would claim a configuration that Auth
      // is not serving — the precise failure this check exists to prevent.
      const after = probe(cli, cliArgs("status", ["-o", "json"]), cliEnv);
      let stillRunning = false;
      try {
        const parsed = JSON.parse(after);
        stillRunning = Boolean(parsed.API_URL && parsed.DB_URL);
      } catch {
        stillRunning = false;
      }
      if (stillRunning) {
        throw new Error(
          `${lease.slot} is still running after a stop, so a restart would not apply this holder's configuration. Retry the guarded command; readiness would otherwise pass while Auth served the previous holder's redirect allow-list.`,
        );
      }
    }
    return fingerprint;
  };

  if (operation === "start") {
    const reviewAccount = ensureLocalReviewAccount(repoPath);
    const fingerprint = await applyRenderedConfig();
    run(cli, cliArgs("start"), cliEnv, false);
    await markConfigApplied({ repoPath, token: session.token, fingerprint });
    // LAN-212: a fresh volume applies every tracked migration on `start`, the
    // same way `reset` does, and can skip one just as silently.
    await assertStackAtTrackedMigrations(lease);
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
      // LAN-157. Generated once per machine and kept outside the repository.
      // Without it the club link cannot be signed and the share control says
      // so — which is the right answer for a deployment and the wrong one for
      // a review environment Brian is asked to run no commands against.
      `CLUB_LINK_SECRET=${ensureLocalClubLinkSecret(repoPath)}`,
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
    // LAN-212: `db reset` reported success on a local machine having applied
    // only 27 of 28 tracked migrations. Prove the applied set matches the
    // directory before seeding a schema that might not be what it claims.
    await assertStackAtTrackedMigrations(lease);
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
  } else if (operation === "seed") {
    // Re-seeding truncates and rebuilds the synthetic identity rows. Recreate
    // both review logins and their links in the same guarded operation so a
    // mid-review seed cannot leave the operator or coach seat detached.
    provisionReviewState(lease, readLocalReviewAccount(repoPath));
  } else if (["seed-user", "link-operator", "link-coach", "types-generate"].includes(operation)) {
    const scripts = {
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
