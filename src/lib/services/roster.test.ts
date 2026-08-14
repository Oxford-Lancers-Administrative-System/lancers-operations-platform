// @vitest-environment node
/**
 * Returner intake against the real local database. LAN-74.
 *
 * Every assertion that matters here reads through a **second connection**, for
 * the reason `tests/helpers/service-layer.ts` explains at length: a row is
 * perfectly visible to the transaction that wrote it, so reading it back
 * through the same transaction proves nothing about whether it committed. The
 * rollback tests are worthless without that separation, and they are the ones
 * this issue's fourth acceptance criterion turns on.
 *
 * The suite writes committed rows on purpose — proving a commit committed means
 * leaving something behind for a moment — and deletes them afterwards by a
 * marker unique to this suite.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import { closePool, isServiceError, withTransaction } from "@/lib/db";
import { openObserver, seededActorPersonId } from "../../../tests/helpers/service-layer";
import { enterReturningPlayer, findPersonCandidates, resolveOpenSeason } from "./roster";

/** This suite's namespace. Never shared — parallel suites share one database. */
const MARKER = "LAN74Intake";

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
/** A real `people.id` standing in for what `resolveOperator()` returns. */
let actorPersonId: string;
let openSeasonId: string;
let openSeasonLabel: string;

/** A seeded first-name-only person who already holds a current membership. */
let firstNameOnly: { id: string; givenName: string };
/** A seeded person with no membership in the open season. */
let withoutMembership: { id: string; givenName: string; familyName: string | null };

function unique(tag: string): string {
  return `${MARKER}-${tag}-${process.pid}`;
}

beforeAll(async () => {
  observer = await openObserver();

  const season = await withTransaction((tx) => resolveOpenSeason(tx));
  openSeasonId = season.id;
  openSeasonLabel = season.label;

  actorPersonId = await seededActorPersonId(observer);

  const seededFirstNameOnly = await observer.query<{ id: string; given_name: string }>(
    `select p.id, p.given_name
       from public.people p
       join public.season_memberships m on m.person_id = p.id and m.season_id = $1::uuid
      where p.family_name is null
      order by p.given_name
      limit 1`,
    [openSeasonId],
  );
  firstNameOnly = {
    id: seededFirstNameOnly.rows[0].id,
    givenName: seededFirstNameOnly.rows[0].given_name,
  };

  const seededFree = await observer.query<{
    id: string;
    given_name: string;
    family_name: string | null;
  }>(
    // Must already hold a preferred email: two tests below turn on what happens
    // when an operator supplies a second one, and picking a person without one
    // made both of them vacuous — which is what the fixture assertions in those
    // tests now refuse to allow.
    `select p.id, p.given_name, p.family_name
       from public.people p
      where p.merged_into_person_id is null
        and not exists (
          select 1 from public.season_memberships m
           where m.person_id = p.id and m.season_id = $1::uuid)
        and exists (
          select 1 from public.contact_points c
           where c.person_id = p.id and c.kind = 'email' and c.is_preferred)
      order by p.given_name
      limit 1`,
    [openSeasonId],
  );
  withoutMembership = {
    id: seededFree.rows[0].id,
    givenName: seededFree.rows[0].given_name,
    familyName: seededFree.rows[0].family_name,
  };
});

/**
 * Removes everything this suite could have committed, in reverse dependency
 * order. It deletes by this suite's marker only, and it also releases the
 * seeded person it may have given a membership to.
 *
 * The marker is matched as `%MARKER%`, not `MARKER%`. One test deliberately
 * stores a name with **leading** whitespace — that is the whole point of it —
 * and a prefix match silently left those rows behind in a database every other
 * suite shares. Anchoring the pattern to the start is the kind of cleanup bug
 * that only shows up as somebody else's baffling failure.
 */
