import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { readJournal, reduce, missionPaths, nextActions } from "../scripts/mission/lib/state.mjs";
import { cliReviewFlow } from "./helpers/mission-invocations";

const CLI = path.join(__dirname, "..", "scripts", "mission", "cli.mjs");
const PACKET = path.join(__dirname, "fixtures", "mission", "approved-packet.json");
const PLAN = path.join(__dirname, "fixtures", "mission", "three-package-plan.json");
const MISSION = "M-SYNTHETIC-REHEARSAL";

// Every case here drives the real CLI in real child processes, and since
// LAN-178 each one also performs the post-plan Lead handover — two more spawns
// per mission. Under the full suite's parallelism that outgrows the 5s default,
// which is a cost of the fence, not a hang.
vi.setConfig({ testTimeout: 60_000 });

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
  // The Lead identity is mutable because a mission is meant to change Leads:
  // every epoch boundary hands the mission to a session that has not seen the
  // previous one's context, and the CLI is how that handover happens.
  const session = { leadId: "lead-fixture-1", generation: 1 };
  const run = (...args: string[]) =>
    spawnSync(process.execPath, [CLI, ...args], {
      cwd: repo,
      env: { ...env, LANCERS_MISSION_LEAD_ID: session.leadId },
      encoding: "utf8",
    });

  /** Close the current epoch and resume as a fresh Lead with its one-use token. */
  const recycle = () => {
    const closed = run("epoch", "close", MISSION);
    expect(closed.status, closed.stderr).toBe(0);
    const token = /--token (\S+)/.exec(closed.stdout)?.[1];
    expect(token, closed.stdout).toBeTruthy();
    session.generation += 1;
    session.leadId = `lead-fixture-${session.generation}`;
    const resumed = run("resume", MISSION, "--token", String(token));
    expect(resumed.status, resumed.stderr).toBe(0);
    return { token: String(token), resumed };
  };

  return { repo, env, run, recycle, session };
}

/**
 * Drive the synthetic mission to a synchronized, dispatchable state.
 *
 * The recycle in the middle is the whole point of LAN-178: plan approval ends
 * the planning epoch, and no amount of good intent lets the same Lead carry on
 * into synchronization and dispatch.
 */
