// @vitest-environment node
/**
 * The returner intake action's own boundary. LAN-74, matrix row 8.
 *
 * Every call here goes **straight to the action**. No page renders, no layout
 * runs, and nothing decided what the caller was allowed to click — which is the
 * only way to prove the enforcement is in the action rather than in a screen.
 * `/operate/roster/new` is a POST endpoint like any other server action, and an
 * unlinked or deactivated account with a valid session can reach it directly.
 *
 * The actor is injected exactly where a real request produces it — at
 * `resolveOperatorAccess()` — and nowhere else. `submitReturnerIntake` takes no
 * actor argument and must never take one.
 *
 * The service module is mocked here on purpose. This file is about *who may
 * call*, and about the state machine the form is driven by; whether the write
 * is correct is proved against the real database in
 * `src/lib/services/roster.test.ts`. Mocking it also means a refused call can
 * be shown to have reached the database **not at all**, which is the strongest
 * form of "returns no protected data".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("@/lib/services/roster", () => ({
  findPersonCandidates: vi.fn(),
  enterReturningPlayer: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new RedirectSignal(url);
  }),
}));

/** Stands in for Next's redirect throw, which is how `redirect()` signals. */
class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`redirect:${url}`);
  }
}

import { Conflict, isServiceError } from "@/lib/db";
import { resolveOperatorAccess, type OperatorAccess } from "@/lib/auth/operator";
import { enterReturningPlayer, findPersonCandidates } from "@/lib/services/roster";
import { submitReturnerIntake } from "./actions";
import { INITIAL_INTAKE_STATE } from "./intake-state";
import { GIVEN_NAME_REQUIRED, EMAIL_SHAPE } from "./validation";

const OPERATOR_PERSON_ID = "11111111-1111-4111-8111-111111111111";

function signedInAs(state: OperatorAccess): void {
  vi.mocked(resolveOperatorAccess).mockResolvedValue(state);
}

/** Defaults to an operator holding no club role — intake needs none. */
function activeOperator(roleCodes: string[] = []): OperatorAccess {
  return {
    state: "active",
    operator: {
      authUserId: "00000000-1111-4111-8111-111111111111",
      personId: OPERATOR_PERSON_ID,
      displayName: "Morgan Pike",
      roleCodes,
      isActive: true,
    },
  };
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.append(name, value);
  return data;
}

const VALID_DETAILS = {
  familyName: "Fielding",
  givenName: "Avery",
  knownAs: "Ave",
  email: "avery.fielding@example.invalid",
  phone: "+44 7700 900101",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(findPersonCandidates).mockResolvedValue([]);
});

// ---------------------------------------------------------------------------

