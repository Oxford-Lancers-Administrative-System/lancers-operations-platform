/**
 * `/onboarding/[token]` — LAN-216, the mission's only unauthenticated,
 * internet-reachable surface. The service layer is mocked; what is under
 * test is the screen and the token-resolution/throttle wiring around it —
 * acceptance criteria 1–4, 9, 10, 12.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  STEP_ORDER,
  type QuestionnaireView,
} from "@/lib/services/player-questionnaire";
import type { PersonRecord } from "@/lib/services/person-record";
import PlayerDetailsPage from "./page";
import {
  AGREE_AND_CONTINUE,
  ALREADY_COMPLETE_HEADING,
  BUCS_CLAIM_SUBNOTE,
  BUCS_CONTINUE_ANYWAY_NOTE,
  bucsLeagueYear,
  CLOSE,
  CONSENT_ALREADY_GRANTED,
  CONSENT_HEADING,
  CONSENT_LABEL,
  DETAILS_HEADING,
  DISPUTED_NOTICE,
  HUDL_CLAIM_LABEL,
  HUDL_LEAD,
  HUDL_LINK_NOT_PUBLISHED,
  IF_SOMETHING_WRONG_HEADING,
  R3G_REASSURANCE,
  stepLabel,
  WHAT_CLUB_HAS_HEADING,
} from "./presentation";

const TOKEN = "durable-token-plaintext-000000000000000000000";
const PERSON_ID = "00000000-0000-4000-8000-000000000003";
const SEASON_ID = "00000000-0000-4000-8000-000000000004";
const MEMBERSHIP_ID = "00000000-0000-4000-8000-000000000005";

/** The Code of Conduct's row, as LAN-214's migration seeded it and LAN-282 still owes. */
const PLACEHOLDER_BODY =
  "Placeholder — the Code of Conduct's real wording is Clint's, tracked as LAN-213.";

/**
 * A photo release row shaped like the real one — enough sections to prove the
 * step lays the form out in the form's order. The wording actually shipped is
 * asserted against the migrated row in `photo-release-step.test.tsx`.
 */
const CONSENT_FORM_BODY = [
  "[[heading]]",
  "Photograph / filming / interview consent form",
  "[[lead]]",
  "This is a consent form for photos, film or voice recording for the activities below.",
  "[[event]]",
  "Event",
  "[[date]]",
  "Date",
  "[[name]]",
  "Name",
  "[[address]]",
  "Address",
  "[[postcode]]",
  "Post code:",
  "[[tel]]",
  "Tel:",
  "[[email]]",
  "Email:",
  "[[agree]]",
  "I agree to the terms",
  "[[print-name]]",
  "Print name",
].join("\n");

function agreementVersion(
  agreementType: "code_of_conduct" | "photo_release",
  versionLabel: string,
  body: string,
  pdfPath: string | null = null,
) {
  return {
    id: `00000000-0000-4000-8000-00000000000${agreementType === "photo_release" ? "7" : "6"}`,
    agreementType,
    versionLabel,
    body,
    pdfPath,
    effectiveFrom: new Date("2026-09-14T00:00:00Z"),
  } as const;
}

