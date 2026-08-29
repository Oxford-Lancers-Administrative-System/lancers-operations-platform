// @vitest-environment node
/**
 * `/operate/people/new`'s own boundary — W3, LAN-185. The action is called
 * directly, never through a rendered page, the same posture
 * `roster/new/actions.test.ts` states: this proves who may call it and the
 * state machine, mocking the service layer so a refused call is shown to
 * reach the database not at all. Whether the write itself is correct is
 * proved against the real database in `person-create.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("@/lib/services/person-create", () => ({ createPerson: vi.fn() }));
vi.mock("@/lib/services/person-duplicate", () => ({ findPersonDuplicates: vi.fn() }));
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

import { ConstraintViolated } from "@/lib/db";
import { resolveOperatorAccess, type OperatorAccess } from "@/lib/auth/operator";
import { createPerson } from "@/lib/services/person-create";
import { findPersonDuplicates } from "@/lib/services/person-duplicate";
import { submitCreatePerson } from "./actions";
import { INITIAL_CREATE_STATE } from "./create-state";

const OPERATOR_PERSON_ID = "11111111-1111-4111-8111-111111111111";

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
  vi.mocked(findPersonDuplicates).mockResolvedValue([]);
});

describe("who may call it", () => {
  it("refuses an operator outside the four offices, and touches no service", async () => {
    signedInAs({
      state: "active",
      operator: {
        authUserId: "00000000-1111-4111-8111-111111111112",
        personId: "22222222-1111-4111-8111-111111111111",
        displayName: "Someone",
        roleCodes: ["treasurer"],
        isActive: true,
      },
    });

    await expect(
      submitCreatePerson(
        INITIAL_CREATE_STATE,
        form({ intent: "check", givenName: "A", familyName: "B" }),
      ),
    ).rejects.toThrow();

    expect(createPerson).not.toHaveBeenCalled();
    expect(findPersonDuplicates).not.toHaveBeenCalled();
  });
});

describe("the required set", () => {
  it("refuses a first name alone", async () => {
    signedInAs(fourRoleOperator());
    const result = await submitCreatePerson(
      INITIAL_CREATE_STATE,
      form({ intent: "check", givenName: "Percival", familyName: "" }),
    );
    expect(result.errors.familyName).toBeDefined();
    expect(result.errors.mobile).toBeDefined();
    expect(findPersonDuplicates).not.toHaveBeenCalled();
  });
});

describe("the duplicate check", () => {
  it("shows what matched, then creates when the operator confirms somebody new", async () => {
    signedInAs(fourRoleOperator());
    vi.mocked(findPersonDuplicates).mockResolvedValue([
      {
        personId: "33333333-1111-4111-8111-111111111111",
        givenName: "Percival",
        familyName: "Oakhanger",
        displayAlias: null,
        displayName: "Percival Oakhanger",
        currentEmails: [],
        currentPhones: ["+44 7700 900314"],
        matchedOn: ["given_name", "phone"],
      },
    ]);

    const checked = await submitCreatePerson(
      INITIAL_CREATE_STATE,
      form({
        intent: "check",
        givenName: "Percival",
        familyName: "Newperson",
        mobile: "+44 7700 900314",
      }),
    );
    expect(checked.candidates).toHaveLength(1);

    vi.mocked(createPerson).mockResolvedValue({
      personId: "44444444-1111-4111-8111-111111111111",
      created: true,
      record: {} as never,
    });
    await expect(
      submitCreatePerson(
        checked,
        form({
          intent: "create",
          givenName: "Percival",
          familyName: "Newperson",
          mobile: "+44 7700 900314",
        }),
      ),
    ).rejects.toThrow(RedirectSignal);
    expect(createPerson).toHaveBeenCalledWith(
      expect.objectContaining({ decision: { kind: "create_new", overrideReason: null } }),
    );
  });

  it("this is them: links and redirects, creating nothing", async () => {
    signedInAs(fourRoleOperator());
    vi.mocked(createPerson).mockResolvedValue({
      personId: "33333333-1111-4111-8111-111111111111",
      created: false,
      record: {} as never,
    });

    await expect(
      submitCreatePerson(
        INITIAL_CREATE_STATE,
        form({
          givenName: "Percival",
          familyName: "Oakhanger",
          linkPersonId: "33333333-1111-4111-8111-111111111111",
        }),
      ),
    ).rejects.toThrow(RedirectSignal);
    expect(createPerson).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: { kind: "link_existing", personId: "33333333-1111-4111-8111-111111111111" },
      }),
    );
  });

  it("creating over an exact contact-point match asks for a reason", async () => {
    signedInAs(fourRoleOperator());
    vi.mocked(createPerson).mockRejectedValue(
      new ConstraintViolated("Percival Oakhanger already holds this mobile number.", {
        rule: "person_create_exact_match_requires_reason",
      }),
    );
    vi.mocked(findPersonDuplicates).mockResolvedValue([
      {
        personId: "33333333-1111-4111-8111-111111111111",
        givenName: "Percival",
        familyName: "Oakhanger",
        displayAlias: null,
        displayName: "Percival Oakhanger",
        currentEmails: [],
        currentPhones: ["+44 7700 900314"],
        matchedOn: ["phone"],
      },
    ]);

    const result = await submitCreatePerson(
      INITIAL_CREATE_STATE,
      form({
        intent: "create",
        givenName: "Percival",
        familyName: "Oakhanger",
        mobile: "+44 7700 900314",
      }),
    );
    expect(result.exactMatch?.personId).toBe("33333333-1111-4111-8111-111111111111");

    vi.mocked(createPerson).mockResolvedValue({
      personId: "55555555-1111-4111-8111-111111111111",
      created: true,
      record: {} as never,
    });
    await expect(
      submitCreatePerson(
        result,
        form({
          intent: "create",
          givenName: "Percival",
          familyName: "Oakhanger",
          mobile: "+44 7700 900314",
          overrideReason: "Father and son, same phone",
        }),
      ),
    ).rejects.toThrow(RedirectSignal);
    expect(createPerson).toHaveBeenLastCalledWith(
      expect.objectContaining({
        decision: { kind: "create_new", overrideReason: "Father and son, same phone" },
      }),
    );
  });
});
