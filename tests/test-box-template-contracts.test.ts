// @vitest-environment node
/**
 * The fourteen test templates, pinned to the sender main actually has — LAN-349.
 *
 * `src/lib/delivery/approved-template-contracts.test.ts` pins the *production*
 * contracts. The test box sends the same payloads to different template names:
 * `configure.mjs` derives a `_v2_test`/`_v3_test` name per kind and writes it
 * into `.env.local` as that kind's `WHATSAPP_TEMPLATE_*` override, and those
 * fourteen names are the only ones approved on the club's test WhatsApp
 * Business Account.
 *
 * Two things can therefore be true at once and still break a real send: the
 * registry can agree with production, and the box can be pointed at a name Meta
 * has never seen — which is exactly what happened when production moved to
 * `_v2` and `_v3` (LAN-348) while the derivation still stripped `_v1`.
 *
 * So this builds each kind's payload the way the adapter does, under the box's
 * own overrides, and asserts three things against the checked-in submission
 * records in `scripts/test-box/templates-test.json`: the name sent is the
 * approved test name, the body carries exactly the parameters that template
 * declares, and the buttons match its approved button count. Each payload then
 * goes through the local sink, which validates it against main's registry the
 * way Meta validates against the approved template.
 */
import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { buildMessageBody } from "../src/lib/delivery/whatsapp-cloud";
import {
  MESSAGE_TEMPLATES,
  TEMPLATE_NAMES,
  templateNameVariable,
} from "../src/lib/delivery/templates";
import { createDeliverySink } from "../src/lib/delivery/local-sink";
import type { OutboundConfig } from "../src/lib/delivery/config";
import type { MessageKind, OutboundMessage } from "../src/lib/delivery/provider";
import { testTemplateName } from "../scripts/test-box/configure.mjs";

interface SubmissionRecord {
  readonly name: string;
  readonly kind: MessageKind;
  readonly category: string;
  readonly samples: readonly { slot: string; meaning: string }[];
  readonly buttons?: readonly { label: string; url: string }[];
}

const records: readonly SubmissionRecord[] = JSON.parse(
  fs.readFileSync("scripts/test-box/templates-test.json", "utf8"),
);

/**
 * Exactly the environment `configure.mjs --sink` writes: one
 * `WHATSAPP_TEMPLATE_*` override per kind, derived from the production name.
 * The sink resolves a name to a kind through this, so passing it is what makes
 * the validator judge the box's payloads rather than production's.
 */
const source: Record<string, string> = {
  APP_BASE_URL: "http://localhost:3101",
  ...Object.fromEntries(
    (Object.keys(TEMPLATE_NAMES) as MessageKind[]).map((kind) => [
      templateNameVariable(kind),
      testTemplateName(TEMPLATE_NAMES[kind]),
    ]),
  ),
};

const config: OutboundConfig = {
  appBaseUrl: "http://localhost:3101",
  defaultCallingCode: "44",
  graphBaseUrl: "https://graph.facebook.com",
  graphVersion: "v26.0",
  phoneNumberId: "local-stub",
  accessToken: "local-stub-not-a-secret",
  // `templateNameFor` reads the invitation from the resolved configuration,
  // never from an override — `WHATSAPP_TEMPLATE_NAME` is already required, and
  // that is the variable `configure.mjs` writes the invitation's test name to.
  templateName: testTemplateName(TEMPLATE_NAMES.invitation),
  templateLanguage: "en",
  templateParameters: "invitation",
  localTest: { recipientOverride: null, messageMode: "template" },
};

/** One message carrying every link the sender can mint, each at its own route. */
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
  rsvpUrl: "http://localhost:3101/rsvp/rsvp.token",
  questionsUrl: "http://localhost:3101/questions/questions.token",
  yesUrl: "http://localhost:3101/a/yes/y.token",
  noUrl: "http://localhost:3101/a/no/n.token",
  formUrl: "http://localhost:3101/onboarding/form.token",
  stopUrl: "http://localhost:3101/stop/stop.token",
  queueUrl: "http://localhost:3101/operate/admin/follow-ups",
};

type Payload = {
  template: {
    name: string;
    components: { type: string; index?: string; parameters: { text: string }[] }[];
  };
};

describe("the fourteen approved test templates the box sends", () => {
  beforeEach(() => {
    // Exactly what `configure.mjs --sink` writes into `.env.local`.
    for (const record of records)
      vi.stubEnv(templateNameVariable(record.kind), testTemplateName(TEMPLATE_NAMES[record.kind]));
  });
  afterEach(() => vi.unstubAllEnvs());

  it("covers every kind in the registry, once each", () => {
    expect(records.map((record) => record.kind).sort()).toEqual(Object.keys(TEMPLATE_NAMES).sort());
    // Meta blocks Marketing templates to US numbers; the box tests US handsets.
    expect(new Set(records.map((record) => record.category))).toEqual(new Set(["UTILITY"]));
  });

  for (const record of records) {
    it(`${record.kind}: sends ${record.name}, and the sink accepts it`, async () => {
      const payload = buildMessageBody(config, { ...message, kind: record.kind }) as Payload;

      expect(payload.template.name).toBe(record.name);

      const body = payload.template.components.filter((component) => component.type === "body");
      expect(body[0]?.parameters ?? []).toHaveLength(record.samples.length);
      // The submitted slot order is the meaning order the registry declares.
      expect(record.samples.map((sample) => sample.meaning)).toEqual([
        ...MESSAGE_TEMPLATES[record.kind].parameterNames,
      ]);

      const buttons = payload.template.components.filter(
        (component) => component.type === "button",
      );
      expect(buttons.map((button) => button.index)).toEqual(
        (record.buttons ?? []).map((_, index) => String(index)),
      );
      // Meta renders an empty parameter as literal nothing rather than
      // refusing it, so a blank slot is a delivered message with a hole in it.
      for (const component of payload.template.components)
        for (const parameter of component.parameters) expect(parameter.text.trim()).not.toBe("");

      const sink = createDeliverySink(source, { write: () => {} });
      const response = await sink("https://graph.facebook.com/v26.0/local-stub/messages", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      expect(response.status).toBe(200);
    });
  }
});