describe("who may call it", () => {
  const refused: { label: string; access: OperatorAccess }[] = [
    { label: "no session at all", access: { state: "no_session" } },
    { label: "an account linked to no operator profile", access: { state: "unlinked" } },
    { label: "an operator profile that has been deactivated", access: { state: "inactive" } },
  ];

  for (const { label, access } of refused) {
    it(`refuses ${label}, and reads nothing`, async () => {
      signedInAs(access);

      const thrown = await submitReturnerIntake(
        INITIAL_INTAKE_STATE,
        form({ ...VALID_DETAILS, intent: "check" }),
      ).catch((error: unknown) => error);

      expect(isServiceError(thrown)).toBe(true);
      expect(thrown).toMatchObject({ kind: "not_permitted" });

      // The refusal happened before any club data was touched.
      expect(findPersonCandidates).not.toHaveBeenCalled();
      expect(enterReturningPlayer).not.toHaveBeenCalled();
    });

    it(`refuses ${label} on the write intents too`, async () => {
      signedInAs(access);

      for (const intent of ["confirm_new", "use_existing"]) {
        await expect(
          submitReturnerIntake(
            INITIAL_INTAKE_STATE,
            form({ ...VALID_DETAILS, intent, personId: "irrelevant" }),
          ),
        ).rejects.toMatchObject({ kind: "not_permitted" });
      }

      expect(enterReturningPlayer).not.toHaveBeenCalled();
    });
  }

  it("names no role and leaks no account detail in the refusal", async () => {
    signedInAs({ state: "unlinked" });

    const thrown = (await submitReturnerIntake(
      INITIAL_INTAKE_STATE,
      form({ ...VALID_DETAILS, intent: "check" }),
    ).catch((error: unknown) => error)) as Error;

    expect(thrown.message).not.toMatch(/president|secretary|coach|role code/i);
  });

  it("admits a linked, active operator holding no club role at all", async () => {
    // Returner intake is an ordinary operator action: `slice-ux.md` § 8's first
    // row, LAN-73's capability map does not name it, and LAN-74 asks only for
    // "an authenticated operator". Adding a role requirement here would be a
    // policy decision this issue is not allowed to take.
    signedInAs(activeOperator([]));

    const state = await submitReturnerIntake(
      INITIAL_INTAKE_STATE,
      form({ ...VALID_DETAILS, intent: "check" }),
    );

    expect(state.step).toBe("candidates");
    expect(findPersonCandidates).toHaveBeenCalledOnce();
  });

  it("takes the actor from the session, never from the submitted form", async () => {
    signedInAs(activeOperator());
    vi.mocked(enterReturningPlayer).mockResolvedValue({
      membershipId: "22222222-2222-4222-8222-222222222222",
    } as Awaited<ReturnType<typeof enterReturningPlayer>>);

    await submitReturnerIntake(
      INITIAL_INTAKE_STATE,
      form({
        ...VALID_DETAILS,
        intent: "confirm_new",
        // A hostile caller nominating somebody else as the actor.
        actorPersonId: "99999999-9999-4999-8999-999999999999",
        personId: "99999999-9999-4999-8999-999999999999",
      }),
    ).catch(() => undefined);

    expect(enterReturningPlayer).toHaveBeenCalledWith(
      expect.objectContaining({ actorPersonId: OPERATOR_PERSON_ID }),
    );
  });
});

// ---------------------------------------------------------------------------

