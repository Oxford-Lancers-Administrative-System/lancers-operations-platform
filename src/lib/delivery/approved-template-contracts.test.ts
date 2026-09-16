// @vitest-environment node
/**
 * The fourteen production contracts, pinned — LAN-348.
 *
 * `templates.test.ts` beside this one proves the registry is self-consistent:
 * that each kind renders as many parameters as it declares, in the order it
 * declares them. That is not the same as proving the registry matches what the
 * club actually created at Meta, and only the second one keeps a real message
 * deliverable.
 *
 * So this file restates each approved template's positional contract as flat
 * data — copied from the submission records, not derived from the registry —
 * and asserts the payload the adapter builds against it end to end, through the
 * local sink that stands in for Meta. A parameter added, removed or reordered
 * in `templates.ts` fails here even though the registry would still agree with
 * itself, and a button count that drifts from the approved template fails with
 * it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { buildMessageBody } from "./whatsapp-cloud";
import { MESSAGE_TEMPLATES, TEMPLATE_NAMES, templateNameVariable } from "./templates";
import { createDeliverySink } from "./local-sink";
import type { OutboundConfig } from "./config";
import type { MessageKind, OutboundMessage } from "./provider";

/**
 * Body parameters in order, and the number of indexed URL buttons, for each of
 * the fourteen Utility templates approved on the club's WhatsApp Business
 * Account — thirteen `_v2` and, since LAN-348's rebuild, one `_v3`.
 *
 * The invitation's `2` below is the reason that rebuild happened at all: the
 * approved `lancers_event_invitation_v2` carries one button, not two, and Meta
 * will not let buttons be edited on an approved template.
 */
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
  templateLanguage: "en",
  templateParameters: "invitation",
  localTest: { recipientOverride: null, messageMode: "template" },
};

/**
 * One message carrying every link LAN-343 mints, each at its own route. The
 * final path segment is what the adapter sends as a button's dynamic suffix,
 * so the segments are distinguishable per route on purpose.
 */
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
  rsvpUrl: "https://club.example/rsvp/rsvp.token",
  questionsUrl: "https://club.example/questions/questions.token",
  yesUrl: "https://club.example/a/yes/y.token",
  noUrl: "https://club.example/a/no/n.token",
  formUrl: "https://club.example/onboarding/form.token",
  stopUrl: "https://club.example/stop/stop.token",
  queueUrl:
    "https://club.example/operate/admin/follow-ups?event=11111111-1111-4111-8111-111111111111",
};

type Payload = {
  template: { components: { type: string; index?: string; parameters: { text: string }[] }[] };
};

describe("the approved production WhatsApp contracts", () => {
  beforeEach(() => {
    for (const kind of Object.keys(expected) as MessageKind[])
      vi.stubEnv(templateNameVariable(kind), TEMPLATE_NAMES[kind]);
  });
  afterEach(() => vi.unstubAllEnvs());

  for (const kind of Object.keys(expected) as MessageKind[]) {
    it(`${kind}: exact body order and indexed buttons, accepted by the sink`, async () => {
      const [names, count] = expected[kind];
      expect(MESSAGE_TEMPLATES[kind].parameterNames).toEqual(names);
      expect(MESSAGE_TEMPLATES[kind].buttonCount ?? 0).toBe(count);

      const payload = buildMessageBody(config, { ...message, kind }) as Payload;
      const body = payload.template.components.filter((c) => c.type === "body");
      expect(body).toHaveLength(names.length ? 1 : 0);
      expect(body[0]?.parameters ?? []).toHaveLength(names.length);
      const buttons = payload.template.components.filter((c) => c.type === "button");
      expect(buttons.map((b) => b.index)).toEqual(
        Array.from({ length: count }, (_, i) => String(i)),
      );
      // Meta renders an empty parameter as literal nothing rather than
      // refusing it, so a blank slot is a delivered message with a hole in it.
      for (const component of payload.template.components)
        for (const parameter of component.parameters) expect(parameter.text.trim()).not.toBe("");

      // Both escalations carry their queue URL hardcoded in the approved body,
      // because Meta refuses a body variable holding a URL. The payload must
      // therefore never carry `queueUrl` — and, on `T03-no-personal-data`,
      // never a name either.
      if (kind === "escalation" || kind === "onboarding_chase_escalation") {
        expect(JSON.stringify(payload)).not.toContain(message.queueUrl);
        expect(JSON.stringify(payload)).not.toContain(message.inviteeName);
      }
      // LAN-372: no message to a roster player carries a Stop link. No
      // WhatsApp template ever did (Meta will not classify one as Utility),
      // and the onboarding email bodies stopped carrying one on 2026-09-16 —
      // asserted here on the payload as well, so neither half can drift back.
      if (kind === "onboarding_welcome" || kind === "onboarding_chase") {
        expect(JSON.stringify(payload)).not.toContain(message.stopUrl);
        expect(MESSAGE_TEMPLATES[kind].body({ ...message, kind }).join("\n")).not.toContain(
          message.stopUrl,
        );
      }

      // The three two-button templates send the Yes token at index 0 and the No
      // token at index 1. Swapping them delivers cleanly and answers backwards.
      if (kind === "invitation" || kind === "reminder" || kind === "recruit_event_followup") {
        expect(buttons.map((b) => b.parameters[0].text)).toEqual(["y.token", "n.token"]);
      }

      const sink = createDeliverySink(
        { APP_BASE_URL: "http://localhost:3000" },
        { write: () => {} },
      );
      const send = (candidate: unknown) =>
        sink("https://graph.facebook.com/v26.0/12345/messages", {
          method: "POST",
          body: JSON.stringify(candidate),
        });
      expect((await send(payload)).status).toBe(200);

      // One more button than the approved template has a slot for is `132000`
      // at Meta. It fails here instead.
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
