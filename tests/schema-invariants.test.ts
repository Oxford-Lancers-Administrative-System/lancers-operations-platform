// @vitest-environment node
/**
 * Proves that the frozen domain model's invariants are enforced by PostgreSQL,
 * not merely documented.
 *
 * Each test names the invariant it covers using the identifiers from the frozen
 * model §4 (I·, P·, S·, E·, A·, M·). The mapping from invariant to enforcement
 * layer — and the reasons some invariants are deliberately left to the
 * TypeScript service layer instead — is in docs/architecture/data-model.md.
 *
 * The complementary half of the suite is tests/schema-accepts.test.ts: a schema
 * that rejects everything would pass every test below and be useless.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  confirmAudienceMember,
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

describe("identity (I1–I6)", () => {
  it("I2 — refuses a second membership for one person in one season", async () => {
    await expectRejected(
      client,
      `insert into public.season_memberships (person_id, season_id, status, entry)
       values ($1, $2, 'confirmed', 'new')`,
      [base.personId, base.seasonId],
      "season_memberships_one_per_person_per_season",
    );
  });

  it("I3 — refuses two concurrent holders of one constitutional Office", async () => {
    await client.query(
      `insert into public.role_assignments
         (person_id, role_id, scope, is_constitutional_office, committee_year_id, effective_from)
       values ($1, $2, 'committee_year', true, $3, '2019-06-01')`,
      [base.personId, base.officeRoleId, base.committeeYearId],
    );

    await expectRejected(
      client,
      `insert into public.role_assignments
         (person_id, role_id, scope, is_constitutional_office, committee_year_id, effective_from)
       values ($1, $2, 'committee_year', true, $3, '2019-09-01')`,
      [base.otherPersonId, base.officeRoleId, base.committeeYearId],
      "role_assignments_one_holder_per_office",
    );
  });

  it("I3 — refuses one person holding two Offices at the same time", async () => {
    const secondOffice = await one<{ id: string }>(
      client,
      `insert into public.roles (code, name, scope, is_constitutional_office, role_group_id, sort_order)
       values ('fixture_treasurer', 'Fixture Treasurer', 'committee_year', true, $1, 5) returning id`,
      [base.roleGroupId],
    );

    await client.query(
      `insert into public.role_assignments
         (person_id, role_id, scope, is_constitutional_office, committee_year_id, effective_from)
       values ($1, $2, 'committee_year', true, $3, '2019-06-01')`,
      [base.personId, base.officeRoleId, base.committeeYearId],
    );

    await expectRejected(
      client,
      `insert into public.role_assignments
         (person_id, role_id, scope, is_constitutional_office, committee_year_id, effective_from)
       values ($1, $2, 'committee_year', true, $3, '2019-09-01')`,
      [base.personId, secondOffice.id, base.committeeYearId],
      "role_assignments_one_office_per_person",
    );
  });

  it("refuses two concurrent holders of a seat that is single-holder by decision", async () => {
    // LAN-128. General Manager's shape: single-holder, but not a constitutional
    // Office — so the Office exclusion constraint does not reach it and its own
    // does. The refusal names which of the two rules produced it, which is the
    // whole reason they are separate.
    await client.query(
      `insert into public.role_assignments
         (person_id, role_id, scope, is_constitutional_office, is_single_holder_seat,
          committee_year_id, effective_from)
       values ($1, $2, 'committee_year', false, true, $3, '2019-06-01')`,
      [base.personId, base.singleHolderRoleId, base.committeeYearId],
    );

    await expectRejected(
      client,
      `insert into public.role_assignments
         (person_id, role_id, scope, is_constitutional_office, is_single_holder_seat,
          committee_year_id, effective_from)
       values ($1, $2, 'committee_year', false, true, $3, '2019-09-01')`,
      [base.otherPersonId, base.singleHolderRoleId, base.committeeYearId],
      "role_assignments_one_holder_per_single_holder_seat",
    );
  });

  it("refuses an assignment that disagrees with the seat about cardinality", async () => {
    // The exclusion constraint above is only as good as the denormalised flag
    // it filters on, so the flag is not the writer's to choose: claiming the
    // single-holder seat is not single-holder is how a second holder would be
    // slipped past it, and the composite foreign key refuses exactly that.
    await expectRejected(
      client,
      `insert into public.role_assignments
         (person_id, role_id, scope, is_constitutional_office, is_single_holder_seat,
          committee_year_id, effective_from)
       values ($1, $2, 'committee_year', false, false, $3, '2019-06-01')`,
      [base.personId, base.singleHolderRoleId, base.committeeYearId],
      "role_assignments_agree_with_single_holder_rule",
    );

    // And the reverse: an ordinary seat cannot be dressed up as single-holder.
    await expectRejected(
      client,
      `insert into public.role_assignments
         (person_id, role_id, scope, is_constitutional_office, is_single_holder_seat,
          committee_year_id, effective_from)
       values ($1, $2, 'committee_year', false, true, $3, '2019-06-01')`,
      [base.personId, base.ordinaryRoleId, base.committeeYearId],
      "role_assignments_agree_with_single_holder_rule",
    );
  });

  it("refuses a seat that claims both single-holder rules at once", async () => {
    // `is_constitutional_office` and `is_single_holder_seat` carry different
    // authorities and must stay disjoint, or the two exclusion constraints
    // overlap and a refusal stops naming the rule that produced it.
    await expectRejected(
      client,
      `insert into public.roles
         (code, name, scope, is_constitutional_office, is_single_holder_seat,
          role_group_id, sort_order)
       values ('fixture_both', 'Fixture Both', 'committee_year', true, true, $1, 6)`,
      [base.roleGroupId],
      "roles_single_holder_seat_is_not_an_office",
    );
  });

  it("F07 — refuses a role assignment scoped to both cycles, or to neither", async () => {
    await expectRejected(
      client,
      `insert into public.role_assignments
         (person_id, role_id, scope, is_constitutional_office, committee_year_id, season_id, effective_from)
       values ($1, $2, 'committee_year', false, $3, $4, '2019-06-01')`,
      [base.personId, base.ordinaryRoleId, base.committeeYearId, base.seasonId],
      "role_assignments_exactly_one_scope",
    );

    await expectRejected(
      client,
      `insert into public.role_assignments
         (person_id, role_id, scope, is_constitutional_office, effective_from)
       values ($1, $2, 'committee_year', false, '2019-06-01')`,
      [base.personId, base.ordinaryRoleId],
      "role_assignments_exactly_one_scope",
    );
  });

  it("F07 — refuses a committee-scoped role assigned against a season", async () => {
    await expectRejected(
      client,
      `insert into public.role_assignments
         (person_id, role_id, scope, is_constitutional_office, season_id, effective_from)
       values ($1, $2, 'season', false, $3, '2019-09-01')`,
      [base.personId, base.ordinaryRoleId, base.seasonId],
      "role_assignments_agree_with_role",
    );
  });

  it("I6 — refuses a person merge that is not fully audited", async () => {
    await expectRejected(
      client,
      "update public.people set merged_into_person_id = $2 where id = $1",
      [base.personId, base.otherPersonId],
      "people_merge_is_fully_audited",
    );
  });
});

describe("participation (P1–P8)", () => {
  it("P1 — refuses an invitation to a draft event", async () => {
    // A draft may carry a proposed audience — that is what the approver
    // reviews. It may not carry an invitation.
    const member = await confirmAudienceMember(
      client,
      { eventId: base.draftEventId, seasonId: base.seasonId },
      { capacity: "player", membershipId: base.membershipId },
    );

    await expectRejected(
      client,
      `insert into public.invitations
         (event_id, event_status, solicits_response, season_id, audience_member_id,
          capacity, season_membership_id)
       values ($1, 'draft', true, $2, $3, 'player', $4)`,
      [base.draftEventId, base.seasonId, member, base.membershipId],
      "invitations_require_an_approved_event",
    );
  });

  it("P1 — refuses an invitation that lies about its event's status", async () => {
    const member = await confirmAudienceMember(
      client,
      { eventId: base.draftEventId, seasonId: base.seasonId },
      { capacity: "player", membershipId: base.otherMembershipId },
    );

    await expectRejected(
      client,
      `insert into public.invitations
         (event_id, event_status, solicits_response, season_id, audience_member_id,
          capacity, season_membership_id)
       values ($1, 'approved', true, $2, $3, 'player', $4)`,
      [base.draftEventId, base.seasonId, member, base.otherMembershipId],
      "invitations_event_state_is_current",
    );
  });

  it("P2 — refuses an RSVP against a foreign key that does not exist", async () => {
    await expectRejected(
      client,
      `insert into public.rsvp_responses (invitation_id, response, source, responded_at)
       values ('00000000-0000-4000-8000-000000000000', 'yes', 'operator', now())`,
      [],
      "rsvp_responses_invitation_id_fkey",
    );
  });

  it("P3 — refuses a non-acceptance with no reason", async () => {
    await expectRejected(
      client,
      `insert into public.rsvp_responses (invitation_id, response, source, responded_at)
       values ($1, 'no', 'operator', now())`,
      [base.invitationId],
      "rsvp_responses_no_requires_a_reason",
    );

    await expectRejected(
      client,
      `insert into public.rsvp_responses (invitation_id, response, reason, source, responded_at)
       values ($1, 'no', '   ', 'operator', now())`,
      [base.invitationId],
      "rsvp_responses_no_requires_a_reason",
    );
  });

  it("Requirement 5 — refuses any RSVP value outside the binary domain", async () => {
    await expectRejected(
      client,
      `insert into public.rsvp_responses (invitation_id, response, reason, source, responded_at)
       values ($1, 'unsure', 'maybe', 'channel_reply', now())`,
      [base.invitationId],
      /invalid input value for enum/,
    );
  });

  it("P5 — refuses attendance against an event that has not occurred", async () => {
    for (const status of ["approved", "cancelled", "not_held"]) {
      await expectRejected(
        client,
        `insert into public.attendance_records
           (event_id, event_status, season_id, capacity, season_membership_id, presence)
         values ($1, $4, $2, 'player', $3, 'present')`,
        [base.approvedEventId, base.seasonId, base.membershipId, status],
      );
    }
  });

  it("P5 — refuses moving an event out of `occurred` while attendance exists", async () => {
    await client.query(
      `insert into public.attendance_records
         (event_id, event_status, season_id, capacity, season_membership_id, presence)
       values ($1, 'occurred', $2, 'player', $3, 'present')`,
      [base.occurredEventId, base.seasonId, base.membershipId],
    );

    // The cascading composite foreign key rewrites the child's copy of the
    // status, which then fails its own check. The correction has to deal with
    // the attendance first — which is the point.
    await expectRejected(
      client,
      "update public.events set status = 'not_held' where id = $1",
      [base.occurredEventId],
      "attendance_records_require_an_occurred_event",
    );
  });

  it("P8 — refuses a participation record anchored to both a membership and a person", async () => {
    const member = await confirmAudienceMember(
      client,
      { eventId: base.approvedEventId, seasonId: base.seasonId },
      { capacity: "player", membershipId: base.otherMembershipId },
    );

    await expectRejected(
      client,
      `insert into public.invitations
         (event_id, event_status, solicits_response, season_id, audience_member_id,
          capacity, season_membership_id, person_id)
       values ($1, 'approved', true, $2, $3, 'player', $4, $5)`,
      [base.approvedEventId, base.seasonId, member, base.otherMembershipId, base.personId],
      "invitations_anchor_matches_capacity",
    );

    // The same rule guards the audience itself.
    await expectRejected(
      client,
      `insert into public.event_audience_members
         (event_id, season_id, capacity, season_membership_id, person_id)
       values ($1, $2, 'player', $3, $4)`,
      [base.approvedEventId, base.seasonId, base.otherMembershipId, base.personId],
      "event_audience_members_anchor_matches_capacity",
    );
  });

  it("P8 — refuses a coach-capacity invitation anchored to a season membership", async () => {
    const member = await confirmAudienceMember(
      client,
      { eventId: base.approvedEventId, seasonId: base.seasonId },
      { capacity: "player", membershipId: base.otherMembershipId },
    );

    await expectRejected(
      client,
      `insert into public.invitations
         (event_id, event_status, solicits_response, season_id, audience_member_id,
          capacity, season_membership_id)
       values ($1, 'approved', true, $2, $3, 'coach', $4)`,
      [base.approvedEventId, base.seasonId, member, base.otherMembershipId],
      "invitations_anchor_matches_capacity",
    );
  });

  it("refuses a participation record whose membership belongs to a different season", async () => {
    const foreign = await one<{ id: string }>(
      client,
      `insert into public.season_memberships (person_id, season_id, status, entry)
       values ($1, $2, 'confirmed', 'new') returning id`,
      [base.personId, base.otherSeasonId],
    );

    // The audience is now the first gate: a member of another season's roster
    // cannot be confirmed for this season's event at all.
    await expectRejected(
      client,
      `insert into public.event_audience_members
         (event_id, season_id, capacity, season_membership_id)
       values ($1, $2, 'player', $3)`,
      [base.approvedEventId, base.seasonId, foreign.id],
      "event_audience_members_membership_same_season",
    );

    // And the invitation carries the same rule independently.
    await expectRejected(
      client,
      `insert into public.invitations
         (event_id, event_status, solicits_response, season_id, audience_member_id,
          capacity, season_membership_id)
       values ($1, 'approved', true, $2, $3, 'player', $4)`,
      [base.approvedEventId, base.seasonId, base.audienceMemberId, foreign.id],
      "invitations_membership_same_season",
    );
  });

  it("refuses two invitations for one invitee to one event", async () => {
    await expectRejected(
      client,
      `insert into public.invitations
         (event_id, event_status, solicits_response, season_id, audience_member_id,
          capacity, season_membership_id)
       values ($1, 'approved', true, $2, $3, 'player', $4)`,
      [base.approvedEventId, base.seasonId, base.audienceMemberId, base.membershipId],
      "invitations_one_per_player_per_event",
    );
  });
});

describe("squad structure (S1–S4)", () => {
  it("S1 — refuses two concurrent assignments in one position slot", async () => {
    const second = await one<{ id: string }>(
      client,
      `insert into public.positions (vocabulary_id, code, label, side)
       values ($1, 'TE', 'Tight End', 'offence') returning id`,
      [base.vocabularyId],
    );

    await client.query(
      `insert into public.position_assignments
         (season_membership_id, season_id, position_vocabulary_id, position_id, side, slot, effective_from)
       values ($1, $2, $3, $4, 'offence', 'offence', '2026-09-27')`,
      [base.membershipId, base.seasonId, base.vocabularyId, base.offencePositionId],
    );

    await expectRejected(
      client,
      `insert into public.position_assignments
         (season_membership_id, season_id, position_vocabulary_id, position_id, side, slot, effective_from)
       values ($1, $2, $3, $4, 'offence', 'offence', '2026-10-01')`,
      [base.membershipId, base.seasonId, base.vocabularyId, second.id],
      "position_assignments_one_per_slot",
    );
  });

  it("S1 — refuses a defence position placed in the offence slot", async () => {
    await expectRejected(
      client,
      `insert into public.position_assignments
         (season_membership_id, season_id, position_vocabulary_id, position_id, side, slot, effective_from)
       values ($1, $2, $3, $4, 'defence', 'offence', '2026-09-27')`,
      [base.membershipId, base.seasonId, base.vocabularyId, base.defencePositionId],
      "position_assignments_slot_matches_side",
    );
  });

  it("S3 — refuses a position drawn from a vocabulary that is not the season's", async () => {
    await expectRejected(
      client,
      `insert into public.position_assignments
         (season_membership_id, season_id, position_vocabulary_id, position_id, side, slot, effective_from)
       values ($1, $2, $3, $4, 'offence', 'offence', '2026-09-27')`,
      [base.membershipId, base.seasonId, base.otherVocabularyId, base.otherVocabularyPositionId],
      "position_assignments_vocabulary_is_the_seasons",
    );
  });

  it("S2 — refuses two live holders of one jersey number within a season and kit", async () => {
    await client.query(
      `insert into public.jersey_assignments
         (season_membership_id, season_id, kit, number, is_predominant, effective_from)
       values ($1, $2, 'blue', 12, true, '2026-10-08')`,
      [base.membershipId, base.seasonId],
    );

    await expectRejected(
      client,
      `insert into public.jersey_assignments
         (season_membership_id, season_id, kit, number, is_predominant, effective_from)
       values ($1, $2, 'blue', 12, true, '2026-10-08')`,
      [base.otherMembershipId, base.seasonId],
      "jersey_assignments_unique_within_season_and_kit",
    );
  });

  it("refuses a jersey number outside 1–99", async () => {
    await expectRejected(
      client,
      `insert into public.jersey_assignments
         (season_membership_id, season_id, kit, number, effective_from)
       values ($1, $2, 'blue', 0, '2026-10-08')`,
      [base.membershipId, base.seasonId],
      "jersey_assignments_number_range",
    );
  });

  it("I4 — refuses two overlapping eligibility records for one competition", async () => {
    await client.query(
      `insert into public.eligibility_records
         (season_membership_id, season_id, competition, status, determining_authority, checked_at, effective_from)
       values ($1, $2, 'bucs', 'eligible', 'BUCS Play', now(), '2026-09-27')`,
      [base.membershipId, base.seasonId],
    );

    await expectRejected(
      client,
      `insert into public.eligibility_records
         (season_membership_id, season_id, competition, status, determining_authority, checked_at, effective_from)
       values ($1, $2, 'bucs', 'ineligible', 'BUCS Play', now(), '2026-11-01')`,
      [base.membershipId, base.seasonId],
      "eligibility_records_one_per_competition",
    );
  });
});

describe("events (E1–E6)", () => {
  it("E1 — refuses approval without a date", async () => {
    await expectRejected(
      client,
      `insert into public.events
         (season_id, name, event_type, status, audience_confirmed_at, audience_confirmed_by_person_id,
          approved_at, approved_by_person_id)
       values ($1, 'No date', 'practice', 'approved', now(), $2, now(), $2)`,
      [base.seasonId, base.personId],
      "events_approval_requires_date_and_audience",
    );
  });

  it("E1 — refuses approval without an explicitly confirmed audience", async () => {
    // Review F11: a missing audience must be an approval error, never a mass
    // send to the whole roster.
    await expectRejected(
      client,
      `insert into public.events
         (season_id, name, event_type, status, scheduled_on, approved_at, approved_by_person_id)
       values ($1, 'No audience', 'practice', 'approved', '2026-11-04', now(), $2)`,
      [base.seasonId, base.personId],
      "events_approval_requires_date_and_audience",
    );
  });

  it("E3 — refuses a second approval within one alternative group", async () => {
    const group = await one<{ id: string }>(
      client,
      `insert into public.alternative_groups (season_id, label) values ($1, 'Fixture group') returning id`,
      [base.seasonId],
    );

    await client.query(
      `insert into public.events
         (season_id, alternative_group_id, name, event_type, status, scheduled_on,
          audience_confirmed_at, audience_confirmed_by_person_id, approved_at, approved_by_person_id)
       values ($1, $2, 'Candidate A', 'social', 'approved', '2026-11-05', now(), $3, now(), $3)`,
      [base.seasonId, group.id, base.personId],
    );

    await expectRejected(
      client,
      `insert into public.events
         (season_id, alternative_group_id, name, event_type, status, scheduled_on,
          audience_confirmed_at, audience_confirmed_by_person_id, approved_at, approved_by_person_id)
       values ($1, $2, 'Candidate B', 'social', 'approved', '2026-11-06', now(), $3, now(), $3)`,
      [base.seasonId, group.id, base.personId],
      "events_one_approved_per_alternative_group",
    );
  });

  it("E5 — refuses an occurrence that nobody asserted", async () => {
    await expectRejected(
      client,
      `insert into public.events
         (season_id, name, event_type, status, scheduled_on,
          audience_confirmed_at, audience_confirmed_by_person_id, approved_at, approved_by_person_id)
       values ($1, 'Assumed to have happened', 'practice', 'occurred', '2026-10-14', now(), $2, now(), $2)`,
      [base.seasonId, base.personId],
      "events_outcome_is_asserted",
    );
  });

  it("E6 — refuses a response deadline on an event that solicits no response", async () => {
    await expectRejected(
      client,
      `insert into public.events
         (season_id, name, event_type, status, scheduled_on, solicits_response, response_deadline_at,
          audience_confirmed_at, audience_confirmed_by_person_id, approved_at, approved_by_person_id)
       values ($1, 'Calendar only', 'meeting', 'approved', '2027-06-09', false, now(), now(), $2, now(), $2)`,
      [base.seasonId, base.personId],
      "events_no_obligation_without_solicitation",
    );
  });

  it("E6 — refuses an invitation expiring on an event that asked nothing", async () => {
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

    await expectRejected(
      client,
      `insert into public.invitations
         (event_id, event_status, solicits_response, season_id, audience_member_id,
          capacity, season_membership_id, status)
       values ($1, 'approved', false, $2, $3, 'player', $4, 'expired')`,
      [informational.id, base.seasonId, member, base.membershipId],
      "invitations_expire_only_when_asked",
    );
  });

  it("refuses a cancellation with no stated reason", async () => {
    await expectRejected(
      client,
      "update public.events set status = 'cancelled' where id = $1",
      [base.approvedEventId],
      "events_negative_decisions_are_explained",
    );
  });

  it("refuses an aggregate headcount on anything but a recruitment event", async () => {
    await expectRejected(
      client,
      "update public.events set aggregate_headcount = 30 where id = $1",
      [base.approvedEventId],
      "events_headcount_is_recruitment_only",
    );
  });
});

describe("availability (A1–A3)", () => {
  it("A3 — refuses a return to green with no confirmer", async () => {
    await expectRejected(
      client,
      `insert into public.availability_statuses
         (season_membership_id, level, effective_from, reported_by_person_id)
       values ($1, 'green', '2026-11-01', $2)`,
      [base.membershipId, base.personId],
      "availability_statuses_green_records_its_confirmer",
    );
  });

  it("A2 — has no column capable of holding a diagnosis, treatment or narrative", async () => {
    const { rows } = await client.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'availability_statuses'`,
    );
    const columns = rows.map((r) => r.column_name).sort();

    // Requirement 8 is satisfied structurally: the permitted field set is the
    // whole table definition. A free-text note remains contingent on the
    // pending Oxford / Sports Federation privacy answer (review F10).
    expect(columns).toEqual([
      "confirmed_by_person_id",
      "effective_from",
      "id",
      "level",
      "recorded_at",
      "reported_by_person_id",
      "review_on",
      "season_membership_id",
    ]);
  });
});

describe("machinery (M1–M5)", () => {
  it("M1 — refuses a duplicate notification idempotency key", async () => {
    await client.query(
      `insert into public.notification_jobs (idempotency_key, job_type, invitation_id)
       values ('fixture-key', 'invitation', $1)`,
      [base.invitationId],
    );

    await expectRejected(
      client,
      `insert into public.notification_jobs (idempotency_key, job_type, invitation_id)
       values ('fixture-key', 'reminder', $1)`,
      [base.invitationId],
      "notification_jobs_idempotency_key_unique",
    );
  });

  it("M4 — refuses a seventh notification job state", async () => {
    await expectRejected(
      client,
      `insert into public.notification_jobs (idempotency_key, job_type, status, invitation_id)
       values ('fixture-seventh', 'invitation', 'retrying', $1)`,
      [base.invitationId],
      /invalid input value for enum/,
    );
  });

  it("M5 — refuses a first-version report that claims to supersede something", async () => {
    const report = await one<{ id: string }>(
      client,
      `insert into public.weekly_reports
         (season_id, report_on, metric_definition_version, data_as_of, content)
       values ($1, '2026-11-16', 'master-table-v1', now(), '{}'::jsonb) returning id`,
      [base.seasonId],
    );

    await expectRejected(
      client,
      `insert into public.weekly_reports
         (season_id, report_on, version, supersedes_id, metric_definition_version, data_as_of, content)
       values ($1, '2026-11-23', 1, $2, 'master-table-v1', now(), '{}'::jsonb)`,
      [base.seasonId, report.id],
      "weekly_reports_first_version_supersedes_nothing",
    );
  });

  describe("M5 — supersession stays inside one report series", () => {
    // Correction pass, following independent verification: `supersedes_id` was
    // an unconstrained self reference, so one season's report could supersede
    // an unrelated one while every existing test stayed green. A regeneration
    // must supersede an earlier version of the SAME report — same season, same
    // reporting date.
    it("accepts a regeneration of the same season and date", async () => {
      const first = await one<{ id: string }>(
        client,
        `insert into public.weekly_reports
           (season_id, report_on, metric_definition_version, data_as_of, content)
         values ($1, '2026-11-16', 'master-table-v1', now(), '{}'::jsonb) returning id`,
        [base.seasonId],
      );

      await expectAccepted(
        client,
        `insert into public.weekly_reports
           (season_id, report_on, version, supersedes_id, metric_definition_version, data_as_of, content)
         values ($1, '2026-11-16', 2, $2, 'master-table-v1', now(), '{}'::jsonb)`,
        [base.seasonId, first.id],
      );
    });

    it("refuses a supersession that crosses seasons", async () => {
      const otherSeasonReport = await one<{ id: string }>(
        client,
        `insert into public.weekly_reports
           (season_id, report_on, metric_definition_version, data_as_of, content)
         values ($1, '2026-11-16', 'master-table-v1', now(), '{}'::jsonb) returning id`,
        [base.otherSeasonId],
      );

      await expectRejected(
        client,
        `insert into public.weekly_reports
           (season_id, report_on, version, supersedes_id, metric_definition_version, data_as_of, content)
         values ($1, '2026-11-16', 2, $2, 'master-table-v1', now(), '{}'::jsonb)`,
        [base.seasonId, otherSeasonReport.id],
        "weekly_reports_supersedes_the_same_report",
      );
    });

    it("refuses a supersession that crosses reporting dates", async () => {
      const earlier = await one<{ id: string }>(
        client,
        `insert into public.weekly_reports
           (season_id, report_on, metric_definition_version, data_as_of, content)
         values ($1, '2026-11-16', 'master-table-v1', now(), '{}'::jsonb) returning id`,
        [base.seasonId],
      );

      await expectRejected(
        client,
        `insert into public.weekly_reports
           (season_id, report_on, version, supersedes_id, metric_definition_version, data_as_of, content)
         values ($1, '2026-11-23', 2, $2, 'master-table-v1', now(), '{}'::jsonb)`,
        [base.seasonId, earlier.id],
        "weekly_reports_supersedes_the_same_report",
      );
    });

    it("still refuses two reports superseding the same predecessor", async () => {
      const first = await one<{ id: string }>(
        client,
        `insert into public.weekly_reports
           (season_id, report_on, metric_definition_version, data_as_of, content)
         values ($1, '2026-11-16', 'master-table-v1', now(), '{}'::jsonb) returning id`,
        [base.seasonId],
      );
      await client.query(
        `insert into public.weekly_reports
           (season_id, report_on, version, supersedes_id, metric_definition_version, data_as_of, content)
         values ($1, '2026-11-16', 2, $2, 'master-table-v1', now(), '{}'::jsonb)`,
        [base.seasonId, first.id],
      );

      await expectRejected(
        client,
        `insert into public.weekly_reports
           (season_id, report_on, version, supersedes_id, metric_definition_version, data_as_of, content)
         values ($1, '2026-11-16', 3, $2, 'master-table-v1', now(), '{}'::jsonb)`,
        [base.seasonId, first.id],
        "weekly_reports_one_superseding_row",
      );
    });

    it("keeps the superseded snapshot byte-for-byte — regeneration never rewrites", async () => {
      const first = await one<{ id: string; content: unknown }>(
        client,
        `insert into public.weekly_reports
           (season_id, report_on, metric_definition_version, data_as_of, content)
         values ($1, '2026-11-16', 'master-table-v1', now(), '{"outstanding": 37}'::jsonb)
         returning id, content`,
        [base.seasonId],
      );
      await client.query(
        `insert into public.weekly_reports
           (season_id, report_on, version, supersedes_id, metric_definition_version, data_as_of, content)
         values ($1, '2026-11-16', 2, $2, 'master-table-v1', now(), '{"outstanding": 34}'::jsonb)`,
        [base.seasonId, first.id],
      );

      const original = await one<{ content: { outstanding: number } }>(
        client,
        "select content from public.weekly_reports where id = $1",
        [first.id],
      );
      expect(original.content.outstanding).toBe(37);
    });
  });
});

describe("append-only history is enforced by privilege, not convention", () => {
  // Invariants A1, M2, M5 and P4. The application reaches PostgreSQL as
  // `service_role`; these tables grant it SELECT and INSERT and nothing else,
  // so history cannot be rewritten even by a bug in the service layer.
  const APPEND_ONLY = [
    "availability_statuses",
    "rsvp_responses",
    "schedule_changes",
    "delivery_results",
    "weekly_reports",
    "audit_events",
    "season_membership_status_events",
  ];

  it("grants the application role no UPDATE or DELETE on any history table", async () => {
    const { rows } = await client.query<{ table_name: string; privilege_type: string }>(
      `select table_name, privilege_type
         from information_schema.role_table_grants
        where table_schema = 'public'
          and grantee = 'service_role'
          and privilege_type in ('UPDATE', 'DELETE')
          and table_name = any($1)`,
      [APPEND_ONLY],
    );

    expect(
      rows.map((r) => `${r.table_name}.${r.privilege_type}`),
      "an append-only table has become writable",
    ).toEqual([]);
  });

  it("grants the application role SELECT and INSERT on every history table", async () => {
    const { rows } = await client.query<{ table_name: string; granted: string }>(
      `select table_name, string_agg(privilege_type, ',' order by privilege_type) as granted
         from information_schema.role_table_grants
        where table_schema = 'public' and grantee = 'service_role' and table_name = any($1)
        group by table_name`,
      [APPEND_ONLY],
    );

    expect(rows.length).toBe(APPEND_ONLY.length);
    for (const row of rows) {
      expect(row.granted, `${row.table_name} is not append-only`).toBe("INSERT,SELECT");
    }
  });

  it("really refuses an UPDATE issued as the application role", async () => {
    await client.query(
      `insert into public.rsvp_responses (invitation_id, response, source, responded_at)
       values ($1, 'yes', 'operator', now())`,
      [base.invitationId],
    );

    await client.query("set local role service_role");
    await expectRejected(
      client,
      "update public.rsvp_responses set response = 'no' where invitation_id = $1",
      [base.invitationId],
      /permission denied/,
    );
    await expectRejected(
      client,
      "delete from public.rsvp_responses where invitation_id = $1",
      [base.invitationId],
      /permission denied/,
    );
    await client.query("reset role");
  });
});

describe("legacy staging cannot promote a historical value", () => {
  it("has no representation for a third RSVP answer", async () => {
    await expectRejected(
      client,
      `insert into staging.legacy_rsvp_rows
         (import_batch, raw_response, normalisation_status, normalised_response)
       values ('t', 'Unsure', 'normalised', 'unsure')`,
      [],
      /invalid input value for enum/,
    );
  });

  it("carries the reason requirement across normalisation", async () => {
    await expectRejected(
      client,
      `insert into staging.legacy_rsvp_rows
         (import_batch, raw_response, normalisation_status, normalised_response)
       values ('t', 'Unsure', 'normalised', 'no')`,
      [],
      "legacy_rsvp_rows_no_requires_a_reason",
    );
  });

  it("refuses a normalised value on a row that was not normalised", async () => {
    await expectRejected(
      client,
      `insert into staging.legacy_rsvp_rows
         (import_batch, raw_response, normalisation_status, normalised_response)
       values ('t', 'Yes', 'pending', 'yes')`,
      [],
      "legacy_rsvp_rows_value_only_when_normalised",
    );
  });
});
