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

/**
 * Returner intake's write path — LAN-74. Records one returning player in one
 * transaction: person, alias, contact points, membership, status-history,
 * queued welcome, availability row (LAN-215 B-008), and audit rows, all or
 * nothing. A membership begins at `onboarding` only (frozen model §2.1,
 * LAN-182). `actorPersonId` is required, never defaulted.
 * Decision history: LAN-74, docs/operating-the-slice.md; LAN-182, missions/intake/M-PEOPLE-AND-ROSTER
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

    // Invariant I2, UX-12.
    if (!personCreated) await refuseExistingMembership(tx, personId, season);

    const aliasCreated = personCreated ? await insertAliasIfDistinct(tx, personId, input) : false;

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

    await recordStatusEvent(
      tx,
      membershipId,
      null,
      "onboarding",
      actorPersonId,
      "Returner verification completed (operator entry)",
    );

    // LAN-75.
    await generateOnboardingItems(tx, membershipId, season.id);

    // LAN-215.
    const welcome = await emitOnboardingOpenedWelcomeIn(tx, {
      membershipId,
      personId,
      seasonId: season.id,
    });

    // LAN-215 B-008.
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
        contact_kinds_not_recorded: contactsNotRecorded.map((contact) => contact.kind),
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

/** Confirms the picked person still exists and was not merged away. */
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
 * Records the typed known-as as the person's display alias, when genuinely
 * different from the given name (LAN-182: known-as is an alias flagged
 * `is_display_name`, not its own column). Only for a newly created person.
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

/** The typed values this submission is about to discard — LAN-257; a value already on record is not a discard. */
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

/** One contact point, stored as typed (`normalised_value` left null, LAN-74). `is_preferred` conditional on the partial unique index. Only a newly minted person reaches here (LAN-257). */
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
