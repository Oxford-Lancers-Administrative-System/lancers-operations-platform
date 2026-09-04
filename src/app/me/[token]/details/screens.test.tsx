/**
 * `/me/[token]/details` — LAN-216, the mission's only unauthenticated,
 * internet-reachable surface. The service layer is mocked; what is under
 * test is the screen and the token-resolution/throttle wiring around it —
 * acceptance criteria 1–4, 9, 10, 12.
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
vi.mock("@/lib/services/player-questionnaire", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/player-questionnaire")>();
  return { ...actual, readQuestionnaireViewIn: vi.fn() };
});

import { withTransaction } from "@/lib/db";
import {
  allowPlayerHomeRequest,
  RATE_LIMIT_MAX_PER_HOME_LINK,
  resetRsvpRateLimit,
  UNIFORM_TERMINAL_RESPONSE_MS,
} from "@/lib/rsvp/public-surface";
import { resolvePersonTokenIn } from "@/lib/services/player-answer-tokens";
import {
  readQuestionnaireViewIn,
  type QuestionnaireView,
} from "@/lib/services/player-questionnaire";
import type { PersonRecord } from "@/lib/services/person-record";
import PlayerDetailsPage from "./page";
import {
  ALREADY_COMPLETE_HEADING,
  CONSENT_ALREADY_GRANTED,
  CONSENT_LABEL,
  DETAILS_HEADING,
  DISPUTED_NOTICE,
} from "./presentation";

const TOKEN = "durable-token-plaintext-000000000000000000000";
const PERSON_ID = "00000000-0000-4000-8000-000000000003";
const SEASON_ID = "00000000-0000-4000-8000-000000000004";
const MEMBERSHIP_ID = "00000000-0000-4000-8000-000000000005";

function personRecord(overrides: Partial<PersonRecord> = {}): PersonRecord {
  return {
    personId: PERSON_ID,
    givenName: "Jordan",
    givenNameSource: null,
    familyName: "Ashworth",
    familyNameSource: null,
    aliases: [],
    displayName: "Jordan Ashworth",
    status: "onboarding",
    college: null,
    collegeSource: null,
    matriculationYear: null,
    matriculationYearSource: null,
    expectedGraduationYear: null,
    expectedGraduationYearSource: null,
    degreeField: null,
    degreeFieldSource: null,
    dateOfBirth: null,
    dateOfBirthSource: null,
    emergencyContact: null,
    contacts: [],
    isPastMember: false,
    standingIsOverridden: false,
    isUnder18: null,
    halfBlueCount: 0,
    fullBlueCount: 0,
    mergedIntoPersonId: null,
    missingRequiredFields: [],
    ...overrides,
  };
}

function view(overrides: Partial<QuestionnaireView> = {}): QuestionnaireView {
  return {
    personId: PERSON_ID,
    seasonId: SEASON_ID,
    seasonLabel: "2026-27",
    membershipId: MEMBERSHIP_ID,
    person: personRecord(),
    emergencyContact: null,
    consent: null,
    needsConsentStep: true,
    missingRequiredFields: [],
    detailsComplete: false,
    openDisputedFields: new Set(),
    agreements: { code_of_conduct: null, photo_release: null },
    itemStatus: {
      code_of_conduct: "pending",
      photo_release: "pending",
      bucs_play: "pending",
      hudl_access: "pending",
    },
    nothingOutstanding: false,
    outstandingSections: [],
    nextStep: "details",
    ...overrides,
  };
}

function givenValid(v: QuestionnaireView = view()) {
  vi.mocked(resolvePersonTokenIn).mockResolvedValue({
    state: "valid",
    resolved: { personId: PERSON_ID, seasonId: SEASON_ID },
  });
  vi.mocked(readQuestionnaireViewIn).mockResolvedValue(v);
}

async function renderPage(query: Record<string, string> = {}) {
  const element = await PlayerDetailsPage({
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

describe("acceptance 1 — resolving the token", () => {
  it("renders 404 for an unknown, revoked or closed-season token alike", async () => {
    vi.mocked(resolvePersonTokenIn).mockResolvedValue({ state: "unknown", resolved: null });
    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renders 404 for a well-formed but answer-shaped (single-use) token", async () => {
    // `resolvePersonTokenIn` itself refuses any single-use token — proven at
    // its own suite; here the route must still 404 when it reports `unknown`.
    vi.mocked(resolvePersonTokenIn).mockResolvedValue({ state: "unknown", resolved: null });
    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renders the page for a valid, resolved token", async () => {
    givenValid();
    const { container } = await renderPage();
    expect(container.textContent).toContain(DETAILS_HEADING);
  });
});

describe("acceptance 2 — throttling and uniform timing", () => {
  it("logs a throttled request and still 404s, never a distinguishable error", async () => {
    const logSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Exhaust the per-link allowance before the page ever resolves the token.
    for (let i = 0; i < RATE_LIMIT_MAX_PER_HOME_LINK; i += 1) {
      allowPlayerHomeRequest("203.0.113.9", TOKEN);
    }

    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/player-home.*rate limit/i));
    logSpy.mockRestore();
  });

  it("holds an unresolved token to the same uniform floor a valid one is never held to on its terminal path", async () => {
    vi.mocked(resolvePersonTokenIn).mockResolvedValue({ state: "unknown", resolved: null });
    const startedAt = Date.now();
    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
    const elapsed = Date.now() - startedAt;
    expect(elapsed).toBeGreaterThanOrEqual(UNIFORM_TERMINAL_RESPONSE_MS - 20);
  });
});

describe("acceptance 3 — the consent tick is the form's first field", () => {
  it("renders the tick before every other input when consent is still needed", async () => {
    givenValid(view({ needsConsentStep: true }));
    const { container } = await renderPage();
    const text = container.textContent ?? "";
    const consentIndex = text.indexOf(CONSENT_LABEL);
    const firstNameIndex = text.indexOf("First name");
    expect(consentIndex).toBeGreaterThan(-1);
    expect(consentIndex).toBeLessThan(firstNameIndex);
  });

  it("asks nothing when consent already carries — a flipped recruit's own state", async () => {
    givenValid(view({ needsConsentStep: false }));
    const { container } = await renderPage();
    const text = container.textContent ?? "";
    expect(text).not.toContain(CONSENT_LABEL);
    expect(text).toContain(CONSENT_ALREADY_GRANTED);
  });
});

describe("acceptance 4 — no way to untick consent", () => {
  it("never renders a control named to remove or withdraw consent", async () => {
    givenValid(view({ needsConsentStep: false }));
    const { container } = await renderPage();
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    for (const box of checkboxes) {
      expect(box.getAttribute("name")).not.toMatch(/withdraw|revoke|untick|remove.*consent/i);
    }
  });
});

describe("acceptance 9 — placeholder wording is labelled", () => {
  it("marks the Code of Conduct pane as placeholder", async () => {
    givenValid(view({ nextStep: "code_of_conduct" }));
    const { container } = await renderPage({ step: "code_of_conduct" });
    expect(container.textContent).toMatch(/PLACEHOLDER/);
  });
});

describe("acceptance 10 — the finishing page lists outstanding by section", () => {
  it("links each outstanding item back to its own step", async () => {
    givenValid(
      view({
        nextStep: "done",
        outstandingSections: [
          { section: "Your details", items: [{ label: "Degree field", step: "details" }] },
          {
            section: "BUCS Play",
            items: [{ label: "Confirm you have registered", step: "bucs_play" }],
          },
        ],
      }),
    );
    const { container } = await renderPage({ step: "done" });
    const links = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(links).toContain(`/me/${TOKEN}/details?step=details`);
    expect(links).toContain(`/me/${TOKEN}/details?step=bucs_play`);
  });
});

describe("acceptance 12 — the privacy notice on every screen", () => {
  it("shows it on the details step", async () => {
    givenValid(view());
    const { container } = await renderPage();
    expect(container.textContent).toMatch(/secure page shows only your own record/i);
  });

  it("shows it on the already-complete page", async () => {
    givenValid(view({ nothingOutstanding: true, nextStep: "done", outstandingSections: [] }));
    const { container } = await renderPage();
    expect(container.textContent).toContain(ALREADY_COMPLETE_HEADING);
    expect(container.textContent).toMatch(/secure page shows only your own record/i);
  });
});

describe("acceptance 11 — the disputed notice", () => {
  it("shows on a field with an open dispute, and not otherwise", async () => {
    givenValid(view({ openDisputedFields: new Set(["college"]) }));
    const { container } = await renderPage();
    expect(container.textContent).toContain(DISPUTED_NOTICE);
  });

  it("stays silent when nothing is disputed", async () => {
    givenValid(view());
    const { container } = await renderPage();
    expect(container.textContent).not.toContain(DISPUTED_NOTICE);
  });
});
