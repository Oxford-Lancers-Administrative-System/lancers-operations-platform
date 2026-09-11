// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { countRecords, readSinkRecords } from "../scripts/test-box/count.mjs";

const scratch: string[] = [];
afterEach(() =>
  scratch.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })),
);
const record = (id: string, at: string, extra = {}) => ({
  providerMessageId: id,
  at,
  recipient: "447700900901",
  channel: "sms",
  kind: "reminder",
  payload: { private: "never-display-this-token" },
  ...extra,
});

describe("LAN-222 local sink counts", () => {
  it("counts messages per recipient and kind, with chronological bounds regardless of file order", () => {
    const groups = countRecords([
      record("2", "2026-09-09T14:00:00Z"),
      record("1", "2026-09-09T12:00:00Z"),
      record("3", "2026-09-09T13:00:00Z", { kind: "nudge" }),
      record("4", "2026-09-09T12:00:00Z", { recipient: "447700900902" }),
    ]);
    expect(groups).toHaveLength(3);
    expect(groups.find((g: { count: number }) => g.count === 2)).toEqual({
      recipient: "447700900901",
      channel: "sms",
      kind: "reminder",
      count: 2,
      first: "2026-09-09T12:00:00.000Z",
      last: "2026-09-09T14:00:00.000Z",
    });
    expect(JSON.stringify(groups)).not.toContain("never-display-this-token");
  });

  it("does not mislabel email rungs as invitations or merge them with phone identities", () => {
    const groups = countRecords([
      record("1", "2026-09-09T12:00:00Z"),
      record("2", "2026-09-09T12:00:00Z", {
        channel: "email",
        recipient: "walker@example.test",
        kind: "invitation",
      }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.find((g: { channel: string }) => g.channel === "email")?.kind).toBe(
      "unclassified_email",
    );
  });

  it("refuses duplicate or malformed evidence instead of reporting an incomplete total", () => {
    const valid = record("1", "2026-09-09T12:00:00Z");
    expect(() => countRecords([valid, valid])).toThrow("Duplicate");
    expect(() => countRecords([valid, { ...valid, at: "invalid" }])).toThrow("Invalid");
    expect(countRecords([])).toEqual([]);
  });

  it("reads a missing sink as empty and never quotes malformed payloads in errors", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lan222-count-"));
    scratch.push(dir);
    expect(readSinkRecords(path.join(dir, "missing"))).toEqual([]);
    fs.writeFileSync(path.join(dir, "message.json"), '{"token":"never-display-this-token"');
    expect(() => readSinkRecords(dir)).toThrow("Cannot parse a sink record");
    try {
      readSinkRecords(dir);
    } catch (error) {
      expect(String(error)).not.toContain("never-display-this-token");
    }
  });
});
