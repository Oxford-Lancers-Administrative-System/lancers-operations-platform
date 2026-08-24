import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { readJournal, reduce, missionPaths, nextActions } from "../scripts/mission/lib/state.mjs";

const CLI = path.join(__dirname, "..", "scripts", "mission", "cli.mjs");
const PACKET = path.join(__dirname, "fixtures", "mission", "approved-packet.json");
const PLAN = path.join(__dirname, "fixtures", "mission", "three-package-plan.json");
const MISSION = "M-SYNTHETIC-REHEARSAL";

const temporary: string[] = [];
afterEach(() => {
  for (const root of temporary.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lancers-mission-cli-"));
  temporary.push(root);
  const repo = path.join(root, "repo");
  fs.mkdirSync(repo, { recursive: true });
  const env = {
    ...process.env,
    LANCERS_MISSION_ROOT: path.join(root, "state"),
    LANCERS_MISSION_LEAD_ID: "lead-fixture-1",
  };
  const run = (...args: string[]) =>
    spawnSync(process.execPath, [CLI, ...args], { cwd: repo, env, encoding: "utf8" });
  return { repo, env, run };
}

/** Drive the synthetic mission to a synchronized, dispatchable state. */
function readyMission(m: ReturnType<typeof fixture>) {
  expect(m.run("init", MISSION, "--packet", PACKET).status).toBe(0);
  expect(m.run("plan", MISSION, "--packages", PLAN).status).toBe(0);
  expect(m.run("approve-plan", MISSION, "--by", "Brian", "--evidence", "checkpoint 1").status).toBe(
    0,
  );
  expect(m.run("preflight", MISSION, "--detail", "fixture driver answered").status).toBe(0);
  for (const [index, id] of [
    "WP-events-filter",
    "WP-attendance-export",
    "WP-report-footer",
  ].entries()) {
    expect(m.run("sync-intent", MISSION, id).status).toBe(0);
    expect(m.run("sync-result", MISSION, id, `LAN-90${index}`).status).toBe(0);
  }
}

describe("mission CLI", () => {
  it("refuses a live dispatch without an on-disk brief", () => {
    const m = fixture();
    readyMission(m);
    const refused = m.run(
      "dispatch",
      MISSION,
      "WP-events-filter",
      "--worker",
      "worker-1",
      "--worktree",
      ".claude/worktrees/wp-events",
      "--branch",
      "feat/wp-events",
    );
    expect(refused.status).toBe(1);
    expect(refused.stderr).toMatch(/--brief <brief\.md>/);
  });

  it("requires a report and refuses the final walker before every package merges", () => {
    const m = fixture();
    readyMission(m);
    const head = "a".repeat(40);
    const packageHeads = path.join(m.repo, "package-heads.json");
    const report = path.join(m.repo, "walker-report.md");
    fs.writeFileSync(
      packageHeads,
      JSON.stringify(
        Object.fromEntries(
          ["WP-events-filter", "WP-attendance-export", "WP-report-footer"].map((id) => [id, head]),
        ),
      ),
    );
    fs.writeFileSync(report, "Completed every synthetic user job.\n");
    const missing = m.run(
      "integrated-review",
      MISSION,
      "--mode",
      "workflow-walker",
      "--head",
      head,
      "--package-heads",
      packageHeads,
      "--result",
      "clear",
      "--jobs",
      "Synthetic jobs",
    );
    expect(missing.status).toBe(1);
    expect(missing.stderr).toMatch(/--report <file>/);
    const tooEarly = m.run(
      "integrated-review",
      MISSION,
      "--mode",
      "workflow-walker",
      "--head",
      head,
      "--result",
      "clear",
      "--jobs",
      "Synthetic jobs",
      "--report",
      report,
    );
    expect(tooEarly.status).toBe(1);
    expect(tooEarly.stderr).toMatch(/only after every live package has merged to main/);
    expect(
      m.run(
        "question",
        MISSION,
        "--id",
        "Q-now",
        "--class",
        "immediate",
        "--text",
        "Blocking question",
        "--source",
        "security boundary",
        "--affects",
        "WP-events-filter",
      ).status,
    ).toBe(0);
  });

  it("dispatches dependent work through the CLI only after its dependency merges", () => {
    const m = fixture();
    readyMission(m);
    const HEAD = "a".repeat(40);
    const write = (name: string, body: unknown) => {
      const file = path.join(m.repo, name);
      fs.writeFileSync(file, JSON.stringify(body));
      return file;
    };

    expect(
      m.run(
        "dispatch",
        MISSION,
        "WP-attendance-export",
        "--worker",
        "worker-1",
        "--worktree",
        ".claude/worktrees/wp-attendance",
        "--branch",
        "feat/wp-attendance",
        "--brief",
        PACKET,
      ).status,
    ).toBe(0);
    expect(
      m.run(
        "receipt",
        MISSION,
        "WP-attendance-export",
        "--worker",
        "worker-1",
        "--receipt",
        write("receipt.json", {
          branch: "feat/wp-attendance",
          worktree: ".claude/worktrees/wp-attendance",
          surfaces: ["src/lib/services/attendance.ts"],
          acceptance_criteria: ["exports"],
          verification: "npm run verify observed to pass",
          ci_state: "green",
          visual_state: "nonvisual",
          migration_implications: "none",
          limitations: "none",
          result: "completed",
        }),
      ).status,
    ).toBe(0);
    expect(m.run("pr", MISSION, "WP-attendance-export", "41", HEAD).status).toBe(0);
    expect(
      m.run(
        "review",
        MISSION,
        "WP-attendance-export",
        "--receipt",
        write("review.json", {
          review_mode: "full",
          full_review_sha: HEAD,
          reviewed_head_sha: HEAD,
          round: 1,
          result: "clear",
          ci_state: "green",
        }),
      ).status,
    ).toBe(0);

    const beforeMerge = m.run(
      "dispatch",
      MISSION,
      "WP-report-footer",
      "--worker",
      "worker-2",
      "--worktree",
      ".claude/worktrees/wp-report",
      "--branch",
      "feat/wp-report",
      "--brief",
      PACKET,
    );
    expect(beforeMerge.status).toBe(1);
    expect(beforeMerge.stderr).toMatch(/has not merged to main/);
    expect(
      m.run("merge-record", MISSION, "WP-attendance-export", "41", HEAD, "--route", "guarded-auto")
        .status,
    ).toBe(0);

    const dispatched = m.run(
      "dispatch",
      MISSION,
      "WP-report-footer",
      "--worker",
      "worker-2",
      "--worktree",
      ".claude/worktrees/wp-report",
      "--branch",
      "feat/wp-report",
      "--brief",
      PACKET,
    );
    expect(dispatched.status).toBe(0);
    expect(dispatched.stdout).toContain("Worker worker-2 dispatched on WP-report-footer");
  });

  it("initializes only from a matching approved packet and exits 1 on refusal", () => {
    const m = fixture();
    const mismatched = m.run("init", "M-OTHER", "--packet", PACKET);
    expect(mismatched.status).toBe(1);
    expect(mismatched.stderr).toMatch(/not M-OTHER/);
    expect(m.run("init", MISSION, "--packet", PACKET).status).toBe(0);
    const again = m.run("init", MISSION, "--packet", PACKET);
    expect(again.status).toBe(1);
    expect(again.stderr).toMatch(/already initialized/);
  });

  it("validates a packet purely — approving nothing, writing nothing", () => {
    const m = fixture();
    const approved = m.run("validate", "--packet", PACKET);
    expect(approved.status).toBe(0);
    expect(approved.stdout).toMatch(/valid and approved/);
    const notReady = path.join(m.repo, "not-ready.json");
    const packet = JSON.parse(fs.readFileSync(PACKET, "utf8"));
    fs.writeFileSync(notReady, JSON.stringify({ ...packet, status: "not_ready" }));
    const refused = m.run("validate", "--packet", notReady);
    expect(refused.status).toBe(1);
    expect(refused.stderr).toMatch(/cannot initialize execution|not_ready/);
    const broken = path.join(m.repo, "broken.json");
    fs.writeFileSync(broken, JSON.stringify({ ...packet, baseline: { branch: "main" } }));
    expect(m.run("validate", "--packet", broken).status).toBe(1);
    // Pure: no mission state exists afterwards.
    const status = m.run("status", "M-SYNTHETIC-REHEARSAL");
    expect(status.stdout).toMatch(/absent/);
  });

  it("refuses dispatch before synchronization, from a real child process", () => {
    const m = fixture();
    expect(m.run("init", MISSION, "--packet", PACKET).status).toBe(0);
    expect(m.run("plan", MISSION, "--packages", PLAN).status).toBe(0);
    const refused = m.run(
      "dispatch",
      MISSION,
      "WP-events-filter",
      "--worker",
      "worker-1",
      "--worktree",
      ".claude/worktrees/wp-events",
      "--branch",
      "feat/wp-events",
      "--brief",
      PACKET,
    );
    expect(refused.status).toBe(1);
    expect(refused.stderr).toMatch(/No Linear connectivity preflight/);
    expect(refused.stderr).toMatch(/no created or reconciled Linear issue/);
  });

  it("renders the checkpoint sections Brian reads in five minutes", () => {
    const m = fixture();
    readyMission(m);
    expect(
      m.run(
        "question",
        MISSION,
        "--id",
        "Q-1",
        "--class",
        "hourly",
        "--text",
        "Which default filter?",
        "--source",
        "brief silent",
        "--affects",
        "WP-events-filter",
      ).status,
    ).toBe(0);
    const checkpoint = m.run(
      "checkpoint",
      MISSION,
      "--main-commit",
      "a".repeat(40),
      "--deployed-commit",
      "b".repeat(40),
    );
    expect(checkpoint.status).toBe(0);
    for (const section of [
      "## Completed since last checkpoint",
      "## Currently running",
      "## Need from Brian",
      "## Rules learned",
      "## Next hour",
      "## Deploy drift",
      "## Resources",
    ]) {
      expect(checkpoint.stdout).toContain(section);
    }
    expect(checkpoint.stdout.indexOf("Q-now")).toBeLessThan(checkpoint.stdout.indexOf("Q-1"));
    expect(checkpoint.stdout).toMatch(/gh workflow run deploy\.yml/);
    expect(checkpoint.stdout).toMatch(
      /Active stacks: .*leases: .*worktrees: .*load \(1\/5\/15m\):/,
    );
  });

  it("stops with a durable checkpoint and resumes in a completely fresh process", () => {
    const m = fixture();
    readyMission(m);
    const stop = m.run("stop", MISSION, "--reason", "usage-exhausted", "--detail", "simulated");
    expect(stop.status).toBe(0);
    const refused = m.run("sync-intent", MISSION, "WP-events-filter");
    expect(refused.status).toBe(1);
    expect(refused.stderr).toMatch(/mission is stopped/);

    const resumed = m.run("resume", MISSION);
    expect(resumed.status).toBe(0);
    const parsed = JSON.parse(resumed.stdout);
    expect(parsed.state.stopped).toBeNull();
    const events = readJournal(missionPaths(m.repo, MISSION, m.env).journal);
    const replayed = reduce(events);
    expect(parsed.state.packages).toEqual(replayed.packages);
    expect(parsed.next_actions).toEqual(nextActions(replayed));
  });

  // Regression: the validator refuses an owner merge the guarded lane could have
  // taken unless the reason is recorded, and no CLI path set that field — so
  // every such merge was unrecordable and its package stayed open in state
  // forever. The reason has to survive into the journal, not just be accepted.
  it("carries the owner-route reason into the journal entry", () => {
    const m = fixture();
    readyMission(m);
    const sha = "c".repeat(40);
    expect(
      m.run("merge-record", MISSION, "WP-events-filter", "12", sha, "--route", "owner").status,
    ).toBe(0);
    const withoutReason = readJournal(missionPaths(m.repo, MISSION, m.env).journal).filter(
      (event) => event.type === "merge-recorded",
    );
    expect(withoutReason.at(-1)?.owner_route_reason).toBeUndefined();

    expect(
      m.run(
        "merge-record",
        MISSION,
        "WP-events-filter",
        "12",
        sha,
        "--route",
        "owner",
        "--reason",
        "Its pull request also carried a prohibited path.",
      ).status,
    ).toBe(0);
    const recorded = readJournal(missionPaths(m.repo, MISSION, m.env).journal).filter(
      (event) => event.type === "merge-recorded",
    );
    expect(recorded.at(-1)?.owner_route_reason).toBe(
      "Its pull request also carried a prohibited path.",
    );
  });

  // Regression: finish-mission.mjs used mergeProof and worktreeDefects without
  // importing them. Every invocation died with a ReferenceError before it could
  // prove a single merge, and the unit tests for those helpers passed the whole
  // time because they import the library directly. Loading the real entry point
  // is the only thing that catches it.
  it("loads the reclamation entry point with every symbol it uses", () => {
    const m = fixture();
    const finish = path.join(__dirname, "..", "scripts", "mission", "finish-mission.mjs");
    const result = spawnSync(process.execPath, [finish, "M-NO-SUCH-MISSION"], {
      cwd: m.repo,
      env: m.env,
      encoding: "utf8",
    });
    expect(result.stderr).not.toMatch(/is not defined/);
    expect(result.stderr).toMatch(/no durable state to finish/);
  });

  it("promotes rules through the registry and applies them to answer without asking", () => {
    const m = fixture();
    readyMission(m);
    const ruleFile = path.join(m.repo, "rule.json");
    fs.writeFileSync(
      ruleFile,
      JSON.stringify({
        id: "RULE-UI-007",
        scope: "Ordinary administrative list pages",
        rule: "Default to 25-row pagination",
        exceptions: [],
        source: "Brian",
        date: "2026-08-18",
        status: "approved",
        approval_evidence: "Checkpoint answer: make it standing",
        source_mission: MISSION,
      }),
    );
    const unapproved = path.join(m.repo, "unapproved.json");
    fs.writeFileSync(
      unapproved,
      JSON.stringify({ id: "RULE-UI-008", scope: "x", rule: "y", status: "proposed" }),
    );
    expect(m.run("promote-rule", "--rule", unapproved).status).toBe(1);
    expect(m.run("promote-rule", "--rule", ruleFile).status).toBe(0);
    const missingRule = m.run("apply-rule", MISSION, "RULE-UI-999", "--context", "n/a");
    expect(missingRule.status).toBe(1);
    expect(
      m.run("apply-rule", MISSION, "RULE-UI-007", "--context", "pagination question").status,
    ).toBe(0);
  });
});
