// @vitest-environment node
/**
 * The resolved event audience, and invariant P7's five-way partition.
 *
 * Added by the correction pass following independent verification of PR #5.
 * The baseline stored only audience *confirmation metadata* — a timestamp and
 * an approver — which meant the database could not name a single person the
 * approver had confirmed. Two consequences the verifier demonstrated:
 *
 *   * P7's `never-invited` was not derivable, because the reporting view began
 *     at invitations and an absence has no row to report;
 *   * "outside the audience" and "in the audience and accidentally not
 *     invited" were indistinguishable — the second is an approval defect the
 *     club needs to see, and the first is not its concern at all.
 *
 * `public.event_audience_members` is that population. These tests prove it is
 * a genuine relation and that the four concepts the frozen model keeps apart —
 * audience, invitation, RSVP, attendance — remain independent.
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

const stateOf = async (eventId: string, membershipId: string) =>
  (
    await client.query<{ response_state: string }>(
      `select response_state from public.invitation_response_state
        where event_id = $1 and season_membership_id = $2`,
      [eventId, membershipId],
    )
  ).rows;

describe("invariant P7 — all five states are derivable", () => {
  it("reports a confirmed audience member with no invitation as never-invited", async () => {
    // The state the baseline could not express at all.
    await confirmAudienceMember(
      client,
      { eventId: base.approvedEventId, seasonId: base.seasonId },
      { capacity: "player", membershipId: base.otherMembershipId },
    );

    const rows = await stateOf(base.approvedEventId, base.otherMembershipId);
    expect(rows).toHaveLength(1);
    expect(rows[0].response_state).toBe("never_invited");
  });

  it("does not misclassify somebody outside the audience as never-invited", async () => {
    // `otherMembership` is a member of the season but was never confirmed for
    // this event. They must not appear at all — absence from the audience is
    // not an exception, it is simply not their event.
    const rows = await stateOf(base.approvedEventId, base.otherMembershipId);
    expect(rows, "a non-audience member surfaced in the P7 report").toHaveLength(0);

    // …and the exception view agrees.
    const flagged = await one<{ count: string }>(
      client,
      `select count(*) as count from public.uninvited_audience_members
        where event_id = $1 and season_membership_id = $2`,
      [base.approvedEventId, base.otherMembershipId],
    );
    expect(Number(flagged.count)).toBe(0);
  });

  it("moves a member from never-invited through the remaining four states", async () => {
    const member = await confirmAudienceMember(
      client,
      { eventId: base.approvedEventId, seasonId: base.seasonId },
      { capacity: "player", membershipId: base.otherMembershipId },
    );
    expect((await stateOf(base.approvedEventId, base.otherMembershipId))[0].response_state).toBe(
      "never_invited",
    );

    const invitation = await one<{ id: string }>(
      client,
      `insert into public.invitations
         (event_id, event_status, season_id, audience_member_id,
          capacity, season_membership_id, status)
       values ($1, 'approved', $2, $3, 'player', $4, 'issued') returning id`,
      [base.approvedEventId, base.seasonId, member, base.otherMembershipId],
    );
    expect((await stateOf(base.approvedEventId, base.otherMembershipId))[0].response_state).toBe(
      "awaiting_response",
    );

    await client.query("update public.invitations set status = 'expired' where id = $1", [
      invitation.id,
    ]);
    expect((await stateOf(base.approvedEventId, base.otherMembershipId))[0].response_state).toBe(
      "expired_without_response",
    );

    // A late answer is still an answer (model §2.4).
    await client.query(
      `insert into public.rsvp_responses (invitation_id, response, reason, source, responded_at)
       values ($1, 'no', 'Tutorial clash', 'operator', now())`,
      [invitation.id],
    );
    expect((await stateOf(base.approvedEventId, base.otherMembershipId))[0].response_state).toBe(
      "responded_no",
    );

    await client.query(
      `insert into public.rsvp_responses (invitation_id, response, source, responded_at)
       values ($1, 'yes', 'operator', now() + interval '1 hour')`,
      [invitation.id],
    );
    expect((await stateOf(base.approvedEventId, base.otherMembershipId))[0].response_state).toBe(
      "responded_yes",
    );
  });

  it("surfaces an uninvited audience member as its own exception, not as a nonresponse", async () => {
    // Being confirmed and never asked is an approval defect. Being asked and
    // not answering is a nonresponse. Requirement 6 automates only the second,
    // so they must not be swept into the same queue (register D9).
    await confirmAudienceMember(
      client,
      { eventId: base.approvedEventId, seasonId: base.seasonId },
      { capacity: "player", membershipId: base.otherMembershipId },
    );

    const exception = await one<{ count: string }>(
      client,
      "select count(*) as count from public.uninvited_audience_members where event_id = $1",
      [base.approvedEventId],
    );
    const queued = await one<{ count: string }>(
      client,
      `select count(*) as count from public.nonresponse_queue
        where event_id = $1 and season_membership_id = $2`,
      [base.approvedEventId, base.otherMembershipId],
    );

    expect(Number(exception.count)).toBe(1);
    expect(Number(queued.count)).toBe(0);
  });

  it("reports a meeting's audience exactly like a practice's", async () => {
    // Invariant E6 said an informational event resolved an audience for
    // visibility and created no response obligation. LAN-151 retired it with
    // `solicits_response` (D23): mandatory or optional already carries whether
    // the club expects somebody to be there, and everyone sent an event is
    // expected to answer. So a meeting's audience is in the P7 partition, and
    // `never_invited` is derivable for it like anything else.
    const meeting = await one<{ id: string }>(
      client,
      `insert into public.events
         (season_id, name, event_type, status, scheduled_on,
          audience_confirmed_at, audience_confirmed_by_person_id, approved_at, approved_by_person_id)
       values ($1, 'AGM', 'meeting', 'approved', '2027-06-09', now(), $2, now(), $2)
       returning id`,
      [base.seasonId, base.personId],
    );
    await confirmAudienceMember(
      client,
      { eventId: meeting.id, seasonId: base.seasonId },
      { capacity: "player", membershipId: base.membershipId },
    );

    const rows = await stateOf(meeting.id, base.membershipId);
    expect(rows).toHaveLength(1);
    expect(rows[0].response_state).toBe("never_invited");
  });
});

describe("the resolved audience as a relation", () => {
  it("refuses duplicate membership of an event's audience", async () => {
    await expectRejected(
      client,
      `insert into public.event_audience_members
         (event_id, season_id, capacity, season_membership_id)
       values ($1, $2, 'player', $3)`,
      [base.approvedEventId, base.seasonId, base.membershipId],
      "event_audience_members_one_per_player_per_event",
    );

    const person = await confirmAudienceMember(
      client,
      { eventId: base.approvedEventId, seasonId: base.seasonId },
      { capacity: "coach", personId: base.otherPersonId },
    );
    expect(person).toBeTruthy();

    await expectRejected(
      client,
      `insert into public.event_audience_members
         (event_id, season_id, capacity, person_id)
       values ($1, $2, 'committee', $3)`,
      [base.approvedEventId, base.seasonId, base.otherPersonId],
      "event_audience_members_one_per_person_per_event",
    );
  });

  it("refuses an audience member for an event that does not exist", async () => {
    await expectRejected(
      client,
      `insert into public.event_audience_members
         (event_id, season_id, capacity, season_membership_id)
       values ('00000000-0000-4000-8000-000000000000', $1, 'player', $2)`,
      [base.seasonId, base.otherMembershipId],
      /event_audience_members_event_id_fkey|event_audience_members_event_same_season/,
    );
  });

  it("refuses an audience member for a person who does not exist", async () => {
    await expectRejected(
      client,
      `insert into public.event_audience_members
         (event_id, season_id, capacity, person_id)
       values ($1, $2, 'coach', '00000000-0000-4000-8000-000000000000')`,
      [base.approvedEventId, base.seasonId],
      "event_audience_members_person_id_fkey",
    );
  });

  it("refuses an audience member whose season disagrees with the event's", async () => {
    await expectRejected(
      client,
      `insert into public.event_audience_members
         (event_id, season_id, capacity, season_membership_id)
       values ($1, $2, 'player', $3)`,
      [base.approvedEventId, base.otherSeasonId, base.otherMembershipId],
      "event_audience_members_event_same_season",
    );
  });

  it("refuses an audience member with no anchor at all", async () => {
    await expectRejected(
      client,
      `insert into public.event_audience_members (event_id, season_id, capacity)
       values ($1, $2, 'player')`,
      [base.approvedEventId, base.seasonId],
      "event_audience_members_anchor_matches_capacity",
    );
  });

  it("allows an audience to be proposed on a draft, which is what the approver reviews", async () => {
    await expectAccepted(
      client,
      `insert into public.event_audience_members
         (event_id, season_id, capacity, season_membership_id)
       values ($1, $2, 'player', $3)`,
      [base.draftEventId, base.seasonId, base.membershipId],
    );
  });
});

describe("invitations are resolved from the audience", () => {
  it("refuses an invitation naming an audience member of a different event", async () => {
    await expectRejected(
      client,
      `insert into public.invitations
         (event_id, event_status, season_id, audience_member_id,
          capacity, season_membership_id)
       values ($1, 'approved', $2, $3, 'player', $4)`,
      [base.occurredEventId, base.seasonId, base.audienceMemberId, base.membershipId],
      "invitations_belong_to_the_resolved_audience",
    );
  });

  it("refuses an invitation naming an audience member for a different participant", async () => {
    // The generated participant key is what closes this: the invitation cannot
    // claim an audience member confirmed for somebody else.
    const third = await one<{ id: string }>(
      client,
      `insert into public.season_memberships (person_id, season_id, status, entry, activated_on)
       values (
         (select id from public.people where given_name = 'Fixture' and family_name = 'Third'),
         $1, 'active', 'new', '2026-10-04')
       returning id`,
      [base.seasonId],
    );
    const confirmedForThird = await confirmAudienceMember(
      client,
      { eventId: base.approvedEventId, seasonId: base.seasonId },
      { capacity: "player", membershipId: third.id },
    );

    // `otherMembership` has no invitation to this event, so nothing but the
    // audience foreign key can be what rejects this.
    await expectRejected(
      client,
      `insert into public.invitations
         (event_id, event_status, season_id, audience_member_id,
          capacity, season_membership_id)
       values ($1, 'approved', $2, $3, 'player', $4)`,
      [base.approvedEventId, base.seasonId, confirmedForThird, base.otherMembershipId],
      "invitations_belong_to_the_resolved_audience",
    );
  });

  it("refuses an invitation naming an audience member in a different capacity", async () => {
    const member = await confirmAudienceMember(
      client,
      { eventId: base.approvedEventId, seasonId: base.seasonId },
      { capacity: "coach", personId: base.otherPersonId },
    );

    await expectRejected(
      client,
      `insert into public.invitations
         (event_id, event_status, season_id, audience_member_id,
          capacity, person_id)
       values ($1, 'approved', $2, $3, 'committee', $4)`,
      [base.approvedEventId, base.seasonId, member, base.otherPersonId],
      "invitations_belong_to_the_resolved_audience",
    );
  });

  it("refuses removing an audience member who has been invited", async () => {
    await expectRejected(
      client,
      "delete from public.event_audience_members where id = $1",
      [base.audienceMemberId],
      "invitations_belong_to_the_resolved_audience",
    );
  });
});

describe("audience, invitation, RSVP and attendance stay independent", () => {
  it("creates no invitation when an audience member is confirmed", async () => {
    await confirmAudienceMember(
      client,
      { eventId: base.approvedEventId, seasonId: base.seasonId },
      { capacity: "player", membershipId: base.otherMembershipId },
    );

    const invitations = await one<{ count: string }>(
      client,
      `select count(*) as count from public.invitations
        where event_id = $1 and season_membership_id = $2`,
      [base.approvedEventId, base.otherMembershipId],
    );
    expect(Number(invitations.count)).toBe(0);
  });

  it("creates no RSVP when an invitation is issued", async () => {
    const responses = await one<{ count: string }>(
      client,
      "select count(*) as count from public.rsvp_responses where invitation_id = $1",
      [base.invitationId],
    );
    expect(Number(responses.count)).toBe(0);
  });

  it("still records attendance for somebody who was never in the audience", async () => {
    // Invariant P6 survives the new relation: a walk-up has no audience member,
    // no invitation and no RSVP, and attendance does not care.
    await expectAccepted(
      client,
      `insert into public.attendance_records
         (event_id, event_status, season_id, capacity, season_membership_id, presence)
       values ($1, 'approved', $2, 'player', $3, 'present')`,
      [base.occurredEventId, base.seasonId, base.otherMembershipId],
    );

    const audience = await one<{ count: string }>(
      client,
      `select count(*) as count from public.event_audience_members
        where event_id = $1 and season_membership_id = $2`,
      [base.occurredEventId, base.otherMembershipId],
    );
    expect(Number(audience.count), "attendance created an audience member").toBe(0);
  });

  it("keeps the audience when the event is cancelled", async () => {
    // Register D5: cancellation preserves the record of who was asked and what
    // they said. It preserves who was meant to be asked, too.
    await client.query(
      "update public.events set status = 'cancelled', decision_reason = 'Pitch unavailable' where id = $1",
      [base.approvedEventId],
    );

    const audience = await one<{ count: string }>(
      client,
      "select count(*) as count from public.event_audience_members where event_id = $1",
      [base.approvedEventId],
    );
    expect(Number(audience.count)).toBe(1);
  });
});

describe("invariant E1 — what the database proves, and what it does not", () => {
  it("proves an approved event records a date, an approver and a confirmation", async () => {
    await expectRejected(
      client,
      `insert into public.events
         (season_id, name, event_type, status, scheduled_on, approved_at, approved_by_person_id)
       values ($1, 'No confirmation', 'practice', 'approved', '2026-11-04', now(), $2)`,
      [base.seasonId, base.personId],
      "events_approval_requires_date_and_audience",
    );
  });

  it("does NOT prove the confirmed audience is non-empty — that is service-layer work", async () => {
    // Recorded as a test rather than a comment so nobody re-reads the E1 check
    // as proving more than it does. Enforcing "at least one audience member"
    // declaratively needs either a trigger (which the architecture record
    // forbids for workflow) or an events → audience back-reference, which was
    // considered and rejected in ADR 0012. The approval transaction in the
    // TypeScript service layer owns it, and the first vertical slice must test
    // it there.
    await expectAccepted(
      client,
      `insert into public.events
         (season_id, name, event_type, status, scheduled_on,
          audience_confirmed_at, audience_confirmed_by_person_id, approved_at, approved_by_person_id)
       values ($1, 'Approved with an empty audience', 'practice', 'approved', '2026-11-04',
               now(), $2, now(), $2)`,
      [base.seasonId, base.personId],
    );

    // The gap is at least visible: such an event has no audience rows, so a
    // service-layer check and a data-quality query both have something to read.
    const orphaned = await one<{ count: string }>(
      client,
      `select count(*) as count
         from public.events e
        where e.approved_at is not null
          and not exists (
            select 1 from public.event_audience_members a where a.event_id = e.id)`,
    );
    expect(Number(orphaned.count)).toBeGreaterThan(0);
  });
});
