import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { renderCheckpoint } from "../scripts/mission/cli.mjs";
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
    ]) {
      expect(checkpoint.stdout).toContain(section);
    }
    expect(checkpoint.stdout).toMatch(/1\. \[hourly\] Q-1/);
    expect(checkpoint.stdout).toMatch(/gh workflow run deploy\.yml/);
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

describe("checkpoint rendering", () => {
  it("orders immediate questions before hourly ones and reports deploy drift", () => {
    const packet = JSON.parse(fs.readFileSync(PACKET, "utf8"));
    const plan = JSON.parse(fs.readFileSync(PLAN, "utf8"));
    const events = [
      {
        type: "mission-init",
        at: "2026-08-18T10:00:00.000Z",
        packet,
        lead_id: "lead-fixture",
        pid: 4242,
      },
      {
        type: "plan-recorded",
        at: "2026-08-18T10:01:00.000Z",
        packages: plan.packages,
        decomposition: plan.decomposition,
      },
      {
        type: "plan-approved",
        at: "2026-08-18T10:01:30.000Z",
        approved_by: "Brian",
        evidence: "checkpoint 1",
      },
      {
        type: "owner-question",
        at: "2026-08-18T10:02:00.000Z",
        id: "Q-hourly",
        classification: "hourly",
        text: "Nonurgent",
        source: "s",
        affected_packages: [],
      },
      {
        type: "owner-question",
        at: "2026-08-18T10:03:00.000Z",
        id: "Q-now",
        classification: "immediate",
        text: "Blocking",
        source: "s",
        affected_packages: [],
      },
    ];
    const report = renderCheckpoint(reduce(events), events, {
      mainCommit: "a".repeat(40),
      deployedCommit: "a".repeat(40),
    });
    expect(report.indexOf("Q-now")).toBeLessThan(report.indexOf("Q-hourly"));
    expect(report).toMatch(/Production serves main/);
  });
});
