// @vitest-environment node
/**
 * The other half of tests/schema-invariants.test.ts.
 *
 * A schema that rejects everything satisfies every "must be rejected" test and
 * is useless. These cases are the awkward, valid situations the club's real
 * data actually contains — the ones a tidier design would have refused. Each
 * one traces to the Source Data Analysis or to a register decision.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  confirmAudienceMember,
  createBaseline,
  expectAccepted,
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

describe("identity as the club actually records it", () => {
  it("accepts a person with no surname", async () => {
    // 26% of the club's records are first-name-only. A required surname would
    // reject a quarter of the squad.
    await expectAccepted(client, "insert into public.people (given_name) values ('Mononym')");
  });

  it("accepts contact details in the broken formats the files contain", async () => {
    for (const value of [
      "someone@college.ox.ac.example ",
      "someone@college.example.ac.ox",
      "7700900123",
      "07700 9012",
      "+1 555 0134",
    ]) {
      await expectAccepted(
        client,
        `insert into public.contact_points (person_id, kind, raw_value)
         values ($1, $2, $3)`,
        [base.personId, value.includes("@") ? "email" : "phone", value],
      );
    }
  });

  it("accepts one person under several name forms", async () => {
    await expectAccepted(
      client,
      `insert into public.person_aliases (person_id, alias) values ($1, 'Fix'), ($1, 'F. Primary')`,
      [base.personId],
    );
  });

  it("accepts one person holding an Office plus several non-Office seats", async () => {
    // Constitution ¶19 constrains the four Offices only. Secretary + Media
    // Secretary + IT Officer on one person is a real, current case.
    const media = await one<{ id: string }>(
      client,
      `insert into public.roles (code, name, scope, is_constitutional_office, role_group_id, sort_order)
       values ('fixture_media', 'Fixture Media', 'committee_year', false, $1, 4) returning id`,
      [base.roleGroupId],
    );

    await expectAccepted(
      client,
      `insert into public.role_assignments
         (person_id, role_id, scope, is_constitutional_office, committee_year_id, effective_from)
       values ($1, $2, 'committee_year', true, $4, '2019-06-01'),
              ($1, $3, 'committee_year', false, $4, '2019-06-01'),
              ($1, $5, 'committee_year', false, $4, '2019-06-01')`,
      [base.personId, base.officeRoleId, base.ordinaryRoleId, base.committeeYearId, media.id],
    );
  });

  it("accepts two concurrent holders of one non-Office seat", async () => {
    await expectAccepted(
      client,
      `insert into public.role_assignments
         (person_id, role_id, scope, is_constitutional_office, committee_year_id, effective_from)
       values ($1, $3, 'committee_year', false, $4, '2019-06-01'),
              ($2, $3, 'committee_year', false, $4, '2019-06-01')`,
      [base.personId, base.otherPersonId, base.ordinaryRoleId, base.committeeYearId],
    );
  });

  it("accepts a single-holder seat handed over between two people", async () => {
    // LAN-128. General Manager is standing and single-holder, which constrains
    // concurrency and must not constrain succession — the handover is the
    // normal case, not the exception.
    await expectAccepted(
      client,
      `insert into public.role_assignments
         (person_id, role_id, scope, is_constitutional_office, is_single_holder_seat,
          committee_year_id, effective_from, effective_to)
       values ($1, $3, 'committee_year', false, true, $4, '2019-06-01', '2020-06-01'),
              ($2, $3, 'committee_year', false, true, $4, '2020-06-01', null)`,
      [base.personId, base.otherPersonId, base.singleHolderRoleId, base.committeeYearId],
    );
  });

  it("accepts the same Office held by different people in consecutive, non-overlapping periods", async () => {
    await expectAccepted(
      client,
      `insert into public.role_assignments
         (person_id, role_id, scope, is_constitutional_office, committee_year_id, effective_from, effective_to)
       values ($1, $3, 'committee_year', true, $4, '2019-06-01', '2020-06-01'),
              ($2, $3, 'committee_year', true, $4, '2020-06-01', null)`,
      [base.personId, base.otherPersonId, base.officeRoleId, base.committeeYearId],
    );
  });
});

describe("squad structure as the club actually records it", () => {
  it("accepts an offence and a defence position held simultaneously", async () => {
    // Invariant S1. ~83% of the squad carry both — this is the normal case.
    await expectAccepted(
      client,
      `insert into public.position_assignments
         (season_membership_id, season_id, position_vocabulary_id, position_id, side, slot, effective_from)
       values ($1, $2, $3, $4, 'offence', 'offence', '2026-09-27'),
              ($1, $2, $3, $5, 'defence', 'defence', '2026-09-27')`,
      [
        base.membershipId,
        base.seasonId,
        base.vocabularyId,
        base.offencePositionId,
        base.defencePositionId,
      ],
    );
  });

  it("accepts one person holding more than one jersey number in a kit", async () => {
    await expectAccepted(
      client,
      `insert into public.jersey_assignments
         (season_membership_id, season_id, kit, number, is_predominant, effective_from)
       values ($1, $2, 'blue', 12, true, '2026-10-08'),
              ($1, $2, 'blue', 44, false, '2026-10-08')`,
      [base.membershipId, base.seasonId],
    );
  });

  it("accepts a historical jersey collision when it is flagged as an import conflict", async () => {
    // Invariant S2: historical imports may violate uniqueness. They are
    // flagged, not blocked — refusing them would lose the record.
    await expectAccepted(
      client,
      `insert into public.jersey_assignments
         (season_membership_id, season_id, kit, number, is_import_conflict, effective_from)
       values ($1, $3, 'blue', 12, true, '2026-10-08'),
              ($2, $3, 'blue', 12, true, '2026-10-08')`,
      [base.membershipId, base.otherMembershipId, base.seasonId],
    );
  });

  it("accepts the same number reused after the earlier assignment has ended", async () => {
    // Uniqueness is among CONCURRENT assignments, not across all of history —
    // a number freed mid-season can legitimately be reissued.
    await expectAccepted(
      client,
      `insert into public.jersey_assignments
         (season_membership_id, season_id, kit, number, effective_from, effective_to)
       values ($1, $2, 'blue', 12, '2026-10-08', '2026-12-01')`,
      [base.membershipId, base.seasonId],
    );
    await expectAccepted(
      client,
      `insert into public.jersey_assignments
         (season_membership_id, season_id, kit, number, effective_from)
       values ($1, $2, 'blue', 12, '2026-12-01')`,
      [base.otherMembershipId, base.seasonId],
    );
  });

  it("accepts a waived subscription with its author and reason", async () => {
    // Register D10: waivers are a deliberate club value, not an edge case.
    const type = await one<{ id: string }>(
      client,
      `insert into public.onboarding_item_types (season_id, code, label, is_subscription)
       values ($1, 'subs_paid', 'Subscription paid', true) returning id`,
      [base.seasonId],
    );
    await expectAccepted(
      client,
      `insert into public.onboarding_items
         (season_membership_id, season_id, item_type_id, status, waived_reason, waived_by_person_id)
       values ($1, $2, $3, 'waived', 'Hardship waiver agreed by the committee', $4)`,
      [base.membershipId, base.seasonId, type.id, base.personId],
    );
  });
});

describe("events as the club actually schedules them", () => {
  it("accepts an approved fixture with a date and nothing else", async () => {
    // SDA §5.6: eight of eleven scheduled fixtures currently have a confirmed
    // date and null opponent, venue and time. First-class, not an error state.
    await expectAccepted(
      client,
      `insert into public.events
         (season_id, name, event_type, origin, status, scheduled_on,
          audience_confirmed_at, audience_confirmed_by_person_id, approved_at, approved_by_person_id)
       values ($1, 'BUCS fixture — TBC', 'fixture', 'externally_assigned', 'approved', '2026-11-08',
               now(), $2, now(), $2)`,
      [base.seasonId, base.personId],
    );
  });

  it("accepts two — and three — events on one date", async () => {
    // Invariant E4. Two events on one day is normal here, not an edge case.
    await expectAccepted(
      client,
      `insert into public.events
         (season_id, name, event_type, status, scheduled_on,
          audience_confirmed_at, audience_confirmed_by_person_id, approved_at, approved_by_person_id)
       values ($1, 'Chalk', 'chalk', 'approved', '2026-11-04', now(), $2, now(), $2),
              ($1, 'S&C', 'strength_and_conditioning', 'approved', '2026-11-04', now(), $2, now(), $2),
              ($1, 'Social', 'social', 'approved', '2026-11-04', now(), $2, now(), $2)`,
      [base.seasonId, base.personId],
    );
  });

  it("accepts a rejected candidate beside an approved sibling in one alternative group", async () => {
    // Invariant E3 bounds approvals, not candidates. Register D6: the losing
    // candidate is rejected, and both are retained as history.
    const group = await one<{ id: string }>(
      client,
      "insert into public.alternative_groups (season_id, label) values ($1, 'Crewdate slot') returning id",
      [base.seasonId],
    );
    await expectAccepted(
      client,
      `insert into public.events
         (season_id, alternative_group_id, name, event_type, status, scheduled_on,
          audience_confirmed_at, audience_confirmed_by_person_id, approved_at, approved_by_person_id)
       values ($1, $2, 'Potential Crewdate A', 'social', 'approved', '2026-11-05', now(), $3, now(), $3)`,
      [base.seasonId, group.id, base.personId],
    );
    await expectAccepted(
      client,
      `insert into public.events
         (season_id, alternative_group_id, name, event_type, status, scheduled_on, decision_reason)
       values ($1, $2, 'Potential Crewdate B', 'social', 'rejected', '2026-11-06', 'A was taken instead')`,
      [base.seasonId, group.id],
    );
  });

  it("accepts a schedule change recording what the league moved", async () => {
    await expectAccepted(
      client,
      `insert into public.schedule_changes
         (event_id, source, reason, previous_scheduled_on, new_scheduled_on, recorded_by_person_id)
       values ($1, 'league', 'BUCS reallocated the date', '2026-11-04', '2026-11-11', $2)`,
      [base.approvedEventId, base.personId],
    );
  });
});

describe("participation as it really happens", () => {
  it("accepts attendance with no invitation and no RSVP — the walk-up", async () => {
    // Invariant P6. "Said no but showed up" was called out by Stewart on 8/7.
    await expectAccepted(
      client,
      `insert into public.attendance_records
         (event_id, event_status, season_id, capacity, season_membership_id, presence)
       values ($1, 'occurred', $2, 'player', $3, 'present')`,
      [base.occurredEventId, base.seasonId, base.otherMembershipId],
    );
  });

  it("accepts a changed answer, and keeps the superseded one", async () => {
    await expectAccepted(
      client,
      `insert into public.rsvp_responses (invitation_id, response, source, responded_at)
       values ($1, 'yes', 'signed_link', '2026-11-01T10:00:00Z')`,
      [base.invitationId],
    );
    await expectAccepted(
      client,
      `insert into public.rsvp_responses (invitation_id, response, reason, source, responded_at)
       values ($1, 'no', 'Clash came up', 'signed_link', '2026-11-02T10:00:00Z')`,
      [base.invitationId],
    );

    const history = await client.query(
      "select response from public.rsvp_responses where invitation_id = $1 order by responded_at",
      [base.invitationId],
    );
    expect(history.rows.map((r) => r.response)).toEqual(["yes", "no"]);

    const current = await one<{ response: string }>(
      client,
      "select response from public.current_rsvp where invitation_id = $1",
      [base.invitationId],
    );
    expect(current.response).toBe("no");
  });

  it("accepts an inbound 'unsure' as a non-acceptance carrying its raw text", async () => {
    // Register D2 as revised by review F01: the domain value stays binary and
    // the historical vocabulary survives as evidence.
    await expectAccepted(
      client,
      `insert into public.rsvp_responses (invitation_id, response, reason, raw_capture, source, responded_at)
       values ($1, 'no', 'Recorded as unsure on the channel', 'Unsure', 'channel_reply', now())`,
      [base.invitationId],
    );

    const stored = await one<{ response: string; raw_capture: string }>(
      client,
      "select response, raw_capture from public.rsvp_responses where invitation_id = $1",
      [base.invitationId],
    );
    expect(stored.response).toBe("no");
    expect(stored.raw_capture).toBe("Unsure");
  });

  it("keeps invitations and responses when the event is cancelled", async () => {
    // Register D5: responses are preserved forever; deletion saves nothing.
    await client.query(
      `insert into public.rsvp_responses (invitation_id, response, source, responded_at)
       values ($1, 'yes', 'signed_link', now())`,
      [base.invitationId],
    );

    await expectAccepted(
      client,
      "update public.events set status = 'cancelled', decision_reason = 'Pitch unavailable' where id = $1",
      [base.approvedEventId],
    );

    const surviving = await one<{ invitations: string; responses: string }>(
      client,
      `select
         (select count(*) from public.invitations where event_id = $1) as invitations,
         (select count(*) from public.rsvp_responses r
            join public.invitations i on i.id = r.invitation_id where i.event_id = $1) as responses`,
      [base.approvedEventId],
    );
    expect(Number(surviving.invitations)).toBe(1);
    expect(Number(surviving.responses)).toBe(1);

    // The cascading composite foreign key kept the invitation's copy honest.
    const invitation = await one<{ event_status: string }>(
      client,
      "select event_status from public.invitations where id = $1",
      [base.invitationId],
    );
    expect(invitation.event_status).toBe("cancelled");
  });

  it("accepts a coach answering only the questions that apply to them", async () => {
    // Null means "not applicable to this invitee type", never "no answer".
    const question = await one<{ id: string }>(
      client,
      `insert into public.event_questions (event_id, prompt, answer_type, applies_to_capacities)
       values ($1, 'Transport to Brackenridge?', 'boolean', '{player,coach}') returning id`,
      [base.approvedEventId],
    );
    const coachMember = await confirmAudienceMember(
      client,
      { eventId: base.approvedEventId, seasonId: base.seasonId },
      { capacity: "coach", personId: base.otherPersonId },
    );
    const coachInvitation = await one<{ id: string }>(
      client,
      `insert into public.invitations
         (event_id, event_status, solicits_response, season_id, audience_member_id,
          capacity, person_id, status)
       values ($1, 'approved', true, $2, $3, 'coach', $4, 'issued') returning id`,
      [base.approvedEventId, base.seasonId, coachMember, base.otherPersonId],
    );

    await expectAccepted(
      client,
      `insert into public.question_responses
         (invitation_id, event_id, event_question_id, answer_boolean)
       values ($1, $2, $3, true)`,
      [coachInvitation.id, base.approvedEventId, question.id],
    );
  });
});

describe("season rollover", () => {
  it("carries a membership forward without duplicating the Person", async () => {
    // Requirement 3 / model §3. Nothing is copied except the link.
    const returner = await one<{ id: string }>(
      client,
      "insert into public.people (given_name, family_name) values ('Fixture', 'Returner') returning id",
    );
    const previous = await one<{ id: string }>(
      client,
      `insert into public.season_memberships (person_id, season_id, status, entry)
       values ($1, $2, 'archived', 'new') returning id`,
      [returner.id, base.otherSeasonId],
    );

    await expectAccepted(
      client,
      `insert into public.season_memberships (person_id, season_id, status, entry, carried_forward_from_id)
       values ($1, $2, 'carried_forward', 'returning', $3)`,
      [returner.id, base.seasonId, previous.id],
    );

    const people = await one<{ count: string }>(
      client,
      "select count(*) as count from public.people where id = $1",
      [returner.id],
    );
    expect(Number(people.count)).toBe(1);
  });

  it("refuses to carry a membership forward onto a different person", async () => {
    const returner = await one<{ id: string }>(
      client,
      "insert into public.people (given_name, family_name) values ('Fixture', 'Returner') returning id",
    );
    const previous = await one<{ id: string }>(
      client,
      `insert into public.season_memberships (person_id, season_id, status, entry)
       values ($1, $2, 'archived', 'new') returning id`,
      [returner.id, base.otherSeasonId],
    );

    let rejected = false;
    await client.query("savepoint attempt");
    try {
      await client.query(
        `insert into public.season_memberships (person_id, season_id, status, entry, carried_forward_from_id)
         values ($1, $2, 'carried_forward', 'returning', $3)`,
        [base.personId, base.otherSeasonId, previous.id],
      );
    } catch {
      rejected = true;
    }
    await client.query("rollback to savepoint attempt");
    expect(rejected, "a membership was carried forward onto the wrong Person").toBe(true);
  });

  it("keeps last season's roster intact while this season's differs", async () => {
    const archived = await one<{ count: string }>(
      client,
      "select count(*) as count from public.season_memberships where season_id = $1",
      [base.otherSeasonId],
    );
    await client.query(
      `insert into public.season_memberships (person_id, season_id, status, entry)
       values ($1, $2, 'confirmed', 'new')`,
      [base.personId, base.otherSeasonId],
    );

    const after = await one<{ count: string }>(
      client,
      "select count(*) as count from public.season_memberships where season_id = $1",
      [base.seasonId],
    );
    expect(Number(after.count)).toBe(2);
    expect(Number(archived.count)).toBe(0);
  });
});

describe("derived current-state views", () => {
  it("derives availability from the append-only history without a cached column", async () => {
    for (const [level, from, confirmer] of [
      ["orange", "2026-10-18", null],
      ["red", "2026-10-28", null],
      ["green", "2026-11-15", base.personId],
    ] as const) {
      await client.query(
        `insert into public.availability_statuses
           (season_membership_id, level, effective_from, reported_by_person_id, confirmed_by_person_id)
         values ($1, $2, $3, $4, $5)`,
        [base.membershipId, level, from, base.personId, confirmer],
      );
    }

    const current = await one<{ level: string; confirmed_by_person_id: string }>(
      client,
      "select level, confirmed_by_person_id from public.current_availability where season_membership_id = $1",
      [base.membershipId],
    );
    expect(current.level).toBe("green");
    expect(current.confirmed_by_person_id).toBe(base.personId);

    const history = await one<{ count: string }>(
      client,
      "select count(*) as count from public.availability_statuses where season_membership_id = $1",
      [base.membershipId],
    );
    expect(Number(history.count), "history was destroyed by a current-state change").toBe(3);
  });

  it("reports constitutional membership separately from operational readiness", async () => {
    // Invariant I5. Subs are not a gate on `active`, and a waiver is shown as
    // its own fact rather than counted as payment.
    const type = await one<{ id: string }>(
      client,
      `insert into public.onboarding_item_types (season_id, code, label, is_subscription)
       values ($1, 'subs_paid', 'Subscription paid', true) returning id`,
      [base.seasonId],
    );
    await client.query(
      `insert into public.onboarding_items (season_membership_id, season_id, item_type_id, status, waived_reason, waived_by_person_id)
       values ($1, $2, $3, 'waived', 'Hardship waiver', $4)`,
      [base.membershipId, base.seasonId, type.id, base.personId],
    );

    const derived = await one<{
      is_operationally_ready: boolean;
      is_constitutional_member: boolean;
      subscription_waived: boolean;
    }>(
      client,
      `select is_operationally_ready, is_constitutional_member, subscription_waived
         from public.constitutional_membership where season_membership_id = $1`,
      [base.membershipId],
    );

    expect(derived.is_operationally_ready).toBe(true);
    expect(derived.subscription_waived).toBe(true);
    expect(derived.is_constitutional_member).toBe(false);
  });

  it("partitions invitations into the five states invariant P7 names", async () => {
    const state = await one<{ response_state: string }>(
      client,
      "select response_state from public.invitation_response_state where invitation_id = $1",
      [base.invitationId],
    );
    expect(state.response_state).toBe("awaiting_response");

    await client.query(
      `insert into public.rsvp_responses (invitation_id, response, reason, source, responded_at)
       values ($1, 'no', 'Tutorial clash', 'signed_link', now())`,
      [base.invitationId],
    );

    const answered = await one<{ response_state: string }>(
      client,
      "select response_state from public.invitation_response_state where invitation_id = $1",
      [base.invitationId],
    );
    expect(answered.response_state).toBe("responded_no");
  });

  it("excludes non-soliciting events from the response and nonresponse streams", async () => {
    // Invariant E6: an informational event never pollutes the escalation queue.
    const informational = await one<{ id: string }>(
      client,
      `insert into public.events
         (season_id, name, event_type, status, scheduled_on, solicits_response,
          audience_confirmed_at, audience_confirmed_by_person_id, approved_at, approved_by_person_id)
       values ($1, 'AGM', 'meeting', 'approved', '2027-06-09', false, now(), $2, now(), $2) returning id`,
      [base.seasonId, base.personId],
    );
    const member = await confirmAudienceMember(
      client,
      { eventId: informational.id, seasonId: base.seasonId },
      { capacity: "player", membershipId: base.membershipId },
    );
    await client.query(
      `insert into public.invitations
         (event_id, event_status, solicits_response, season_id, audience_member_id,
          capacity, season_membership_id, status)
       values ($1, 'approved', false, $2, $3, 'player', $4, 'issued')`,
      [informational.id, base.seasonId, member, base.membershipId],
    );

    const inStream = await one<{ count: string }>(
      client,
      "select count(*) as count from public.invitation_response_state where event_id = $1",
      [informational.id],
    );
    const inQueue = await one<{ count: string }>(
      client,
      "select count(*) as count from public.nonresponse_queue where event_id = $1",
      [informational.id],
    );
    expect(Number(inStream.count)).toBe(0);
    expect(Number(inQueue.count)).toBe(0);
  });

  it("computes RSVP-versus-attendance mismatches rather than reconciling them", async () => {
    // Requirement 7: flagged, never silently reconciled.
    const member = await confirmAudienceMember(
      client,
      { eventId: base.occurredEventId, seasonId: base.seasonId },
      { capacity: "player", membershipId: base.membershipId },
    );
    const invitation = await one<{ id: string }>(
      client,
      `insert into public.invitations
         (event_id, event_status, solicits_response, season_id, audience_member_id,
          capacity, season_membership_id, status)
       values ($1, 'occurred', true, $2, $3, 'player', $4, 'responded') returning id`,
      [base.occurredEventId, base.seasonId, member, base.membershipId],
    );
    await client.query(
      `insert into public.rsvp_responses (invitation_id, response, reason, source, responded_at)
       values ($1, 'no', 'Away that weekend', 'signed_link', now())`,
      [invitation.id],
    );
    await client.query(
      `insert into public.attendance_records
         (event_id, event_status, season_id, capacity, season_membership_id, presence)
       values ($1, 'occurred', $2, 'player', $3, 'present')`,
      [base.occurredEventId, base.seasonId, base.membershipId],
    );

    const mismatch = await one<{ mismatch: string }>(
      client,
      "select mismatch from public.rsvp_attendance_mismatches where event_id = $1",
      [base.occurredEventId],
    );
    expect(mismatch.mismatch).toBe("said_no_but_attended");
  });
});
