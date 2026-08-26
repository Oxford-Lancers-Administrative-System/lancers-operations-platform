/**
 * The answer link's one write, and its cookie gate — LAN-172, Q-11.
 *
 * The service layer and the database transaction are mocked. What is under
 * test here is the action's own logic: it checks the gate cookie before ever
 * opening a transaction, it never distinguishes "no cookie" from any other
 * closed-link reason, and a successful write always redirects to the durable
 * page, focused on the invitation just answered. The write itself is proved
 * against the real database in `src/lib/services/player-answer-tokens.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/db", () => ({
  withTransaction: async (fn: (tx: unknown) => unknown) => fn({}),
}));
vi.mock("@/lib/services/player-answer-tokens", () => ({
  consumeAnswerTokenIn: vi.fn(),
  issuePersonTokenIn: vi.fn(),
}));
vi.mock("@/lib/services/player-home", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/player-home")>();
  return { ...actual, answerEventQuestionsIn: vi.fn() };
});

import { cookies } from "next/headers";
import { ANSWER_GATE_COOKIE } from "@/lib/rsvp/answer-gate";
import { resetRsvpRateLimit } from "@/lib/rsvp/public-surface";
import { consumeAnswerTokenIn, issuePersonTokenIn } from "@/lib/services/player-answer-tokens";
import { answerEventQuestionsIn } from "@/lib/services/player-home";
import { submitAnswer } from "./actions";
import { ERROR_PARAM } from "./params";
import { BUSY_ERROR } from "./presentation";

const TOKEN = "y.11111111-1111-1111-1111-111111111111.abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLM012";

function formFor(): FormData {
  const form = new FormData();
  form.set("token", TOKEN);
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

function givenGateCookie(present: boolean): void {
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) => (present && name === ANSWER_GATE_COOKIE ? { value: "1" } : undefined),
  } as unknown as Awaited<ReturnType<typeof cookies>>);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetRsvpRateLimit();
  givenGateCookie(true);
  vi.mocked(consumeAnswerTokenIn).mockResolvedValue({
    invitationId: "00000000-0000-4000-8000-000000000002",
    answer: "yes",
    personId: "00000000-0000-4000-8000-000000000003",
    seasonId: "00000000-0000-4000-8000-000000000004",
    recorded: true,
  });
  vi.mocked(issuePersonTokenIn).mockResolvedValue({
    token: "durable-token-plaintext-000000000000000000000",
    tokenId: "00000000-0000-4000-8000-000000000005",
  });
});

describe("the cookie gate", () => {
  it("refuses the write, uniformly, when the GET's cookie never came back", async () => {
    givenGateCookie(false);

    const target = await redirectFrom(() => submitAnswer(formFor()));

    expect(target).toBe(`/a/${encodeURIComponent(TOKEN)}`);
    expect(consumeAnswerTokenIn).not.toHaveBeenCalled();
  });

  it("proceeds to record the answer once the cookie is present", async () => {
    await redirectFrom(() => submitAnswer(formFor()));
    expect(consumeAnswerTokenIn).toHaveBeenCalledWith(expect.anything(), TOKEN, expect.anything());
  });
});

describe("a successful answer", () => {
  it("ends on the durable page, focused on the invitation just answered", async () => {
    const target = await redirectFrom(() => submitAnswer(formFor()));

    expect(target).toBe(
      `/me/${encodeURIComponent("durable-token-plaintext-000000000000000000000")}?open=00000000-0000-4000-8000-000000000002`,
    );
  });

  it("mints the durable token from the resolved person and season, not from the form", async () => {
    await redirectFrom(() => submitAnswer(formFor()));

    expect(issuePersonTokenIn).toHaveBeenCalledWith(
      expect.anything(),
      "00000000-0000-4000-8000-000000000003",
      "00000000-0000-4000-8000-000000000004",
    );
  });
});

describe("a closed answer link", () => {
  it("redirects back to the same link without a distinguishable reason", async () => {
    vi.mocked(consumeAnswerTokenIn).mockRejectedValueOnce(new Error("closed"));

    const target = await redirectFrom(() => submitAnswer(formFor()));

    expect(target).toBe(`/a/${encodeURIComponent(TOKEN)}`);
    expect(target).not.toContain("closed");
  });

  it("never mints a durable token when the answer could not be recorded", async () => {
    vi.mocked(consumeAnswerTokenIn).mockRejectedValueOnce(new Error("closed"));

    await redirectFrom(() => submitAnswer(formFor()));

    expect(issuePersonTokenIn).not.toHaveBeenCalled();
  });

  it("refuses an anonymous injected token without exposing a distinct outcome", async () => {
    const injected = "abc' or '1'='1";
    const form = new FormData();
    form.set("token", injected);
    vi.mocked(consumeAnswerTokenIn).mockRejectedValueOnce(new Error("unknown token"));

    const target = await redirectFrom(() => submitAnswer(form));

    expect(consumeAnswerTokenIn).toHaveBeenCalledWith(
      expect.anything(),
      injected,
      expect.anything(),
    );
    expect(target).toBe(`/a/${encodeURIComponent(injected)}`);
    expect(target).not.toContain("unknown");
  });
});

describe("a throttled submission", () => {
  it("is refused as busy, and records nothing", async () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await redirectFrom(() => submitAnswer(formFor()));
    }
    vi.mocked(consumeAnswerTokenIn).mockClear();

    const target = await redirectFrom(() => submitAnswer(formFor()));

    expect(target).toContain(`${ERROR_PARAM}=${BUSY_ERROR}`);
    expect(consumeAnswerTokenIn).not.toHaveBeenCalled();
  });
});

describe("OWNER-LAN172-12 — the landing page's own questions save with the answer", () => {
  it("saves the event's own questions in the same submit that records Yes", async () => {
    const form = formFor();
    form.set("q_q1", "true");
    form.set("qkind_q1", "boolean");

    await redirectFrom(() => submitAnswer(form));

    expect(answerEventQuestionsIn).toHaveBeenCalledWith(
      expect.anything(),
      "00000000-0000-4000-8000-000000000003",
      "00000000-0000-4000-8000-000000000002",
      [{ questionId: "q1", boolean: true }],
    );
  });

  it("never saves questions against a No — there is nothing to ask", async () => {
    vi.mocked(consumeAnswerTokenIn).mockResolvedValue({
      invitationId: "00000000-0000-4000-8000-000000000002",
      answer: "no",
      personId: "00000000-0000-4000-8000-000000000003",
      seasonId: "00000000-0000-4000-8000-000000000004",
      recorded: true,
    });
    const form = formFor();
    form.set("q_q1", "true");
    form.set("qkind_q1", "boolean");

    await redirectFrom(() => submitAnswer(form));

    expect(answerEventQuestionsIn).not.toHaveBeenCalled();
  });
});

describe("OWNER-LAN172-13 — the landing page's own reason and its two forward controls", () => {
  it("passes the player's own typed reason through to the recording write", async () => {
    const form = formFor();
    form.set("reason", "Family commitment");

    await redirectFrom(() => submitAnswer(form));

    expect(consumeAnswerTokenIn).toHaveBeenCalledWith(expect.anything(), TOKEN, {
      response: undefined,
      reason: "Family commitment",
    });
  });

  it("records Yes instead of No when 'Change to Yes' is the control that was clicked", async () => {
    const form = formFor();
    form.set("intent", "change-to-yes");

    await redirectFrom(() => submitAnswer(form));

    expect(consumeAnswerTokenIn).toHaveBeenCalledWith(expect.anything(), TOKEN, {
      response: "yes",
      reason: "",
    });
  });

  it("records No instead of Yes when the Yes page's 'Plans changed?' shortcut is used", async () => {
    const form = formFor();
    form.set("intent", "change-to-no");

    await redirectFrom(() => submitAnswer(form));

    expect(consumeAnswerTokenIn).toHaveBeenCalledWith(expect.anything(), TOKEN, {
      response: "no",
      reason: "",
    });
  });
});
