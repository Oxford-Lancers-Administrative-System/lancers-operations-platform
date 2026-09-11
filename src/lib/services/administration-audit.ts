import "server-only";

import { assertCapability } from "@/lib/auth/guards";
import type { ResolvedOperator } from "@/lib/auth/operator";
import { ConstraintViolated, withTransaction, type Tx } from "@/lib/db";
import { recordAudit, type RecordedAuditEvent } from "./audit";
import { personDisplayNameSql } from "./sql-text";
import {
  ADMINISTRATION_ACTIONS,
  ADMINISTRATION_CONTEXT_KEY,
  ADMINISTRATION_ENVELOPE_VERSION,
  ADMINISTRATION_EVENTS,
  isUuid,
  prepareAdministrationEvent,
  ROLE_RELATED_ADMINISTRATION_ACTIONS,
  type AdministrationAction,
  type AdministrationEventDefinition,
  type AdministrationEventFamily,
  type AdministrationEventRecord,
  type AdministrationOperatingYear,
} from "./administration-events";

// Administration audit: one canonical event stream, two projections over it — LAN-130,
// REQ-append-only-audit-evidence. One audit_events row per change (./audit.ts's writer); the two
// reads share it through different envelope keys. Both assert role_management. See relocations.md.

export const ADMINISTRATION_HISTORY_CAPABILITY = "role_management" as const;

// One canonical event inside the caller's transaction (invariant M2, ./audit.ts). Refuses, before
// touching the database, an unrecognised action, a missing field, a self-action, or a no-op — see prepareAdministrationEvent.
export async function recordAdministrationEvent(
  tx: Tx,
  record: AdministrationEventRecord,
): Promise<RecordedAuditEvent> {
  const prepared = prepareAdministrationEvent(record);

  return recordAudit(tx, {
    actorPersonId: prepared.actorPersonId,
    action: prepared.action,
    entityTable: prepared.entityTable,
    entityId: prepared.entityId,
    fromState: prepared.fromState,
    toState: prepared.toState,
    reason: prepared.reason,
    context: { [ADMINISTRATION_CONTEXT_KEY]: prepared.envelope },
  });
}

// What an entry says when its envelope can't be read — LAN-130 finding A6. Columns stay readable.
export interface UnreadableAdministrationEntry {
  reason: "unsupported-envelope-version" | "missing-envelope"; // programmatic, never matched on the message below
  storedVersion: number | null;
  message: string; // club-facing, for the surface that renders the gap
}

export const UNREADABLE_ENTRY_MESSAGE = // exported so both history surfaces say the same thing
  "This event is in the record but was written by a newer version of the application, " +
  "so its full detail cannot be shown here.";

// One entry, in either projection. unreadable is part of the ordinary entry, not a separate variant (see relocations.md).
export interface AdministrationHistoryEntry {
  id: string; // audit_events.id
  occurredAt: string; // ISO-8601
  action: AdministrationAction;
  family: AdministrationEventFamily;
  label: string;
  actor: {
    personId: string | null;
    name: string; // the actor's name, or the honest label of a non-human mechanism
  };
  authority: {
    kind: "capability" | "self";
    capability: string | null;
    roleCodes: string[];
  };
  target: {
    personId: string | null; // null only on an unreadable entry whose envelope named no target
    operatorAccountId: string | null;
    name: string | null;
  };
  role: { id: string; code: string; assignmentId: string } | null; // present only in the role-related subset
  operatingYear: AdministrationOperatingYear;
  fromState: string | null;
  toState: string | null;
  reason: string | null;
  correlationId: string | null; // links the two events of one replacement; null for standalone
  backdated: boolean;
  detail: Record<string, unknown>;
  unreadable: UnreadableAdministrationEntry | null;
}

interface HistoryRow {
  id: string;
  occurred_at: Date;
  action: string;
  actor_person_id: string | null;
  actor_label: string | null;
  actor_name: string | null;
  target_name: string | null;
  from_state: string | null;
  to_state: string | null;
  reason: string | null;
  context: Record<string, unknown> | null;
}

