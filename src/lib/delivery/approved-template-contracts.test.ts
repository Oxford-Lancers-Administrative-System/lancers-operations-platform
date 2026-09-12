// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { buildMessageBody } from "./whatsapp-cloud";
import { MESSAGE_TEMPLATES, TEMPLATE_NAMES, templateNameVariable } from "./templates";
import { createDeliverySink } from "./local-sink";
import type { OutboundConfig } from "./config";
import type { MessageKind, OutboundMessage } from "./provider";

// LAN-335 / LAN-336: positional contracts from the fourteen `_v2_test`
// Utility templates as read back from WhatsApp Manager on 2026-09-11.
const expected = {
  invitation: [["inviteeName", "eventName", "whenLabel", "venue", "deadlineLabel"], 2],
  reminder: [["inviteeName", "eventName", "whenLabel", "venue"], 2],
  nudge: [["inviteeName", "eventName", "whenLabel"], 1],
  change_notice: [["inviteeName", "eventName", "whenLabel", "changeSummary"], 1],
  cancellation: [["inviteeName", "eventName", "whenLabel", "cancellationReason"], 0],
  escalation: [["outstandingCount", "eventName", "whenLabel", "deadlineLabel"], 0],
  recruit_event_followup: [["inviteeName", "eventName", "whenLabel", "venue"], 2],
  recruit_welcome: [["inviteeName", "subject", "openedOn"], 1],
  recruit_details_reminder: [["inviteeName", "subject", "openedOn"], 1],
  recruit_interest_ask: [["inviteeName", "subject", "openedOn"], 1],
  recruit_interest_reminder: [["inviteeName", "subject", "openedOn"], 1],
  onboarding_welcome: [["inviteeName", "subject", "openedOn"], 1],
  onboarding_chase: [["inviteeName", "subject", "openedOn"], 1],
  onboarding_chase_escalation: [["outstandingCount"], 0],
} as const;
const config: OutboundConfig = {
  appBaseUrl: "https://club.example",
  defaultCallingCode: "44",
  graphBaseUrl: "https://graph.facebook.com",
  graphVersion: "v26.0",
  phoneNumberId: "12345",
  accessToken: "test-placeholder",
  templateName: TEMPLATE_NAMES.invitation,
  templateLanguage: "en_GB",
  recipientAllowlist: ["447700900001"],
  templateParameters: "invitation",
  localTest: { recipientOverride: null, messageMode: "template" },
};
const message: OutboundMessage = {
  recipient: "447700900001",
  inviteeName: "Synthetic Player",
  eventName: "Practice",
  whenLabel: "Tuesday at 6 pm",
  venue: "Training ground",
  deadlineLabel: "Monday at 6 pm",
  attendingCount: 0,
  outstandingCount: 3,
  changeSummary: "Venue changed",
  cancellationReason: "Private cancellation reason must not enter the WhatsApp payload",
  rsvpUrl: "https://club.example/rsvp/rsvp-token",
  yesUrl: "https://club.example/a/yes/y.token",
  noUrl: "https://club.example/a/no/n.token",
  formUrl: "https://club.example/me/person-token",
  stopUrl: "https://club.example/me/stop/person-token",
  queueUrl:
    "https://club.example/operate/admin/follow-ups?event=11111111-1111-4111-8111-111111111111",
};
type Payload = {
  template: { components: { type: string; index?: string; parameters: { text: string }[] }[] };
};
describe("owner-submitted WhatsApp contracts", () => {
  beforeEach(() => {
    for (const kind of Object.keys(expected) as MessageKind[])
      vi.stubEnv(templateNameVariable(kind), TEMPLATE_NAMES[kind]);
  });
  afterEach(() => vi.unstubAllEnvs());
  for (const kind of Object.keys(expected) as MessageKind[]) {
    it(`${kind}: exact body order and indexed buttons, accepted by the sink`, async () => {
      const [names, count] = expected[kind];
      expect(MESSAGE_TEMPLATES[kind].parameterNames).toEqual(names);
      const payload = buildMessageBody(config, { ...message, kind }) as Payload;
      const body = payload.template.components.filter((c) => c.type === "body");
      expect(body).toHaveLength(names.length ? 1 : 0);
      expect(body[0]?.parameters ?? []).toHaveLength(names.length);
      const buttons = payload.template.components.filter((c) => c.type === "button");
      expect(buttons.map((b) => b.index)).toEqual(
        Array.from({ length: count }, (_, i) => String(i)),
      );
      for (const c of payload.template.components)
        for (const p of c.parameters) expect(p.text.trim()).not.toBe("");
      // LAN-335: both escalations carry their queue URL hardcoded in the
      // approved body. Meta refuses a body variable holding a URL, so the
      // payload must never carry `queueUrl` — and, as before, never a name.
      if (kind === "escalation" || kind === "onboarding_chase_escalation") {
        expect(JSON.stringify(payload)).not.toContain(message.queueUrl);
        expect(JSON.stringify(payload)).not.toContain(message.inviteeName);
      }
      if (kind === "invitation" || kind === "reminder" || kind === "recruit_event_followup") {
        expect(buttons.map((b) => b.parameters[0].text)).toEqual(["y.token", "n.token"]);
      }
      const sink = createDeliverySink(
        { APP_BASE_URL: "http://localhost:3000" },
        { write: () => {} },
      );
      const send = (p: unknown) =>
        sink("https://graph.facebook.com/v26.0/12345/messages", {
          method: "POST",
          body: JSON.stringify(p),
        });
      expect((await send(payload)).status).toBe(200);
      const extra = structuredClone(payload);
      extra.template.components.push({
        type: "button",
        index: String(count),
        parameters: [{ text: "extra" }],
      });
      expect((await send(extra)).status).toBe(400);
    });
  }
});
