// @vitest-environment node
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { responsePlans } from "../scripts/test-box/progression.mjs";
import { validatePersonSettings, writePanelState } from "../scripts/test-box/panel-state.mjs";

const person = { id: "synthetic-person", name: "Synthetic Player", phone: "447700900201" };
const NONCE = "n".repeat(43);
/** The real button-token shape: `y.<invitationId>.<nonce>`. */
const token = (answer: "y" | "n", invitation: string) => `${answer}.${invitation}.${NONCE}`;
const hash = (id: string) => crypto.createHash("sha256").update(id).digest("hex");

function environment(
  settings: Record<string, unknown>,
  captures: { id: string; kind: string; invitation: string; at: string; buttons?: 1 | 2 }[],
) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lancers-response-scope-"));
  writePanelState(dir, {
    version: 1,
    people: { [person.id]: validatePersonSettings(settings, person) },
    clock: null,
  });
  fs.mkdirSync(path.join(dir, "transport-evidence"));
  fs.mkdirSync(path.join(dir, "simulated-receipts"));
  for (const capture of captures) {
    fs.writeFileSync(
      path.join(dir, "transport-evidence", capture.id + ".json"),
      JSON.stringify({
        kind: capture.kind,
        personId: person.id,
        providerMessageId: capture.id,
        transport: "intercepted",
        simulatedOutcome: "delivered",
        at: capture.at,
        testAt: capture.at,
        actualAt: capture.at,
        payload: {
          template: {
            components: [
              {
                type: "button",
                index: 0,
                parameters: [{ text: token("y", capture.invitation) }],
              },
              ...((capture.buttons ?? 2) === 2
                ? [
                    {
                      type: "button",
                      index: 1,
                      parameters: [{ text: token("n", capture.invitation) }],
                    },
                  ]
                : []),
            ],
          },
        },
      }),
    );
    fs.writeFileSync(path.join(dir, "simulated-receipts", hash(capture.id) + ".json"), "{}");
  }
  return dir;
}

describe("LAN-297 manual forms and automatic event responses", () => {
  it("plans delivered event responses while leaving onboarding and recruitment forms manual", () => {
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
    const dir = environment(
      { identity: "synthetic", responder: "prompt", completion: "all" },
      // Each kind stands for a different invitation here, so this case measures
      // which kinds may be answered at all and not LAN-298's per-invitation rule.
      kinds.map((kind, index) => ({
        id: kind,
        kind,
        invitation: `00000000-0000-4000-8000-0000000000${String(index).padStart(2, "0")}`,
        at: "2026-09-10T12:00:00Z",
      })),
    );
    try {
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

describe("LAN-298 one answer per invitation", () => {
  const invitation = "11111111-1111-4111-8111-111111111111";
  const ladder = [
    { id: "invite", kind: "invitation", invitation, at: "2026-09-10T12:00:00Z" },
    { id: "remind", kind: "reminder", invitation, at: "2026-09-11T12:00:00Z" },
    { id: "chase", kind: "recruit_event_follow_up", invitation, at: "2026-09-12T12:00:00Z" },
  ];

  it("answers once from the first capture, whatever arrives for the same invitation after it", () => {
    const dir = environment(
      { identity: "synthetic", responder: "late", delayHours: 30, completion: "all" },
      ladder,
    );
    try {
      const plans = responsePlans(dir, [person]);
      expect(plans).toHaveLength(1);
      expect(plans[0]).toMatchObject({
        id: hash("invite"),
        kind: "invitation",
        stage: "first",
        answer: "yes",
        token: token("y", invitation),
        // 30 hours after the first delivered capture, not after each of them.
        at: "2026-09-11T18:00:00.000Z",
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reads an invitation an earlier run already answered as answered", () => {
    const dir = environment(
      { identity: "synthetic", responder: "late", delayHours: 30, completion: "all" },
      ladder,
    );
    try {
      // The old behaviour recorded the duplicate against the reminder's capture.
      fs.mkdirSync(path.join(dir, "responses"));
      fs.writeFileSync(
        path.join(dir, "responses", hash("remind") + ".json"),
        JSON.stringify({ status: "completed", action: "Event yes; 2 question answers" }),
      );
      const plans = responsePlans(dir, [person]);
      expect(plans).toHaveLength(1);
      expect(plans[0].result).toMatchObject({ status: "completed" });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("adds one labelled change of answer only when repeat answering is selected", () => {
    const dir = environment(
      {
        identity: "synthetic",
        responder: "late",
        delayHours: 30,
        completion: "all",
        eventAnswer: "yes",
        repeat: "after_reminder",
      },
      ladder,
    );
    try {
      const plans = responsePlans(dir, [person]);
      expect(plans).toHaveLength(2);
      expect(plans[0]).toMatchObject({
        stage: "first",
        answer: "yes",
        at: "2026-09-11T18:00:00.000Z",
      });
      // The change follows the first reminder only: the later follow-up for the
      // same invitation adds nothing, so one opt-in is one change of mind.
      expect(plans[1]).toMatchObject({
        id: hash("remind"),
        kind: "reminder",
        stage: "change",
        answer: "no",
        token: token("n", invitation),
        at: "2026-09-12T18:00:00.000Z",
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses repeat answering for a person who does not respond", () => {
    expect(() =>
      validatePersonSettings(
        { identity: "synthetic", responder: "never", repeat: "after_reminder" },
        person,
      ),
    ).toThrow("change its answer");
    expect(() =>
      validatePersonSettings(
        { identity: "synthetic", responder: "late", repeat: "sometimes" },
        person,
      ),
    ).toThrow("displayed person settings");
  });
});
