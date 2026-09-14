/**
 * Questionnaire B's one write — LAN-206, moved to its own route by LAN-343.
 *
 * The service layer and the transaction are mocked. What is under test is the
 * action's own logic: the gate cookie is checked before any transaction opens,
 * the prospect is taken from the credential's own resolution and never from
 * the form, and every refusal lands on the same redirect without saying which
 * one it was.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/db", () => ({
  withTransaction: async (fn: (tx: unknown) => unknown) => fn({}),
}));
vi.mock("@/lib/services/recruitment-interest-tokens", () => ({
  resolveRecruitmentInterestTokenIn: vi.fn(),
}));
vi.mock("@/lib/services/recruitment-questionnaire", () => ({
  submitQuestionnaireBAnswersIn: vi.fn(),
}));

import { cookies } from "next/headers";
import { ANSWER_GATE_COOKIE } from "@/lib/rsvp/answer-gate";
import { resolveRecruitmentInterestTokenIn } from "@/lib/services/recruitment-interest-tokens";
import { submitQuestionnaireBAnswersIn } from "@/lib/services/recruitment-questionnaire";

import { submitInterestQuestionnaire } from "./actions";

const TOKEN = "interest-token-plaintext-00000000000000000000";
const PROSPECT_ID = "00000000-0000-4000-8000-000000000009";

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

function givenGateCookie(present: boolean): void {
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) => (present && name === ANSWER_GATE_COOKIE ? { value: "1" } : undefined),
  } as unknown as Awaited<ReturnType<typeof cookies>>);
}

beforeEach(() => {
  vi.clearAllMocks();
  givenGateCookie(true);
  vi.mocked(resolveRecruitmentInterestTokenIn).mockResolvedValue({
    state: "valid",
    resolved: {
      personId: "00000000-0000-4000-8000-000000000003",
      seasonId: "00000000-0000-4000-8000-000000000004",
      prospectId: PROSPECT_ID,
      displayName: "Recruit One",
    },
  });
  vi.mocked(submitQuestionnaireBAnswersIn).mockResolvedValue(undefined);
});

describe("the cookie gate", () => {
  it("refuses the write when the GET's cookie never came back", async () => {
    givenGateCookie(false);

    const target = await redirectFrom(() => submitInterestQuestionnaire(formFor()));

    expect(target).toBe(`/background/${encodeURIComponent(TOKEN)}`);
    expect(submitQuestionnaireBAnswersIn).not.toHaveBeenCalled();
  });
});

describe("a saved questionnaire", () => {
  it("writes against the prospect the credential resolves to, not one from the form", async () => {
    const form = formFor({ q_B1: "true", prospectId: "not-this-one" });

    const target = await redirectFrom(() => submitInterestQuestionnaire(form));

    expect(submitQuestionnaireBAnswersIn).toHaveBeenCalledWith(
      expect.anything(),
      PROSPECT_ID,
      expect.objectContaining({ playedBefore: "yes" }),
    );
    expect(target).toBe(`/background/${encodeURIComponent(TOKEN)}?saved=1`);
  });
});

describe("a credential this route does not accept", () => {
  it("writes nothing and says nothing about why", async () => {
    vi.mocked(resolveRecruitmentInterestTokenIn).mockResolvedValue({
      state: "unknown",
      resolved: null,
    });

    const target = await redirectFrom(() => submitInterestQuestionnaire(formFor({ q_B1: "true" })));

    expect(submitQuestionnaireBAnswersIn).not.toHaveBeenCalled();
    expect(target).toBe(`/background/${encodeURIComponent(TOKEN)}?saved=1`);
  });

  it("refuses an anonymous injected token without exposing a distinct outcome", async () => {
    const injected = "abc' or '1'='1";
    vi.mocked(resolveRecruitmentInterestTokenIn).mockResolvedValue({
      state: "unknown",
      resolved: null,
    });
    const form = new FormData();
    form.set("token", injected);
    form.set("q_B1", "true");

    const target = await redirectFrom(() => submitInterestQuestionnaire(form));

    expect(resolveRecruitmentInterestTokenIn).toHaveBeenCalledWith(expect.anything(), injected);
    expect(submitQuestionnaireBAnswersIn).not.toHaveBeenCalled();
    expect(target).toBe(`/background/${encodeURIComponent(injected)}?saved=1`);
    expect(target).not.toContain("unknown");
  });
});
