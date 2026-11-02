// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mergeProof, worktreeDefects } from "../scripts/mission/lib/merge-proof.mjs";

const HEAD = "a".repeat(40);

/** A repository that answers exactly what each case is about. */
function io(overrides: Record<string, unknown> = {}) {
  return {
    isAncestor: (sha: string) => sha === HEAD,
    exists: () => true,
    status: () => "",
    stashList: () => "",
    unpushed: () => "",
    isWorktree: () => true,
    ...overrides,
  };
}

const pushed = { head_sha: HEAD, merged: { sha: HEAD, route: "agent" } };

describe("proving a push to main from the repository", () => {
  it("accepts a head that is an ancestor of origin/main", () => {
    const proof = mergeProof(pushed, io());
    expect(proof.merged).toBe(true);
    expect(proof.mergeSha).toBe(HEAD);
  });

  it("refuses a recorded push whose commit is not on origin/main", () => {
    const proof = mergeProof(pushed, io({ isAncestor: () => false }));
    expect(proof.merged).toBe(false);
    expect(proof.reasons.join(" ")).toMatch(/not on origin\/main/);
  });

  it("refuses a package with no recorded push", () => {
    const proof = mergeProof({ head_sha: HEAD }, io());
    expect(proof.merged).toBe(false);
    expect(proof.reasons.join(" ")).toMatch(/no recorded push/);
  });
});

describe("whether a worktree is debris yet", () => {
  it("accepts a clean worktree whose commits are all on a remote", () => {
    expect(worktreeDefects("/tmp/wt", "feat/x", io()).defects).toEqual([]);
  });

  it("reports a worktree that is already gone rather than failing", () => {
    const result = worktreeDefects("/tmp/wt", "feat/x", io({ exists: () => false }));
    expect(result.gone).toBe(true);
    expect(result.defects).toEqual([]);
  });

  /**
   * The defect this replaces. Removing a worktree leaves its untracked
   * `.lancers-runtime` behind, so the directory still exists while git has
   * stopped tracking it. `git status` run inside that shell walks up and
   * answers for the primary checkout, which reported the Lead's own
   * uncommitted work as this package's dirt; and `git worktree remove` then
   * threw, killing the whole reclamation run on its first leftover.
   */
  it("treats a directory git no longer tracks as gone, not as a dirty worktree", () => {
    const result = worktreeDefects(
      "/tmp/wt",
      "feat/x",
      io({
        exists: () => true,
        isWorktree: () => false,
        // What the primary checkout would have answered through the shell.
        status: () => " M scripts/mission/cli.mjs",
      }),
    );
    expect(result.gone).toBe(true);
    expect(result.defects).toEqual([]);
  });

  it("refuses a dirty tree and stash entries", () => {
    expect(
      worktreeDefects("/tmp/wt", "feat/x", io({ status: () => " M src/x.ts" })).defects,
    ).toEqual(["its working tree is dirty"]);
    expect(
      worktreeDefects("/tmp/wt", "feat/x", io({ stashList: () => "stash@{0}: WIP" })).defects,
    ).toEqual(["it has stash entries"]);
  });

  /**
   * A branch pushed to main is usually never pushed under its own name, so
   * "unpushed" means on no remote at all — `origin/main` counts.
   */
  it("refuses commits that are on no remote", () => {
    expect(
      worktreeDefects("/tmp/wt", "feat/x", io({ unpushed: () => "abc123 wip\ndef456 more" }))
        .defects,
    ).toEqual(["it has 2 commit(s) that are on no remote"]);
  });
});
