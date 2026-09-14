/**
 * The nudge page's one write — LAN-343.
 *
 * The service layer and the transaction are mocked. What is under test is the
 * action's own logic: it re-resolves the RSVP token inside its own
 * transaction, it takes the invitation from that resolution rather than from
 * the form, and every refusal — a dead token, a guessed token, a rate limit —
 * lands on the same redirect with the same wall clock, so which one happened
 * is not visible from outside. The write itself is proved against the real
 * database in `src/lib/services/player-home.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, withTransaction: async (fn: (tx: unknown) => unknown) => fn({}) };
});
vi.mock("@/lib/services/player-home", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/player-home")>();
  return { ...actual, answerInvitationQuestionsIn: vi.fn() };
});
vi.mock("@/lib/services/rsvp-tokens", () => ({ resolveRsvpTokenIn: vi.fn() }));

import { resetRsvpRateLimit } from "@/lib/rsvp/public-surface";
import { answerInvitationQuestionsIn } from "@/lib/services/player-home";
import { resolveRsvpTokenIn } from "@/lib/services/rsvp-tokens";

import { saveEventQuestions } from "./actions";
import { BUSY_ERROR } from "./presentation";

const TOKEN = "rsvp-token-plaintext-0000000000000000000000";
const INVITATION_ID = "00000000-0000-4000-8000-000000000002";

function formFor(fields: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.set("token", TOKEN);
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}

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

function givenLiveToken(): void {
  vi.mocked(resolveRsvpTokenIn).mockResolvedValue({
    state: "valid",
    writable: true,
    invitation: {
      invitationId: INVITATION_ID,
      eventId: "00000000-0000-4000-8000-000000000006",
      eventName: "Team Practice",
      eventStatus: "approved",
      startsAt: new Date("2026-10-01T18:00:00Z"),
      inviteeName: "Player",
      expiresAt: new Date("2026-10-01T18:00:00Z"),
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetRsvpRateLimit();
  givenLiveToken();
  vi.mocked(answerInvitationQuestionsIn).mockResolvedValue(undefined);
});

describe("saveEventQuestions", () => {
  it("saves against the invitation the token resolves to, never one from the form", async () => {
    const form = formFor({ q_q1: "true", qkind_q1: "boolean", invitationId: "not-this-one" });

    const target = await redirectFrom(() => saveEventQuestions(form));

    expect(answerInvitationQuestionsIn).toHaveBeenCalledWith(expect.anything(), INVITATION_ID, [
      { questionId: "q1", boolean: true },
    ]);
    expect(target).toBe(`/questions/${encodeURIComponent(TOKEN)}?saved=1`);
  });

  it("writes nothing when the token no longer resolves, and says nothing about why", async () => {
    vi.mocked(resolveRsvpTokenIn).mockResolvedValue({
      state: "revoked",
      writable: false,
      invitation: null,
    });

    const target = await redirectFrom(() => saveEventQuestions(formFor({ q_q1: "yes" })));

    expect(answerInvitationQuestionsIn).not.toHaveBeenCalled();
    expect(target).toBe(`/questions/${encodeURIComponent(TOKEN)}?error=${BUSY_ERROR}`);
    expect(target).not.toContain("revoked");
  });

  it("refuses an anonymous injected token without exposing a distinct outcome", async () => {
    const injected = "abc' or '1'='1";
    vi.mocked(resolveRsvpTokenIn).mockResolvedValue({
      state: "unknown",
      writable: false,
      invitation: null,
    });
    const form = new FormData();
    form.set("token", injected);
    form.set("q_q1", "anything");

    const target = await redirectFrom(() => saveEventQuestions(form));

    expect(resolveRsvpTokenIn).toHaveBeenCalledWith(expect.anything(), injected);
    expect(answerInvitationQuestionsIn).not.toHaveBeenCalled();
    expect(target).toBe(`/questions/${encodeURIComponent(injected)}?error=${BUSY_ERROR}`);
    expect(target).not.toContain("unknown");
  });

  it("is refused as busy once the link's own budget is spent, and records nothing", async () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await redirectFrom(() => saveEventQuestions(formFor({ q_q1: "true", qkind_q1: "boolean" })));
    }
    vi.mocked(answerInvitationQuestionsIn).mockClear();

    const target = await redirectFrom(() =>
      saveEventQuestions(formFor({ q_q1: "true", qkind_q1: "boolean" })),
    );

    expect(target).toContain(`error=${BUSY_ERROR}`);
    expect(answerInvitationQuestionsIn).not.toHaveBeenCalled();
  });
});
