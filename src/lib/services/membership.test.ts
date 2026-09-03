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
import { openObserver, seededActorPersonId } from "../../../tests/helpers/service-layer";
import {
  claimOnboardingItem,
  generateOnboardingItems,
  listCurrentSeasonRoster,
  readMembership,
  resolveOnboardingItem,
  setMembershipStatus,
  type MembershipStatus,
} from "./membership";
import { readOnboardingItemHistoryIn } from "./onboarding-item-history";
import { enterReturningPlayer, resolveOpenSeason } from "./roster";

/** This suite's namespace. Never shared — parallel suites share one database. */
const MARKER = "LAN75Membership";

/**
 * The seed stamps every person it creates with one fixed `created_at`, and this
 * suite draws its actor only from that cohort.
 *
 * `select id from public.people limit 1` returned an arbitrary row, and "the
 * oldest person" returned somebody else's fixture — the seed's people are dated
 * in the *future*, so a suite creating one at `now()` sorts ahead of them. Both
 * forms can adopt another suite's person as this one's actor, at which point
 * that suite's cleanup is refused by `on delete restrict` and a foreign-key
 * error surfaces in a test with no connection to the cause.
 *
 * This is a latent hazard rather than the intermittency actually observed on
 * 13 August 2026 — that one was `countDraftedAudits`, and is fixed where it
 * lives. Anchoring here closes the hazard before it is somebody's afternoon.
 * The seeded cohort is the only population no suite ever deletes, and
 * `seededActorPersonId` in the shared helper is how this file reaches it.
 */

let observer: Client;
let actorPersonId: string;
let openSeasonId: string;
let openSeasonLabel: string;
/**
 * A season this suite owns outright, private to `claimOnboardingItem`'s
 * trust-class tests — never the shared open season. A new item *type*
 * belongs to a season's whole catalogue, not one membership, so creating one
 * against `openSeasonId` would grow `onboarding_item_types` for every other
 * membership that season and desynchronise `seasonTypes` (captured once,
 * above) from what the database actually holds for the rest of this file's
 * tests. A private season side-steps that instead of racing this suite's own
 * cleanup against its own later tests.
 */
let trustSeasonId: string;
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
 * `setMembershipStatus` does when it *finds* a membership in a given state, and
 * several of those states — `departed`, `archived` — have no other service path
 * that produces them (there is no season-close workflow; this slice excludes
 * it). Building them any other way would mean building that workflow.
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
     values ($1::uuid, null, 'onboarding', $2::uuid)`,
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

  actorPersonId = await seededActorPersonId(observer);

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

  const vocabulary = await observer.query<{ id: string }>(
    "select id from public.position_vocabularies order by adopted_on desc limit 1",
  );
  // `archived`, not `open` — `resolveOpenSeason()` (below, `enterReturningPlayer`'s
  // own path) refuses outright when more than one season carries `status = 'open'`,
  // and `readCurrentSeasonIn` only ever considers `open`/`active`/`closing`
  // (`OPERATING_SEASON_STATUSES`). This season exists only as somewhere for a
  // `season_memberships` row to point at; it must never be a candidate for
  // "the" current season.
  const trustSeason = await observer.query<{ id: string }>(
    `insert into public.seasons
       (label, status, position_vocabulary_id, starts_on, ends_on,
        opened_at, opened_by_person_id, closed_at, closed_by_person_id)
     values ($1, 'archived', $2, '2018-09-01', '2019-06-01', now(), $3, now(), $3)
     returning id`,
    [`${MARKER} trust season`, vocabulary.rows[0].id, actorPersonId],
  );
  trustSeasonId = trustSeason.rows[0].id;
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
  // `onboarding_item_history` is `on delete restrict` against
  // `onboarding_items` (LAN-214) — its own rows have to go first, or this
  // suite's items cannot be deleted at all.
  await observer.query(
    `delete from public.onboarding_item_history
      where season_membership_id in (
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
  // `claimOnboardingItem`'s own trust-class item types, on this suite's
  // private `trustSeasonId` — never the shared open season, so this can
  // never grow `openSeasonId`'s catalogue or move `seasonTypes` (captured
  // once, above) out of step with what the database actually holds.
  await observer.query(`delete from public.onboarding_item_types where season_id = $1`, [
    trustSeasonId,
  ]);
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
  await observer.query("delete from public.seasons where id = $1::uuid", [trustSeasonId]);
  await observer.end();
  await closePool();
});

