/**
 * The three access tiers — LAN-153, `REQ-three-tiers`.
 *
 * This package opens the application's first genuinely anonymous read surface,
 * which is why it is graded Highest: until now "the page is under `/operate`"
 * was at least an approximation of who was reading, and it no longer is. These
 * assertions are about the boundary itself — what each tier may see, what the
 * guard refuses, and what a refusal says.
 *
 * The other half of the boundary is not here and cannot be: it is that the
 * public projection has no column and no field for anything restricted.
 * `src/lib/services/events.test.ts` asserts that against the real database and
 * against the query text, because a type test would pass on a season whose
 * events all happen to be in person.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./operator", () => ({ resolveOperatorAccess: vi.fn() }));

import { NotPermitted } from "@/lib/db";
import { resolveOperatorAccess, type OperatorAccess, type ResolvedOperator } from "./operator";
import {
  assertEventOperatorTier,
  EVENT_OPERATOR_TIER_MESSAGE,
  EVENT_OPERATOR_TIER_RULE,
  EVENT_READ_TIERS,
  requireEventOperatorTier,
  resolveEventReadTier,
  tierSees,
  type EventElement,
  type EventReadTier,
} from "./event-tier";
import type { ParticipationTier } from "@/lib/services/participation-view";

/**
 * The two tier vocabularies are one vocabulary — R157-B7.
 *
 * `@/lib/services/participation-view` cannot import this module: it is
 * `server-only` and that one is imported by a client component. So the types are
 * declared twice and pinned here instead, at compile time, in both directions.
 * A fourth `EventReadTier`, or a third `ParticipationTier`, or a rename of
 * either, fails `npm run typecheck` rather than quietly becoming a second
 * vocabulary.
 *
 * They are pinned as a **narrowing**, not as equality: `ParticipationTier` is
 * `EventReadTier` without `public`, because there is no public participation
 * payload for a `tier: "public"` to discriminate.
 */
type ParticipationTierIsEventReadTierWithoutPublic =
  Exclude<EventReadTier, "public"> extends ParticipationTier
    ? ParticipationTier extends Exclude<EventReadTier, "public">
      ? true
      : never
    : never;
const tiersAreOneVocabulary: ParticipationTierIsEventReadTierWithoutPublic = true;

/** The three ways `resolveOperatorAccess` says "not an active operator". */
const UNRESOLVED: OperatorAccess[] = [
  { state: "no_session" },
  { state: "unlinked" },
  { state: "inactive" },
];

function operator(roleCodes: string[] = ["secretary"]): ResolvedOperator {
  return {
    authUserId: "11111111-1111-4111-8111-111111111111",
    personId: "22222222-2222-4222-8222-222222222222",
    displayName: "Rowan Ashdown",
    roleCodes,
    isActive: true,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the tiers themselves", () => {
  it("names exactly the three D2 and D3 approved", () => {
    expect(EVENT_READ_TIERS).toEqual(["public", "club_link", "operator"]);
  });

  it("shares one vocabulary with the participation table's tier", () => {
    // The assertion that matters is the type-level one above, which `tsc`
    // checks. This runtime line exists so the constant is used and so the
    // property has a name a reader searching for "tier vocabulary" will find.
    expect(tiersAreOneVocabulary).toBe(true);
    expect(EVENT_READ_TIERS.filter((tier) => tier !== "public")).toEqual(["club_link", "operator"]);
  });

  it("gives the public tier the event record and nothing else", () => {
    // Brian, 20 August 2026: "There are going to be private details per event,
    // like RSVP attendance and things of that nature, that shouldn't be on the
    // public calendar."
    expect(tierSees("public", "event_record")).toBe(true);
    expect(tierSees("public", "participation")).toBe(false);
    expect(tierSees("public", "delivery")).toBe(false);
  });

  it("never gives the public tier an online event's joining URL", () => {
    // `REQ-no-joining-url`. Chalk is on Teams (D20), and a publicly readable
    // joining link is an open door into a club meeting.
    expect(tierSees("public", "joining_url")).toBe(false);
  });

  it("adds participation at the club link, and delivery only at the operator", () => {
    // D65: delivery is the only operator-locked element. A coach holds no
    // operator account, so without the middle tier they cannot see who is
    // coming to their own session.
    expect(tierSees("club_link", "participation")).toBe(true);
    expect(tierSees("club_link", "delivery")).toBe(false);
    expect(tierSees("operator", "delivery")).toBe(true);
  });

  it("never narrows as the tier widens", () => {
    // Whatever a lower tier may see, every higher one may see too. Written as a
    // property rather than as three more rows, because the failure it guards
    // against is a later element added to one row and forgotten in another.
    const elements: EventElement[] = ["event_record", "joining_url", "participation", "delivery"];
    for (const element of elements) {
      for (let index = 1; index < EVENT_READ_TIERS.length; index += 1) {
        const lower = EVENT_READ_TIERS[index - 1];
        const higher = EVENT_READ_TIERS[index];
        if (tierSees(lower, element)) {
          expect(tierSees(higher, element), `${higher} lost ${element}`).toBe(true);
        }
      }
    }
  });
});

