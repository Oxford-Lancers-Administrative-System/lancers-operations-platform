/**
 * What the two submissions do when they refuse — LAN-79.
 *
 * These exist because of one finding. The write path used to answer a
 * rate-limited player with `closed`, which renders "Responses close when the
 * event starts" — a statement about their event that was false, and one they
 * could do nothing about. That was corrected to a distinct `busy`, and the
 * correction was then unwitnessed: independent review noted that deleting the
 * `busy` branch and falling back to `closed` would leave every test green.
 *
 * So the assertion is not "a throttled write is refused" — it is *which* thing
 * the player is told, because that is the part that was wrong.
 *
 * The service layer is mocked. What is under test is the action's choice of
 * refusal, not the write, which is proved against the real database in
 * `src/lib/services/rsvp.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/services/rsvp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/rsvp")>();
  return { ...actual, recordSignedLinkResponse: vi.fn() };
});

import { InvalidTransition } from "@/lib/db";
import { RATE_LIMIT_MAX_PER_LINK, resetRsvpRateLimit } from "@/lib/rsvp/public-surface";
import { recordSignedLinkResponse, RESPONSE_WINDOW_CLOSED_RULE } from "@/lib/services/rsvp";
import { submitAttending, submitNotAttending } from "./actions";
import { BUSY_ERROR, CLOSED_ERROR } from "./params";

const TOKEN = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLM0123";

function formFor(fields: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.set("token", TOKEN);
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}

/** Runs an action and returns where it redirected to. */
async function redirectFrom(run: () => Promise<void>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const message = (error as Error).message;
    if (message.startsWith("REDIRECT:")) return message.slice("REDIRECT:".length);
    throw error;
  }
  throw new Error("Expected the action to redirect, and it did not.");
}

beforeEach(() => {
  vi.clearAllMocks();
  resetRsvpRateLimit();
  vi.mocked(recordSignedLinkResponse).mockResolvedValue({
    responseId: "00000000-0000-4000-8000-000000000001",
    response: "yes",
    respondedAt: new Date(),
    invitationId: "00000000-0000-4000-8000-000000000002",
    cancelledJobs: 0,
  });
});

/** Spends the link's whole allowance, so the next call is throttled. */
async function exhaustTheLink(): Promise<void> {
  for (let attempt = 0; attempt < RATE_LIMIT_MAX_PER_LINK; attempt += 1) {
    await redirectFrom(() => submitAttending(formFor()));
  }
}

describe("a throttled submission", () => {
  it("is refused as busy, never as a closed window", async () => {
    await exhaustTheLink();

    const target = await redirectFrom(() => submitAttending(formFor()));

    expect(target).toContain(`error=${BUSY_ERROR}`);
    // The whole point of the finding: this must not claim the event started.
    expect(target).not.toContain(`error=${CLOSED_ERROR}`);
  });

  it("is refused as busy on the declining path too", async () => {
    await exhaustTheLink();

    const target = await redirectFrom(() =>
      submitNotAttending(formFor({ reason: "Academic conflict" })),
    );

    expect(target).toContain(`error=${BUSY_ERROR}`);
    expect(target).not.toContain(`error=${CLOSED_ERROR}`);
  });

  it("writes nothing", async () => {
    await exhaustTheLink();
    vi.mocked(recordSignedLinkResponse).mockClear();

    await redirectFrom(() => submitAttending(formFor()));

    expect(recordSignedLinkResponse).not.toHaveBeenCalled();
  });
});

describe("a genuinely closed window", () => {
  it("still says closed, so the two refusals stay distinguishable", async () => {
    // The counterweight. If `busy` were simply substituted everywhere, the
    // tests above would pass while a player whose event really had started was
    // told to try again in a minute — the same class of falsehood, reversed.
    vi.mocked(recordSignedLinkResponse).mockRejectedValueOnce(
      new InvalidTransition("This RSVP link can no longer be used to record a response.", {
        rule: RESPONSE_WINDOW_CLOSED_RULE,
      }),
    );

    const target = await redirectFrom(() => submitAttending(formFor()));

    expect(target).toContain(`error=${CLOSED_ERROR}`);
    expect(target).not.toContain(`error=${BUSY_ERROR}`);
  });

  it("refuses an anonymous injected token without exposing a distinct outcome", async () => {
    const form = formFor();
    form.set("token", "abc' or '1'='1");
    vi.mocked(recordSignedLinkResponse).mockRejectedValueOnce(new Error("unknown token"));

    const target = await redirectFrom(() => submitAttending(form));

    expect(recordSignedLinkResponse).toHaveBeenCalledWith("abc' or '1'='1", {
      response: "yes",
    });
    expect(target).toContain(`error=${CLOSED_ERROR}`);
    expect(target).not.toContain("unknown");
  });
});
