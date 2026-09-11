import "server-only";

import { withTransaction } from "@/lib/db";
import { personDisplayNameSql } from "../sql-text";

/** The history section — `REQ-history-on-record`, `W1-11` and `W1-12`. */

export interface PersonHistoryEntry {
  /** Stable across a render — `audit_events.id`, or a status-event id. */
  id: string;
  occurredAt: Date;
  /** What kind of thing changed — "Status", "Person", "Membership" — the field filter's own vocabulary. */
  field: string;
  summary: string;
  fromValue: string | null;
  toValue: string | null;
  actorDisplayName: string;
  reason: string | null;
}

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
 * Every recorded change to this person's record and memberships, newest
 * first — the `What changed` panel's whole content. Two sources: typed
 * `season_membership_status_events` (register D9), and `audit_events` rows
 * naming this person or a membership. `context` is deliberately never read
 * — unstructured JSON a future writer could put anything in;
 * `from_state`/`to_state` are the typed columns this module trusts.
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