function personRecord(overrides: Partial<PersonRecord> = {}): PersonRecord {
  return {
    personId: PERSON_ID,
    givenName: "Jordan",
    givenNameSource: null,
    middleName: null,
    middleNameSource: null,
    familyName: "Ashworth",
    familyNameSource: null,
    aliases: [],
    displayName: "Jordan Ashworth",
    knownAs: null,
    status: "onboarding",
    college: null,
    collegeSource: null,
    matriculationYear: null,
    matriculationYearSource: null,
    expectedGraduationYear: null,
    expectedGraduationYearSource: null,
    degreeField: null,
    degreeFieldSource: null,
    studentNumber: null,
    studentNumberSource: null,
    bafaRegistrationNumber: null,
    bafaRegistrationNumberSource: null,
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
    fieldSuppliedBy: {
      given_name: null,
      middle_name: null,
      family_name: null,
      college: null,
      matriculation_year: null,
      expected_graduation_year: null,
      degree_field: null,
      student_number: null,
      bafa_registration_number: null,
      date_of_birth: null,
    },
    agreements: { code_of_conduct: null, photo_release: null },
    agreementVersions: {
      code_of_conduct: agreementVersion("code_of_conduct", "placeholder-v1", PLACEHOLDER_BODY),
      photo_release: agreementVersion("photo_release", "oxford-consent-form-v1", CONSENT_FORM_BODY),
    },
    lastPhotoReleaseForm: null,
    documentAgreed: { code_of_conduct: false, photo_release: false },
    itemStatus: {
      code_of_conduct: "pending",
      photo_release: "pending",
      bucs_play: "pending",
      hudl_access: "pending",
    },
    nothingOutstanding: false,
    outstandingSections: [],
    nextStep: "details",
    lastAnsweredAt: null,
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

// LAN-363 — the Code of Conduct is a PDF, rendered into the page.
describe("the Code of Conduct document itself", () => {
  function withPdf() {
    const base = view({ nextStep: "code_of_conduct" });
    return {
      ...base,
      agreementVersions: {
        ...base.agreementVersions,
        code_of_conduct: agreementVersion(
          "code_of_conduct",
          "placeholder-v1",
          PLACEHOLDER_BODY,
          "/documents/sample-conduct-document.pdf",
        ),
      },
    };
  }

  it("renders the document and keeps the text of it, and the tick, alongside", async () => {
    givenValid(withPdf());
    const { container } = await renderPage({ step: "code_of_conduct" });

    expect(container.querySelector('[data-testid="code-of-conduct-pdf"]')).not.toBeNull();
    // Never an iframe: iOS Safari hands a framed PDF to its own viewer, and
    // the application's own headers forbid framing anyway.
    expect(container.querySelector("iframe")).toBeNull();
    // The accessible version stays.
    expect(container.querySelector('[data-testid="code-of-conduct-text"]')).not.toBeNull();
    // A download link beside the viewer, never instead of it.
    const download = container.querySelector('[data-testid="download-document"]');
    expect(download?.getAttribute("href")).toBe("/documents/sample-conduct-document.pdf");
    // The tick is unchanged: the consent is the tick, not having scrolled.
    expect(container.querySelector('input[name="agree"]')).not.toBeNull();
  });

  it("renders the text alone, with no viewer and no download link, when the version has no PDF", async () => {
    givenValid(view({ nextStep: "code_of_conduct" }));
    const { container } = await renderPage({ step: "code_of_conduct" });

    expect(container.querySelector('[data-testid="code-of-conduct-pdf"]')).toBeNull();
    expect(container.querySelector('[data-testid="download-document"]')).toBeNull();
    expect(container.querySelector('[data-testid="code-of-conduct-text"]')).not.toBeNull();
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
    expect(links).toContain(`/onboarding/${TOKEN}?step=details`);
    expect(links).toContain(`/onboarding/${TOKEN}?step=bucs_play`);
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

// F4 (LAN-230): provenance reflects who actually supplied the value —
// derived per field, never hard-coded by field name — and the retired
// disputed-fact copy is gone from every source line.
describe("F4 — provenance reflects who actually supplied each value", () => {
  it("says 'The club' for a field the club actually supplied, whatever the field", async () => {
    givenValid(
      view({
        person: personRecord({ givenNameSource: "Caspian Hallowfield" }),
        fieldSuppliedBy: {
          given_name: "club",
          middle_name: null,
          family_name: null,
          college: null,
          matriculation_year: null,
          expected_graduation_year: null,
          degree_field: null,
          student_number: null,
          bafa_registration_number: null,
          date_of_birth: null,
        },
      }),
    );
    const { container } = await renderPage();
    expect(container.textContent).toContain("The club");
  });

  it("says 'You' for a field the player actually supplied, whatever the field", async () => {
    // "You" already appears once as baseline copy (`DETAILS_SECONDARY`), so
    // this counts occurrences rather than a plain `toContain` — proving the
    // college field's own source line is what changed, not incidental copy.
    givenValid(
      view({
        person: personRecord({ collegeSource: "Jordan Ashworth" }),
        fieldSuppliedBy: {
          given_name: null,
          middle_name: null,
          family_name: null,
          college: null,
          matriculation_year: null,
          expected_graduation_year: null,
          degree_field: null,
          student_number: null,
          bafa_registration_number: null,
          date_of_birth: null,
        },
      }),
    );
    const baseline = (await renderPage()).container.textContent ?? "";
    const baselineCount = baseline.split("You").length - 1;

    givenValid(
      view({
        person: personRecord({ collegeSource: "Jordan Ashworth" }),
        fieldSuppliedBy: {
          given_name: null,
          middle_name: null,
          family_name: null,
          college: "you",
          matriculation_year: null,
          expected_graduation_year: null,
          degree_field: null,
          student_number: null,
          bafa_registration_number: null,
          date_of_birth: null,
        },
      }),
    );
    const withSource = (await renderPage()).container.textContent ?? "";
    const withSourceCount = withSource.split("You").length - 1;

    expect(withSourceCount).toBeGreaterThan(baselineCount);
    expect(withSource).not.toContain("The club");
  });

  it("never renders the retired disputed-fact clause, whatever the source", async () => {
    givenValid(
      view({
        person: personRecord({ givenNameSource: "Caspian Hallowfield", collegeSource: "Jordan" }),
        fieldSuppliedBy: {
          given_name: "club",
          middle_name: null,
          family_name: null,
          college: "you",
          matriculation_year: null,
          expected_graduation_year: null,
          degree_field: null,
          student_number: null,
          bafa_registration_number: null,
          date_of_birth: null,
        },
      }),
    );
    const { container } = await renderPage();
    expect(container.textContent).not.toMatch(/checked by a person/i);
  });
});

// F3 (LAN-230): the Done and BUCS Play screens carry every section their
// approved mockups show.
describe("F3 — the Done screen carries every approved section", () => {
  function doneView(overrides: Partial<QuestionnaireView> = {}) {
    return view({
      nextStep: "done",
      nothingOutstanding: true,
      needsConsentStep: false,
      detailsComplete: true,
      itemStatus: {
        code_of_conduct: "complete",
        photo_release: "complete",
        bucs_play: "claimed",
        hudl_access: "claimed",
      },
      outstandingSections: [],
      lastAnsweredAt: new Date("2026-08-15T10:00:00Z"),
      ...overrides,
    });
  }

  it("shows the season status chip, the person/date line, and the messaging consent row", async () => {
    givenValid(doneView());
    const { container } = await renderPage({ step: "done" });
    const text = container.textContent ?? "";
    expect(text).toMatch(/onboarding/i);
    expect(text).toContain("2026-27");
    expect(text).toContain("Jordan Ashworth");
    expect(text).toContain(CONSENT_HEADING);
  });

  // B2 (LAN-230 correction round 1): the person/date line used to render
  // `formatLongDate(new Date())` — today, unconditionally — which misstates
  // the date on every reopen of this revisitable-for-the-whole-season screen.
  // Restoring that reproduces exactly this: the fixed `lastAnsweredAt` below
  // (15 August) would never appear, and whatever today's date happens to be
  // would, regardless of what the view actually carries.
  it("shows when the record was actually last saved, not today's date — B2", async () => {
    givenValid(doneView({ lastAnsweredAt: new Date("2026-08-15T10:00:00Z") }));
    const { container: augustRender } = await renderPage({ step: "done" });
    expect(augustRender.textContent).toContain("15 August 2026");

    givenValid(doneView({ lastAnsweredAt: new Date("2025-01-03T10:00:00Z") }));
    const { container: januaryRender } = await renderPage({ step: "done" });
    expect(januaryRender.textContent).toContain("3 January 2025");
    expect(januaryRender.textContent).not.toContain("15 August 2026");
  });

  // LAN-283: the players' group, offered as a link on the Done page, above the
  // settled-and-outstanding summary. A link shown, never a tracked item.
  it("offers the players' WhatsApp group when the link is configured, and nothing when it is not", async () => {
    process.env.PLAYER_WHATSAPP_GROUP_LINK = "https://chat.whatsapp.com/EXAMPLEPLAYERS";
    givenValid(doneView());
    const { container } = await renderPage({ step: "done" });
    const button = container.querySelector('[data-testid="player-whatsapp-group-link"]');
    expect(button?.getAttribute("href")).toBe("https://chat.whatsapp.com/EXAMPLEPLAYERS");
    expect(container.textContent).toContain("The club's WhatsApp group");
    // Above the summary, not below it.
    const summary = container.querySelector('[data-testid="questionnaire-status"]');
    if (summary) {
      expect(
        button!.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    // The sentence about messaging groups being the club's to tick off stays.
    expect(container.textContent).toContain(WHAT_CLUB_HAS_HEADING);

    delete process.env.PLAYER_WHATSAPP_GROUP_LINK;
    givenValid(doneView());
    const { container: unset } = await renderPage({ step: "done" });
    expect(unset.querySelector('[data-testid="player-whatsapp-group"]')).toBeNull();
  });

  it("shows 'What the club now has', 'If something here is wrong', Close and the R3-G reassurance line", async () => {
    givenValid(doneView());
    const { container } = await renderPage({ step: "done" });
    const text = container.textContent ?? "";
    expect(text).toContain(WHAT_CLUB_HAS_HEADING);
    expect(text).toContain(IF_SOMETHING_WRONG_HEADING);
    expect(text).toContain(CLOSE);
    expect(text).toContain(R3G_REASSURANCE);
  });
});

/**
 * LAN-362 — the strip is navigation.
 *
 * It read as navigation and was not: labels and status words, no links, so a
 * player who wanted to look at what they had agreed to had no way back to it.
 * Brian: clicking Code of Conduct goes to the Code of Conduct, and a completed
 * step is still openable so the player can see what they submitted.
 */
describe("LAN-362 — every step in the strip is a link to its own step", () => {
  const stripLinks = (container: HTMLElement) =>
    Array.from(
      container.querySelectorAll<HTMLAnchorElement>('[data-testid="step-trail"] a[href]'),
    ).map((link) => link.getAttribute("href"));

  it("carries one link per step, to that step's own ?step=, on every step page", async () => {
    for (const step of STEP_ORDER) {
      givenValid(view({ nextStep: step }));
      const { container, unmount } = await renderPage({ step });

      expect(stripLinks(container), `strip on ${step}`).toEqual(
        STEP_ORDER.map((target) => `/onboarding/${encodeURIComponent(TOKEN)}?step=${target}`),
      );
      unmount();
    }
  });

  it("links the step the player is on as well, marking it current rather than disabling it", async () => {
    givenValid(view({ nextStep: "photo_release" }));
    const { container } = await renderPage({ step: "photo_release" });

    const current = container.querySelector('[data-testid="step-trail"] li[data-current="true"]');
    expect(current).not.toBeNull();
    expect(current?.querySelector("a[href]")?.getAttribute("href")).toBe(
      `/onboarding/${encodeURIComponent(TOKEN)}?step=photo_release`,
    );
  });

  it("opens a completed Details step on the saved values", async () => {
    givenValid(
      view({
        detailsComplete: true,
        nextStep: "bucs_play",
        person: personRecord({ college: "Balliol", matriculationYear: 2025 }),
      }),
    );
    const { container } = await renderPage({ step: "details" });

    const college = container.querySelector<HTMLInputElement>('input[name="college"]');
    expect(college?.value).toBe("Balliol");
    expect(
      container.querySelector<HTMLInputElement>('input[name="matriculation_year"]')?.value,
    ).toBe("2025");
  });

  it("opens an agreed Code of Conduct on the agreed state, not the tick", async () => {
    givenValid(
      view({
        nextStep: "bucs_play",
        documentAgreed: { code_of_conduct: true, photo_release: false },
        itemStatus: {
          code_of_conduct: "complete",
          photo_release: "pending",
          bucs_play: "pending",
          hudl_access: "pending",
        },
        agreements: {
          code_of_conduct: {
            id: "00000000-0000-4000-8000-000000000008",
            personId: PERSON_ID,
            seasonId: SEASON_ID,
            agreementType: "code_of_conduct",
            agreementVersionId: "00000000-0000-4000-8000-000000000006",
            agreedAt: new Date("2026-09-15T10:00:00Z"),
            printedName: "Jordan Ashworth",
            form: { name: null, address: null, postcode: null, tel: null, email: null },
            reopenedAt: null,
          },
          photo_release: null,
        },
      }),
    );
    const { container } = await renderPage({ step: "code_of_conduct" });

    expect(container.textContent).toContain("Already agreed");
    // The wording is still there to read — that is the point of opening it.
    expect(container.querySelector('[data-testid="agreed-document"]')).not.toBeNull();
    // Nothing re-asks consent already given.
    expect(container.querySelector('input[name="agree"]')).toBeNull();
    expect(container.textContent).not.toContain(AGREE_AND_CONTINUE);
  });
});

describe("LAN-364 — the trust steps give the instructions and nothing else", () => {
  /**
   * F3 put a four-cell status box between the heading and the instructions —
   * Photo release / BUCS Play / Confirmed by / Instructions. It repeated the
   * strip directly above it, and two of its four rows were facts about the
   * process rather than anything the player could act on. Brian, 2026-09-16:
   * "That's not needed. You can just give the instructions, and that's that."
   *
   * The Done page's summary is a different grid with a different job and is
   * asserted unchanged above.
   */
  it.each(["bucs_play", "hudl"] as const)(
    "says no 'Confirmed by' or 'Instructions' on %s",
    async (step) => {
      givenValid(view({ nextStep: step }));
      const { container } = await renderPage({ step });
      const text = container.textContent ?? "";
      expect(text).not.toContain("Confirmed by");
      expect(text).not.toContain("Instructions");
    },
  );

  it("still leads straight from the heading into the numbered instructions", async () => {
    givenValid(view({ nextStep: "bucs_play" }));
    const { container } = await renderPage({ step: "bucs_play" });
    expect(container.querySelector('[data-testid="bucs-steps"]')).not.toBeNull();
  });

  it("shows both footer notes", async () => {
    givenValid(view({ nextStep: "bucs_play" }));
    const { container } = await renderPage({ step: "bucs_play" });
    const text = container.textContent ?? "";
    expect(text).toContain(BUCS_CLAIM_SUBNOTE);
    expect(text).toContain(BUCS_CONTINUE_ANYWAY_NOTE);
  });
});

/**
 * LAN-289. The step navigator drew its chip from the item's stored status and
 * its label from a separate `=== "claimed"` test, so a BUCS Play item the club
 * had **confirmed** — resolved, and a state beyond claimed — sat under a chip
 * coloured complete with the word "Outstanding" beside it. Two signals about
 * one row, contradicting each other, on the page LAN-216 asks to have the
 * navigator's "label and its chip state agree".
 */
describe("LAN-289 — the navigator's label and its chip agree", () => {
  function trailRowFor(container: HTMLElement, label: string): HTMLElement {
    const row = Array.from(container.querySelectorAll("li")).find((item) =>
      item.textContent?.includes(label),
    );
    expect(row).toBeDefined();
    return row as HTMLElement;
  }

  it("never reads 'Outstanding' for a confirmed BUCS Play item", async () => {
    givenValid(
      view({
        nextStep: "hudl",
        itemStatus: {
          code_of_conduct: "pending",
          photo_release: "pending",
          bucs_play: "complete",
          hudl_access: "pending",
        },
      }),
    );
    const { container } = await renderPage({ step: "hudl" });

    const bucs = trailRowFor(container, stepLabel("bucs_play"));
    expect(bucs.textContent).toContain("Confirmed");
    expect(bucs.textContent).not.toContain("Outstanding");

    // The item genuinely still owed keeps the word, so this is not a blanket
    // silencing of it.
    expect(trailRowFor(container, stepLabel("hudl")).textContent).toContain("Outstanding");
  });

  it("says 'Claimed' for a claimed Hudl item, which is not the same as resolved", async () => {
    givenValid(
      view({
        nextStep: "bucs_play",
        itemStatus: {
          code_of_conduct: "pending",
          photo_release: "pending",
          bucs_play: "pending",
          hudl_access: "claimed",
        },
      }),
    );
    const { container } = await renderPage({ step: "bucs_play" });

    const hudl = trailRowFor(container, stepLabel("hudl"));
    expect(hudl.textContent).toContain("Claimed");
    expect(hudl.textContent).not.toContain("Outstanding");
  });

  it("still reads 'Outstanding' for an item that has only been invited", async () => {
    givenValid(
      view({
        nextStep: "bucs_play",
        itemStatus: {
          code_of_conduct: "pending",
          photo_release: "pending",
          bucs_play: "invited",
          hudl_access: "pending",
        },
      }),
    );
    const { container } = await renderPage({ step: "bucs_play" });

    expect(trailRowFor(container, stepLabel("bucs_play")).textContent).toContain("Outstanding");
  });

  it("says the same thing on the Done list as in the navigator", async () => {
    givenValid(
      view({
        nothingOutstanding: true,
        nextStep: "done",
        detailsComplete: true,
        needsConsentStep: false,
        itemStatus: {
          code_of_conduct: "complete",
          photo_release: "complete",
          bucs_play: "complete",
          hudl_access: "claimed",
        },
      }),
    );
    const { container } = await renderPage({ step: "done" });
    const text = container.textContent ?? "";

    expect(text).not.toContain("Outstanding");
    expect(text).toContain("Confirmed");
    expect(text).toContain("Claimed");
  });
});

/**
 * LAN-333. Steps 4 and 5 carried four and three invented placeholder lines,
 * and Hudl's assumed an email invitation an operator never sends. These are
 * the club's own steps now; what this file pins is that no placeholder
 * survived, that the league's year is derived rather than typed, and that the
 * Hudl join link is configuration whose absence is a stated state.
 */
describe("LAN-333 — the real BUCS Play and Hudl steps", () => {
  /** A dummy. The club's own join link is configuration and never enters this repository. */
  const DUMMY_HUDL = "https://www.example.invalid/hudl-join";

  afterEach(() => {
    delete process.env.HUDL_JOIN_LINK;
  });

  async function bucsScreen(seasonLabel: string | null = "2026-27") {
    givenValid(view({ nextStep: "bucs_play", seasonLabel }));
    return (await renderPage({ step: "bucs_play" })).container;
  }

  async function hudlScreen() {
    givenValid(view({ nextStep: "hudl" }));
    return (await renderPage({ step: "hudl" })).container;
  }

  it("carries the club's five BUCS Play steps, with the app and website destinations", async () => {
    const container = await bucsScreen();
    const steps = container.querySelector('[data-testid="bucs-steps"]');
    const text = steps?.textContent ?? "";

    expect(text).toContain("Download the BucsPlay app");
    expect(text).toContain("Create an account using your college email address.");
    expect(text).toContain("Join the BUCS general community first");
    expect(text).toContain("Oxford Open 1 American Football");
    expect(steps?.querySelectorAll("li")).toHaveLength(5);

    const hrefs = [...(steps?.querySelectorAll("a") ?? [])].map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("https://apps.apple.com/gb/app/bucs-play/id1379011950");
    expect(hrefs).toContain("https://play.google.com/store/apps/details?id=com.playwaze.bucscore");
    expect(hrefs).toContain("https://bucs.playwaze.com");
  });

  it("stamps the league with the open season's own year, never a constant", async () => {
    expect(bucsLeagueYear("2026-27")).toBe("26-27");
    expect(bucsLeagueYear("2026/27")).toBe("26-27");
    expect(bucsLeagueYear("2027-28")).toBe("27-28");
    // Unreadable drops the year rather than guessing one.
    expect(bucsLeagueYear(null)).toBeNull();
    expect(bucsLeagueYear("Michaelmas")).toBeNull();

    expect((await bucsScreen("2026-27")).textContent).toContain(
      "BUCS American Football 26-27 league",
    );
    expect((await bucsScreen("2027/28")).textContent).toContain(
      "BUCS American Football 27-28 league",
    );
    const unlabelled = await bucsScreen(null);
    expect(unlabelled.textContent).toContain("BUCS American Football league for this season");
    expect(unlabelled.textContent).not.toContain("undefined");
  });

  it("puts the join link in step one and says nothing else works first (LAN-283)", async () => {
    process.env.HUDL_JOIN_LINK = DUMMY_HUDL;
    const container = await hudlScreen();
    const steps = container.querySelector('[data-testid="hudl-steps"]');
    const items = [...(steps?.querySelectorAll("li") ?? [])];

    expect(items).toHaveLength(4);
    // The link is in the first step, not somewhere further down it.
    expect(items[0].querySelector(`a[href="${DUMMY_HUDL}"]`)).not.toBeNull();
    expect(items[0].textContent).toContain("Nothing below works until you have joined");
    // The two steps after it refer back to it rather than standing alone.
    expect(items[1].textContent).toContain("Once you have joined through the link above");
    expect(items[2].textContent).toContain("Once you have joined through the link above");
    expect(items[2].textContent).toContain("The phone number field can be left alone.");
    // The app-store links stay last and stay optional.
    expect(items[3].textContent).toContain("Optional");
    const lastHrefs = [...items[3].querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(lastHrefs).toContain("https://apps.apple.com/us/app/hudl/id412223222");
    expect(lastHrefs).toContain("https://play.google.com/store/apps/details?id=com.hudl.hudroid");

    expect(container.querySelector('[data-testid="hudl-link-missing"]')).toBeNull();
  });

  it("keeps the steps and states the missing link when none is configured", async () => {
    const container = await hudlScreen();
    const steps = container.querySelector('[data-testid="hudl-steps"]');

    expect(steps?.querySelectorAll("li")).toHaveLength(4);
    expect(steps?.textContent).toContain("Nothing below works until you have joined");
    expect(container.querySelector('[data-testid="hudl-link-missing"]')?.textContent).toBe(
      HUDL_LINK_NOT_PUBLISHED,
    );
    // No invented destination for the step that has no link.
    expect(steps?.querySelector('a[href*="hudl.com"]')).toBeNull();
  });

  it("describes joining, not accepting an invitation the club never sends", async () => {
    process.env.HUDL_JOIN_LINK = DUMMY_HUDL;
    const text = (await hudlScreen()).textContent ?? "";

    expect(text).toContain(HUDL_LEAD);
    expect(text).not.toMatch(/invitation/i);
    expect(text).toContain(HUDL_CLAIM_LABEL);
  });

  it("offers no second Hudl checkbox — the no-invitation control is gone", async () => {
    const container = await hudlScreen();
    expect(container.querySelector('input[name="no_invitation"]')).toBeNull();
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(1);
  });

  it("says PLACEHOLDER or 'Owed' nowhere on either step", async () => {
    for (const container of [await bucsScreen(), await hudlScreen()]) {
      const text = container.textContent ?? "";
      expect(text).not.toContain("PLACEHOLDER");
      expect(text).not.toContain("Owed — not written");
      expect(text).not.toMatch(/LAN-213/);
    }
  });
});
