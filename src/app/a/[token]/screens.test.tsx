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
// OWNER-LAN172-17, interaction-gated by Q-30 (round 7). `AutoSubmitOnInteraction`
// is a client component that only submits after a genuine interaction event,
// so stubbing it is not strictly required to keep this file's plain
// `render()` calls from invoking the real (unmocked-here) `submitAnswer`
// action — but stubbing keeps this file about the screen, not the listener.
// Its own behaviour — that it never fires from mounting alone, fires exactly
// once after a qualifying interaction, and survives remount/Strict-Mode
// double-invocation without double-firing — is proved in isolation by
// `auto-submit.test.tsx`; what this file proves is only that the screen
// wires it to the right form id and gates it on `busy`.
vi.mock("./auto-submit", () => ({
  AutoSubmitOnInteraction: ({ formId }: { formId: string }) => (
    <div data-testid="auto-submit-stub" data-form-id={formId} />
  ),
}));

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
import { ANSWER_FORM_ID, ERROR_PARAM } from "./params";
import {
  BUSY_ERROR,
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
  capacity: "player",
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

async function renderPage(query: Record<string, string> = {}): Promise<ReturnType<typeof render>> {
  const element = await AnswerLinkPage({
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

describe("OWNER-LAN172-01 — the restored fact block", () => {
  it("leads with the player's name, then venue, response deadline and their answer", async () => {
    givenAnswer("yes");
    const text = (await renderPage()).container.textContent ?? "";

    expect(text).toContain("Avery Fielding");
    expect(text).toContain("Iffley Road Astro");
    expect(text).toContain("Tuesday, 13 October at 6:00 pm");
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

describe("OWNER-LAN172-17 — the WhatsApp tap auto-submits, in a JS-capable browser", () => {
  it("wires the primary confirm form's own id into the auto-submit trigger", async () => {
    givenAnswer("yes");
    const { container, getByTestId } = await renderPage();

    expect(container.querySelector(`form#${ANSWER_FORM_ID}`)).not.toBeNull();
    expect(getByTestId("auto-submit-stub")).toHaveAttribute("data-form-id", ANSWER_FORM_ID);
  });

  it("wires the same trigger on the No landing too — any answer auto-submits, not only Yes", async () => {
    givenAnswer("no");
    const { getByTestId } = await renderPage();

    expect(getByTestId("auto-submit-stub")).toHaveAttribute("data-form-id", ANSWER_FORM_ID);
  });

  it("does not re-fire the trigger while a throttled retry's own busy banner is showing", async () => {
    // A page already reached by a redirect from a refused, rate-limited
    // submit must not immediately auto-fire another one — see
    // `auto-submit.tsx`'s own doc comment. The visible button, and the
    // human reading `BUSY_MESSAGE`, are what remain for this one case.
    givenAnswer("yes");
    const { queryByTestId } = await renderPage({ [ERROR_PARAM]: BUSY_ERROR });

    expect(queryByTestId("auto-submit-stub")).toBeNull();
  });
});

describe("OWNER-LAN172-18 — the answer is never gated on a required question", () => {
  it("renders the required question's own field without the native `required` attribute", async () => {
    // `question-field.tsx`'s own `enforceRequired={false}` for this surface
    // is what this proves: a blank required question must never block the
    // one `<form>` that also records the answer — neither the auto-submit
    // nor a human's own click on the no-JS fallback button.
    givenAnswer("yes", [QUESTION]);
    const { container } = await renderPage();

    const field = container.querySelector('input[name="q_00000000-0000-4000-8000-0000000000aa"]');
    expect(field).not.toBeNull();
    expect(field).not.toHaveAttribute("required");
  });
});

// ---------------------------------------------------------------------------
// LAN-203 — a recruit's own reduced confirm screen
// ---------------------------------------------------------------------------

const RECRUIT_BASE: SignedRsvpPage = { ...BASE, capacity: "recruit", playerName: "" };

function givenRecruitAnswer(answer: "yes" | "no") {
  givenAnswer(answer, [QUESTION]);
  vi.mocked(readSignedRsvpPageIn).mockResolvedValue(RECRUIT_BASE);
  // A recruit's invitation carries no event questions in practice
  // (`event_questions.applies_to_capacities` is never seeded with
  // `recruit`), but even the "yes, there is one" case must not render it —
  // this proves the branch, not the data.
  vi.mocked(readPlayerAnswerLandingIn).mockResolvedValue({ ...LANDING, questions: [QUESTION] });
}

describe("LAN-203, REQ-recruit-sees-public-only — a recruit's confirm screen", () => {
  it("never shows the player-name fact, the attending count, or the other-outstanding notice", async () => {
    givenRecruitAnswer("yes");
    const { container, queryByText } = await renderPage();

    expect(container.textContent).not.toContain("Avery Fielding");
    expect(queryByText(/other people have already said yes/i)).toBeNull();
    expect(queryByText(/still need to answer/i)).toBeNull();
  });

  it("never renders the event's own questions, even where one exists", async () => {
    givenRecruitAnswer("yes");
    const { container } = await renderPage();

    expect(
      container.querySelector('input[name="q_00000000-0000-4000-8000-0000000000aa"]'),
    ).toBeNull();
    expect(container.textContent).not.toMatch(/can you drive/i);
  });

  it("never renders a reason field, or any of the player No-page's reason controls, on a No", async () => {
    givenRecruitAnswer("no");
    const { container, queryByText } = await renderPage();

    expect(container.querySelector('textarea[name="reason"], input[name="reason"]')).toBeNull();
    expect(queryByText(NO_BUTTON_LABEL)).toBeNull();
    expect(queryByText(/give a reason and continue/i)).toBeNull();
    expect(queryByText(/change to yes/i)).toBeNull();
  });

  it("offers exactly one plain confirm button, on both Yes and No", async () => {
    givenRecruitAnswer("yes");
    const yes = await renderPage();
    expect(yes.container.querySelectorAll('button[type="submit"]')).toHaveLength(1);
    yes.unmount();

    givenRecruitAnswer("no");
    const no = await renderPage();
    expect(no.container.querySelectorAll('button[type="submit"]')).toHaveLength(1);
  });

  it("still wires the same auto-submit trigger to the same form id", async () => {
    givenRecruitAnswer("yes");
    const { container, getByTestId } = await renderPage();

    expect(container.querySelector(`form#${ANSWER_FORM_ID}`)).not.toBeNull();
    expect(getByTestId("auto-submit-stub")).toHaveAttribute("data-form-id", ANSWER_FORM_ID);
  });

  it("still shows the event's own public venue, when there is one", async () => {
    givenRecruitAnswer("yes");
    const { container } = await renderPage();

    expect(container.textContent).toContain(RECRUIT_BASE.venue);
  });

  it("lands on its own saved page once the token is consumed — submitAnswer's redirect target, resolved", async () => {
    // `submitAnswer` (actions.ts) sends a recruit back to this exact route
    // rather than to `/me/[token]`; by the time this GET re-resolves the
    // token it is already consumed, and that is what this proves renders —
    // "Your response is saved", never the player copy naming "your own page".
    givenRecruitAnswer("no");
    vi.mocked(resolveAnswerTokenIn).mockResolvedValue({
      state: "valid",
      answer: "no",
      invitation: {
        invitationId: RECRUIT_BASE.invitationId,
        eventId: "00000000-0000-4000-8000-0000000000ee",
        eventName: RECRUIT_BASE.eventName,
        eventStatus: RECRUIT_BASE.eventStatus,
        scheduledOn: RECRUIT_BASE.scheduledOn,
      },
      writable: false,
      consumed: true,
    });

    const { container } = await renderPage();

    expect(container.textContent).toMatch(/your response is saved/i);
    expect(container.textContent).not.toMatch(/your own page/i);
  });
});
