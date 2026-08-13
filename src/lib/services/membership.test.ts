// @vitest-environment node
/**
 * The membership aggregate against the real local database. LAN-75, matrix
 * rows 1–5 and 7–10, 13.
 *
 * Every assertion reads back through a **second connection**, for the reason
 * `tests/helpers/service-layer.ts` explains: a row is perfectly visible to the
 * transaction that wrote it, so reading it back through the same transaction
 * proves nothing about whether it committed. The atomicity assertions are
 * worthless without that separation.
 *
 * This suite creates its own memberships rather than transitioning seeded ones,
 * because activating a seeded member would change a fixture other suites read.
 * Its people carry a marker unique to this suite and are removed afterwards.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import { closePool, isServiceError, withTransaction } from "@/lib/db";
import { openObserver } from "../../../tests/helpers/service-layer";
import {
  ACTIVATION_NEEDS_OVERRIDE_RULE,
  activateMembership,
  generateOnboardingItems,
  listCurrentSeasonRoster,
  MEMBERSHIP_TRANSITIONS,
  reactivateMembership,
  readMembership,
  resolveOnboardingItem,
  setMembershipInactive,
  type MembershipStatus,
} from "./membership";
import { resolveOpenSeason } from "./roster";

/** This suite's namespace. Never shared — parallel suites share one database. */
const MARKER = "LAN75Membership";

let observer: Client;
let actorPersonId: string;
let openSeasonId: string;
let openSeasonLabel: string;
/** Every configured item type in the open season, as the seed left it. */
let seasonTypes: {
  id: string;
  code: string;
  isRequired: boolean;
  isSubscription: boolean;
}[];

function unique(tag: string): string {
  return `${MARKER}-${tag}-${process.pid}-${counter++}`;
}
let counter = 0;

/**
 * A person and a membership in the open season, in whatever status is asked
 * for, written directly rather than through the service.
 *
 * Direct inserts on purpose: the point of most of these tests is what
 * `activateMembership` does when it *finds* a membership in a given state, and
 * several of those states — `departed`, `withdrawn`, `carried_forward` — have
 * no service path that produces them. Building them through the application
 * would mean building the season-close workflow this slice explicitly excludes.
 */
async function givenMembership(
  status: MembershipStatus,
  options: { generateItems?: boolean } = {},
): Promise<string> {
  const givenName = unique("Person");
  const person = await observer.query<{ id: string }>(
    "insert into public.people (given_name, family_name) values ($1, 'Testcase') returning id",
    [givenName],
  );
  const personId = person.rows[0].id;

  const membership = await observer.query<{ id: string }>(
    // `activated_on` and `departed_on` are filled in for the statuses whose
    // check constraints require them — a `departed` membership with no date is
    // a row the schema refuses, and this fixture has to build states the
    // schema considers legal or it is testing nothing real.
    `insert into public.season_memberships
       (person_id, season_id, status, entry, confirmed_on, activated_on, departed_on)
     values ($1::uuid, $2::uuid, $3::public.membership_status, 'returning', current_date,
             case when $3 in ('active', 'inactive', 'departed') then current_date else null end,
             case when $3 = 'departed' then current_date else null end)
     returning id`,
    [personId, openSeasonId, status],
  );
  const membershipId = membership.rows[0].id;

  await observer.query(
    `insert into public.season_membership_status_events
       (season_membership_id, from_status, to_status, actor_person_id)
     values ($1::uuid, null, 'carried_forward', $2::uuid)`,
    [membershipId, actorPersonId],
  );

  if (options.generateItems !== false) {
    await withTransaction((tx) => generateOnboardingItems(tx, membershipId, openSeasonId));
  }

  return membershipId;
}

