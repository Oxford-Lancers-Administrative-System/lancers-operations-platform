/**
 * LAN-172 correction round 2 (Q-22) — the durable page's own structure.
 *
 * Regression coverage for OWNER-LAN172-02 (the four approved sections, in
 * order), OWNER-LAN172-03 (the 21-day horizon's further-out section is
 * reachable, nothing hidden), and OWNER-LAN172-05 (the focused panel is the
 * one richly detailed answer surface — facts, social proof, the
 * other-invitations notice — Q-21's "same answer surface, opened in place").
 * The service layer is mocked; what is under test is the screen.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, withTransaction: vi.fn() };
});
vi.mock("@/lib/services/player-answer-tokens", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/player-answer-tokens")>();
  return { ...actual, resolvePersonTokenIn: vi.fn() };
});
vi.mock("@/lib/services/player-home", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/player-home")>();
  return {
    ...actual,
    readPlayerHomeIn: vi.fn(),
    readPlayerAnswerLandingIn: vi.fn(),
  };
});

import { withTransaction } from "@/lib/db";
import { resetRsvpRateLimit } from "@/lib/rsvp/public-surface";
import { resolvePersonTokenIn } from "@/lib/services/player-answer-tokens";
import {
  readPlayerAnswerLandingIn,
  readPlayerHomeIn,
  type PlayerAnswerLanding,
  type PlayerHome,
  type PlayerHomeInvitation,
} from "@/lib/services/player-home";
import PlayerHomePage from "./page";
import {
  ANSWERED_HEADING,
  FOLLOW_UP_HEADING,
  FURTHER_OUT_HEADING,
  NEW_INVITATIONS_HEADING,
  NO_REASON_GIVEN,
  STILL_NEED_ANSWER_HEADING,
} from "./presentation";

const TOKEN = "durable-token-plaintext-000000000000000000000";
const PERSON_ID = "00000000-0000-4000-8000-000000000003";
const SEASON_ID = "00000000-0000-4000-8000-000000000004";

function invitation(overrides: Partial<PlayerHomeInvitation>): PlayerHomeInvitation {
  return {
    invitationId: "00000000-0000-4000-8000-000000000001",
    eventId: "00000000-0000-4000-8000-000000000002",
    eventName: "Fresh invite",
    eventType: "practice",
    scheduledOn: "2026-10-14",
    startsAt: "20:00",
    endsAt: "22:00",
    venue: "Iffley Road Astro",
    responseDeadline: new Date("2026-10-13T17:00:00Z"),
    attendingCount: 0,
    reminderSent: false,
    standingAnswer: null,
    reason: null,
    reasonIsDefault: false,
    outstandingRequiredQuestions: 0,
    ...overrides,
  };
}

const NEW_ENTRY = invitation({ invitationId: "11111111-1111-4111-8111-111111111111" });
const STILL_NEED_ENTRY = invitation({
  invitationId: "22222222-2222-4222-8222-222222222222",
  eventName: "Chased invite",
  reminderSent: true,
});
const FOLLOW_UP_ENTRY = invitation({
  invitationId: "33333333-3333-4333-8333-333333333333",
  eventName: "No default reason",
  standingAnswer: "no",
  reason: "No reason given",
  reasonIsDefault: true,
});
const ANSWERED_ENTRY = invitation({
  invitationId: "44444444-4444-4444-8444-444444444444",
  eventName: "Settled Yes",
  standingAnswer: "yes",
});
const FURTHER_OUT_ENTRY = invitation({
  invitationId: "55555555-5555-4555-8555-555555555555",
  eventName: "Far off invite",
  scheduledOn: "2026-12-01",
});

const HOME: PlayerHome = {
  playerName: "Avery Fielding",
  outstandingCount: 2,
  nextInvitationId: STILL_NEED_ENTRY.invitationId,
  newInvitations: [NEW_ENTRY],
  stillNeedAnswer: [STILL_NEED_ENTRY],
  followUpNeeded: [FOLLOW_UP_ENTRY],
  answeredUpcoming: [ANSWERED_ENTRY],
  furtherOut: [FURTHER_OUT_ENTRY],
};

const LANDING: PlayerAnswerLanding = {
  attendingCount: 1,
  otherOutstandingCount: 2,
  questions: [],
  outstandingRequiredQuestions: 0,
};

function givenHome(home: PlayerHome = HOME) {
  vi.mocked(resolvePersonTokenIn).mockResolvedValue({
    state: "valid",
    resolved: { personId: PERSON_ID, seasonId: SEASON_ID },
  });
  vi.mocked(readPlayerHomeIn).mockResolvedValue(home);
  vi.mocked(readPlayerAnswerLandingIn).mockResolvedValue(LANDING);
}

async function renderPage(query: Record<string, string> = {}): Promise<ReturnType<typeof render>> {
  const element = await PlayerHomePage({
    params: Promise.resolve({ token: TOKEN }),
    searchParams: Promise.resolve(query),
  });
  return render(element);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetRsvpRateLimit();
  vi.mocked(withTransaction).mockImplementation(async (work: (tx: never) => unknown) =>
    work({ query: vi.fn() } as never),
  );
});

describe("OWNER-LAN172-02 — the four approved sections, in order", () => {
  it("renders New invitations, Still need your answer, Follow-up needed, then the answered archive, each with its own row", async () => {
    givenHome();
    const { container } = await renderPage();
    const text = container.textContent ?? "";

    const headings = [
      NEW_INVITATIONS_HEADING,
      STILL_NEED_ANSWER_HEADING,
      FOLLOW_UP_HEADING,
      ANSWERED_HEADING,
    ];
    const positions = headings.map((heading) => text.indexOf(heading));
    for (const position of positions) expect(position).toBeGreaterThan(-1);
    // The approved order — never a collapse back to two sections.
    expect(positions).toEqual([...positions].sort((a, b) => a - b));

    expect(text).toContain(NEW_ENTRY.eventName);
    expect(text).toContain(STILL_NEED_ENTRY.eventName);
    expect(text).toContain(FOLLOW_UP_ENTRY.eventName);
    expect(text).toContain(ANSWERED_ENTRY.eventName);
    expect(text).toContain(NO_REASON_GIVEN);
  });
});

describe("OWNER-LAN172-03 — the 21-day horizon's further-out section", () => {
  it("keeps a far-off invitation reachable, in its own openable section — nothing hidden", async () => {
    givenHome();
    const { container } = await renderPage();
    const text = container.textContent ?? "";

    expect(text).toContain(FURTHER_OUT_HEADING);
    expect(text).toContain(FURTHER_OUT_ENTRY.eventName);
  });
});

describe("OWNER-LAN172-05 — the focused panel is the one richly detailed answer surface", () => {
  it("carries the venue, deadline, standing-No alert and other-invitations notice — Q-21", async () => {
    givenHome();
    const { container } = await renderPage({ open: FOLLOW_UP_ENTRY.invitationId });
    const text = container.textContent ?? "";

    expect(text).toContain(FOLLOW_UP_ENTRY.venue as string);
    expect(text).toContain("Tuesday, 13 October at 18:00");
    expect(text).toMatch(/not attending/i);
    expect(text).toMatch(/no reason given/i);
    expect(text).toContain("2 other invitations");
  });
});
