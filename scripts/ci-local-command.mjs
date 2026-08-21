#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { assertCiLocalExecution } from "./lib/ci-local-execution.mjs";

const operation = process.argv[2];
const scripts = {
  seed: "scripts/seed-local.mjs",
  "seed-user": "scripts/create-test-user.mjs",
  test: "node_modules/vitest/vitest.mjs",
};

/**
 * The database these scripts run against on a GitHub Actions runner.
 *
 * `scripts/lib/local-db.mjs` no longer defaults to this address, because on a
 * developer machine port 54322 is the coordinator's `primary` slot — somebody's
 * working stack — and a destructive script that guesses which database it means
 * is how a review-ready stack was re-seeded out from under its owner.
 *
 * CI is the one place where guessing is not what this is. The workflow starts
 * `supabase start` on the standard unsuffixed ports and there are no slots, no
 * leases and no other stack on the runner; `assertCiLocalExecution()` above has
 * already refused to run anywhere that is not GitHub Actions with a matching
 * `GITHUB_WORKSPACE`. So the address is named **here**, at the call site, by the
 * one caller that can prove which database it means — rather than being left as
 * a default in a shared guard where every other caller inherits it.
 *
 * Deliberately not overriding an explicit value: if the workflow ever exports
 * `SUPABASE_DB_URL` itself, that is the more specific answer and it wins.
 */
const CI_STACK_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

try {
  assertCiLocalExecution();
  if (!scripts[operation]) throw new Error("Unknown CI local-stack operation.");
  const args = operation === "test" ? [scripts[operation], "run"] : [scripts[operation]];
  const env = { ...process.env, SUPABASE_DB_URL: process.env.SUPABASE_DB_URL || CI_STACK_URL };
  const result = spawnSync(process.execPath, args, { stdio: "inherit", env });
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
