/**
 * `/operate/recruitment` — the recruitment board's own page-level gate.
 *
 * Walk correction: `REQ-core-four` is a security requirement, and the
 * mission's final walk could not verify coach-role exclusion here (browser
 * extension interference blocked the seeded `+coach` login, judged low risk
 * because the gate is pre-existing and shipped). This proves it directly
 * against the real page: a coaching-only identity is refused before
 * `listRecruitmentBoard()` is ever read, and the four offices are admitted —
 * on the same real-page-render model `../roster/board-screens.test.tsx`
 * already uses for `REQ-authority`. Ordinary board behaviour (search,
 * filters, columns) is already proved in `recruitment-board-view.test.tsx`
 * and `board-data.test.ts`; this file exists for the gate alone.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("@/lib/services/recruitment-board", () => ({ listRecruitmentBoard: vi.fn() }));
// The board's own row-level status/flip controls, mocked so rendering the
// admitted-role case never reaches a service — those writes are proved for
// real in `board-actions.test.ts` and `recruitment-prospect.test.ts`.
vi.mock("./board-actions", () => ({
  setRecruitmentStatusAction: vi.fn().mockResolvedValue({ error: null }),
  flipRecruitmentProspectAction: vi.fn().mockResolvedValue({ error: null }),
}));

import { resolveOperatorAccess, type OperatorAccess } from "@/lib/auth/operator";
import type { RecruitmentBoardData } from "@/lib/services/recruitment-board";
import { listRecruitmentBoard } from "@/lib/services/recruitment-board";
import RecruitmentBoardPage from "./page";

function operatorAccess(roleCodes: string[]): OperatorAccess {
  return {
    state: "active",
    operator: {
      authUserId: "11111111-1111-4111-8111-111111111111",
      personId: "22222222-2222-4222-8222-222222222222",
      displayName: "Rowan Ashdown",
      roleCodes,
      isActive: true,
    },
  };
}

function signedInAs(roleCodes: string[]): void {
  vi.mocked(resolveOperatorAccess).mockResolvedValue(operatorAccess(roleCodes));
}

function pageProps(query: Record<string, string> = {}) {
  return {
    params: Promise.resolve({}),
    searchParams: Promise.resolve(query),
  } as unknown as Parameters<typeof RecruitmentBoardPage>[0];
}

function givenBoard(overrides: Partial<RecruitmentBoardData> = {}): void {
  vi.mocked(listRecruitmentBoard).mockResolvedValue({
    season: { id: "season-1", label: "2026-27", status: "open", startsOn: null, endsOn: null },
    rows: [],
    events: [],
    totalInSeason: 0,
    ...overrides,
  } as RecruitmentBoardData);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("REQ-authority / REQ-core-four — coach-role exclusion, the walk's own gap", () => {
  for (const role of ["head_coach", "offence_coach", "defence_coach"]) {
    it(`refuses a ${role}-only operator before the board is ever read`, async () => {
      signedInAs([role]);
      givenBoard();

      render(await RecruitmentBoardPage(pageProps()));

      expect(screen.getByTestId("operator-not-permitted")).toBeInTheDocument();
      expect(listRecruitmentBoard).not.toHaveBeenCalled();
      expect(screen.queryByTestId("recruitment-board")).not.toBeInTheDocument();
    });
  }

  for (const role of ["president", "vice_president", "secretary", "general_manager"]) {
    it(`admits the ${role} seat`, async () => {
      signedInAs([role]);
      givenBoard();

      render(await RecruitmentBoardPage(pageProps()));

      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Recruitment");
      expect(listRecruitmentBoard).toHaveBeenCalled();
    });
  }
});