async function cleanUp(): Promise<void> {
  await observer.query(
    `delete from public.audit_events
      where context ->> 'issue' = 'LAN-74'
        and (context ->> 'test_marker' = $1 or entity_id in (
              select id from public.people where given_name like $2))`,
    [MARKER, `%${MARKER}%`],
  );
  await observer.query(
    `delete from public.season_membership_status_events
      where season_membership_id in (
        select m.id from public.season_memberships m
        left join public.people p on p.id = m.person_id
        where p.given_name like $1 or (m.person_id = $2::uuid and m.season_id = $3::uuid))`,
    [`%${MARKER}%`, withoutMembership.id, openSeasonId],
  );
  await observer.query(
    `delete from public.audit_events
      where entity_id in (
        select m.id from public.season_memberships m
        left join public.people p on p.id = m.person_id
        where p.given_name like $1 or (m.person_id = $2::uuid and m.season_id = $3::uuid))`,
    [`%${MARKER}%`, withoutMembership.id, openSeasonId],
  );
  // LAN-75: confirmation now generates the season's onboarding items, so a
  // membership this suite created has children, and
  // `onboarding_items_membership_season` refuses to let it go while they exist.
  // Deleted before the membership, in the same reverse-dependency order as
  // everything else here.
  await observer.query(
    `delete from public.onboarding_items
      where season_membership_id in (
        select m.id from public.season_memberships m
        left join public.people p on p.id = m.person_id
        where p.given_name like $1 or (m.person_id = $2::uuid and m.season_id = $3::uuid))`,
    [`%${MARKER}%`, withoutMembership.id, openSeasonId],
  );
  await observer.query(
    `delete from public.season_memberships
      where person_id in (select id from public.people where given_name like $1)
         or (person_id = $2::uuid and season_id = $3::uuid)`,
    [`%${MARKER}%`, withoutMembership.id, openSeasonId],
  );
  // Scoped to this suite's own people. `source = 'operator intake'` alone would
  // reach rows another suite committed against the same database — vitest runs
  // test files in parallel, and a cleanup that deletes somebody else's fixture
  // surfaces as a baffling foreign-key failure over there rather than as the
  // collision it is.
  await observer.query(
    `delete from public.contact_points
      where person_id in (select id from public.people where given_name like $1)
         or (person_id = $2::uuid and source = 'operator intake')`,
    // The seeded person keeps every contact the seed gave them: only what this
    // suite wrote through the service is removed. Deleting all of their
    // contacts would strip the preferred email two tests depend on, one test
    // earlier than the test that needs it.
    [`%${MARKER}%`, withoutMembership.id],
  );
  await observer.query(
    `delete from public.person_aliases
      where source = 'operator intake'
        and (person_id in (select id from public.people where given_name like $1)
             or person_id = $2::uuid)`,
    [`%${MARKER}%`, withoutMembership.id],
  );
  await observer.query("delete from public.people where given_name like $1", [`%${MARKER}%`]);
}

afterEach(cleanUp);

afterAll(async () => {
  await cleanUp();
  await observer.end();
  await closePool();
});

// ---------------------------------------------------------------------------

describe("findPersonCandidates", () => {
  it("surfaces a seeded first-name-only person from the given name alone", async () => {
    // Matrix row 3, and the acceptance criterion this issue exists for: 26% of
    // the club's records carry a first name and nothing else, so an operator
    // typing a full name must still be shown the surname-less person who is
    // probably the same human.
    const candidates = await findPersonCandidates({
      givenName: firstNameOnly.givenName,
      familyName: "Fielding",
      email: "someone.else@example.invalid",
    });

    const found = candidates.find((candidate) => candidate.personId === firstNameOnly.id);
    expect(found).toBeDefined();
    expect(found?.familyName).toBeNull();
    expect(found?.matchedOn).toContain("given name");
  });

  it("reports the candidate's current-season membership, so UX-11 can show it", async () => {
    const candidates = await findPersonCandidates({ givenName: firstNameOnly.givenName });
    const found = candidates.find((candidate) => candidate.personId === firstNameOnly.id);

    expect(found?.currentMembership).not.toBeNull();
    expect(found?.currentMembership?.id).toEqual(expect.any(String));
  });

  it("matches a supplied phone written in a different format", async () => {
    // The club's files carry `07700 900101` and `+44 7700 900101` for the same
    // number. Comparison is on the last nine digits; nothing stored is touched.
    const seeded = await observer.query<{ person_id: string; raw_value: string }>(
      `select person_id, raw_value from public.contact_points
        where kind = 'phone' and raw_value ~ '^07700 900[0-9]{3}$' limit 1`,
    );
    const { person_id: personId, raw_value: rawValue } = seeded.rows[0];
    const international = `+44 ${rawValue.slice(1)}`;

    const candidates = await findPersonCandidates({
      givenName: unique("nomatch"),
      phone: international,
    });

    const found = candidates.find((candidate) => candidate.personId === personId);
    expect(found).toBeDefined();
    expect(found?.matchedOn).toContain("phone");
  });

  it("matches a supplied email regardless of case and surrounding space", async () => {
    const seeded = await observer.query<{ person_id: string; raw_value: string }>(
      "select person_id, raw_value from public.contact_points where kind = 'email' limit 1",
    );
    const { person_id: personId, raw_value: rawValue } = seeded.rows[0];

    const candidates = await findPersonCandidates({
      givenName: unique("nomatch"),
      email: `  ${rawValue.trim().toUpperCase()}  `,
    });

    expect(candidates.map((candidate) => candidate.personId)).toContain(personId);
  });

  it("returns nothing for a name and contact the club has never seen", async () => {
    const candidates = await findPersonCandidates({
      givenName: unique("Ghost"),
      familyName: unique("Nobody"),
      email: `${unique("ghost")}@example.invalid`,
      phone: "+44 7700 000000",
    });

    expect(candidates).toEqual([]);
  });

  it("never offers a person who was merged away", async () => {
    const merged = await observer.query<{ id: string; given_name: string }>(
      "select id, given_name from public.people where merged_into_person_id is not null limit 1",
    );
    const candidates = await findPersonCandidates({ givenName: merged.rows[0].given_name });

    expect(candidates.map((candidate) => candidate.personId)).not.toContain(merged.rows[0].id);
  });
});

