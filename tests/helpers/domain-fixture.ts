/**
 * Fixture helpers for the schema test suites.
 *
 * These tests talk to PostgreSQL directly rather than through PostgREST,
 * because what is under test is the DATABASE's guarantees: check constraints,
 * composite foreign keys, exclusion constraints and table privileges. Going
 * through the Data API would test PostgREST's error mapping instead, and — by
 * design — the Data API cannot reach these tables at all.
 *
 * Every test runs inside a transaction that is rolled back, so the suite never
 * mutates the seeded dataset and the order tests run in cannot matter.
 *
 * Local Supabase only. `connectLocal` refuses any non-loopback host.
 */
import type { Client } from "pg";
import { connectLocal } from "../../scripts/lib/local-db.mjs";

export type { Client };

export async function openLocalClient(): Promise<Client> {
  return (await connectLocal()) as Client;
}

/** Runs a single statement and returns the first row. */
export async function one<T = Record<string, unknown>>(
  client: Client,
  sql: string,
  params: unknown[] = [],
): Promise<T> {
  const result = await client.query(sql, params);
  return result.rows[0] as T;
}

/**
 * Asserts a statement is rejected by the database, and — when given — that it
 * is rejected by the SPECIFIC constraint the invariant is supposed to be
 * carried by. Without that second half a test passes for the wrong reason the
 * moment an unrelated NOT NULL fires first.
 */
export async function expectRejected(
  client: Client,
  sql: string,
  params: unknown[] = [],
  expected?: string | RegExp,
): Promise<void> {
  await client.query("savepoint attempt");

  let error: (Error & { constraint?: string }) | null = null;
  try {
    await client.query(sql, params);
  } catch (caught) {
    error = caught as Error & { constraint?: string };
  } finally {
    await client.query("rollback to savepoint attempt");
  }

  if (!error) {
    throw new Error(`Expected the database to reject this statement, but it succeeded:\n${sql}`);
  }

  if (expected !== undefined) {
    const haystack = `${error.constraint ?? ""} ${error.message}`;
    const matches =
      typeof expected === "string" ? haystack.includes(expected) : expected.test(haystack);
    if (!matches) {
      throw new Error(
        `Statement was rejected, but not by "${expected}".\n` +
          `Rejected by: ${error.constraint ?? "(no constraint name)"} — ${error.message}`,
      );
    }
  }
}

/** Asserts a statement is accepted. Named for symmetry, and for the failure message. */
export async function expectAccepted(
  client: Client,
  sql: string,
  params: unknown[] = [],
): Promise<void> {
  try {
    await client.query(sql, params);
  } catch (caught) {
    const error = caught as Error;
    throw new Error(`Expected the database to accept this statement:\n${sql}\n\n${error.message}`);
  }
}

/** Confirms an audience member for an event, returning its id. */
export async function confirmAudienceMember(
  client: Client,
  event: { eventId: string; seasonId: string },
  anchor: { capacity: string; membershipId?: string; personId?: string },
): Promise<string> {
  const row = await one<{ id: string }>(
    client,
    `insert into public.event_audience_members
       (event_id, season_id, capacity, season_membership_id, person_id)
     values ($1, $2, $3, $4, $5) returning id`,
    [
      event.eventId,
      event.seasonId,
      anchor.capacity,
      anchor.membershipId ?? null,
      anchor.personId ?? null,
    ],
  );
  return row.id;
}

export interface Baseline {
  personId: string;
  otherPersonId: string;
  vocabularyId: string;
  offencePositionId: string;
  defencePositionId: string;
  otherVocabularyId: string;
  otherVocabularyPositionId: string;
  seasonId: string;
  otherSeasonId: string;
  committeeYearId: string;
  membershipId: string;
  otherMembershipId: string;
  approvedEventId: string;
  draftEventId: string;
  occurredEventId: string;
  invitationId: string;
  audienceMemberId: string;
  officeRoleId: string;
  ordinaryRoleId: string;
}

/**
 * A minimal but complete graph: two people, two seasons on two position
 * vocabularies, memberships, and one event in each of the three states the
 * participation invariants care about.
 */
