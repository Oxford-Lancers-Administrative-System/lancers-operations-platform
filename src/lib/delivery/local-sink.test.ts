/**
 * The local delivery sink — LAN-169, re-pointed at Twilio by LAN-330.
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
 * The rest of the file asserts the sink's other job — that it validates a
 * Twilio request the way Twilio would, rather than accepting anything and
 * letting a sender chosen for the wrong country reach a real phone.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { CLOUD_RUN_SERVICE } from "@/lib/db/runtime-target";

import { createDeliverySink, selectDeliverySink, type SinkRecord } from "./local-sink";

const MESSAGES = "https://api.twilio.com/2010-04-01/Accounts/ACtest/Messages.json";
const EMAILS = "https://api.resend.com/emails";

/** A local environment with every sink affordance turned on. */
const LOCAL = {
  APP_BASE_URL: "http://localhost:3000",
  DELIVERY_SINK_FAILURES: "+447700900999",
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
};

function smsForm(overrides: Record<string, string> = {}): string {
  return new URLSearchParams({
    To: "+447700900001",
    From: "OxfLancers",
    Body: "Oxford Lancers: Jamie, practice Wed 14 Oct 20:00.\nYes: https://x/a/y.t\nNo: https://x/a/n.t",
    StatusCallback: "http://localhost:3000/api/webhooks/twilio?kind=invitation",
    ...overrides,
  }).toString();
}

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
    for (const [name, value] of Object.entries({
      DELIVERY_SINK: "true",
      DELIVERY_SINK_ENABLED: "1",
      EMAIL_TEST_RECIPIENT: "someone@example.com",
      NODE_ENV: "test",
    })) {
      expect(selectDeliverySink({ ...DEPLOYED, [name]: value }), name).toBeNull();
    }
  });

  it("gets nothing on a non-loopback base URL even outside Cloud Run", () => {
    expect(selectDeliverySink({ APP_BASE_URL: "https://lancers.example" })).toBeNull();
    expect(selectDeliverySink({ APP_BASE_URL: "https://localhost.example.com" })).toBeNull();
  });

  it("is selected only for a local runtime on a loopback address", () => {
    expect(selectDeliverySink(LOCAL)).not.toBeNull();
    expect(selectDeliverySink({ APP_BASE_URL: "http://127.0.0.1:3000" })).not.toBeNull();
  });
});

describe("validating a Twilio request", () => {
  it("accepts the real form and answers in Twilio's shape", async () => {
    const { sink, written } = collecting();

    const response = await sink(MESSAGES, { method: "POST", body: smsForm() });

    expect(response.status).toBe(201);
    const body = (await response.json()) as { sid: string; status: string };
    expect(body.status).toBe("queued");
    // A real `SM` SID, because `delivery_attempts` matches a callback on it and
    // a made-up shape would make local callback matching prove nothing.
    expect(body.sid).toMatch(/^SM[0-9a-f]{32}$/);

    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({
      channel: "sms",
      kind: "invitation",
      recipient: "+447700900001",
    });
  });

  it("records the kind from the callback URL and `unknown` when it names none", async () => {
    const { sink, written } = collecting();
    await sink(MESSAGES, {
      method: "POST",
      body: smsForm({ StatusCallback: "http://localhost:3000/api/webhooks/twilio" }),
    });
    await sink(MESSAGES, {
      method: "POST",
      body: smsForm({ StatusCallback: "http://localhost:3000/api/webhooks/twilio?kind=nonsense" }),
    });
    expect(written.map((record) => record.kind)).toEqual(["unknown", "unknown"]);
  });

  it("refuses an alphanumeric sender to a North American number, as Twilio does", async () => {
    const { sink } = collecting();
    const response = await sink(MESSAGES, {
      method: "POST",
      body: smsForm({ To: "+12025550123", From: "OxfLancers" }),
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { code: number }).code).toBe(21212);
  });

  it("accepts a toll-free sender to a North American number", async () => {
    const { sink, written } = collecting();
    const response = await sink(MESSAGES, {
      method: "POST",
      body: smsForm({ To: "+12025550123", From: "+18005550100" }),
    });
    expect(response.status).toBe(201);
    expect(written[0].recipient).toBe("+12025550123");
  });

  it("refuses a recipient without its plus, or with spaces", async () => {
    const { sink } = collecting();
    for (const To of ["447700900001", "+44 7700 900001", ""]) {
      const response = await sink(MESSAGES, { method: "POST", body: smsForm({ To }) });
      expect(response.status, To).toBe(400);
      expect(((await response.json()) as { code: number }).code).toBe(21211);
    }
  });

  it("refuses an empty body and a missing callback", async () => {
    const { sink } = collecting();
    expect((await sink(MESSAGES, { method: "POST", body: smsForm({ Body: " " }) })).status).toBe(
      400,
    );
    expect(
      (await sink(MESSAGES, { method: "POST", body: smsForm({ StatusCallback: "" }) })).status,
    ).toBe(400);
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
    // W6 is unreviewable without this: "a genuine failure" and "a text failure
    // that email then carried" are both states somebody has to look at, and
    // neither can be produced by a sink that always succeeds.
    const { sink } = collecting();
    const response = await sink(MESSAGES, {
      method: "POST",
      body: smsForm({ To: "+447700900999" }),
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { code: number }).code).toBe(21610);
  });
});

describe("anything the sink does not serve", () => {
  it("is refused rather than passed through to the network", async () => {
    const { sink } = collecting();
    const response = await sink("https://example.com/anything", { method: "POST", body: "{}" });
    expect(response.status).toBe(404);
    // Meta's old endpoint included: this branch has no WhatsApp path at all.
    const graph = await sink("https://graph.facebook.com/v26.0/123/messages", {
      method: "POST",
      body: "{}",
    });
    expect(graph.status).toBe(404);
  });
});