// ---------------------------------------------------------------------------

describe("enterReturningPlayer — a new person", () => {
  it("creates exactly one person, one membership and both status-history rows", async () => {
    // Matrix row 1 / acceptance criterion 1.
    const givenName = unique("Avery");
    const result = await enterReturningPlayer({
      actorPersonId,
      input: {
        givenName,
        familyName: "Fielding",
        knownAs: "Ave",
        email: "avery.fielding@example.invalid",
        phone: "+44 7700 900101",
      },
      decision: { kind: "new", confirmed: true },
    });

    expect(result.personCreated).toBe(true);
    expect(result.seasonLabel).toBe(openSeasonLabel);

    const people = await observer.query(
      "select id, given_name, family_name, known_as from public.people where given_name = $1",
      [givenName],
    );
    expect(people.rowCount).toBe(1);
    expect(people.rows[0]).toMatchObject({ family_name: "Fielding", known_as: "Ave" });

    const membership = await observer.query<{
      status: string;
      entry: string;
      season_id: string;
      confirmed_on: Date;
    }>(
      "select status::text, entry::text, season_id, confirmed_on from public.season_memberships where id = $1::uuid",
      [result.membershipId],
    );
    expect(membership.rowCount).toBe(1);
    expect(membership.rows[0].status).toBe("confirmed");
    expect(membership.rows[0].entry).toBe("returning");
    expect(membership.rows[0].season_id).toBe(openSeasonId);
    expect(membership.rows[0].confirmed_on).not.toBeNull();

    const history = await observer.query<{ from_status: string | null; to_status: string }>(
      `select from_status::text, to_status::text, actor_person_id
         from public.season_membership_status_events
        where season_membership_id = $1::uuid
        order by occurred_at, from_status nulls first`,
      [result.membershipId],
    );
    expect(history.rows).toHaveLength(2);
    expect(history.rows[0]).toMatchObject({ from_status: null, to_status: "carried_forward" });
    expect(history.rows[1]).toMatchObject({
      from_status: "carried_forward",
      to_status: "confirmed",
    });
  });

  it("names the acting operator on both transitions", async () => {
    // Invariant M2. An anonymous transition is not an audit trail.
    const result = await enterReturningPlayer({
      actorPersonId,
      input: { givenName: unique("Actor") },
      decision: { kind: "new", confirmed: true },
    });

    const history = await observer.query<{ actor_person_id: string | null }>(
      "select actor_person_id from public.season_membership_status_events where season_membership_id = $1::uuid",
      [result.membershipId],
    );
    expect(history.rows).toHaveLength(2);
    for (const row of history.rows) expect(row.actor_person_id).toBe(actorPersonId);
  });

  it("writes the creation and the confirmation to audit_events with the operator's person id", async () => {
    // Matrix row 5 / acceptance criterion 5.
    //
    // The two membership *transitions* are not duplicated here — register D9
    // and the `audit_events` table comment both refuse that, and
    // `season_membership_status_events` is their typed home. What lands here is
    // the pair of facts that has no typed home: this operator minted a durable
    // identity, and this operator completed the intake. Neither row carries a
    // `from_state`/`to_state`, which is what keeps them from restating the
    // transition record.
    const result = await enterReturningPlayer({
      actorPersonId,
      input: { givenName: unique("Audited"), email: "audited@example.invalid" },
      decision: { kind: "new", confirmed: true },
    });

    const audit = await observer.query<{
      action: string;
      entity_table: string;
      entity_id: string;
      actor_person_id: string;
      from_state: string | null;
      to_state: string | null;
      context: Record<string, unknown>;
    }>(
      `select action, entity_table, entity_id, actor_person_id, from_state, to_state, context
         from public.audit_events
        where entity_id in ($1::uuid, $2::uuid)
        order by action`,
      [result.personId, result.membershipId],
    );

    const actions = audit.rows.map((row) => row.action);
    expect(actions).toEqual(["person_created", "returner_membership_confirmed"]);
    for (const row of audit.rows) {
      expect(row.actor_person_id).toBe(actorPersonId);
      expect(row.from_state).toBeNull();
      expect(row.to_state).toBeNull();
      expect(row.context).toMatchObject({ issue: "LAN-74" });
    }

    const creation = audit.rows.find((row) => row.action === "person_created");
    expect(creation?.entity_table).toBe("people");
    expect(creation?.entity_id).toBe(result.personId);

    const confirmation = audit.rows.find((row) => row.action === "returner_membership_confirmed");
    expect(confirmation?.entity_table).toBe("season_memberships");
    expect(confirmation?.entity_id).toBe(result.membershipId);
    expect(confirmation?.context).toMatchObject({
      entry: "returning",
      dedupe_decision: "new_person",
      transitions_recorded_in: "season_membership_status_events",
    });
  });

  it("reads both audit rows and both transitions back through transition_ledger", async () => {
    // The architecture's answer to "where is the whole story?" — one stream
    // over the typed history table and audit_events, without duplication.
    const result = await enterReturningPlayer({
      actorPersonId,
      input: { givenName: unique("Ledger") },
      decision: { kind: "new", confirmed: true },
    });

    const ledger = await observer.query<{ recorded_in: string; action: string }>(
      `select recorded_in, action from public.transition_ledger
        where entity_id in ($1::uuid, $2::uuid)
        order by recorded_in, action`,
      [result.personId, result.membershipId],
    );

    expect(ledger.rows.filter((row) => row.recorded_in === "audit_events")).toHaveLength(2);
    expect(
      ledger.rows.filter((row) => row.recorded_in === "season_membership_status_events"),
    ).toHaveLength(2);
  });

  it("stores contact detail exactly as it was typed", async () => {
    // Matrix row 6. `docs/architecture/data-model.md`: "Raw intake is stored
    // unvalidated by design; normalisation is separate and reversible." A
    // trailing space and a reversed TLD are both real defects in the club's
    // files and both must survive intake, or the contact is lost.
    const messyEmail = "avery.fielding@example.ac.ox ";
    const messyPhone = " 07700 900101";

    const result = await enterReturningPlayer({
      actorPersonId,
      input: { givenName: unique("Raw"), email: messyEmail, phone: messyPhone },
      decision: { kind: "new", confirmed: true },
    });

    const contacts = await observer.query<{
      kind: string;
      raw_value: string;
      normalised_value: string | null;
      is_preferred: boolean;
    }>(
      "select kind::text, raw_value, normalised_value, is_preferred from public.contact_points where person_id = $1::uuid order by kind",
      [result.personId],
    );

    expect(contacts.rows).toHaveLength(2);
    const email = contacts.rows.find((row) => row.kind === "email");
    const phone = contacts.rows.find((row) => row.kind === "phone");
    expect(email?.raw_value).toBe(messyEmail);
    expect(phone?.raw_value).toBe(messyPhone);
    // Normalisation is a separate, reversible step and is not this issue's job.
    expect(email?.normalised_value).toBeNull();
    expect(phone?.normalised_value).toBeNull();
    // First of each kind for this person, so both are preferred.
    expect(email?.is_preferred).toBe(true);
    expect(phone?.is_preferred).toBe(true);
  });

  it("records a known-as that differs as an alias, and one that does not as nothing", async () => {
    const distinct = await enterReturningPlayer({
      actorPersonId,
      input: { givenName: unique("Benjamin"), knownAs: "Ben" },
      decision: { kind: "new", confirmed: true },
    });
    expect(distinct.aliasCreated).toBe(true);

    const sameName = unique("Same");
    const same = await enterReturningPlayer({
      actorPersonId,
      input: { givenName: sameName, knownAs: sameName.toLowerCase() },
      decision: { kind: "new", confirmed: true },
    });
    expect(same.aliasCreated).toBe(false);

    const aliases = await observer.query(
      "select alias from public.person_aliases where person_id = $1::uuid",
      [distinct.personId],
    );
    expect(aliases.rows.map((row) => row.alias)).toEqual(["Ben"]);
  });

  it("refuses a blank given name before touching the database", async () => {
    await expect(
      enterReturningPlayer({
        actorPersonId,
        input: { givenName: "   " },
        decision: { kind: "new", confirmed: true },
      }),
    ).rejects.toMatchObject({ kind: "constraint_violated" });
  });
});