/** Sets one item's status directly, to arrange an outstanding/resolved mix. */
async function setItemStatus(membershipId: string, code: string, status: string): Promise<void> {
  await observer.query(
    `update public.onboarding_items i
        set status = $3::public.onboarding_item_status,
            completed_on = case when $3 = 'complete' then current_date else null end,
            waived_reason = case when $3 = 'waived' then 'Arranged by the committee' else null end,
            waived_by_person_id = case when $3 = 'waived' then $4::uuid else null end
       from public.onboarding_item_types t
      where t.id = i.item_type_id
        and i.season_membership_id = $1::uuid
        and t.code = $2`,
    [membershipId, code, status, actorPersonId],
  );
}

/** Resolves every required, non-subscription item, so activation asks nothing. */
async function settleRequiredItems(membershipId: string): Promise<void> {
  await observer.query(
    `update public.onboarding_items i
        set status = 'complete', completed_on = current_date
       from public.onboarding_item_types t
      where t.id = i.item_type_id
        and i.season_membership_id = $1::uuid
        and t.is_required and not t.is_subscription`,
    [membershipId],
  );
}

async function statusEvents(membershipId: string) {
  const result = await observer.query<{
    from_status: string | null;
    to_status: string;
    actor_person_id: string | null;
    reason: string | null;
  }>(
    `select from_status::text as from_status, to_status::text as to_status,
            actor_person_id, reason
       from public.season_membership_status_events
      where season_membership_id = $1::uuid
      order by occurred_at, from_status nulls first`,
    [membershipId],
  );
  return result.rows;
}

async function auditRows(entityId: string) {
  const result = await observer.query<{
    action: string;
    actor_person_id: string | null;
    from_state: string | null;
    to_state: string | null;
    reason: string | null;
    context: Record<string, unknown>;
  }>(
    `select action, actor_person_id, from_state, to_state, reason, context
       from public.audit_events
      where entity_id = $1::uuid
      order by occurred_at`,
    [entityId],
  );
  return result.rows;
}

async function currentStatus(membershipId: string): Promise<string> {
  const result = await observer.query<{ status: string }>(
    "select status::text as status from public.season_memberships where id = $1::uuid",
    [membershipId],
  );
  return result.rows[0].status;
}

beforeAll(async () => {
  observer = await openObserver();

  const season = await withTransaction((tx) => resolveOpenSeason(tx));
  openSeasonId = season.id;
  openSeasonLabel = season.label;

  const actor = await observer.query<{ id: string }>(
    "select id from public.people where merged_into_person_id is null order by created_at, id limit 1",
  );
  actorPersonId = actor.rows[0].id;

  const types = await observer.query<{
    id: string;
    code: string;
    is_required: boolean;
    is_subscription: boolean;
  }>(
    `select id, code, is_required, is_subscription
       from public.onboarding_item_types where season_id = $1::uuid order by sort_order`,
    [openSeasonId],
  );
  seasonTypes = types.rows.map((row) => ({
    id: row.id,
    code: row.code,
    isRequired: row.is_required,
    isSubscription: row.is_subscription,
  }));

  // The suite is only meaningful against a season that actually configures
  // onboarding, and against one that has a subscription item — register D10 is
  // half of what this file exists to prove.
  expect(seasonTypes.length, "the open season configures no onboarding items").toBeGreaterThan(0);
  expect(
    seasonTypes.some((type) => type.isSubscription),
    "the open season has no subscription item, so D10 cannot be exercised",
  ).toBe(true);
  expect(
    seasonTypes.some((type) => type.isRequired && !type.isSubscription),
    "the open season has no required non-subscription item",
  ).toBe(true);
});

