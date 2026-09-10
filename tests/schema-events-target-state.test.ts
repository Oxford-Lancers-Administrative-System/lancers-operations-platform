// @vitest-environment node
/**
 * The storage LAN-151 established for the Events & Calendar target state.
 *
 * `tests/schema-invariants.test.ts` covers the event record itself — the two
 * narrowed enums, the reconciled week coordinate, the joining-link rule and the
 * three invariants that were retired. This file covers the rest of the
 * mission's schema: the per-type templates and their default questions and
 * audience, the per-type configuration Mission 4 consumes, the club link, and
 * the hold an amendment places on unsent messages.
 *
 * Every table here is **storage only**. This work package established it; the
 * behaviour that reads and writes it belongs to the mission's later packages,
 * and nothing in `src/` touches any of it yet. What is proved here is therefore
 * what the database guarantees whatever that behaviour turns out to be.
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

describe("per-type configuration — D75, D77", () => {
  it("carries one row per event type, and exactly the approved thresholds", async () => {
    const rows = await client.query<{ event_type: string; chase_threshold_days: number }>(
      `select event_type::text as event_type, chase_threshold_days
         from public.event_type_settings
        order by event_type::text`,
    );

    // D75 and D77, as the Events brief records them: two days for the routine
    // events, seven for a game, five for a social. Mission 2 stores them;
    // Mission 4 owns the chase itself.
    expect(
      Object.fromEntries(rows.rows.map((row) => [row.event_type, row.chase_threshold_days])),
    ).toEqual({
      practice: 2,
      strength_and_conditioning: 2,
      chalk: 2,
      game: 7,
      social: 5,
      recruitment: 2,
      meeting: 2,
    });
  });

  it("refuses an absurd threshold", async () => {
    await expectRejected(
      client,
      "update public.event_type_settings set chase_threshold_days = 400 where event_type = 'game'",
      [],
      "event_type_settings_threshold_is_sane",
    );
  });
});

describe("event-type templates — D40, D41, D42, D47", () => {
  it("has exactly seven, one per type, every field undecided", async () => {
    const rows = await client.query<{ event_type: string }>(
      "select event_type::text as event_type from public.event_templates order by event_type::text",
    );
    expect(rows.rows).toHaveLength(7);

    // "The template does not mean that everything needs to be changed … You can
    // have some details not decided" — Brian, 2026-08-21. A template arrives
    // saying nothing, and a field it does not decide simply arrives empty.
    const undecided = await one<{ tally: string }>(
      client,
      `select count(*)::text as tally from public.event_templates
        where default_venue is null and default_delivery_mode is null
          and default_duration_minutes is null and default_description is null
          and default_required_equipment is null and default_is_mandatory is null`,
      [],
    );
    expect(undecided.tally).toBe("7");
  });

  it("stores a default length rather than a start time, in five-minute steps", async () => {
    await expectAccepted(
      client,
      `update public.event_templates set default_duration_minutes = 90 where event_type = 'practice'`,
    );
    await expectRejected(
      client,
      `update public.event_templates set default_duration_minutes = 92 where event_type = 'practice'`,
      [],
      "event_templates_duration_is_five_minute",
    );
  });

  /**
   * LAN-276 correction round 1. Brian, walking the review environment,
   * 2026-09-10: "In the template, swatch color should be something that
   * gets chosen, so it gets added as part of the template." The column
   * stores a palette **key**, never a hex value, and the check constraint is
   * the backstop under `validateEventTemplate`'s own refusal — the same
   * two-layer shape every other template field gets.
   */
  describe("colour — LAN-276 correction round 1", () => {
    it("gives each of the seven seeded templates the colour the calendar always painted it", async () => {
      const rows = await client.query<{ event_type: string; colour_key: string }>(
        "select event_type::text as event_type, colour_key from public.event_templates order by event_type::text",
      );
      expect(Object.fromEntries(rows.rows.map((row) => [row.event_type, row.colour_key]))).toEqual({
        practice: "blue",
        strength_and_conditioning: "teal",
        chalk: "purple",
        game: "red",
        social: "orange",
        recruitment: "green",
        meeting: "slate",
      });
    });

    it("accepts every key the palette offers", async () => {
      await expectAccepted(
        client,
        `update public.event_templates set colour_key = 'indigo' where event_type = 'practice'`,
      );
    });

    it("refuses a colour outside the fixed palette, including a hex value", async () => {
      for (const outsideThePalette of ["chartreuse", "#1565c0"]) {
        await expectRejected(
          client,
          "update public.event_templates set colour_key = $1 where event_type = 'practice'",
          [outsideThePalette],
          "event_templates_colour_key_known",
        );
      }
    });

    it("refuses a null colour — every template has one, undecided or not", async () => {
      await expectRejected(
        client,
        `update public.event_templates set colour_key = null where event_type = 'practice'`,
        [],
        "colour_key",
      );
    });
  });

  it("takes default questions, and refuses two with the same prompt on one template", async () => {
    // LAN-265 rekeyed the child tables from the class to the template, and made
    // the reference composite — `(template_id, event_type)` — so a row cannot
    // name a template and a class that disagree. Both halves are supplied from
    // the template's own row, which is the only way an insert here can be true.
    const fromPractice = `select tpl.id, tpl.event_type from public.event_templates tpl
                           where tpl.event_type = 'practice' order by lower(tpl.name) limit 1`;
    await expectAccepted(
      client,
      `insert into public.event_template_questions (template_id, event_type, prompt, answer_type)
       select tpl.id, tpl.event_type, 'Do you need a lift?', 'boolean' from (${fromPractice}) tpl`,
    );
    await expectRejected(
      client,
      `insert into public.event_template_questions (template_id, event_type, prompt, answer_type)
       select tpl.id, tpl.event_type, 'Do you need a lift?', 'boolean' from (${fromPractice}) tpl`,
      [],
      "event_template_questions_unique_per_template",
    );
  });

  it("refuses a question whose class disagrees with its template's own", async () => {
    // The composite foreign key, stated as a test rather than left implied. It
    // is what keeps `event_template_audience_groups_recruits_are_recruitment_only`
    // meaningful, because that check reads this denormalised column.
    await expectRejected(
      client,
      `insert into public.event_template_questions (template_id, event_type, prompt, answer_type)
       select tpl.id, 'game', 'Which coach is driving?', 'text'
         from public.event_templates tpl
        where tpl.event_type = 'practice' order by lower(tpl.name) limit 1`,
      [],
      "event_template_questions_template_fkey",
    );
  });

  it("takes a default audience as groups, and keeps recruits to Recruitment (D46)", async () => {
    const templateOf = (eventType: string) =>
      `select tpl.id, tpl.event_type from public.event_templates tpl
        where tpl.event_type = '${eventType}' order by lower(tpl.name) limit 1`;
    await expectAccepted(
      client,
      `insert into public.event_template_audience_groups (template_id, event_type, audience_group)
       select tpl.id, tpl.event_type, 'active_players' from (${templateOf("practice")}) tpl`,
    );
    await expectAccepted(
      client,
      `insert into public.event_template_audience_groups (template_id, event_type, audience_group)
       select tpl.id, tpl.event_type, 'recruits' from (${templateOf("recruitment")}) tpl`,
    );
    await expectRejected(
      client,
      `insert into public.event_template_audience_groups (template_id, event_type, audience_group)
       select tpl.id, tpl.event_type, 'recruits' from (${templateOf("social")}) tpl`,
      [],
      "event_template_audience_groups_recruits_are_recruitment_only",
    );
  });

  it("marks a question that arrived from a template, so it can be removed per event", async () => {
    // D42: template-supplied questions are marked and removable per event, and
    // removing one from an event never touches the template.
    const question = await one<{ from_template: boolean }>(
      client,
      `insert into public.event_questions (event_id, prompt, from_template)
       values ($1, 'Do you need a lift?', true)
       returning from_template`,
      [base.draftEventId],
    );
    expect(question.from_template).toBe(true);

    const ordinary = await one<{ from_template: boolean }>(
      client,
      `insert into public.event_questions (event_id, prompt)
       values ($1, 'Anything else?')
       returning from_template`,
      [base.draftEventId],
    );
    expect(ordinary.from_template).toBe(false);
  });
});