// ---------------------------------------------------------------------------

describe("enterReturningPlayer — an existing person", () => {
  it("creates a membership without a second person row", async () => {
    // Counted by NAME, not globally. `select count(*) from public.people` was a
    // second cross-suite race of the same family as the actor one: Vitest runs
    // suites in parallel against one database, several of them create and delete
    // people, and a row committed between these two counts failed the assertion
    // in a test that had nothing to do with it.
    //
    // The name is what this assertion is actually about — that selecting an
    // existing candidate reuses their record rather than minting a second one
    // under the same name — so scoping to it is both race-free and closer to the
    // claim.
    const countByName = async () => {
      const row = await observer.query<{ count: string }>(
        `select count(*)::text as count from public.people
          where given_name = $1 and family_name is not distinct from $2`,
        [withoutMembership.givenName, withoutMembership.familyName],
      );
      return row.rows[0].count;
    };

    const before = await countByName();

    const result = await enterReturningPlayer({
      actorPersonId,
      input: { givenName: withoutMembership.givenName, familyName: withoutMembership.familyName },
      decision: { kind: "existing", personId: withoutMembership.id },
    });

    expect(result.personCreated).toBe(false);
    expect(result.personId).toBe(withoutMembership.id);

    expect(await countByName()).toBe(before);

    const membership = await observer.query<{ person_id: string; entry: string; status: string }>(
      "select person_id, entry::text, status::text from public.season_memberships where id = $1::uuid",
      [result.membershipId],
    );
    expect(membership.rows[0]).toMatchObject({
      person_id: withoutMembership.id,
      entry: "returning",
      status: "confirmed",
    });
  });

  it("writes no person_created audit row when no person was created", async () => {
    const result = await enterReturningPlayer({
      actorPersonId,
      input: { givenName: withoutMembership.givenName },
      decision: { kind: "existing", personId: withoutMembership.id },
    });

    const audit = await observer.query<{ action: string }>(
      "select action from public.audit_events where entity_id in ($1::uuid, $2::uuid) and context ->> 'issue' = 'LAN-74'",
      [result.personId, result.membershipId],
    );
    expect(audit.rows.map((row) => row.action)).toEqual(["returner_membership_confirmed"]);
  });

  it("records a new contact without demoting the one already preferred", async () => {
    // Matrix row 7. An intake form is not where somebody's known-good number
    // gets replaced by one typed from memory; the new value is recorded, the
    // old one is left exactly as it was, and the caller is told which happened.
    const existingPreferred = await observer.query<{ raw_value: string; id: string }>(
      "select id, raw_value from public.contact_points where person_id = $1::uuid and kind = 'email' and is_preferred",
      [withoutMembership.id],
    );

    const result = await enterReturningPlayer({
      actorPersonId,
      input: { givenName: withoutMembership.givenName, email: "brand.new@example.invalid" },
      decision: { kind: "existing", personId: withoutMembership.id },
    });

    const recorded = result.contactsRecorded.find((contact) => contact.kind === "email");

    // Asserted, not branched on. An early `return` here would let this test go
    // silently vacuous the day the seed stops giving this person an email.
    expect(
      existingPreferred.rowCount,
      "the seeded person this test picks must already have a preferred email",
    ).toBe(1);
    expect(recorded?.isPreferred).toBe(false);

    const stillPreferred = await observer.query<{ raw_value: string }>(
      "select raw_value from public.contact_points where id = $1::uuid and is_preferred",
      [existingPreferred.rows[0].id],
    );
    expect(stillPreferred.rows[0].raw_value).toBe(existingPreferred.rows[0].raw_value);
  });

  it("does not write the same contact value twice", async () => {
    const existing = await observer.query<{ raw_value: string }>(
      "select raw_value from public.contact_points where person_id = $1::uuid and kind = 'email' limit 1",
      [withoutMembership.id],
    );
    expect(
      existing.rowCount,
      "the seeded person this test picks must already have an email to re-supply",
    ).toBe(1);

    const before = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.contact_points where person_id = $1::uuid",
      [withoutMembership.id],
    );

    await enterReturningPlayer({
      actorPersonId,
      input: { givenName: withoutMembership.givenName, email: existing.rows[0].raw_value },
      decision: { kind: "existing", personId: withoutMembership.id },
    });

    const after = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.contact_points where person_id = $1::uuid",
      [withoutMembership.id],
    );
    expect(after.rows[0].count).toBe(before.rows[0].count);
  });

  it("refuses a person who already holds a membership this season, in club language", async () => {
    // Matrix row 2 / acceptance criterion 2. Invariant I2, surfaced as a
    // sentence an operator can act on rather than as an integrity error.
    let thrown: unknown;
    try {
      await enterReturningPlayer({
        actorPersonId,
        input: { givenName: firstNameOnly.givenName },
        decision: { kind: "existing", personId: firstNameOnly.id },
      });
    } catch (error) {
      thrown = error;
    }

    expect(isServiceError(thrown)).toBe(true);
    expect(thrown).toMatchObject({
      kind: "conflict",
      rule: "season_memberships_one_per_person_per_season",
    });
    expect((thrown as Error).message).toContain(openSeasonLabel);
    expect((thrown as Error).message).not.toMatch(/duplicate key|constraint|violates/i);
  });

  it("refuses a person who was merged away", async () => {
    const merged = await observer.query<{ id: string; given_name: string }>(
      "select id, given_name from public.people where merged_into_person_id is not null limit 1",
    );

    await expect(
      enterReturningPlayer({
        actorPersonId,
        input: { givenName: merged.rows[0].given_name },
        decision: { kind: "existing", personId: merged.rows[0].id },
      }),
    ).rejects.toMatchObject({ kind: "conflict", rule: "person_merged_away" });
  });

  it("refuses a person id that is not on record", async () => {
    await expect(
      enterReturningPlayer({
        actorPersonId,
        input: { givenName: unique("Gone") },
        decision: { kind: "existing", personId: "00000000-0000-4000-8000-000000000000" },
      }),
    ).rejects.toMatchObject({ kind: "not_found" });
  });
});

