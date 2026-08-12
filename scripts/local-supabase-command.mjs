#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { readSession, updateLease } from "./lib/local-supabase-coordinator.mjs";

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

  if (operation === "start") {
    run(cli, cliArgs("start"), cliEnv, false);
    const raw = run(cli, cliArgs("status", ["-o", "json"]), cliEnv, false);
    const status = JSON.parse(raw);
    const reviewEmail = "operator@lancers.local.example";
    const reviewPassword = crypto.randomBytes(24).toString("base64url");
    const envFile = [
      `NEXT_PUBLIC_SUPABASE_URL=${status.API_URL}`,
      `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${status.PUBLISHABLE_KEY}`,
      `NEXT_PUBLIC_SUPABASE_ANON_KEY=${status.ANON_KEY}`,
      `SUPABASE_SECRET_KEY=${status.SECRET_KEY}`,
      `SUPABASE_SERVICE_ROLE_KEY=${status.SERVICE_ROLE_KEY}`,
      `SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:${lease.ports.db}/postgres`,
      `PORT=${lease.applicationPort}`,
      `TEST_USER_EMAIL=${reviewEmail}`,
      `TEST_USER_PASSWORD=${reviewPassword}`,
      "",
    ].join("\n");
    fs.writeFileSync(path.join(repoPath, ".env.local"), envFile, { mode: 0o600 });
    fs.writeFileSync(
      path.join(repoPath, ".lancers-runtime", "review-credentials"),
      `Email: ${reviewEmail}\nPassword: ${reviewPassword}\n`,
      { mode: 0o600 },
    );
    console.log(`Started ${lease.slot} local Supabase stack on API port ${lease.ports.api}.`);
  } else if (operation === "stop") run(cli, cliArgs("stop", ["--no-backup"]), cliEnv);
  else if (operation === "reset") run(cli, cliArgs("db", ["reset", "--local", "--yes"]), cliEnv);
  else if (operation === "status") {
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
  } else if (["seed", "seed-user", "link-operator", "types-generate"].includes(operation)) {
    const scripts = {
      seed: "scripts/seed-local.mjs",
      "seed-user": "scripts/create-test-user.mjs",
      "link-operator": "scripts/link-test-operator.mjs",
      "types-generate": "scripts/generate-types.mjs",
    };
    const env = {
      ...process.env,
      SUPABASE_DB_URL: `postgresql://postgres:postgres@127.0.0.1:${lease.ports.db}/postgres`,
      NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${lease.ports.api}`,
      SUPABASE_WORKDIR: lease.runtimeRoot,
      PORT: String(lease.applicationPort),
    };
    run(process.execPath, [scripts[operation]], env);
  } else throw new Error("Unknown guarded database operation.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
