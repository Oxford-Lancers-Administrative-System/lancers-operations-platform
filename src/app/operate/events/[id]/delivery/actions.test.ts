// @vitest-environment node
/**
 * The two repair Server Actions — LAN-78.
 *
 * Every call here goes **straight to the action**. No page renders, so nothing
 * decided what the caller was allowed to click. A Server Action is a POST
 * endpoint, and anybody holding a session can call it whether or not a screen
 * ever offered it — hiding the control on the delivery page is a courtesy, and
 * these are the tests that hold the actual boundary.
 *
 * Independent review found this untested: re-gating both actions to
 * `attendance_recorder`, the coaching seats `docs/ux/slice-ux.md` § 3 says must
 * receive no delivery data, passed typecheck and the whole suite. The actor is
 * therefore injected where a real request produces it — at
 * `resolveOperatorAccess()` — and the role codes are real, so a wrong
 * capability changes who gets through and fails.
 *
 * The service layer is mocked. What is under test is the guard, the actor it
 * passes on and how a refusal is presented; the writes are proved against the
 * real database in `src/lib/services/delivery.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/services/delivery", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/delivery")>();
  return { ...actual, retryDelivery: vi.fn(), revokeAndReissue: vi.fn() };
});

import { revalidatePath } from "next/cache";
import { InvalidTransition, isServiceError } from "@/lib/db";
import { resolveOperatorAccess, type ResolvedOperator } from "@/lib/auth/operator";
import { retryDelivery, revokeAndReissue } from "@/lib/services/delivery";
import { retryDeliveryAction, revokeAndReissueAction } from "./actions";

const EVENT = "00780078-0078-4078-8078-000000000050";
const JOB = "00780078-0078-4078-8078-000000000081";
const INVITATION = "00780078-0078-4078-8078-000000000071";

const PERMITTED = ["president", "vice_president", "secretary", "general_manager"];
const REFUSED = ["head_coach", "offence_coach", "defence_coach", "treasurer", "media_secretary"];

function signedInAs(roleCodes: string[]): ResolvedOperator {
  const operator: ResolvedOperator = {
    authUserId: "00000000-0000-4000-8000-000000000001",
    personId: "00000000-0000-4000-8000-000000000002",
    displayName: "Morgan Pike",
    roleCodes,
    isActive: true,
  };
  vi.mocked(resolveOperatorAccess).mockResolvedValue({ state: "active", operator });
  return operator;
}

function retryForm(): FormData {
  const form = new FormData();
  form.set("eventId", EVENT);
  form.set("jobId", JOB);
  return form;
}

function reissueForm(reason = "Sent to the wrong number"): FormData {
  const form = new FormData();
  form.set("eventId", EVENT);
  form.set("invitationId", INVITATION);
  form.set("reason", reason);
  return form;
}

async function refusalFrom(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    if (isServiceError(error)) return error;
    throw error;
  }
  throw new Error("Expected a refusal, and the action returned normally.");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(retryDelivery).mockResolvedValue("accepted");
  vi.mocked(revokeAndReissue).mockResolvedValue("accepted");
});

describe("retryDeliveryAction", () => {
  it.each(PERMITTED)("lets the %s retry, and names them as the actor", async (code) => {
    const operator = signedInAs([code]);

    const state = await retryDeliveryAction({ error: null }, retryForm());

    expect(state.error).toBeNull();
    expect(retryDelivery).toHaveBeenCalledWith(operator.personId, JOB);
    expect(revalidatePath).toHaveBeenCalledWith(`/operate/events/${EVENT}/delivery`);
  });

  it.each(REFUSED)("refuses the %s, and calls the service not at all", async (code) => {
    signedInAs([code]);

    const refusal = await refusalFrom(() => retryDeliveryAction({ error: null }, retryForm()));

    expect(refusal.kind).toBe("not_permitted");
    expect(refusal.rule).toBe("capability:delivery_administration");
    expect(retryDelivery).not.toHaveBeenCalled();
  });

  it("refuses an unlinked account", async () => {
    vi.mocked(resolveOperatorAccess).mockResolvedValue({ state: "unlinked" });

    const refusal = await refusalFrom(() => retryDeliveryAction({ error: null }, retryForm()));

    expect(refusal.kind).toBe("not_permitted");
    expect(retryDelivery).not.toHaveBeenCalled();
  });

  it("ignores an actor the form tries to supply", async () => {
    const operator = signedInAs(["secretary"]);
    const form = retryForm();
    form.set("actorPersonId", "somebody-else");

    await retryDeliveryAction({ error: null }, form);

    // The actor comes from the verified session and from nowhere else. A Server
    // Action that trusted the body would accept whatever the browser sent.
    expect(retryDelivery).toHaveBeenCalledWith(operator.personId, JOB);
  });

  it("shows a service refusal as state rather than throwing", async () => {
    signedInAs(["secretary"]);
    vi.mocked(retryDelivery).mockRejectedValue(
      new InvalidTransition("This invitation has already been attempted 5 times."),
    );

    const state = await retryDeliveryAction({ error: null }, retryForm());

    expect(state.error).toContain("already been attempted");
  });

  it("rethrows an authorization refusal instead of rendering it beside a button", async () => {
    signedInAs(["secretary"]);
    const { NotPermitted } = await import("@/lib/db");
    vi.mocked(retryDelivery).mockRejectedValue(new NotPermitted("nope"));

    // A refusal shown as red text beside a control reads as "fix your input and
    // try again", which hides an authorization event inside a validation one.
    const refusal = await refusalFrom(() => retryDeliveryAction({ error: null }, retryForm()));
    expect(refusal.kind).toBe("not_permitted");
  });
});

describe("revokeAndReissueAction", () => {
  it.each(PERMITTED)("lets the %s reissue", async (code) => {
    const operator = signedInAs([code]);

    const state = await revokeAndReissueAction({ error: null }, reissueForm());

    expect(state.error).toBeNull();
    expect(revokeAndReissue).toHaveBeenCalledWith(
      operator.personId,
      INVITATION,
      "Sent to the wrong number",
    );
  });

  it.each(REFUSED)("refuses the %s, and calls the service not at all", async (code) => {
    signedInAs([code]);

    const refusal = await refusalFrom(() => revokeAndReissueAction({ error: null }, reissueForm()));

    expect(refusal.kind).toBe("not_permitted");
    expect(refusal.rule).toBe("capability:delivery_administration");
    expect(revokeAndReissue).not.toHaveBeenCalled();
  });

  it("passes the reason through, because withdrawing a link is a decision", async () => {
    signedInAs(["secretary"]);

    await revokeAndReissueAction({ error: null }, reissueForm("Wrong person entirely"));

    expect(revokeAndReissue).toHaveBeenCalledWith(
      expect.any(String),
      INVITATION,
      "Wrong person entirely",
    );
  });

  it("acts only on the invitation it was given", async () => {
    signedInAs(["secretary"]);

    await revokeAndReissueAction({ error: null }, reissueForm());

    // Neither action takes an audience, an event's recipient list or a person.
    // LAN-77 froze the audience at approval, and repair cannot widen it.
    const [, invitationId] = vi.mocked(revokeAndReissue).mock.calls[0];
    expect(invitationId).toBe(INVITATION);
  });
});
