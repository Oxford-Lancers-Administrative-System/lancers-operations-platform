import path from "node:path";

/**
 * Refuses an unfenced local-stack command outside GitHub Actions.
 *
 * ## What this can and cannot establish
 *
 * It reads four environment variables. An environment variable is a **claim**,
 * not an identity: any shell that exports `CI`, `GITHUB_ACTIONS`,
 * `GITHUB_WORKSPACE` and `RUNNER_TEMP` passes, and the messages below name the
 * four it wants. So this is a barrier against running one of these commands **by
 * accident** on a developer machine — which is a real and common mistake — and
 * it is not proof that the caller is CI.
 *
 * Nothing may therefore be *granted* on the strength of passing it. An earlier
 * version of `ci-local-command.mjs` used it to justify injecting the runner's
 * database address when `SUPABASE_DB_URL` was unset, and that turned a
 * convenience check into a documented route to port 54322 — the coordinator's
 * `primary` slot — at the moment the ordinary route to it had been closed. The
 * address now comes from whoever started the stack, and this function has no
 * say in which database anything writes to.
 *
 * @param {{ env?: Record<string, string | undefined>, cwd?: string }} options
 */
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