// Tie-break for two events in one transaction — LAN-130 finding A1 (see relocations.md).
const INSTANT_ORDER_CASE = (() => {
  const branches = ADMINISTRATION_ACTIONS.map((action) => {
    if (!/^[a-z_.]+$/.test(action)) {
      throw new Error(`Administration action "${action}" cannot be embedded in SQL.`);
    }
    return `when '${action}' then ${ADMINISTRATION_EVENTS[action].instantOrder}`;
  });
  return `case e.action ${branches.join(" ")} else 0 end`;
})();

// The one query both projections run. Filters on the closed action set (see relocations.md);
// compares the target id as text, not cast to uuid, so one malformed value fails to match, not errors.
function historyQuery(keyPath: "targetPersonId" | "roleId"): string {
  return `
    select e.id,
           e.occurred_at,
           e.action,
           e.actor_person_id,
           e.actor_label,
           ${personDisplayNameSql("actor")} as actor_name,
           target.name as target_name,
           e.from_state,
           e.to_state,
           e.reason,
           e.context
      from public.audit_events e
      left join public.people actor on actor.id = e.actor_person_id
      left join lateral (
        select ${personDisplayNameSql("p")} as name
          from public.people p
         where p.id::text = e.context -> '${ADMINISTRATION_CONTEXT_KEY}' ->> 'targetPersonId'
         limit 1
      ) target on true
     where e.action = any($1::text[])
       and e.context -> '${ADMINISTRATION_CONTEXT_KEY}' ->> '${keyPath}' = $2
     order by e.occurred_at desc, ${INSTANT_ORDER_CASE} desc, e.id desc`;
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

// Fields readable from the row's own columns whatever the envelope says.
function columnFields(
  row: HistoryRow,
  definition: AdministrationEventDefinition,
): Pick<
  AdministrationHistoryEntry,
  "id" | "occurredAt" | "action" | "family" | "label" | "actor" | "fromState" | "toState" | "reason"
> {
  return {
    id: row.id,
    occurredAt: row.occurred_at.toISOString(),
    action: definition.action,
    family: definition.family,
    label: definition.label,
    actor: {
      personId: row.actor_person_id,
      name: row.actor_name ?? row.actor_label ?? "Unknown",
    },
    fromState: row.from_state,
    toState: row.to_state,
    reason: row.reason,
  };
}

// A row whose envelope this version cannot read stays in the list, marked (LAN-130 finding A6).
function toUnreadableEntry(
  row: HistoryRow,
  definition: AdministrationEventDefinition,
  reason: UnreadableAdministrationEntry["reason"],
  storedVersion: number | null,
): AdministrationHistoryEntry {
  const envelope = asObject(asObject(row.context)[ADMINISTRATION_CONTEXT_KEY]);

  return {
    ...columnFields(row, definition),
    authority: { kind: "capability", capability: null, roleCodes: [] },
    target: {
      personId: asStringOrNull(envelope.targetPersonId), // knowable even here — the query found the row by it
      operatorAccountId: null,
      name: row.target_name,
    },
    role: null,
    operatingYear: { scope: "committee_year", id: "", label: "" },
    correlationId: null,
    backdated: false,
    detail: {},
    unreadable: { reason, storedVersion, message: UNREADABLE_ENTRY_MESSAGE },
  };
}

// Returns null only for an action outside the closed set (query makes it unreachable — a defence).
function toEntry(row: HistoryRow): AdministrationHistoryEntry | null {
  const definition = ADMINISTRATION_EVENTS[row.action as AdministrationAction];
  if (!definition) return null;

  const envelope = asObject(asObject(row.context)[ADMINISTRATION_CONTEXT_KEY]);
  const storedVersion = typeof envelope.version === "number" ? envelope.version : null;

  if (storedVersion !== ADMINISTRATION_ENVELOPE_VERSION) {
    return toUnreadableEntry(
      row,
      definition,
      storedVersion === null ? "missing-envelope" : "unsupported-envelope-version",
      storedVersion,
    );
  }

  const targetPersonId = asStringOrNull(envelope.targetPersonId);
  if (targetPersonId === null) {
    return toUnreadableEntry(row, definition, "missing-envelope", storedVersion); // version matched but the shape it promises did not
  }

  const year = asObject(envelope.operatingYear);
  const scope = year.scope === "season" ? "season" : "committee_year";
  const authority = asObject(envelope.authority);
  const roleId = asStringOrNull(envelope.roleId);
  const roleCode = asStringOrNull(envelope.roleCode);
  const roleAssignmentId = asStringOrNull(envelope.roleAssignmentId);

  return {
    ...columnFields(row, definition),
    authority: {
      kind: authority.kind === "self" ? "self" : "capability",
      capability: asStringOrNull(authority.capability),
      roleCodes: asStringArray(authority.roleCodes),
    },
    target: {
      personId: targetPersonId,
      operatorAccountId: asStringOrNull(envelope.targetOperatorAccountId),
      name: row.target_name,
    },
    role:
      roleId !== null && roleCode !== null && roleAssignmentId !== null
        ? { id: roleId, code: roleCode, assignmentId: roleAssignmentId }
        : null,
    operatingYear: {
      scope,
      id: asStringOrNull(year.id) ?? "",
      label: asStringOrNull(year.label) ?? "",
    },
    correlationId: asStringOrNull(envelope.correlationId),
    backdated: envelope.backdated === true,
    detail: asObject(envelope.detail),
    unreadable: null,
  };
}

function assertReadable(operator: ResolvedOperator | null): void {
  assertCapability(operator, ADMINISTRATION_HISTORY_CAPABILITY);
}

function assertSubjectId(id: string, subject: "operator" | "role"): void {
  if (!isUuid(id)) {
    throw new ConstraintViolated(
      subject === "operator"
        ? "That is not an operator this club holds a record for."
        : "That is not a club role this catalogue holds.",
      { rule: `administration_history_${subject}_id_invalid` },
    );
  }
}

// Operator audit history: every administration event affecting one Person, newest first — the
// envelope's targetPersonId, not the polymorphic entity pointer (see relocations.md).
export async function readOperatorAuditHistory(
  operator: ResolvedOperator | null,
  personId: string,
): Promise<AdministrationHistoryEntry[]> {
  return withTransaction((tx) => readOperatorAuditHistoryIn(tx, operator, personId));
}

// Guarded here too, not only in the wrapper.
export async function readOperatorAuditHistoryIn(
  tx: Tx,
  operator: ResolvedOperator | null,
  personId: string,
): Promise<AdministrationHistoryEntry[]> {
  assertReadable(operator);
  assertSubjectId(personId, "operator");

  const result = await tx.query<HistoryRow>(historyQuery("targetPersonId"), [
    [...ADMINISTRATION_ACTIONS],
    personId,
  ]);

  return result.rows
    .map(toEntry)
    .filter((entry): entry is AdministrationHistoryEntry => entry !== null);
}

// Holder history: the role-related subset of the same stream, for one role, newest first (see relocations.md).
export async function readHolderHistory(
  operator: ResolvedOperator | null,
  roleId: string,
): Promise<AdministrationHistoryEntry[]> {
  return withTransaction((tx) => readHolderHistoryIn(tx, operator, roleId));
}

export async function readHolderHistoryIn(
  tx: Tx,
  operator: ResolvedOperator | null,
  roleId: string,
): Promise<AdministrationHistoryEntry[]> {
  assertReadable(operator);
  assertSubjectId(roleId, "role");

  const result = await tx.query<HistoryRow>(historyQuery("roleId"), [
    [...ROLE_RELATED_ADMINISTRATION_ACTIONS],
    roleId,
  ]);

  return result.rows
    .map(toEntry)
    .filter((entry): entry is AdministrationHistoryEntry => entry !== null);
}

export {
  ADMINISTRATION_ACTIONS,
  ADMINISTRATION_EVENTS,
  ROLE_RELATED_ADMINISTRATION_ACTIONS,
  isAdministrationAction,
  type AdministrationAction,
  type AdministrationEventFamily,
  type AdministrationEventRecord,
  type AdministrationOperatingYear,
} from "./administration-events";
