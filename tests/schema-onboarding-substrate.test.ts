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
  /**
   * LAN-214 seeded one labelled placeholder per document. LAN-347 added the
   * University's own consent form as a *second* photo release version rather
   * than editing the first: a version an agreement is already recorded against
   * has to keep resolving to the words that were shown, which is the whole
   * point of the slot. So the count per type is "at least one", and which one
   * is current is the ordering below.
   */
  it("keeps every version ever seeded, and makes the newest one current", async () => {
    const result = await client.query<{ v: string; label: string }>(
      `select agreement_type::text as v, version_label as label
         from public.onboarding_agreement_versions
        order by agreement_type, effective_from`,
    );
    expect(result.rows.filter((r) => r.v === "code_of_conduct").map((r) => r.label)).toEqual([
      "placeholder-v1",
    ]);
    // Oldest first: the placeholder is still on record, under the real form.
    expect(result.rows.filter((r) => r.v === "photo_release").map((r) => r.label)).toEqual([
      "placeholder-v1",
      "oxford-consent-form-v1",
    ]);
  });

  // LAN-363: `pdf_path` is a path this deployment serves, never an address
  // somewhere else. A leading `//` is protocol-relative — a browser resolves
  // it against the current protocol onto whatever host follows — and a
  // leading `/\` is the same trick, since a browser normalises that leading
  // backslash to a slash before it resolves the address.
  it("refuses a protocol-relative pdf_path", async () => {
    await expectRejected(
      client,
      `insert into public.onboarding_agreement_versions
         (agreement_type, version_label, body, pdf_path)
       values ('code_of_conduct', $1, 'x', '//evil.example.com/x.pdf')`,
      [`fixture-pdf-path-${Math.random()}`],
      /onboarding_agreement_versions_pdf_path_is_local/,
    );
  });

  it("refuses a backslash-led pdf_path", async () => {
    await expectRejected(
      client,
      `insert into public.onboarding_agreement_versions
         (agreement_type, version_label, body, pdf_path)
       values ('code_of_conduct', $1, 'x', '/\\evil.example.com/x.pdf')`,
      [`fixture-pdf-path-${Math.random()}`],
      /onboarding_agreement_versions_pdf_path_is_local/,
    );
  });

  it("accepts a real local pdf_path", async () => {
    await expectAccepted(
      client,
      `insert into public.onboarding_agreement_versions
         (agreement_type, version_label, body, pdf_path)
       values ('code_of_conduct', $1, 'x', '/documents/x.pdf')`,
      [`fixture-pdf-path-${Math.random()}`],
    );
  });

  // LAN-347. Nullable, because rows recorded under the placeholder have none
  // and history is not rewritten; the service refuses a new one whose wording
  // asks for it. Blank is refused by the database either way.
  it("refuses a blank printed name outright", async () => {
    const version = await one<{ id: string }>(
      client,
      `select id from public.onboarding_agreement_versions
        where agreement_type = 'photo_release' and version_label = 'oxford-consent-form-v1'`,
    );
    await expectRejected(
      client,
      `insert into public.onboarding_agreements
         (person_id, season_id, agreement_type, agreement_version_id, printed_name)
       values ($1, $2, 'photo_release', $3, '   ')`,
      [base.personId, base.seasonId, version.id],
      /onboarding_agreements_printed_name_not_blank/,
    );
  });

  // LAN-347 decision 4: the submitted form lives here, and nowhere on `people`.
  // Every box is nullable, because a row recorded before the form existed has
  // none, and every box refuses a blank, so "not given" is exactly null.
  it.each([
    ["form_name", /onboarding_agreements_form_name_not_blank/],
    ["form_address", /onboarding_agreements_form_address_not_blank/],
    ["form_postcode", /onboarding_agreements_form_postcode_not_blank/],
    ["form_tel", /onboarding_agreements_form_tel_not_blank/],
    ["form_email", /onboarding_agreements_form_email_not_blank/],
  ])("refuses a blank %s outright", async (column, rule) => {
    const version = await one<{ id: string }>(
      client,
      `select id from public.onboarding_agreement_versions
        where agreement_type = 'photo_release' and version_label = 'oxford-consent-form-v1'`,
    );
    await expectRejected(
      client,
      `insert into public.onboarding_agreements
         (person_id, season_id, agreement_type, agreement_version_id, printed_name, ${column})
       values ($1, $2, 'photo_release', $3, 'Jordan Ashworth', '   ')`,
      [base.personId, base.seasonId, version.id],
      rule,
    );
  });

  it("holds no postal address anywhere on people", async () => {
    const result = await client.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'people'
          and column_name in ('address', 'postcode')`,
    );
    expect(result.rows).toEqual([]);
  });

  it("accepts an agreement recorded before the wording asked for a printed name", async () => {
    const version = await one<{ id: string }>(
      client,
      `select id from public.onboarding_agreement_versions
        where agreement_type = 'photo_release' and version_label = 'placeholder-v1'`,
    );
    await expectAccepted(
      client,
      `insert into public.onboarding_agreements
         (person_id, season_id, agreement_type, agreement_version_id, printed_name)
       values ($1, $2, 'photo_release', $3, null)`,
      [base.personId, base.seasonId, version.id],
    );
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

  // LAN-347. The once-per-season rule is now a partial unique index over the
  // live rows: reopening stamps `reopened_at` rather than destroying the
  // consent form the player submitted, and a stamped row must not stand in the
  // way of the agreement that replaces it.
  it("lets a reopened agreement be replaced, and still refuses two live ones", async () => {
    const version = await one<{ id: string }>(
      client,
      `select id from public.onboarding_agreement_versions
        where agreement_type = 'photo_release' and version_label = 'oxford-consent-form-v1'`,
    );
    const first = await one<{ id: string }>(
      client,
      `insert into public.onboarding_agreements
         (person_id, season_id, agreement_type, agreement_version_id, printed_name, form_address)
       values ($1, $2, 'photo_release', $3, 'Jordan Ashworth', '12 Turl Street')
       returning id`,
      [base.personId, base.seasonId, version.id],
    );

    await expectRejected(
      client,
      `insert into public.onboarding_agreements
         (person_id, season_id, agreement_type, agreement_version_id, printed_name)
       values ($1, $2, 'photo_release', $3, 'Jordan Ashworth')`,
      [base.personId, base.seasonId, version.id],
      "onboarding_agreements_one_per_person_season_type",
    );

    await client.query(
      "update public.onboarding_agreements set reopened_at = now() where id = $1",
      [first.id],
    );

    await expectAccepted(
      client,
      `insert into public.onboarding_agreements
         (person_id, season_id, agreement_type, agreement_version_id, printed_name)
       values ($1, $2, 'photo_release', $3, 'Jordan Ashworth')`,
      [base.personId, base.seasonId, version.id],
    );

    // And the reopened row — with the form on it — is still there.
    const kept = await client.query<{ form_address: string | null }>(
      "select form_address from public.onboarding_agreements where id = $1",
      [first.id],
    );
    expect(kept.rows[0].form_address).toBe("12 Turl Street");
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
    // LAN-347: the single exception, and it is column-level. Retiring a
    // reopened agreement is the only change the application may make to a row
    // it has already recorded.
    await expectAccepted(
      client,
      "update public.onboarding_agreements set reopened_at = now() where id = $1",
      [agreement.id],
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
