// @vitest-environment node
import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { EmailConfig } from "./config";
import { buildEmailBody, createEmailProvider } from "./email";
import { ATTACHMENT_SLICE_BYTES } from "./email-body-stream";
import type { OutboundMessage } from "./provider";

/**
 * LAN-514 — a 10 MB and a 20 MB attachment sent with the real `fetch` to a
 * mock Resend endpoint over a real socket.
 *
 * The endpoint runs in a child process, so the memory measured here is the
 * sender's alone. It hashes what it receives as it arrives and reports the
 * headers it saw: the body must arrive byte for byte, at the exact
 * `Content-Length` declared and not chunked, with the job's `Idempotency-Key`;
 * the file must be read in 3 MiB slices; and the sender's memory must stay
 * well under what one whole-file copy chain costs (the analysis measured
 * +227 MB RSS at 20 MB for the old whole-string body).
 */

vi.setConfig({ testTimeout: 60_000 });

const ENDPOINT = `
const http = require("node:http");
const crypto = require("node:crypto");
const server = http.createServer((req, res) => {
  const hash = crypto.createHash("sha256");
  let bytes = 0;
  req.on("data", (chunk) => { hash.update(chunk); bytes += chunk.length; });
  req.on("end", () => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({
      id: "mock-" + crypto.randomUUID(),
      sha256: hash.digest("hex"),
      bytes,
      contentLength: req.headers["content-length"] ?? null,
      transferEncoding: req.headers["transfer-encoding"] ?? null,
      idempotencyKey: req.headers["idempotency-key"] ?? null,
    }));
  });
});
server.listen(0, "127.0.0.1", () => process.stdout.write(server.address().port + "\\n"));
`;

let endpoint: ChildProcess;
let baseUrl: string;

beforeAll(async () => {
  endpoint = spawn(process.execPath, ["-e", ENDPOINT], { stdio: ["ignore", "pipe", "inherit"] });
  const port = await new Promise<string>((resolve, reject) => {
    endpoint.stdout?.once("data", (data: Buffer) => resolve(data.toString().trim()));
    endpoint.once("error", reject);
  });
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(() => {
  endpoint.kill();
});

interface Received {
  id: string;
  sha256: string;
  bytes: number;
  contentLength: string | null;
  transferEncoding: string | null;
  idempotencyKey: string | null;
}

async function sendOnce(size: number) {
  const config: EmailConfig = {
    apiBaseUrl: baseUrl,
    apiKey: "test-key-not-a-real-one",
    appBaseUrl: "https://app.oxfordlancers.example",
    fromAddress: "events@lancers.example",
    replyToAddress: null,
    recipientOverride: null,
  };
  const file = crypto.randomBytes(size);
  const reads: { offset: number; length: number }[] = [];
  const message: OutboundMessage = {
    kind: "club_message",
    recipient: "jamie@example.com",
    inviteeName: "Jamie",
    eventName: "",
    whenLabel: "",
    rsvpUrl: "",
    subject: "Special teams — Kirsty’s playbook",
    bodyText: "Here is this week's playbook.",
    idempotencyKey: `club-message:${crypto.randomUUID()}:${crypto.randomUUID()}`,
    attachments: [
      {
        filename: "playbook.pdf",
        contentType: "application/pdf",
        byteSize: file.length,
        // A copy, as a database read is: the slice is new memory each time.
        readSlice: async (offset, length) => {
          reads.push({ offset, length });
          return Buffer.from(file.subarray(offset, offset + length));
        },
      },
    ],
  };

  let received: Received | null = null;
  const transport = async (url: string, init: RequestInit) => {
    const response = await fetch(url, init);
    received = (await response.clone().json()) as Received;
    return response;
  };
  const provider = createEmailProvider(config, transport);

  const baseline = process.memoryUsage();
  let peakRss = baseline.rss;
  let peakHeap = baseline.heapUsed;
  const sampler = setInterval(() => {
    const now = process.memoryUsage();
    peakRss = Math.max(peakRss, now.rss);
    peakHeap = Math.max(peakHeap, now.heapUsed);
  }, 2);
  const started = performance.now();
  const outcome = await provider.send(message);
  const elapsedMs = performance.now() - started;
  clearInterval(sampler);
  const after = process.memoryUsage();
  peakRss = Math.max(peakRss, after.rss);
  peakHeap = Math.max(peakHeap, after.heapUsed);

  // Only now, outside the measurement: the body the old code would have sent.
  const json = buildEmailBody(config, message) as { attachments: { content: string }[] };
  json.attachments[0].content = file.toString("base64");
  const expected = Buffer.from(JSON.stringify(json), "utf8");

  return {
    outcome,
    received: received as Received | null,
    expected,
    reads,
    message,
    rssGrowthMb: (peakRss - baseline.rss) / 1_000_000,
    heapGrowthMb: (peakHeap - baseline.heapUsed) / 1_000_000,
    elapsedMs,
  };
}

describe("LAN-514 — attachments streamed to the provider", () => {
  for (const megabytes of [10, 20]) {
    it(`sends ${megabytes} MB byte for byte at an exact length, in slices, in bounded memory`, async () => {
      const size = megabytes * 1_000_000;
      const sent = await sendOnce(size);

      expect(sent.outcome.status).toBe("accepted");
      const received = sent.received;
      expect(received).not.toBeNull();
      expect(received?.bytes).toBe(sent.expected.length);
      expect(received?.sha256).toBe(
        crypto.createHash("sha256").update(sent.expected).digest("hex"),
      );
      expect(received?.contentLength).toBe(String(sent.expected.length));
      expect(received?.transferEncoding).toBeNull();
      expect(received?.idempotencyKey).toBe(sent.message.idempotencyKey);

      expect(sent.reads).toHaveLength(Math.ceil(size / ATTACHMENT_SLICE_BYTES));
      expect(sent.reads.every((read) => read.length <= ATTACHMENT_SLICE_BYTES)).toBe(true);

      // One whole encoded copy of the file is 13.3 MB at 10 MB and 26.7 MB at
      // 20 MB; the old chain held about four of them at once. The heap here
      // holds slices, so it stays under one whole copy at either size.
      expect(sent.heapGrowthMb).toBeLessThan(megabytes * 1.34);
      expect(sent.rssGrowthMb).toBeLessThan(120);

      console.info(
        `LAN-514 ${megabytes} MB: rss +${sent.rssGrowthMb.toFixed(1)} MB, ` +
          `heap +${sent.heapGrowthMb.toFixed(1)} MB, ${sent.elapsedMs.toFixed(0)} ms, ` +
          `${sent.reads.length} slices`,
      );
    });
  }
});
