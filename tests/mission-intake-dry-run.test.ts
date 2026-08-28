import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validatePacket } from "../scripts/mission/lib/packet.mjs";
import { validateFinalPrPaths } from "../scripts/intake/lib/pr.mjs";
import {
  createSyntheticLedger,
  removeLedger,
  type SyntheticLedger,
} from "./helpers/synthetic-intake-ledger";

const open: SyntheticLedger[] = [];

afterEach(() => {
  for (const helper of open.splice(0)) removeLedger(helper);
});

describe("synthetic mission intake", () => {
  it("produces a schema-valid ledger-cited packet and resumes after a session kill", () => {
    const helper = createSyntheticLedger();
    open.push(helper);
    const { root, ledger, missionId } = helper;

    // The ledger publishes its generated artifacts before it can be read.
    expect(helper.intake("coverage", missionId, "--write").status).toBe(0);
    expect(helper.intake("subject", missionId, "--write").status).toBe(0);
    expect(helper.intake("hub", missionId, "--write").status).toBe(0);

    const assembling = helper.state();
    assembling.stage = "assembly";
    helper.writeState(assembling);
    expect(helper.intake("hub", missionId, "--write").status).toBe(0);

    const first = helper.intake("status", missionId);
    expect(first.status).toBe(0);

    // A fresh process has no prior conversation or in-memory state.
    const resumed = helper.intake("status", missionId);
    expect(resumed.status).toBe(0);
    expect(resumed.stdout).toBe(first.stdout);
    expect(resumed.stdout).toContain("Stage: assembly");
    expect(resumed.stdout).toContain("W1 · Review synthetic outcome: done");

    fs.rmSync(path.join(ledger, "acceptance", "W1.md"));
    const divergent = helper.intake("status", missionId);
    expect(divergent.status).toBe(1);
    expect(divergent.stderr).toContain("done requires acceptance/W1.md");
    fs.writeFileSync(path.join(ledger, "acceptance", "W1.md"), "# W1 approved\n");

    const state = helper.state() as {
      baseline: { branch: string; commit: string };
      workflows: { id: string }[];
    };
    const packet = {
      packet_version: 1,
      mission_id: missionId,
      status: "approved",
      objective: "Prove a small synthetic outcome without external mutation.",
      non_goals: [],
      sources: [
        {
          id: "SRC-ledger-W1",
          kind: "document",
          ref: `missions/intake/${missionId}/workflows/W1-review.md`,
          version: "synthetic-approved-commit",
        },
      ],
      requirements: [
        {
          id: "REQ-review-outcome",
          text: "The synthetic outcome is reviewable.",
          source_id: "SRC-ledger-W1",
        },
      ],
      decisions: [],
      baseline: state.baseline,
      gates: { owner: [], external: [] },
      merge_envelope: {
        auto_merge_classes: ["standard-application"],
        owner_gated: [
          "schema-migration",
          "rls-auth-security",
          "secrets-credentials",
          "deployment-production-data",
          "whatsapp-external-configuration",
          "highest-risk",
          "visual-without-approval",
        ],
      },
      completion_evidence: ["Synthetic packet validates."],
      workflow_matrix: [{ id: "W1" }],
      delegated_to_mission_lead: [],
      nonblocking_unknowns: [],
      escalation_rules: { permitted_clarifications: [], requires_packet_revision: [] },
      repository_drift: {
        startup_rule: "Compare current main to the baseline.",
        stop_rule: "Stop when the synthetic requirement changes.",
      },
      blockers: [],
      approval: {
        approved_by: "Brian",
        date: "2026-08-20",
        evidence: "Synthetic test fixture only.",
      },
    };

    expect(validatePacket(packet)).toEqual([]);
    expect(packet.workflow_matrix.map((workflow) => workflow.id)).toEqual(
      state.workflows.map((workflow) => workflow.id),
    );
    expect(
      packet.requirements.every((requirement) => requirement.source_id.startsWith("SRC-ledger")),
    ).toBe(true);

    const packetFile = path.join(root, "packet.json");
    fs.writeFileSync(packetFile, JSON.stringify(packet));
    const missionCli = path.resolve("scripts/mission/cli.mjs");
    const inventoryFile = path.join(ledger, "02-workflows.md");
    const valid = spawnSync(
      process.execPath,
      [missionCli, "validate", "--packet", packetFile, "--inventory", inventoryFile],
      { cwd: root, encoding: "utf8" },
    );
    expect(valid.status).toBe(0);
    expect(valid.stdout).toContain("Frozen workflow inventory matches");

    // The one owner-approved merge lands the ledger and the packet together.
    const finalDiff = [
      ...fs
        .readdirSync(ledger, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) =>
          path.posix.join(
            `missions/intake/${missionId}`,
            path
              .relative(ledger, path.join(entry.parentPath, entry.name))
              .split(path.sep)
              .join("/"),
          ),
        ),
      `missions/packets/${missionId}/packet.json`,
      `missions/packets/${missionId}/README.md`,
    ];
    expect(validateFinalPrPaths(missionId, finalDiff)).toEqual([]);
    expect(
      validateFinalPrPaths(missionId, [...finalDiff, "scripts/intake/cli.mjs"]).join("\n"),
    ).toMatch(/scripts\/intake\/cli.mjs is not an intake artifact/);

    fs.writeFileSync(
      inventoryFile,
      "# Frozen workflow inventory\n\n1. `W1` — Review synthetic outcome\n2. `W2` — Extra workflow\n",
    );
    const mismatch = spawnSync(
      process.execPath,
      [missionCli, "validate", "--packet", packetFile, "--inventory", inventoryFile],
      { cwd: root, encoding: "utf8" },
    );
    expect(mismatch.status).toBe(1);
    expect(mismatch.stderr).toContain("workflow_matrix must match the frozen inventory exactly");
  });
});
