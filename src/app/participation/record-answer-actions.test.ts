// @vitest-environment node
/**
 * `recordOperatorAnswerAction`'s guard — LAN-181 (F-D2).
 *
 * `screens.test.tsx` exercises this action for real through the dialog, but
 * only ever as a `secretary`. Independent review found the coach exclusion
 * untested: re-gating it away from `requireGeneralOperator()` left
 * `screens.test.tsx` at 64/64 green, because no test in this application ever
 * signed in as a coach and pressed "Record answer".
 *
 * The exclusion is real and correct live — a `head_coach` is refused the whole
 * `/participation` surface — this file is what proves the *action*, not the
 * page, holds that boundary: a Server Action is a POST endpoint the coach's
 * own session could call directly even if the page never rendered the control
 * for them.
 *
 * The actor is injected at `resolveOperatorAccess()`, exactly where a real
 * request produces it. The service layer is mocked; the write itself is
 * proved in `src/lib/services/rsvp.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// LAN-431: every per-event guard asks which template the event belongs to.
// One seeded template stands in for the database, so a seeded full-access seat
// holds Manage on it and every other seat holds nothing.
vi.mock("@/lib/services/events/template-of", () => ({
  eventTemplateIdOf: vi.fn(async () => "7e34a764-7ed1-535e-8cef-73e00a62eafc"),
  invitationTemplateIdsOf: vi.fn(async () => ["7e34a764-7ed1-535e-8cef-73e00a62eafc"]),
  notificationJobTemplateOf: vi.fn(async () => ({
    templateId: "7e34a764-7ed1-535e-8cef-73e00a62eafc",
  })),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/services/rsvp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/rsvp")>();
  return { ...actual, recordOperatorRsvpResponse: vi.fn() };
});

import {
  resolveOperatorAccess,
  type OperatorAccess,
  type ResolvedOperator,
} from "@/lib/auth/operator";
import { isServiceError, type ServiceError } from "@/lib/db";
import { recordOperatorRsvpResponse } from "@/lib/services/rsvp";
import { recordOperatorAnswerAction } from "./record-answer-actions";
import { EMPTY_RECORD_ANSWER_STATE } from "./record-answer-state";
import { seededGrantsFor } from "@/lib/auth/capabilities";
import { NO_GRANTS } from "@/lib/auth/grants";

const EVENT_ID = "44444444-4444-4444-8444-444444444444";
const INVITATION_ID = "55555555-5555-4555-8555-555555555555";
const OPERATOR_PERSON_ID = "22222222-2222-4222-8222-222222222222";

function actor(roleCodes: string[]): ResolvedOperator {
  return {
    authUserId: "11111111-1111-4111-8111-111111111111",
    personId: OPERATOR_PERSON_ID,
    displayName: "Rowan Ashdown",
    roleCodes,
    grants: seededGrantsFor(roleCodes),
    isActive: true,
  };
}

function givenAccess(access: OperatorAccess) {
  vi.mocked(resolveOperatorAccess).mockResolvedValue(access);
}

function signedInAs(roleCodes: string[]): ResolvedOperator {
  const operator = actor(roleCodes);
  givenAccess({ state: "active", operator });
  return operator;
}

function answerForm(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  const fields: Record<string, string> = {
    eventId: EVENT_ID,
    invitationId: INVITATION_ID,
    response: "yes",
    reason: "",
    respondedAtDate: "2026-09-01",
    respondedAtTime: "18:00",
    ...overrides,
  };
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}

async function refusalFrom(attempt: () => Promise<unknown>): Promise<ServiceError> {
  try {
    await attempt();
  } catch (error) {
    if (isServiceError(error)) return error;
    throw error;
  }
  throw new Error("Expected the action to refuse this, but it returned normally.");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(recordOperatorRsvpResponse).mockResolvedValue({} as never);
});

describe("recordOperatorAnswerAction refuses a caller with no operator profile", () => {
  const UNRESOLVED: OperatorAccess[] = [
    { state: "no_session" },
    { state: "unlinked" },
    { state: "inactive" },
  ];

  for (const access of UNRESOLVED) {
    it(`refuses when the session is ${access.state}`, async () => {
      givenAccess(access);

      const error = await refusalFrom(() =>
        recordOperatorAnswerAction(EMPTY_RECORD_ANSWER_STATE, answerForm()),
      );

      expect(error.kind).toBe("not_permitted");
      expect(recordOperatorRsvpResponse).not.toHaveBeenCalled();
    });
  }
});

// LAN-431: the template `./template-of` is mocked to, and the rule a refusal carries.
const TEMPLATE_ID = "7e34a764-7ed1-535e-8cef-73e00a62eafc";
const MANAGE_RULE = `grant:template.${TEMPLATE_ID}>=manage`;

function signedInWithTemplate(level: "view" | "manage"): ResolvedOperator {
  const operator = {
    ...actor(["social_secretary"]),
    grants: { ...NO_GRANTS, templates: { [TEMPLATE_ID]: level } },
  };
  givenAccess({ state: "active", operator });
  return operator;
}

describe("recordOperatorAnswerAction excludes the narrow attendance-recording coach — LAN-110", () => {
  it("refuses a head_coach holding no other seat", async () => {
    signedInAs(["head_coach"]);

    const error = await refusalFrom(() =>
      recordOperatorAnswerAction(EMPTY_RECORD_ANSWER_STATE, answerForm()),
    );

    expect(error.kind).toBe("not_permitted");
    expect(error.rule).toBe(MANAGE_RULE);
    expect(recordOperatorRsvpResponse).not.toHaveBeenCalled();
  });

  it("refuses an offence_coach holding no other seat", async () => {
    signedInAs(["offence_coach"]);

    const error = await refusalFrom(() =>
      recordOperatorAnswerAction(EMPTY_RECORD_ANSWER_STATE, answerForm()),
    );

    expect(error.kind).toBe("not_permitted");
    expect(error.rule).toBe(MANAGE_RULE);
    expect(recordOperatorRsvpResponse).not.toHaveBeenCalled();
  });

  it("still admits a coach who also holds a seat managing the event's template", async () => {
    const operator = signedInAs(["head_coach", "secretary"]);

    const state = await recordOperatorAnswerAction(EMPTY_RECORD_ANSWER_STATE, answerForm());

    expect(state.error).toBeNull();
    expect(recordOperatorRsvpResponse).toHaveBeenCalledWith(
      operator.personId,
      EVENT_ID,
      INVITATION_ID,
      expect.objectContaining({ response: "yes" }),
    );
  });
});

describe("recordOperatorAnswerAction requires Manage on the event's template — LAN-431", () => {
  it("lets a secretary, seeded at Manage everywhere, record an answer with the session's actor", async () => {
    const operator = signedInAs(["secretary"]);

    const state = await recordOperatorAnswerAction(EMPTY_RECORD_ANSWER_STATE, answerForm());

    expect(state.error).toBeNull();
    expect(state.success).toBe(true);
    expect(recordOperatorRsvpResponse).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordOperatorRsvpResponse).mock.calls[0][0]).toBe(operator.personId);
  });

  it("lets a seat with Manage on this template alone record an answer", async () => {
    const operator = signedInWithTemplate("manage");

    const state = await recordOperatorAnswerAction(EMPTY_RECORD_ANSWER_STATE, answerForm());

    expect(state.success).toBe(true);
    expect(vi.mocked(recordOperatorRsvpResponse).mock.calls[0][0]).toBe(operator.personId);
  });

  it("refuses a forged post from a seat with View on the template", async () => {
    signedInWithTemplate("view");

    const error = await refusalFrom(() =>
      recordOperatorAnswerAction(EMPTY_RECORD_ANSWER_STATE, answerForm()),
    );

    expect(error.rule).toBe(MANAGE_RULE);
    expect(recordOperatorRsvpResponse).not.toHaveBeenCalled();
  });

  for (const role of ["treasurer", "social_secretary", "media_secretary"]) {
    it(`refuses a ${role} holding no template`, async () => {
      signedInAs([role]);

      const error = await refusalFrom(() =>
        recordOperatorAnswerAction(EMPTY_RECORD_ANSWER_STATE, answerForm()),
      );

      expect(error.kind).toBe("not_permitted");
      expect(recordOperatorRsvpResponse).not.toHaveBeenCalled();
    });
  }

  it("refuses an operator holding no seat at all", async () => {
    signedInAs([]);

    const error = await refusalFrom(() =>
      recordOperatorAnswerAction(EMPTY_RECORD_ANSWER_STATE, answerForm()),
    );

    expect(error.kind).toBe("not_permitted");
    expect(recordOperatorRsvpResponse).not.toHaveBeenCalled();
  });

  it("ignores an actor supplied in the form body", async () => {
    const operator = signedInAs(["secretary"]);
    const form = answerForm({ actorPersonId: "99999999-9999-4999-8999-999999999999" });

    await recordOperatorAnswerAction(EMPTY_RECORD_ANSWER_STATE, form);

    expect(vi.mocked(recordOperatorRsvpResponse).mock.calls[0][0]).toBe(operator.personId);
  });
});
