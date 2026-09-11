// @vitest-environment node
/**
 * The SMS budget. LAN-330.
 *
 * Every kind is rendered with fixed sample data on the production host and
 * real-length tokens, then measured. Two properties are enforced: no
 * character outside GSM-7 anywhere, and no kind at three segments. The
 * measured table is printed so the PR can record it verbatim.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { MessageKind, OutboundMessage } from "./provider";
import { measureSms } from "./sms-segments";
import { MESSAGE_KINDS, MESSAGE_TEMPLATES } from "./templates";

const HOST = "https://app.oxfordlancers.com";
const UUID = "11111111-1111-4111-8111-111111111111";
const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcdefg"; // 43 characters

function sample(kind: MessageKind): OutboundMessage {
  return {
    kind,
    recipient: "447700900001",
    inviteeName: "Sam",
    eventName: "Thursday practice",
    whenLabel: "Thu 18 Sep 19:00",
    venue: "Iffley Road",
    deadlineLabel: "Wed 17 Sep",
    rsvpUrl: `${HOST}/rsvp/${TOKEN}`,
    yesUrl: `${HOST}/a/y.${UUID}.${TOKEN}`,
    noUrl: `${HOST}/a/n.${UUID}.${TOKEN}`,
    attendingCount: 8,
    changeSummary: "Moved to 20:00.",
    cancellationReason: "Pitch waterlogged.",
    outstandingCount: 6,
    queueUrl:
      kind === "onboarding_chase_escalation"
        ? `${HOST}/operate/people/missing`
        : `${HOST}/operate/admin/follow-ups?event=${UUID}`,
    formUrl: kind.startsWith("recruit") ? `${HOST}/me/join/${TOKEN}` : `${HOST}/me/${TOKEN}`,
    stopUrl: `${HOST}/me/stop/${TOKEN}`,
  };
}

const measured = MESSAGE_KINDS.map((kind) => {
  const body = MESSAGE_TEMPLATES[kind].sms(sample(kind));
  return { kind, body, ...measureSms(body) };
});

describe("the fourteen texts", () => {
  it("prints the measured table for the PR", () => {
    const rows = measured.map(
      (m) => `| ${m.kind} | ${m.characters} | ${m.units} | ${m.segments} | ${m.encoding} |`,
    );
    console.log(
      [
        "| kind | characters | GSM-7 units | segments | encoding |",
        "|---|---|---|---|---|",
        ...rows,
      ].join("\n"),
    );
    console.log(measured.map((m) => `--- ${m.kind}\n${m.body}`).join("\n\n"));
    expect(measured).toHaveLength(14);
  });

  it.each(measured)("$kind uses only GSM-7 characters", ({ offenders, encoding }) => {
    expect(offenders).toEqual([]);
    expect(encoding).toBe("gsm7");
  });

  it.each(measured)("$kind never reaches a third segment", ({ segments }) => {
    expect(segments).toBeLessThanOrEqual(2);
  });

  it.each(measured)("$kind starts with the sender name", ({ body }) => {
    expect(body.startsWith("Oxford Lancers:")).toBe(true);
  });

  it("puts every link on its own line with a label, and Stop only on recruit kinds", () => {
    for (const m of measured) {
      const lines = m.body.split("\n").slice(1);
      for (const line of lines) expect(line, m.kind).toMatch(/^(?:[A-Za-z ]+: )?https:\/\/\S+$/);
      const hasStop = /\nStop: /.test(m.body);
      expect(hasStop, m.kind).toBe(
        [
          "recruit_welcome",
          "recruit_details_reminder",
          "recruit_interest_ask",
          "recruit_interest_reminder",
        ].includes(m.kind),
      );
    }
  });

  it("carries Yes and No links where the template had buttons", () => {
    for (const kind of ["invitation", "reminder", "recruit_event_followup"] as const) {
      const body = MESSAGE_TEMPLATES[kind].sms(sample(kind));
      expect(body).toMatch(/\nYes: https:\/\/\S+\/a\/y\./);
      expect(body).toMatch(/\nNo: https:\/\/\S+\/a\/n\./);
    }
  });

  it("keeps the cancellation's private reason and the escalation's names out", () => {
    expect(MESSAGE_TEMPLATES.cancellation.sms(sample("cancellation"))).not.toContain("waterlogged");
    const escalation = MESSAGE_TEMPLATES.escalation.sms(sample("escalation"));
    expect(escalation).not.toContain("Sam");
    expect(
      MESSAGE_TEMPLATES.onboarding_chase_escalation.sms(sample("onboarding_chase_escalation")),
    ).not.toContain("Sam");
  });
});
