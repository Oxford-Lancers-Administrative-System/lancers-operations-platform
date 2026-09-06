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
  type EventQuestionForAnswer,
  type PlayerAnswerLanding,
  type PlayerHome,
  type PlayerHomeInvitation,
} from "@/lib/services/player-home";
import PlayerHomePage from "./page";
import {
  ANSWERED_HEADING,
  CHANGE_TO_NO,
  CHANGE_TO_YES,
  EMPTY_HELP,
  FOLLOW_UP_HEADING,
  FOLLOW_UP_ONLY_HEADING,
  FOLLOW_UP_ONLY_HELP,
  FURTHER_OUT_SUMMARY,
  NEW_INVITATIONS_HEADING,
  NO_OUTSTANDING_EVENTS,
  NO_REASON_GIVEN,
  pageHeading,
  QUESTIONS_RECORDED,
  REASON_LABEL,
  REASON_PLACEHOLDER,
  SAVE_QUESTIONS,
  SAVE_REASON,
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

    expect(text).toContain(FURTHER_OUT_SUMMARY);
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

const QUESTION: EventQuestionForAnswer = {
  id: "00000000-0000-4000-8000-0000000000aa",
  prompt: "Can you drive?",
  answerType: "boolean",
  choices: null,
  isRequired: true,
  currentAnswer: null,
};

const OPTIONAL_QUESTION: EventQuestionForAnswer = {
  id: "00000000-0000-4000-8000-0000000000bb",
  prompt: "Any dietary needs?",
  answerType: "text",
  choices: null,
  isRequired: false,
  currentAnswer: null,
};

const YES_ENTRY = invitation({
  invitationId: "66666666-6666-4666-8666-666666666666",
  eventName: "Yes with questions",
  standingAnswer: "yes",
});

function homeWithFocused(entry: PlayerHomeInvitation): PlayerHome {
  return {
    playerName: "Avery Fielding",
    outstandingCount: 0,
    nextInvitationId: null,
    newInvitations: [],
    stillNeedAnswer: [],
    followUpNeeded: [],
    answeredUpcoming: [entry],
    furtherOut: [],
  };
}

describe("OWNER-LAN172-07 — the heading count matches the rendered main list", () => {
  it("keeps outstandingCount and the visible near-term rows in agreement", async () => {
    givenHome();
    const { container } = await renderPage();
    const text = container.textContent ?? "";

    const rendered = HOME.newInvitations.length + HOME.stillNeedAnswer.length;
    expect(HOME.outstandingCount).toBe(rendered);
    expect(text).toContain(pageHeading(HOME.outstandingCount, HOME.followUpNeeded.length > 0));
  });

  it("shows zero outstanding when the only unanswered work is beyond the horizon, in Further ahead", async () => {
    const farOnly: PlayerHome = {
      playerName: "Avery Fielding",
      outstandingCount: 0,
      nextInvitationId: null,
      newInvitations: [],
      stillNeedAnswer: [],
      followUpNeeded: [],
      answeredUpcoming: [],
      furtherOut: [FURTHER_OUT_ENTRY],
    };
    givenHome(farOnly);
    const { container } = await renderPage();
    const text = container.textContent ?? "";

    expect(text).toContain(pageHeading(0, false));
    expect(text).toContain(FURTHER_OUT_ENTRY.eventName);
  });
});

describe("OWNER-LAN172-14 — the heading never denies live follow-up work", () => {
  it("shows a follow-up heading, not 'No outstanding events', when nothing new is unanswered but a standing answer still owes a reason or a question", async () => {
    // Brian saw "No outstanding events — you have answered every invitation
    // waiting for you. Nothing else needs an answer right now." directly
    // above an open, required question form. outstandingCount counts only
    // response === null, so it is legitimately zero here — the heading's
    // own claim is what was false.
    const followUpOnly: PlayerHome = {
      playerName: "Avery Fielding",
      outstandingCount: 0,
      nextInvitationId: null,
      newInvitations: [],
      stillNeedAnswer: [],
      followUpNeeded: [FOLLOW_UP_ENTRY],
      answeredUpcoming: [],
      furtherOut: [],
    };
    givenHome(followUpOnly);
    const { container } = await renderPage();
    const text = container.textContent ?? "";

    expect(text).toContain(FOLLOW_UP_ONLY_HEADING);
    expect(text).not.toContain(FOLLOW_UP_ONLY_HELP);
    expect(text).not.toContain(NO_OUTSTANDING_EVENTS);
    expect(text).not.toContain(EMPTY_HELP);
    expect(text).not.toMatch(/nothing else needs an answer/i);
  });

  it("keeps the genuinely empty heading when there is no outstanding work and no follow-up either", async () => {
    const trulyEmpty: PlayerHome = {
      playerName: "Avery Fielding",
      outstandingCount: 0,
      nextInvitationId: null,
      newInvitations: [],
      stillNeedAnswer: [],
      followUpNeeded: [],
      answeredUpcoming: [],
      furtherOut: [],
    };
    givenHome(trulyEmpty);
    const { container } = await renderPage();
    const text = container.textContent ?? "";

    expect(text).toContain(NO_OUTSTANDING_EVENTS);
    expect(text).not.toContain(EMPTY_HELP);
  });
});

describe("OWNER-LAN172-08 — saving questions ends in a plain acknowledgement, not the same form", () => {
  it("shows the questions form while a required question is still outstanding", async () => {
    givenHome(homeWithFocused({ ...YES_ENTRY, outstandingRequiredQuestions: 1 }));
    vi.mocked(readPlayerAnswerLandingIn).mockResolvedValue({
      attendingCount: 0,
      otherOutstandingCount: 0,
      questions: [QUESTION],
      outstandingRequiredQuestions: 1,
    });

    const { container } = await renderPage({ open: YES_ENTRY.invitationId });
    const text = container.textContent ?? "";

    expect(text).toContain(SAVE_QUESTIONS);
    expect(text).not.toContain(QUESTIONS_RECORDED);
  });

  it("replaces the form with 'Answer recorded' once nothing required remains — Brian: 'it just goes blank'", async () => {
    givenHome(homeWithFocused({ ...YES_ENTRY, outstandingRequiredQuestions: 0 }));
    vi.mocked(readPlayerAnswerLandingIn).mockResolvedValue({
      attendingCount: 0,
      otherOutstandingCount: 0,
      questions: [{ ...QUESTION, currentAnswer: { text: null, boolean: true, choice: null } }],
      outstandingRequiredQuestions: 0,
    });

    const { container } = await renderPage({ open: YES_ENTRY.invitationId });
    const text = container.textContent ?? "";

    expect(text).toContain(QUESTIONS_RECORDED);
    expect(text).not.toContain(SAVE_QUESTIONS);
  });

  it("still shows the form for an event whose questions are ALL optional and unanswered — LAN-172-r4-F1", async () => {
    // outstandingRequiredQuestions is structurally 0 here — there is no
    // required question at all, not "the required ones are done" — so the
    // round-3 gate (outstandingRequiredQuestions > 0) hid this form on every
    // visit, forever, contradicting W2's "optional questions remain visibly
    // optional." This is the case the round-4 review proved live.
    givenHome(homeWithFocused({ ...YES_ENTRY, outstandingRequiredQuestions: 0 }));
    vi.mocked(readPlayerAnswerLandingIn).mockResolvedValue({
      attendingCount: 0,
      otherOutstandingCount: 0,
      questions: [OPTIONAL_QUESTION],
      outstandingRequiredQuestions: 0,
    });

    const { container } = await renderPage({ open: YES_ENTRY.invitationId });
    const text = container.textContent ?? "";

    expect(text).toContain(SAVE_QUESTIONS);
    expect(text).not.toContain(QUESTIONS_RECORDED);
  });

  it("collapses an all-optional event to the acknowledgement once its own optional question is answered", async () => {
    givenHome(homeWithFocused({ ...YES_ENTRY, outstandingRequiredQuestions: 0 }));
    vi.mocked(readPlayerAnswerLandingIn).mockResolvedValue({
      attendingCount: 0,
      otherOutstandingCount: 0,
      questions: [
        { ...OPTIONAL_QUESTION, currentAnswer: { text: "None", boolean: null, choice: null } },
      ],
      outstandingRequiredQuestions: 0,
    });

    const { container } = await renderPage({ open: YES_ENTRY.invitationId });
    const text = container.textContent ?? "";

    expect(text).toContain(QUESTIONS_RECORDED);
    expect(text).not.toContain(SAVE_QUESTIONS);
  });

  it("keeps Brian's approved mixed-event rule: collapses once the required question is answered, even with an optional one still blank", async () => {
    givenHome(homeWithFocused({ ...YES_ENTRY, outstandingRequiredQuestions: 0 }));
    vi.mocked(readPlayerAnswerLandingIn).mockResolvedValue({
      attendingCount: 0,
      otherOutstandingCount: 0,
      questions: [
        { ...QUESTION, currentAnswer: { text: null, boolean: true, choice: null } },
        OPTIONAL_QUESTION,
      ],
      outstandingRequiredQuestions: 0,
    });

    const { container } = await renderPage({ open: YES_ENTRY.invitationId });
    const text = container.textContent ?? "";

    expect(text).toContain(QUESTIONS_RECORDED);
    expect(text).not.toContain(SAVE_QUESTIONS);
  });
});

describe("OWNER-LAN172-09 — the standing-No panel leads with the reason, not the exit", () => {
  it("puts the reason field ahead of Change to Yes, drops the error alert, renames Save, and drops the answer-like placeholder", async () => {
    givenHome();
    const { container } = await renderPage({ open: FOLLOW_UP_ENTRY.invitationId });
    const text = container.textContent ?? "";

    const reasonPosition = text.indexOf(REASON_LABEL);
    const changeToYesPosition = text.indexOf(CHANGE_TO_YES);
    expect(reasonPosition).toBeGreaterThan(-1);
    expect(changeToYesPosition).toBeGreaterThan(-1);
    expect(reasonPosition).toBeLessThan(changeToYesPosition);

    expect(text).toContain(SAVE_REASON);
    expect(SAVE_REASON).toBe("Save");
    expect(container.querySelector(".MuiAlert-colorError")).toBeNull();
    expect(text).not.toContain("Academic conflict");
    expect(REASON_PLACEHOLDER).not.toBe("Academic conflict");
  });
});

describe("OWNER-LAN172-18 — the panel's own questions form is unaffected by /a/[token]'s fix", () => {
  it("keeps the native `required` attribute here — this Save never gates the already-standing Yes", async () => {
    // `/a/[token]` passes `enforceRequired={false}` because its confirm
    // button and its questions share one `<form>`. This panel's own
    // `submitQuestions` form is different: the Yes it belongs to already
    // stands by the time this form is on screen, so `required` here only
    // ever blocks this form's own Save, never the answer — it keeps
    // `QuestionField`'s own default.
    givenHome(homeWithFocused({ ...YES_ENTRY, outstandingRequiredQuestions: 1 }));
    vi.mocked(readPlayerAnswerLandingIn).mockResolvedValue({
      attendingCount: 0,
      otherOutstandingCount: 0,
      questions: [QUESTION],
      outstandingRequiredQuestions: 1,
    });

    const { container } = await renderPage({ open: YES_ENTRY.invitationId });

    const field = container.querySelector(`input[name="q_${QUESTION.id}"]`);
    expect(field).not.toBeNull();
    expect(field).toHaveAttribute("required");
  });
});

describe("OWNER-LAN172-19 — changing to Yes opens the panel, never closes it", () => {
  it("renders the row's Change-to-Yes control with no hidden close field", async () => {
    givenHome();
    const { container } = await renderPage();

    const changeToYesForms = Array.from(container.querySelectorAll("form")).filter((form) =>
      (form.textContent ?? "").includes(CHANGE_TO_YES),
    );
    expect(changeToYesForms.length).toBeGreaterThan(0);
    for (const form of changeToYesForms) {
      expect(form.querySelector('input[name="close"]')).toBeNull();
    }
  });

  it("renders the panel's own Change-to-Yes control (standing No) with no hidden close field either", async () => {
    // The focused entry is filtered out of its own row section (see
    // OWNER-LAN172-20 below), so the panel's own form is the only place this
    // control appears — proving it directly, without scoping to the panel.
    givenHome();
    const { container } = await renderPage({ open: FOLLOW_UP_ENTRY.invitationId });

    const changeToYesForm = Array.from(container.querySelectorAll("form")).find((form) =>
      (form.textContent ?? "").includes(CHANGE_TO_YES),
    );
    expect(changeToYesForm).toBeTruthy();
    expect(changeToYesForm?.querySelector('input[name="close"]')).toBeNull();
  });
});

describe("OWNER-LAN172-20 — the opened invitation renders exactly once", () => {
  it("does not also render the focused invitation as a plain row in its own section", async () => {
    givenHome();
    const { container } = await renderPage({ open: FOLLOW_UP_ENTRY.invitationId });
    const text = container.textContent ?? "";

    // The panel itself is the one card. Before this fix, the same event's
    // name and its row-level controls (Change to Yes / Add reason) also
    // rendered again, further down, in "Follow-up needed".
    const nameOccurrences = (text.match(new RegExp(FOLLOW_UP_ENTRY.eventName, "g")) ?? []).length;
    expect(nameOccurrences).toBe(1);

    const changeToYesButtons = Array.from(container.querySelectorAll("button")).filter(
      (button) => button.textContent === CHANGE_TO_YES,
    );
    expect(changeToYesButtons).toHaveLength(1);
  });

  it("drops the section heading entirely once its one entry was the focused invitation", async () => {
    const onlyFollowUp: PlayerHome = {
      playerName: "Avery Fielding",
      outstandingCount: 0,
      nextInvitationId: null,
      newInvitations: [],
      stillNeedAnswer: [],
      followUpNeeded: [FOLLOW_UP_ENTRY],
      answeredUpcoming: [],
      furtherOut: [],
    };
    givenHome(onlyFollowUp);
    const { container } = await renderPage({ open: FOLLOW_UP_ENTRY.invitationId });
    const text = container.textContent ?? "";

    expect(text).not.toContain(FOLLOW_UP_HEADING);
  });

  it("still renders a different, un-opened invitation in its own section", async () => {
    givenHome();
    const { container } = await renderPage({ open: FOLLOW_UP_ENTRY.invitationId });
    const text = container.textContent ?? "";

    expect(text).toContain(ANSWERED_ENTRY.eventName);
    expect(text).toContain(NEW_ENTRY.eventName);
  });
});

describe("OWNER-LAN172-11 — the row's secondary control reads 'Change answer'", () => {
  it("labels the plain Attending row's secondary control 'Change answer', not 'Change to No'", async () => {
    givenHome();
    const { container } = await renderPage();
    const text = container.textContent ?? "";

    expect(CHANGE_TO_NO).toBe("Change answer");
    expect(text).toContain("Change answer");
    expect(text).not.toContain("Change to No");
    // The paired affirmative control keeps its own wording and filled treatment.
    expect(container.querySelector(".MuiButton-contained.MuiButton-colorPrimary")).not.toBeNull();
  });
});