async function cleanUp(): Promise<void> {
  await observer.query(
    `delete from public.audit_events
      where entity_id in (
        select i.id from public.onboarding_items i
        join public.season_memberships m on m.id = i.season_membership_id
        join public.people p on p.id = m.person_id
       where p.given_name like $1)`,
    [`${MARKER}%`],
  );
  await observer.query(
    `delete from public.audit_events
      where entity_id in (
        select m.id from public.season_memberships m
        join public.people p on p.id = m.person_id
       where p.given_name like $1)`,
    [`${MARKER}%`],
  );
  await observer.query(
    `delete from public.onboarding_items
      where season_membership_id in (
        select m.id from public.season_memberships m
        join public.people p on p.id = m.person_id
       where p.given_name like $1)`,
    [`${MARKER}%`],
  );
  await observer.query(
    `delete from public.season_membership_status_events
      where season_membership_id in (
        select m.id from public.season_memberships m
        join public.people p on p.id = m.person_id
       where p.given_name like $1)`,
    [`${MARKER}%`],
  );
  await observer.query(
    `delete from public.season_memberships
      where person_id in (select id from public.people where given_name like $1)`,
    [`${MARKER}%`],
  );
  await observer.query("delete from public.people where given_name like $1", [`${MARKER}%`]);
}

afterEach(cleanUp);

afterAll(async () => {
  await cleanUp();
  await observer.end();
  await closePool();
});

// ---------------------------------------------------------------------------
// Row 1 and 2 — generation, and generating twice
// ---------------------------------------------------------------------------

describe("generateOnboardingItems", () => {
  it("creates exactly the season's configured types, all pending", async () => {
    const membershipId = await givenMembership("confirmed", { generateItems: false });

    const created = await withTransaction((tx) =>
      generateOnboardingItems(tx, membershipId, openSeasonId),
    );

    expect(created).toBe(seasonTypes.length);

    const membership = await readMembership(membershipId);
    expect(membership.onboardingItems).toHaveLength(seasonTypes.length);
    expect(membership.onboardingItems.map((item) => item.code).sort()).toEqual(
      seasonTypes.map((type) => type.code).sort(),
    );
    expect(membership.onboardingItems.every((item) => item.status === "pending")).toBe(true);
  });

  it("is idempotent — a second call writes nothing and is not an error", async () => {
    const membershipId = await givenMembership("confirmed");

    const again = await withTransaction((tx) =>
      generateOnboardingItems(tx, membershipId, openSeasonId),
    );

    expect(again).toBe(0);
    const membership = await readMembership(membershipId);
    expect(membership.onboardingItems).toHaveLength(seasonTypes.length);
  });

  it("does not reset an item somebody has already resolved", async () => {
    const membershipId = await givenMembership("confirmed");
    const required = seasonTypes.find((type) => type.isRequired && !type.isSubscription)!;
    await setItemStatus(membershipId, required.code, "complete");

    await withTransaction((tx) => generateOnboardingItems(tx, membershipId, openSeasonId));

    const membership = await readMembership(membershipId);
    expect(membership.onboardingItems.find((item) => item.code === required.code)?.status).toBe(
      "complete",
    );
  });
});

// ---------------------------------------------------------------------------
// Rows 3, 4, 7 and 8 — activation
// ---------------------------------------------------------------------------

