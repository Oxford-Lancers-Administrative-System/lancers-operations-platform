/**
 * The unauthenticated write surface's own re-resolution guarantee —
 * `WP-player-questionnaire`, LAN-216, correction round 1, F-001.
 *
 * Independent review (round 1) proved this file had zero automated coverage
 * by adding an override parameter to `resolveOrThrow` that trusted a
 * form-submitted person id instead of the re-resolved token, and observed
 * every existing test — all 32 of them — stay green. What is under test here
 * is exactly that guarantee: every write `saveDetails`, `agreeDocument` and
 * `submitTrustStep` make is keyed to the `personId`/`seasonId`/`membershipId`
 * the token *itself* resolves to inside this same call, never to anything a
 * submitted form claims — so a crafted submission naming another person
 * writes nothing to that person. The service layer is mocked, matching
 * `src/app/me/[token]/actions.test.ts`'s own pattern for the sibling durable
 * page; the writes themselves are proved against the real database in
 * `src/lib/services/player-questionnaire.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

const membershipQuery = vi.fn();
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return {
    ...actual,
    withTransaction: async (fn: (tx: unknown) => unknown) => fn({ query: membershipQuery }),
  };
});
vi.mock("@/lib/services/player-answer-tokens", () => ({
  resolvePersonTokenIn: vi.fn(),
}));
vi.mock("@/lib/services/player-questionnaire", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/player-questionnaire")>();
  return {
    ...actual,
    readQuestionnaireView: vi.fn(),
    saveDetailsStep: vi.fn(),
    agreeOnboardingDocument: vi.fn(),
    claimTrustItem: vi.fn(),
    recordHudlNoInvitation: vi.fn(),
  };
});

import { ConstraintViolated } from "@/lib/db";
import { resetRsvpRateLimit } from "@/lib/rsvp/public-surface";
import { resolvePersonTokenIn } from "@/lib/services/player-answer-tokens";
import {
  agreeOnboardingDocument,
  claimTrustItem,
  readQuestionnaireView,
  recordHudlNoInvitation,
  saveDetailsStep,
  type QuestionnaireView,
} from "@/lib/services/player-questionnaire";
import { agreeDocument, saveDetails, submitTrustStep } from "./actions";

const TOKEN = "durable-token-plaintext-000000000000000000000";
const PERSON_ID = "00000000-0000-4000-8000-000000000001";
const SEASON_ID = "00000000-0000-4000-8000-000000000002";
const MEMBERSHIP_ID = "00000000-0000-4000-8000-000000000003";
// The identity a crafted submission claims — never the one the token itself
// resolves to. Every "F-001" test below asserts writes go to PERSON_ID, and
// that they are never even attempted against this one.
const OTHER_PERSON_ID = "00000000-0000-4000-8000-000000000099";

function formFor(fields: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.set("token", TOKEN);
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}

async function redirectFrom(run: () => Promise<void>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const message = (error as Error).message;
    if (message.startsWith("REDIRECT:")) return message.slice("REDIRECT:".length);
    throw error;
  }
  throw new Error("Expected the action to redirect, and it did not.");
}

beforeEach(() => {
  vi.clearAllMocks();
  resetRsvpRateLimit();
  membershipQuery.mockResolvedValue({ rows: [{ id: MEMBERSHIP_ID }] });
  vi.mocked(resolvePersonTokenIn).mockResolvedValue({
    state: "valid",
    resolved: { personId: PERSON_ID, seasonId: SEASON_ID },
  });
  vi.mocked(readQuestionnaireView).mockResolvedValue({
    nextStep: "code_of_conduct",
  } as unknown as QuestionnaireView);
  vi.mocked(saveDetailsStep).mockResolvedValue({ errors: {}, outcomes: {} });
  vi.mocked(agreeOnboardingDocument).mockResolvedValue({} as never);
  vi.mocked(claimTrustItem).mockResolvedValue(undefined);
  vi.mocked(recordHudlNoInvitation).mockResolvedValue(undefined);
});

describe("saveDetails", () => {
  it("saves against the re-resolved person, season and membership — never a submitted identity (F-001)", async () => {
    const form = formFor({
      personId: OTHER_PERSON_ID,
      seasonId: "not-the-real-season",
      membershipId: "not-the-real-membership",
      given_name: "Jordan",
    });

    await redirectFrom(() => saveDetails(form));

    expect(saveDetailsStep).toHaveBeenCalledWith(
      expect.objectContaining({
        personId: PERSON_ID,
        seasonId: SEASON_ID,
        membershipId: MEMBERSHIP_ID,
      }),
    );
  });

  it("writes nothing to the crafted other person named in the form (F-001)", async () => {
    await redirectFrom(() => saveDetails(formFor({ personId: OTHER_PERSON_ID })));

    expect(saveDetailsStep).not.toHaveBeenCalledWith(
      expect.objectContaining({ personId: OTHER_PERSON_ID }),
    );
  });

  it("redirects to the field-error banner and writes nothing further when the service reports a shape error", async () => {
    vi.mocked(saveDetailsStep).mockResolvedValueOnce({ errors: { mobile: "bad" }, outcomes: {} });

    const target = await redirectFrom(() => saveDetails(formFor()));

    expect(target).toBe(`/me/${encodeURIComponent(TOKEN)}/details?step=details&fieldError=1`);
  });

  it("refuses uniformly and writes nothing when the token no longer resolves", async () => {
    vi.mocked(resolvePersonTokenIn).mockResolvedValue({ state: "unknown", resolved: null });

    const target = await redirectFrom(() => saveDetails(formFor({ personId: OTHER_PERSON_ID })));

    expect(saveDetailsStep).not.toHaveBeenCalled();
    expect(target).toBe(`/me/${encodeURIComponent(TOKEN)}/details`);
  });

  it("refuses further writes once the link's own allowance is spent, without ever resolving the token again", async () => {
    for (let attempt = 0; attempt < 240; attempt += 1) {
      await redirectFrom(() => saveDetails(formFor()));
    }
    vi.mocked(saveDetailsStep).mockClear();
    vi.mocked(resolvePersonTokenIn).mockClear();

    await redirectFrom(() => saveDetails(formFor()));

    expect(resolvePersonTokenIn).not.toHaveBeenCalled();
    expect(saveDetailsStep).not.toHaveBeenCalled();
  });
});

describe("agreeDocument", () => {
  function form(fields: Record<string, string> = {}): FormData {
    return formFor({ agreementType: "code_of_conduct", agree: "1", ...fields });
  }

  it("records the agreement against the re-resolved person — never a submitted identity (F-001)", async () => {
    await redirectFrom(() =>
      agreeDocument(form({ personId: OTHER_PERSON_ID, membershipId: "not-the-real-membership" })),
    );

    expect(agreeOnboardingDocument).toHaveBeenCalledWith({
      personId: PERSON_ID,
      seasonId: SEASON_ID,
      membershipId: MEMBERSHIP_ID,
      agreementType: "code_of_conduct",
    });
  });

  it("records nothing at all for the crafted other person (F-001)", async () => {
    await redirectFrom(() => agreeDocument(form({ personId: OTHER_PERSON_ID })));

    expect(agreeOnboardingDocument).not.toHaveBeenCalledWith(
      expect.objectContaining({ personId: OTHER_PERSON_ID }),
    );
  });

  it("returns to the same document with an error and resolves nothing when the box is unticked", async () => {
    const target = await redirectFrom(() => agreeDocument(form({ agree: "" })));

    expect(resolvePersonTokenIn).not.toHaveBeenCalled();
    expect(agreeOnboardingDocument).not.toHaveBeenCalled();
    expect(target).toBe(
      `/me/${encodeURIComponent(TOKEN)}/details?step=code_of_conduct&agreeError=1`,
    );
  });

  it("treats an already-agreed resubmission as done rather than a failure", async () => {
    vi.mocked(agreeOnboardingDocument).mockRejectedValueOnce(
      new ConstraintViolated("Already agreed this season.", {
        rule: "onboarding_agreements_one_per_person_season_type",
      }),
    );

    const target = await redirectFrom(() => agreeDocument(form()));

    expect(target).toBe(`/me/${encodeURIComponent(TOKEN)}/details?step=code_of_conduct`);
  });

  it("refuses uniformly when the token no longer resolves", async () => {
    vi.mocked(resolvePersonTokenIn).mockResolvedValue({ state: "unknown", resolved: null });

    const target = await redirectFrom(() => agreeDocument(form()));

    expect(agreeOnboardingDocument).not.toHaveBeenCalled();
    expect(target).toBe(`/me/${encodeURIComponent(TOKEN)}/details`);
  });
});

describe("submitTrustStep", () => {
  it("claims BUCS Play against the re-resolved person — never a submitted identity (F-001)", async () => {
    await redirectFrom(() =>
      submitTrustStep(formFor({ code: "bucs_play", claim: "1", personId: OTHER_PERSON_ID })),
    );

    expect(claimTrustItem).toHaveBeenCalledWith({
      personId: PERSON_ID,
      seasonId: SEASON_ID,
      membershipId: MEMBERSHIP_ID,
      code: "bucs_play",
    });
    expect(claimTrustItem).not.toHaveBeenCalledWith(
      expect.objectContaining({ personId: OTHER_PERSON_ID }),
    );
  });

  it("records Hudl's no-invitation state against the re-resolved person, never the form's claimed one (F-001)", async () => {
    await redirectFrom(() =>
      submitTrustStep(
        formFor({ code: "hudl_access", no_invitation: "1", personId: OTHER_PERSON_ID }),
      ),
    );

    expect(recordHudlNoInvitation).toHaveBeenCalledWith({
      personId: PERSON_ID,
      seasonId: SEASON_ID,
      membershipId: MEMBERSHIP_ID,
    });
    expect(recordHudlNoInvitation).not.toHaveBeenCalledWith(
      expect.objectContaining({ personId: OTHER_PERSON_ID }),
    );
  });

  it("advances to the literal next step regardless of whether this one was just claimed", async () => {
    const target = await redirectFrom(() => submitTrustStep(formFor({ code: "bucs_play" })));

    expect(target).toBe(`/me/${encodeURIComponent(TOKEN)}/details?step=hudl`);
  });

  it("finishes the sequence after the last step", async () => {
    const target = await redirectFrom(() => submitTrustStep(formFor({ code: "hudl_access" })));

    expect(target).toBe(`/me/${encodeURIComponent(TOKEN)}/details?step=done`);
  });

  it("refuses uniformly and claims nothing when the token no longer resolves", async () => {
    vi.mocked(resolvePersonTokenIn).mockResolvedValue({ state: "unknown", resolved: null });

    const target = await redirectFrom(() =>
      submitTrustStep(formFor({ code: "bucs_play", claim: "1" })),
    );

    expect(claimTrustItem).not.toHaveBeenCalled();
    expect(target).toBe(`/me/${encodeURIComponent(TOKEN)}/details`);
  });
});
