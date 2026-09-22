import "server-only";

import { NotFound, withTransaction, type Tx } from "@/lib/db";
import { requireCapability } from "@/lib/auth/guards";
import { recordAudit } from "../audit";

/**
 * Everything the club holds about one person, as a file — LAN-361.
 *
 * The General Manager hands this over when somebody asks for it. It is every
 * table keyed to them, whole rows, including the emergency contact: the
 * subject access right is the person's own, and their own record of who they
 * named is part of what they are entitled to.
 *
 * Tables are named explicitly, and the list is the same foreign-key inventory
 * `anonymise.ts` works from. A table added later that holds something about a
 * person is added here too — by hand. This list carries no completeness test
 * of its own; the one that does exist, `tests/person-merge-reference-catalogue.test.ts`,
 * checks `PERSON_REFERENCE_COLUMNS` (the merge catalogue, `person-merge/write.ts`)
 * against `pg_constraint` directly, not this list.
 */

/** A row source: the table, and how a row of it is tied to one person. */
interface ExportSource {
  readonly table: string;
  readonly sql: string;
}

const DIRECT = (table: string, column = "person_id"): ExportSource => ({
  table,
  sql: `select * from ${table} where ${column} = $1::uuid`,
});

const VIA_MEMBERSHIP = (table: string): ExportSource => ({
  table,
  sql: `select * from ${table} where season_membership_id in (
          select id from public.season_memberships where person_id = $1::uuid)`,
});

const VIA_INVITATION = (table: string): ExportSource => ({
  table,
  sql: `select * from ${table} where invitation_id in (
          select id from public.invitations where person_id = $1::uuid)`,
});

const VIA_PROSPECT = (table: string): ExportSource => ({
  table,
  sql: `select * from ${table} where prospect_id in (
          select id from public.recruitment_prospects where person_id = $1::uuid)`,
});

/** Every table this system keys to a person, as a subject rather than as an actor. */
const PERSON_EXPORT_SOURCES: readonly ExportSource[] = Object.freeze([
  DIRECT("public.people", "id"),
  DIRECT("public.person_aliases"),
  DIRECT("public.contact_points"),
  // Third-party data, included deliberately: it is the person's own record of
  // who they named, and a subject access request reaches it.
  DIRECT("public.person_emergency_contacts"),
  DIRECT("public.person_fact_disputes"),
  DIRECT("public.person_access_tokens"),
  DIRECT("public.operator_accounts"),
  DIRECT("public.role_assignments"),
  DIRECT("public.season_memberships"),
  DIRECT("public.season_messaging_consents"),
  DIRECT("public.onboarding_agreements"),
  DIRECT("public.invitations"),
  DIRECT("public.attendance_records"),
  DIRECT("public.event_audience_members"),
  DIRECT("public.notification_jobs"),
  DIRECT("public.recruitment_prospects"),
  DIRECT("public.follow_up_actions", "subject_person_id"),
  VIA_MEMBERSHIP("public.onboarding_items"),
  VIA_MEMBERSHIP("public.onboarding_item_history"),
  VIA_MEMBERSHIP("public.onboarding_activity_log"),
  VIA_MEMBERSHIP("public.season_membership_status_events"),
  VIA_MEMBERSHIP("public.position_assignments"),
  VIA_MEMBERSHIP("public.membership_position_groups"),
  VIA_MEMBERSHIP("public.special_teams_assignments"),
  VIA_MEMBERSHIP("public.kit_issue_records"),
  VIA_MEMBERSHIP("public.warmup_group_assignments"),
  VIA_MEMBERSHIP("public.jersey_assignments"),
  VIA_MEMBERSHIP("public.coach_group_assignments"),
  VIA_MEMBERSHIP("public.formalwear_records"),
  VIA_MEMBERSHIP("public.blues_awards"),
  VIA_MEMBERSHIP("public.bps_selections"),
  VIA_MEMBERSHIP("public.eligibility_records"),
  VIA_MEMBERSHIP("public.availability_statuses"),
  VIA_INVITATION("public.rsvp_responses"),
  VIA_INVITATION("public.question_responses"),
  VIA_INVITATION("public.rsvp_access_tokens"),
  VIA_INVITATION("public.nonresponse_flags"),
  VIA_PROSPECT("public.recruitment_prospect_notes"),
  VIA_PROSPECT("public.recruitment_prospect_status_events"),
  VIA_PROSPECT("public.recruitment_questionnaire_responses"),
  {
    table: "public.audit_events",
    sql: `select * from public.audit_events
           where (entity_table = 'people' and entity_id = $1::uuid)
              or actor_person_id = $1::uuid`,
  },
  {
    table: "public.delivery_results",
    sql: `select * from public.delivery_results where notification_job_id in (
            select id from public.notification_jobs where person_id = $1::uuid)`,
  },
  {
    table: "staging.legacy_roster_rows",
    sql: `select * from staging.legacy_roster_rows where matched_person_id = $1::uuid`,
  },
]);

interface PersonExport {
  readonly controller: string;
  readonly personId: string;
  readonly producedAt: string;
  readonly tables: Readonly<Record<string, readonly unknown[]>>;
}

async function buildExportIn(tx: Tx, personId: string): Promise<PersonExport> {
  const exists = await tx.query<{ id: string }>(
    `select id from public.people where id = $1::uuid`,
    [personId],
  );
  if (!exists.rows[0]) {
    throw new NotFound("That person is not on record.", { rule: "people_not_found" });
  }

  const tables: Record<string, readonly unknown[]> = {};
  for (const source of PERSON_EXPORT_SOURCES) {
    // Sequential, not `Promise.all`: `pg` serialises concurrent calls on one
    // pooled client anyway, and loudly since pg@8.
    const result = await tx.query(source.sql, [personId]);
    tables[source.table] = result.rows;
  }

  return {
    controller: "University of Oxford",
    personId,
    producedAt: new Date().toISOString(),
    tables,
  };
}

/** The export, and the audit row that records it happened. Same capability as the erasure. */
export async function exportPersonRecord(personId: string): Promise<PersonExport> {
  const operator = await requireCapability("person_erasure");
  return withTransaction(async (tx) => {
    const built = await buildExportIn(tx, personId);
    await recordAudit(tx, {
      actorPersonId: operator.personId,
      action: "person_record_exported",
      entityTable: "people",
      entityId: personId,
      context: {
        issue: "LAN-361",
        tables: Object.keys(built.tables).length,
        rows: Object.values(built.tables).reduce((total, rows) => total + rows.length, 0),
      },
    });
    return built;
  });
}