describe("activateMembership — the legal path", () => {
  it("activates from `onboarding` with one transition, and dates it", async () => {
    const membershipId = await givenMembership("onboarding");
    await settleRequiredItems(membershipId);

    const outcome = await activateMembership({ actorPersonId, membershipId });

    expect(outcome.membership.status).toBe("active");
    expect(outcome.startedOnboarding).toBe(false);
    expect(await currentStatus(membershipId)).toBe("active");

    const events = await statusEvents(membershipId);
    expect(events.map((event) => [event.from_status, event.to_status])).toEqual([
      [null, "carried_forward"],
      ["onboarding", "active"],
    ]);
    expect(events.at(-1)?.actor_person_id).toBe(actorPersonId);

    const activated = await observer.query<{ activated_on: Date | null }>(
      "select activated_on from public.season_memberships where id = $1::uuid",
      [membershipId],
    );
    expect(activated.rows[0].activated_on).not.toBeNull();
  });

  it("activates from `confirmed` by writing the system's onboarding step too", async () => {
    const membershipId = await givenMembership("confirmed");
    await settleRequiredItems(membershipId);

    const outcome = await activateMembership({ actorPersonId, membershipId });

    expect(outcome.startedOnboarding).toBe(true);
    expect(await currentStatus(membershipId)).toBe("active");

    // §2.1's machine, with no state skipped.
    const events = await statusEvents(membershipId);
    expect(events.map((event) => [event.from_status, event.to_status])).toEqual([
      [null, "carried_forward"],
      ["confirmed", "onboarding"],
      ["onboarding", "active"],
    ]);
    expect(events[1].reason).toContain("Onboarding started by the system");
  });

  it("writes a status event and an audit row naming the operator, together", async () => {
    const membershipId = await givenMembership("onboarding");
    await settleRequiredItems(membershipId);

    await activateMembership({ actorPersonId, membershipId });

    const audit = await auditRows(membershipId);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "season_membership_activated",
      actor_person_id: actorPersonId,
      from_state: "onboarding",
      to_state: "active",
    });
    expect(audit[0].context).toMatchObject({
      issue: "LAN-75",
      transitions_recorded_in: "season_membership_status_events",
    });
    expect(await statusEvents(membershipId)).toHaveLength(2);
  });

  it("generates missing items on the way through, for a membership confirmed earlier", async () => {
    const membershipId = await givenMembership("confirmed", { generateItems: false });

    // No items at all, so nothing is outstanding and nothing is asked.
    await activateMembership({ actorPersonId, membershipId, overrideReason: "Backfilled" });

    const membership = await readMembership(membershipId);
    expect(membership.status).toBe("active");
    expect(membership.onboardingItems).toHaveLength(seasonTypes.length);
  });
});

