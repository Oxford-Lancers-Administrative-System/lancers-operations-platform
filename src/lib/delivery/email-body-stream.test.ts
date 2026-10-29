// @vitest-environment node
import crypto from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  ATTACHMENT_SLICE_BYTES,
  attachmentContentSlot,
  base64Length,
  streamEmailBody,
} from "./email-body-stream";
import type { OutboundAttachment } from "./provider";

/**
 * LAN-514 — the streamed request body is exactly the JSON the whole-string
 * body was, at the length it declares, built from slices and never from the
 * whole file.
 */

function fileAttachment(
  filename: string,
  bytes: Buffer,
  reads: { offset: number; length: number }[] = [],
): OutboundAttachment {
  return {
    filename,
    contentType: "application/pdf",
    byteSize: bytes.length,
    readSlice: async (offset, length) => {
      reads.push({ offset, length });
      return bytes.subarray(offset, offset + length);
    },
  };
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<Buffer[]> {
  const chunks: Buffer[] = [];
  const reader = stream.getReader();
  for (;;) {
    const next = await reader.read();
    if (next.done) return chunks;
    chunks.push(Buffer.from(next.value));
  }
}

function bodyWith(files: { filename: string; content: string }[]) {
  return {
    from: "Oxford University Lancers American Football Club <events@lancers.example>",
    to: ["jamie@example.com"],
    // Outside Latin-1 on purpose: the length is bytes, not characters.
    subject: "Special teams — Kirsty’s playbook",
    text: "Attached.",
    attachments: files.map((file) => ({
      filename: file.filename,
      content: file.content,
      content_type: "application/pdf",
    })),
  };
}

describe("LAN-514 — the streamed email body", () => {
  it("is byte for byte the JSON body, at exactly the length it declares", async () => {
    const first = crypto.randomBytes(ATTACHMENT_SLICE_BYTES * 2 + 7);
    const second = crypto.randomBytes(5);
    const reads: { offset: number; length: number }[] = [];
    const streamed = streamEmailBody(
      bodyWith([
        { filename: "a.pdf", content: attachmentContentSlot(0) },
        { filename: "b.pdf", content: attachmentContentSlot(1) },
      ]),
      [fileAttachment("a.pdf", first, reads), fileAttachment("b.pdf", second, reads)],
    );

    const sent = Buffer.concat(await collect(streamed.stream));
    const expected = Buffer.from(
      JSON.stringify(
        bodyWith([
          { filename: "a.pdf", content: first.toString("base64") },
          { filename: "b.pdf", content: second.toString("base64") },
        ]),
      ),
      "utf8",
    );
    expect(sent.equals(expected)).toBe(true);
    expect(streamed.length).toBe(expected.length);
    expect(reads).toEqual([
      { offset: 0, length: ATTACHMENT_SLICE_BYTES },
      { offset: ATTACHMENT_SLICE_BYTES, length: ATTACHMENT_SLICE_BYTES },
      { offset: ATTACHMENT_SLICE_BYTES * 2, length: 7 },
      { offset: 0, length: 5 },
    ]);
  });

  it("sends a file in pieces no larger than one encoded slice", async () => {
    const file = crypto.randomBytes(10_000_000);
    const streamed = streamEmailBody(
      bodyWith([{ filename: "playbook.pdf", content: attachmentContentSlot(0) }]),
      [fileAttachment("playbook.pdf", file)],
    );
    const chunks = await collect(streamed.stream);
    expect(Math.max(...chunks.map((chunk) => chunk.length))).toBeLessThanOrEqual(
      base64Length(ATTACHMENT_SLICE_BYTES),
    );
    expect(chunks.length).toBeGreaterThanOrEqual(Math.ceil(file.length / ATTACHMENT_SLICE_BYTES));
  });

  it("fails the body, rather than truncating the file, when a slice comes back short", async () => {
    const file = crypto.randomBytes(30);
    const streamed = streamEmailBody(
      bodyWith([{ filename: "gone.pdf", content: attachmentContentSlot(0) }]),
      [{ ...fileAttachment("gone.pdf", file), readSlice: async () => new Uint8Array(0) }],
      6,
    );
    await expect(collect(streamed.stream)).rejects.toThrow(/changed while it was being sent/);
  });

  it("refuses a slice size that would put padding inside the file", () => {
    expect(() => streamEmailBody(bodyWith([]), [], 4)).toThrow(/multiple of three/);
  });

  it("refuses a body that does not hold each attachment's place exactly once", () => {
    const file = fileAttachment("a.pdf", Buffer.from("x"));
    expect(() => streamEmailBody(bodyWith([]), [file])).toThrow(/exactly once/);
  });
});
