// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { confirmIntercepted } from "../scripts/test-box/callbacks.mjs";

const directories: string[] = [];
afterEach(() => {
  vi.unstubAllGlobals();
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true });
});
function setup(transport = "intercepted") {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lan-222-receipt-"));
  directories.push(directory);
  fs.mkdirSync(path.join(directory, "transport-evidence"));
  fs.writeFileSync(
    path.join(directory, "transport-evidence", "capture.json"),
    JSON.stringify({
      transport,
      channel: "whatsapp",
      simulatedOutcome: "delivered",
      providerMessageId: "local-test-id",
      at: "2026-09-09T12:00:00Z",
      recipient: "447700900901",
    }),
  );
  return directory;
}
const options = { baseUrl: "http://127.0.0.1:3101", env: { WHATSAPP_APP_SECRET: "test-only" } };
describe("LAN-222 simulated delivery evidence", () => {
  it("does not confirm actual WhatsApp sends", async () => {
    const query = vi.fn();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await confirmIntercepted({ query }, setup("real"), options)).toBe(0);
    expect(query).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("waits until the application records provider acceptance", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(
      await confirmIntercepted(
        { query: vi.fn().mockResolvedValue({ rowCount: 0 }) },
        setup(),
        options,
      ),
    ).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not treat HTTP success without recorded delivery as confirmation", async () => {
    const directory = setup();
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 0 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    await expect(confirmIntercepted({ query }, directory, options)).rejects.toThrow(
      "has not recorded",
    );
    expect(fs.readdirSync(path.join(directory, "simulated-receipts"))).toEqual([]);
  });
  it("records confirmed simulation once and refuses redirects", async () => {
    const directory = setup();
    const query = vi.fn().mockResolvedValue({ rowCount: 1 });
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetch);
    expect(await confirmIntercepted({ query }, directory, options)).toBe(1);
    expect(fetch).toHaveBeenCalledWith(
      options.baseUrl + "/api/webhooks/whatsapp",
      expect.objectContaining({ redirect: "error" }),
    );
    expect(await confirmIntercepted({ query }, directory, options)).toBe(0);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