describe("the club link — D2, D81", () => {
  const digest = "a".repeat(64);

  it("stores only a digest, and refuses anything that is not one", async () => {
    // The one half of "never store plaintext" that does not depend on the
    // service layer being correct. A plaintext token is 43 URL-safe characters
    // and a SHA-256 digest is 64 lowercase hex ones.
    await expectAccepted(
      client,
      `insert into public.club_link_tokens (event_id, token_hash) values ($1, $2)`,
      [base.approvedEventId, digest],
    );
    await expectRejected(
      client,
      `insert into public.club_link_tokens (event_id, token_hash) values ($1, $2)`,
      [base.approvedEventId, "not-a-digest"],
      "club_link_tokens_hash_is_a_sha256_digest",
    );
  });

  it("permits at most one live link per event", async () => {
    await client.query(
      `insert into public.club_link_tokens (event_id, token_hash) values ($1, $2)`,
      [base.approvedEventId, digest],
    );
    await expectRejected(
      client,
      `insert into public.club_link_tokens (event_id, token_hash) values ($1, $2)`,
      [base.approvedEventId, "b".repeat(64)],
      "club_link_tokens_one_live_per_event",
    );

    // Revoking the first frees the event for a replacement — which is what
    // makes rotation additive when Q2 is settled by testing.
    await client.query(
      `update public.club_link_tokens
          set revoked_at = now(), revoked_reason = 'Rotated.'
        where event_id = $1`,
      [base.approvedEventId],
    );
    await expectAccepted(
      client,
      `insert into public.club_link_tokens (event_id, token_hash) values ($1, $2)`,
      [base.approvedEventId, "b".repeat(64)],
    );
  });

  it("refuses an unexplained revocation", async () => {
    await client.query(
      `insert into public.club_link_tokens (event_id, token_hash) values ($1, $2)`,
      [base.approvedEventId, digest],
    );
    await expectRejected(
      client,
      "update public.club_link_tokens set revoked_at = now() where event_id = $1",
      [base.approvedEventId],
      "club_link_tokens_revocation_is_explained",
    );
  });
});

