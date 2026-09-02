/**
 * The local delivery sink — LAN-169.
 *
 * ## The test this file exists for
 *
 * "The local sink is unreachable from a deployed runtime, proved by test."
 *
 * That claim cannot be proved by an integration test, because an integration
 * test runs locally and a locally-selected sink is exactly what it would find.
 * It is proved here instead, the way `runtime-target.test.ts` proves the
 * database policy: with a fully populated, deployed-looking environment, and by
 * asserting that **no** variable in it changes the answer.
 *
 * The rest of the file asserts the sink's other job — that it validates against
 * the declared template registry and rejects a mismatch the way Meta would,
 * rather than accepting anything and letting a parameter reordering reach the
 * club.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { CLOUD_RUN_SERVICE } from "@/lib/db/runtime-target";

import { createDeliverySink, selectDeliverySink, type SinkRecord } from "./local-sink";
import { TEMPLATE_NAMES } from "./templates";

const GRAPH = "https://graph.facebook.com/v26.0/1234567890/messages";
const EMAILS = "https://api.resend.com/emails";

/** A local environment with every sink affordance turned on. */
const LOCAL = {
  APP_BASE_URL: "http://localhost:3000",
  DELIVERY_SINK_FAILURES: "447700900999",
};

/**
 * A deployed environment carrying every variable that could plausibly be
 * mistaken for a switch — including the ones the sink itself reads.
 */
const DEPLOYED = {
  K_SERVICE: CLOUD_RUN_SERVICE,
  APP_BASE_URL: "https://lancers.example",
  DELIVERY_SINK_FAILURES: "447700900999",
  DELIVERY_SINK: "on",
  NODE_ENV: "development",
  WHATSAPP_MESSAGE_MODE: "text",
};

/** The two Yes/No button components `invitation` and `reminder` now declare. */
function answerButtons(): Record<string, unknown>[] {
  return [
    {
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: "y.token" }],
    },
    {
      type: "button",
      sub_type: "url",
      index: "1",
      parameters: [{ type: "text", text: "n.token" }],
    },
  ];
}

function templateBody(
  name: string,
  parameters: string[],
  extraComponents: Record<string, unknown>[] = answerButtons(),
): string {
  return JSON.stringify({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: "447700900001",
    type: "template",
    template: {
      name,
      language: { code: "en_GB" },
      components: [
        { type: "body", parameters: parameters.map((text) => ({ type: "text", text })) },
        ...extraComponents,
      ],
    },
  });
}

// LAN-172: the invitation's body carries three parameters now — the link left
// body copy entirely and travels on the two buttons `answerButtons()` adds.
const THREE = ["Jamie", "Michaelmas week 3", "Wednesday 14 October, 20:00"];

function collecting() {
  const written: SinkRecord[] = [];
  return {
    written,
    sink: createDeliverySink(LOCAL, { write: (record) => written.push(record) }),
  };
}

describe("a deployed runtime cannot reach the sink", () => {
  it("gets nothing, with every sink variable set", () => {
    expect(selectDeliverySink(DEPLOYED)).toBeNull();
  });

  it("gets nothing however the environment is widened", () => {
    // One variable at a time, so a future branch that honoured any of them
    // fails here rather than in production. There is deliberately no third
    // branch in `selectDeliverySink` for one of these to reach.
    for (const [name, value] of Object.entries({
      DELIVERY_SINK: "true",
      DELIVERY_SINK_ENABLED: "1",
      WHATSAPP_ALLOW_FREE_FORM: "true",
      WHATSAPP_TEST_RECIPIENT: "447700900001",
      EMAIL_TEST_RECIPIENT: "someone@example.com",
      NODE_ENV: "test",
    })) {
      expect(selectDeliverySink({ ...DEPLOYED, [name]: value }), name).toBeNull();
    }
  });

  it("gets nothing on a non-loopback base URL even outside Cloud Run", () => {
    // The base URL is the address the application tells the world to visit, so
    // a deployment that has one cannot also be a loopback deployment — whether
    // or not `K_SERVICE` happens to be set.
    expect(selectDeliverySink({ APP_BASE_URL: "https://lancers.example" })).toBeNull();
    // And the near-miss that a string match would have let through.
    expect(selectDeliverySink({ APP_BASE_URL: "https://localhost.example.com" })).toBeNull();
  });

  it("is selected only for a local runtime on a loopback address", () => {
    expect(selectDeliverySink(LOCAL)).not.toBeNull();
    expect(selectDeliverySink({ APP_BASE_URL: "http://127.0.0.1:3000" })).not.toBeNull();
  });
});

