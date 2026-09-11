import "server-only";

import { ConstraintViolated, NotFound, withTransaction } from "@/lib/db";
import { recordAudit } from "../audit";
import { type PersonRecord, readPersonRecordIn } from "../person-record";
import { assertNoConcurrentPersonChange, lockPersonRow, optional, requireActor } from "./shared";

/**
 * Aliases — add, remove, flag as the display name. LAN-185. LAN-182
 * collapsed `people.known_as` into `person_aliases` (at most one
 * `is_display_name` row). Every write here needs no reason: aliases are name
 * forms, not the durable facts `REQ-audit`'s reason rule guards.
 * Decision history: LAN-182, LAN-185, missions/intake/M-PEOPLE-AND-ROSTER
 */

export async function addPersonAlias(params: {
  actorPersonId: string;
  personId: string;
  alias: string;
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
 * Removes one alias — a real row delete, `person_aliases` has no soft-hide
 * column. The audit row is what "kept as dedupe evidence" means once the
 * live row is gone; `findPersonDuplicates()` can no longer see it.
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