describe("nothing is written before the operator decides", () => {
  beforeEach(() => signedInAs(activeOperator()));

  it("checks for matches without writing", async () => {
    const state = await submitReturnerIntake(
      INITIAL_INTAKE_STATE,
      form({ ...VALID_DETAILS, intent: "check" }),
    );

    expect(state.step).toBe("candidates");
    expect(enterReturningPlayer).not.toHaveBeenCalled();
  });

  it("still requires an explicit decision when nothing matched", async () => {
    // The promise UX-10 makes in its own body text. "No candidates" is not
    // permission to create — it is a result the operator has to confirm.
    vi.mocked(findPersonCandidates).mockResolvedValue([]);

    const state = await submitReturnerIntake(
      INITIAL_INTAKE_STATE,
      form({ ...VALID_DETAILS, intent: "check" }),
    );

    expect(state).toMatchObject({ step: "candidates", candidates: [] });
    expect(enterReturningPlayer).not.toHaveBeenCalled();
  });

  it("refuses to act on a selection that names nobody", async () => {
    const state = await submitReturnerIntake(
      INITIAL_INTAKE_STATE,
      form({ ...VALID_DETAILS, intent: "use_existing" }),
    );

    expect(state.step).toBe("candidates");
    expect(state).toHaveProperty("formError");
    expect(enterReturningPlayer).not.toHaveBeenCalled();
  });

  it("refuses an intent it does not recognise", async () => {
    const state = await submitReturnerIntake(
      INITIAL_INTAKE_STATE,
      form({ ...VALID_DETAILS, intent: "create_silently" }),
    );

    expect(state.step).toBe("details");
    expect(enterReturningPlayer).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------

describe("validation", () => {
  beforeEach(() => signedInAs(activeOperator()));

  it("keeps the operator's entries and names the field", async () => {
    const state = await submitReturnerIntake(
      INITIAL_INTAKE_STATE,
      form({ ...VALID_DETAILS, givenName: "  ", intent: "check" }),
    );

    expect(state).toMatchObject({
      step: "details",
      errors: { givenName: GIVEN_NAME_REQUIRED },
      // Preserved, so nothing typed is lost — the shared state contract.
      values: { familyName: "Fielding", email: VALID_DETAILS.email },
    });
    expect(findPersonCandidates).not.toHaveBeenCalled();
  });

  it("rejects an address with no @ at all, and accepts a messy but plausible one", async () => {
    const bad = await submitReturnerIntake(
      INITIAL_INTAKE_STATE,
      form({ ...VALID_DETAILS, email: "avery.fielding.example.invalid", intent: "check" }),
    );
    expect(bad).toMatchObject({ step: "details", errors: { email: EMAIL_SHAPE } });

    // A reversed TLD is a real defect in the club's files. It must get through
    // and be stored as typed — see `validation.ts`.
    const messy = await submitReturnerIntake(
      INITIAL_INTAKE_STATE,
      form({ ...VALID_DETAILS, email: "avery@example.ac.ox ", intent: "check" }),
    );
    expect(messy.step).toBe("candidates");
  });
});

// ---------------------------------------------------------------------------

describe("the write, and how it ends", () => {
  beforeEach(() => signedInAs(activeOperator()));

  it("redirects to the new membership on success", async () => {
    vi.mocked(enterReturningPlayer).mockResolvedValue({
      membershipId: "33333333-3333-4333-8333-333333333333",
    } as Awaited<ReturnType<typeof enterReturningPlayer>>);

    const thrown = await submitReturnerIntake(
      INITIAL_INTAKE_STATE,
      form({ ...VALID_DETAILS, intent: "confirm_new" }),
    ).catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(RedirectSignal);
    expect((thrown as RedirectSignal).url).toBe(
      "/operate/roster/33333333-3333-4333-8333-333333333333?created=1",
    );
  });

  it("shows UX-12 when the person already holds a membership this season", async () => {
    const personId = "44444444-4444-4444-8444-444444444444";
    vi.mocked(findPersonCandidates).mockResolvedValue([
      {
        personId,
        givenName: "Avery",
        familyName: "Fielding",
        knownAs: "Ave",
        email: null,
        phone: null,
        currentMembership: {
          id: "55555555-5555-4555-8555-555555555555",
          status: "active",
          seasonLabel: "2026-27",
        },
        matchedOn: ["given name"],
      },
    ]);
    vi.mocked(enterReturningPlayer).mockRejectedValue(
      new Conflict("This person already has a membership for the 2026-27 season.", {
        rule: "season_memberships_one_per_person_per_season",
      }),
    );

    const state = await submitReturnerIntake(
      INITIAL_INTAKE_STATE,
      form({ ...VALID_DETAILS, intent: "use_existing", personId }),
    );

    expect(state).toMatchObject({
      step: "membership_refused",
      refusal: {
        personName: "Avery Fielding",
        // Carried so UX-12 can render its approved sentence naming both the
        // person and the season, which the service's message cannot do.
        seasonLabel: "2026-27",
        membershipId: "55555555-5555-4555-8555-555555555555",
      },
    });
  });

  it("keeps a non-refusal failure on the candidate step and says nothing raw", async () => {
    vi.mocked(enterReturningPlayer).mockRejectedValue(
      new Error('connect ECONNREFUSED 127.0.0.1:54322 password="hunter2"'),
    );

    const state = await submitReturnerIntake(
      INITIAL_INTAKE_STATE,
      form({ ...VALID_DETAILS, intent: "confirm_new" }),
    );

    expect(state.step).toBe("candidates");
    const message = (state as { formError?: string }).formError ?? "";
    expect(message).not.toMatch(/ECONNREFUSED|127\.0\.0\.1|password|hunter2/);
  });
});