// ---------------------------------------------------------------------------
// Row 1 and 2 — generation, and generating twice
// ---------------------------------------------------------------------------

describe("generateOnboardingItems", () => {
  it("creates exactly the season's configured types, all pending", async () => {
    const membershipId = await givenMembership("onboarding", { generateItems: false });

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

  /**
   * Acceptance criterion 1, on the path that actually produces a confirmed
   * membership in this application.
   *
   * The three tests around this one call `generateOnboardingItems` themselves,
   * so all of them stayed green when independent review deleted the call from
   * `enterReturningPlayer` — the entire wiring of "confirming a membership
   * generates its onboarding items" was one unprotected line. This is the test
   * that fails when it goes.
   */
  it("is what confirming a returner does, not just a function this suite calls", async () => {
    const givenName = `${MARKER}Intake${counter++}`;
    const result = await enterReturningPlayer({
      actorPersonId,
      input: { givenName, familyName: "Testcase", email: "intake@example.invalid" },
      decision: { kind: "new", confirmed: true },
    });

    const membership = await readMembership(result.membershipId);

    expect(membership.status).toBe("onboarding");
    expect(membership.onboardingItems.map((item) => item.code).sort()).toEqual(
      seasonTypes.map((type) => type.code).sort(),
    );
    expect(membership.onboardingItems.every((item) => item.status === "pending")).toBe(true);
  });

  it("generates them inside the intake transaction, so a failed intake leaves none", async () => {
    const givenName = `${MARKER}Rollback${counter++}`;

    await expect(
      withTransaction(async () => {
        await enterReturningPlayer({
          actorPersonId,
          input: { givenName, familyName: "Testcase" },
          decision: { kind: "new", confirmed: true },
        });
        throw new Error("the caller failed after the intake succeeded");
      }),
    ).rejects.toThrow("the caller failed after the intake succeeded");

    // Read from outside: no membership, and therefore no orphan items.
    const orphans = await observer.query(
      `select 1 from public.onboarding_items i
         join public.season_memberships m on m.id = i.season_membership_id
         join public.people p on p.id = m.person_id
        where p.given_name = $1`,
      [givenName],
    );
    expect(orphans.rowCount).toBe(0);
  });

  it("is idempotent — a second call writes nothing and is not an error", async () => {
    const membershipId = await givenMembership("onboarding");

    const again = await withTransaction((tx) =>
      generateOnboardingItems(tx, membershipId, openSeasonId),
    );

    expect(again).toBe(0);
    const membership = await readMembership(membershipId);
    expect(membership.onboardingItems).toHaveLength(seasonTypes.length);
  });

  it("does not reset an item somebody has already resolved", async () => {
    const membershipId = await givenMembership("onboarding");
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
// The free ladder — LAN-186's owner walkthrough, Q-12
// ---------------------------------------------------------------------------

describe("setMembershipStatus — activating (onboarding → active)", () => {
  it("moves from `onboarding` to `active` with one transition, and dates it", async () => {
    const membershipId = await givenMembership("onboarding");
    await settleRequiredItems(membershipId);

    const membership = await setMembershipStatus({ actorPersonId, membershipId, status: "active" });

    expect(membership.status).toBe("active");
    expect(await currentStatus(membershipId)).toBe("active");

    const events = await statusEvents(membershipId);
    expect(events.map((event) => [event.from_status, event.to_status])).toEqual([
      [null, "onboarding"],
      ["onboarding", "active"],
    ]);
    expect(events.at(-1)?.actor_person_id).toBe(actorPersonId);

    const activated = await observer.query<{ activated_on: Date | null }>(
      "select activated_on from public.season_memberships where id = $1::uuid",
      [membershipId],
    );
    expect(activated.rows[0].activated_on).not.toBeNull();
  });

  /**
   * LAN-182's consequence for this path, asserted rather than assumed.
   *
   * Activation used to write a `confirmed → onboarding` system step first, and
   * both of those states now map onto `onboarding`. Had that step survived the
   * vocabulary change it would write `onboarding → onboarding` — a history
   * recording a change that did not happen, and the exact thing
   * `season_membership_status_events_is_a_change` refuses on a new row. So the
   * whole journey, intake through activation, is two events and no self-loop.
   */
  it("writes no self-transition anywhere between intake and activation", async () => {
    const givenName = `${MARKER}Ladder${counter++}`;
    const intake = await enterReturningPlayer({
      actorPersonId,
      input: { givenName, familyName: "Testcase", email: "ladder@example.invalid" },
      decision: { kind: "new", confirmed: true },
    });
    await settleRequiredItems(intake.membershipId);

    await setMembershipStatus({
      actorPersonId,
      membershipId: intake.membershipId,
      status: "active",
    });

    const events = await statusEvents(intake.membershipId);
    expect(events.map((event) => [event.from_status, event.to_status])).toEqual([
      [null, "onboarding"],
      ["onboarding", "active"],
    ]);
    expect(events.some((event) => event.from_status === event.to_status)).toBe(false);
  });

  it("writes a status event and an audit row naming the operator, together, with no reason", async () => {
    const membershipId = await givenMembership("onboarding");
    await settleRequiredItems(membershipId);

    await setMembershipStatus({ actorPersonId, membershipId, status: "active" });

    const audit = await auditRows(membershipId);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "season_membership_status_changed",
      actor_person_id: actorPersonId,
      from_state: "onboarding",
      to_state: "active",
      reason: null,
    });
    expect(audit[0].context).toMatchObject({
      issue: "LAN-186",
      transitions_recorded_in: "season_membership_status_events",
    });
    const events = await statusEvents(membershipId);
    expect(events).toHaveLength(2);
    expect(events.at(-1)?.reason).toBeNull();
  });

  it("generates missing items on the way through, for a membership confirmed earlier", async () => {
    const membershipId = await givenMembership("onboarding", { generateItems: false });

    await setMembershipStatus({ actorPersonId, membershipId, status: "active" });

    const membership = await readMembership(membershipId);
    expect(membership.status).toBe("active");
    expect(membership.onboardingItems).toHaveLength(seasonTypes.length);
  });

  /**
   * Q-12, verbatim: "We can flip to whatever status we want to go in." An
   * outstanding required item is no longer asked about at all — it simply
   * carries on being outstanding, exactly like any other season fact.
   */
  it("activates straight through outstanding required items, asking nothing and recording no reason", async () => {
    const membershipId = await givenMembership("onboarding");
    const required = seasonTypes.find((type) => type.isRequired && !type.isSubscription)!;
    await settleRequiredItems(membershipId);
    await setItemStatus(membershipId, required.code, "pending");

    const membership = await setMembershipStatus({ actorPersonId, membershipId, status: "active" });

    expect(membership.status).toBe("active");
    expect(membership.outstandingRequired.map((item) => item.code)).toEqual([required.code]);
    const audit = await auditRows(membershipId);
    expect(audit[0]).toMatchObject({ action: "season_membership_status_changed", reason: null });
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

      /**
       * The rule lives twice — `outstandingFrom()` in TypeScript and
       * `GATING_ITEM_PREDICATE` in SQL for the roster's count — and independent
       * review deleted the SQL half with the whole suite staying green, while
       * UX-20's Onboarding column started reading "1 outstanding" for exactly
       * this member. So the two copies are asserted to agree, here, on the same
       * fixture and inside the same mutation window: this is the only test that
       * makes the seeded subscription type required, and doing it twice raced
       * the pilot suite's repeatable-read snapshot.
       */
      const roster = await listCurrentSeasonRoster({ search: MARKER });
      const entry = roster.entries.find((each) => each.membershipId === membershipId)!;
      expect(entry.requiredOutstanding).toBe(0);
      expect(entry.requiredOutstanding).toBe(membership.outstandingRequired.length);
      // The subscription really is unresolved — otherwise this passes vacuously.
      expect(entry.itemsResolved).toBeLessThan(entry.itemsTotal);

      const activated = await setMembershipStatus({
        actorPersonId,
        membershipId,
        status: "active",
      });
      expect(activated.status).toBe("active");
    } finally {
      await observer.query(
        "update public.onboarding_item_types set is_required = $2 where id = $1::uuid",
        [subscription.id, subscription.isRequired],
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Q-11/Q-12 — every status now reaches every other, including `archived`
// ---------------------------------------------------------------------------

describe("setMembershipStatus — the free ladder", () => {
  const every: MembershipStatus[] = ["onboarding", "active", "inactive", "departed", "archived"];

  for (const from of every) {
    for (const to of every) {
      if (from === to) continue;
      it(`moves \`${from}\` straight to \`${to}\`, no transition table in the way`, async () => {
        const membershipId = await givenMembership(from);

        const membership = await setMembershipStatus({ actorPersonId, membershipId, status: to });

        expect(membership.status).toBe(to);
        expect(await currentStatus(membershipId)).toBe(to);
      });
    }
  }

  /**
   * `archived` was unreachable by any built path before this round — Q-11 left
   * it that way, and Q-12 explicitly accepted a free ladder reaching it by
   * construction as a deliberate consequence, not an oversight. Covered above
   * in the full cross-product; called out here by name because it is the one
   * value this suite could previously never produce through the service.
   */
  it("reaches `archived`, previously unreachable by any built path", async () => {
    const membershipId = await givenMembership("onboarding");
    const membership = await setMembershipStatus({
      actorPersonId,
      membershipId,
      status: "archived",
    });
    expect(membership.status).toBe("archived");
  });

  it("never records a reason, on any transition", async () => {
    const membershipId = await givenMembership("active");
    await setMembershipStatus({ actorPersonId, membershipId, status: "departed" });
    expect((await statusEvents(membershipId)).at(-1)?.reason).toBeNull();
    expect((await auditRows(membershipId))[0].reason).toBeNull();
  });

  it("is a no-op — no event, no audit row — when the requested status is already current", async () => {
    const membershipId = await givenMembership("active");

    const membership = await setMembershipStatus({ actorPersonId, membershipId, status: "active" });

    expect(membership.status).toBe("active");
    expect(await statusEvents(membershipId)).toHaveLength(1); // only the creation event
    expect(await auditRows(membershipId)).toHaveLength(0);
  });

  it("refuses a membership that does not exist", async () => {
    const failure = await setMembershipStatus({
      actorPersonId,
      membershipId: "00000000-0000-4000-8000-000000000000",
      status: "active",
    }).catch((error: unknown) => error);

    expect(isServiceError(failure) && failure.kind).toBe("not_found");
  });

  it("refuses a change that names no operator, before touching the database", async () => {
    const membershipId = await givenMembership("onboarding");

    const failure = await setMembershipStatus({
      actorPersonId: "  ",
      membershipId,
      status: "active",
    }).catch((error: unknown) => error);

    expect(isServiceError(failure) && failure.rule).toBe("audit_events_has_an_actor");
    expect(await currentStatus(membershipId)).toBe("onboarding");
  });
});

// ---------------------------------------------------------------------------
// The one place a free ladder can still fail — the dated-field checks
// ---------------------------------------------------------------------------

describe("setMembershipStatus — the surviving database checks", () => {
  it("dates `departed` in the same write, whatever status it came from", async () => {
    for (const from of ["onboarding", "active", "inactive", "archived"] as MembershipStatus[]) {
      const membershipId = await givenMembership(from);

      await setMembershipStatus({ actorPersonId, membershipId, status: "departed" });

      const row = await observer.query<{ departed_on: Date | null }>(
        "select departed_on from public.season_memberships where id = $1::uuid",
        [membershipId],
      );
      expect(row.rows[0].departed_on, `from ${from}`).not.toBeNull();
    }
  });

  it("preserves the original `departed_on` across a return and a second departure", async () => {
    const membershipId = await givenMembership("departed");
    const before = await observer.query<{ departed_on: Date }>(
      "select departed_on from public.season_memberships where id = $1::uuid",
      [membershipId],
    );

    await setMembershipStatus({ actorPersonId, membershipId, status: "inactive" });
    await setMembershipStatus({ actorPersonId, membershipId, status: "departed" });

    const after = await observer.query<{ departed_on: Date }>(
      "select departed_on from public.season_memberships where id = $1::uuid",
      [membershipId],
    );
    expect(after.rows[0].departed_on.toISOString()).toBe(before.rows[0].departed_on.toISOString());
  });

  it("preserves the original `activated_on` across a departure and a return, same as before", async () => {
    const membershipId = await givenMembership("active");
    const before = await observer.query<{ activated_on: Date }>(
      "select activated_on from public.season_memberships where id = $1::uuid",
      [membershipId],
    );

    await setMembershipStatus({ actorPersonId, membershipId, status: "inactive" });
    await setMembershipStatus({ actorPersonId, membershipId, status: "active" });

    const after = await observer.query<{ activated_on: Date }>(
      "select activated_on from public.season_memberships where id = $1::uuid",
      [membershipId],
    );
    expect(after.rows[0].activated_on.toISOString()).toBe(
      before.rows[0].activated_on.toISOString(),
    );
  });

  it("clears a stale inactivity label once the membership leaves `inactive`", async () => {
    const membershipId = await givenMembership("inactive");
    await observer.query(
      "update public.season_memberships set inactivity_label = 'Away' where id = $1::uuid",
      [membershipId],
    );

    const membership = await setMembershipStatus({ actorPersonId, membershipId, status: "active" });

    expect(membership.inactivityLabel).toBeNull();
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
    const membershipId = await givenMembership("onboarding");
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
    const membershipId = await givenMembership("onboarding");
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

  /**
   * `REQ-reason-free-waive` (LAN-214): the shipped `onboarding_items_waiver_is_justified`
   * constraint demanded both an author and a reason. It is unwound —
   * `onboarding_items_waiver_author_required` keeps the author, and a waiver
   * with no reason is now accepted rather than refused.
   */
  it("accepts a waiver with an author and no reason", async () => {
    const membershipId = await givenMembership("onboarding");
    const item = await firstItem(membershipId);

    const membership = await resolveOnboardingItem({
      actorPersonId,
      membershipId,
      itemId: item.id,
      status: "waived",
      reason: "  ",
    });

    const updated = membership.onboardingItems.find((each) => each.id === item.id)!;
    expect(updated.status).toBe("waived");
    expect(updated.waivedReason).toBeNull();
    expect(updated.waivedByName).not.toBeNull();
  });

  /** The author half of `onboarding_items_waiver_author_required` still refuses — proved against the database itself, not the (now-removed) app-level check. */
  it("still refuses a waiver with no author, at the database", async () => {
    const membershipId = await givenMembership("onboarding");
    const item = await firstItem(membershipId);

    const failure = await observer
      .query(
        `update public.onboarding_items set status = 'waived', waived_by_person_id = null
          where id = $1::uuid`,
        [item.id],
      )
      .catch((error: unknown) => error);

    expect(String((failure as Error).message)).toMatch(/onboarding_items_waiver_author_required/);
  });

  it("clears the completion when an item becomes not applicable", async () => {
    const membershipId = await givenMembership("onboarding");
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

  /**
   * Owner review, on the running screen: "if I change to say it's completed and
   * the status didn't change, it should not change again if it's already been
   * completed."
   *
   * Before this, saving the same status wrote an audit row whose `from_state`
   * and `to_state` were identical and re-dated `completed_on` to today — an
   * item completed in September silently claiming to have been completed again
   * in August.
   */
  it("refuses a resolution the item already has, and changes nothing", async () => {
    const membershipId = await givenMembership("onboarding");
    const item = await firstItem(membershipId);
    await resolveOnboardingItem({
      actorPersonId,
      membershipId,
      itemId: item.id,
      status: "complete",
    });
    const auditBefore = (await auditRows(item.id)).length;

    const failure = await resolveOnboardingItem({
      actorPersonId,
      membershipId,
      itemId: item.id,
      status: "complete",
    }).catch((error: unknown) => error);

    expect(isServiceError(failure) && failure.rule).toBe("onboarding_item_already_in_that_state");
    expect(isServiceError(failure) && failure.message).toContain("is already complete");
    // Nothing written: no second audit row, and the completion date is untouched.
    expect((await auditRows(item.id)).length).toBe(auditBefore);
  });

  it("still allows moving an item to a different resolution", async () => {
    const membershipId = await givenMembership("onboarding");
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

    expect(membership.onboardingItems.find((each) => each.id === item.id)?.status).toBe(
      "not_applicable",
    );
  });

  it("refuses a status this screen does not offer", async () => {
    const membershipId = await givenMembership("onboarding");
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
    const mine = await givenMembership("onboarding");
    const theirs = await givenMembership("onboarding");
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

  // ---------------------------------------------------------------------
  // reopen — R2-R, R4-T, LAN-214
  // ---------------------------------------------------------------------

  it("reopens a resolved item back to pending, never automatically", async () => {
    const membershipId = await givenMembership("onboarding");
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
      status: "reopen",
    });

    const updated = membership.onboardingItems.find((each) => each.id === item.id)!;
    expect(updated.status).toBe("pending");
    expect(updated.completedOn).toBeNull();
  });

  it("reopens from every terminal state — waived and not_applicable, not only complete", async () => {
    const membershipId = await givenMembership("onboarding");
    const [waivedItem, naItem] = (await readMembership(membershipId)).onboardingItems;

    await resolveOnboardingItem({
      actorPersonId,
      membershipId,
      itemId: waivedItem.id,
      status: "waived",
    });
    await resolveOnboardingItem({
      actorPersonId,
      membershipId,
      itemId: naItem.id,
      status: "not_applicable",
    });

    const reopenedWaived = await resolveOnboardingItem({
      actorPersonId,
      membershipId,
      itemId: waivedItem.id,
      status: "reopen",
    });
    const reopenedNa = await resolveOnboardingItem({
      actorPersonId,
      membershipId,
      itemId: naItem.id,
      status: "reopen",
    });

    expect(reopenedWaived.onboardingItems.find((i) => i.id === waivedItem.id)?.status).toBe(
      "pending",
    );
    expect(reopenedNa.onboardingItems.find((i) => i.id === naItem.id)?.status).toBe("pending");
  });

  it("refuses to reopen a live item — nothing resolved, nothing to reopen", async () => {
    const membershipId = await givenMembership("onboarding");
    const item = await firstItem(membershipId);

    const failure = await resolveOnboardingItem({
      actorPersonId,
      membershipId,
      itemId: item.id,
      status: "reopen",
    }).catch((error: unknown) => error);

    expect(isServiceError(failure) && failure.rule).toBe(
      "onboarding_item_reopen_requires_a_resolved_item",
    );
  });

  // ---------------------------------------------------------------------
  // Per-item history — REQ-item-history, LAN-214
  // ---------------------------------------------------------------------

  it("writes an append-only history row for every real transition, with actor, date and the state pair", async () => {
    const membershipId = await givenMembership("onboarding");
    const item = await firstItem(membershipId);

    await resolveOnboardingItem({
      actorPersonId,
      membershipId,
      itemId: item.id,
      status: "complete",
    });
    await resolveOnboardingItem({ actorPersonId, membershipId, itemId: item.id, status: "reopen" });
    await resolveOnboardingItem({
      actorPersonId,
      membershipId,
      itemId: item.id,
      status: "waived",
      reason: "Hardship",
    });

    const history = await withTransaction((tx) => readOnboardingItemHistoryIn(tx, item.id));
    expect(history.map((h) => [h.fromStatus, h.toStatus])).toEqual([
      ["pending", "complete"],
      ["complete", "pending"],
      ["pending", "waived"],
    ]);
    for (const entry of history) {
      expect(entry.actorKind).toBe("operator");
      expect(entry.actorPersonId).toBe(actorPersonId);
      expect(entry.occurredAt).toBeInstanceOf(Date);
    }
    expect(history[2].reason).toBe("Hardship");
  });

  // `REQ-item-history`'s own acceptance criterion — "Prove it with a test
  // that attempts an overwrite" — is proved in
  // `tests/schema-onboarding-substrate.test.ts`, which connects the way the
  // application actually does (`set local role service_role`); this suite's
  // `observer` connects as the `postgres` superuser and bypasses every grant,
  // so a permission-denied assertion here would prove nothing.
});

// ---------------------------------------------------------------------------
// claimOnboardingItem — R2-V, LAN-214
// ---------------------------------------------------------------------------

describe("claimOnboardingItem", () => {
  /**
   * A person, a membership, and one trust-class item type — all on
   * `trustSeasonId`, this suite's own private season, so inserting a new item
   * *type* here never touches `openSeasonId`'s catalogue or the `seasonTypes`
   * snapshot every other describe block in this file compares against.
   */
  async function givenTrustClassMembership(): Promise<{ membershipId: string; itemId: string }> {
    const givenName = unique("TrustPerson");
    const person = await observer.query<{ id: string }>(
      "insert into public.people (given_name, family_name) values ($1, 'Testcase') returning id",
      [givenName],
    );
    const membership = await observer.query<{ id: string }>(
      `insert into public.season_memberships (person_id, season_id, status, entry, confirmed_on)
       values ($1::uuid, $2::uuid, 'onboarding', 'new', current_date) returning id`,
      [person.rows[0].id, trustSeasonId],
    );
    const typeId = await observer.query<{ id: string }>(
      `insert into public.onboarding_item_types
         (season_id, code, label, is_required, verification_class, sort_order)
       values ($1::uuid, $2, 'BUCS Play registration', true, 'trust', 999)
       returning id`,
      [trustSeasonId, unique("trust-type")],
    );
    const item = await observer.query<{ id: string }>(
      `insert into public.onboarding_items (season_membership_id, season_id, item_type_id, status)
       values ($1::uuid, $2::uuid, $3::uuid, 'pending') returning id`,
      [membership.rows[0].id, trustSeasonId, typeId.rows[0].id],
    );
    return { membershipId: membership.rows[0].id, itemId: item.rows[0].id };
  }

  /** The direct (non-trust-class) case still uses the shared open season — no new item type is created for it. */
  it("moves a trust-class item to claimed, with player provenance", async () => {
    const { membershipId, itemId } = await givenTrustClassMembership();
    const playerPersonId = (await readMembership(membershipId)).personId;

    const membership = await claimOnboardingItem({
      actorPersonId: playerPersonId,
      membershipId,
      itemId,
    });

    const item = membership.onboardingItems.find((each) => each.id === itemId)!;
    expect(item.status).toBe("claimed");

    const history = await withTransaction((tx) => readOnboardingItemHistoryIn(tx, itemId));
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      fromStatus: "pending",
      toStatus: "claimed",
      actorKind: "player",
      actorPersonId: playerPersonId,
    });
  });

  it("refuses to claim a direct (non-trust-class) item", async () => {
    const membershipId = await givenMembership("onboarding");
    const item = await firstItem(membershipId);
    const playerPersonId = (await readMembership(membershipId)).personId;

    const failure = await claimOnboardingItem({
      actorPersonId: playerPersonId,
      membershipId,
      itemId: item.id,
    }).catch((error: unknown) => error);

    expect(isServiceError(failure) && failure.rule).toBe(
      "onboarding_item_claim_requires_trust_class",
    );
  });

  it("refuses to claim an item that is already claimed", async () => {
    const { membershipId, itemId } = await givenTrustClassMembership();
    const playerPersonId = (await readMembership(membershipId)).personId;
    await claimOnboardingItem({ actorPersonId: playerPersonId, membershipId, itemId });

    const failure = await claimOnboardingItem({
      actorPersonId: playerPersonId,
      membershipId,
      itemId,
    }).catch((error: unknown) => error);

    expect(isServiceError(failure) && failure.rule).toBe("onboarding_item_already_in_that_state");
  });
});

async function firstItem(membershipId: string) {
  const membership = await readMembership(membershipId);
  return membership.onboardingItems[0];
}

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
    const membershipId = await givenMembership("onboarding");
    await settleRequiredItems(membershipId);

    const roster = await listCurrentSeasonRoster({ search: MARKER });
    const entry = roster.entries.find((each) => each.membershipId === membershipId)!;

    expect(entry.itemsTotal).toBe(seasonTypes.length);
    expect(entry.requiredOutstanding).toBe(0);
    expect(entry.itemsResolved).toBeGreaterThan(0);
  });

  /**
   * Register D10 on the roster list, which is a **second** copy of the rule —
   * `GATING_ITEM_PREDICATE` in SQL, `outstandingFrom()` in TypeScript.
   *
   * Independent review deleted `and not t.is_subscription` from the SQL copy
   * and the whole suite stayed green, while UX-20's Onboarding column began
   * reading "1 outstanding" for a member whose only unresolved item was the
   * unpaid subscription. That is the lesson about this club that D10 says must
   * never be taught, on the screen an operator scans first.
   *
   * So this asserts the two copies agree, on a membership constructed to make
   * them disagree if either is edited alone.
   */
  it("counts a genuinely outstanding required item, so the check above is not vacuous", async () => {
    const membershipId = await givenMembership("onboarding");
    const required = seasonTypes.find((type) => type.isRequired && !type.isSubscription)!;
    await settleRequiredItems(membershipId);
    await setItemStatus(membershipId, required.code, "pending");

    const roster = await listCurrentSeasonRoster({ search: MARKER });
    const entry = roster.entries.find((each) => each.membershipId === membershipId)!;
    const record = await readMembership(membershipId);

    expect(entry.requiredOutstanding).toBe(1);
    expect(entry.requiredOutstanding).toBe(record.outstandingRequired.length);
  });

  it("resolves an inherited Object.prototype key to the default sort, not a crash", async () => {
    // `ROSTER_SORT_COLUMNS["toString"]` is a function — truthy — so a plain
    // lookup with `??` never fell back and the query became `order by
    // undefined`, which the database refuses and the screen renders as "the
    // roster is unavailable". `?sort=toString` is a URL anybody can type.
    //
    // Compared over the memberships that existed for the WHOLE comparison.
    //
    // Every read here is a separate statement against a database several
    // parallel suites are writing to, so no two of them need contain the same
    // rows. Two earlier attempts at this both failed in CI: comparing whole
    // lists, and comparing intersections but then asserting the two totals were
    // equal — that last assertion is a race by itself, and this branch's suites
    // create memberships often enough to lose it.
    //
    // Bracketing the sorted read between two default reads gives an exact set:
    // a membership in both the before and the after existed throughout, so it
    // must appear in the middle read too. Comparing that set in order therefore
    // proves the ordering claim *and* catches a truncating sort key, because a
    // truncated result would be missing members of it — without either
    // assertion depending on what any other suite is doing.
    const before = await listCurrentSeasonRoster({ sort: "name" });

    for (const inherited of ["toString", "constructor", "valueOf", "hasOwnProperty"]) {
      const roster = await listCurrentSeasonRoster({ sort: inherited });
      const after = await listCurrentSeasonRoster({ sort: "name" });

      const stillThere = new Set(after.entries.map((entry) => entry.membershipId));
      const throughout = before.entries
        .map((entry) => entry.membershipId)
        .filter((id) => stillThere.has(id));
      const seen = new Set(throughout);

      expect(throughout.length).toBeGreaterThan(0);
      expect(
        roster.entries.map((entry) => entry.membershipId).filter((id) => seen.has(id)),
        `sort=${inherited}`,
      ).toEqual(throughout);
    }
  });

  it("falls back to the default sort for a column that is not on the whitelist", async () => {
    const injected = await listCurrentSeasonRoster({ sort: "p.given_name; drop table people" });
    const byName = await listCurrentSeasonRoster({ sort: "name" });

    // Same reasoning as above: the claim is about the sort key, and two live
    // reads of a shared table need not contain the same rows.
    const injectedIds = injected.entries.map((entry) => entry.membershipId);
    const byNameIds = byName.entries.map((entry) => entry.membershipId);
    const shared = new Set(injectedIds);
    expect(injectedIds.filter((id) => byNameIds.includes(id))).toEqual(
      byNameIds.filter((id) => shared.has(id)),
    );
  });
});

// ---------------------------------------------------------------------------
// Row 13 — nothing half-written
// ---------------------------------------------------------------------------

describe("atomicity", () => {
  /**
   * The `for update` row lock in `lockMembership`, which nothing held to its
   * claim until independent review removed it and watched the whole suite stay
   * green — while two concurrent activations wrote two `onboarding → active`
   * events and two audit rows for a transition that happened once.
   *
   * With the transition table gone the loser no longer gets refused — it reads
   * `active` (whatever the winner just wrote) and the no-op path returns
   * successfully rather than throwing. That is a real, deliberate change from
   * the old behaviour, and the assertion below is written for it: both calls
   * resolve, but the lock still keeps the history to exactly one event and one
   * audit row, because the loser's own read happens only after the winner's
   * write commits.
   */
  it("records one status change, not two, when two operators change status at once", async () => {
    const membershipId = await givenMembership("onboarding");
    await settleRequiredItems(membershipId);

    const outcomes = await Promise.allSettled([
      setMembershipStatus({ actorPersonId, membershipId, status: "active" }),
      setMembershipStatus({ actorPersonId, membershipId, status: "active" }),
    ]);

    expect(outcomes.every((each) => each.status === "fulfilled")).toBe(true);
    expect(await currentStatus(membershipId)).toBe("active");

    const events = await statusEvents(membershipId);
    expect(events.filter((event) => event.to_status === "active")).toHaveLength(1);
    expect(
      (await auditRows(membershipId)).filter(
        (row) => row.action === "season_membership_status_changed",
      ),
    ).toHaveLength(1);
  });

  it("is undone by a caller's own transaction rolling back", async () => {
    const membershipId = await givenMembership("onboarding");
    await settleRequiredItems(membershipId);

    await expect(
      withTransaction(async () => {
        await setMembershipStatus({ actorPersonId, membershipId, status: "active" });
        throw new Error("the caller failed after the change succeeded");
      }),
    ).rejects.toThrow("the caller failed after the change succeeded");

    // Read from outside: the nested change joined the caller's transaction, so
    // the rollback took it too.
    expect(await currentStatus(membershipId)).toBe("onboarding");
    expect(await statusEvents(membershipId)).toHaveLength(1);
  });
});