// ---------------------------------------------------------------------------

describe("what an intake may not do to somebody who already exists", () => {
  it("never writes an alias onto a person the operator merely selected", async () => {
    // The operator is entering somebody they believe is an existing person, and
    // types a "known as" that is a slip, or simply a form they use. Appending
    // it to that person's alias history would be editing a record nobody asked
    // to edit — and because `findPersonCandidates` matches on aliases, it would
    // permanently widen that person's future duplicate matching too.
    const before = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.person_aliases where person_id = $1::uuid",
      [withoutMembership.id],
    );

    const result = await enterReturningPlayer({
      actorPersonId,
      input: { givenName: withoutMembership.givenName, knownAs: unique("NotHisName") },
      decision: { kind: "existing", personId: withoutMembership.id },
    });

    expect(result.aliasCreated).toBe(false);

    const after = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.person_aliases where person_id = $1::uuid",
      [withoutMembership.id],
    );
    expect(after.rows[0].count).toBe(before.rows[0].count);
  });

  it("does write one for a person this submission minted", async () => {
    // The other half of the same rule, so neither branch can drift unnoticed.
    const result = await enterReturningPlayer({
      actorPersonId,
      input: { givenName: unique("Benedict"), knownAs: "Benny" },
      decision: { kind: "new", confirmed: true },
    });

    expect(result.aliasCreated).toBe(true);
    const aliases = await observer.query(
      "select alias from public.person_aliases where person_id = $1::uuid",
      [result.personId],
    );
    expect(aliases.rows.map((row) => row.alias)).toEqual(["Benny"]);
  });
});