function readyMission(m: ReturnType<typeof fixture>) {
  expect(m.run("init", MISSION, "--packet", PACKET).status).toBe(0);
  expect(m.run("plan", MISSION, "--packages", PLAN).status).toBe(0);
  expect(m.run("approve-plan", MISSION, "--by", "Brian", "--evidence", "checkpoint 1").status).toBe(
    0,
  );
  m.recycle();
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
  it("checks receipts without appending and re-scopes a correction in place", () => {
    const m = fixture();
    readyMission(m);
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
    const receipt = path.join(m.repo, "receipt.json");
    fs.writeFileSync(
      receipt,
      JSON.stringify({
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
    );
    const journal = missionPaths(m.repo, MISSION, m.env).journal;
    const before = readJournal(journal).length;

    const checked = m.run(
      "receipt",
      MISSION,
      "WP-attendance-export",
      "--worker",
      "worker-1",
      "--receipt",
      receipt,
      "--check",
    );

    expect(checked.status).toBe(0);
    expect(checked.stdout).toMatch(/journal unchanged/);
    expect(readJournal(journal)).toHaveLength(before);
    expect(reduce(readJournal(journal)).activeWorkers).toHaveLength(1);

    const invalid = JSON.parse(fs.readFileSync(receipt, "utf8"));
    delete invalid.limitations;
    fs.writeFileSync(receipt, JSON.stringify(invalid));
    const refused = m.run(
      "receipt",
      MISSION,
      "WP-attendance-export",
      "--worker",
      "worker-1",
      "--receipt",
      receipt,
      "--check",
    );
    expect(refused.status).toBe(1);
    expect(refused.stderr).toMatch(/missing `limitations`/);
    expect(readJournal(journal)).toHaveLength(before);

    invalid.limitations = "none";
    fs.writeFileSync(receipt, JSON.stringify(invalid));
    expect(
      m.run(
        "receipt",
        MISSION,
        "WP-attendance-export",
        "--worker",
        "worker-1",
        "--receipt",
        receipt,
      ).status,
    ).toBe(0);
    expect(m.run("pr", MISSION, "WP-attendance-export", "41", "a".repeat(40)).status).toBe(0);
    const review = path.join(m.repo, "review.json");
    const reviewReport = path.join(m.repo, "package-gate.md");
    fs.writeFileSync(reviewReport, "No sensitive or visual scope.\n");
    const invocation = cliReviewFlow(
      m.run,
      m.repo,
      MISSION,
      "WP-attendance-export",
      "a".repeat(40),
      { env: m.env },
    );
    fs.writeFileSync(
      review,
      JSON.stringify({
        review_mode: "package-gate",
        full_review_sha: "a".repeat(40),
        reviewed_head_sha: "a".repeat(40),
        round: 1,
        result: "clear",
        ci_state: "green",
        sensitive_paths: [],
        report: reviewReport,
        invocation_id: invocation.invocation_id,
        runtime_id: invocation.runtime_id,
        agent_id: invocation.agent_id,
        contract_hash: invocation.contract_hash,
        job_results: invocation.job_results,
      }),
    );
    const beforeReviewCheck = readJournal(journal).length;
    const reviewChecked = m.run(
      "review",
      MISSION,
      "WP-attendance-export",
      "--receipt",
      review,
      "--check",
    );
    expect(reviewChecked.status).toBe(0);
    expect(reviewChecked.stdout).toMatch(/Review receipt.*journal unchanged/);
    expect(readJournal(journal)).toHaveLength(beforeReviewCheck);

    const blockedReview = JSON.parse(fs.readFileSync(review, "utf8"));
    blockedReview.result = "blocked";
    blockedReview.job_results = (blockedReview.job_results as Record<string, unknown>[]).map(
      (entry, index) => (index === 0 ? { ...entry, result: "block" } : entry),
    );
    blockedReview.findings = [
      { id: "R-001", affected_jobs: [blockedReview.job_results[0].job_id] },
      { id: "R-002", affected_jobs: [blockedReview.job_results[0].job_id] },
    ];
    fs.writeFileSync(review, JSON.stringify(blockedReview));
    expect(m.run("review", MISSION, "WP-attendance-export", "--receipt", review).status).toBe(0);
    expect(
      m.run(
        "correction",
        MISSION,
        "WP-attendance-export",
        "--worker",
        "worker-1",
        "--findings",
        "R-001,R-002",
      ).status,
    ).toBe(0);
    expect(
      m.run(
        "correction",
        MISSION,
        "WP-attendance-export",
        "--worker",
        "worker-1",
        "--findings",
        "R-001",
        "--record-only",
        "R-003",
      ).status,
    ).toBe(0);
    const rescoped = reduce(readJournal(journal));
    expect(rescoped.packages["WP-attendance-export"].status).toBe("correction");
    expect(rescoped.activeWorkers).toHaveLength(1);
    expect(rescoped.activeWorkers[0]).toMatchObject({
      finding_ids: ["R-001"],
      record_only_finding_ids: ["R-003"],
    });
  });

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
          ...cliReviewFlow(m.run, m.repo, MISSION, "WP-attendance-export", HEAD, {
            env: m.env,
          }),
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

    // The dependency has merged, so the dependency fence is satisfied — and the
    // package is still refused, because this Lead's wave never included it.
    // Becoming eligible does not put work inside an assignment already made.
    const outOfScope = m.run(
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
    expect(outOfScope.status).toBe(1);
    expect(outOfScope.stderr).toMatch(/outside this epoch's scope/);
    expect(outOfScope.stderr).not.toMatch(/has not merged to main/);

    m.recycle();
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

  it("opens a planning epoch on init and bounds the mission from its first event", () => {
    const m = fixture();
    const initialized = m.run("init", MISSION, "--packet", PACKET);
    expect(initialized.status, initialized.stderr).toBe(0);
    expect(initialized.stdout).toMatch(/Lead epoch E-1: planning \(open\)/);
    expect(initialized.stdout).toMatch(/Health: green/);

    const journal = readJournal(missionPaths(m.repo, MISSION, m.env).journal);
    expect(journal.map((event) => event.type)).toEqual(["mission-init", "lead-epoch-opened"]);
    const epoch = reduce(journal).epoch!;
    expect(epoch).toMatchObject({ phase: "planning", lead_id: "lead-fixture-1" });
    // The dossier is written beside the journal, never into the repository.
    expect(epoch.dossier.startsWith(m.env.LANCERS_MISSION_ROOT)).toBe(true);
    expect(fs.existsSync(epoch.dossier)).toBe(true);
    expect(JSON.parse(fs.readFileSync(epoch.dossier, "utf8")).objective).toBeTruthy();
  });

  it("hands the mission to a fresh Lead through the one-use token", () => {
    const m = fixture();
    expect(m.run("init", MISSION, "--packet", PACKET).status).toBe(0);
    expect(m.run("plan", MISSION, "--packages", PLAN).status).toBe(0);
    expect(
      m.run("approve-plan", MISSION, "--by", "Brian", "--evidence", "checkpoint 1").status,
    ).toBe(0);

    // The Mission 4 shape, refused by the state machine rather than by advice.
    const carriedOn = m.run("sync-intent", MISSION, "WP-events-filter");
    expect(carriedOn.status).toBe(1);
    expect(carriedOn.stderr).toMatch(/planning, boundary-pending/);

    const closed = m.run("epoch", "close", MISSION);
    expect(closed.status, closed.stderr).toBe(0);
    const token = /--token (\S+)/.exec(closed.stdout)?.[1] as string;
    expect(closed.stdout).toMatch(/Start a NEW session/);

    // The Lead that closed it cannot resume it, token or no token.
    const itself = m.run("resume", MISSION, "--token", token);
    expect(itself.status).toBe(1);
    expect(itself.stderr).toMatch(/same session cannot resume its own closed epoch/);

    m.session.leadId = "lead-fixture-fresh";
    const withoutToken = m.run("resume", MISSION);
    expect(withoutToken.status).toBe(1);
    expect(withoutToken.stderr).toMatch(/Present the one-use token/);

    const resumed = m.run("resume", MISSION, "--token", token);
    expect(resumed.status, resumed.stderr).toBe(0);
    const parsed = JSON.parse(resumed.stdout);
    expect(parsed.epoch).toMatchObject({
      phase: "implementation-wave",
      status: "open",
      lead_id: "lead-fixture-fresh",
      scope: { packages: ["WP-events-filter", "WP-attendance-export"] },
    });
    // A resumed Lead is handed a generated dossier, not the journal.
    expect(fs.existsSync(parsed.epoch.dossier)).toBe(true);
    expect(resumed.stderr).toMatch(/Resume dossier:/);
  });

  it("reports the epoch, its health and the three owner choices at a boundary", () => {
    const m = fixture();
    expect(m.run("init", MISSION, "--packet", PACKET).status).toBe(0);
    expect(m.run("plan", MISSION, "--packages", PLAN).status).toBe(0);
    expect(
      m.run("approve-plan", MISSION, "--by", "Brian", "--evidence", "checkpoint 1").status,
    ).toBe(0);

    const status = m.run("epoch", "status", MISSION);
    expect(status.status, status.stderr).toBe(0);
    expect(status.stdout).toMatch(/Lead epoch E-1: planning \(boundary-pending\)/);
    expect(status.stdout).toMatch(/Boundary: The exit condition is satisfied/);
    // Absent telemetry reads unknown, and says so rather than passing as green.
    expect(status.stdout).toMatch(/context-usage: unknown/);
    expect(status.stdout).toMatch(/next: continue-fresh-lead/);
    expect(status.stdout).toMatch(/next: pause-or-stop-mission/);
    expect(status.stdout).toMatch(/next: adjust-epoch/);
    expect(status.stdout).toMatch(/Next derived epoch: post-plan-boundary/);

    // Every owner-facing surface tells the same story.
    const checkpoint = m.run("checkpoint", MISSION);
    expect(checkpoint.status, checkpoint.stderr).toBe(0);
    expect(checkpoint.stdout).toMatch(/## Lead epoch/);
    expect(checkpoint.stdout).toMatch(/E-1 — planning \(boundary-pending\), health green/);
  });

  it("extends a healthy epoch only on Brian's recorded authorization", () => {
    const m = fixture();
    readyMission(m);
    const missing = m.run(
      "epoch",
      "adjust",
      MISSION,
      "--extend-current",
      "--package",
      "WP-report-footer",
    );
    expect(missing.status).toBe(1);
    expect(missing.stderr).toMatch(/only an explicit owner message authorizes filing/);

    const extended = m.run(
      "epoch",
      "adjust",
      MISSION,
      "--extend-current",
      "--package",
      "WP-report-footer",
      "--by",
      "Brian",
      "--authorization",
      "Yes — take the footer under this Lead.",
      "--reason",
      "One small adjacent package rather than another rotation.",
    );
    // WP-report-footer's dependency has not merged, so it is not adjacent work
    // yet: an extension widens the assignment, never the approved order.
    expect(extended.status).toBe(1);
    expect(extended.stderr).toMatch(/not eligible on the approved frontier/);

    const recut = path.join(m.repo, "waves.json");
    fs.writeFileSync(recut, JSON.stringify([["WP-report-footer"]]));
    const grouped = m.run(
      "epoch",
      "adjust",
      MISSION,
      "--recut-future",
      "--waves",
      recut,
      "--by",
      "Brian",
      "--authorization",
      "Group the footer on its own.",
      "--reason",
      "It is the only package left after this wave.",
    );
    expect(grouped.status, grouped.stderr).toBe(0);
    expect(grouped.stdout).toMatch(/keeps its extension budget/);
    expect(
      reduce(readJournal(missionPaths(m.repo, MISSION, m.env).journal)).epochPlan.futureWaves,
    ).toEqual([["WP-report-footer"]]);
  });

  it("builds a bounded extension from state when Brian authorizes one", () => {
    const m = fixture();
    readyMission(m);
    const HEAD = "a".repeat(40);
    const write = (name: string, body: unknown) => {
      const file = path.join(m.repo, name);
      fs.writeFileSync(file, JSON.stringify(body));
      return file;
    };

    // Take the footer's dependency all the way to merged, so the footer becomes
    // the one adjacent eligible package this wave could absorb.
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
          ...cliReviewFlow(m.run, m.repo, MISSION, "WP-attendance-export", HEAD, {
            env: m.env,
          }),
        }),
      ).status,
    ).toBe(0);
    expect(
      m.run("merge-record", MISSION, "WP-attendance-export", "41", HEAD, "--route", "guarded-auto")
        .status,
    ).toBe(0);

    const extended = m.run(
      "epoch",
      "adjust",
      MISSION,
      "--extend-current",
      "--package",
      "WP-report-footer",
      "--by",
      "Brian",
      "--authorization",
      "Yes — take the footer under this Lead rather than rotating again.",
      "--reason",
      "Its dependency merged and it is one small package.",
    );
    expect(extended.status, extended.stderr).toBe(0);
    expect(extended.stdout).toMatch(/extended by Brian at green/);
    expect(extended.stdout).toMatch(/no further extension/);

    const adjustment = reduce(readJournal(missionPaths(m.repo, MISSION, m.env).journal)).epoch!
      .adjustments[0];
    expect(adjustment).toMatchObject({
      kind: "extend-current",
      approved_by: "Brian",
      health: { color: "green", reason_codes: [] },
      limit: { added_packages: 1, correction_cycles: 0, expires_after_hours: 2 },
    });
    expect(adjustment.old_scope.packages).toEqual(["WP-events-filter", "WP-attendance-export"]);
    expect(adjustment.new_scope.packages).toEqual([
      "WP-events-filter",
      "WP-attendance-export",
      "WP-report-footer",
    ]);
    expect(Date.parse(adjustment.expires_at)).toBeGreaterThan(Date.now());
    expect(Date.parse(adjustment.expires_at)).toBeLessThanOrEqual(Date.now() + 2 * 60 * 60 * 1000);

    // The extension is what makes the dispatch legal, and it is the last one.
    expect(
      m.run(
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
      ).status,
    ).toBe(0);
    const again = m.run(
      "epoch",
      "adjust",
      MISSION,
      "--extend-current",
      "--package",
      "WP-events-filter",
      "--by",
      "Brian",
      "--authorization",
      "One more.",
      "--reason",
      "One more.",
    );
    expect(again.status).toBe(1);
    expect(again.stderr).toMatch(/already used its one normal extension/);
  });

  it("refuses mission work on an initialized journal that has adopted no epoch", () => {
    const m = fixture();
    const journal = missionPaths(m.repo, MISSION, m.env).journal as string;
    fs.mkdirSync(path.dirname(journal), { recursive: true, mode: 0o700 });
    const events = readJournal(
      path.join(__dirname, "fixtures", "mission", "mission-4-shaped-journal.ndjson"),
    );
    fs.writeFileSync(journal, `${events.map((event) => JSON.stringify(event)).join("\n")}\n`);

    // Status stays readable — nothing about an old journal becomes unusable.
    const status = m.run("status", MISSION);
    expect(status.status, status.stderr).toBe(0);
    expect(status.stdout).toMatch(/Lead epoch: none/);

    const dispatched = m.run(
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
    );
    expect(dispatched.status).toBe(1);
    expect(dispatched.stderr).toMatch(/has no Lead epoch/);
    // And the journal is exactly as it was.
    expect(readJournal(journal)).toEqual(events);
  });
});
