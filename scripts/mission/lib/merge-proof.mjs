/**
 * Prove from the repository that a package's pull request really merged.
 *
 * Never from the pull-request body and never from the Linear state: GitHub's
 * auto-merge lands work without a human once the draft is lifted, so "Brian
 * merged it" is not a fact anyone may infer.
 *
 * The subtlety that matters is *how* it merged. This repository squash-merges
 * (`gh pr merge --auto --squash --delete-branch` in `.github/workflows/merge.yml`,
 * and by hand for everything else), and a squash merge produces a brand-new
 * commit — the branch head is never an ancestor of `main` afterwards. Proving
 * the merge by ancestry alone therefore reports every merged package as
 * unmerged and reclaims nothing, which is the leak this exists to close. The
 * merge commit is the durable fact; ancestry is the fallback for a true merge
 * commit, and for a squash it is expected to fail.
 */

/** @param {{pr_number?: number, head_sha?: string}} pkg */
export function mergeProof(pkg, io) {
  const reasons = [];
  if (!pkg?.pr_number) {
    return { merged: false, reasons: ["it has no recorded pull request"], mergeSha: null };
  }

  let view;
  try {
    view = io.pullRequest(pkg.pr_number);
  } catch (error) {
    return {
      merged: false,
      reasons: [`could not read pull request #${pkg.pr_number} (${error.message})`],
      mergeSha: null,
    };
  }

  if (view.state !== "MERGED") {
    return {
      merged: false,
      reasons: [`pull request #${pkg.pr_number} is ${view.state ?? "in an unknown state"}`],
      mergeSha: null,
    };
  }

  const mergeSha = view.mergeCommit?.oid ?? null;
  if (mergeSha) {
    // The merge commit is on the branch we would reclaim against, or the local
    // view of that branch is stale and nothing should be deleted yet.
    if (io.isAncestor(mergeSha, "origin/main")) {
      return { merged: true, reasons: [], mergeSha };
    }
    reasons.push(
      `its merge commit ${mergeSha} is not on origin/main — the local view may be stale, or it merged into another branch`,
    );
  } else {
    reasons.push(`pull request #${pkg.pr_number} reports no merge commit`);
  }

  // A true merge commit (not a squash) leaves the head reachable; accept that
  // as an independent proof rather than blocking on the missing oid.
  if (pkg.head_sha && io.isAncestor(pkg.head_sha, "origin/main")) {
    return { merged: true, reasons: [], mergeSha: mergeSha ?? pkg.head_sha };
  }

  return { merged: false, reasons, mergeSha };
}

/**
 * Whether this worktree still holds anything that is not safely elsewhere.
 *
 * A squash merge is normally run with `--delete-branch`, so the branch's remote
 * counterpart is gone by the time we look. That is evidence the work landed,
 * not a reason to refuse — the unpushed-commit check only means anything while
 * the remote branch exists.
 */
export function worktreeDefects(worktree, branch, io) {
  // "Gone" means git has stopped tracking it, not that the directory has
  // vanished. A removed worktree routinely leaves its untracked `.lancers-runtime`
  // behind, and that empty shell is not a working tree: `git status` run inside
  // it walks up and answers for the primary checkout instead, which reports the
  // Lead's own uncommitted work as this package's dirt, and `git worktree
  // remove` then fails outright. Ask git what it tracks; do not ask the
  // filesystem what still exists.
  if (!io.exists(worktree)) return { defects: [], gone: true };
  if (io.isWorktree && !io.isWorktree(worktree)) return { defects: [], gone: true };
  const defects = [];
  if (io.status(worktree) !== "") defects.push("its working tree is dirty");
  if (io.stashList(worktree) !== "") defects.push("it has stash entries");

  if (io.hasRemoteBranch(worktree, branch)) {
    const unpushed = io.unpushed(worktree, branch);
    if (unpushed !== "") {
      defects.push(`it has ${unpushed.split("\n").length} unpushed commit(s)`);
    }
  }
  return { defects, gone: false };
}
