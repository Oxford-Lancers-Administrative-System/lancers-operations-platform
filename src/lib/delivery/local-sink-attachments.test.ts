// @vitest-environment node
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
});
