/**
 * F-A3, LAN-180. `openMyPage`'s own logic — the signed-in entry point's one
 * write. The service layer and the database transaction are mocked, matching
 * `src/app/a/[token]/actions.test.ts`'s own convention for this exact shape
 * of action; the credential it mints is proved against the real database in
 * `src/lib/services/player-answer-tokens.test.ts`, unchanged by this ticket.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/db", () => ({
  withTransaction: async (fn: (tx: unknown) => unknown) => fn({}),
}));
vi.mock("@/lib/auth/operator", () => ({
  resolveOperator: vi.fn(),
}));
vi.mock("@/lib/services/seasons", () => ({
  readCurrentSeasonIn: vi.fn(),
}));
vi.mock("@/lib/services/player-answer-tokens", () => ({
  issuePersonTokenIn: vi.fn(),
}));

import { resolveOperator } from "@/lib/auth/operator";
import { readCurrentSeasonIn } from "@/lib/services/seasons";
import { issuePersonTokenIn } from "@/lib/services/player-answer-tokens";
import { openMyPage } from "./actions";

const OPERATOR = {
  authUserId: "00000000-0000-4000-8000-000000000001",
  personId: "00000000-0000-4000-8000-000000000002",
  displayName: "Rowan Ashworth",
  roleCodes: [],
  isActive: true,
};

const SEASON = {
  id: "00000000-0000-4000-8000-000000000003",
  label: "2026/27",
  status: "current" as const,
  startsOn: "2026-09-01",
  endsOn: "2027-06-30",
};

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
  vi.mocked(resolveOperator).mockResolvedValue(OPERATOR);
  vi.mocked(readCurrentSeasonIn).mockResolvedValue(SEASON as never);
  vi.mocked(issuePersonTokenIn).mockResolvedValue({
    token: "durable-token-plaintext-000000000000000000000",
    tokenId: "00000000-0000-4000-8000-000000000004",
  });
});

describe("an anonymous request", () => {
  it("redirects to /login with its own destination intact, and mints nothing", async () => {
    vi.mocked(resolveOperator).mockResolvedValue(null);

    const target = await redirectFrom(() => openMyPage());

    expect(target).toBe("/login?redirectTo=%2Fme");
    expect(issuePersonTokenIn).not.toHaveBeenCalled();
  });
});

describe("a signed-in request", () => {
  it("mints the durable credential scoped to the signed-in person and the current season", async () => {
    await redirectFrom(() => openMyPage());

    expect(issuePersonTokenIn).toHaveBeenCalledWith(
      expect.anything(),
      OPERATOR.personId,
      SEASON.id,
      { actorPersonId: OPERATOR.personId },
    );
  });

  it("redirects to the durable page carrying the freshly minted token", async () => {
    const target = await redirectFrom(() => openMyPage());

    expect(target).toBe("/me/durable-token-plaintext-000000000000000000000");
  });

  it("never trusts a stored identity — it resolves the session itself, every call", async () => {
    await redirectFrom(() => openMyPage());
    expect(resolveOperator).toHaveBeenCalledTimes(1);
  });
});
