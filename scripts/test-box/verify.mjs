#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { runtime } from "./runtime.mjs";

export function verificationEnvironment(shell, local) {
  const env = { ...shell, ...local };
  for (const key of Object.keys(env)) {
    if (/^(APP_BASE_URL$|TWILIO_|WHATSAPP_|EMAIL_|DELIVERY_|SCHEDULER_TRIGGER_TOKEN$)/.test(key)) {
      // Empty process entries prevent dotenv from importing configured runtime
      // values into tests whose fixtures deliberately supply their own values.
      env[key] = "";
    }
  }
  env.VITEST_MAX_FORKS = "2";
  env.VITEST_MIN_FORKS = "1";
  return env;
}

export async function main(args = process.argv.slice(2)) {
  if (args.length) throw new Error("Usage: node scripts/test-box/verify.mjs");
  const { env } = await runtime();
  const result = spawnSync("npm", ["run", "verify"], {
    cwd: process.cwd(),
    env: verificationEnvironment(process.env, env),
    stdio: "inherit",
  });
  process.exitCode = result.status ?? 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error(
      "Verification could not start; check this worktree's local lease and configuration.",
    );
    process.exitCode = 1;
  });
}
