/**
 * Prove from the repository that a package's head really reached main.
 *
 * Never from a journal assertion and never from the Linear state: the journal
 * records that someone said they pushed, and only the repository can say that
 * the commit is there.
 *
 * With no pull requests (LAN-523) a branch reaches main as a fast-forward or as
 * the head of a merge of `origin/main` into the branch, so the pushed head is
 * an ancestor of `origin/main` afterwards. Ancestry of the recorded SHA is the
 * whole proof; there is no squash commit to look for.
 */

/** @param {{merged?: {sha?: string}, head_sha?: string}} pkg */
export function mergeProof(pkg, io) {
  const sha = pkg?.merged?.sha ?? null;
  if (!sha) {
    return { merged: false, reasons: ["it has no recorded push to main"], mergeSha: null };
  }
  if (io.isAncestor(sha, "origin/main")) {
    return { merged: true, reasons: [], mergeSha: sha };
  }
  return {
    merged: false,
    reasons: [
      `${sha} is not on origin/main — the local view may be stale, or the push never happened`,
    ],
    mergeSha: sha,
  };
}

/**
 * Whether this worktree still holds anything that is not safely elsewhere.
 *
 * "Safely elsewhere" is any remote ref, `origin/main` included: a branch pushed
 * to main is usually never pushed under its own name, and its commits are safe
 * the moment they are on main.
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

  const unpushed = io.unpushed(worktree, branch);
  if (unpushed !== "") {
    defects.push(`it has ${unpushed.split("\n").length} commit(s) that are on no remote`);
  }
  return { defects, gone: false };
}
