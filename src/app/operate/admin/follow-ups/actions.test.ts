// @vitest-environment node
/**
 * The Follow-ups queue's chase action — LAN-322.
 *
 * Straight to the action, for `delivery/actions.test.ts`'s reason: a Server
 * Action is a POST endpoint that anybody holding a session can call, so hiding
 * the checkboxes from a seat without `delivery_administration` is a courtesy
 * and this is the test that holds the boundary. The actor is injected where a
 * real request produces it, and the role codes are real, so a wrong capability
 * changes who gets through and fails here.
 *
 * `sendEventChases` is mocked; it is proved against the real database in
 * `src/lib/services/follow-ups.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/services/messaging-scheduler", () => ({ sendEventChases: vi.fn() }));

import { revalidatePath } from "next/cache";
import { ConstraintViolated, isServiceError } from "@/lib/db";
import { resolveOperatorAccess, type ResolvedOperator } from "@/lib/auth/operator";
import { sendEventChases } from "@/lib/services/messaging-scheduler";
import { chaseSelectedAction } from "./actions";
import { CHASE_REFUSAL_UNRECORDED, NOT_CHASEABLE } from "./presentation";

const REACHABLE = "00810081-0081-4081-8081-000000000001";
const UNREACHABLE = "00810081-0081-4081-8081-000000000002";
const ANSWERED = "00810081-0081-4081-8081-000000000003";

/** The two sentences the delivery path actually records, abbreviated to their load-bearing half. */
const NO_NUMBER = "No usable mobile number is recorded for this person, so nothing could be sent.";
const UNCONFIGURED =
  "Automated delivery is not configured on this deployment, so nothing was sent.";

const PERMITTED = ["president", "vice_president", "secretary", "general_manager", "it_officer"];
const REFUSED = ["head_coach", "treasurer", "media_secretary", "welfare_officer"];

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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(sendEventChases).mockResolvedValue([]);
});

describe("who may chase from the queue", () => {
  it.each(PERMITTED)("admits %s — the seats that already repair a delivery", async (role) => {
    signedInAs([role]);
    await expect(chaseSelectedAction([REACHABLE])).resolves.toBeTruthy();
    expect(sendEventChases).toHaveBeenCalledTimes(1);
  });

  it.each(REFUSED)("refuses %s, and sends nothing", async (role) => {
    signedInAs([role]);
    await expect(chaseSelectedAction([REACHABLE])).rejects.toSatisfy(
      (error: unknown) => isServiceError(error) && error.kind === "not_permitted",
    );
    expect(sendEventChases).not.toHaveBeenCalled();
  });
});

describe("what one press does", () => {
  it("sends nothing at all when nothing was selected", async () => {
    signedInAs(["secretary"]);
    const result = await chaseSelectedAction([]);
    expect(result.error).toBe("Select at least one person to chase.");
    expect(sendEventChases).not.toHaveBeenCalled();
  });

  it("passes the operator's own person id, and each invitation once", async () => {
    const operator = signedInAs(["secretary"]);
    await chaseSelectedAction([REACHABLE, REACHABLE, "  "]);
    expect(sendEventChases).toHaveBeenCalledWith(operator.personId, [REACHABLE]);
  });

  it("counts what went and names what did not, rather than reporting a whole success", async () => {
    signedInAs(["secretary"]);
    vi.mocked(sendEventChases).mockResolvedValue([
      { invitationId: REACHABLE, outcome: "accepted", reason: null },
      { invitationId: UNREACHABLE, outcome: "refused", reason: NO_NUMBER },
      { invitationId: ANSWERED, outcome: "not_outstanding", reason: null },
    ]);

    const result = await chaseSelectedAction([REACHABLE, UNREACHABLE, ANSWERED]);

    expect(result.accepted).toBe(1);
    expect(result.refusals).toEqual([{ invitationId: UNREACHABLE, reason: NO_NUMBER }]);
    expect(result.notOutstandingInvitationIds).toEqual([ANSWERED]);
    expect(result.error).toBeNull();
    expect(revalidatePath).toHaveBeenCalledWith("/operate/admin/follow-ups");
  });

  it("reports a recruit's refusal beside an unreachable one — both mean nothing was sent", async () => {
    signedInAs(["secretary"]);
    vi.mocked(sendEventChases).mockResolvedValue([
      { invitationId: UNREACHABLE, outcome: "not_chaseable", reason: null },
    ]);

    const result = await chaseSelectedAction([UNREACHABLE]);

    expect(result.accepted).toBe(0);
    // No job is ever written for a recruit, so there is no recorded sentence to
    // read: the queue's own word for the rule is the reason the operator sees.
    expect(result.refusals).toEqual([{ invitationId: UNREACHABLE, reason: NOT_CHASEABLE }]);
  });

  /**
   * LAN-322's walk: "3 people could not be chased:" and a run of names told an
   * operator nothing about what to do next. The reason the delivery path
   * recorded is what separates "correct their phone number" from "ask the
   * club's administrator to configure this deployment", so it travels with the
   * name rather than being left on the job row nobody on this screen opens.
   */
  it("carries each refusal's recorded reason out beside the person it belongs to", async () => {
    signedInAs(["secretary"]);
    vi.mocked(sendEventChases).mockResolvedValue([
      { invitationId: UNREACHABLE, outcome: "refused", reason: NO_NUMBER },
      { invitationId: REACHABLE, outcome: "refused", reason: UNCONFIGURED },
    ]);

    const result = await chaseSelectedAction([UNREACHABLE, REACHABLE]);

    expect(result.refusals).toEqual([
      { invitationId: UNREACHABLE, reason: NO_NUMBER },
      { invitationId: REACHABLE, reason: UNCONFIGURED },
    ]);
  });

  it("says so rather than showing an empty reason when the refusal recorded none", async () => {
    signedInAs(["secretary"]);
    vi.mocked(sendEventChases).mockResolvedValue([
      { invitationId: UNREACHABLE, outcome: "refused", reason: null },
    ]);

    const result = await chaseSelectedAction([UNREACHABLE]);

    expect(result.refusals).toEqual([
      { invitationId: UNREACHABLE, reason: CHASE_REFUSAL_UNRECORDED },
    ]);
  });

  it("returns a service refusal as a message rather than throwing the page away", async () => {
    signedInAs(["secretary"]);
    vi.mocked(sendEventChases).mockRejectedValue(
      new ConstraintViolated("That invitation no longer exists."),
    );

    const result = await chaseSelectedAction([REACHABLE]);

    expect(result.error).toBe("That invitation no longer exists.");
    expect(result.accepted).toBe(0);
  });
});
