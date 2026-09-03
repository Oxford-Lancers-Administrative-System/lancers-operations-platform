// @vitest-environment node
/**
 * `/operate/recruitment/new`'s own boundary — `W6`, LAN-206. The action is
 * imported unmocked so `requireCapability`'s real logic runs (the same
 * posture `admin/messaging/actions.test.ts` states, for the identical
 * reason: a deleted authorization check must fail a test, not pass one).
 * `withTransaction` is stubbed to run its callback against a fake `tx` —
 * every function that reads it is mocked at the boundary this action calls,
 * so no SQL runs here. What each of those functions actually writes is
 * proved against the real database in `recruitment-add.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new RedirectSignal(url);
  }),
}));

class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`redirect:${url}`);
  }
}

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return {
    ...actual,
    withTransaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };
});

vi.mock("@/lib/services/person-create", () => ({ createPerson: vi.fn() }));
vi.mock("@/lib/services/person-duplicate", () => ({ findPersonDuplicates: vi.fn() }));
vi.mock("@/lib/services/seasons", () => ({ readCurrentSeasonIn: vi.fn() }));
vi.mock("@/lib/services/recruitment-candidate-identity", () => ({
  readCandidateIdentitiesIn: vi.fn(),
}));
vi.mock("@/lib/services/recruitment-add", () => ({
  finishRecruitmentAddIn: vi.fn(),
  refuseIfAlreadyAMemberIn: vi.fn(),
  requireMobileProvided: vi.fn(),
}));

import { ConstraintViolated, InvalidTransition } from "@/lib/db";
import type { PersonDuplicateMatch } from "@/lib/services/person-duplicate";
import { resolveOperatorAccess, type OperatorAccess } from "@/lib/auth/operator";
import { createPerson } from "@/lib/services/person-create";
import { findPersonDuplicates } from "@/lib/services/person-duplicate";
import { readCurrentSeasonIn } from "@/lib/services/seasons";
import { readCandidateIdentitiesIn } from "@/lib/services/recruitment-candidate-identity";
import { finishRecruitmentAddIn, refuseIfAlreadyAMemberIn } from "@/lib/services/recruitment-add";
import { submitAddRecruit } from "./actions";
import { INITIAL_ADD_RECRUIT_STATE } from "./create-state";

const OPERATOR_PERSON_ID = "11111111-1111-4111-8111-111111111111";
const SEASON_ID = "22222222-2222-4222-8222-222222222222";

function signedInAs(state: OperatorAccess): void {
  vi.mocked(resolveOperatorAccess).mockResolvedValue(state);
}

function fourRoleOperator(): OperatorAccess {
  return {
    state: "active",
    operator: {
      authUserId: "00000000-1111-4111-8111-111111111111",
      personId: OPERATOR_PERSON_ID,
      displayName: "Caspian Hallowfield",
      roleCodes: ["secretary"],
      isActive: true,
    },
  };
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.append(name, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readCurrentSeasonIn).mockResolvedValue({
    id: SEASON_ID,
    label: "2026-27",
    status: "open",
    startsOn: "2026-09-01",
    endsOn: null,
  });
  vi.mocked(findPersonDuplicates).mockResolvedValue([]);
  vi.mocked(readCandidateIdentitiesIn).mockResolvedValue(new Map());
  vi.mocked(refuseIfAlreadyAMemberIn).mockResolvedValue(undefined);
});

describe("who may call it", () => {
  it("refuses an operator outside the four offices, and touches no service", async () => {
    signedInAs({
      state: "active",
      operator: {
        authUserId: "00000000-1111-4111-8111-111111111112",
        personId: "33333333-3333-4333-8333-333333333333",
        displayName: "Nobody Special",
        roleCodes: ["head_coach"],
        isActive: true,
      },
    });

    await expect(
      submitAddRecruit(INITIAL_ADD_RECRUIT_STATE, form({ intent: "check" })),
    ).rejects.toMatchObject({ kind: "not_permitted" });
    expect(findPersonDuplicates).not.toHaveBeenCalled();
  });
});

describe("required fields", () => {
  beforeEach(() => signedInAs(fourRoleOperator()));

  it("requires a mobile number at this door — not the looser mobile-or-email rule", async () => {
    const result = await submitAddRecruit(
      INITIAL_ADD_RECRUIT_STATE,
      form({ intent: "check", givenName: "Marguerite", familyName: "Ashdown" }),
    );
    expect(result.errors.mobile).toMatch(/mobile number is required/i);
    expect(findPersonDuplicates).not.toHaveBeenCalled();
  });

  it("requires first and last name", async () => {
    const result = await submitAddRecruit(
      INITIAL_ADD_RECRUIT_STATE,
      form({ intent: "check", mobile: "07700 900461" }),
    );
    expect(result.errors.givenName).toBeDefined();
    expect(result.errors.familyName).toBeDefined();
  });
});

describe("the check step", () => {
  beforeEach(() => signedInAs(fourRoleOperator()));

  it("runs the shipped duplicate check and attaches each candidate's identity", async () => {
    vi.mocked(findPersonDuplicates).mockResolvedValue([
      {
        personId: "44444444-4444-4444-8444-444444444444",
        givenName: "Alaric",
        familyName: "Brindlewood",
        displayAlias: null,
        displayName: "Alaric Brindlewood",
        currentEmails: [],
        currentPhones: ["07700 900753"],
        matchedOn: ["given_name", "phone"],
      },
    ]);
    vi.mocked(readCandidateIdentitiesIn).mockResolvedValue(
      new Map([
        [
          "44444444-4444-4444-8444-444444444444",
          { kind: "player", membershipStatus: "active", seasonLabel: "2026-27" },
        ],
      ]),
    );

    const result = await submitAddRecruit(
      INITIAL_ADD_RECRUIT_STATE,
      form({
        intent: "check",
        givenName: "Alaric",
        familyName: "Brindlewood",
        mobile: "07700 900753",
      }),
    );

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates?.[0].identity).toEqual({
      kind: "player",
      membershipStatus: "active",
      seasonLabel: "2026-27",
    });
  });
});

describe("F-206-02 — 'Go back and change the details' dismisses the panel", () => {
  beforeEach(() => signedInAs(fourRoleOperator()));

  it("clears candidates and exactMatch, calls no service, and keeps the still-submitted field values", async () => {
    const result = await submitAddRecruit(
      INITIAL_ADD_RECRUIT_STATE,
      form({
        intent: "dismiss",
        givenName: "Marguerite",
        familyName: "Ashdown",
        mobile: "07700 900461",
      }),
    );

    expect(result.candidates).toBeNull();
    expect(result.exactMatch).toBeNull();
    expect(result.values.givenName).toBe("Marguerite");
    expect(result.values.familyName).toBe("Ashdown");
    expect(findPersonDuplicates).not.toHaveBeenCalled();
    expect(createPerson).not.toHaveBeenCalled();
    expect(finishRecruitmentAddIn).not.toHaveBeenCalled();
  });
});

describe("linking onto an existing person", () => {
  beforeEach(() => signedInAs(fourRoleOperator()));

  // V-3 / V-4, correction round 2 — this used to fall into `formError`, a
  // banner stacked on the still-visible candidates panel and form beneath
  // it (Brian's own "flurry of information"). It resolves instead to the
  // one dedicated `alreadyMember` outcome, a normal fact rather than a
  // refusal, and calls `createPerson` for nobody either way.
  it("resolves to alreadyMember for a current player, not a form error, and calls createPerson for nobody", async () => {
    vi.mocked(refuseIfAlreadyAMemberIn).mockRejectedValue(
      new InvalidTransition("This person already holds a membership this season.", {
        rule: "recruitment_add_existing_member_is_not_a_recruit",
      }),
    );
    const previousWithCandidate = {
      ...INITIAL_ADD_RECRUIT_STATE,
      candidates: [
        {
          personId: "44444444-4444-4444-8444-444444444444",
          givenName: "Alaric",
          familyName: "Brindlewood",
          displayAlias: null,
          displayName: "Alaric Brindlewood",
          currentEmails: [],
          currentPhones: ["07700 900753"],
          matchedOn: ["given_name", "phone"] as PersonDuplicateMatch[],
          identity: {
            kind: "player" as const,
            membershipStatus: "active",
            seasonLabel: "2026-27",
          },
        },
      ],
    };

    const result = await submitAddRecruit(
      previousWithCandidate,
      form({ linkPersonId: "44444444-4444-4444-8444-444444444444" }),
    );

    expect(result.formError).toBeUndefined();
    expect(result.candidates).toBeNull();
    expect(result.alreadyMember).toEqual({
      displayName: "Alaric Brindlewood",
      membershipStatus: "active",
      seasonLabel: "2026-27",
    });
    expect(createPerson).not.toHaveBeenCalled();
  });

  it("still resolves to alreadyMember with a generic fallback when the candidate is not in the prior state", async () => {
    vi.mocked(refuseIfAlreadyAMemberIn).mockRejectedValue(
      new InvalidTransition("This person already holds a membership this season.", {
        rule: "recruitment_add_existing_member_is_not_a_recruit",
      }),
    );

    const result = await submitAddRecruit(
      INITIAL_ADD_RECRUIT_STATE,
      form({ linkPersonId: "44444444-4444-4444-8444-444444444444" }),
    );

    expect(result.formError).toBeUndefined();
    expect(result.alreadyMember).not.toBeNull();
    expect(createPerson).not.toHaveBeenCalled();
  });

  it("links, finishes the recruitment write, and redirects to the record", async () => {
    vi.mocked(createPerson).mockResolvedValue({
      personId: "44444444-4444-4444-8444-444444444444",
      created: false,
      record: {} as never,
    });
    vi.mocked(finishRecruitmentAddIn).mockResolvedValue({
      prospectId: "55555555-5555-4555-8555-555555555555",
      prospectCreated: true,
      cycleDeclared: true,
    });

    await expect(
      submitAddRecruit(
        INITIAL_ADD_RECRUIT_STATE,
        form({ linkPersonId: "44444444-4444-4444-8444-444444444444" }),
      ),
    ).rejects.toBeInstanceOf(RedirectSignal);

    expect(finishRecruitmentAddIn).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        personId: "44444444-4444-4444-8444-444444444444",
        seasonId: SEASON_ID,
      }),
    );
  });
});

describe("creating a new recruit", () => {
  beforeEach(() => signedInAs(fourRoleOperator()));

  it("creates the person, finishes the recruitment write, and redirects to the record", async () => {
    vi.mocked(createPerson).mockResolvedValue({
      personId: "66666666-6666-4666-8666-666666666666",
      created: true,
      record: {} as never,
    });
    vi.mocked(finishRecruitmentAddIn).mockResolvedValue({
      prospectId: "77777777-7777-4777-8777-777777777777",
      prospectCreated: true,
      cycleDeclared: false,
    });

    await expect(
      submitAddRecruit(
        INITIAL_ADD_RECRUIT_STATE,
        form({
          intent: "create",
          givenName: "Marguerite",
          familyName: "Ashdown",
          mobile: "07700 900461",
        }),
      ),
    ).rejects.toBeInstanceOf(RedirectSignal);
  });

  it("surfaces an exact-match refusal as the reason field, not a form error", async () => {
    vi.mocked(createPerson).mockRejectedValue(
      new ConstraintViolated("Marguerite Ashdown already holds this contact point.", {
        rule: "person_create_exact_match_requires_reason",
      }),
    );
    vi.mocked(findPersonDuplicates).mockResolvedValue([
      {
        personId: "88888888-8888-4888-8888-888888888888",
        givenName: "Marguerite",
        familyName: "Ashdown",
        displayAlias: null,
        displayName: "Marguerite Ashdown",
        currentEmails: [],
        currentPhones: ["07700 900461"],
        matchedOn: ["phone"],
      },
    ]);

    const result = await submitAddRecruit(
      INITIAL_ADD_RECRUIT_STATE,
      form({
        intent: "create",
        givenName: "Marguerite",
        familyName: "Ashdown",
        mobile: "07700 900461",
      }),
    );

    expect(result.exactMatch?.personId).toBe("88888888-8888-4888-8888-888888888888");
    expect(result.formError).toBeUndefined();
  });
});