describe("assertEventOperatorTier", () => {
  it("returns the operator it was given", () => {
    const actor = operator();
    expect(assertEventOperatorTier(actor)).toBe(actor);
  });

  it("refuses nobody at all, with a NotPermitted and a rule", () => {
    // Never `null`, never `false`, never a bare `Error`: a guard that returned a
    // falsy value would be ignorable by a caller that forgot to check it.
    expect(() => assertEventOperatorTier(null)).toThrow(NotPermitted);
    try {
      assertEventOperatorTier(null);
      expect.unreachable("the guard did not refuse");
    } catch (error) {
      expect((error as NotPermitted).rule).toBe(EVENT_OPERATOR_TIER_RULE);
      expect((error as NotPermitted).message).toBe(EVENT_OPERATOR_TIER_MESSAGE);
    }
  });

  it("says what is required, and never what the reader holds", () => {
    // Listing the roles somebody does hold tells an attacker who has taken the
    // session what the account is worth; naming who holds the missing one
    // exposes the committee's composition.
    expect(EVENT_OPERATOR_TIER_MESSAGE).toContain("active Lancers operator profile");
    expect(EVENT_OPERATOR_TIER_MESSAGE).not.toMatch(/president|secretary|treasurer|coach/i);
    // And it points at the surface that is open, because the reader may simply
    // have wanted the calendar.
    expect(EVENT_OPERATOR_TIER_MESSAGE).toContain("readable without one");
  });

  it("admits an operator holding no role at all", () => {
    // The floor is a linked, active operator and says nothing about roles —
    // exactly the floor `/operate/events` has stood on since LAN-76. Nothing in
    // this package widens or narrows it.
    expect(() => assertEventOperatorTier(operator([]))).not.toThrow();
  });

  it("admits a coaching assignment, whose narrowing is the screen's", () => {
    // LAN-110 put what a coach may see in `coach-event-buckets.ts`, and this
    // guard is not the place to re-decide it.
    expect(() => assertEventOperatorTier(operator(["head_coach"]))).not.toThrow();
  });
});

describe("requireEventOperatorTier", () => {
  it("resolves the actor from the session rather than from an argument", async () => {
    // A guard that accepted "who am I" as a parameter would accept whatever the
    // browser sent.
    vi.mocked(resolveOperatorAccess).mockResolvedValue({ state: "active", operator: operator() });

    await expect(requireEventOperatorTier()).resolves.toMatchObject({ roleCodes: ["secretary"] });
    expect(requireEventOperatorTier.length).toBe(0);
  });

  it("refuses every state that is not an active operator", async () => {
    // The three unresolved causes, exactly as `resolveOperatorAccess` names
    // them: no session at all, a mailbox with no operator profile, and a
    // profile that has been deactivated.
    for (const access of UNRESOLVED) {
      vi.mocked(resolveOperatorAccess).mockResolvedValue(access);
      await expect(requireEventOperatorTier()).rejects.toThrow(NotPermitted);
    }
  });
});

describe("resolveEventReadTier", () => {
  it("reads at the operator tier for a linked, active operator", async () => {
    vi.mocked(resolveOperatorAccess).mockResolvedValue({ state: "active", operator: operator() });
    await expect(resolveEventReadTier()).resolves.toBe("operator");
  });

  it("reads at the public tier for everybody else, including a signed-in stranger", async () => {
    // A mailbox with no operator profile is a stranger as far as the club's
    // events are concerned, and the public calendar is the honest answer for it
    // rather than a refusal.
    for (const access of UNRESOLVED) {
      vi.mocked(resolveOperatorAccess).mockResolvedValue(access);
      await expect(resolveEventReadTier()).resolves.toBe("public");
    }
  });

  it("never resolves the club-link tier yet, because nothing issues a link", async () => {
    // The seam is written down so `WP-participation-club-link` adds a resolver
    // rather than a second vocabulary. Until it does, this must not silently
    // start returning it.
    for (const access of UNRESOLVED) {
      vi.mocked(resolveOperatorAccess).mockResolvedValue(access);
      await expect(resolveEventReadTier()).resolves.not.toBe("club_link");
    }
  });
});
