/**
 * REQ-three-tiers: "Authorisation is enforced in the service layer, never by
 * route visibility." LAN-157.
 *
 * These assert the guard is asked **before** anything is read, so the refusal
 * does not depend on a page having hidden a control or a route having been
 * gated. The guard module is mocked and made to refuse; if the service reached
 * the database anyway, `vitest.setup.ts` would fail the file for opening a
 * connection outside the database project — which is itself part of the
 * assertion.
 *
 * The data these functions return is proved against the real database in
 * `./participation.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/guards", () => ({
  requireGeneralOperator: vi.fn(),
  requireCapability: vi.fn(),
}));

import { NotPermitted } from "@/lib/db";
import { requireCapability, requireGeneralOperator } from "@/lib/auth/guards";
import { issueEventClubLink, readEventClubLink, readOperatorParticipation } from "./participation";

const generalOperator = vi.mocked(requireGeneralOperator);
const capability = vi.mocked(requireCapability);

const REFUSAL = new NotPermitted("You do not have access to this action.", {
  rule: "capability:event_calendar_management",
});

beforeEach(() => {
  generalOperator.mockReset();
  capability.mockReset();
});

describe("reading the operator tier", () => {
  it("asks for a general operator, and reads nothing when refused", async () => {
    generalOperator.mockRejectedValue(REFUSAL);
    await expect(readOperatorParticipation("event-1")).rejects.toBe(REFUSAL);
    expect(generalOperator).toHaveBeenCalledTimes(1);
  });

  it("takes no actor argument, so a caller cannot say who they are", () => {
    // A server action is a POST endpoint anybody with a session can call. The
    // actor is resolved from the verified session inside the guard, and the
    // arity here is what makes that structural rather than conventional.
    expect(readOperatorParticipation).toHaveLength(1);
  });
});

describe("issuing and reading the club link", () => {
  it("asks for `event_calendar_management` before creating anything", async () => {
    capability.mockRejectedValue(REFUSAL);
    await expect(issueEventClubLink("event-1")).rejects.toBe(REFUSAL);
    expect(capability).toHaveBeenCalledWith("event_calendar_management");
  });

  it("asks for the same capability to read the live link", async () => {
    // Reading is not a lesser act here: the value being read is the link
    // itself, and anyone holding it holds the tier.
    capability.mockRejectedValue(REFUSAL);
    await expect(readEventClubLink("event-1")).rejects.toBe(REFUSAL);
    expect(capability).toHaveBeenCalledWith("event_calendar_management");
  });

  it("never resolves the operator from anything but the session", () => {
    expect(issueEventClubLink).toHaveLength(1);
    expect(readEventClubLink).toHaveLength(1);
  });
});
