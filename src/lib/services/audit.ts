import "server-only";

import { createHash } from "node:crypto";

import { ConstraintViolated, type Tx } from "@/lib/db";

/**
 * The single writer for `public.audit_events`.
 *
 * ## Invariant M2, and why this is one function
 *
 * Every transition named in the frozen model §2 writes an immutable record with
 * an actor, a timestamp and — for corrections — a reason. Where the model gives
 * a transition a typed first-class home (membership lifecycle, RSVP,
 * availability, schedule change, delivery result) *that table* is the record
 * and this one is not also written; duplicating them would create the
 * reconciliation problem register D9 refuses. Everything else lands here.
 *
 * It is one function, in one place, for one reason: an audit row must be
 * written **inside the same transaction as the state change it describes**. An
 * audit row that survives a rolled-back change is a false history, which is
 * worse than no audit row — it is a record asserting something happened that
 * did not. Requiring a `Tx` argument is what makes that structural rather than
 * a rule people remember.
 *
 * ## The actor
 *
 * `actorPersonId` is the `personId` from `resolveOperator()` — the person
 * behind the *verified* session. It is never defaulted, never guessed, and
 * never filled in with a service account standing in for a human. Where the
 * actor genuinely is not a person — a scheduled job, an inbound channel event —
 * `actorLabel` names the mechanism honestly instead. The database's
 * `audit_events_has_an_actor` constraint requires one or the other; this
 * function refuses the call before it reaches the database, so that a caller
 * gets a clear failure rather than a raw integrity error.
 */
export interface AuditRecord {
  /** `people.id` of the operator responsible. From `resolveOperator()`. */
  actorPersonId?: string | null;
  /**
   * A non-human actor, named honestly — "system: rollover", "channel: whatsapp
   * inbound". Used only when there is no responsible person. Never a stand-in
   * for one.
   */
  actorLabel?: string | null;
  /** What happened, in the club's language. Free text, never blank. */
  action: string;
  /** The table the entity lives in. Not a foreign key — an audit row outlives its subject. */
  entityTable: string;
  /** The entity's id. */
  entityId: string;
  /** State before, where the change was a transition. */
  fromState?: string | null;
  /** State after, where the change was a transition. */
  toState?: string | null;
  /** Why. Required by the model for corrections; recorded whenever it is known. */
  reason?: string | null;
  /** Extra structured detail. Must be a JSON object — the database checks. */
  context?: Record<string, unknown>;
}

/** The row as written, returned so a caller can assert on it or log its id. */
export interface RecordedAuditEvent {
  id: string;
  occurredAt: Date;
}

function blank(value: string | null | undefined): boolean {
  return typeof value !== "string" || value.trim() === "";
}

/**
 * Writes exactly one `audit_events` row, in the caller's transaction.
 *
 * Throws `ConstraintViolated` — before touching the database — when the record
 * names no actor at all, when the action is blank, or when the entity table is
 * blank. Those are the three things `audit_events` itself refuses, and
 * refusing them here means the caller gets a sentence naming the problem
 * instead of an integrity error naming a constraint.
 *
 * The database keeps enforcing all three regardless. This is the ergonomic
 * layer, not the guarantee.
 */
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

// ---------------------------------------------------------------------------
// Deriving an entity id for a natural-keyed table
// ---------------------------------------------------------------------------

/**
 * A fixed namespace for {@link deriveEntityIdFromNaturalKey}, per UUIDv5's
 * own requirement (RFC 4122 §4.3) for *some* namespace to mix into the hash.
 * The value is arbitrary and carries no meaning of its own; the only property
 * that matters is that it never changes. Changing it would re-derive a
 * different id for every natural key already on file, silently breaking every
 * existing audit row's link to the subject it describes.
 */
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

/**
 * A deterministic `uuid` for an entity whose own primary key is not one.
 *
 * `audit_events.entity_id` is `uuid not null`, and until LAN-171 every audited
 * table (`events`, `people`, `seasons`, …) was itself uuid-keyed, so the
 * entity's own id always was a legal `entity_id`. `public.messaging_schedules`
 * is the first exception (OWNER-LAN171-01): its primary key is
 * `public.event_type`, a plain enum label like `"practice"`, and passing that
 * straight through made Postgres reject the audit insert — rolling back the
 * schedule change with it, silently, on every save.
 *
 * UUIDv5 (RFC 4122 §4.3) rather than a random id, because the point is
 * reproducibility: the same `(entityTable, naturalKey)` must always name the
 * same audit subject, so a reader can find every change to "practice"'s
 * messaging schedule by deriving the id again rather than by having recorded
 * it somewhere. `entityTable` is folded into the hashed name — not only
 * carried in the separate `entity_table` column — so two different tables
 * that happened to share a natural key never collide on the same derived id.
 *
 * This does not widen `audit_events.entity_id` to text, and it is not a
 * migration: the column stays a real `uuid`, and every existing uuid-keyed
 * caller is unaffected.
 */
export function deriveEntityIdFromNaturalKey(entityTable: string, naturalKey: string): string {
  return uuidV5(AUDIT_NATURAL_KEY_NAMESPACE, `${entityTable}:${naturalKey}`);
}
