// @vitest-environment node
/**
 * The tables LAN-214 (`WP-onboarding-substrate`) adds, as the database sees
 * them — every rule this suite proves is one the service layer would
 * otherwise be trusted to keep, the same reasoning `schema-recruitment.test.ts`
 * states for its own suite.
 *
 * Each test runs inside a transaction that is rolled back, so the seeded
 * dataset is never mutated and test order cannot matter. The append-only
 * grants (no `update`, no `delete`) are proved as the application actually
 * connects — `set local role service_role` — because this suite's own
 * connection is the `postgres` superuser, which bypasses every grant and
 * would prove nothing about the ones under test.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createBaseline,
  expectAccepted,
  expectRejected,
  one,
  openLocalClient,
  type Baseline,
  type Client,
} from "./helpers/domain-fixture";

let client: Client;
let base: Baseline;

beforeAll(async () => {
  client = await openLocalClient();
});
afterAll(async () => {
  await client?.end();
});
beforeEach(async () => {
  await client.query("begin");
  base = await createBaseline(client);
});
afterEach(async () => {
  await client.query("rollback");
});

async function insertItemType(
  overrides: { verificationClass?: string; code?: string } = {},
): Promise<string> {
  const row = await one<{ id: string }>(
    client,
    `insert into public.onboarding_item_types (season_id, code, label, verification_class)
     values ($1, $2, 'Fixture item', $3::public.onboarding_item_verification_class)
     returning id`,
    [
      base.seasonId,
      overrides.code ?? `fixture-${Math.random()}`,
      overrides.verificationClass ?? "direct",
    ],
  );
  return row.id;
}

async function insertOnboardingItem(
  itemTypeId: string,
  status: string = "pending",
): Promise<string> {
  const row = await one<{ id: string }>(
    client,
    `insert into public.onboarding_items (season_membership_id, season_id, item_type_id, status)
     values ($1, $2, $3, $4::public.onboarding_item_status) returning id`,
    [base.membershipId, base.seasonId, itemTypeId, status],
  );
  return row.id;
}

describe("onboarding_item_status", () => {
  it("carries claimed, joining the shipped five", async () => {
    const result = await client.query<{ v: string }>(
      "select unnest(enum_range(null::public.onboarding_item_status))::text as v",
    );
    expect(result.rows.map((r) => r.v)).toEqual([
      "pending",
      "invited",
      "complete",
      "waived",
      "not_applicable",
      "claimed",
    ]);
  });
});

describe("onboarding_items_waiver_author_required", () => {
  it("refuses a waiver with no author", async () => {
    const itemType = await insertItemType();
    const item = await insertOnboardingItem(itemType);
    await expectRejected(
      client,
      "update public.onboarding_items set status = 'waived', waived_by_person_id = null where id = $1",
      [item],
      "onboarding_items_waiver_author_required",
    );
  });

  it("accepts a waiver with an author and no reason — REQ-reason-free-waive", async () => {
    const itemType = await insertItemType();
    const item = await insertOnboardingItem(itemType);
    await expectAccepted(
      client,
      "update public.onboarding_items set status = 'waived', waived_by_person_id = $2, waived_reason = null where id = $1",
      [item, base.personId],
    );
  });
});

describe("onboarding_item_history", () => {
  it("accepts an insert recording a real transition", async () => {
    const itemType = await insertItemType();
    const item = await insertOnboardingItem(itemType);
    await expectAccepted(
      client,
      `insert into public.onboarding_item_history
         (onboarding_item_id, season_membership_id, from_status, to_status, actor_kind, actor_person_id)
       values ($1, $2, 'pending', 'complete', 'operator', $3)`,
      [item, base.membershipId, base.personId],
    );
  });

  it("refuses a row claiming nothing changed", async () => {
    const itemType = await insertItemType();
    const item = await insertOnboardingItem(itemType);
    await expectRejected(
      client,
      `insert into public.onboarding_item_history
         (onboarding_item_id, season_membership_id, from_status, to_status, actor_kind, actor_person_id)
       values ($1, $2, 'pending', 'pending', 'operator', $3)`,
      [item, base.membershipId, base.personId],
      "onboarding_item_history_is_a_real_change",
    );
  });

  it("refuses a system actor carrying a person id, and a named actor carrying none", async () => {
    const itemType = await insertItemType();
    const item = await insertOnboardingItem(itemType);
    await expectRejected(
      client,
      `insert into public.onboarding_item_history
         (onboarding_item_id, season_membership_id, from_status, to_status, actor_kind, actor_person_id)
       values ($1, $2, 'pending', 'complete', 'system', $3)`,
      [item, base.membershipId, base.personId],
      "onboarding_item_history_system_has_no_person",
    );
    await expectRejected(
      client,
      `insert into public.onboarding_item_history
         (onboarding_item_id, season_membership_id, from_status, to_status, actor_kind, actor_person_id)
       values ($1, $2, 'pending', 'complete', 'operator', null)`,
      [item, base.membershipId],
      "onboarding_item_history_named_actor_has_a_person",
    );
  });

  /** `REQ-item-history`'s own acceptance criterion: "Prove it with a test that attempts an overwrite." */
  it("refuses an update or a delete — append-only, as the application connects", async () => {
    const itemType = await insertItemType();
    const item = await insertOnboardingItem(itemType);
    const row = await one<{ id: string }>(
      client,
      `insert into public.onboarding_item_history
         (onboarding_item_id, season_membership_id, from_status, to_status, actor_kind, actor_person_id)
       values ($1, $2, 'pending', 'complete', 'operator', $3) returning id`,
      [item, base.membershipId, base.personId],
    );

    await client.query("savepoint role_switch");
    await client.query("set local role service_role");
    await expectRejected(
      client,
      "update public.onboarding_item_history set reason = 'tampered' where id = $1",
      [row.id],
      /permission denied/,
    );
    await expectRejected(
      client,
      "delete from public.onboarding_item_history where id = $1",
      [row.id],
      /permission denied/,
    );
    await client.query("rollback to savepoint role_switch");
  });
});

