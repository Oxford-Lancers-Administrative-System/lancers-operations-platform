// @vitest-environment node
/**
 * The provider webhook route. LAN-78.
 *
 * This is the only route in the application an unauthenticated stranger on the
 * internet is expected to POST to, and its whole security is an order of
 * operations: read the raw bytes, verify the signature, and only then parse or
 * touch the database.
 *
 * ## Why this suite talks to the real database
 *
 * Independent review injected two defects into `route.ts` — deleting the `403`,
 * and moving `verifyWebhookSignature` after `applyProviderCallback` with its
 * result discarded — and the entire suite stayed green, because
 * `verifyWebhookSignature` was tested as a pure function and
 * `applyProviderCallback` as a service, while nothing tested the *route* that
 * orders them.
 *
 * Mocking the service would not have closed that. `applyProviderCallback`
 * refuses `signatureVerified: false`, but the route passes the literal `true`,
 * so a mock-based assertion only proves the route says what it already says.
 * The question worth asking is whether a **row appears**, so these tests count
 * rows in `public.delivery_callbacks` — a table with exactly one writer.
 *
 * An unverified request must leave that count unchanged. Both injected defects
 * make it change.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import crypto from "node:crypto";
import type { Client } from "pg";

import { closePool } from "@/lib/db";
import { openObserver } from "../../../../../tests/helpers/service-layer";
import { GET, MAX_CALLBACK_BYTES, POST } from "./route";

/** Test-only values. Neither is a credential to anything that exists. */
const APP_SECRET = "lan78-route-suite-app-secret";
const VERIFY_TOKEN = "lan78-route-suite-verify-token";

/** Every callback this suite writes carries it, so cleanup cannot overreach. */
const MARKER = "lan78-route-suite";

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
  vi.stubEnv("WHATSAPP_APP_SECRET", APP_SECRET);
  vi.stubEnv("WHATSAPP_WEBHOOK_VERIFY_TOKEN", VERIFY_TOKEN);
}