describe("validating against the declared registry", () => {
  it("accepts the real Graph payload and answers in Meta's shape", async () => {
    const { sink, written } = collecting();

    const response = await sink(GRAPH, {
      method: "POST",
      body: templateBody(TEMPLATE_NAMES.invitation, THREE),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      messaging_product: string;
      messages: { id: string }[];
    };
    expect(body.messaging_product).toBe("whatsapp");
    // A real `wamid.`, because `delivery_attempts` matches a callback on it and
    // a made-up shape would make local callback matching prove nothing.
    expect(body.messages[0].id).toMatch(/^wamid\./);

    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ channel: "whatsapp", kind: "invitation" });
  });

  it("refuses a parameter count the template does not declare, as Meta would", async () => {
    const { sink } = collecting();

    const response = await sink(GRAPH, {
      method: "POST",
      body: templateBody(TEMPLATE_NAMES.invitation, THREE.slice(0, 2)),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: number; message: string } };
    // Meta's own code for "the parameters do not match the template". A sink
    // that accepted this would let a reordering pass every local test and fail
    // for the first time in front of the club.
    expect(body.error.code).toBe(132_000);
    expect(body.error.message).toContain("3 body parameters");
  });

  it("refuses a template nobody has declared", async () => {
    const { sink } = collecting();
    const response = await sink(GRAPH, {
      method: "POST",
      body: templateBody("some_template_we_invented", THREE),
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: { code: number } }).error.code).toBe(132_001);
  });

  it("refuses a blank parameter", async () => {
    const { sink } = collecting();
    const response = await sink(GRAPH, {
      method: "POST",
      body: templateBody(TEMPLATE_NAMES.invitation, ["Michaelmas week 3", "", "deadline"]),
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: { message: string } }).error.message).toContain(
      "whenAndVenue",
    );
  });

  it("refuses a button missing its dynamic URL suffix", async () => {
    const { sink } = collecting();
    const response = await sink(GRAPH, {
      method: "POST",
      body: templateBody(TEMPLATE_NAMES.invitation, THREE, [
        {
          type: "button",
          sub_type: "url",
          index: "0",
          parameters: [{ type: "text", text: "y.token" }],
        },
        // Button 1 (No) is missing entirely — Meta would refuse this exactly
        // as it refuses a missing body parameter.
      ]),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: number; message: string } };
    expect(body.error.code).toBe(132_000);
    expect(body.error.message).toContain("button 1");
  });

  it("refuses a Quick Reply where a URL button was declared", async () => {
    const { sink } = collecting();
    const response = await sink(GRAPH, {
      method: "POST",
      body: templateBody(TEMPLATE_NAMES.invitation, THREE, [
        {
          type: "button",
          sub_type: "quick_reply",
          index: "0",
          parameters: [{ type: "payload", payload: "yes" }],
        },
        {
          type: "button",
          sub_type: "url",
          index: "1",
          parameters: [{ type: "text", text: "n.token" }],
        },
      ]),
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: { message: string } }).error.message).toContain(
      "Quick Reply",
    );
  });

  it("accepts the parameterless shape, which is the absent components key", async () => {
    // `hello_world` and anything else declaring no body parameters. Meta wants
    // the key absent rather than present and empty, and the sink recognises the
    // same thing `buildMessageBody` builds.
    const { sink } = collecting();
    const response = await sink(GRAPH, {
      method: "POST",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: "447700900001",
        type: "template",
        template: { name: TEMPLATE_NAMES.invitation, language: { code: "en_GB" } },
      }),
    });
    expect(response.status).toBe(200);
  });

  it("refuses a recipient that is not E.164 digits", async () => {
    const { sink } = collecting();
    const response = await sink(GRAPH, {
      method: "POST",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: "+44 7700 900001",
        type: "template",
        template: { name: TEMPLATE_NAMES.invitation, language: { code: "en_GB" } },
      }),
    });
    expect(response.status).toBe(400);
  });
});

describe("email payloads", () => {
  it("accepts a rendered email and answers with an identifier", async () => {
    const { sink, written } = collecting();
    const response = await sink(EMAILS, {
      method: "POST",
      body: JSON.stringify({
        from: "Oxford Lancers <events@lancers.example>",
        to: ["jamie@example.com"],
        subject: "Action required",
        text: "The club still needs your answer.",
      }),
    });

    expect(response.status).toBe(200);
    expect(((await response.json()) as { id: string }).id).toBeTruthy();
    expect(written[0]).toMatchObject({ channel: "email", recipient: "jamie@example.com" });
  });

  it("refuses an email with no body", async () => {
    const { sink } = collecting();
    const response = await sink(EMAILS, {
      method: "POST",
      body: JSON.stringify({ from: "a@b.example", to: ["c@d.example"], subject: "Hi" }),
    });
    expect(response.status).toBe(422);
  });
});

describe("failing on demand", () => {
  it("refuses a named recipient, so a delivery failure can be reviewed", async () => {
    // W6 is unreviewable without this: "a genuine failure" and "a WhatsApp
    // failure that email then carried" are both states somebody has to look at,
    // and neither can be produced by a sink that always succeeds.
    const { sink } = collecting();
    const response = await sink(GRAPH, {
      method: "POST",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: "447700900999",
        type: "template",
        template: { name: TEMPLATE_NAMES.invitation, language: { code: "en_GB" } },
      }),
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: { code: number } }).error.code).toBe(131_047);
  });
});

describe("anything the sink does not serve", () => {
  it("is refused rather than passed through to the network", async () => {
    // A sink that forwarded what it did not understand would be a local
    // environment that sometimes reaches the internet, which is the property it
    // exists to remove.
    const { sink } = collecting();
    const response = await sink("https://example.com/anything", { method: "POST", body: "{}" });
    expect(response.status).toBe(404);
  });
});
