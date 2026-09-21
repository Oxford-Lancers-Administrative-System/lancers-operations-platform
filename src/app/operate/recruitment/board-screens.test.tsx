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
import { act, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("@/lib/services/recruitment-board", () => ({ listRecruitmentBoard: vi.fn() }));
// LAN-404: the page reads the operator's own folded-away groups before it renders.
vi.mock("@/lib/services/operator-preferences", () => ({
  readOperatorPreferences: vi.fn().mockResolvedValue({}),
  writeRecruitmentCollapsedGroups: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./group-preference-actions", () => ({
  saveRecruitmentCollapsedGroupsAction: vi.fn().mockResolvedValue(undefined),
}));
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
import { readOperatorPreferences } from "@/lib/services/operator-preferences";
import { saveRecruitmentCollapsedGroupsAction } from "./group-preference-actions";
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
  vi.mocked(readOperatorPreferences).mockResolvedValue({});
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

/**
 * LAN-404 — Stewart, on the call of 2026-09-21: "Well, any version of the
 * roster should" have it. Brian, live: "Recruitment doesn't have it… That's an
 * easy enough feature to add." The roster board's collapse, on this board,
 * remembered on the operator's account and keyed so the two never collide.
 */
describe("which groups are folded away, remembered on the account", () => {
  const EVENTS = [
    { eventId: "event-1", name: "Taster session", date: "12 Oct" },
    { eventId: "event-2", name: "Freshers' fair", date: "05 Oct" },
  ];

  function givenPopulatedBoard(): void {
    givenBoard({
      events: EVENTS,
      rows: [],
      totalInSeason: 3,
    } as unknown as Partial<RecruitmentBoardData>);
  }

  beforeEach(() => {
    signedInAs(["secretary"]);
  });

  it("opens every group for an operator who has never said otherwise", async () => {
    givenPopulatedBoard();
    render(await RecruitmentBoardPage(pageProps()));

    const board = screen.getByTestId("recruitment-board");
    expect(within(board).getByTestId("band-toggle-person")).toBeInTheDocument();
    expect(within(board).getByTestId("band-toggle-recruitment")).toBeInTheDocument();
    expect(within(board).getByTestId("band-toggle-events:event-1")).toBeInTheDocument();
    expect(within(board).queryByTestId("band-collapsed-label-person")).not.toBeInTheDocument();
  });

  it("folds away exactly the groups the account stores, and nothing else", async () => {
    vi.mocked(readOperatorPreferences).mockResolvedValue({
      // `events:gone` names an event no longer on the board: a stale setting,
      // dropped rather than refused, exactly as the roster board drops one.
      recruitmentCollapsedGroups: ["recruitment", "events:gone"],
    });
    givenPopulatedBoard();
    render(await RecruitmentBoardPage(pageProps()));

    const board = screen.getByTestId("recruitment-board");
    expect(within(board).getByTestId("band-collapsed-label-recruitment")).toHaveTextContent(
      "Recruitment",
    );
    expect(within(board).queryByTestId("band-collapsed-label-person")).not.toBeInTheDocument();
  });

  it("does not read the roster's own setting", async () => {
    vi.mocked(readOperatorPreferences).mockResolvedValue({
      // The roster board also has a `person` group. Folding it there must not
      // fold this one.
      rosterCollapsedGroups: ["person", "kit"],
    });
    givenPopulatedBoard();
    render(await RecruitmentBoardPage(pageProps()));

    const board = screen.getByTestId("recruitment-board");
    expect(within(board).queryByTestId("band-collapsed-label-person")).not.toBeInTheDocument();
  });

  it("writes the whole set back once the toggling has settled", async () => {
    givenPopulatedBoard();
    render(await RecruitmentBoardPage(pageProps()));

    const board = screen.getByTestId("recruitment-board");
    // Arriving is not a change: what the board arrived holding is what the
    // account already stores.
    expect(saveRecruitmentCollapsedGroupsAction).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(within(board).getByTestId("band-toggle-recruitment"));
      fireEvent.click(within(board).getByTestId("band-toggle-events:event-2"));
    });
    // Debounced: two clicks in a moment are one write, of where they ended up.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 900));
    });

    expect(saveRecruitmentCollapsedGroupsAction).toHaveBeenCalledTimes(1);
    expect([...vi.mocked(saveRecruitmentCollapsedGroupsAction).mock.calls[0][0]].sort()).toEqual([
      "events:event-2",
      "recruitment",
    ]);
    // The folded group keeps one narrow cell with its own name down it.
    expect(within(board).getByTestId("band-collapsed-label-events:event-2")).toHaveTextContent(
      "Freshers' fair",
    );
  });
});
