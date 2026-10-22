/**
 * Resend's Svix signature and event mapping — LAN-484. Pure; the route's own
 * suite proves the order of operations against the database.
 */
import crypto from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  EMAIL_BOUNCED_REASON,
  EMAIL_FAILED_REASON,
  parseResendEvent,
  SIGNATURE_TOLERANCE_SECONDS,
  verifySvixSignature,
} from "./resend-webhook";

const KEY = Buffer.from("lan484-unit-suite-key");
const CONFIG = { signingSecret: `whsec_${KEY.toString("base64")}` };
const NOW = new Date("2026-10-19T09:00:00Z");
const AT = Math.floor(NOW.getTime() / 1000);
const BODY = '{"type":"email.delivered","data":{"email_id":"synthetic"}}';

function signature(id: string, at: number, body: string, key: Buffer = KEY): string {
  return crypto.createHmac("sha256", key).update(`${id}.${at}.${body}`, "utf8").digest("base64");
}

describe("verifySvixSignature", () => {
  it("accepts a v1 signature over id, timestamp and the raw body", () => {
    const headers = {
      id: "msg_1",
      timestamp: String(AT),
      signature: `v1,${signature("msg_1", AT, BODY)}`,
    };
    expect(verifySvixSignature(BODY, headers, CONFIG, NOW)).toBe(true);
  });

  it("accepts any one matching entry while a secret is being rotated", () => {
    const old = signature("msg_1", AT, BODY, Buffer.from("retired-key"));
    const headers = {
      id: "msg_1",
      timestamp: String(AT),
      signature: `v1,${old} v1,${signature("msg_1", AT, BODY)}`,
    };
    expect(verifySvixSignature(BODY, headers, CONFIG, NOW)).toBe(true);
  });

  it("refuses another version, a missing header and a malformed timestamp", () => {
    const digest = signature("msg_1", AT, BODY);
    const base = { id: "msg_1", timestamp: String(AT), signature: `v1,${digest}` };
    expect(verifySvixSignature(BODY, { ...base, signature: `v2,${digest}` }, CONFIG, NOW)).toBe(
      false,
    );
    expect(verifySvixSignature(BODY, { ...base, id: null }, CONFIG, NOW)).toBe(false);
    expect(verifySvixSignature(BODY, { ...base, signature: null }, CONFIG, NOW)).toBe(false);
    expect(verifySvixSignature(BODY, { ...base, timestamp: "soon" }, CONFIG, NOW)).toBe(false);
  });

  it("refuses a timestamp outside the tolerance either way, and accepts one at its edge", () => {
    for (const offset of [SIGNATURE_TOLERANCE_SECONDS + 1, -(SIGNATURE_TOLERANCE_SECONDS + 1)]) {
      const at = AT + offset;
      const headers = {
        id: "msg_1",
        timestamp: String(at),
        signature: `v1,${signature("msg_1", at, BODY)}`,
      };
      expect(verifySvixSignature(BODY, headers, CONFIG, NOW), String(offset)).toBe(false);
    }
    const edge = AT - SIGNATURE_TOLERANCE_SECONDS;
    const headers = {
      id: "msg_1",
      timestamp: String(edge),
      signature: `v1,${signature("msg_1", edge, BODY)}`,
    };
    expect(verifySvixSignature(BODY, headers, CONFIG, NOW)).toBe(true);
  });
});

describe("parseResendEvent", () => {
  const event = (type: string) =>
    parseResendEvent({ type, data: { email_id: "synthetic-email" } }, "msg_9");

  it("keys the callback on the svix-id and matches the attempt by Resend's email id", () => {
    expect(event("email.delivered")).toEqual({
      providerEventId: "msg_9",
      providerMessageId: "synthetic-email",
      providerStatus: "email.delivered",
      outcome: "delivered",
      detail: null,
    });
  });

  it("records a bounce and a provider failure as final, in provider-neutral words", () => {
    expect(event("email.bounced")).toMatchObject({
      outcome: "rejected",
      detail: EMAIL_BOUNCED_REASON,
    });
    expect(event("email.failed")).toMatchObject({
      outcome: "rejected",
      detail: EMAIL_FAILED_REASON,
    });
  });

  it("gives a delay, a complaint and anything else no outcome", () => {
    for (const type of [
      "email.delivery_delayed",
      "email.complained",
      "email.sent",
      "email.clicked",
    ]) {
      expect(event(type)?.outcome, type).toBeNull();
    }
  });

  it("yields nothing for a payload of any other shape", () => {
    expect(parseResendEvent(null, "msg_9")).toBeNull();
    expect(parseResendEvent({ data: {} }, "msg_9")).toBeNull();
    expect(parseResendEvent({ type: "email.delivered" }, "msg_9")?.providerMessageId).toBeNull();
  });
});
