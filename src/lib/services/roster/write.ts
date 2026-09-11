import "server-only";

import { Conflict, ConstraintViolated, NotFound, withTransaction, type Tx } from "@/lib/db";
import { recordAudit } from "../audit";
import { generateOnboardingItems } from "../membership";
import { emitOnboardingOpenedWelcomeIn } from "../onboarding-welcome";
import { commitAvailability } from "../roster-board";
import {
  normaliseInput,
  resolveOpenSeason,
  trimmedOrNull,
  type IntakeDecision,
  type NormalisedInput,
  type OpenSeason,
  type RecordedContact,
  type ReturnerIntakeInput,
  type ReturnerIntakeResult,
  type TypedContact,
} from "./shared";

/** Returner intake's write path — LAN-74. See `relocations.md` for the module's design note. */

/**
 * Records one returning player, in one transaction.
 *
 * Everything below commits together or not at all: the person, the alias, both
 * contact points, the membership, both status-history rows, the queued
 * welcome, the availability row LAN-215's B-008 adds, and both audit rows. A
 * failure at any statement leaves nothing behind — not a person without a
 * membership, and not a membership whose history is missing its first
 * transition.
 *
 * The status sequence is the frozen model's §2.1 machine as LAN-182 rebuilt it,
 * and is not the operator's to choose. A membership now begins at `onboarding`
 * and nowhere else. The old sequence walked `carried_forward → confirmed`, and
 * both of those map onto `onboarding`: writing it today would record two
 * transitions from a state to itself, which is a history asserting changes that
 * did not happen. What distinguishes a returner from a new player is `entry`,
 * which is where that fact always lived.
 *
 * `actorPersonId` is the `personId` from `resolveOperator()`. It is a required
 * argument and is never defaulted — see `src/lib/services/README.md` rule 1.
 */
