// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mergeProof, worktreeDefects } from "../scripts/mission/lib/merge-proof.mjs";

const HEAD = "a".repeat(40);
const MERGE = "b".repeat(40);

/** A repository that answers exactly what each case is about. */
function io(overrides: Record<string, unknown> = {}) {
  return {
    pullRequest: () => ({ state: "MERGED", mergeCommit: { oid: MERGE } }),
    isAncestor: (sha: string) => sha === MERGE,
    exists: () => true,
    status: () => "",
    stashList: () => "",
    hasRemoteBranch: () => true,
    unpushed: () => "",
    ...overrides,
  };
}

const pkg = { pr_number: 42, head_sha: HEAD };

describe("proving a merge from the repository", () => {
  /**
   * The defect this replaces. `.github/workflows/mission-merge.yml` merges with
   * `gh pr merge --squash --delete-branch`, and this repository squash-merges by
   * hand too. A squash produces a new commit, so the branch head is never an
   * ancestor of main afterwards — proving by ancestry alone reported every
   * merged package as unmerged and reclaimed nothing, which is the leak
   * reclamation exists to close.
   */
  it("accepts a squash merge, whose head is never an ancestor of main", () => {
    const proof = mergeProof(pkg, io({ isAncestor: (sha: string) => sha === MERGE }));
    expect(proof.merged).toBe(true);
    expect(proof.mergeSha).toBe(MERGE);
  });

  it("accepts a true merge commit, where the head does remain reachable", () => {
    const proof = mergeProof(
      pkg,
      io({ pullRequest: () => ({ state: "MERGED" }), isAncestor: (sha: string) => sha === HEAD }),
    );
    expect(proof.merged).toBe(true);
    expect(proof.mergeSha).toBe(HEAD);
  });

  it("refuses a pull request that has not merged", () => {
    const proof = mergeProof(pkg, io({ pullRequest: () => ({ state: "OPEN" }) }));
    expect(proof.merged).toBe(false);
    expect(proof.reasons.join(" ")).toMatch(/#42 is OPEN/);
  });

  it("refuses when neither the merge commit nor the head is on main", () => {
    const proof = mergeProof(pkg, io({ isAncestor: () => false }));
    expect(proof.merged).toBe(false);
    expect(proof.reasons.join(" ")).toMatch(/not on origin\/main/);
  });

  it("refuses when the repository cannot be asked at all", () => {
    const proof = mergeProof(
      pkg,
      io({
        pullRequest: () => {
          throw new Error("gh: not authenticated");
        },
      }),
    );
    expect(proof.merged).toBe(false);
    expect(proof.reasons.join(" ")).toMatch(/could not read pull request #42/);
  });

  it("refuses a package with no recorded pull request", () => {
    expect(mergeProof({ head_sha: HEAD }, io()).merged).toBe(false);
  });
});

describe("whether a worktree is debris yet", () => {
  it("accepts a clean worktree whose branch is pushed", () => {
    expect(worktreeDefects("/tmp/wt", "feat/x", io()).defects).toEqual([]);
  });

  it("reports a worktree that is already gone rather than failing", () => {
    const result = worktreeDefects("/tmp/wt", "feat/x", io({ exists: () => false }));
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

  it("refuses unpushed commits while the remote branch still exists", () => {
    expect(
      worktreeDefects("/tmp/wt", "feat/x", io({ unpushed: () => "abc123 wip\ndef456 more" }))
        .defects,
    ).toEqual(["it has 2 unpushed commit(s)"]);
  });

  /**
   * `--delete-branch` removes the remote counterpart at merge time, so asking
   * `origin/<branch>..<branch>` afterwards throws. That is evidence the work
   * landed, not a reason to refuse — treating it as a defect blocked every
   * squash-merged package a second time.
   */
  it("does not treat a deleted remote branch as unpushed work", () => {
    const result = worktreeDefects(
      "/tmp/wt",
      "feat/x",
      io({
        hasRemoteBranch: () => false,
        unpushed: () => {
          throw new Error("unknown revision origin/feat/x");
        },
      }),
    );
    expect(result.defects).toEqual([]);
  });
});
