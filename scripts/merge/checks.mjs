/**
 * Required-check evidence for the merge rule.
 *
 * Relocated verbatim from the deleted `scripts/fast-lane/gate.mjs` (LAN-209).
 * GitHub's own auto-merge is what waits for the checks now, so the merge
 * workflow no longer calls this. The Mission Lead does, before it lifts a
 * draft: un-drafting is the last act of the work, and the Lead states the
 * checks were green at the exact head when it took that act.
 */

/** GitHub reports check runs and legacy commit statuses differently. Normalise. */
export function normaliseCheck(raw) {
  return {
    name: raw.name ?? raw.context ?? "",
    status: (raw.status ?? "completed").toLowerCase(),
    conclusion: (raw.conclusion ?? raw.state ?? null)?.toLowerCase() ?? null,
    headSha: raw.head_sha ?? raw.headSha ?? raw.sha ?? null,
  };
}

/**
 * Every required check, against the pull request's current head.
 *
 * A check that is queued, running, skipped, cancelled, neutral, stale, timed
 * out, failed, reported against an older commit, or simply absent is not a
 * check that passed. Duplicates are conjunctive: if a required name appears
 * twice, both must be `success`, so a re-run that succeeded does not paper over
 * a run that did not.
 */
export function requiredChecksPassed(checkRuns, headSha, rules) {
  const failures = [];
  const checks = (checkRuns ?? []).map(normaliseCheck);

  for (const required of rules.requiredChecks) {
    const matching = checks.filter((check) => check.name === required);
    const forHead = matching.filter((check) => !check.headSha || check.headSha === headSha);

    if (forHead.length === 0) {
      failures.push(
        matching.length === 0
          ? `Required check "${required}" has not reported. A check that did not run is not a check that passed.`
          : `Required check "${required}" reported only against a commit other than the head ${headSha}.`,
      );
      continue;
    }

    for (const check of forHead) {
      if (check.status !== "completed") {
        failures.push(`Required check "${required}" is ${check.status}, not completed.`);
      } else if (check.conclusion !== "success") {
        failures.push(
          `Required check "${required}" concluded "${check.conclusion ?? "none"}", not "success".`,
        );
      }
    }
  }

  return failures;
}
