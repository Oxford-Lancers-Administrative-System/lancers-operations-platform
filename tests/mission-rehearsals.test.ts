import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { appendEvent, nextActions, replayState } from "../scripts/mission/lib/state.mjs";
import {
  buildMissionReceipt,
  deriveGitVisualFiles,
  evaluateProspectiveMissionGate,
  journalConjuncts,
  loadRules,
} from "../scripts/mission/merge-gate.mjs";

const CLI = path.join(__dirname, "..", "scripts", "mission", "cli.mjs");
const PACKET_FILE = path.join(__dirname, "fixtures", "mission", "approved-packet.json");
const PLAN_FILE = path.join(__dirname, "fixtures", "mission", "three-package-plan.json");
const packet = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures", "mission", "approved-packet.json"), "utf8"),
);
const plan = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures", "mission", "three-package-plan.json"), "utf8"),
);
const MISSION = packet.mission_id as string;
const PACKAGE = "WP-events-filter";
const HEAD = "a".repeat(40);
const rules = loadRules();
const temporary: string[] = [];

afterEach(() => {
  for (const root of temporary.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function mission() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lancers-rehearsal-"));
  temporary.push(root);
  const repo = path.join(root, "repo");
  fs.mkdirSync(repo, { recursive: true });
  const env = {
    ...process.env,
    LANCERS_MISSION_ROOT: path.join(root, "state"),
    LANCERS_MISSION_LEAD_ID: "lead-rehearsal-1",
  };
  let tick = 1_700_000_000_000;
  const append = (event: object) => appendEvent(repo, MISSION, event, { env, now: (tick += 1000) });
  return { repo, env, append };
}

function git(repo: string, args: string[]) {
  const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
}

function commit(repo: string, file: string, contents: string, message: string) {
  const target = path.join(repo, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
  git(repo, ["add", file]);
  git(repo, ["commit", "-m", message]);
  return git(repo, ["rev-parse", "HEAD"]);
}

async function synced(m: ReturnType<typeof mission>) {
  await m.append({ type: "mission-init", packet, lead_id: "lead-fixture", pid: 4242 });
  await m.append({
    type: "plan-recorded",
    packages: plan.packages,
    decomposition: plan.decomposition,
  });
  await m.append({
    type: "plan-approved",
    approved_by: "Brian",
    evidence: "decomposition and owner cost presented at checkpoint 1",
  });
  await m.append({ type: "linear-preflight", result: "reachable", detail: "fixture preflight" });
  for (const [index, pkg] of plan.packages.entries()) {
    await m.append({ type: "linear-sync-intent", package_id: pkg.id });
    await m.append({
      type: "linear-sync-result",
      package_id: pkg.id,
      issue_id: `LAN-${901 + index}`,
    });
  }
}

const uxSources = {
  slice_ux: "docs/ux/slice-ux.md",
  standards: "docs/ux/standards.md",
  ticket_contract: "docs/ux/tickets/LAN-900-events-filter.md",
  wireframes: "docs/ux/wireframes/events-filter-desktop.png, events-filter-375.png",
};

const uxConformance = {
  mockup_states: ["events filter — desktop", "events filter — measured 375px"],
  comparison_method: "Rendered both live states and compared structure and copy.",
  result: "clear",
};

async function implementedAt(m: ReturnType<typeof mission>, head: string) {
  await m.append({
    type: "worker-dispatched",
    package_id: PACKAGE,
    worker_id: "worker-1",
    worktree: `.claude/worktrees/${PACKAGE}`,
    branch: `feat/${PACKAGE}`,
  });
  await m.append({
    type: "worker-receipt",
    package_id: PACKAGE,
    worker_id: "worker-1",
    receipt: {
      branch: `feat/${PACKAGE}`,
      worktree: `.claude/worktrees/${PACKAGE}`,
      surfaces: ["src/app/events/page.tsx"],
      acceptance_criteria: ["The event filter works."],
      verification: "npm run verify observed to pass",
      ci_state: `green at ${head}`,
      visual_state: "awaiting-owner-review",
      migration_implications: "none",
      limitations: "none",
      ux_sources: uxSources,
      result: "completed",
    },
  });
  await m.append({ type: "pr-opened", package_id: PACKAGE, pr_number: 60, head_sha: head });
}

async function reviewedAndApproved(m: ReturnType<typeof mission>, head: string, round = 1) {
  await m.append({
    type: "review-receipt",
    package_id: PACKAGE,
    receipt: {
      review_mode: round === 1 ? "full" : "correction",
      full_review_sha: head,
      reviewed_head_sha: head,
      round,
      result: "clear",
      ci_state: "green",
      ux_conformance: uxConformance,
    },
  });
  await m.append({
    type: "visual-approval",
    package_id: PACKAGE,
    approved_by: "Brian",
    evidence: "synthetic live review",
  });
}

const checks = (head: string) =>
  rules.requiredChecks.map((name: string) => ({
    name,
    status: "completed",
    conclusion: "success",
    head_sha: head,
  }));

const pullRequest = (head: string) => ({
  state: "OPEN",
  baseRefName: "main",
  isCrossRepository: false,
  labels: [],
  mergeable: "MERGEABLE",
  headRefOid: head,
  body: "Synthetic mission package.",
});

describe("representative mission rehearsals", () => {
  it("takes one package from approved packet through the guarded merge", async () => {
    const m = mission();
    await synced(m);
    await implementedAt(m, HEAD);
    await reviewedAndApproved(m, HEAD);
    const state = replayState(m.repo, MISSION, m.env);
    expect(journalConjuncts(state, PACKAGE, HEAD)).toEqual([]);
    const gate = evaluateProspectiveMissionGate({
      state,
      packageId: PACKAGE,
      pullRequest: pullRequest(HEAD),
      checkRuns: checks(HEAD),
      files: [{ status: "M", path: "src/app/events/page.tsx" }],
      rules,
    });
    expect(gate).toMatchObject({
      merge: true,
      journal_reasons: [],
      evidence_reasons: [],
      receipt: buildMissionReceipt(state, PACKAGE, HEAD),
    });
    const merged = await m.append({
      type: "merge-recorded",
      package_id: PACKAGE,
      pr_number: 60,
      sha: HEAD,
      route: "guarded-auto",
    });
    expect(merged.packages[PACKAGE].status).toBe("merged");
  });

  it("carries approval across a proved nonvisual delta and voids it for presentation", async () => {
    const m = mission();
    git(m.repo, ["init", "--quiet"]);
    git(m.repo, ["config", "user.email", "rehearsal@example.invalid"]);
    git(m.repo, ["config", "user.name", "Mission Rehearsal"]);
    commit(m.repo, "src/lib/events/service.ts", "export const value = 1;\n", "baseline");
    const page = path.join(m.repo, "src/app/events/page.tsx");
    fs.mkdirSync(path.dirname(page), { recursive: true });
    fs.writeFileSync(page, "export default function Page() { return null; }\n");
    git(m.repo, ["add", "src/app/events/page.tsx"]);
    git(m.repo, ["commit", "--amend", "--no-edit"]);
    const approved = git(m.repo, ["rev-parse", "HEAD"]);

    await synced(m);
    await implementedAt(m, approved);
    await reviewedAndApproved(m, approved);

    const comment = commit(
      m.repo,
      "src/lib/events/service.ts",
      "export const value = 1; // comment only\n",
      "comment",
    );
    const carried = await m.append({
      type: "pr-opened",
      package_id: PACKAGE,
      pr_number: 60,
      head_sha: comment,
    });
    await m.append({
      type: "review-receipt",
      package_id: PACKAGE,
      receipt: {
        review_mode: "correction",
        full_review_sha: approved,
        reviewed_head_sha: comment,
        round: 2,
        result: "clear",
        ci_state: "green",
        ux_conformance: uxConformance,
      },
    });
    expect(carried.packages[PACKAGE].visual_approved).toBe(true);
    expect(
      evaluateProspectiveMissionGate({
        state: replayState(m.repo, MISSION, m.env),
        packageId: PACKAGE,
        pullRequest: pullRequest(comment),
        checkRuns: checks(comment),
        files: [{ status: "M", path: "src/lib/events/service.ts" }],
        rules,
        deriveVisualFiles: (from: string, to: string, current: string) =>
          deriveGitVisualFiles(m.repo, from, to, current),
      }).merge,
    ).toBe(true);

    const presentation = commit(
      m.repo,
      "src/app/events/page.tsx",
      "export default function Page() { return <main>Changed</main>; }\n",
      "presentation",
    );
    const voided = await m.append({
      type: "pr-opened",
      package_id: PACKAGE,
      pr_number: 60,
      head_sha: presentation,
    });
    expect(voided.packages[PACKAGE].visual_approved).toBe(false);
    expect(voided.packages[PACKAGE].visual_carry_forward_chain).toEqual([]);
  });

  it("reconstructs identical state and frontier in a fresh process", async () => {
    const m = mission();
    await synced(m);
    await implementedAt(m, HEAD);
    await m.append({
      type: "owner-question",
      id: "Q-1",
      classification: "hourly",
      text: "Synthetic",
      source: "fixture",
      affected_packages: [],
    });
    const before = replayState(m.repo, MISSION, m.env);
    const fresh = spawnSync(process.execPath, [CLI, "status", MISSION, "--json"], {
      cwd: m.repo,
      env: m.env,
      encoding: "utf8",
    });
    expect(fresh.status).toBe(0);
    const parsed = JSON.parse(fresh.stdout);
    expect(parsed.state.packages).toEqual(before.packages);
    expect(parsed.state.questions).toEqual(before.questions);
    expect(parsed.next_actions).toEqual(nextActions(before));
  });

  /**
   * The rotation, end to end, in real processes.
   *
   * Each Lead is a separate child process with its own identity and no memory
   * of the last one. What crosses each boundary is the journal, the one-use
   * token and a generated dossier — never a conversation.
   */
  it("rotates the Lead at every boundary and carries the mission in durable state alone", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "lancers-epoch-rehearsal-"));
    temporary.push(root);
    const repo = path.join(root, "repo");
    fs.mkdirSync(repo, { recursive: true });
    const base = { ...process.env, LANCERS_MISSION_ROOT: path.join(root, "state") };
    const lead =
      (leadId: string) =>
      (...args: string[]) =>
        spawnSync(process.execPath, [CLI, ...args], {
          cwd: repo,
          env: { ...base, LANCERS_MISSION_LEAD_ID: leadId },
          encoding: "utf8",
        });

    // First Lead: plan and get it approved. Nothing durable is created.
    const planner = lead("lead-rotation-1");
    expect(planner("init", MISSION, "--packet", PACKET_FILE).status).toBe(0);
    expect(planner("plan", MISSION, "--packages", PLAN_FILE).status).toBe(0);
    expect(
      planner("approve-plan", MISSION, "--by", "Brian", "--evidence", "checkpoint 1").status,
    ).toBe(0);

    const closed = planner("epoch", "close", MISSION);
    expect(closed.status, closed.stderr).toBe(0);
    const token = /--token (\S+)/.exec(closed.stdout)?.[1] as string;

    // Second Lead: a different process, a different identity, no shared memory.
    const implementer = lead("lead-rotation-2");
    const resumed = implementer("resume", MISSION, "--token", token);
    expect(resumed.status, resumed.stderr).toBe(0);
    const handover = JSON.parse(resumed.stdout);
    expect(handover.epoch).toMatchObject({
      epoch_id: "E-2",
      phase: "implementation-wave",
      lead_id: "lead-rotation-2",
      scope: { packages: [PACKAGE, "WP-attendance-export"] },
    });

    // The dossier it was handed is a projection of state, not a narration.
    const dossier = JSON.parse(fs.readFileSync(handover.epoch.dossier, "utf8"));
    expect(dossier.mission_id).toBe(MISSION);
    expect(JSON.stringify(dossier)).not.toMatch(/heartbeat/);
    expect(dossier.next_permitted_actions.length).toBeGreaterThan(0);

    expect(implementer("preflight", MISSION, "--detail", "read-only teams query").status).toBe(0);
    for (const [index, id] of [PACKAGE, "WP-attendance-export", "WP-report-footer"].entries()) {
      expect(implementer("sync-intent", MISSION, id).status).toBe(0);
      expect(implementer("sync-result", MISSION, id, `LAN-${901 + index}`).status).toBe(0);
    }

    const dispatch = (id: string) =>
      implementer(
        "dispatch",
        MISSION,
        id,
        "--worker",
        `worker-${id}`,
        "--worktree",
        `.claude/worktrees/${id}`,
        "--branch",
        `feat/${id}`,
        "--brief",
        PACKET_FILE,
      );
    expect(dispatch(PACKAGE).status).toBe(0);
    // The third package is on the approved plan and outside this assignment.
    const outside = dispatch("WP-report-footer");
    expect(outside.status).toBe(1);
    expect(outside.stderr).toMatch(/outside this epoch's scope/);

    // The first Lead is gone, and its identity no longer works on the mission.
    const ghost = planner("heartbeat", MISSION);
    expect(ghost.status).toBe(1);
    expect(ghost.stderr).toMatch(/fenced to another live Lead/);

    // A third process, holding nothing at all, reads the same mission.
    const observer = spawnSync(process.execPath, [CLI, "status", MISSION, "--json"], {
      cwd: repo,
      env: base,
      encoding: "utf8",
    });
    expect(observer.status, observer.stderr).toBe(0);
    const seen = JSON.parse(observer.stdout);
    expect(seen.epoch).toMatchObject({ epoch_id: "E-2", status: "open" });
    expect(seen.state.epochHistory).toHaveLength(1);
    expect(seen.state.epochHistory[0]).toMatchObject({
      epoch_id: "E-1",
      phase: "planning",
      lead_id: "lead-rotation-1",
    });
    expect(seen.state.phaseRecycles).toEqual(["plan-approved"]);
  });
});
