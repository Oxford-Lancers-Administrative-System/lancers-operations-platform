/**
 * LAN-172 correction round 2 (Q-22) — the answer link's own facts.
 *
 * Regression coverage for OWNER-LAN172-01: the fact block leading with the
 * player's name, then venue, response deadline and their answer, and the No
 * heading no longer asserting the standing-No default as settled fact before
 * the tap that actually records it. The service layer is mocked; what is
 * under test is the screen.
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
  return { ...actual, resolveAnswerTokenIn: vi.fn() };
});
vi.mock("@/lib/services/player-home", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/player-home")>();
  return { ...actual, readPlayerAnswerLandingIn: vi.fn() };
});
vi.mock("@/lib/services/rsvp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/rsvp")>();
  return { ...actual, readSignedRsvpPageIn: vi.fn() };
});

import { withTransaction } from "@/lib/db";
import { resetRsvpRateLimit } from "@/lib/rsvp/public-surface";
import {
  resolveAnswerTokenIn,
  type AnswerTokenResolution,
} from "@/lib/services/player-answer-tokens";
import {
  readPlayerAnswerLandingIn,
  type EventQuestionForAnswer,
  type PlayerAnswerLanding,
} from "@/lib/services/player-home";
import { readSignedRsvpPageIn, type SignedRsvpPage } from "@/lib/services/rsvp";
import { NO_BUTTON_LABEL } from "@/lib/delivery/templates";
import AnswerLinkPage from "./page";
import {
  NO_HEADING,
  YES_CONFIRM_NO_QUESTIONS,
  YES_CONFIRM_WITH_QUESTIONS,
  YES_HEADING,
} from "./presentation";

const QUESTION: EventQuestionForAnswer = {
  id: "00000000-0000-4000-8000-0000000000aa",
  prompt: "Can you drive?",
  answerType: "boolean",
  choices: null,
  isRequired: true,
  currentAnswer: null,
};

const TOKEN = "y.00000000-0000-4000-8000-000000000079.abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLM01";

const BASE: SignedRsvpPage = {
  invitationId: "00000000-0000-4000-8000-000000000079",
  eventName: "Team Practice",
  eventType: "game",
  eventStatus: "approved",
  scheduledOn: "2026-10-14",
  startsAt: "20:00",
  endsAt: "22:30",
  venue: "Iffley Road Astro",
  eventStartsAt: new Date("2026-10-14T19:00:00Z"),
  playerName: "Avery Fielding",
  responseDeadline: new Date("2026-10-13T17:00:00Z"),
  currentResponse: null,
};

const LANDING: PlayerAnswerLanding = {
  attendingCount: 1,
  otherOutstandingCount: 2,
  questions: [],
  outstandingRequiredQuestions: 0,
};

function givenAnswer(answer: "yes" | "no", questions: readonly EventQuestionForAnswer[] = []) {
  const resolution: AnswerTokenResolution = {
    state: "valid",
    answer,
    invitation: {
      invitationId: BASE.invitationId,
      eventId: "00000000-0000-4000-8000-0000000000ee",
      eventName: BASE.eventName,
      eventStatus: BASE.eventStatus,
      scheduledOn: BASE.scheduledOn,
    },
    writable: true,
    consumed: false,
  };
  vi.mocked(resolveAnswerTokenIn).mockResolvedValue(resolution);
  vi.mocked(readSignedRsvpPageIn).mockResolvedValue(BASE);
  vi.mocked(readPlayerAnswerLandingIn).mockResolvedValue({ ...LANDING, questions });
}

async function renderPage(): Promise<ReturnType<typeof render>> {
  const element = await AnswerLinkPage({
    params: Promise.resolve({ token: TOKEN }),
    searchParams: Promise.resolve({}),
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

describe("OWNER-LAN172-01 — the restored fact block", () => {
  it("leads with the player's name, then venue, response deadline and their answer", async () => {
    givenAnswer("yes");
    const text = (await renderPage()).container.textContent ?? "";

    expect(text).toContain("Avery Fielding");
    expect(text).toContain("Iffley Road Astro");
    expect(text).toContain("Tuesday, 13 October at 18:00");
    expect(text).toContain(YES_HEADING);
  });

  it("carries live social proof and the other-invitations notice", async () => {
    givenAnswer("yes");
    const text = (await renderPage()).container.textContent ?? "";

    expect(text).toMatch(/already attending/i);
    expect(text).toContain("2 other invitations");
  });
});

describe("OWNER-LAN172-01 — the No heading no longer over-claims before the tap", () => {
  it("does not assert the standing-No default before the answer is recorded — REQ-click-is-the-answer", async () => {
    givenAnswer("no");
    const text = (await renderPage()).container.textContent ?? "";

    expect(text).toContain(NO_HEADING);
    // The regression this proves: the heading used to read "You're not
    // attending — no reason given" on the side-effect-free GET, asserting a
    // standing-No default that does not exist until the POST records it.
    expect(text).not.toMatch(/no reason given/i);
  });
});

describe("OWNER-LAN172-10 — the on-page confirm button names what happens next, not the message's own label", () => {
  it("says 'Save options' for a Yes with questions still waiting, not the WhatsApp link text", async () => {
    givenAnswer("yes", [QUESTION]);
    const text = (await renderPage()).container.textContent ?? "";

    expect(text).toContain(YES_CONFIRM_WITH_QUESTIONS);
    expect(text).not.toContain("view details");
  });

  it("says 'Go see other events' for a Yes with no questions", async () => {
    givenAnswer("yes", []);
    const text = (await renderPage()).container.textContent ?? "";

    expect(text).toContain(YES_CONFIRM_NO_QUESTIONS);
  });

  it("leaves the No button reusing the message's own label — Brian did not single it out", async () => {
    givenAnswer("no");
    const text = (await renderPage()).container.textContent ?? "";

    expect(text).toContain(NO_BUTTON_LABEL);
  });
});
