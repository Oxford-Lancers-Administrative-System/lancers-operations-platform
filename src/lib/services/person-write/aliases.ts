import "server-only";

import { ConstraintViolated, NotFound, withTransaction } from "@/lib/db";
import { recordAudit } from "../audit";
import { type PersonRecord, readPersonRecordIn } from "../person-record";
import { assertNoConcurrentPersonChange, lockPersonRow, optional, requireActor } from "./shared";

/**
 * Aliases — add, remove, flag as the display name. LAN-185.
 *
 * `person-record.ts`'s own note: LAN-182 collapsed `people.known_as` into
 * `person_aliases`, where a single row may be flagged `is_display_name`
 * (`person_aliases_one_display_name_per_person`, at most one per person).
 * Every write here needs no reason: aliases are name forms, not the durable
 * facts `REQ-audit`'s reason rule guards, and the workflow names none.
 */

/**
 * Adds one alias. Never a reason, never destructive — a second alias is
 * additional evidence, not a correction to the first.
 */
export async function addPersonAlias(params: {
  actorPersonId: string;
  personId: string;
  alias: string;
  /** Free text — who supplied it, `REQ-no-verification-mark`'s posture applied to a name form. */
  source?: string | null;
  expectedVersion?: string | null;
}): Promise<PersonRecord> {
  const { actorPersonId, personId } = params;
  requireActor(actorPersonId);
  const alias = params.alias.trim();
  if (alias === "") {
    throw new ConstraintViolated("An alias cannot be blank.", {
      rule: "person_aliases_alias_not_blank",
    });
  }

  return withTransaction(async (tx) => {
    await lockPersonRow(tx, personId);
    await assertNoConcurrentPersonChange(tx, personId, params.expectedVersion);

    const existing = await tx.query(
      `select 1 from public.person_aliases where person_id = $1::uuid and alias = $2`,
      [personId, alias],
    );
    if (existing.rows.length > 0) {
      throw new ConstraintViolated("This person already carries that alias.", {
        rule: "person_aliases_unique_per_person",
      });
    }

    const inserted = await tx.query<{ id: string }>(
      `insert into public.person_aliases (person_id, alias, source)
       values ($1::uuid, $2, $3)
       returning id`,
      [personId, alias, optional(params.source)],
    );

    await recordAudit(tx, {
      actorPersonId,
      action: "person_alias_added",
      entityTable: "person_aliases",
      entityId: inserted.rows[0].id,
      fromState: null,
      toState: alias,
      context: { issue: "LAN-185", person_id: personId },
    });

    return readPersonRecordIn(tx, personId);
  });
}

/**
 * Removes one alias. Not a delete for the *person* — `given_name`,
 * `family_name` and every other durable fact are untouched — but it is a
 * real row delete on `person_aliases`, which carries no soft-hide column of
 * its own on `main`. The audit row this writes is what "kept as dedupe
 * evidence" means once the live row is gone: the fact that this person once
 * carried this name form survives permanently in `audit_events`, readable on
 * the person's own history, even though `findPersonDuplicates()` — which
 * matches only current, live rows — can no longer see it. Recorded here
 * rather than smoothed over: a structural "hidden, not deleted" column is a
 * migration, and this package does not own one.
 */
export async function removePersonAlias(params: {
  actorPersonId: string;
  personId: string;
  aliasId: string;
  expectedVersion?: string | null;
}): Promise<PersonRecord> {
  const { actorPersonId, personId, aliasId } = params;
  requireActor(actorPersonId);

  return withTransaction(async (tx) => {
    await lockPersonRow(tx, personId);
    await assertNoConcurrentPersonChange(tx, personId, params.expectedVersion);

    const existing = await tx.query<{ alias: string }>(
      `delete from public.person_aliases where id = $1::uuid and person_id = $2::uuid
       returning alias`,
      [aliasId, personId],
    );
    const row = existing.rows[0];
    if (!row) {
      throw new NotFound("That alias is not on this person's record.", {
        rule: "person_aliases_not_found",
      });
    }

    await recordAudit(tx, {
      actorPersonId,
      action: "person_alias_removed",
      entityTable: "person_aliases",
      entityId: aliasId,
      fromState: row.alias,
      toState: null,
      context: { issue: "LAN-185", person_id: personId },
    });

    return readPersonRecordIn(tx, personId);
  });
}

/**
 * Flags one alias as the display name, replacing whichever alias held the
 * flag before — `person_aliases_one_display_name_per_person` permits at most
 * one. The list's name column follows this immediately, because
 * `person-record.ts`'s `displayNameOf()` reads it directly.
 */
export async function setDisplayNamePersonAlias(params: {
  actorPersonId: string;
  personId: string;
  aliasId: string;
  expectedVersion?: string | null;
}): Promise<PersonRecord> {
  const { actorPersonId, personId, aliasId } = params;
  requireActor(actorPersonId);

  return withTransaction(async (tx) => {
    await lockPersonRow(tx, personId);
    await assertNoConcurrentPersonChange(tx, personId, params.expectedVersion);

    const target = await tx.query<{ alias: string; is_display_name: boolean }>(
      `select alias, is_display_name from public.person_aliases
        where id = $1::uuid and person_id = $2::uuid`,
      [aliasId, personId],
    );
    const row = target.rows[0];
    if (!row) {
      throw new NotFound("That alias is not on this person's record.", {
        rule: "person_aliases_not_found",
      });
    }
    if (row.is_display_name) {
      throw new ConstraintViolated("This alias is already the display name.", {
        rule: "person_alias_display_name_unchanged",
      });
    }

    // Unflag whichever alias held it, then flag this one — in one statement so
    // the partial unique index is never asked to hold two `true` rows at once.
    await tx.query(
      `update public.person_aliases
          set is_display_name = (id = $1::uuid)
        where person_id = $2::uuid and (is_display_name or id = $1::uuid)`,
      [aliasId, personId],
    );

    await recordAudit(tx, {
      actorPersonId,
      action: "person_alias_display_name_set",
      entityTable: "person_aliases",
      entityId: aliasId,
      fromState: null,
      toState: row.alias,
      context: { issue: "LAN-185", person_id: personId },
    });

    return readPersonRecordIn(tx, personId);
  });
}