export async function enterReturningPlayer(params: {
  actorPersonId: string;
  input: ReturnerIntakeInput;
  decision: IntakeDecision;
}): Promise<ReturnerIntakeResult> {
  const { actorPersonId, decision } = params;
  const input = normaliseInput(params.input);

  if (!trimmedOrNull(actorPersonId)) {
    throw new ConstraintViolated("A returner intake must name the operator who performed it.", {
      rule: "audit_events_has_an_actor",
    });
  }

  return withTransaction(async (tx) => {
    const season = await resolveOpenSeason(tx);

    const personId =
      decision.kind === "existing"
        ? await requireExistingPerson(tx, decision.personId)
        : await insertPerson(tx, input);
    const personCreated = decision.kind === "new";

    // Invariant I2, checked here so the operator gets UX-12's sentence rather
    // than an integrity error. The unique constraint underneath is still the
    // guarantee — this check can lose a race with a concurrent submission, and
    // when it does, `mapDatabaseError` turns
    // `season_memberships_one_per_person_per_season` into the same refusal.
    if (!personCreated) await refuseExistingMembership(tx, personId, season);

    // Only for a person this submission minted. Appending a name form to an
    // existing person's alias history from an intake form would be editing a
    // record the operator did not ask to edit — and because
    // `findPersonCandidates` matches on aliases, a mistyped "Known as" would
    // permanently widen that person's future duplicate matching.
    const aliasCreated = personCreated ? await insertAliasIfDistinct(tx, personId, input) : false;

    // LAN-257, and the same rule as the alias above for the same reason.
    //
    // "Use selected person" used to append every typed value to the chosen
    // person's `contact_points`. A number typed from memory that differed from
    // the one on file went in as a second, non-preferred row — which no screen
    // in the product lists, so the operator saw their number accepted, saw the
    // person's real number on the confirmation, and had no way to tell that a
    // third value now existed. Meanwhile `/operate/people/new`'s "This is
    // them" wrote nothing at all. Two link flows, two behaviours, neither
    // stated.
    //
    // Both now discard. Linking says "this human is that human"; it is not an
    // edit of that human's record, and an intake form is not where somebody's
    // known-good number gets superseded or quietly doubled. What was discarded
    // is returned so the confirmation says so — `contactsNotRecorded`. The
    // person record's own edit surface (`W2`) is where a contact changes.
    const contactsRecorded = personCreated ? await insertContactPoints(tx, personId, input) : [];
    const contactsNotRecorded = personCreated
      ? []
      : await typedContactsNotOnRecord(tx, personId, input);

    const confirmedOn = await currentDate(tx);
    const membershipId = await insertMembership(tx, {
      personId,
      seasonId: season.id,
      confirmedOn,
    });

    // The transition record, in its typed home. One row, because one thing
    // happened: this person now holds a membership and is working through
    // onboarding.
    await recordStatusEvent(
      tx,
      membershipId,
      null,
      "onboarding",
      actorPersonId,
      "Returner verification completed (operator entry)",
    );

    // Frozen model §2.1: confirmation is what generates the season's onboarding
    // items. LAN-75 owns the rule and the function; the call belongs here
    // because this is the only place in the application where a membership
    // becomes `confirmed`, and generating them one screen later would leave the
    // operator activating a membership whose items they never got to resolve.
    //
    // In the same transaction as the confirmation it describes, so a rolled-back
    // intake cannot leave orphan items behind. Idempotent, so a season with no
    // configured types is a no-op rather than a failure.
    await generateOnboardingItems(tx, membershipId, season.id);

    // LAN-215, `REQ-one-welcome`: the welcome queued in the same transaction
    // as the membership and the checklist — W2's own addition, and the one
    // thing that used to distinguish "the surface exists" from "the surface
    // opens onto onboarding". A person who has explicitly refused or
    // withdrawn messaging consent throws here (`InvalidTransition`), and the
    // whole transaction rolls back with them — "a person on the roster who
    // was never told" is the failure this exists to prevent, matching W2's
    // own exceptions table.
    const welcome = await emitOnboardingOpenedWelcomeIn(tx, {
      membershipId,
      personId,
      seasonId: season.id,
    });

    // Brian, this session (LAN-215, B-008): "When a player gets added into
    // the board, their availability should be flipped to green by default."
    // In the same transaction as the membership, via `commitAvailability` —
    // never a hand-written insert. `availability_statuses_green_records_its_
    // confirmer` requires a confirmer on every green row even though an
    // arrival is not "a return to full availability" in Requirement 8's
    // sense; the operator performing this arrival is recorded as both
    // reporter and confirmer, because they are the one asserting the player
    // is available. `commitAvailability` joins this transaction rather than
    // opening its own — see `src/lib/db/transaction.ts`'s join semantics.
    // `effectiveFrom` is `confirmedOn`, the membership's own joining date.
    await commitAvailability({
      actorPersonId,
      membershipId,
      level: "green",
      effectiveFrom: confirmedOn,
    });

    if (personCreated) {
      await recordAudit(tx, {
        actorPersonId,
        action: "person_created",
        entityTable: "people",
        entityId: personId,
        reason: "Operator confirmed this is a person the club has no record of.",
        context: {
          issue: "LAN-74",
          via: "returner_intake",
          dedupe_decision: "new_person",
          contact_kinds_recorded: contactsRecorded.map((contact) => contact.kind),
          alias_recorded: aliasCreated,
        },
      });
    }

    await recordAudit(tx, {
      actorPersonId,
      action: "returner_membership_confirmed",
      entityTable: "season_memberships",
      entityId: membershipId,
      reason: "Returning player entered by an operator.",
      context: {
        issue: "LAN-74",
        person_id: personId,
        season_id: season.id,
        season_label: season.label,
        entry: "returning",
        dedupe_decision: personCreated ? "new_person" : "existing_person",
        person_created: personCreated,
        // LAN-257: which kinds were typed and deliberately not written, so
        // the discard is on the record too and not only on the screen. The
        // values themselves are not audited — the point is that they were not
        // kept.
        contact_kinds_not_recorded: contactsNotRecorded.map((contact) => contact.kind),
        // The transitions themselves live in season_membership_status_events;
        // this names where to read them rather than restating them (D9).
        transitions_recorded_in: "season_membership_status_events",
      },
    });

    return {
      personId,
      membershipId,
      seasonId: season.id,
      seasonLabel: season.label,
      personCreated,
      aliasCreated,
      contactsRecorded,
      contactsNotRecorded,
      confirmedOn,
      welcomeQueued: welcome.queued,
    };
  });
}

/** `current_date` from the database, so every date in one transaction agrees. */
async function currentDate(tx: Tx): Promise<string> {
  const result = await tx.query<{ today: string }>(
    "select to_char(current_date, 'YYYY-MM-DD') as today",
  );
  return result.rows[0].today;
}

