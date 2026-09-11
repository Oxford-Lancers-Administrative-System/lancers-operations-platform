// @vitest-environment node
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { responsePlans } from "../scripts/test-box/progression.mjs";
import { validatePersonSettings, writePanelState } from "../scripts/test-box/panel-state.mjs";

describe("LAN-297 manual forms and automatic event responses", () => {
  it("plans delivered event responses while leaving onboarding and recruitment forms manual", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lancers-response-scope-"));
    try {
      const person = { id: "synthetic-person", name: "Synthetic Player", phone: "447700900201" };
      writePanelState(dir, {
        version: 1,
        people: {
          [person.id]: validatePersonSettings(
            { identity: "synthetic", responder: "prompt", completion: "all" },
            person,
          ),
        },
        clock: null,
      });
      fs.mkdirSync(path.join(dir, "transport-evidence"));
      fs.mkdirSync(path.join(dir, "simulated-receipts"));
      const kinds = [
        "invitation",
        "reminder",
        "recruit_event_follow_up",
        "onboarding_welcome",
        "onboarding_chase",
        "recruit_welcome",
        "recruit_interest",
        "recruit_follow_up",
        "cancellation",
        "escalation",
      ];
      for (const kind of kinds) {
        const record = {
          kind,
          personId: person.id,
          providerMessageId: kind,
          transport: "intercepted",
          simulatedOutcome: "delivered",
          at: "2026-09-10T12:00:00Z",
          payload: {
            Body: "Oxford Lancers: test.\nYes: https://x/a/y.synthetic\nNo: https://x/a/n.synthetic",
          },
        };
        fs.writeFileSync(
          path.join(dir, "transport-evidence", kind + ".json"),
          JSON.stringify(record),
        );
        fs.writeFileSync(
          path.join(
            dir,
            "simulated-receipts",
            crypto.createHash("sha256").update(kind).digest("hex") + ".json",
          ),
          "{}",
        );
      }
      expect(
        responsePlans(dir, [person])
          .map((p) => p.kind)
          .sort(),
      ).toEqual(["invitation", "recruit_event_follow_up", "reminder"]);
      fs.rmSync(path.join(dir, "simulated-receipts"), { recursive: true });
      expect(responsePlans(dir, [person])).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
