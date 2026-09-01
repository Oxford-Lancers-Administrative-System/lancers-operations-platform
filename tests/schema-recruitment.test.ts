// @vitest-environment node
/**
 * The tables LAN-201 (WP-recruitment-schema) adds, as the database sees them.
 *
 * Every rule asserted here is one the service layer would otherwise be trusted
 * to keep — the same reasoning `schema-rsvp-delivery.test.ts` states for its
 * own suite. Each test runs inside a transaction that is rolled back, so the
 * seeded dataset is never mutated and test order cannot matter.
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

async function insertProspect(
  status: string = "identified",
  overrides: { committedOn?: string; convertedMembershipId?: string } = {},
): Promise<string> {
  const row = await one<{ id: string }>(
    client,
    `insert into public.recruitment_prospects
       (person_id, season_id, status, committed_on, converted_membership_id)
     values ($1, $2, $3::public.prospect_status, $4::date, $5::uuid)
     returning id`,
    [
      base.personId,
      base.seasonId,
      status,
      overrides.committedOn ?? null,
      overrides.convertedMembershipId ?? null,
    ],
  );
  return row.id;
}

describe("prospect_status", () => {
  it("carries exactly the seven approved values", async () => {
    const result = await client.query<{ v: string }>(
      "select unnest(enum_range(null::public.prospect_status))::text as v",
    );
    expect(result.rows.map((r) => r.v)).toEqual([
      "identified",
      "engaged",
      "committed",
      "joined",
      "declined",
      "disengaged",
      "void",
    ]);
  });

  it("no longer admits converted or lapsed", async () => {
    for (const stale of ["converted", "lapsed"]) {
      await expectRejected(
        client,
        `insert into public.recruitment_prospects (person_id, season_id, status)
         values ($1, $2, $3::public.prospect_status)`,
        [base.personId, base.seasonId, stale],
      );
    }
  });
});

describe("recruitment_prospects, re-added constraints", () => {
  it("requires the conversion link exactly when joined, under the new value", async () => {
    await expectRejected(
      client,
      `insert into public.recruitment_prospects (person_id, season_id, status, committed_on)
       values ($1, $2, 'joined', '2026-01-01')`,
      [base.personId, base.seasonId],
      "recruitment_prospects_conversion_matches_status",
    );
    await expectRejected(
      client,
      `insert into public.recruitment_prospects
         (person_id, season_id, status, committed_on, converted_membership_id)
       values ($1, $2, 'identified', '2026-01-01', $3)`,
      [base.personId, base.seasonId, base.membershipId],
      "recruitment_prospects_conversion_matches_status",
    );
    await expectAccepted(
      client,
      `insert into public.recruitment_prospects
         (person_id, season_id, status, committed_on, converted_membership_id)
       values ($1, $2, 'joined', '2026-01-01', $3)`,
      [base.personId, base.seasonId, base.membershipId],
    );
  });

  it("requires committed_on for committed and joined alike", async () => {
    await expectRejected(
      client,
      `insert into public.recruitment_prospects (person_id, season_id, status)
       values ($1, $2, 'committed')`,
      [base.personId, base.seasonId],
      "recruitment_prospects_commitment_is_dated",
    );
    await expectAccepted(
      client,
      `insert into public.recruitment_prospects (person_id, season_id, status, committed_on)
       values ($1, $2, 'committed', '2026-01-01')`,
      [base.personId, base.seasonId],
    );
  });

  it("accepts void with no other constraint reacting to it", async () => {
    await expectAccepted(
      client,
      `insert into public.recruitment_prospects (person_id, season_id, status)
       values ($1, $2, 'void')`,
      [base.personId, base.seasonId],
    );
  });

  it("no longer has a notes column — it moved to recruitment_prospect_notes", async () => {
    const result = await client.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'recruitment_prospects' and column_name = 'notes'`,
    );
    expect(result.rows).toHaveLength(0);
  });
});

describe("recruitment_prospect_notes", () => {
  it("requires an author — a person or a named process", async () => {
    const prospectId = await insertProspect();
    await expectRejected(
      client,
      `insert into public.recruitment_prospect_notes (prospect_id, note) values ($1, 'Keen at the taster')`,
      [prospectId],
      "recruitment_prospect_notes_has_an_author",
    );
    await expectAccepted(
      client,
      `insert into public.recruitment_prospect_notes (prospect_id, note, author_label)
       values ($1, 'Keen at the taster', 'Seed fixture')`,
      [prospectId],
    );
    await expectAccepted(
      client,
      `insert into public.recruitment_prospect_notes (prospect_id, note, author_person_id)
       values ($1, 'Keen at the taster', $2)`,
      [prospectId, base.personId],
    );
  });

  it("refuses a blank note", async () => {
    const prospectId = await insertProspect();
    await expectRejected(
      client,
      `insert into public.recruitment_prospect_notes (prospect_id, note, author_label)
       values ($1, '   ', 'Seed fixture')`,
      [prospectId],
      "recruitment_prospect_notes_note_present",
    );
  });

  it("keeps every note — the server role holds no update or delete", async () => {
    const grants = await one<{ can_update: boolean; can_delete: boolean }>(
      client,
      `select has_table_privilege('service_role', 'public.recruitment_prospect_notes', 'update') as can_update,
              has_table_privilege('service_role', 'public.recruitment_prospect_notes', 'delete') as can_delete`,
    );
    expect(grants.can_update).toBe(false);
    expect(grants.can_delete).toBe(false);
  });
});

describe("recruitment_prospect_status_events", () => {
  it("refuses a non-change", async () => {
    const prospectId = await insertProspect();
    await expectRejected(
      client,
      `insert into public.recruitment_prospect_status_events
         (prospect_id, from_status, to_status, actor_label)
       values ($1, 'identified', 'identified', 'Test')`,
      [prospectId],
      "recruitment_prospect_status_events_is_a_change",
    );
  });

  it("requires an actor", async () => {
    const prospectId = await insertProspect();
    await expectRejected(
      client,
      `insert into public.recruitment_prospect_status_events (prospect_id, from_status, to_status)
       values ($1, 'identified', 'engaged')`,
      [prospectId],
      "recruitment_prospect_status_events_has_an_actor",
    );
  });

  it("requires void to be explained — a mistake worth recording is worth explaining", async () => {
    const prospectId = await insertProspect();
    await expectRejected(
      client,
      `insert into public.recruitment_prospect_status_events
         (prospect_id, from_status, to_status, actor_person_id)
       values ($1, 'identified', 'void', $2)`,
      [prospectId, base.personId],
      "recruitment_prospect_status_events_void_is_explained",
    );
    await expectAccepted(
      client,
      `insert into public.recruitment_prospect_status_events
         (prospect_id, from_status, to_status, actor_person_id, reason)
       values ($1, 'identified', 'void', $2, 'Duplicate of another capture')`,
      [prospectId, base.personId],
    );
  });

  it("never requires an explanation for an ordinary transition", async () => {
    const prospectId = await insertProspect();
    await expectAccepted(
      client,
      `insert into public.recruitment_prospect_status_events
         (prospect_id, from_status, to_status, actor_person_id)
       values ($1, 'identified', 'engaged', $2)`,
      [prospectId, base.personId],
    );
  });
});

describe("recruitment_questionnaire_responses", () => {
  it("accepts exactly one of yes/no, a chooser value, or open text", async () => {
    const prospectId = await insertProspect();
    await expectAccepted(
      client,
      `insert into public.recruitment_questionnaire_responses
         (prospect_id, questionnaire, question_code, answer_boolean)
       values ($1, 'football_background', 'played_before', true)`,
      [prospectId],
    );
    await expectRejected(
      client,
      `insert into public.recruitment_questionnaire_responses
         (prospect_id, questionnaire, question_code, answer_boolean, answer_text)
       values ($1, 'football_background', 'played_before', true, 'also this')`,
      [prospectId],
      "recruitment_questionnaire_responses_exactly_one_answer",
    );
    await expectRejected(
      client,
      `insert into public.recruitment_questionnaire_responses (prospect_id, questionnaire, question_code)
       values ($1, 'football_background', 'played_before')`,
      [prospectId],
      "recruitment_questionnaire_responses_exactly_one_answer",
    );
  });

  it("lets a later answer supersede while the earlier one is kept", async () => {
    const prospectId = await insertProspect();
    const first = await one<{ id: string }>(
      client,
      `insert into public.recruitment_questionnaire_responses
         (prospect_id, questionnaire, question_code, answer_text)
       values ($1, 'football_background', 'anything_else', 'Nothing much') returning id`,
      [prospectId],
    );
    // A second live answer for the same question is refused while the first
    // stands — the partial unique index is the one-current-answer rule.
    await expectRejected(
      client,
      `insert into public.recruitment_questionnaire_responses
         (prospect_id, questionnaire, question_code, answer_text)
       values ($1, 'football_background', 'anything_else', 'Changed my mind')`,
      [prospectId],
      "recruitment_questionnaire_responses_one_current_per_question",
    );
    await client.query(
      "update public.recruitment_questionnaire_responses set superseded_at = now() where id = $1",
      [first.id],
    );
    await expectAccepted(
      client,
      `insert into public.recruitment_questionnaire_responses
         (prospect_id, questionnaire, question_code, answer_text)
       values ($1, 'football_background', 'anything_else', 'Changed my mind')`,
      [prospectId],
    );
    const kept = await client.query<{ answer_text: string }>(
      `select answer_text from public.recruitment_questionnaire_responses
        where prospect_id = $1 order by created_at`,
      [prospectId],
    );
    expect(kept.rows.map((r) => r.answer_text)).toEqual(["Nothing much", "Changed my mind"]);
  });
});

describe("recruitment_signup_codes", () => {
  it("permits only one live code per season", async () => {
    await expectAccepted(
      client,
      "insert into public.recruitment_signup_codes (season_id, code) values ($1, 'season-code-a')",
      [base.seasonId],
    );
    await expectRejected(
      client,
      "insert into public.recruitment_signup_codes (season_id, code) values ($1, 'season-code-b')",
      [base.seasonId],
      "recruitment_signup_codes_one_live_per_season",
    );
  });

  it("lets a deactivated code coexist with its re-mint", async () => {
    const first = await one<{ id: string }>(
      client,
      "insert into public.recruitment_signup_codes (season_id, code) values ($1, 'season-code-a') returning id",
      [base.seasonId],
    );
    await expectRejected(
      client,
      "update public.recruitment_signup_codes set deactivated_at = now() where id = $1",
      [first.id],
      "recruitment_signup_codes_deactivation_is_explained",
    );
    await client.query(
      `update public.recruitment_signup_codes
          set deactivated_at = now(), deactivated_reason = 'Poster replaced'
        where id = $1`,
      [first.id],
    );
    await expectAccepted(
      client,
      "insert into public.recruitment_signup_codes (season_id, code) values ($1, 'season-code-b')",
      [base.seasonId],
    );
  });
});

describe("season_messaging_consents", () => {
  it("permits at most one record per person per season", async () => {
    await expectAccepted(
      client,
      "insert into public.season_messaging_consents (person_id, season_id) values ($1, $2)",
      [base.personId, base.seasonId],
    );
    await expectRejected(
      client,
      "insert into public.season_messaging_consents (person_id, season_id) values ($1, $2)",
      [base.personId, base.seasonId],
      "season_messaging_consents_one_per_person_per_season",
    );
  });

  it("requires a source exactly when an outcome exists", async () => {
    await expectRejected(
      client,
      `insert into public.season_messaging_consents (person_id, season_id, state)
       values ($1, $2, 'granted')`,
      [base.personId, base.seasonId],
      "season_messaging_consents_outcome_has_a_source",
    );
    await expectAccepted(
      client,
      `insert into public.season_messaging_consents (person_id, season_id, state, source)
       values ($1, $2, 'asked', null)`,
      [base.personId, base.seasonId],
    );
  });

  it("accepts a granted consent with how it was obtained", async () => {
    await expectAccepted(
      client,
      `insert into public.season_messaging_consents (person_id, season_id, state, source)
       values ($1, $2, 'granted', 'qr_self_entry')`,
      [base.personId, base.seasonId],
    );
  });
});

describe("messaging_schedules, the recruit ladder", () => {
  it("carries the two recruit fields only on the recruitment row", async () => {
    const rows = await client.query<{
      event_type: string;
      recruit_invitation_lead_days: number | null;
      recruit_follow_up_cadence_hours: number | null;
    }>(
      `select event_type::text as event_type, recruit_invitation_lead_days, recruit_follow_up_cadence_hours
         from public.messaging_schedules order by event_type`,
    );
    for (const row of rows.rows) {
      if (row.event_type === "recruitment") {
        expect(row.recruit_invitation_lead_days).not.toBeNull();
        expect(row.recruit_follow_up_cadence_hours).not.toBeNull();
      } else {
        expect(row.recruit_invitation_lead_days).toBeNull();
        expect(row.recruit_follow_up_cadence_hours).toBeNull();
      }
    }
  });

  it("refuses setting a recruit field on any other event type", async () => {
    await expectRejected(
      client,
      "update public.messaging_schedules set recruit_invitation_lead_days = 5 where event_type = 'practice'",
      [],
      "messaging_schedules_recruit_fields_are_recruitment_only",
    );
  });
});

describe("row level security", () => {
  it("enables RLS with no anon/authenticated grant on every table this package adds", async () => {
    const tables = [
      "recruitment_prospect_notes",
      "recruitment_prospect_status_events",
      "recruitment_questionnaire_responses",
      "recruitment_signup_codes",
      "season_messaging_consents",
    ];
    for (const table of tables) {
      const relrowsecurity = await one<{ v: boolean }>(
        client,
        "select relrowsecurity as v from pg_class where oid = $1::regclass",
        [`public.${table}`],
      );
      expect(relrowsecurity.v, `${table} should have RLS enabled`).toBe(true);

      for (const role of ["anon", "authenticated"]) {
        const grants = await client.query<{ privilege_type: string }>(
          `select privilege_type from information_schema.role_table_grants
            where table_schema = 'public' and table_name = $1 and grantee = $2`,
          [table, role],
        );
        expect(grants.rows, `${role} should hold no grant on ${table}`).toHaveLength(0);
      }
    }
  });
});