describe("findPersonCandidates — names stored with stray whitespace", () => {
  it("still surfaces a person whose stored name has surrounding spaces", async () => {
    // `people_given_name_not_blank` only forbids an all-whitespace value, and
    // raw intake is stored unvalidated by design — so ' Bertram ' is a legal
    // row that an import will eventually produce. Comparing it untrimmed hides
    // exactly the duplicate this check exists to find.
    const givenName = unique("Spaced");
    const person = await observer.query<{ id: string }>(
      "insert into public.people (given_name, family_name) values ($1, $2) returning id",
      [`  ${givenName}  `, "  Padded  "],
    );

    const byGiven = await findPersonCandidates({ givenName });
    expect(byGiven.map((candidate) => candidate.personId)).toContain(person.rows[0].id);

    const byFamily = await findPersonCandidates({
      givenName: unique("Nobody"),
      familyName: "Padded",
    });
    expect(byFamily.map((candidate) => candidate.personId)).toContain(person.rows[0].id);
  });
});

describe("enterReturningPlayer — a failure part-way through", () => {
  it("leaves no person, alias, contact, membership or status event behind", async () => {
    // Matrix row 4 / acceptance criterion 4.
    //
    // The failure is forced at the deepest point the write reaches: an actor id
    // that is not a `people` row passes this module's own check, so the person,
    // the alias, both contact points and the membership are all inserted first
    // and the *status-history* insert is what the database rejects, on
    // `season_membership_status_events.actor_person_id`. That is a genuine
    // mid-write failure rather than a rejection at the door, and it is the only
    // shape that can prove the earlier inserts were undone.
    //
    // In the running application this input cannot occur — the actor always
    // comes from `resolveOperator()` — which is exactly why it is safe to use
    // here to reach a failure the application's own paths make unreachable.
    const givenName = unique("Doomed");
    const missingActor = "00000000-0000-4000-8000-00000000dead";

    // Pinned to the *specific* constraint, so that a later change which moves
    // the failure earlier — validating the actor up front, say — fails this
    // test loudly instead of quietly turning it into a test that proves the
    // door is locked and nothing about what is behind it.
    await expect(
      enterReturningPlayer({
        actorPersonId: missingActor,
        input: {
          givenName,
          familyName: "Rollback",
          knownAs: "Roll",
          email: "doomed@example.invalid",
          phone: "07700 900999",
        },
        decision: { kind: "new", confirmed: true },
      }),
    ).rejects.toMatchObject({
      rule: "season_membership_status_events_actor_person_id_fkey",
    });

    const people = await observer.query("select id from public.people where given_name = $1", [
      givenName,
    ]);
    expect(people.rowCount).toBe(0);

    const contacts = await observer.query(
      "select id from public.contact_points where raw_value in ($1, $2)",
      ["doomed@example.invalid", "07700 900999"],
    );
    expect(contacts.rowCount).toBe(0);

    const aliases = await observer.query("select id from public.person_aliases where alias = $1", [
      "Roll",
    ]);
    expect(aliases.rowCount).toBe(0);

    const audit = await observer.query(
      "select id from public.audit_events where actor_person_id = $1::uuid",
      [missingActor],
    );
    expect(audit.rowCount).toBe(0);
  });

  it("is undone by a caller's own transaction rolling back", async () => {
    // `withTransaction` joins rather than nests, so an intake that succeeded is
    // still discarded when the surrounding scope fails. Proving it here is what
    // stops a later caller assuming this function commits on its own.
    const givenName = unique("Joined");

    await expect(
      withTransaction(async () => {
        await enterReturningPlayer({
          actorPersonId,
          input: { givenName },
          decision: { kind: "new", confirmed: true },
        });
        throw new Error("the caller failed after the intake succeeded");
      }),
    ).rejects.toThrow("the caller failed after the intake succeeded");

    const people = await observer.query("select id from public.people where given_name = $1", [
      givenName,
    ]);
    expect(people.rowCount).toBe(0);
  });
});
