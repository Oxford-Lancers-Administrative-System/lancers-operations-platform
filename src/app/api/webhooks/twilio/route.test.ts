// @vitest-environment node
/**
 * The Twilio status callback route. LAN-330, on LAN-78's shape.
 *
 * This is the only route in the application an unauthenticated stranger on the
 * internet is expected to POST to, and its whole security is an order of
 * operations: read the raw bytes, verify the signature, and only then parse or
 * touch the database.
 *
 * ## Why this suite talks to the real database
 *
 * A pure-function test of `verifyTwilioSignature` and a service test of
 * `applyProviderCallback` cannot catch a route that calls them in the wrong
 * order or discards the verdict. The question worth asking is whether a
 * **row appears**, so these tests count rows in `public.delivery_callbacks`
 * — a table with exactly one writer. An unverified request must leave that
 * count unchanged.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import { closePool } from "@/lib/db";
import { expectedTwilioSignature } from "@/lib/delivery/sms-twilio";
import { openObserver } from "../../../../../tests/helpers/service-layer";
import { MAX_CALLBACK_BYTES, POST } from "./route";

/** Test-only values. Neither is a credential to anything that exists. */
const AUTH_TOKEN = "lan330-route-suite-auth-token";
const APP_BASE_URL = "https://lancers.example.org";
const CALLBACK = `${APP_BASE_URL}/api/webhooks/twilio`;

/** Every callback this suite writes carries it, so cleanup cannot overreach. */
const MARKER = "SMlan330routesuite";

let observer: Client;

beforeAll(async () => {
  observer = await openObserver();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await observer.query("delete from public.delivery_callbacks where provider_event_id like $1", [
    `${MARKER}%`,
  ]);
});

afterAll(async () => {
  await observer.end();
  await closePool();
});

/** Configures the webhook half only — the outbound half is irrelevant here. */
function configured(): void {
  vi.stubEnv("TWILIO_AUTH_TOKEN", AUTH_TOKEN);
  vi.stubEnv("APP_BASE_URL", APP_BASE_URL);
}

/** One status transition, in the shape Twilio actually sends. */
function payload(suffix: string, status = "delivered"): Record<string, string> {
  return {
    MessageSid: `${MARKER}${suffix}`,
    MessageStatus: status,
    To: "+447700900001",
    From: "OxfLancers",
    AccountSid: "ACtest",
  };
}

function encode(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
}

function sign(params: Record<string, string>, url = CALLBACK, token = AUTH_TOKEN): string {
  return expectedTwilioSignature(url, params, token);
}

function post(
  body: string,
  signature: string | null,
  url = "http://127.0.0.1:3010/api/webhooks/twilio",
): Promise<Response> {
  // The app behind a tunnel sees a loopback host. The route must sign over
  // the configured origin, not this one.
  return POST(
    new Request(url, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        ...(signature === null ? {} : { "x-twilio-signature": signature }),
      },
      body,
    }),
  );
}

async function callbackCount(): Promise<number> {
  const result = await observer.query<{ n: string }>(
    "select count(*)::text as n from public.delivery_callbacks where provider_event_id like $1",
    [`${MARKER}%`],
  );
  return Number(result.rows[0].n);
}

