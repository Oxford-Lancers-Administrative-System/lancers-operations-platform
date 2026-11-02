#!/usr/bin/env node
/**
 * Remove every git worktree whose work is already on main (LAN-523).
 *
 * An agent worktree is deleted automatically only when the agent changed
 * nothing, so every builder that commits leaves ~1.5 GB behind. By 2 November
 * 2026 there were 113 of them and the disk was 97% full. This sweep runs after
 * a branch lands on main and main CI is green.
 *
 * A worktree is removed only when all of these hold:
 *   - it is not the primary checkout, is not locked, and has no file changed
 *     in the last three hours (an agent may be working in it);
 *   - it has no tracked changes and no untracked files beyond build output;
 *   - its HEAD is on origin/main, or is the head of a merged pull request
 *     (history from before LAN-523 landed squash merges).
 * Anything else is kept and listed with the reason. A held local database slot
 * is released first. Its local branch is deleted when it points at the same
 * commit. Dry run by default; `--apply` removes.
 *
 *   npm run worktrees:sweep            # list what would go
 *   npm run worktrees:sweep -- --apply
 *   npm run worktrees:sweep -- --apply --only <worktree>   # after landing it
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RECENT_MS = 3 * 60 * 60 * 1000;

/** Untracked paths that are build or agent leftovers, never work. */
const DISPOSABLE = [
  /^receipt\.json$/,
  /^\.next\//,
  /^node_modules\/?$/,
  /^next-env\.d\.ts$/,
  /^test-results\//,
  /^playwright-report\//,
  /^\.env\.local$/,
  /^supabase\/\.temp\//,
];

/** `git worktree list --porcelain` as records. */
export function parseWorktreeList(text) {
  return text
    .trim()
    .split(/\n\n+/)
    .filter(Boolean)
    .map((block) => {
      const record = { path: "", head: "", branch: null, locked: false };
      for (const line of block.split("\n")) {
        if (line.startsWith("worktree ")) record.path = line.slice(9);
        else if (line.startsWith("HEAD ")) record.head = line.slice(5);
        else if (line.startsWith("branch "))
          record.branch = line.slice(7).replace(/^refs\/heads\//, "");
        else if (line === "locked" || line.startsWith("locked ")) record.locked = true;
      }
      return record;
    });
}

/**
 * The status lines that count as work. `next dev` rewrites AGENTS.md on start,
 * so a change to AGENTS.md alone is not work either.
 */
export function workInStatus(porcelain) {
  return porcelain
    .split("\n")
    .filter(Boolean)
    .filter((line) => {
      const path = line.slice(3);
      if (line.startsWith("??")) return !DISPOSABLE.some((pattern) => pattern.test(path));
      return path !== "AGENTS.md";
    });
}

/** The decision for one worktree, from facts already gathered. */
export function classify({ primary, locked, recent, work, onMain, mergedPr }) {
  if (primary) return { remove: false, reason: "primary checkout" };
  if (locked) return { remove: false, reason: "locked by a running agent" };
  if (recent) return { remove: false, reason: "changed in the last three hours" };
  if (work.length > 0)
    return { remove: false, reason: `uncommitted work: ${work.slice(0, 3).join("; ")}` };
  if (onMain) return { remove: true, reason: "on origin/main" };
  if (mergedPr) return { remove: true, reason: `head of merged #${mergedPr}` };
  return { remove: false, reason: "commits that are not on main" };
}

function git(cwd, ...args) {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function succeeds(cwd, ...args) {
  try {
    git(cwd, ...args);
    return true;
  } catch {
    return false;
  }
}

function changedRecently(dir, now) {
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (["node_modules", ".next", ".git"].includes(entry.name)) continue;
      const full = join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) stack.push(full);
      else if (now - statSync(full).mtimeMs < RECENT_MS) return true;
    }
  }
  return false;
}

function mergedPullRequest(sha) {
  try {
    const out = execFileSync(
      "gh",
      [
        "pr",
        "list",
        "--state",
        "merged",
        "--search",
        sha,
        "--json",
        "number",
        "--jq",
        ".[0].number",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return out.trim() || null;
  } catch {
    return null;
  }
}

function releaseSlot(path) {
  if (!existsSync(join(path, "node_modules"))) return;
  try {
    const status = execFileSync("npm", ["run", "-s", "db:status"], {
      cwd: path,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (status.includes('"running":true')) {
      execFileSync("npm", ["run", "-s", "db:release"], { cwd: path, stdio: "ignore" });
    }
  } catch {
    // No lease held from here.
  }
}

function main() {
  const apply = process.argv.includes("--apply");
  // `--only <path>`: the worktree a branch just landed from. Its files are
  // recent by definition, so the idle check is skipped; every other check holds.
  const onlyAt = process.argv.indexOf("--only");
  const only = onlyAt === -1 ? null : realpathSync(process.argv[onlyAt + 1]);
  const primary = git(process.cwd(), "rev-parse", "--path-format=absolute", "--git-common-dir")
    .trim()
    .replace(/\/\.git$/, "");
  git(primary, "fetch", "--quiet", "origin", "main");
  const now = Date.now();
  let removed = 0;
  for (const tree of parseWorktreeList(git(primary, "worktree", "list", "--porcelain"))) {
    if (!existsSync(tree.path)) continue;
    if (only && realpathSync(tree.path) !== only) continue;
    const isPrimary = tree.path === primary;
    const facts = {
      primary: isPrimary,
      locked: tree.locked,
      recent: false,
      work: [],
      onMain: false,
      mergedPr: null,
    };
    if (!isPrimary && !tree.locked) {
      facts.recent = !only && changedRecently(tree.path, now);
      facts.work = workInStatus(git(tree.path, "status", "--porcelain"));
      facts.onMain = succeeds(primary, "merge-base", "--is-ancestor", tree.head, "origin/main");
      if (!facts.recent && facts.work.length === 0 && !facts.onMain)
        facts.mergedPr = mergedPullRequest(tree.head);
    }
    const decision = classify(facts);
    if (isPrimary) continue;
    console.log(
      `${decision.remove ? (apply ? "removed" : "would remove") : "kept"}  ${tree.path}  (${decision.reason})`,
    );
    if (!decision.remove || !apply) continue;
    releaseSlot(tree.path);
    git(primary, "worktree", "remove", "--force", tree.path);
    if (tree.branch && git(primary, "rev-parse", tree.branch).trim() === tree.head) {
      git(primary, "branch", "-D", tree.branch);
    }
    removed += 1;
  }
  git(primary, "worktree", "prune");
  if (apply) console.log(`${removed} removed`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