/**
 * The person the operator picked, confirmed to still exist and not to have been
 * merged away since the candidate list was drawn.
 */
async function requireExistingPerson(tx: Tx, personId: string): Promise<string> {
  const result = await tx.query<{ id: string; merged_into_person_id: string | null }>(
    "select id, merged_into_person_id from public.people where id = $1::uuid",
    [personId],
  );

  const person = result.rows[0];
  if (!person) {
    throw new NotFound(
      "That person is no longer on record. Run the duplicate check again and choose from the current list.",
      { rule: "person_not_found" },
    );
  }
  if (person.merged_into_person_id) {
    throw new Conflict(
      "That record has been merged into another person, so a new membership cannot be " +
        "created against it. Run the duplicate check again and choose the surviving record.",
      { rule: "person_merged_away" },
    );
  }
  return person.id;
}

/** UX-12: the person already holds a membership in this season (invariant I2). */
async function refuseExistingMembership(
  tx: Tx,
  personId: string,
  season: OpenSeason,
): Promise<void> {
  const result = await tx.query<{ id: string }>(
    "select id from public.season_memberships where person_id = $1::uuid and season_id = $2::uuid",
    [personId, season.id],
  );

  if (result.rows.length > 0) {
    // `rule` carries the constraint name deliberately: it is the same name the
    // database would report if this check lost a race to a concurrent
    // submission, so a caller matching on `rule` handles both routes to this
    // refusal with one branch. The membership's id is not smuggled into
    // `context` — that type is for driver detail — and the caller already has
    // it from the candidate list it drew.
    throw new Conflict(
      `This person already has a membership for the ${season.label} season. ` +
        "No duplicate membership was created, and nothing else was changed.",
      { rule: "season_memberships_one_per_person_per_season" },
    );
  }
}

async function insertPerson(tx: Tx, input: NormalisedInput): Promise<string> {
  const result = await tx.query<{ id: string }>(
    `insert into public.people (given_name, family_name, college, matriculation_year)
     values ($1, $2, $3, $4)
     returning id`,
    [input.givenName, input.familyName, input.college, input.matriculationYear],
  );
  return result.rows[0].id;
}

/**
 * Records the typed known-as as the person's display alias, when it is a
 * genuinely different name form.
 *
 * This is where LAN-182's collapse lands: known-as is no longer a column of its
 * own, it is an alias flagged `is_display_name`. One row now carries both jobs
 * — the name the club uses on screen, and the name a later import matches on.
 *
 * The seeded data has people whose known-as simply repeats the given name;
 * writing that as an alias adds a row that says nothing. A name the club
 * actually uses instead — "Ben" for "Benjamin" — is exactly what
 * `person_aliases` is for, and is what makes a later import match this person
 * without promoting a name to a key.
 *
 * Only for a newly created person. An existing person's alias history belongs
 * to whoever recorded it, and quietly appending to it from an intake form would
 * be editing a record the operator did not ask to edit.
 */
async function insertAliasIfDistinct(
  tx: Tx,
  personId: string,
  input: NormalisedInput,
): Promise<boolean> {
  const knownAs = input.knownAs;
  if (!knownAs) return false;
  if (knownAs.toLowerCase() === input.givenName.toLowerCase()) return false;

  const result = await tx.query(
    `insert into public.person_aliases (person_id, alias, source, is_display_name)
     values ($1::uuid, $2, 'operator intake', true)
     on conflict (person_id, alias) do nothing
     returning id`,
    [personId, knownAs],
  );
  return result.rowCount === 1;
}

/**
 * The typed values this submission is about to discard — LAN-257.
 *
 * A value the person already holds is not a discard: nothing was lost, and
 * telling the operator "not recorded" about a number that is right there on
 * the record would be its own false statement. Compared the same way
 * `insertContactPoint` compares, so "already on record" means the same thing
 * in both places. Every current *and* historical row counts, because a number
 * the club superseded last season is still a number the club holds.
 */
