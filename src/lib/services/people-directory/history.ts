import "server-only";

import { withTransaction } from "@/lib/db";
import { personDisplayNameSql } from "../sql-text";

/** The history section — `REQ-history-on-record`, `W1-11` and `W1-12`. */

/** One recorded change, generic over whatever actually wrote it. */
export interface PersonHistoryEntry {
  /** Stable across a render — `audit_events.id`, or a status-event id. */
  id: string;
  occurredAt: Date;
  /** What kind of thing changed — "Status", "Person", "Membership" — the field filter's own vocabulary. */
  field: string;
  /** One line naming what happened, with no further explanation. */
  summary: string;
  fromValue: string | null;
  toValue: string | null;
  actorDisplayName: string;
  reason: string | null;
}

/**
 * Turns a snake_case action into the club's words for it — "person_created"
 * becomes "Person created" — so a new action a later package writes renders
 * sensibly without this module knowing its name in advance.
 */
function humanizeAction(action: string): string {
  const words = action.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function fieldFromAction(action: string, entityTable: string): string {
  if (action.includes("person")) return "Person";
  if (entityTable === "season_memberships" || action.includes("membership")) return "Membership";
  return humanizeAction(action);
}

const STATUS_HISTORY_LABELS: Readonly<Record<string, string>> = Object.freeze({
  onboarding: "Onboarding",
  active: "Active",
  inactive: "Inactive",
  departed: "Departed",
  archived: "Archived",
});

/**
 * Every recorded change to this person's durable record and to the
 * memberships it holds, newest first — the `What changed` panel's whole
 * content. Read-only, and reads no more than `readPersonRecord()`'s own
 * `NotFound` already lets a caller learn: this throws nothing extra when the
 * person genuinely has no history yet, because a fresh record with no changes
 * is a real state, not an error.
 *
 * Two sources, because the frozen model gives status transitions a typed home
 * of their own (register D9) rather than duplicating them into
 * `audit_events`:
 *
 *   * `season_membership_status_events` for every membership this person
 *     holds, in any season — a real, typed history that exists today.
 *   * `audit_events` rows naming this person (`entity_table = 'people'`) or
 *     one of their memberships (`entity_table = 'season_memberships'`) —
 *     which is where `W2`'s corrections and `W4`'s merges will land once
 *     those packages write them, and where `returner_membership_confirmed`
 *     and `person_created` already do.
 *
 * `context` is deliberately never read here. It is unstructured JSON that a
 * future writer could put anything in, including a raw contact value on its
 * way to becoming the audit trail of a correction — `from_state`/`to_state`
 * are the typed, short columns this module trusts to describe a change.
 */
export async function readPersonHistory(personId: string): Promise<PersonHistoryEntry[]> {
  return withTransaction(async (tx) => {
    const memberships = await tx.query<{ id: string; season_label: string }>(
      `select m.id, s.label as season_label
         from public.season_memberships m
         join public.seasons s on s.id = m.season_id
        where m.person_id = $1::uuid`,
      [personId],
    );
    const membershipIds = memberships.rows.map((row) => row.id);
    const seasonLabelByMembership = new Map(
      memberships.rows.map((row) => [row.id, row.season_label]),
    );

    // `= any($1::uuid[])` over an empty array is a legal, empty-matching
    // predicate in PostgreSQL, so this runs unconditionally rather than
    // branching on whether the person holds a membership at all.
    const statusEvents = await tx.query<{
      id: string;
      season_membership_id: string;
      from_status: string | null;
      to_status: string;
      occurred_at: Date;
      reason: string | null;
      actor_display_name: string | null;
    }>(
      `select e.id, e.season_membership_id, e.from_status::text as from_status,
              e.to_status::text as to_status, e.occurred_at, e.reason,
              ${personDisplayNameSql("actor")} as actor_display_name
         from public.season_membership_status_events e
         left join public.people actor on actor.id = e.actor_person_id
        where e.season_membership_id = any($1::uuid[])`,
      [membershipIds],
    );

    const auditRows = await tx.query<{
      id: string;
      action: string;
      entity_table: string;
      from_state: string | null;
      to_state: string | null;
      reason: string | null;
      occurred_at: Date;
      actor_label: string | null;
      actor_display_name: string | null;
    }>(
      `select a.id, a.action, a.entity_table, a.from_state, a.to_state, a.reason, a.occurred_at,
              a.actor_label,
              ${personDisplayNameSql("actor")} as actor_display_name
         from public.audit_events a
         left join public.people actor on actor.id = a.actor_person_id
        where (a.entity_table = 'people' and a.entity_id = $1::uuid)
           or (a.entity_table = 'season_memberships' and a.entity_id = any($2::uuid[]))
           -- LAN-185: contact-point supersedes and alias changes are audited
           -- against their own row's id, with the person carried in context
           -- rather than as entity_id -- see person-write.ts's
           -- supersedeContactPoint() and its alias functions. The emergency
           -- contact's own audit rows already use entity_id = personId
           -- directly (REQ-restricted-fields: no value ever reaches
           -- context for that table), so it needs no extra predicate here.
           or (a.entity_table in ('contact_points', 'person_aliases')
               and a.context ->> 'person_id' = $1::text)
           or (a.entity_table = 'person_emergency_contacts' and a.entity_id = $1::uuid)
        order by a.occurred_at desc`,
      [personId, membershipIds],
    );

    const fromStatusEvents: PersonHistoryEntry[] = statusEvents.rows.map((row) => {
      const seasonLabel = seasonLabelByMembership.get(row.season_membership_id) ?? "";
      const from = row.from_status
        ? (STATUS_HISTORY_LABELS[row.from_status] ?? row.from_status)
        : null;
      const to = STATUS_HISTORY_LABELS[row.to_status] ?? row.to_status;
      return {
        id: `status-event-${row.id}`,
        occurredAt: row.occurred_at,
        field: "Status",
        summary: `Status changed · ${seasonLabel}`,
        fromValue: from,
        toValue: to,
        actorDisplayName: row.actor_display_name ?? "Unknown",
        reason: row.reason,
      };
    });

    const fromAudit: PersonHistoryEntry[] = auditRows.rows.map((row) => ({
      id: `audit-event-${row.id}`,
      occurredAt: row.occurred_at,
      field: fieldFromAction(row.action, row.entity_table),
      summary: humanizeAction(row.action),
      fromValue: row.from_state,
      toValue: row.to_state,
      actorDisplayName: row.actor_display_name ?? row.actor_label ?? "Unknown",
      reason: row.reason,
    }));

    return [...fromStatusEvents, ...fromAudit].sort(
      (a, b) => b.occurredAt.getTime() - a.occurredAt.getTime(),
    );
  });
}
