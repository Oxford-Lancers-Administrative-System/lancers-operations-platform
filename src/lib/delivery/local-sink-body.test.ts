// @vitest-environment node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  base64FileSink,
  isSpooledAttachment,
  StreamingJsonParser,
  type DivertedString,
} from "./local-sink-body";

/**
 * LAN-514 — the local sink parses a streamed email body as it arrives, and
 * decodes each attachment's base64 straight to a file.
 */

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true });
});

function parseInPieces(
  text: string,
  pieceBytes: number,
  divert: (at: readonly (string | number)[]) => DivertedString | null = () => null,
) {
  const parser = new StreamingJsonParser(divert);
  const bytes = Buffer.from(text, "utf8");
  for (let at = 0; at < bytes.length; at += pieceBytes) {
    parser.write(bytes.subarray(at, at + pieceBytes));
  }
  return parser.end();
}

const DOCUMENT = {
  from: "Oxford University Lancers American Football Club <events@lancers.example>",
  to: ["jamie@example.com"],
  subject: 'Special teams — Kirsty’s "playbook" \\ é 🏈',
  text: "Line one\n\nLine two\ttabbed \u0001",
  count: -12.5e3,
  flags: [true, false, null, 0, {}, []],
  nested: { a: { b: [1, { c: "d" }] } },
  empty: "",
};

describe("LAN-514 — the sink's streaming JSON parser", () => {
  it("reads what JSON.parse reads, however the bytes are split", () => {
    const text = JSON.stringify(DOCUMENT, null, 1);
    for (const piece of [1, 2, 3, 7, 64, text.length]) {
      expect(parseInPieces(text, piece)).toEqual(JSON.parse(text));
    }
  });

  it("refuses malformed and truncated JSON", () => {
    expect(() => parseInPieces('{"a":1', 4)).toThrow();
    expect(() => parseInPieces('{"a" 1}', 4)).toThrow();
    expect(() => parseInPieces("[1,]", 4)).toThrow();
    expect(() => parseInPieces('{"a":1}{', 4)).toThrow();
  });

  it("decodes a diverted attachment to a file byte for byte", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lan514-body-"));
    directories.push(directory);
    const file = crypto.randomBytes(100_003);
    const text = JSON.stringify({
      subject: "Playbook",
      attachments: [{ filename: "a.pdf", content: file.toString("base64") }],
    });
    const parsed = parseInPieces(text, 4_093, (at) =>
      at.length === 3 && at[0] === "attachments" && at[2] === "content"
        ? base64FileSink(path.join(directory, "a.part"))
        : null,
    ) as { subject: string; attachments: { filename: string; content: unknown }[] };
    expect(parsed.subject).toBe("Playbook");
    const content = parsed.attachments[0].content;
    expect(isSpooledAttachment(content)).toBe(true);
    if (!isSpooledAttachment(content)) return;
    expect(content).toMatchObject({
      bytes: file.length,
      encodedLength: file.toString("base64").length,
      validBase64: true,
    });
    expect(fs.readFileSync(content.spooledTo).equals(file)).toBe(true);
  });

  it("marks diverted content that is not base64", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lan514-body-"));
    directories.push(directory);
    const parsed = parseInPieces('{"c":"not base64!"}', 5, () =>
      base64FileSink(path.join(directory, "c.part")),
    ) as { c: unknown };
    expect(parsed.c).toMatchObject({ validBase64: false });
  });
});