describe("onboarding_activity_log", () => {
  it("accepts an ask with no actor, and an answer naming one", async () => {
    await expectAccepted(
      client,
      `insert into public.onboarding_activity_log
         (season_membership_id, season_id, section, kind, channel, actor_label)
       values ($1, $2, 'welcome', 'ask', 'whatsapp', 'the club')`,
      [base.membershipId, base.seasonId],
    );
    await expectAccepted(
      client,
      `insert into public.onboarding_activity_log
         (season_membership_id, season_id, section, kind, channel, actor_person_id)
       values ($1, $2, 'welcome', 'answer', 'link', $3)`,
      [base.membershipId, base.seasonId, base.personId],
    );
  });

  it("refuses an answer naming nobody", async () => {
    await expectRejected(
      client,
      `insert into public.onboarding_activity_log
         (season_membership_id, season_id, section, kind, channel)
       values ($1, $2, 'welcome', 'answer', 'link')`,
      [base.membershipId, base.seasonId],
      "onboarding_activity_log_answer_names_someone",
    );
  });

  it("refuses an update or a delete — append-only, as the application connects", async () => {
    const row = await one<{ id: string }>(
      client,
      `insert into public.onboarding_activity_log
         (season_membership_id, season_id, section, kind, channel, actor_label)
       values ($1, $2, 'welcome', 'ask', 'whatsapp', 'the club') returning id`,
      [base.membershipId, base.seasonId],
    );

    await client.query("savepoint role_switch");
    await client.query("set local role service_role");
    await expectRejected(
      client,
      "update public.onboarding_activity_log set channel = 'email' where id = $1",
      [row.id],
      /permission denied/,
    );
    await expectRejected(
      client,
      "delete from public.onboarding_activity_log where id = $1",
      [row.id],
      /permission denied/,
    );
    await client.query("rollback to savepoint role_switch");
  });
});

describe("onboarding_agreement_versions / onboarding_agreements", () => {
  it("seeds exactly one placeholder version per document type", async () => {
    const result = await client.query<{ v: string }>(
      "select agreement_type::text as v from public.onboarding_agreement_versions order by agreement_type",
    );
    expect(result.rows.map((r) => r.v)).toEqual(["code_of_conduct", "photo_release"]);
  });

  it("records one agreement per person per season per type, never a second", async () => {
    const version = await one<{ id: string }>(
      client,
      "select id from public.onboarding_agreement_versions where agreement_type = 'code_of_conduct'",
    );
    await expectAccepted(
      client,
      `insert into public.onboarding_agreements (person_id, season_id, agreement_type, agreement_version_id)
       values ($1, $2, 'code_of_conduct', $3)`,
      [base.personId, base.seasonId, version.id],
    );
    await expectRejected(
      client,
      `insert into public.onboarding_agreements (person_id, season_id, agreement_type, agreement_version_id)
       values ($1, $2, 'code_of_conduct', $3)`,
      [base.personId, base.seasonId, version.id],
      "onboarding_agreements_one_per_person_season_type",
    );
  });

  it("refuses a version id that names the wrong document type", async () => {
    const wrongVersion = await one<{ id: string }>(
      client,
      "select id from public.onboarding_agreement_versions where agreement_type = 'photo_release'",
    );
    await expectRejected(
      client,
      `insert into public.onboarding_agreements (person_id, season_id, agreement_type, agreement_version_id)
       values ($1, $2, 'code_of_conduct', $3)`,
      [base.personId, base.seasonId, wrongVersion.id],
      "onboarding_agreements_version_is_the_right_type",
    );
  });

  it("refuses an update or a delete of either table — as the application connects", async () => {
    const version = await one<{ id: string }>(
      client,
      "select id from public.onboarding_agreement_versions where agreement_type = 'code_of_conduct'",
    );
    const agreement = await one<{ id: string }>(
      client,
      `insert into public.onboarding_agreements (person_id, season_id, agreement_type, agreement_version_id)
       values ($1, $2, 'code_of_conduct', $3) returning id`,
      [base.personId, base.seasonId, version.id],
    );

    await client.query("savepoint role_switch");
    await client.query("set local role service_role");
    await expectRejected(
      client,
      "update public.onboarding_agreement_versions set body = 'tampered' where id = $1",
      [version.id],
      /permission denied/,
    );
    await expectRejected(
      client,
      "update public.onboarding_agreements set agreed_at = now() where id = $1",
      [agreement.id],
      /permission denied/,
    );
    await expectRejected(
      client,
      "delete from public.onboarding_agreements where id = $1",
      [agreement.id],
      /permission denied/,
    );
    await client.query("rollback to savepoint role_switch");
  });
});