describe("POST — an unverified request reaches nothing", () => {
  it.each([
    ["no signature at all", null],
    ["a signature from the wrong auth token", sign(payload("wrong"), CALLBACK, "some-other-token")],
    ["a truncated signature", "abc"],
    ["a syntactically valid but wrong digest", Buffer.alloc(20).toString("base64")],
  ])("refuses %s with 403 and writes nothing", async (_case, signature) => {
    configured();
    const body = encode(payload("wrong"));

    const before = await callbackCount();
    const response = await post(body, signature);

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("");
    expect(await callbackCount()).toBe(before);
  });

  it("refuses a body that was tampered with after signing", async () => {
    configured();
    const signature = sign(payload("tampered"));

    const response = await post(encode(payload("tampered", "failed")), signature);

    expect(response.status).toBe(403);
    expect(await callbackCount()).toBe(0);
  });

  it("refuses a signature computed over the loopback URL the app itself sees", async () => {
    // Twilio signs the URL it was given — the tunnel origin. A route that
    // verified against `request.url` would accept this and reject every real
    // callback; this one does the reverse.
    configured();
    const params = payload("loopback");
    const response = await post(
      encode(params),
      sign(params, "http://127.0.0.1:3010/api/webhooks/twilio"),
    );
    expect(response.status).toBe(403);
    expect(await callbackCount()).toBe(0);
  });

  it("refuses a correct signature presented on the wrong path", async () => {
    configured();
    const params = payload("path");
    const response = await post(
      encode(params),
      sign(params),
      "http://127.0.0.1:3010/api/webhooks/other",
    );
    expect(response.status).toBe(403);
  });

  it("refuses everything, verified or not, when the deployment cannot verify", async () => {
    const params = payload("unconfigured");
    const response = await post(encode(params), sign(params));

    expect(response.status).toBe(503);
    expect(await callbackCount()).toBe(0);
  });
});

describe("POST — a verified request is applied exactly once", () => {
  it("accepts a correctly signed callback and records it", async () => {
    configured();
    const params = payload("accepted");

    const response = await post(encode(params), sign(params));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: 1, applied: 0 });
    // `applied: 0` and a stored row: the SID matches no attempt in this
    // database, which is a fact worth keeping rather than an error.
    expect(await callbackCount()).toBe(1);
  });

  it("signs over the query string too, which is where the kind travels", async () => {
    configured();
    const params = payload("query");
    const url = `${CALLBACK}?kind=invitation`;
    const response = await post(
      encode(params),
      sign(params, url),
      "http://127.0.0.1:3010/api/webhooks/twilio?kind=invitation",
    );
    expect(response.status).toBe(200);
    expect(await callbackCount()).toBe(1);
  });

  it("deduplicates a callback the provider sends twice", async () => {
    configured();
    const params = payload("repeated");

    expect((await post(encode(params), sign(params))).status).toBe(200);
    expect((await post(encode(params), sign(params))).status).toBe(200);

    expect(await callbackCount()).toBe(1);
  });

  it("stores each status transition for one message as its own row", async () => {
    configured();
    for (const status of ["sent", "delivered"]) {
      const params = payload("transitions", status);
      expect((await post(encode(params), sign(params))).status).toBe(200);
    }
    expect(await callbackCount()).toBe(2);
  });

  it("acknowledges a signed body with no message identifier, rather than making Twilio retry forever", async () => {
    configured();
    const params = { MessageStatus: "delivered" };

    const response = await post(encode(params), sign(params));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: 0, applied: 0 });
    expect(await callbackCount()).toBe(0);
  });

  it("answers with counts only, and nothing about the club", async () => {
    configured();
    const params = payload("counts");

    const answered = await (await post(encode(params), sign(params))).json();

    expect(Object.keys(answered as object).sort()).toEqual(["applied", "received"]);
  });
});

describe("POST — the body is bounded before it is hashed", () => {
  it("refuses an oversized body outright", async () => {
    configured();
    const params = { ...payload("oversized"), Padding: "x".repeat(MAX_CALLBACK_BYTES) };
    const body = encode(params);

    const response = await post(body, sign(params));

    expect(response.status).toBe(413);
    expect(await callbackCount()).toBe(0);
  });

  it("refuses a body whose declared length is oversized", async () => {
    configured();
    const params = payload("declared");

    const response = await POST(
      new Request("http://127.0.0.1:3010/api/webhooks/twilio", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-twilio-signature": sign(params),
          "content-length": String(MAX_CALLBACK_BYTES + 1),
        },
        body: encode(params),
      }),
    );

    expect(response.status).toBe(413);
  });

  it("accepts an ordinary callback, which is nowhere near the cap", async () => {
    configured();
    const params = payload("small");
    const body = encode(params);
    expect(Buffer.byteLength(body, "utf8")).toBeLessThan(MAX_CALLBACK_BYTES);

    expect((await post(body, sign(params))).status).toBe(200);
  });
});
