// @vitest-environment node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createDeliverySink, persistAttachments, type SinkRecord } from "./local-sink";

/**
 * LAN-514 — the local sink takes Resend's attachment shape, refuses an email
 * Resend would refuse for its size, and writes what it accepted to disk as
 * files a reviewer can open.
 */
const EMAILS = "https://api.resend.com/emails";
const LOCAL = { APP_BASE_URL: "http://localhost:3000" };

function email(attachments: unknown) {
  return {
    method: "POST",
    body: JSON.stringify({
      from: "Oxford Lancers <events@lancers.example.org>",
      to: ["player@example.test"],
      subject: "Playbook",
      text: "Attached.",
      html: "<p>Attached.</p>",
      attachments,
    }),
  };
}

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true });
});

describe("the local sink and attachments", () => {
  it("accepts base64 attachments and keeps them on the record", async () => {
    const written: SinkRecord[] = [];
    const sink = createDeliverySink(LOCAL, { write: (record) => written.push(record) });
    const content = Buffer.from("%PDF-1.4 playbook").toString("base64");
    const response = await sink(EMAILS, email([{ filename: "playbook.pdf", content }]));
    expect(response.status).toBe(200);
    expect(written).toHaveLength(1);
  });

  it("refuses an email over 40 MB after encoding, as Resend does", async () => {
    const sink = createDeliverySink(LOCAL, { write: () => undefined });
    const content = "A".repeat(40_000_004);
    const response = await sink(EMAILS, email([{ filename: "huge.pdf", content }]));
    expect(response.status).toBe(422);
  });

  it("refuses an attachment with no filename or content that is not base64", async () => {
    const sink = createDeliverySink(LOCAL, { write: () => undefined });
    expect((await sink(EMAILS, email([{ filename: "", content: "QQ==" }]))).status).toBe(422);
    expect(
      (await sink(EMAILS, email([{ filename: "a.pdf", content: "not base64!" }]))).status,
    ).toBe(422);
  });

  it("writes the email as HTML and each attachment as its own file", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lan514-sink-"));
    directories.push(directory);
    const bytes = Buffer.from("%PDF-1.4 special teams");
    const record: SinkRecord = {
      at: "2026-10-29T12:00:00.000Z",
      channel: "email",
      kind: "invitation",
      providerMessageId: "id-1",
      recipient: "player@example.test",
      payload: {
        html: "<p>Attached.</p>",
        attachments: [{ filename: "../Special teams.pdf", content: bytes.toString("base64") }],
      },
    };
    const kept = persistAttachments(record, directory, "stem");
    expect(fs.readFileSync(path.join(directory, "stem.html"), "utf8")).toBe("<p>Attached.</p>");
    const saved = (kept.payload as { attachments: { savedAs: string; bytes: number }[] })
      .attachments[0];
    expect(saved.bytes).toBe(bytes.length);
    expect(path.dirname(saved.savedAs)).toBe(path.join(directory, "stem-attachments"));
    expect(fs.readFileSync(saved.savedAs).equals(bytes)).toBe(true);
  });

  it("reads a streamed body and refuses one that is not its declared length", async () => {
    const written: SinkRecord[] = [];
    const sink = createDeliverySink(LOCAL, { write: (record) => written.push(record) });
    const text = email([{ filename: "a.pdf", content: "QUJD" }]).body;
    const streamed = (length: number) => ({
      method: "POST",
      headers: { "content-length": String(length) },
      body: new Response(text).body,
      duplex: "half",
    });
    expect((await sink(EMAILS, streamed(Buffer.byteLength(text)) as RequestInit)).status).toBe(200);
    expect((await sink(EMAILS, streamed(Buffer.byteLength(text) + 1) as RequestInit)).status).toBe(
      400,
    );
    expect(written).toHaveLength(1);
  });

  it("writes a streamed email's attachment to disk byte for byte", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lan514-sink-"));
    directories.push(directory);
    const sink = createDeliverySink(LOCAL, { directory });
    const file = crypto.randomBytes(200_001);
    const text = email([{ filename: "playbook.pdf", content: file.toString("base64") }]).body;
    const response = await sink(EMAILS, {
      method: "POST",
      headers: { "content-length": String(Buffer.byteLength(text)) },
      body: new Response(text).body,
      duplex: "half",
    } as RequestInit);
    expect(response.status).toBe(200);
    const record = fs.readdirSync(directory).find((name) => name.endsWith(".json"));
    const saved = JSON.parse(fs.readFileSync(path.join(directory, record ?? ""), "utf8")) as {
      payload: { attachments: { savedAs: string; bytes: number }[] };
    };
    expect(saved.payload.attachments[0].bytes).toBe(file.length);
    expect(fs.readFileSync(saved.payload.attachments[0].savedAs).equals(file)).toBe(true);
    // Nothing is left half-written beside it.
    expect(fs.readdirSync(path.join(directory, ".spool"))).toEqual([]);
  });

  it("answers a repeated Idempotency-Key as Resend does: the first email, or a 409", async () => {
    const written: SinkRecord[] = [];
    const sink = createDeliverySink(LOCAL, { write: (record) => written.push(record) });
    const key = `club-message:${crypto.randomUUID()}:${crypto.randomUUID()}`;
    const keyed = (attachments: unknown) => ({
      ...email(attachments),
      headers: { "idempotency-key": key },
    });
    const first = await sink(EMAILS, keyed([{ filename: "a.pdf", content: "QUJD" }]));
    const again = await sink(EMAILS, keyed([{ filename: "a.pdf", content: "QUJD" }]));
    const changed = await sink(EMAILS, keyed([{ filename: "b.pdf", content: "QUJD" }]));
    expect(((await again.json()) as { id: string }).id).toBe(
      ((await first.json()) as { id: string }).id,
    );
    expect(changed.status).toBe(409);
    expect(((await changed.json()) as { name: string }).name).toBe("invalid_idempotent_request");
    expect(written).toHaveLength(1);
  });
});
