/**
 * The durable page's own writes — LAN-172.
 *
 * The service layer is mocked. What is under test is the action's own logic:
 * it always re-resolves the durable token before writing, it never trusts an
 * invitation id without that resolution succeeding, and a blank reason routes
 * back to the same focused panel rather than the uniform refusal. The writes
 * themselves are proved against the real database in
 * `src/lib/services/player-home.test.ts`.
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
vi.mock("@/lib/services/player-home", () => ({
  answerEventQuestionsIn: vi.fn(),
  recordPlayerHomeAnswerIn: vi.fn(),
}));
vi.mock("@/lib/services/player-answer-tokens", () => ({
  resolvePersonTokenIn: vi.fn(),
  NO_REASON_GIVEN_DEFAULT: "No reason given",
}));

import { ConstraintViolated } from "@/lib/db";
import { resetRsvpRateLimit } from "@/lib/rsvp/public-surface";
import { answerEventQuestionsIn, recordPlayerHomeAnswerIn } from "@/lib/services/player-home";
import { resolvePersonTokenIn } from "@/lib/services/player-answer-tokens";
import { changeToYes, submitNo, submitQuestions } from "./actions";

const TOKEN = "durable-token-plaintext-000000000000000000000";
const INVITATION_ID = "00000000-0000-4000-8000-000000000002";
const PERSON_ID = "00000000-0000-4000-8000-000000000003";

function formFor(fields: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.set("token", TOKEN);
  form.set("invitationId", INVITATION_ID);
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

beforeEach(() => {
  vi.clearAllMocks();
  resetRsvpRateLimit();
  vi.mocked(resolvePersonTokenIn).mockResolvedValue({
    state: "valid",
    resolved: { personId: PERSON_ID, seasonId: "00000000-0000-4000-8000-000000000004" },
  });
  vi.mocked(recordPlayerHomeAnswerIn).mockResolvedValue(undefined);
  vi.mocked(answerEventQuestionsIn).mockResolvedValue(undefined);
});

describe("changeToYes", () => {
  it("re-resolves the token and records Yes against the resolved person, not the form", async () => {
    const target = await redirectFrom(() => changeToYes(formFor()));

    expect(recordPlayerHomeAnswerIn).toHaveBeenCalledWith(
      expect.anything(),
      PERSON_ID,
      INVITATION_ID,
      {
        response: "yes",
      },
    );
    expect(target).toBe(
      `/me/${encodeURIComponent(TOKEN)}?open=${encodeURIComponent(INVITATION_ID)}`,
    );
  });

  it("refuses uniformly when the durable token no longer resolves", async () => {
    vi.mocked(resolvePersonTokenIn).mockResolvedValue({ state: "unknown", resolved: null });

    const target = await redirectFrom(() => changeToYes(formFor()));

    expect(recordPlayerHomeAnswerIn).not.toHaveBeenCalled();
    expect(target).toBe(`/me/${encodeURIComponent(TOKEN)}`);
  });

  it("refuses an anonymous injected token without exposing a distinct outcome", async () => {
    const injected = "abc' or '1'='1";
    vi.mocked(resolvePersonTokenIn).mockResolvedValueOnce({ state: "unknown", resolved: null });
    const form = new FormData();
    form.set("token", injected);
    form.set("invitationId", INVITATION_ID);

    const target = await redirectFrom(() => changeToYes(form));

    expect(resolvePersonTokenIn).toHaveBeenCalledWith(expect.anything(), injected);
    expect(target).toBe(`/me/${encodeURIComponent(injected)}`);
    expect(recordPlayerHomeAnswerIn).not.toHaveBeenCalled();
  });
});

describe("submitNo", () => {
  it("records the reason the form carried, and returns to the focused panel", async () => {
    const target = await redirectFrom(() => submitNo(formFor({ reason: "Academic conflict" })));

    expect(recordPlayerHomeAnswerIn).toHaveBeenCalledWith(
      expect.anything(),
      PERSON_ID,
      INVITATION_ID,
      {
        response: "no",
        reason: "Academic conflict",
      },
    );
    expect(target).toBe(
      `/me/${encodeURIComponent(TOKEN)}?open=${encodeURIComponent(INVITATION_ID)}`,
    );
  });

  it("returns to the same panel with a recoverable error on a blank reason, not the uniform refusal", async () => {
    vi.mocked(recordPlayerHomeAnswerIn).mockRejectedValueOnce(
      new ConstraintViolated("Choose a reason before saving Not attending.", {
        rule: "rsvp_responses_no_requires_a_reason",
      }),
    );

    const target = await redirectFrom(() => submitNo(formFor({ reason: "" })));

    expect(target).toBe(
      `/me/${encodeURIComponent(TOKEN)}?open=${encodeURIComponent(INVITATION_ID)}&reasonError=1`,
    );
  });

  it("records the honest default when the row's own No control carries no reason at all — Q-22, REQ-no-reason-given", async () => {
    const target = await redirectFrom(() => submitNo(formFor({ reason: "", defaultOk: "1" })));

    expect(recordPlayerHomeAnswerIn).toHaveBeenCalledWith(
      expect.anything(),
      PERSON_ID,
      INVITATION_ID,
      {
        response: "no",
        reason: "No reason given",
      },
    );
    expect(target).toBe(
      `/me/${encodeURIComponent(TOKEN)}?open=${encodeURIComponent(INVITATION_ID)}`,
    );
  });

  it("still requires real text from the dedicated 'give a reason' form, which never sends defaultOk", async () => {
    vi.mocked(recordPlayerHomeAnswerIn).mockRejectedValueOnce(
      new ConstraintViolated("Choose a reason before saving Not attending.", {
        rule: "rsvp_responses_no_requires_a_reason",
      }),
    );

    const target = await redirectFrom(() => submitNo(formFor({ reason: "  " })));

    expect(recordPlayerHomeAnswerIn).toHaveBeenCalledWith(
      expect.anything(),
      PERSON_ID,
      INVITATION_ID,
      {
        response: "no",
        reason: "  ",
      },
    );
    expect(target).toBe(
      `/me/${encodeURIComponent(TOKEN)}?open=${encodeURIComponent(INVITATION_ID)}&reasonError=1`,
    );
  });
});

describe("submitQuestions", () => {
  it("parses a text, a boolean and a choice answer from the form's kind-tagged fields", async () => {
    const form = formFor();
    form.set("q_q1", "Vegetarian");
    form.set("qkind_q1", "text");
    form.set("q_q2", "true");
    form.set("qkind_q2", "boolean");
    form.set("q_q3", "M");
    form.set("qkind_q3", "choice");

    await redirectFrom(() => submitQuestions(form));

    expect(answerEventQuestionsIn).toHaveBeenCalledWith(
      expect.anything(),
      PERSON_ID,
      INVITATION_ID,
      [
        { questionId: "q1", text: "Vegetarian" },
        { questionId: "q2", boolean: true },
        { questionId: "q3", choice: "M" },
      ],
    );
  });

  it("skips a question the player left blank rather than saving an empty answer", async () => {
    const form = formFor();
    form.set("q_q1", "");
    form.set("qkind_q1", "text");

    await redirectFrom(() => submitQuestions(form));

    expect(answerEventQuestionsIn).toHaveBeenCalledWith(
      expect.anything(),
      PERSON_ID,
      INVITATION_ID,
      [],
    );
  });
});

describe("throttling", () => {
  it("refuses further writes to the same durable link once its allowance is spent", async () => {
    for (let attempt = 0; attempt < 240; attempt += 1) {
      await redirectFrom(() => changeToYes(formFor()));
    }
    vi.mocked(recordPlayerHomeAnswerIn).mockClear();

    await redirectFrom(() => changeToYes(formFor()));

    expect(recordPlayerHomeAnswerIn).not.toHaveBeenCalled();
  });
});