async function typedContactsNotOnRecord(
  tx: Tx,
  personId: string,
  input: NormalisedInput,
): Promise<TypedContact[]> {
  const typed: TypedContact[] = [];
  if (input.email) typed.push({ kind: "email", rawValue: input.email.raw });
  if (input.phone) typed.push({ kind: "phone", rawValue: input.phone.raw });
  if (typed.length === 0) return [];

  const discarded: TypedContact[] = [];
  for (const contact of typed) {
    const existing = await tx.query<{ matches: number }>(
      `select count(*)::int as matches from public.contact_points
        where person_id = $1::uuid and kind = $2::public.contact_point_kind
          and lower(btrim(raw_value)) = lower(btrim($3::text))`,
      [personId, contact.kind, contact.rawValue],
    );
    if (existing.rows[0].matches === 0) discarded.push(contact);
  }
  return discarded;
}

async function insertContactPoints(
  tx: Tx,
  personId: string,
  input: NormalisedInput,
): Promise<RecordedContact[]> {
  const recorded: RecordedContact[] = [];
  if (input.email) recorded.push(await insertContactPoint(tx, personId, "email", input.email.raw));
  if (input.phone) recorded.push(await insertContactPoint(tx, personId, "phone", input.phone.raw));
  return recorded;
}

/**
 * One contact point, stored exactly as typed.
 *
 * `normalised_value` is left null on purpose. Normalisation is a separate,
 * reversible step the data model deliberately keeps apart from intake, and
 * filling it in here would make this function the place a phone format policy
 * lives — which is explicitly out of LAN-74's scope.
 *
 * ## Why `is_preferred` is still conditional
 *
 * `contact_points_one_preferred_per_kind` is a partial unique index: a person
 * may hold exactly one preferred email and one preferred phone at a time.
 *
 * This used to be reached for an **existing** person too, and recorded the new
 * value as *not* preferred rather than demoting the old one. That was the
 * conservative direction on the demotion, but it was still a write onto
 * somebody's record from a form that never said it would edit one — and
 * because no screen in the product lists a non-preferred contact point, the
 * row it left was invisible. LAN-257 stopped that at the call site: only a
 * person this submission minted reaches here, and a typed value that would
 * have become that second row is discarded and named on the confirmation
 * instead.
 *
 * The condition stays because the invariant it respects is real and this
 * function must not be the place that breaks it if it is ever called again on
 * a person who already holds one.
 *
 * A value already recorded for this person under the same kind is not written
 * twice.
 */
async function insertContactPoint(
  tx: Tx,
  personId: string,
  kind: "email" | "phone",
  rawValue: string,
): Promise<RecordedContact> {
  const existing = await tx.query<{ is_preferred: boolean; same_value: boolean }>(
    `select is_preferred,
            lower(btrim(raw_value)) = lower(btrim($3::text)) as same_value
       from public.contact_points
      where person_id = $1::uuid and kind = $2::public.contact_point_kind`,
    [personId, kind, rawValue],
  );

  const alreadyRecorded = existing.rows.find((row) => row.same_value);
  if (alreadyRecorded) {
    return { kind, rawValue, isPreferred: alreadyRecorded.is_preferred };
  }

  const isPreferred = !existing.rows.some((row) => row.is_preferred);

  await tx.query(
    `insert into public.contact_points (person_id, kind, raw_value, is_preferred, source)
     values ($1::uuid, $2::public.contact_point_kind, $3, $4, 'operator intake')`,
    [personId, kind, rawValue, isPreferred],
  );

  return { kind, rawValue, isPreferred };
}

async function insertMembership(
  tx: Tx,
  params: { personId: string; seasonId: string; confirmedOn: string },
): Promise<string> {
  // `onboarding`, which is where every membership starts under the five-value
  // ladder. `confirmed_on` still carries the day the club said yes — that is a
  // milestone date, and it survived the vocabulary change that struck the state
  // of the same name.
  const result = await tx.query<{ id: string }>(
    `insert into public.season_memberships
       (person_id, season_id, status, entry, confirmed_on)
     values ($1::uuid, $2::uuid, 'onboarding', 'returning', $3::date)
     returning id`,
    [params.personId, params.seasonId, params.confirmedOn],
  );
  return result.rows[0].id;
}

async function recordStatusEvent(
  tx: Tx,
  membershipId: string,
  fromStatus: string | null,
  toStatus: string,
  actorPersonId: string,
  reason: string | null = null,
): Promise<void> {
  await tx.query(
    `insert into public.season_membership_status_events
       (season_membership_id, from_status, to_status, actor_person_id, reason)
     values ($1::uuid, $2::public.membership_status, $3::public.membership_status, $4::uuid, $5)`,
    [membershipId, fromStatus, toStatus, actorPersonId, reason],
  );
}
