import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * A synthetic version 3 intake ledger, written to a throwaway directory. It is
 * deliberately not a copy of an approved mission: the approved Events artifacts
 * are read-only history, and a fixture that drifted from them would be worse
 * than one that never claimed to be them.
 */
export type SyntheticLedger = {
  root: string;
  ledger: string;
  missionId: string;
  state: () => Record<string, unknown>;
  writeState: (state: Record<string, unknown>) => void;
  intake: (...args: string[]) => { status: number | null; stdout: string; stderr: string };
  read: (file: string) => string;
  exists: (file: string) => boolean;
};

const CLI = path.resolve("scripts/intake/cli.mjs");

export const syntheticDecisionCoverage = (missionId: string) => ({
  sources: [
    {
      id: "SRC-brief",
      ref: "https://example.invalid/synthetic-brief",
      version: "2026-08-22",
      decision_ids: ["D1", "D2"],
    },
  ],
  decisions: [
    {
      id: "D1",
      source_id: "SRC-brief",
      disposition: "workflow",
      workflow: "W1",
      reason: "W1 owns the only journey the brief describes.",
    },
    {
      id: "D2",
      source_id: "SRC-brief",
      disposition: "other_mission",
      other_mission: "M-OTHER-SYNTHETIC",
      reason: "The approved seam puts delivery in the other mission.",
      evidence: `§6 handoff table, read for ${missionId}.`,
    },
  ],
});

export const syntheticSubjectCoverage = (missionId: string) => ({
  areas: [
    {
      id: "S1",
      name: "Review the synthetic outcome",
      belongs: "Produces the commissioned outcome.",
      disposition: "workflow",
      workflow: "W1",
      implementation: "new",
      reason: "W1 owns the journey.",
    },
    {
      id: "S2",
      name: "Keep the result synthetic",
      belongs: "External writes are forbidden.",
      disposition: "invariant",
      invariant: "No external mutation.",
      reason: "Binds every workflow.",
    },
    {
      id: "S3",
      name: "Retain the current review page",
      belongs: "The current page is part of the journey.",
      disposition: "workflow",
      workflow: "W1",
      implementation: "retained",
      baseline: "main:/operate/synthetic rendered locally at desktop and 375px",
      reason: "Keep the implemented interaction.",
    },
    {
      id: "S4",
      name: "Extend the current result state",
      belongs: "Adds one state to the current page.",
      disposition: "workflow",
      workflow: "W1",
      implementation: "modified",
      baseline: "main:/operate/synthetic rendered locally at desktop and 375px",
      reason: "W1 changes the existing page.",
    },
    {
      id: "S5",
      name: "Share delivery vocabulary",
      belongs: "Consumes a shared vocabulary.",
      disposition: "shared_cross_mission",
      shared_owners: [missionId, "M-OTHER-SYNTHETIC"],
      workflow: "W1",
      current_side: "Render the outcome with the shared vocabulary.",
      seam: "The other mission owns transport; this one owns visible meaning.",
      evidence: "Synthetic §5 seam.",
      reason: "Both sides must agree.",
    },
    {
      id: "S6",
      name: "Administer the transport",
      belongs: "Depends on transport administration.",
      disposition: "other_mission",
      other_mission: "M-OTHER-SYNTHETIC",
      seam: "Consumes configured transport.",
      evidence: "Synthetic §6 handoff.",
      reason: "The other mission owns administration.",
    },
    {
      id: "S7",
      name: "Extend the result later",
      belongs: "A future mission adds detail.",
      disposition: "provisional_handoff",
      other_mission: "M-FUTURE-SYNTHETIC",
      invariant: "The extension cannot change W1's result.",
      seam: "The future mission adds fields only.",
      evidence: "Synthetic portfolio adjacency.",
      blocking: false,
      independent_outcome: "W1 is walkable and acceptable without it.",
      reason: "The extension does not gate this mission.",
    },
    {
      id: "S8",
      name: "Export the synthetic result",
      belongs: "Export is adjacent and needs a disposition.",
      disposition: "excluded",
      evidence: "The outcome stops at on-screen review.",
      approval: { words: "Approve export as excluded.", date: "2026-08-28" },
      reason: "The boundary excludes export.",
    },
  ],
});