describe("activateMembership — outstanding required items", () => {
  it("refuses once, naming the items, when no reason to proceed was given", async () => {
    const membershipId = await givenMembership("onboarding");
    const required = seasonTypes.find((type) => type.isRequired && !type.isSubscription)!;
    await settleRequiredItems(membershipId);
    await setItemStatus(membershipId, required.code, "pending");

    const failure = await activateMembership({ actorPersonId, membershipId }).catch(
      (error: unknown) => error,
    );

    expect(isServiceError(failure) && failure.rule).toBe(ACTIVATION_NEEDS_OVERRIDE_RULE);
    expect(await currentStatus(membershipId)).toBe("onboarding");
    // Refused, not half-done: no transition and no audit row.
    expect(await statusEvents(membershipId)).toHaveLength(1);
    expect(await auditRows(membershipId)).toHaveLength(0);
  });

  it("proceeds when the operator gives a reason, and records what was outstanding", async () => {
    const membershipId = await givenMembership("onboarding");
    const required = seasonTypes.find((type) => type.isRequired && !type.isSubscription)!;
    await settleRequiredItems(membershipId);
    await setItemStatus(membershipId, required.code, "pending");

    const outcome = await activateMembership({
      actorPersonId,
      membershipId,
      overrideReason: "Returning player; details being reconciled",
    });

    expect(outcome.membership.status).toBe("active");
    expect(outcome.proceededOver.map((item) => item.code)).toEqual([required.code]);

    const audit = await auditRows(membershipId);
    expect(audit[0].reason).toContain("Returning player; details being reconciled");
    expect(audit[0].context).toMatchObject({
      proceeded_over_outstanding: [required.code],
      override_reason: "Returning player; details being reconciled",
    });

    // And the status history carries it too, not only the audit stream.
    const events = await statusEvents(membershipId);
    expect(events.at(-1)?.reason).toContain("Returning player; details being reconciled");
  });

  it("counts a waived required item as met — 'or consciously waived'", async () => {
    const membershipId = await givenMembership("onboarding");
    const required = seasonTypes.find((type) => type.isRequired && !type.isSubscription)!;
    await settleRequiredItems(membershipId);
    await setItemStatus(membershipId, required.code, "waived");

    const outcome = await activateMembership({ actorPersonId, membershipId });

    expect(outcome.membership.status).toBe("active");
    expect(outcome.proceededOver).toHaveLength(0);
  });

  /**
   * Register D10, and the frozen model's own emphasis. This is the assertion
   * that would fail if somebody ever "tidied up" the subscription exclusion.
   */
  it("never blocks on an unpaid subscription, however required it is marked", async () => {
    const membershipId = await givenMembership("onboarding");
    const subscription = seasonTypes.find((type) => type.isSubscription)!;
    await settleRequiredItems(membershipId);
    await setItemStatus(membershipId, subscription.code, "pending");

    // Marked required as well as unpaid — the worst case for the rule.
    await observer.query(
      "update public.onboarding_item_types set is_required = true where id = $1::uuid",
      [subscription.id],
    );

    try {
      const membership = await readMembership(membershipId);
      expect(membership.outstandingRequired).toHaveLength(0);

      // No override reason, and it still goes through.
      const outcome = await activateMembership({ actorPersonId, membershipId });
      expect(outcome.membership.status).toBe("active");
      expect(outcome.proceededOver).toHaveLength(0);
    } finally {
      await observer.query(
        "update public.onboarding_item_types set is_required = $2 where id = $1::uuid",
        [subscription.id, subscription.isRequired],
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Row 5 — the illegal transitions
// ---------------------------------------------------------------------------

describe("activateMembership — states it is not legal from", () => {
  const illegal: MembershipStatus[] = [
    "carried_forward",
    "active",
    "departed",
    "withdrawn",
    "archived",
  ];

  for (const status of illegal) {
    it(`refuses a \`${status}\` membership, naming the state it is in`, async () => {
      const membershipId = await givenMembership(status);

      const failure = await activateMembership({
        actorPersonId,
        membershipId,
        overrideReason: "trying anyway",
      }).catch((error: unknown) => error);

      expect(isServiceError(failure)).toBe(true);
      expect(isServiceError(failure) && failure.kind).toBe("invalid_transition");
      // The acceptance criterion: the message names the current state.
      expect(isServiceError(failure) && failure.message).toContain("This membership is");
      expect(await currentStatus(membershipId)).toBe(status);
      expect(await auditRows(membershipId)).toHaveLength(0);
    });
  }

  it("refuses a membership that does not exist", async () => {
    const failure = await activateMembership({
      actorPersonId,
      membershipId: "00000000-0000-4000-8000-000000000000",
    }).catch((error: unknown) => error);

    expect(isServiceError(failure) && failure.kind).toBe("not_found");
  });

  it("refuses an activation that names no operator, before touching the database", async () => {
    const membershipId = await givenMembership("onboarding");

    const failure = await activateMembership({ actorPersonId: "  ", membershipId }).catch(
      (error: unknown) => error,
    );

    expect(isServiceError(failure) && failure.rule).toBe("audit_events_has_an_actor");
    expect(await currentStatus(membershipId)).toBe("onboarding");
  });
});

// ---------------------------------------------------------------------------
// Row 9 — active ⇄ inactive, register D1
// ---------------------------------------------------------------------------

describe("active ⇄ inactive", () => {
  it("records the stint's end with a reason, in both streams", async () => {
    const membershipId = await givenMembership("active");

    const membership = await setMembershipInactive({
      actorPersonId,
      membershipId,
      reason: "Stepped away for term",
    });

    expect(membership.status).toBe("inactive");
    expect(membership.inactivityLabel).toBe("Stepped away for term");
    expect((await statusEvents(membershipId)).at(-1)).toMatchObject({
      from_status: "active",
      to_status: "inactive",
      reason: "Stepped away for term",
    });
    expect((await auditRows(membershipId))[0]).toMatchObject({
      action: "season_membership_made_inactive",
      actor_person_id: actorPersonId,
      from_state: "active",
      to_state: "inactive",
    });
  });

  it("refuses to go inactive without a reason", async () => {
    const membershipId = await givenMembership("active");

    const failure = await setMembershipInactive({
      actorPersonId,
      membershipId,
      reason: "   ",
    }).catch((error: unknown) => error);

    expect(isServiceError(failure) && failure.rule).toBe("membership_inactivity_reason_required");
    expect(await currentStatus(membershipId)).toBe("active");
  });

  it("brings an inactive membership back, clearing the label", async () => {
    const membershipId = await givenMembership("inactive");
    await observer.query(
      "update public.season_memberships set inactivity_label = 'Away' where id = $1::uuid",
      [membershipId],
    );

    const membership = await reactivateMembership({
      actorPersonId,
      membershipId,
      reason: "Back after Christmas",
    });

    expect(membership.status).toBe("active");
    expect(membership.inactivityLabel).toBeNull();
    expect((await statusEvents(membershipId)).at(-1)).toMatchObject({
      from_status: "inactive",
      to_status: "active",
      reason: "Back after Christmas",
    });
  });

  it("is one membership carrying the gap, not two records", async () => {
    // Register D1's stated case, end to end.
    const membershipId = await givenMembership("active");
    await setMembershipInactive({ actorPersonId, membershipId, reason: "Quit in November" });
    await reactivateMembership({ actorPersonId, membershipId, reason: "Back in February" });

    const memberships = await observer.query<{ count: string }>(
      `select count(*)::text as count from public.season_memberships
        where person_id = (select person_id from public.season_memberships where id = $1::uuid)
          and season_id = $2::uuid`,
      [membershipId, openSeasonId],
    );
    expect(memberships.rows[0].count).toBe("1");
    expect(await statusEvents(membershipId)).toHaveLength(3);
  });

  const notInactivatable: MembershipStatus[] = ["confirmed", "onboarding", "departed"];
  for (const status of notInactivatable) {
    it(`refuses to make a \`${status}\` membership inactive`, async () => {
      const membershipId = await givenMembership(status);

      const failure = await setMembershipInactive({
        actorPersonId,
        membershipId,
        reason: "no",
      }).catch((error: unknown) => error);

      expect(isServiceError(failure) && failure.kind).toBe("invalid_transition");
      expect(await currentStatus(membershipId)).toBe(status);
    });
  }

  it("refuses to reactivate a membership that is not inactive", async () => {
    const membershipId = await givenMembership("active");

    const failure = await reactivateMembership({ actorPersonId, membershipId }).catch(
      (error: unknown) => error,
    );

    expect(isServiceError(failure) && failure.kind).toBe("invalid_transition");
  });
});

// ---------------------------------------------------------------------------
// Row 10 — resolving one onboarding item
// ---------------------------------------------------------------------------

describe("resolveOnboardingItem", () => {
  async function firstItem(membershipId: string) {
    const membership = await readMembership(membershipId);
    return membership.onboardingItems[0];
  }

  it("marks an item complete and dates it", async () => {
    const membershipId = await givenMembership("confirmed");
    const item = await firstItem(membershipId);

    const membership = await resolveOnboardingItem({
      actorPersonId,
      membershipId,
      itemId: item.id,
      status: "complete",
    });

    const updated = membership.onboardingItems.find((each) => each.id === item.id)!;
    expect(updated.status).toBe("complete");
    expect(updated.completedOn).not.toBeNull();
    expect((await auditRows(item.id))[0]).toMatchObject({
      action: "onboarding_item_resolved",
      actor_person_id: actorPersonId,
      from_state: "pending",
      to_state: "complete",
    });
  });

  it("records a waiver with its reason and its author", async () => {
    const membershipId = await givenMembership("confirmed");
    const item = await firstItem(membershipId);

    const membership = await resolveOnboardingItem({
      actorPersonId,
      membershipId,
      itemId: item.id,
      status: "waived",
      reason: "Hardship waiver agreed by the committee",
    });

    const updated = membership.onboardingItems.find((each) => each.id === item.id)!;
    expect(updated.status).toBe("waived");
    expect(updated.waivedReason).toBe("Hardship waiver agreed by the committee");
    expect(updated.waivedByName).not.toBeNull();
  });

  it("refuses a waiver with no reason, before the database has to", async () => {
    const membershipId = await givenMembership("confirmed");
    const item = await firstItem(membershipId);

    const failure = await resolveOnboardingItem({
      actorPersonId,
      membershipId,
      itemId: item.id,
      status: "waived",
      reason: "  ",
    }).catch((error: unknown) => error);

    expect(isServiceError(failure) && failure.rule).toBe("onboarding_items_waiver_is_justified");
  });

  it("clears the completion when an item becomes not applicable", async () => {
    const membershipId = await givenMembership("confirmed");
    const item = await firstItem(membershipId);
    await resolveOnboardingItem({
      actorPersonId,
      membershipId,
      itemId: item.id,
      status: "complete",
    });

    const membership = await resolveOnboardingItem({
      actorPersonId,
      membershipId,
      itemId: item.id,
      status: "not_applicable",
    });

    const updated = membership.onboardingItems.find((each) => each.id === item.id)!;
    expect(updated.status).toBe("not_applicable");
    expect(updated.completedOn).toBeNull();
  });

  it("refuses a status this screen does not offer", async () => {
    const membershipId = await givenMembership("confirmed");
    const item = await firstItem(membershipId);

    const failure = await resolveOnboardingItem({
      actorPersonId,
      membershipId,
      itemId: item.id,
      // A crafted request naming a process state rather than a decision.
      status: "invited" as never,
    }).catch((error: unknown) => error);

    expect(isServiceError(failure) && failure.rule).toBe("onboarding_item_resolution_not_offered");
  });

  /**
   * The item id arrives from a form. Resolving it by id alone would let a
   * crafted request move an item belonging to somebody else's membership.
   */
  it("refuses an item that belongs to a different membership", async () => {
    const mine = await givenMembership("confirmed");
    const theirs = await givenMembership("confirmed");
    const theirItem = await firstItem(theirs);

    const failure = await resolveOnboardingItem({
      actorPersonId,
      membershipId: mine,
      itemId: theirItem.id,
      status: "complete",
    }).catch((error: unknown) => error);

    expect(isServiceError(failure) && failure.kind).toBe("not_found");

    const untouched = await readMembership(theirs);
    expect(untouched.onboardingItems.find((each) => each.id === theirItem.id)?.status).toBe(
      "pending",
    );
  });
});

// ---------------------------------------------------------------------------
// Row 11 — the roster read model
// ---------------------------------------------------------------------------

describe("listCurrentSeasonRoster", () => {
  it("reads the seeded season, and counts it before any filter", async () => {
    const roster = await listCurrentSeasonRoster();

    expect(roster.season.label).toBe(openSeasonLabel);
    expect(roster.totalInSeason).toBeGreaterThan(0);
    expect(roster.entries.length).toBe(roster.totalInSeason);
    expect(roster.entries.every((entry) => entry.displayName.trim() !== "")).toBe(true);
  });

  it("filters by status without changing the season total", async () => {
    const all = await listCurrentSeasonRoster();
    const active = await listCurrentSeasonRoster({ status: "active" });

    expect(active.entries.every((entry) => entry.status === "active")).toBe(true);
    expect(active.entries.length).toBeLessThan(all.entries.length);
    // What tells UX-23's filter-empty apart from a season with nobody in it.
    expect(active.totalInSeason).toBe(all.totalInSeason);
  });

  it("finds a person by name and by a contact value", async () => {
    const roster = await listCurrentSeasonRoster();
    const withEmail = roster.entries.find((entry) => entry.email !== null)!;

    const byName = await listCurrentSeasonRoster({ search: withEmail.givenName });
    expect(byName.entries.some((entry) => entry.membershipId === withEmail.membershipId)).toBe(
      true,
    );

    const byEmail = await listCurrentSeasonRoster({ search: withEmail.email! });
    expect(byEmail.entries.some((entry) => entry.membershipId === withEmail.membershipId)).toBe(
      true,
    );
  });

  it("returns an empty list, and a non-zero total, for a filter nothing matches", async () => {
    const roster = await listCurrentSeasonRoster({ search: "no-such-person-anywhere-xyzzy" });

    expect(roster.entries).toHaveLength(0);
    expect(roster.totalInSeason).toBeGreaterThan(0);
  });

  it("treats LIKE metacharacters as characters, not syntax", async () => {
    const roster = await listCurrentSeasonRoster({ search: "%" });

    // A bare `%` would match everybody if it reached LIKE unescaped.
    expect(roster.entries).toHaveLength(0);
  });

  it("counts onboarding the way the column reports it", async () => {
    const membershipId = await givenMembership("confirmed");
    await settleRequiredItems(membershipId);

    const roster = await listCurrentSeasonRoster({ search: MARKER });
    const entry = roster.entries.find((each) => each.membershipId === membershipId)!;

    expect(entry.itemsTotal).toBe(seasonTypes.length);
    expect(entry.requiredOutstanding).toBe(0);
    expect(entry.itemsResolved).toBeGreaterThan(0);
  });

  it("falls back to the default sort for a column that is not on the whitelist", async () => {
    const injected = await listCurrentSeasonRoster({ sort: "p.given_name; drop table people" });
    const byName = await listCurrentSeasonRoster({ sort: "name" });

    expect(injected.entries.map((entry) => entry.membershipId)).toEqual(
      byName.entries.map((entry) => entry.membershipId),
    );
  });
});

// ---------------------------------------------------------------------------
// The transition table itself
// ---------------------------------------------------------------------------

describe("the transition table", () => {
  it("names only transitions the frozen model gives this slice", async () => {
    expect(
      MEMBERSHIP_TRANSITIONS.map((transition) => `${transition.from}→${transition.to}`),
    ).toEqual(["confirmed→onboarding", "onboarding→active", "active→inactive", "inactive→active"]);
  });

  it("attributes `confirmed → onboarding` to the system and the rest to the operator", async () => {
    const system = MEMBERSHIP_TRANSITIONS.filter((transition) => transition.system);
    expect(system.map((transition) => `${transition.from}→${transition.to}`)).toEqual([
      "confirmed→onboarding",
    ]);
  });

  it("contains no departure, withdrawal or archival — those are outside the slice", async () => {
    const terminal = ["withdrawn", "departed", "archived"];
    expect(MEMBERSHIP_TRANSITIONS.some((transition) => terminal.includes(transition.to))).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// Row 13 — nothing half-written
// ---------------------------------------------------------------------------

describe("atomicity", () => {
  it("leaves no transition, no audit row and no status change when activation is refused", async () => {
    const membershipId = await givenMembership("carried_forward");

    await activateMembership({ actorPersonId, membershipId }).catch(() => null);

    expect(await currentStatus(membershipId)).toBe("carried_forward");
    expect(await statusEvents(membershipId)).toHaveLength(1);
    expect(await auditRows(membershipId)).toHaveLength(0);
  });

  it("is undone by a caller's own transaction rolling back", async () => {
    const membershipId = await givenMembership("onboarding");
    await settleRequiredItems(membershipId);

    await expect(
      withTransaction(async () => {
        await activateMembership({ actorPersonId, membershipId });
        throw new Error("the caller failed after the activation succeeded");
      }),
    ).rejects.toThrow("the caller failed after the activation succeeded");

    // Read from outside: the nested activation joined the caller's transaction,
    // so the rollback took it too.
    expect(await currentStatus(membershipId)).toBe("onboarding");
    expect(await statusEvents(membershipId)).toHaveLength(1);
  });
});
