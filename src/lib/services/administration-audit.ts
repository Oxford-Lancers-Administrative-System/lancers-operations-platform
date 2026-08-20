import "server-only";

import { assertCapability } from "@/lib/auth/guards";
import type { ResolvedOperator } from "@/lib/auth/operator";
import { ConstraintViolated, withTransaction, type Tx } from "@/lib/db";
import { recordAudit, type RecordedAuditEvent } from "./audit";
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

/**
 * Administration audit: one canonical event stream, and the two projections
 * over it. LAN-130, `REQ-append-only-audit-evidence`.
 *
 * ## One event, two projections
 *
 * `recordAdministrationEvent` writes **one** `public.audit_events` row per
 * change, through the existing single writer in `./audit.ts`. Nothing here
 * writes a second row so that a second screen can read it more conveniently.
 *
 * The two projections are the same table read through two different keys:
 *
 *   * `readOperatorAuditHistory(operator, personId)` — every administration
 *     event whose envelope names that Person as its target, whatever family it
 *     belongs to. This is *Operator audit history*.
 *
 *   * `readHolderHistory(operator, roleId)` — the role-related subset: the
 *     events whose envelope names that role. This is *Holder history* on role
 *     detail.
 *
 * A role assignment satisfies both predicates and therefore appears in both
 * views — from the one row that was written. `administration-audit.test.ts`
 * proves that by counting rows, not by trusting this paragraph.
 *
 * ## What these reads are not
 *
 * They are not the Stage-4 general audit browser, which stays out of scope.
 * Each takes exactly one key — a Person, or a role — and returns that subject's
 * administration history newest first. There is no free-text search, no filter,
 * no date range, no export and no cross-entity investigation surface, and there
 * is deliberately no exported function that would let a caller assemble one.
 *
 * They are also not open reads. Administration history says who did what to
 * whom, which is the most sensitive thing this mission produces; both
 * projections assert `role_management` at the service boundary rather than
 * assuming a page checked first. `AGENTS.md`: the service layer is the primary
 * authorization boundary, and a hidden control is never one.
 *
 * ## Append-only
 *
 * There is no update path and no delete path here, and there will not be one:
 * `service_role` holds `select, insert` on `public.audit_events` and nothing
 * else (`20260810121000_domain_reporting.sql`), so a correction is a new event
 * and a mistake stays visible. That is the point of an audit ledger.
 */

/** The capability that may read administration history. */
export const ADMINISTRATION_HISTORY_CAPABILITY = "role_management" as const;

/**
 * Writes exactly one canonical administration audit event, in the caller's
 * transaction.
 *
 * The `Tx` argument is not a convenience. Invariant M2 holds only because the
 * audit row is written **inside the same transaction as the change it
 * describes**: a row that survives a rolled-back change is a false history,
 * which is worse than no row at all. `./audit.ts` explains that at length; this
 * function inherits it unchanged.
 *
 * Refuses — before touching the database — anything the vocabulary does not
 * recognise, anything missing a field `REQ-append-only-audit-evidence` requires,
 * a self-action the requirement forbids, and a "transition" that would change
 * nothing. See `prepareAdministrationEvent`, where every one of those rules is
 * written down and independently testable.
 */
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

// ---------------------------------------------------------------------------
// The projections
// ---------------------------------------------------------------------------

/**
 * What an entry says when its stored envelope cannot be read — LAN-130 review
 * finding A6.
 *
 * The columns are still readable, so an unreadable entry keeps its identity,
 * its timestamp, its actor, its action and its before/after state; only the
 * envelope-derived fields — authority, operating year, the role, the detail —
 * are unavailable. `unreadable` is `null` on every entry this version wrote.
 */
export interface UnreadableAdministrationEntry {
  /** Programmatic, so a caller never matches on the copy below. */
  reason: "unsupported-envelope-version" | "missing-envelope";
  /** The version found in the row, where there was one. */
  storedVersion: number | null;
  /** Club-facing, for the surface that renders the gap. */
  message: string;
}

/**
 * What a reader is told about an event this version cannot fully read.
 *
 * Exported so the two history surfaces say the same thing, and so a test can
 * assert the reader is told *something* rather than shown a shorter list.
 */
export const UNREADABLE_ENTRY_MESSAGE =
  "This event is in the record but was written by a newer version of the application, " +
  "so its full detail cannot be shown here.";