function sign(body: string, secret = APP_SECRET): string {
  return `sha256=${crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

/** One status transition, in the shape Meta actually sends. */
function payload(suffix: string, status = "delivered"): string {
  return JSON.stringify({
    entry: [
      {
        changes: [
          {
            value: {
              statuses: [{ id: `${MARKER}-${suffix}`, status, timestamp: "1700000000" }],
            },
          },
        ],
      },
    ],
  });
}

function post(body: string, signature: string | null): Promise<Response> {
  return POST(
    new Request("https://lancers.example.org/api/webhooks/whatsapp", {
      method: "POST",
      headers: signature === null ? {} : { "x-hub-signature-256": signature },
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
    ["a signature from the wrong secret", sign(payload("wrong"), "some-other-secret")],
    ["a truncated signature", "sha256=abc"],
    ["a syntactically valid but wrong digest", `sha256=${"0".repeat(64)}`],
  ])("refuses %s with 403 and writes nothing", async (_case, signature) => {
    configured();
    const body = payload("wrong");

    const before = await callbackCount();
    const response = await post(body, signature);

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("");
    // The assertion the injected defects fail. Both of them produce a row.
    expect(await callbackCount()).toBe(before);
  });

  it("refuses a body that was tampered with after signing", async () => {
    configured();
    const original = payload("tampered");
    const signature = sign(original);

    const response = await post(payload("tampered", "failed"), signature);

    expect(response.status).toBe(403);
    expect(await callbackCount()).toBe(0);
  });

  it("refuses a signature computed over re-serialised JSON", async () => {
    configured();
    const original = '{"entry": [{"changes": []}]}';
    const reserialised = JSON.stringify(JSON.parse(original));
    expect(reserialised).not.toBe(original);

    expect((await post(reserialised, sign(original))).status).toBe(403);
  });

  /**
   * The assertion that actually pins the ordering, and the one this suite was
   * missing.
   *
   * Everything else here builds its bodies with `JSON.stringify`, so they are
   * already canonical and re-serialising them is the identity — which meant a
   * route that parsed first and verified over `JSON.stringify(payload)` passed
   * every test in the file. Meta's real callbacks are not canonical: they carry
   * whitespace and their own key order.
   *
   * So this posts a deliberately non-canonical body, signed over those exact
   * bytes, and requires it to be **accepted**. A parse-then-verify route
   * answers 403, which would silently discard every genuine callback — and
   * canonicalising before verifying would also make one captured signature
   * authenticate a whole family of bodies.
   */
  it("accepts a signature over the bytes as received, whitespace and key order included", async () => {
    configured();
    const asMetaSendsIt =
      '{\n  "object": "whatsapp_business_account",\n  "entry": [ {\n' +
      '    "changes": [ {\n      "value": {\n        "statuses": [ {\n' +
      `          "status": "delivered",\n          "timestamp": "1700000000",\n` +
      `          "id": "${MARKER}-noncanonical"\n` +
      '        } ]\n      },\n      "field": "messages"\n    } ]\n  } ]\n}';

    // Not what `JSON.stringify` would produce, which is the whole point.
    expect(asMetaSendsIt).not.toBe(JSON.stringify(JSON.parse(asMetaSendsIt)));

    const response = await post(asMetaSendsIt, sign(asMetaSendsIt));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: 1, applied: 0 });
    expect(await callbackCount()).toBe(1);
  });

  it("refuses everything, verified or not, when the deployment cannot verify", async () => {
    // No secrets configured. A route that cannot verify must not accept — and
    // 503 rather than 200, because it is a real inability rather than a
    // judgement about this request.
    const body = payload("unconfigured");
    const response = await post(body, sign(body));

    expect(response.status).toBe(503);
    expect(await callbackCount()).toBe(0);
  });
});

describe("POST — a verified request is applied exactly once", () => {
  it("accepts a correctly signed callback and records it", async () => {
    configured();
    const body = payload("accepted");

    const response = await post(body, sign(body));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: 1, applied: 0 });
    // `applied: 0` and a stored row: the message identifier matches no attempt
    // in this database, which is a fact worth keeping rather than an error.
    expect(await callbackCount()).toBe(1);
  });

  it("deduplicates a callback the provider sends twice", async () => {
    configured();
    const body = payload("repeated");

    expect((await post(body, sign(body))).status).toBe(200);
    expect((await post(body, sign(body))).status).toBe(200);

    // Providers retry. The second copy must produce nothing at all.
    expect(await callbackCount()).toBe(1);
  });

  it("acknowledges a signed body it cannot parse, rather than making Meta retry forever", async () => {
    configured();
    const body = "not json at all";

    const response = await post(body, sign(body));

    expect(response.status).toBe(200);
    expect(await callbackCount()).toBe(0);
  });

  it("answers with counts only, and nothing about the club", async () => {
    configured();
    const body = payload("counts");

    const answered = await (await post(body, sign(body))).json();

    // This response crosses the internet to a caller that is authenticated but
    // owed nothing: no identifier, no status, no recipient.
    expect(Object.keys(answered as object).sort()).toEqual(["applied", "received"]);
  });
});

describe("POST — the body is bounded before it is hashed", () => {
  it("refuses an oversized body outright", async () => {
    configured();
    // Verifying costs an HMAC over the whole body, and this is the one endpoint
    // an unauthenticated caller is meant to reach. Signed or not, an
    // arbitrarily large body is refused before that cost is paid.
    const oversized = JSON.stringify({ entry: [], padding: "x".repeat(MAX_CALLBACK_BYTES) });

    const response = await post(oversized, sign(oversized));

    expect(response.status).toBe(413);
    expect(await callbackCount()).toBe(0);
  });

  it("refuses a body whose declared length is oversized", async () => {
    configured();
    const body = payload("declared");

    const response = await POST(
      new Request("https://lancers.example.org/api/webhooks/whatsapp", {
        method: "POST",
        headers: {
          "x-hub-signature-256": sign(body),
          "content-length": String(MAX_CALLBACK_BYTES + 1),
        },
        body,
      }),
    );

    expect(response.status).toBe(413);
  });

  it("measures bytes rather than characters", async () => {
    configured();
    // `String.length` counts UTF-16 code units, so a multi-byte body would slip
    // through a cap written against it at roughly three times the size.
    const multibyte = JSON.stringify({ entry: [], padding: "é".repeat(MAX_CALLBACK_BYTES - 200) });
    expect(multibyte.length).toBeLessThan(MAX_CALLBACK_BYTES);
    expect(Buffer.byteLength(multibyte, "utf8")).toBeGreaterThan(MAX_CALLBACK_BYTES);

    expect((await post(multibyte, sign(multibyte))).status).toBe(413);
  });

  it("accepts an ordinary callback, which is nowhere near the cap", async () => {
    configured();
    const body = payload("small");
    expect(Buffer.byteLength(body, "utf8")).toBeLessThan(MAX_CALLBACK_BYTES);

    expect((await post(body, sign(body))).status).toBe(200);
  });
});

describe("GET — the subscription handshake", () => {
  it("echoes the challenge for the right verify token", async () => {
    configured();
    const response = await GET(
      new Request(
        `https://lancers.example.org/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=12345`,
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("12345");
  });

  it.each([
    ["the wrong token", `hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1`],
    ["no token", `hub.mode=subscribe&hub.challenge=1`],
    ["the wrong mode", `hub.mode=unsubscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=1`],
  ])("refuses %s", async (_case, query) => {
    configured();
    const response = await GET(
      new Request(`https://lancers.example.org/api/webhooks/whatsapp?${query}`),
    );

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("");
  });

  it("refuses when the deployment has no verify token of its own", async () => {
    const response = await GET(
      new Request(
        "https://lancers.example.org/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=anything&hub.challenge=1",
      ),
    );
    expect(response.status).toBe(503);
  });
});
