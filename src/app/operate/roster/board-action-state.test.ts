// @vitest-environment node
/**
 * LAN-380 — what the roster's two editing surfaces do when the save itself
 * never lands.
 *
 * Brian, editing a player's season details on production: the panel showed
 * "failed to fetch" and then loaded a second later on its own. "Failed to
 * fetch" is Chrome's wording for a request that did not complete, and reproducing
 * it locally on a production build under a Slow 3G profile showed the shape of
 * it: rapid edits fire one Server Action POST per click, earlier ones are
 * aborted as later ones arrive, and the rejected promise went into a
 * fire-and-forget transition where nothing caught it. Four of five ticks did
 * not land, and the panel said nothing about any of them.
 *
 * This is the retry half. The other half — the control being unavailable while
 * its own save is in flight, so a second click cannot be computed from a value
 * the server has not confirmed — is asserted on the record view itself.
 */
import { describe, expect, it, vi } from "vitest";

import { commitWithRetry, COULD_NOT_SAVE, type BoardActionState } from "./board-action-state";

/** How a `fetch` that did not complete rejects: a TypeError, no status, no body. */
const failedToFetch = () => new TypeError("Failed to fetch");

describe("commitWithRetry", () => {
  it("returns the action's own answer when the request completes", async () => {
    const action = vi.fn<() => Promise<BoardActionState>>().mockResolvedValue({ error: null });

    await expect(commitWithRetry(action)).resolves.toEqual({ error: null });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("passes a refusal through untouched, and does not retry it", async () => {
    // A refusal is the server's decision. Sending it again would only get the
    // same answer, and would hide the words the service chose.
    const action = vi
      .fn<() => Promise<BoardActionState>>()
      .mockResolvedValue({ error: "Jersey 7 is held by Avery Fielding." });

    await expect(commitWithRetry(action)).resolves.toEqual({
      error: "Jersey 7 is held by Avery Fielding.",
    });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("retries once when the request did not complete, and shows nothing if the retry lands", async () => {
    const action = vi
      .fn<() => Promise<BoardActionState>>()
      .mockRejectedValueOnce(failedToFetch())
      .mockResolvedValueOnce({ error: null });

    await expect(commitWithRetry(action)).resolves.toEqual({ error: null });
    expect(action).toHaveBeenCalledTimes(2);
  });

  it("says one plain sentence only when the retry fails too", async () => {
    const action = vi.fn<() => Promise<BoardActionState>>().mockRejectedValue(failedToFetch());

    await expect(commitWithRetry(action)).resolves.toEqual({ error: COULD_NOT_SAVE });
    expect(action).toHaveBeenCalledTimes(2);
    // The operator is never shown the browser's own words.
    expect(COULD_NOT_SAVE.toLowerCase()).not.toContain("fetch");
  });

  it("never retries an error the server actually threw", async () => {
    // A Server Action that reached the server and threw comes back as an
    // ordinary Error carrying React's digest. Running it again would repeat
    // whatever the server already refused — including a write that may have
    // half-happened.
    const thrown = new Error("Digest: 2094038571");
    const action = vi.fn<() => Promise<BoardActionState>>().mockRejectedValue(thrown);

    await expect(commitWithRetry(action)).rejects.toBe(thrown);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("rethrows a server error raised on the retry rather than swallowing it", async () => {
    const thrown = new Error("Digest: 88");
    const action = vi
      .fn<() => Promise<BoardActionState>>()
      .mockRejectedValueOnce(failedToFetch())
      .mockRejectedValueOnce(thrown);

    await expect(commitWithRetry(action)).rejects.toBe(thrown);
    expect(action).toHaveBeenCalledTimes(2);
  });
});
