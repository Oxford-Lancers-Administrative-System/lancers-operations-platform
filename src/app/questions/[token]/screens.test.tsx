/**
 * The nudge's own page — LAN-343.
 *
 * The nudge is the one message about an event's outstanding questions, and it
 * used to link at `/rsvp/<t>`, which asks nothing: the questions were
 * reachable only by expanding a row on the player's events page. This file
 * proves the page that message now reaches — the questions themselves, the
 * invitation resolved from the token alone with no query string, and one
 * uniform refusal for every reason the link may no longer be used.
 *
 * The service layer is mocked; what is under test is the screen.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, withTransaction: vi.fn() };
});
vi.mock("@/lib/services/rsvp-tokens", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/rsvp-tokens")>();
  return { ...actual, resolveRsvpTokenIn: vi.fn() };
});
vi.mock("@/lib/services/rsvp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/rsvp")>();
  return { ...actual, readSignedRsvpPageIn: vi.fn() };
});
vi.mock("@/lib/services/player-home", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/player-home")>();
  return { ...actual, readPlayerAnswerLandingIn: vi.fn() };
});

import { withTransaction } from "@/lib/db";
import { resetRsvpRateLimit } from "@/lib/rsvp/public-surface";
import { readPlayerAnswerLandingIn, type EventQuestionForAnswer } from "@/lib/services/player-home";
import { readSignedRsvpPageIn, type SignedRsvpPage } from "@/lib/services/rsvp";
import { resolveRsvpTokenIn, type TokenState } from "@/lib/services/rsvp-tokens";

import EventQuestionsPage from "./page";
import { NOTHING_OUTSTANDING_NOTE, QUESTIONS_HEADING, SAVE_QUESTIONS } from "./presentation";

const TOKEN = "rsvp-token-plaintext-0000000000000000000000";
const INVITATION_ID = "00000000-0000-4000-8000-000000000002";

const PAGE: SignedRsvpPage = {
  invitationId: INVITATION_ID,
  capacity: "player",
  eventName: "Team Practice",
  templateName: "Practice",
  eventType: "training",
  eventStatus: "approved",
  scheduledOn: "2026-10-01",
  startsAt: "19:00",
  endsAt: "21:00",
  venue: "Marston",
  description: null,
  requiredEquipment: null,
  eventStartsAt: new Date("2026-10-01T18:00:00Z"),
  playerName: "Player One",
  responseDeadline: null,
  currentResponse: { response: "yes", reason: null, respondedAt: new Date() },
};

const QUESTION: EventQuestionForAnswer = {
  id: "q1",
  prompt: "Do you need a lift?",
  answerType: "text",
  choices: null,
  isRequired: true,
  currentAnswer: null,
};

function given(state: TokenState, questions: readonly EventQuestionForAnswer[]): void {
  vi.mocked(resolveRsvpTokenIn).mockResolvedValue({
    state,
    writable: state === "valid",
    invitation:
      state === "unknown"
        ? null
        : {
            invitationId: INVITATION_ID,
            eventId: "00000000-0000-4000-8000-000000000006",
            eventName: PAGE.eventName,
            eventStatus: PAGE.eventStatus,
            startsAt: PAGE.eventStartsAt,
            inviteeName: "Player",
            expiresAt: PAGE.eventStartsAt,
          },
  });
  vi.mocked(readSignedRsvpPageIn).mockResolvedValue(PAGE);
  vi.mocked(readPlayerAnswerLandingIn).mockResolvedValue({
    attendingCount: 4,
    otherOutstandingCount: 0,
    questions,
    outstandingRequiredQuestions: questions.length,
  });
}

async function renderPage(query: Record<string, string> = {}) {
  const element = await EventQuestionsPage({
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

describe("the nudge's page", () => {
  it("asks the event's own questions, with the event named beside them", async () => {
    given("valid", [QUESTION]);

    await renderPage();

    expect(screen.getByText(QUESTIONS_HEADING)).not.toBeNull();
    expect(screen.getByText(QUESTION.prompt)).not.toBeNull();
    expect(screen.getByRole("button", { name: SAVE_QUESTIONS })).not.toBeNull();
    expect(screen.getByText(/Team Practice/)).not.toBeNull();
  });

  it("carries the token in a hidden field and no query string of its own", async () => {
    given("valid", [QUESTION]);

    const { container } = await renderPage();

    const hidden = container.querySelector('input[name="token"]');
    expect(hidden?.getAttribute("value")).toBe(TOKEN);
  });

  it("says there is nothing left when the questions are all answered or gone", async () => {
    given("valid", []);

    await renderPage();

    expect(screen.getByText(NOTHING_OUTSTANDING_NOTE)).not.toBeNull();
    expect(screen.queryByRole("button", { name: SAVE_QUESTIONS })).toBeNull();
  });

  // LAN-79's uniform terminal contract, inherited. Every reason this link may
  // no longer be used reads identically, and none of them renders the form.
  const TERMINAL: TokenState[] = [
    "unknown",
    "expired",
    "revoked",
    "superseded",
    "event_started",
    "cancelled",
  ];

  it.each(TERMINAL)("renders one uniform refusal for a %s link", async (state) => {
    given(state, [QUESTION]);

    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
