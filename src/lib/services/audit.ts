import "server-only";

import { createHash } from "node:crypto";

import { ConstraintViolated, type Tx } from "@/lib/db";

// The single writer for public.audit_events — invariant M2: written inside the same transaction as
// the change it describes (a Tx argument, not a rule to remember). actorPersonId is
// resolveOperator()'s verified person, never defaulted. See relocations.md.
export interface AuditRecord {
  actorPersonId?: string | null; // people.id of the operator responsible, from resolveOperator()
  actorLabel?: string | null; // a non-human actor, named honestly ("system: rollover") — never a stand-in for a person
  action: string; // what happened, in the club's language — free text, never blank
  entityTable: string; // not a foreign key — an audit row outlives its subject
  entityId: string;
  fromState?: string | null;
  toState?: string | null;
  reason?: string | null; // required by the model for corrections; recorded whenever known
  context?: Record<string, unknown>; // must be a JSON object — the database checks
}

export interface RecordedAuditEvent {
  id: string;
  occurredAt: Date;
}

function blank(value: string | null | undefined): boolean {
  return typeof value !== "string" || value.trim() === "";
}

// Refuses, before touching the database, the three things audit_events itself refuses.
export async function recordAudit(tx: Tx, record: AuditRecord): Promise<RecordedAuditEvent> {
  if (blank(record.actorPersonId) && blank(record.actorLabel)) {
    throw new ConstraintViolated(
      "An audit record must name who did it — either the person responsible or, " +
        "where there is no person, the mechanism that acted.",
      { rule: "audit_events_has_an_actor" },
    );
  }
  if (blank(record.action)) {
    throw new ConstraintViolated("An audit record must say what happened.", {
      rule: "audit_events_action_not_blank",
    });
  }
  if (blank(record.entityTable)) {
    throw new ConstraintViolated("An audit record must say what it is about.", {
      rule: "audit_events_entity_table_not_blank",
    });
  }

  const result = await tx.query<{ id: string; occurred_at: Date }>(
    `insert into public.audit_events
       (actor_person_id, actor_label, action, entity_table, entity_id,
        from_state, to_state, reason, context)
     values ($1, $2, $3, $4, $5, $6, $7, $8, coalesce($9::jsonb, '{}'::jsonb))
     returning id, occurred_at`,
    [
      record.actorPersonId ?? null,
      record.actorLabel ?? null,
      record.action,
      record.entityTable,
      record.entityId,
      record.fromState ?? null,
      record.toState ?? null,
      record.reason ?? null,
      record.context ? JSON.stringify(record.context) : null,
    ],
  );

  const row = result.rows[0];
  return { id: row.id, occurredAt: row.occurred_at };
}

// Fixed, arbitrary UUIDv5 namespace — never change it, or every derived id silently breaks.
const AUDIT_NATURAL_KEY_NAMESPACE = "d2719c9b-b8b1-4e3e-9c3c-9b9f6b6c9a01";

function uuidV5(namespace: string, name: string): string {
  const namespaceBytes = Buffer.from(namespace.replace(/-/g, ""), "hex");
  const nameBytes = Buffer.from(name, "utf8");
  const hash = createHash("sha1")
    .update(Buffer.concat([namespaceBytes, nameBytes]))
    .digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

// A deterministic uuid for an entity whose own primary key is not one (OWNER-LAN171-01; see relocations.md).
export function deriveEntityIdFromNaturalKey(entityTable: string, naturalKey: string): string {
  return uuidV5(AUDIT_NATURAL_KEY_NAMESPACE, `${entityTable}:${naturalKey}`);
}
