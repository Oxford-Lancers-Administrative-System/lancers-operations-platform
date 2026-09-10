// @vitest-environment node
/**
 * The roster form's read, against the real local database — LAN-267.
 *
 * The pure shaping is proved in `roster-form.test.ts`, which opens no
 * connection. What is left, and what this file exists for, is the half a pure
 * test cannot reach: that the two new `people` columns come back at all, that
 * the jersey number is the one for the kit that was asked for, that the RSVP
 * answer is the standing one, and that generating writes exactly one audit row.
 *
 * The suite mints its own season, people, memberships, jerseys and event,
 * tagged with a marker unique to this file, and deletes every row it wrote in
 * dependency order — the same discipline `roster-board.test.ts` documents. It
 * commits rather than rolls back, because a rolled-back write proves nothing
 * about a constraint or a cascade actually holding.
 *
 * Nothing from the template linked on LAN-267 appears anywhere below: every
 * name and every number is invented for this file.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import { closePool, withTransaction } from "@/lib/db";
import { openObserver, seededActorPersonId } from "../../../tests/helpers/service-layer";
import { resolveOpenSeason } from "./roster";
import { readRosterFormDataIn, recordRosterFormGenerated } from "./roster-form";

const MARKER = "LAN267Form";

let observer: Client;
let actorPersonId: string;
let seasonId: string;
let eventId: string;
let playerPersonId: string;
let playerMembershipId: string;
let coachPersonId: string;
let coachRoleAssignmentId: string;
let invitationId: string;
let audienceMemberId: string;
let blueNumber: number;
let whiteNumber: number;

async function cleanUp(): Promise<void> {
  await observer.query(`delete from public.audit_events where entity_id = $1::uuid`, [eventId]);
  await observer.query(`delete from public.rsvp_responses where invitation_id = $1::uuid`, [
    invitationId,
  ]);
  await observer.query(`delete from public.invitations where id = $1::uuid`, [invitationId]);
  await observer.query(`delete from public.event_audience_members where id = $1::uuid`, [
    audienceMemberId,
  ]);
  await observer.query(`delete from public.events where id = $1::uuid`, [eventId]);
  await observer.query(`delete from public.role_assignments where id = $1::uuid`, [
    coachRoleAssignmentId,
  ]);
  await observer.query(
    `delete from public.jersey_assignments where season_membership_id = $1::uuid`,
    [playerMembershipId],
  );
  await observer.query(
    `delete from public.onboarding_item_history where season_membership_id = $1::uuid`,
    [playerMembershipId],
  );
  await observer.query(
    `delete from public.onboarding_items where season_membership_id = $1::uuid`,
    [playerMembershipId],
  );
  await observer.query(
    `delete from public.season_membership_status_events where season_membership_id = $1::uuid`,
    [playerMembershipId],
  );
  await observer.query(`delete from public.season_memberships where id = $1::uuid`, [
    playerMembershipId,
  ]);
  await observer.query(`delete from public.people where id = any($1::uuid[])`, [
    [playerPersonId, coachPersonId],
  ]);
}

beforeAll(async () => {
  observer = await openObserver();
  actorPersonId = await seededActorPersonId(observer);

  const season = await withTransaction((tx) => resolveOpenSeason(tx));
  seasonId = season.id;

  const player = await observer.query<{ id: string }>(
    `insert into public.people (given_name, family_name, student_number)
     values ($1, $2, $3) returning id`,
    [MARKER, "Aldermere", "SN-0099"],
  );
  playerPersonId = player.rows[0].id;

  const coach = await observer.query<{ id: string }>(
    `insert into public.people (given_name, family_name, bafa_registration_number)
     values ($1, $2, $3) returning id`,
    [MARKER, "Wrenfield", "BAFA-0099"],
  );
  coachPersonId = coach.rows[0].id;

  const membership = await observer.query<{ id: string }>(
    // `season_memberships_activation_is_dated`: an active membership carries
    // the day it became one.
    `insert into public.season_memberships (person_id, season_id, status, entry, activated_on)
     values ($1::uuid, $2::uuid, 'active', 'new', current_date) returning id`,
    [playerPersonId, seasonId],
  );
  playerMembershipId = membership.rows[0].id;

  // Two kits, two different numbers on the same person — which is exactly what
  // makes "the number for the kit that was asked for" a claim worth checking.
  //
  // The numbers are found rather than chosen: `jersey_assignments_unique_within_season_and_kit`
  // is a real exclusion constraint over the whole season, and the seeded roster
  // already holds most of the low numbers. Picking a free one per kit keeps the
  // suite from depending on which numbers the seed happened to hand out.
  const freeNumbers = await observer.query<{ blue: number; white: number }>(
    `select
       (select n from generate_series(1, 94) n
         where not exists (
           select 1 from public.jersey_assignments j
            where j.season_id = $1::uuid and j.kit = 'blue'
              and j.number = n and j.effective_to is null)
         order by n desc limit 1) as blue,
       (select n from generate_series(1, 94) n
         where not exists (
           select 1 from public.jersey_assignments j
            where j.season_id = $1::uuid and j.kit = 'white'
              and j.number = n and j.effective_to is null)
         order by n desc limit 1) as white`,
    [seasonId],
  );
  blueNumber = freeNumbers.rows[0].blue;
  whiteNumber = freeNumbers.rows[0].white;

  await observer.query(
    `insert into public.jersey_assignments
       (season_membership_id, season_id, kit, number, is_predominant, effective_from)
     values ($1::uuid, $2::uuid, 'blue', $3, false, current_date),
            ($1::uuid, $2::uuid, 'white', $4, false, current_date)`,
    [playerMembershipId, seasonId, blueNumber, whiteNumber],
  );

  const headCoachRole = await observer.query<{ id: string }>(
    `select id from public.roles where code = 'head_coach'`,
  );
  const assignment = await observer.query<{ id: string }>(
    // `is_constitutional_office` is a composite-foreign-key target: the
    // assignment carries the role's own answer rather than restating one.
    `insert into public.role_assignments
       (person_id, role_id, scope, is_constitutional_office, season_id, effective_from)
     values ($1::uuid, $2::uuid, 'season', false, $3::uuid, current_date) returning id`,
    [coachPersonId, headCoachRole.rows[0].id, seasonId],
  );
  coachRoleAssignmentId = assignment.rows[0].id;

  const event = await observer.query<{ id: string }>(
    // Invariant E1: from approval onward an event carries a date, a recorded
    // approver and an explicitly confirmed audience.
    `insert into public.events
       (season_id, name, event_type, status, scheduled_on, delivery_mode, is_mandatory,
        approved_at, approved_by_person_id, audience_confirmed_at, audience_confirmed_by_person_id,
        template_id)
     values ($1::uuid, $2, 'game', 'approved', current_date + 7, 'in_person', true,
             now(), $3::uuid, now(), $3::uuid,
             (select tpl.id from public.event_templates tpl where tpl.event_type = 'game' order by lower(tpl.name) limit 1))
     returning id`,
    [seasonId, `${MARKER} vs Fictional Opposition`, actorPersonId],
  );
  eventId = event.rows[0].id;

  const audience = await observer.query<{ id: string }>(
    `insert into public.event_audience_members (event_id, season_id, capacity, season_membership_id, invitee_person_id)
     values ($1::uuid, $2::uuid, 'player', $3::uuid, (select m.person_id from public.season_memberships m where m.id = $3::uuid)) returning id`,
    [eventId, seasonId, playerMembershipId],
  );
  audienceMemberId = audience.rows[0].id;

  const invitation = await observer.query<{ id: string }>(
    `insert into public.invitations
       (audience_member_id, event_id, event_status, season_id, capacity,
        season_membership_id, status, issued_at)
     values ($1::uuid, $2::uuid, 'approved', $3::uuid, 'player', $4::uuid, 'issued', now())
     returning id`,
    [audienceMemberId, eventId, seasonId, playerMembershipId],
  );
  invitationId = invitation.rows[0].id;

  await observer.query(
    `insert into public.rsvp_responses (invitation_id, response, source, responded_at)
     values ($1::uuid, 'yes', 'signed_link', now())`,
    [invitationId],
  );
});

afterAll(async () => {
  await cleanUp();
  await observer.end();
  await closePool();
});

describe("readRosterFormDataIn", () => {
  it("carries the student number the form prints", async () => {
    const data = await withTransaction((tx) => readRosterFormDataIn(tx, eventId, "blue"));
    const player = data.players.find((p) => p.membershipId === playerMembershipId);
    expect(player?.studentNumber).toBe("SN-0099");
  });

  it("gives each player the number for the kit that was asked for", async () => {
    const blue = await withTransaction((tx) => readRosterFormDataIn(tx, eventId, "blue"));
    const white = await withTransaction((tx) => readRosterFormDataIn(tx, eventId, "white"));

    expect(blue.players.find((p) => p.membershipId === playerMembershipId)?.jerseyNumber).toBe(
      blueNumber,
    );
    expect(white.players.find((p) => p.membershipId === playerMembershipId)?.jerseyNumber).toBe(
      whiteNumber,
    );
  });

  it("carries the standing RSVP answer for this event", async () => {
    const data = await withTransaction((tx) => readRosterFormDataIn(tx, eventId, "blue"));
    expect(data.players.find((p) => p.membershipId === playerMembershipId)?.rsvp).toBe("yes");
  });

  it("reads the coaching seat, its BAFA number, and derives HC", async () => {
    const data = await withTransaction((tx) => readRosterFormDataIn(tx, eventId, "blue"));
    const coach = data.coaches.find((c) => c.personId === coachPersonId);
    expect(coach?.bafaRegistrationNumber).toBe("BAFA-0099");
    expect(coach?.roleCode).toBe("HC");
  });

  it("reads the game's own season, not whatever season is current", async () => {
    // The failure this guards against is handing the officials last season's
    // squad the week after a rollover.
    const data = await withTransaction((tx) => readRosterFormDataIn(tx, eventId, "blue"));
    expect(data.event.seasonId).toBe(seasonId);
  });
});

describe("recordRosterFormGenerated", () => {
  it("writes exactly one audit row, naming who and which event", async () => {
    const before = await observer.query<{ count: string }>(
      `select count(*)::text as count from public.audit_events
        where entity_id = $1::uuid and action = 'roster_form.generated'`,
      [eventId],
    );

    await recordRosterFormGenerated({
      actorPersonId,
      eventId,
      kit: "blue",
      playerCount: 1,
      coachCount: 1,
    });

    const after = await observer.query<{
      count: string;
      actor_person_id: string;
      entity_table: string;
      context: Record<string, unknown>;
    }>(
      `select count(*)::text as count,
              max(actor_person_id::text) as actor_person_id,
              max(entity_table) as entity_table,
              (array_agg(context order by occurred_at desc))[1] as context
         from public.audit_events
        where entity_id = $1::uuid and action = 'roster_form.generated'`,
      [eventId],
    );

    expect(Number(after.rows[0].count)).toBe(Number(before.rows[0].count) + 1);
    expect(after.rows[0].actor_person_id).toBe(actorPersonId);
    expect(after.rows[0].entity_table).toBe("events");
    expect(after.rows[0].context).toMatchObject({ kit: "blue", playersOnForm: 1 });
  });

  it("stores no copy of the form itself — one audit row and nothing else", async () => {
    // LAN-267 puts storing generated PDFs and a document library explicitly out
    // of scope. A student number sitting in a second place is exactly what
    // generating on demand avoids, so this checks the absence rather than
    // trusting the prose.
    const tables = await observer.query<{ table_name: string }>(
      `select table_name from information_schema.tables
        where table_schema = 'public' and table_name like '%document%'`,
    );
    expect(tables.rows).toEqual([]);
  });
});
