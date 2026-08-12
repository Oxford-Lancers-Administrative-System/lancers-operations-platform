#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { assertCiLocalExecution } from "./lib/ci-local-execution.mjs";

const operation = process.argv[2];
const scripts = {
  seed: "scripts/seed-local.mjs",
  "seed-user": "scripts/create-test-user.mjs",
  test: "node_modules/vitest/vitest.mjs",
};

try {
  assertCiLocalExecution();
  if (!scripts[operation]) throw new Error("Unknown CI local-stack operation.");
  const args = operation === "test" ? [scripts[operation], "run"] : [scripts[operation]];
  const result = spawnSync(process.execPath, args, { stdio: "inherit", env: process.env });
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