describe("the amendment hold — REQ-amend-hold", () => {
  async function aJob(): Promise<string> {
    const job = await one<{ id: string }>(
      client,
      `insert into public.notification_jobs (idempotency_key, job_type, event_id)
       values ('lan-151-hold-fixture', 'invitation', $1) returning id`,
      [base.approvedEventId],
    );
    return job.id;
  }

  it("is a hold, not a cancellation: the job keeps its status", async () => {
    // Brian, 2026-08-21: "the notification process should pause. It should see
    // what changed, and then it should continue if it's worth notifying them."
    // Cancelling the job would also throw away the obligation to send it, which
    // nobody decided to do.
    const jobId = await aJob();
    await client.query(
      `update public.notification_jobs
          set held_at = now(), held_reason = 'Amended.', held_by_person_id = $2
        where id = $1`,
      [jobId, base.personId],
    );

    const after = await one<{ status: string; held: boolean }>(
      client,
      `select status::text as status, held_at is not null as held
         from public.notification_jobs where id = $1`,
      [jobId],
    );
    expect(after.status).toBe("pending");
    expect(after.held).toBe(true);
  });

  it("refuses a hold nobody can account for", async () => {
    const jobId = await aJob();
    await expectRejected(
      client,
      "update public.notification_jobs set held_at = now() where id = $1",
      [jobId],
      "notification_jobs_hold_is_attributed",
    );
  });

  it("refuses a hold reason on a job that is not held", async () => {
    const jobId = await aJob();
    await expectRejected(
      client,
      "update public.notification_jobs set held_reason = 'Amended.' where id = $1",
      [jobId],
      "notification_jobs_hold_is_not_a_release",
    );
  });

  it("is not a seventh job status — invariant M4 still admits exactly six", async () => {
    const values = await client.query<{ label: string }>(
      `select e.enumlabel as label
         from pg_enum e
         join pg_type t on t.oid = e.enumtypid
        where t.typname = 'notification_job_status'`,
    );
    expect(values.rows).toHaveLength(6);
  });
});

describe("the access posture on everything LAN-151 added", () => {
  const ADDED = [
    "event_type_settings",
    "event_templates",
    "event_template_questions",
    "event_template_audience_groups",
    "club_link_tokens",
  ];

  it("enables row level security on every one of them", async () => {
    const rows = await client.query<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = any($1::text[])`,
      [ADDED],
    );
    expect(rows.rows).toHaveLength(ADDED.length);
    for (const row of rows.rows) {
      expect(row.relrowsecurity, `${row.relname} must enable RLS`).toBe(true);
    }
  });

  it("grants nothing at all to the two browser-facing roles", async () => {
    const leaked = await client.query<{ table_name: string; grantee: string; privilege: string }>(
      `select table_name, grantee, privilege_type as privilege
         from information_schema.role_table_grants
        where table_schema = 'public'
          and table_name = any($1::text[])
          and grantee in ('anon', 'authenticated')`,
      [ADDED],
    );
    expect(leaked.rows).toEqual([]);
  });

  it("grants the server path only what it needs, and no more", async () => {
    const rows = await client.query<{ table_name: string; privilege: string }>(
      `select table_name, privilege_type as privilege
         from information_schema.role_table_grants
        where table_schema = 'public'
          and table_name = any($1::text[])
          and grantee = 'service_role'
        order by table_name, privilege_type`,
      [ADDED],
    );

    const held: Record<string, string[]> = {};
    for (const row of rows.rows) (held[row.table_name] ??= []).push(row.privilege);
    for (const key of Object.keys(held)) held[key].sort();

    expect(held).toEqual({
      // LAN-265 reversed D40's "created by the migration and never created or
      // deleted by an operator". Creating a template is an ordinary
      // administrative act now, and it creates its settings row and its
      // messaging cadence with it, so all three tables gained `insert` and
      // `delete`. `anon` and `authenticated` gained nothing, which the case
      // above still proves.
      event_type_settings: ["DELETE", "INSERT", "SELECT", "UPDATE"],
      event_templates: ["DELETE", "INSERT", "SELECT", "UPDATE"],
      // A template's questions and its default audience are edited freely.
      event_template_questions: ["DELETE", "INSERT", "SELECT", "UPDATE"],
      event_template_audience_groups: ["DELETE", "INSERT", "SELECT", "UPDATE"],
      // Issued, used and revoked — never deleted. The record that a link was
      // issued is what makes a revocation reviewable.
      club_link_tokens: ["INSERT", "SELECT", "UPDATE"],
    });
  });
});
