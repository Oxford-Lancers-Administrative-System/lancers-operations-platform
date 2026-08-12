import path from "node:path";

/** @param {{ env?: Record<string, string | undefined>, cwd?: string }} options */
export function assertCiLocalExecution({ env = process.env, cwd = process.cwd() } = {}) {
  if (env.CI !== "true" || env.GITHUB_ACTIONS !== "true") {
    throw new Error("This unfenced local-stack command is restricted to GitHub Actions CI.");
  }
  if (!env.GITHUB_WORKSPACE || path.resolve(env.GITHUB_WORKSPACE) !== path.resolve(cwd)) {
    throw new Error("GITHUB_WORKSPACE must identify the current repository checkout.");
  }
  if (!env.RUNNER_TEMP || !path.isAbsolute(env.RUNNER_TEMP)) {
    throw new Error("RUNNER_TEMP must identify the GitHub Actions runner temporary directory.");
  }
}
