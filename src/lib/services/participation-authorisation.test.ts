/**
 * REQ-three-tiers: "Authorisation is enforced in the service layer, never by
 * route visibility." LAN-157.
 *
 * These assert the guard is asked **before** anything is read, so the refusal
 * does not depend on a page having hidden a control or a route having been
 * gated. The guard is mocked and made to refuse; if the service reached the
 * database anyway, `vitest.setup.ts` would fail the file for opening a
 * connection outside the database project — which is itself part of the
 * assertion.
 *
 * LAN-431: the guard is View on the event's own template, for the table and
 * for the Event info link alike (W4-05 — it shares, it sends nothing).
 *
 * The data these functions return is proved against the real database in
 * `./participation.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./events/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./events/access")>();
  return { ...actual, requireEventGrant: vi.fn() };
});

import { NotPermitted } from "@/lib/db";
import { requireEventGrant } from "./events/access";
import { issueEventClubLink, readEventClubLink, readOperatorParticipation } from "./participation";

const eventGrant = vi.mocked(requireEventGrant);

const REFUSAL = new NotPermitted("You do not have access to this action.", {
  rule: "grant:template.t>=view",
});

beforeEach(() => {
  eventGrant.mockReset();
});

describe("reading the operator tier", () => {
  it("asks for View on the event's template, and reads nothing when refused", async () => {
    eventGrant.mockRejectedValue(REFUSAL);
    await expect(readOperatorParticipation("event-1")).rejects.toBe(REFUSAL);
    expect(eventGrant).toHaveBeenCalledWith("event-1", "view");
  });

  it("takes no actor argument, so a caller cannot say who they are", () => {
    // A server action is a POST endpoint anybody with a session can call. The
    // actor is resolved from the verified session inside the guard, and the
    // arity here is what makes that structural rather than conventional.
    expect(readOperatorParticipation).toHaveLength(1);
  });
});

describe("issuing and reading the club link", () => {
  it("asks for View on the event's template before creating anything", async () => {
    eventGrant.mockRejectedValue(REFUSAL);
    await expect(issueEventClubLink("event-1")).rejects.toBe(REFUSAL);
    expect(eventGrant).toHaveBeenCalledWith("event-1", "view");
  });

  it("asks for the same to read the live link", async () => {
    // Reading is not a lesser act here: the value being read is the link
    // itself, and anyone holding it holds the tier.
    eventGrant.mockRejectedValue(REFUSAL);
    await expect(readEventClubLink("event-1")).rejects.toBe(REFUSAL);
    expect(eventGrant).toHaveBeenCalledWith("event-1", "view");
  });

  it("never resolves the operator from anything but the session", () => {
    expect(issueEventClubLink).toHaveLength(1);
    expect(readEventClubLink).toHaveLength(1);
  });
});