describe("onboarding_chase_settings", () => {
  it("is a singleton, seeded by the migration", async () => {
    const result = await client.query("select id from public.onboarding_chase_settings");
    expect(result.rows).toEqual([{ id: true }]);
  });

  it("refuses a cap outside its sane range, and accepts a cap of zero", async () => {
    await expectRejected(
      client,
      "update public.onboarding_chase_settings set chase_count = -1 where id",
      [],
      "onboarding_chase_settings_count_is_sane",
    );
    await expectAccepted(
      client,
      "update public.onboarding_chase_settings set chase_count = 0 where id",
      [],
    );
  });

  it("refuses an insert or a delete — as the application connects", async () => {
    await client.query("savepoint role_switch");
    await client.query("set local role service_role");
    await expectRejected(
      client,
      "insert into public.onboarding_chase_settings (id, first_chase_after_hours, chase_count, chase_interval_days) values (false, 1, 1, 1)",
      [],
      /permission denied/,
    );
    await expectRejected(
      client,
      "delete from public.onboarding_chase_settings where id",
      [],
      /permission denied/,
    );
    await client.query("rollback to savepoint role_switch");
  });
});

describe("bps_selections", () => {
  it("holds at most one row per membership", async () => {
    await expectAccepted(
      client,
      "insert into public.bps_selections (season_membership_id, season_id, is_selected) values ($1, $2, true)",
      [base.membershipId, base.seasonId],
    );
    await expectRejected(
      client,
      "insert into public.bps_selections (season_membership_id, season_id, is_selected) values ($1, $2, false)",
      [base.membershipId, base.seasonId],
      "bps_selections_one_per_membership",
    );
  });
});

describe("person_fact_disputes", () => {
  it("holds at most one OPEN dispute per (person, field)", async () => {
    await expectAccepted(
      client,
      `insert into public.person_fact_disputes (person_id, field, club_value, player_value)
       values ($1, 'college', 'Old College', 'New College')`,
      [base.personId],
    );
    await expectRejected(
      client,
      `insert into public.person_fact_disputes (person_id, field, club_value, player_value)
       values ($1, 'college', 'Old College', 'Another College')`,
      [base.personId],
      "person_fact_disputes_one_open_per_field",
    );
  });

  it("allows a second dispute on the same field once the first is resolved", async () => {
    const first = await one<{ id: string }>(
      client,
      `insert into public.person_fact_disputes (person_id, field, club_value, player_value)
       values ($1, 'college', 'Old College', 'New College') returning id`,
      [base.personId],
    );
    await client.query(
      `update public.person_fact_disputes
          set status = 'resolved_took_player', resolved_by_person_id = $2, resolved_at = now()
        where id = $1`,
      [first.id, base.otherPersonId],
    );
    await expectAccepted(
      client,
      `insert into public.person_fact_disputes (person_id, field, club_value, player_value)
       values ($1, 'college', 'New College', 'Yet Another College')`,
      [base.personId],
    );
  });

  it("requires a resolver and a date exactly when resolved", async () => {
    const dispute = await one<{ id: string }>(
      client,
      `insert into public.person_fact_disputes (person_id, field, club_value, player_value)
       values ($1, 'college', 'Old College', 'New College') returning id`,
      [base.personId],
    );
    await expectRejected(
      client,
      "update public.person_fact_disputes set status = 'resolved_kept_club' where id = $1",
      [dispute.id],
      "person_fact_disputes_resolution_is_dated",
    );
    await expectRejected(
      client,
      "update public.person_fact_disputes set status = 'resolved_kept_club', resolved_at = now() where id = $1",
      [dispute.id],
      "person_fact_disputes_resolution_names_resolver",
    );
  });

  it("refuses a delete — the losing value stays readable on the row that decided against it", async () => {
    const dispute = await one<{ id: string }>(
      client,
      `insert into public.person_fact_disputes (person_id, field, club_value, player_value)
       values ($1, 'college', 'Old College', 'New College') returning id`,
      [base.personId],
    );
    await client.query("savepoint role_switch");
    await client.query("set local role service_role");
    await expectRejected(
      client,
      "delete from public.person_fact_disputes where id = $1",
      [dispute.id],
      /permission denied/,
    );
    await client.query("rollback to savepoint role_switch");
  });
});
