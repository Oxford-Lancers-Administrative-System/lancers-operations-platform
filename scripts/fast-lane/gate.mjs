/**
 * The merge gate.
 *
 * Eligibility (scripts/fast-lane/classify.mjs) says whether the *diff* may
 * travel through the fast lane. This says whether *this pull request, right
 * now* may be merged: it must be open, on the base branch, from this
 * repository, free of conflicts, opted in, and every required check must have
 * concluded `success` against its current head commit.
 *
 * The decision starts at `false` and is never assigned `true` anywhere. It is
 * returned as `reasons.length === 0`, so a condition nobody thought to write
 * cannot be the one that lets a merge through, and a throw is a refusal rather
 * than a crash into an approving default.
 *
 * The opt-in label is checked here and only here. It records that somebody
 * asked for the fast lane; it is a conjunct alongside the recomputed verdict,
 * never an alternative to it, and it cannot make an ineligible diff eligible.
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

/**
 * Every Linear issue the pull request says it delivers.
 *
 * This reads text the agent wrote, so it is worth being exact about what it is
 * for: it is an ADDITIONAL requirement, never evidence of eligibility. A batch
 * that names no issue closes no issue, so it is refused. Naming ten issues
 * cannot make an ineligible path eligible — that is decided from the diff,
 * before this is consulted, and nothing here can reverse it.
 */
export function linearIssues(text) {
  return [...new Set((text ?? "").match(/\bLAN-\d+\b/g) ?? [])].sort();
}

/**
 * @param {{ verdict: object|undefined, pullRequest: object|null, checkRuns: object[], rules: object }} input
 * @returns {{ merge: boolean, reasons: string[], issues: string[] }} `merge` is
 *   true only when nothing objected.
 */
export function evaluateGate({ verdict, pullRequest: pr, checkRuns, rules }) {
  const reasons = [];

  if (!pr) return { merge: false, reasons: ["No pull request was resolved."], issues: [] };

  const issues = linearIssues(`${pr.title ?? ""}\n${pr.body ?? ""}`);

  if ((pr.state ?? "").toUpperCase() !== "OPEN") {
    reasons.push(`Pull request is ${pr.state}, not OPEN.`);
  }

  if (pr.baseRefName !== rules.baseBranch) {
    reasons.push(`Pull request targets ${pr.baseRefName}, not ${rules.baseBranch}.`);
  }

  if (pr.isCrossRepository) {
    reasons.push("Pull request comes from a fork. The fast lane merges same-repository work only.");
  }

  const labels = (pr.labels ?? []).map((label) => (typeof label === "string" ? label : label.name));
  if (!labels.includes(rules.optInLabel)) {
    reasons.push(
      `Pull request is not labelled \`${rules.optInLabel}\`, so it has not asked for the fast lane.`,
    );
  }

  if ((pr.mergeable ?? "").toUpperCase() !== "MERGEABLE") {
    reasons.push(
      `GitHub reports mergeable=${pr.mergeable ?? "UNKNOWN"}. Only MERGEABLE proceeds; a conflict or an unknown state goes to the normal lane.`,
    );
  }

  if (!pr.headRefOid) {
    reasons.push("Pull request head commit is unknown, so no check result can be tied to it.");
  }

  if (!verdict || verdict.eligible !== true) {
    reasons.push(
      ...(verdict?.reasons?.length
        ? verdict.reasons.map((reason) => `Ineligible diff: ${reason}`)
        : ["The diff was not classified eligible."]),
    );
  }

  if (issues.length === 0) {
    reasons.push(
      "The pull request names no Linear issue (LAN-nn), so nothing could be linked or closed on merge.",
    );
  }

  reasons.push(...requiredChecksPassed(checkRuns, pr.headRefOid, rules));

  return { merge: reasons.length === 0, reasons, issues };
}
