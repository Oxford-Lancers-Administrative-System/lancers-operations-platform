#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { assertCiLocalExecution } from "./lib/ci-local-execution.mjs";

const operation = process.argv[2];
const scripts = {
  seed: "scripts/seed-local.mjs",
  "seed-user": "scripts/create-test-user.mjs",
  test: "node_modules/vitest/vitest.mjs",
  "test-gate": "node_modules/vitest/vitest.mjs",
};

/**
 * This wrapper names no database, deliberately.
 *
 * An earlier version of this file carried the runner's address as a constant
 * and injected it when `SUPABASE_DB_URL` was unset, on the reasoning that
 * `assertCiLocalExecution()` had "already refused to run anywhere that is not
 * GitHub Actions". That reasoning was wrong, and it is worth stating plainly
 * because the mistake is easy to repeat: the fence checks four environment
 * variables, and an environment variable is a **claim**, not an identity. Any
 * developer shell that exports `CI`, `GITHUB_ACTIONS`, `GITHUB_WORKSPACE` and
 * `RUNNER_TEMP` satisfies it — and the fence's own error messages name the four
 * it wants. So the constant turned this wrapper into a documented way to reach
 * port 54322 with the ordinary route closed, which is the coordinator's
 * `primary` slot and therefore somebody's working stack.
 *
 * The address belongs to whoever starts the stack. In CI that is the workflow,
 * which already reads the real `DB_URL` out of `supabase status` when it
 * captures the other credentials, and which can export it the same way. Then
 * nothing guesses: the seed runs against the database CI actually started, and
 * `resolveLocalDatabaseUrl()` refuses here exactly as it refuses everywhere
 * else if nobody has said which database is meant.
 *
 * `assertCiLocalExecution()` stays. It is a useful barrier against running an
 * unfenced command by accident on a developer machine, and it is not load
 * bearing for the choice of database any more — which is the only thing it was
 * never able to establish.
 */
try {
  assertCiLocalExecution();
  if (!scripts[operation]) throw new Error("Unknown CI local-stack operation.");
  const args = ["test", "test-gate"].includes(operation)
    ? [
        scripts[operation],
        "run",
        "--project",
        operation === "test" ? "unit" : "gate",
        ...(operation === "test" ? ["--project", "database"] : []),
      ]
    : [scripts[operation]];
  const result = spawnSync(process.execPath, args, { stdio: "inherit", env: process.env });
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
