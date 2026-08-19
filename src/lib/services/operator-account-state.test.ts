// @vitest-environment node
/**
 * The five operator states — LAN-131, `REQ-invitation-states`, matrix row 20.
 *
 * Pure, so every combination is reachable, including the ones that would take
 * three writes and a failed email to produce in a database. The two properties
 * worth proving here are the ones a screen would otherwise get wrong:
 *
 *   * **Precedence.** An account can satisfy several conditions at once, and
 *     the answer must be the strongest constraint rather than whichever branch
 *     happened to come first. A deactivated account whose invitation never
 *     arrived is Deactivated, not Delivery failed — showing the latter offers a
 *     Resend that cannot help anybody sign in.
 *
 *   * **Resend availability is derived, not listed.** `REQ-invitation-states`
 *     exposes resend "while pending or failed", and a screen re-listing those
 *     two states is a second copy of the rule that can drift from the service's.
 */
import { describe, expect, it } from "vitest";

import {
  deriveOperatorAccountState,
  isOperatorAccountState,
  operatorAccountState,
  OPERATOR_ACCOUNT_STATES,
  OPERATOR_ACCOUNT_STATE_DEFINITIONS,
  type OperatorAccountStateInput,
} from "./operator-account-state";

const ACTIVE_ACCOUNT: OperatorAccountStateInput = {
  isActive: true,
  activatedAt: new Date("2026-08-01T10:00:00Z"),
  invitationDeliveryFailedAt: null,
  emailChangePending: false,
};

const PENDING_ACCOUNT: OperatorAccountStateInput = {
  isActive: true,
  activatedAt: null,
  invitationDeliveryFailedAt: null,
  emailChangePending: false,
};

describe("each of the five states is reachable", () => {
  it("is Invitation pending when nobody has established credentials", () => {
    expect(deriveOperatorAccountState(PENDING_ACCOUNT)).toBe("invitation_pending");
  });

  it("is Delivery failed when the last attempt is known to have failed", () => {
    expect(
      deriveOperatorAccountState({
        ...PENDING_ACCOUNT,
        invitationDeliveryFailedAt: new Date("2026-08-19T09:00:00Z"),
      }),
    ).toBe("delivery_failed");
  });

  it("is Active once credentials exist", () => {
    expect(deriveOperatorAccountState(ACTIVE_ACCOUNT)).toBe("active");
  });

  it("is Deactivated when access has been withdrawn", () => {
    expect(deriveOperatorAccountState({ ...ACTIVE_ACCOUNT, isActive: false })).toBe("deactivated");
  });

  it("is Email change pending while a replacement address is unverified", () => {
    expect(deriveOperatorAccountState({ ...ACTIVE_ACCOUNT, emailChangePending: true })).toBe(
      "email_change_pending",
    );
  });

  it("names every state the vocabulary declares, and no others", () => {
    expect([...OPERATOR_ACCOUNT_STATES].sort()).toEqual(
      Object.keys(OPERATOR_ACCOUNT_STATE_DEFINITIONS).sort(),
    );
  });
});

describe("precedence — the strongest constraint is what the club is told", () => {
  it("reports Deactivated for an account that was never taken up", () => {
    expect(
      deriveOperatorAccountState({
        isActive: false,
        activatedAt: null,
        invitationDeliveryFailedAt: null,
        emailChangePending: false,
      }),
    ).toBe("deactivated");
  });

  it("reports Deactivated for an account whose invitation also failed to arrive", () => {
    expect(
      deriveOperatorAccountState({
        isActive: false,
        activatedAt: null,
        invitationDeliveryFailedAt: new Date(),
        emailChangePending: false,
      }),
    ).toBe("deactivated");
  });

  it("reports Deactivated even mid email change — nobody signs in either way", () => {
    expect(
      deriveOperatorAccountState({ ...ACTIVE_ACCOUNT, isActive: false, emailChangePending: true }),
    ).toBe("deactivated");
  });

  it("reports Email change pending over Active, because the old login is disabled", () => {
    expect(deriveOperatorAccountState({ ...ACTIVE_ACCOUNT, emailChangePending: true })).toBe(
      "email_change_pending",
    );
  });

  it("reports Active over a stale delivery failure the activation superseded", () => {
    expect(
      deriveOperatorAccountState({
        ...ACTIVE_ACCOUNT,
        invitationDeliveryFailedAt: new Date("2026-07-01T00:00:00Z"),
      }),
    ).toBe("active");
  });
});

describe("the state carries its own rules", () => {
  it("offers a resend exactly while the invitation is pending or failed", () => {
    const resendable = OPERATOR_ACCOUNT_STATES.filter(
      (value) => operatorAccountState(value).resendAvailable,
    );
    expect([...resendable].sort()).toEqual(["delivery_failed", "invitation_pending"]);
  });

  it("counts only Active as a usable route into the application", () => {
    const usable = OPERATOR_ACCOUNT_STATES.filter((value) => operatorAccountState(value).usable);
    expect(usable).toEqual(["active"]);
  });

  it("gives every state a club-facing label and a sentence, and no technical terms", () => {
    for (const value of OPERATOR_ACCOUNT_STATES) {
      const definition = operatorAccountState(value);
      expect(definition.label.trim()).not.toBe("");
      expect(definition.description.trim().length).toBeGreaterThan(20);
      // `DEC-administration-language-and-states`: plain club-facing terms only.
      expect(definition.label).not.toMatch(/durable person|effective access|access history/i);
      expect(definition.description).not.toMatch(/supabase|auth\.users|sql|token/i);
    }
  });
});

describe("a value from outside is never trusted", () => {
  it.each([
    ["a state that does not exist", "pending"],
    ["a prototype key", "constructor"],
    ["an empty string", ""],
    ["a number", 3],
    ["null", null],
  ])("%s is not an operator state", (_name, value) => {
    expect(isOperatorAccountState(value)).toBe(false);
  });

  it("accepts every declared state", () => {
    for (const value of OPERATOR_ACCOUNT_STATES) expect(isOperatorAccountState(value)).toBe(true);
  });
});

describe("undefined is treated as absent, not as present", () => {
  // The rows come back from `pg` with `null`, but a partially-built object in a
  // caller — or a column a query forgot to select — arrives as `undefined`. The
  // dangerous direction is reading that as "activated", which would report an
  // account nobody has taken up as Active.
  it("reports Invitation pending when the timestamps are missing entirely", () => {
    expect(
      deriveOperatorAccountState({
        isActive: true,
        activatedAt: undefined as unknown as null,
        invitationDeliveryFailedAt: undefined as unknown as null,
      }),
    ).toBe("invitation_pending");
  });
});
