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

const REACHABLE = "00810081-0081-4081-8081-000000000001";
const UNREACHABLE = "00810081-0081-4081-8081-000000000002";
const ANSWERED = "00810081-0081-4081-8081-000000000003";

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
      { invitationId: REACHABLE, outcome: "accepted" },
      { invitationId: UNREACHABLE, outcome: "refused" },
      { invitationId: ANSWERED, outcome: "not_outstanding" },
    ]);

    const result = await chaseSelectedAction([REACHABLE, UNREACHABLE, ANSWERED]);

    expect(result.accepted).toBe(1);
    expect(result.refusedInvitationIds).toEqual([UNREACHABLE]);
    expect(result.notOutstandingInvitationIds).toEqual([ANSWERED]);
    expect(result.error).toBeNull();
    expect(revalidatePath).toHaveBeenCalledWith("/operate/admin/follow-ups");
  });

  it("reports a recruit's refusal beside an unreachable one — both mean nothing was sent", async () => {
    signedInAs(["secretary"]);
    vi.mocked(sendEventChases).mockResolvedValue([
      { invitationId: UNREACHABLE, outcome: "not_chaseable" },
    ]);

    const result = await chaseSelectedAction([UNREACHABLE]);

    expect(result.accepted).toBe(0);
    expect(result.refusedInvitationIds).toEqual([UNREACHABLE]);
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