/**
 * One entry, in either projection. The same row produces the same entry.
 *
 * Every field except `unreadable` describes the event. `unreadable` is `null`
 * for an entry this version understands, and set for one it does not — see
 * `UnreadableAdministrationEntry`. It is deliberately part of the ordinary
 * entry rather than a separate variant the caller might forget to handle: for
 * an audit surface, a history that *looks* complete and is not is worse than a
 * visible gap, and a row that is simply absent from the list is exactly that.
 */
export interface AdministrationHistoryEntry {
  /** `audit_events.id` — the identity of the single stored event. */
  id: string;
  /** ISO-8601. */
  occurredAt: string;
  action: AdministrationAction;
  family: AdministrationEventFamily;
  /** Club-facing description of the action. */
  label: string;
  actor: {
    personId: string | null;
    /** The actor's name, or the honest label of a non-human mechanism. */
    name: string;
  };
  /** The authority the actor held when they acted, as recorded then. */
  authority: {
    kind: "capability" | "self";
    capability: string | null;
    roleCodes: string[];
  };
  target: {
    /** `null` only on an unreadable entry whose envelope named no target. */
    personId: string | null;
    operatorAccountId: string | null;
    name: string | null;
  };
  /** Present exactly when the event is part of the role-related subset. */
  role: { id: string; code: string; assignmentId: string } | null;
  operatingYear: AdministrationOperatingYear;
  fromState: string | null;
  toState: string | null;
  reason: string | null;
  /** Links the two events of one replacement. `null` for a standalone event. */
  correlationId: string | null;
  backdated: boolean;
  detail: Record<string, unknown>;
  /** `null` normally. Set when this version cannot read the stored envelope. */
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

/**
 * The display form of a name, matching the rest of the service layer.
 *
 * `family_name` is nullable by design — a quarter of the club's real records
 * are first-name-only — so this must not produce a trailing space.
 */
const NAME_EXPRESSION = (alias: string) =>
  `case when ${alias}.family_name is null
          then coalesce(nullif(btrim(${alias}.known_as), ''), ${alias}.given_name)
        else coalesce(nullif(btrim(${alias}.known_as), ''), ${alias}.given_name)
             || ' ' || ${alias}.family_name
   end`;

/**
 * The tie-break that makes two events written in one transaction render in a
 * meaningful order — LAN-130 review finding A1.
 *
 * `audit_events.occurred_at` defaults to `now()`, which is transaction time.
 * `WP-assignment` must write a replacement's `role.ended` and `role.assigned`
 * atomically, so both rows carry an identical timestamp and ordering on that
 * column alone leaves the pair to an arbitrary `id` tie-break — rendering the
 * successor's appointment below the outgoing holder's ending about half the
 * time, which reads as though the seat was filled before it was vacated.
 *
 * The `case` is generated from `instantOrder` on the vocabulary itself rather
 * than written out here, so the rule cannot be stated in SQL and contradicted
 * in TypeScript. The action strings are compile-time constants from this
 * repository, never caller input, and the assertion below keeps them that way:
 * anything that is not lowercase letters, dots and underscores refuses to build
 * a query at all rather than being escaped and trusted.
 */
const INSTANT_ORDER_CASE = (() => {
  const branches = ADMINISTRATION_ACTIONS.map((action) => {
    if (!/^[a-z_.]+$/.test(action)) {
      throw new Error(`Administration action "${action}" cannot be embedded in SQL.`);
    }
    return `when '${action}' then ${ADMINISTRATION_EVENTS[action].instantOrder}`;
  });
  return `case e.action ${branches.join(" ")} else 0 end`;
})();

/**
 * The one query both projections run, differing only in the envelope key they
 * filter on and the actions they admit.
 *
 * Three things it does deliberately:
 *
 *   * **It filters on the closed action set**, so a non-administration audit
 *     row — an event approval, a delivery result — can never appear in an
 *     administration history however its context is shaped. Absence of a rule
 *     is not permission here either.
 *
 *     The two projections pass *different* sets, and only one of them is
 *     separately observable. `readOperatorAuditHistory` passes the whole closed
 *     set, and {@link toEntry} independently returns `null` for anything
 *     outside it — so widening the filter there changes no answer, and LAN-141
 *     recorded that as an unbound line. It is not unbound and it is not
 *     unbacked; the two layers are one rule written twice, and the forged
 *     `event.approved` row in `administration-audit.test.ts` proves the rule
 *     rather than either copy of it. `readHolderHistory` passes the strictly
 *     narrower role-related subset, which `toEntry` does not re-apply, and that
 *     one **was** genuinely unbound — a forged account-state row carrying a
 *     `roleId` now fails if the subset is widened or the filter dropped.
 *
 *   * **It compares the target id as text**, `p.id::text = context->>…`, rather
 *     than casting the stored value to `uuid`. A cast would make a single
 *     malformed stored value an error for the whole read; a text comparison
 *     simply does not match it. The writer cannot produce one, and the read
 *     does not depend on that being true forever.
 *
 *   * **It breaks a timestamp tie by causal position**, so two events written
 *     in one transaction render in the order they happened rather than in the
 *     order their random identifiers happen to sort. See `INSTANT_ORDER_CASE`.
 */
function historyQuery(keyPath: "targetPersonId" | "roleId"): string {
  return `
    select e.id,
           e.occurred_at,
           e.action,
           e.actor_person_id,
           e.actor_label,
           ${NAME_EXPRESSION("actor")} as actor_name,
           target.name as target_name,
           e.from_state,
           e.to_state,
           e.reason,
           e.context
      from public.audit_events e
      left join public.people actor on actor.id = e.actor_person_id
      left join lateral (
        select ${NAME_EXPRESSION("p")} as name
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

/**
 * The fields readable from the row's own columns, whatever its envelope says.
 *
 * `action` reaches this function only through the closed-set filter in the
 * query, so the label and the family are always knowable: an unreadable entry
 * can still tell a reader *what kind* of thing happened, when, and who did it.
 */
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

/**
 * An entry for a row whose envelope this version cannot read — LAN-130 review
 * finding A6.
 *
 * The row stays in the list, marked. Dropping it silently was the original
 * behaviour and it was wrong for this surface specifically: an audit history
 * that looks complete and is not is worse than one with a visible gap, because
 * the first is believed. Nothing is thrown either — one unreadable row must not
 * take the other twenty with it.
 */
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
    // The key the projection matched on is knowable even here, because the
    // query found the row by it. Anything else in the envelope is not.
    target: {
      personId: asStringOrNull(envelope.targetPersonId),
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

/**
 * Turns one stored row into an entry.
 *
 * Returns `null` only for an action outside the closed set, which the query
 * makes unreachable — it is the defence that keeps this function honest if the
 * filter is ever loosened, not a case that happens. A row whose *envelope* this
 * version cannot read becomes a marked entry instead of disappearing.
 */
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
    // The version matched but the envelope is not the shape that version
    // promises. Same treatment: visible, not vanished.
    return toUnreadableEntry(row, definition, "missing-envelope", storedVersion);
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

/**
 * **Operator audit history** — every administration event affecting one Person,
 * newest first.
 *
 * "Affecting" is the envelope's `targetPersonId`, not the polymorphic entity
 * pointer: a role assignment is *about* the assignment row and *affects* the
 * holder, and this projection is the second of those. That is why the same
 * event reaches both views without being stored twice.
 *
 * Refuses a caller without `role_management`. An empty list is a legitimate
 * answer for an operator nothing has been done to, and for a Person who is not
 * an operator at all — neither discloses which.
 */
export async function readOperatorAuditHistory(
  operator: ResolvedOperator | null,
  personId: string,
): Promise<AdministrationHistoryEntry[]> {
  return withTransaction((tx) => readOperatorAuditHistoryIn(tx, operator, personId));
}

/**
 * The same read, inside a caller's transaction.
 *
 * It takes the operator and guards too, rather than trusting the wrapper above
 * to have done it. An exported read of administration history with no guard on
 * it is an unguarded read of administration history, however it is named — and
 * the whole reason this module gates at the service boundary is that a caller
 * one refactor away will reach for the cheaper-looking function.
 */
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

/**
 * **Holder history** — the role-related subset of the same stream, for one
 * role, newest first.
 *
 * The subset is `ROLE_RELATED_ADMINISTRATION_ACTIONS`, derived from the
 * vocabulary's own `roleRelated` flag, so the projection and the definition
 * cannot drift apart. Account-state events are deliberately absent: a holder
 * whose operator access is deactivated keeps the seat
 * (`REQ-deactivate-and-reinstate`), so that fact belongs to role detail's
 * *current state*, not to the history of who has held the role.
 *
 * A replacement appears as two entries sharing a `correlationId` — the outgoing
 * assignment ending and the incoming one starting. Those are two different
 * assignments changing, not one fact recorded twice.
 */
export async function readHolderHistory(
  operator: ResolvedOperator | null,
  roleId: string,
): Promise<AdministrationHistoryEntry[]> {
  return withTransaction((tx) => readHolderHistoryIn(tx, operator, roleId));
}

/** The same read, inside a caller's transaction. Guarded here too — see above. */
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