export async function createBaseline(client: Client): Promise<Baseline> {
  const person = await one<{ id: string }>(
    client,
    "insert into public.people (given_name, family_name) values ('Fixture', 'Primary') returning id",
  );
  const otherPerson = await one<{ id: string }>(
    client,
    "insert into public.people (given_name, family_name) values ('Fixture', 'Secondary') returning id",
  );
  // A third identity, for the cases that need an invitee, a bystander, and a
  // participant somebody else's audience row was confirmed for.
  await client.query(
    "insert into public.people (given_name, family_name) values ('Fixture', 'Third')",
  );

  const vocabulary = await one<{ id: string }>(
    client,
    `insert into public.position_vocabularies (code, label, adopted_on)
     values ('fixture-current', 'Fixture vocabulary', '2026-08-01') returning id`,
  );
  const otherVocabulary = await one<{ id: string }>(
    client,
    `insert into public.position_vocabularies (code, label, adopted_on)
     values ('fixture-legacy', 'Fixture legacy vocabulary', '2023-08-01') returning id`,
  );

  const offencePosition = await one<{ id: string }>(
    client,
    `insert into public.positions (vocabulary_id, code, label, side)
     values ($1, 'WR', 'Wide Receiver', 'offence') returning id`,
    [vocabulary.id],
  );
  const defencePosition = await one<{ id: string }>(
    client,
    `insert into public.positions (vocabulary_id, code, label, side)
     values ($1, 'CB', 'Cornerback', 'defence') returning id`,
    [vocabulary.id],
  );
  const legacyPosition = await one<{ id: string }>(
    client,
    `insert into public.positions (vocabulary_id, code, label, side)
     values ($1, 'OL', 'Offensive Line', 'offence') returning id`,
    [otherVocabulary.id],
  );

  const season = await one<{ id: string }>(
    client,
    `insert into public.seasons (label, status, position_vocabulary_id, starts_on, opened_at, opened_by_person_id)
     values ('fixture-2026-27', 'active', $1, '2026-09-27', now(), $2) returning id`,
    [vocabulary.id, person.id],
  );
  const otherSeason = await one<{ id: string }>(
    client,
    `insert into public.seasons (
       label, status, position_vocabulary_id, starts_on, ends_on,
       opened_at, opened_by_person_id, closed_at, closed_by_person_id)
     values ('fixture-2025-26', 'archived', $1, '2025-09-28', '2026-06-20', now(), $2, now(), $2)
     returning id`,
    [otherVocabulary.id, person.id],
  );

  const committeeYear = await one<{ id: string }>(
    client,
    // Committee years may not overlap — the exclusion constraint is global, and
    // the seeded dataset already occupies 2025 onwards. The fixture therefore
    // sits in a historical window of its own.
    `insert into public.committee_years (label, agm_held_on, starts_on, ends_on)
     values ('fixture-2019-20', '2019-06-01', '2019-06-01', '2020-06-01') returning id`,
  );

  const membership = await one<{ id: string }>(
    client,
    `insert into public.season_memberships (person_id, season_id, status, entry, confirmed_on, activated_on)
     values ($1, $2, 'active', 'new', '2026-09-20', '2026-10-04') returning id`,
    [person.id, season.id],
  );
  const otherMembership = await one<{ id: string }>(
    client,
    `insert into public.season_memberships (person_id, season_id, status, entry, confirmed_on, activated_on)
     values ($1, $2, 'active', 'new', '2026-09-20', '2026-10-04') returning id`,
    [otherPerson.id, season.id],
  );

  const approvedEvent = await one<{ id: string }>(
    client,
    `insert into public.events (
       season_id, name, event_type, status, scheduled_on,
       audience_confirmed_at, audience_confirmed_by_person_id, approved_at, approved_by_person_id)
     values ($1, 'Fixture approved event', 'practice', 'approved', '2026-11-04', now(), $2, now(), $2)
     returning id`,
    [season.id, person.id],
  );
  const draftEvent = await one<{ id: string }>(
    client,
    `insert into public.events (season_id, name, event_type, status)
     values ($1, 'Fixture draft event', 'practice', 'draft') returning id`,
    [season.id],
  );
  const occurredEvent = await one<{ id: string }>(
    client,
    `insert into public.events (
       season_id, name, event_type, status, scheduled_on,
       audience_confirmed_at, audience_confirmed_by_person_id, approved_at, approved_by_person_id,
       outcome_recorded_at, outcome_recorded_by_person_id)
     values ($1, 'Fixture occurred event', 'practice', 'occurred', '2026-10-14', now(), $2, now(), $2, now(), $2)
     returning id`,
    [season.id, person.id],
  );

  // An invitation is resolved from a confirmed audience member (model §2.3), so
  // the audience row comes first.
  const audienceMember = await one<{ id: string }>(
    client,
    `insert into public.event_audience_members
       (event_id, season_id, capacity, season_membership_id, added_by_person_id)
     values ($1, $2, 'player', $3, $4) returning id`,
    [approvedEvent.id, season.id, membership.id, person.id],
  );

  const invitation = await one<{ id: string }>(
    client,
    `insert into public.invitations (
       event_id, event_status, solicits_response, season_id, audience_member_id,
       capacity, season_membership_id, status)
     values ($1, 'approved', true, $2, $3, 'player', $4, 'issued') returning id`,
    [approvedEvent.id, season.id, audienceMember.id, membership.id],
  );

  const officeRole = await one<{ id: string }>(
    client,
    `insert into public.roles (code, name, scope, is_constitutional_office)
     values ('fixture_president', 'Fixture President', 'committee_year', true) returning id`,
  );
  const ordinaryRole = await one<{ id: string }>(
    client,
    `insert into public.roles (code, name, scope, is_constitutional_office)
     values ('fixture_social', 'Fixture Social Secretary', 'committee_year', false) returning id`,
  );

  return {
    personId: person.id,
    otherPersonId: otherPerson.id,
    vocabularyId: vocabulary.id,
    offencePositionId: offencePosition.id,
    defencePositionId: defencePosition.id,
    otherVocabularyId: otherVocabulary.id,
    otherVocabularyPositionId: legacyPosition.id,
    seasonId: season.id,
    otherSeasonId: otherSeason.id,
    committeeYearId: committeeYear.id,
    membershipId: membership.id,
    otherMembershipId: otherMembership.id,
    approvedEventId: approvedEvent.id,
    draftEventId: draftEvent.id,
    occurredEventId: occurredEvent.id,
    invitationId: invitation.id,
    audienceMemberId: audienceMember.id,
    officeRoleId: officeRole.id,
    ordinaryRoleId: ordinaryRole.id,
  };
}
