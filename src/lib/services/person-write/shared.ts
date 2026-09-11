import "server-only";

import { ConstraintViolated, NotFound, withTransaction, type Tx } from "@/lib/db";
import { actorRequirement } from "../actor";
import { PERSON_NOT_FOUND_MESSAGE } from "../person-record";
import { personDisplayNameSql } from "../sql-text";

/**
 * Helpers every write sibling shares — the reason rule, the row lock, and
 * the optimistic-concurrency guard (LAN-185, W2-09). Decision history: docs/ux/tickets/LAN-185-person-write.md.
 */

export const requireActor = actorRequirement(
  "A person record change has to name the operator who made it.",
);

export function optional(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** `REQ-audit`: a reason is required to change an existing value, never to fill an empty one (`REQ-not-recorded`). */
export function requireReasonForChange(
  oldValue: string | number | null,
  reason: string | null,
  fieldLabel: string,
): void {
  if (oldValue !== null && reason === null) {
    throw new ConstraintViolated(
      `Changing ${fieldLabel} from what is already on record needs a reason.`,
      { rule: "person_field_change_requires_a_reason" },
    );
  }
}

export async function lockPersonRow(tx: Tx, personId: string): Promise<void> {
  const result = await tx.query<{ id: string; merged_into_person_id: string | null }>(
    `select id, merged_into_person_id from public.people where id = $1::uuid for update`,
    [personId],
  );
  const row = result.rows[0];
  if (!row) throw new NotFound(PERSON_NOT_FOUND_MESSAGE, { rule: "people_not_found" });
  if (row.merged_into_person_id) {
    throw new ConstraintViolated(
      "This record was merged into another person, so it cannot be corrected on its own.",
      { rule: "person_merged_away" },
    );
  }
}

/** One row from every audit source this edit surface can change, shaped alike. */
interface LatestChangeRow {
  occurred_at: Date;
  action: string;
  entity_table: string;
  from_state: string | null;
  to_state: string | null;
  actor_display_name: string | null;
  actor_label: string | null;
}

const CONCURRENT_FIELD_LABELS: Readonly<Record<string, string>> = Object.freeze({
  person_given_name_updated: "First name",
  person_family_name_updated: "Last name",
  person_college_updated: "College",
  person_matriculation_year_updated: "Matriculation year",
  person_expected_graduation_year_updated: "Expected graduation",
  person_degree_field_updated: "Degree field",
  person_date_of_birth_updated: "Date of birth",
  person_contact_superseded: "A contact value",
  person_contact_recorded: "A contact value",
  person_alias_added: "Aliases",
  person_alias_removed: "Aliases",
  person_alias_display_name_set: "Aliases",
  person_emergency_contact_recorded: "The emergency contact",
  person_emergency_contact_field_updated: "The emergency contact",
});

/** Every audited change to this person's record, contacts, aliases or emergency contact, newest first, one row — a UNION so it is one comparison, not four. */
async function latestPersonChangeIn(tx: Tx, personId: string): Promise<LatestChangeRow | null> {
  const result = await tx.query<LatestChangeRow>(
    `select occurred_at, action, entity_table, from_state, to_state, actor_label,
            ${personDisplayNameSql("actor")} as actor_display_name
       from public.audit_events a
       left join public.people actor on actor.id = a.actor_person_id
      where (a.entity_table = 'people' and a.entity_id = $1::uuid)
         or (a.entity_table = 'person_emergency_contacts' and a.entity_id = $1::uuid)
         or (a.entity_table in ('contact_points', 'person_aliases')
             and a.context ->> 'person_id' = $1::text)
      order by occurred_at desc
      limit 1`,
    [personId],
  );
  return result.rows[0] ?? null;
}

/** The version an edit form loads with and carries back on save; `null` when nothing has ever been audited. */
async function personVersionIn(tx: Tx, personId: string): Promise<string | null> {
  const latest = await latestPersonChangeIn(tx, personId);
  return latest ? latest.occurred_at.toISOString() : null;
}

export async function personVersion(personId: string): Promise<string | null> {
  return withTransaction(async (tx) => personVersionIn(tx, personId));
}

/** Refuses with what changed underneath the caller when `expectedVersion` no longer matches. `undefined` skips the check; `null` is a checked claim. */
export async function assertNoConcurrentPersonChange(
  tx: Tx,
  personId: string,
  expectedVersion: string | null | undefined,
): Promise<void> {
  if (expectedVersion === undefined) return;
  const latest = await latestPersonChangeIn(tx, personId);
  const actual = latest ? latest.occurred_at.toISOString() : null;
  if (actual === expectedVersion) return;

  const who = latest?.actor_display_name ?? latest?.actor_label ?? "somebody else";
  const field = latest ? (CONCURRENT_FIELD_LABELS[latest.action] ?? "This record") : "This record";
  const at = latest
    ? latest.occurred_at.toLocaleString("en-GB", {
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
  const valueClause =
    latest?.to_state !== null && latest?.to_state !== undefined
      ? ` was set to ${latest.to_state}`
      : " changed";

  throw new ConstraintViolated(
    `This record changed while you were editing it. ${field}${valueClause} by ${who}` +
      (at ? ` at ${at}` : "") +
      `. Your changes were not saved.`,
    { rule: "person_concurrent_edit" },
  );
}
