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

describe("OWNER-LAN172-13 — the No heading, restored to W2's own words", () => {
  it("leads with 'You're not attending — no reason given', per W2's No-path section verbatim", async () => {
    // Owner correction round 5 supersedes round 2's LAN-172-c2: the Mission
    // Lead read W2-answer-an-invitation.md lines 160-190 in full and quoted
    // it directly — "Lead with You're not attending — no reason given... The
    // wording must never suggest the No is unrecorded until a reason
    // arrives. The click already recorded it." Q-11 is unaffected: this GET
    // still writes nothing; the heading describes the player's own WhatsApp
    // choice and the reason field's honest current value, not a database row.
    givenAnswer("no");
    const text = (await renderPage()).container.textContent ?? "";

    expect(text).toContain(NO_HEADING);
    expect(NO_HEADING).toBe("You're not attending — no reason given");
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

  it("no longer shows a single confirm button reusing the message's own No label — OWNER-LAN172-13 replaced it", async () => {
    // The round-3 single "No give reason" confirm button (reusing
    // NO_BUTTON_LABEL, Q-10's message-only contract) no longer exists on
    // this page: round 5 replaces it with the reason field and the two
    // forward controls W2's No-path section names.
    givenAnswer("no");
    const text = (await renderPage()).container.textContent ?? "";

    expect(text).not.toContain(NO_BUTTON_LABEL);
  });
});

describe("OWNER-LAN172-12 — the Yes landing asks the event's own questions itself", () => {
  it("renders the applicable question inline, in the same page as the confirm button — no second click to a second page", async () => {
    // Brian: "If I have the yes option, the answers should be yes. I
    // shouldn't have to click twice to get to the answers." W2 line 61: the
    // Yes landing "asks applicable event questions."
    givenAnswer("yes", [QUESTION]);
    const { container } = await renderPage();
    const text = container.textContent ?? "";

    expect(text).toContain(QUESTION.prompt);
    // One <form>, one submit — the question field and the confirm button
    // share it, so one click saves both.
    const form = container.querySelector("form");
    expect(form?.textContent ?? "").toContain(QUESTION.prompt);
    expect(form?.textContent ?? "").toContain(YES_CONFIRM_WITH_QUESTIONS);
  });

  it("renders no question section for a Yes with no applicable questions", async () => {
    givenAnswer("yes", []);
    const { container } = await renderPage();
    const text = container.textContent ?? "";

    expect(text).not.toContain("A couple of questions");
  });

  it("still offers 'Plans changed?' to change to No, visually secondary, per W2's Yes-path section", async () => {
    givenAnswer("yes", [QUESTION]);
    const text = (await renderPage()).container.textContent ?? "";

    expect(text).toContain("Plans changed? You can change your answer.");
  });
});

describe("OWNER-LAN172-13 — the No landing takes the reason itself", () => {
  it("renders the reason field, 'Give a reason and continue', and 'Change to Yes' as the two forward controls", async () => {
    // Brian: "If I click no on the answer, I should go to the page, and I
    // should have the reason sit in there."
    givenAnswer("no");
    const { container } = await renderPage();
    const text = container.textContent ?? "";

    expect(container.querySelector('input[name="reason"], textarea[name="reason"]')).not.toBeNull();
    expect(text).toContain("Give a reason and continue");
    expect(text).toContain("Change to Yes");
  });

  it("offers no separate continue control competing with 'Give a reason and continue'", async () => {
    givenAnswer("no");
    const { container } = await renderPage();
    const buttons = Array.from(container.querySelectorAll("button")).map(
      (button) => button.textContent,
    );

    // Exactly two forward controls on the No page: the reason form's own
    // pair. No third "confirm"/"continue" button competes with either.
    expect(buttons.filter((label) => /continue/i.test(label ?? ""))).toHaveLength(1);
  });
});
