import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findTargets, replaceExact } from "../scripts/intake/lib/edit.mjs";
import { validateFinalPrPaths } from "../scripts/intake/lib/pr.mjs";
import {
  createSyntheticLedger,
  removeLedger,
  type SyntheticLedger,
} from "./helpers/synthetic-intake-ledger";

const open: SyntheticLedger[] = [];
const ledgerFor = () => {
  const helper = createSyntheticLedger();
  open.push(helper);
  expect(helper.intake("coverage", helper.missionId, "--write").status).toBe(0);
  expect(helper.intake("hub", helper.missionId, "--write").status).toBe(0);
  return helper;
};

afterEach(() => {
  for (const helper of open.splice(0)) removeLedger(helper);
});

describe("scripted intake edits", () => {
  it("refuses a zero-match edit rather than silently changing nothing", async () => {
    const helper = ledgerFor();
    const file = path.join(helper.ledger, "workflows", "W1-review.md");
    const before = fs.readFileSync(file, "utf8");
    await expect(
      replaceExact({ file, find: "a phrase that is not there", replace: "x", expect: 1 }),
    ).rejects.toThrow(/Refusing a zero-match edit/);
    expect(fs.readFileSync(file, "utf8")).toBe(before);

    const cli = helper.intake(
      "edit",
      "--file",
      file,
      "--find",
      "a phrase that is not there",
      "--replace",
      "x",
      "--expect",
      "1",
    );
    expect(cli.status).toBe(1);
    expect(cli.stderr).toContain("Refusing a zero-match edit");
  });

  it("refuses an unexpected multi-match edit and names every target", async () => {
    const helper = ledgerFor();
    const file = path.join(helper.ledger, "workflows", "W1-review.md");
    fs.writeFileSync(file, "# W1\n\nsynthetic outcome\n\nsynthetic outcome\n");
    await expect(
      replaceExact({ file, find: "synthetic outcome", replace: "reviewed outcome", expect: 1 }),
    ).rejects.toThrow(/Refusing an unexpected 2-match edit[\s\S]*3:1, 5:1/);
    expect(fs.readFileSync(file, "utf8")).toContain("synthetic outcome");
  });

  it("reports the targets it changed and reloads the formatted artifact", async () => {
    const helper = ledgerFor();
    const file = path.join(helper.ledger, "workflows", "W1-review.md");
    fs.writeFileSync(file, "# W1 — Review synthetic outcome\n\n*   Loose    bullet\n");
    const result = await replaceExact({
      file,
      find: "Loose    bullet",
      replace: "Tidy bullet",
      expect: 1,
    });
    expect(result.targets).toEqual([{ line: 3, column: 5, context: "*   Loose    bullet" }]);
    // Prettier normalised the list marker on read-back, so the bytes on disk are
    // what `npm run format:check` will accept.
    expect(fs.readFileSync(file, "utf8")).toBe(
      "# W1 — Review synthetic outcome\n\n- Tidy bullet\n",
    );
  });

  it("rolls the edit back when the reloaded ledger no longer validates", async () => {
    const helper = ledgerFor();
    const file = path.join(helper.ledger, "state.json");
    const before = fs.readFileSync(file, "utf8");
    const cli = helper.intake(
      "edit",
      "--file",
      file,
      "--find",
      '"stage": "workflows"',
      "--replace",
      '"stage": "invented"',
      "--expect",
      "1",
    );
    expect(cli.status).toBe(1);
    expect(cli.stderr).toContain("rolled back");
    expect(fs.readFileSync(file, "utf8")).toBe(before);
    expect(helper.intake("status", helper.missionId).status).toBe(0);
  });

  it("re-validates the generated artifacts after an accepted ledger edit", () => {
    const helper = ledgerFor();
    const file = path.join(helper.ledger, "state.json");
    // A next_action the hub prints: changing it in state alone leaves the hub
    // stale, and the edit refuses to leave the ledger in that condition.
    const cli = helper.intake(
      "edit",
      "--file",
      file,
      "--find",
      "Assemble the synthetic packet from approved ledger files",
      "--replace",
      "Draft W2",
      "--expect",
      "1",
    );
    expect(cli.status).toBe(1);
    expect(cli.stderr).toContain("differs from the ledger it is generated from");
    expect(helper.intake("status", helper.missionId).status).toBe(0);
  });

  it("locates every occurrence with a 1-based line and column", () => {
    expect(findTargets("alpha\nbeta alpha\n", "alpha")).toEqual([
      { line: 1, column: 1, context: "alpha" },
      { line: 2, column: 6, context: "beta alpha" },
    ]);
  });
});

describe("the final intake pull request", () => {
  const missionId = "M-SYNTHETIC-INTAKE";
  const ledgerAndPacket = [
    `missions/intake/${missionId}/state.json`,
    `missions/intake/${missionId}/mockups/index.html`,
    `missions/packets/${missionId}/packet.json`,
  ];

  it("permits exactly the mission's ledger and packet directories", () => {
    expect(validateFinalPrPaths(missionId, ledgerAndPacket)).toEqual([]);
  });

  it("refuses application code, another mission's artifacts, and a half-landed intake", () => {
    expect(
      validateFinalPrPaths(missionId, [...ledgerAndPacket, "src/app/page.tsx"]).join("\n"),
    ).toMatch(/src\/app\/page.tsx is not an intake artifact/);
    expect(
      validateFinalPrPaths(missionId, [
        ...ledgerAndPacket,
        "missions/packets/M-OTHER/packet.json",
      ]).join("\n"),
    ).toMatch(/missions\/packets\/M-OTHER\/packet.json is not an intake artifact/);
    expect(
      validateFinalPrPaths(missionId, [`missions/packets/${missionId}/packet.json`]).join("\n"),
    ).toMatch(/must land missions\/intake\/M-SYNTHETIC-INTAKE\/\*\*/);
    expect(
      validateFinalPrPaths(missionId, [`missions/intake/${missionId}/state.json`]).join("\n"),
    ).toMatch(/must land missions\/packets\/M-SYNTHETIC-INTAKE\/\*\*/);
    expect(validateFinalPrPaths(missionId, []).join("\n")).toMatch(/must not be empty/);
  });
});