export const syntheticIntakeState = (missionId = "M-SYNTHETIC-INTAKE", visual = true) => ({
  mission_id: missionId,
  ledger_version: 3,
  stage: "workflows",
  baseline: { branch: "main", commit: "315fbbbcdff2da3a5b6ead2d4352785bb12943be" },
  approvals: {
    boundary: { words: "Approve the synthetic boundary.", date: "2026-08-22" },
    overview: { words: "Approve the synthetic overview.", date: "2026-08-22" },
    inventory: { words: "Approve the one-workflow inventory.", date: "2026-08-22" },
  },
  workflows: [
    {
      id: "W1",
      name: "Review synthetic outcome",
      state: visual ? "done" : "spec_approved",
      stale: false,
      feedback: [],
      approvals: {
        spec: { words: "Approve W1 spec.", date: "2026-08-22" },
        ...(visual ? { mock: { words: "Approve W1 mock.", date: "2026-08-22" } } : {}),
      },
    },
  ],
  mockup_hub: visual ? "generated" : { not_applicable: "This mission draws no surfaces." },
  decision_coverage: syntheticDecisionCoverage(missionId),
  subject_coverage: syntheticSubjectCoverage(missionId),
  amendment_plan: {
    items: [
      {
        id: "A1",
        target: "M-FUTURE-SYNTHETIC portfolio row",
        change: "Append the dated future extension from S7.",
        reason: "The current intake discovered the future mission seam.",
        status: "proposed",
      },
    ],
    approval: null,
  },
  next_action: "Assemble the synthetic packet from approved ledger files",
});

export function createSyntheticLedger(
  options: { missionId?: string; visual?: boolean } = {},
): SyntheticLedger {
  const missionId = options.missionId ?? "M-SYNTHETIC-INTAKE";
  const visual = options.visual !== false;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lancers-intake-"));
  const ledger = path.join(root, "missions", "intake", missionId);
  for (const directory of ["workflows", "mockups", "acceptance", "evidence"]) {
    fs.mkdirSync(path.join(ledger, directory), { recursive: true });
  }
  fs.writeFileSync(path.join(ledger, "00-boundary.md"), "# Approved synthetic boundary\n");
  fs.writeFileSync(path.join(ledger, "01-overview.md"), "# Approved synthetic overview\n");
  fs.writeFileSync(
    path.join(ledger, "02-workflows.md"),
    "# Frozen workflow inventory\n\n1. `W1` — Review synthetic outcome\n",
  );
  fs.writeFileSync(
    path.join(ledger, "workflows", "W1-review.md"),
    "# W1 — Review synthetic outcome\n\nApproved synthetic workflow.\n",
  );
  if (visual) {
    fs.writeFileSync(
      path.join(ledger, "mockups", "W1-review.html"),
      [
        "<!doctype html><title>W1</title>",
        '<span id="W1-01">Current — on main today</span>',
        '<span id="W1-02">Proposed — this mission</span>',
      ].join("\n"),
    );
  }
  fs.writeFileSync(path.join(ledger, "acceptance", "W1.md"), "# W1 approved\n");

  const state = syntheticIntakeState(missionId, visual);

  const helper: SyntheticLedger = {
    root,
    ledger,
    missionId,
    state: () => JSON.parse(fs.readFileSync(path.join(ledger, "state.json"), "utf8")),
    writeState: (next) =>
      fs.writeFileSync(path.join(ledger, "state.json"), `${JSON.stringify(next, null, 2)}\n`),
    intake: (...args) => {
      const result = spawnSync(process.execPath, [CLI, ...args], { cwd: root, encoding: "utf8" });
      return { status: result.status, stdout: result.stdout, stderr: result.stderr };
    },
    read: (file) => fs.readFileSync(path.join(ledger, file), "utf8"),
    exists: (file) => fs.existsSync(path.join(ledger, file)),
  };
  helper.writeState(state);
  return helper;
}

export const removeLedger = (helper: SyntheticLedger) =>
  fs.rmSync(helper.root, { recursive: true, force: true });
