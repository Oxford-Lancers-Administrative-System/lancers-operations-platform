import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createSyntheticLedger,
  removeLedger,
  type SyntheticLedger,
} from "./helpers/synthetic-intake-ledger";

const open: SyntheticLedger[] = [];
const ledgerFor = (options?: Parameters<typeof createSyntheticLedger>[0]) => {
  const helper = createSyntheticLedger(options);
  open.push(helper);
  // Every gated ledger publishes its generated decision coverage.
  expect(helper.intake("coverage", helper.missionId, "--write").status).toBe(0);
  expect(helper.intake("subject", helper.missionId, "--write").status).toBe(0);
  if (helper.state().mockup_hub === "generated") {
    expect(helper.intake("hub", helper.missionId, "--write").status).toBe(0);
  }
  return helper;
};

afterEach(() => {
  for (const helper of open.splice(0)) removeLedger(helper);
});

describe("the generated mockup hub", () => {
  it("renders every frozen workflow's state, artifacts, screens and disposition", () => {
    const helper = ledgerFor();
    const hub = helper.read(path.join("mockups", "index.html"));
    expect(hub).toContain("M-SYNTHETIC-INTAKE · mockup review");
    expect(hub).toContain("1 frozen workflow");
    expect(hub).toContain("1 of 1 done");
    expect(hub).toContain('<a href="W1-review.html">Review synthetic outcome</a>');
    expect(hub).toContain('<a href="../workflows/W1-review.md">specification</a>');
    expect(hub).toContain('<a href="../acceptance/W1.md">acceptance</a>');
    expect(hub).toContain("current vs proposed");
    expect(hub).toContain('<span class="state done">done</span>');
    // Two screen ids in the mockup, counted once each.
    expect(hub).toContain("<td>2</td>");
  });

  it("is deterministic and drift-free immediately after it is written", () => {
    const helper = ledgerFor();
    const first = helper.read(path.join("mockups", "index.html"));
    expect(helper.intake("hub", helper.missionId, "--write").status).toBe(0);
    expect(helper.read(path.join("mockups", "index.html"))).toBe(first);
    expect(helper.intake("hub", helper.missionId, "--check").status).toBe(0);
    expect(helper.intake("status", helper.missionId).status).toBe(0);
  });

  it("changes when state, amendments, feedback or artifacts change", () => {
    const helper = ledgerFor();
    const baseline = helper.read(path.join("mockups", "index.html"));

    const withFeedback = helper.state();
    const workflows = withFeedback.workflows as Record<string, unknown>[];
    workflows[0].state = "mock_draft";
    workflows[0].feedback = [{ screen_id: "W1-02", text: "Show the failure state." }];
    workflows[0].amendments = [{ id: "W1-A1", status: "approved" }];
    helper.writeState(withFeedback);
    expect(helper.intake("hub", helper.missionId, "--write").status).toBe(0);
    const changed = helper.read(path.join("mockups", "index.html"));
    expect(changed).not.toBe(baseline);
    expect(changed).toContain("W1-A1 (approved), W1-02");
    expect(changed).toContain("0 of 1 done");

    // And when an artifact on disk changes: a third screen in the mockup.
    fs.appendFileSync(
      path.join(helper.ledger, "mockups", "W1-review.html"),
      '\n<span id="W1-03">Another screen</span>\n',
    );
    expect(helper.intake("hub", helper.missionId, "--check").status).toBe(1);
    expect(helper.intake("hub", helper.missionId, "--write").status).toBe(0);
    expect(helper.read(path.join("mockups", "index.html"))).toContain("<td>3</td>");
  });

  it("fails check and status when a required hub is deleted or hand-edited", () => {
    const helper = ledgerFor();
    const hubFile = path.join(helper.ledger, "mockups", "index.html");

    const edited = fs.readFileSync(hubFile, "utf8").replace("1 of 1 done", "9 of 9 done");
    fs.writeFileSync(hubFile, edited);
    const drifted = helper.intake("status", helper.missionId);
    expect(drifted.status).toBe(1);
    expect(drifted.stderr).toContain("differs from the ledger it is generated from");
    expect(helper.intake("check", helper.missionId).status).toBe(1);

    fs.rmSync(hubFile);
    const missing = helper.intake("status", helper.missionId);
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain("mockups/index.html is required");
  });

  it("permits an explicit not-applicable hub for a mission that draws no surfaces", () => {
    const helper = ledgerFor({ missionId: "M-SYNTHETIC-NONVISUAL", visual: false });
    expect(helper.exists(path.join("mockups", "index.html"))).toBe(false);
    expect(helper.intake("status", helper.missionId).status).toBe(0);
    const refused = helper.intake("hub", helper.missionId, "--write");
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain("declares mockup_hub not_applicable");
  });

  it("refuses silence, and refuses not-applicable once mockups exist", () => {
    const helper = ledgerFor({ missionId: "M-SYNTHETIC-NONVISUAL", visual: false });
    const unsaid = helper.state();
    delete unsaid.mockup_hub;
    helper.writeState(unsaid);
    expect(helper.intake("status", helper.missionId).stderr).toContain(
      'mockup_hub must be "generated"',
    );

    fs.writeFileSync(
      path.join(helper.ledger, "mockups", "W1-review.html"),
      "<!doctype html><title>W1</title>",
    );
    const contradicted = helper.state();
    contradicted.mockup_hub = { not_applicable: "This mission draws no surfaces." };
    (contradicted.workflows as Record<string, unknown>[])[0].state = "mock_draft";
    helper.writeState(contradicted);
    expect(helper.intake("status", helper.missionId).stderr).toContain(
      "mockup_hub is not_applicable but workflows have mockups",
    );
  });

  it("keeps the generated decision coverage in step with the ledger", () => {
    const helper = ledgerFor();
    // Prettier aligns the generated table, which is why the artifact is written
    // and compared through the same formatting pipeline.
    expect(helper.read("decision-coverage.md")).toMatch(/\| `D1` +\| `workflow` +\| W1 +\|/);
    const coverageFile = path.join(helper.ledger, "decision-coverage.md");
    fs.writeFileSync(coverageFile, fs.readFileSync(coverageFile, "utf8").replace("D1", "D9"));
    const drifted = helper.intake("status", helper.missionId);
    expect(drifted.status).toBe(1);
    expect(drifted.stderr).toContain("decision-coverage.md differs from the ledger");
  });

  it("keeps generated subject coverage and its amendment batch in step with the ledger", () => {
    const helper = ledgerFor();
    expect(helper.read("subject-coverage.md")).toContain("# Subject coverage — M-SYNTHETIC-INTAKE");
    expect(helper.read("subject-coverage.md")).toContain("M-FUTURE-SYNTHETIC portfolio row");
    const coverageFile = path.join(helper.ledger, "subject-coverage.md");
    fs.writeFileSync(coverageFile, fs.readFileSync(coverageFile, "utf8").replace("S1", "S99"));
    const drifted = helper.intake("status", helper.missionId);
    expect(drifted.status).toBe(1);
    expect(drifted.stderr).toContain("subject-coverage.md differs from the ledger");
  });
});

describe("the approved Events ledger", () => {
  const missionId = "M-EVENTS-CALENDAR-TARGET-STATE";
  const ledger = path.resolve("missions", "intake", missionId);

  it("still resumes unchanged as the closed version 1 record it is", () => {
    const state = JSON.parse(fs.readFileSync(path.join(ledger, "state.json"), "utf8"));
    expect(state.ledger_version).toBeUndefined();
    expect(state.stage).toBe("merged");

    const resumed = spawnSync(
      process.execPath,
      [path.resolve("scripts/intake/cli.mjs"), "status", missionId],
      { cwd: path.resolve("."), encoding: "utf8" },
    );
    expect(resumed.stderr).toBe("");
    expect(resumed.status).toBe(0);
    expect(resumed.stdout).toContain(`Mission intake resume — ${missionId}`);
    expect(resumed.stdout).toContain("W8 · Administer event-type templates: done");
  });
});
