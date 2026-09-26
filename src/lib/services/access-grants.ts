import "server-only";

import { FIXED_ACCESS_SEATS, isFixedAccessSeat } from "@/lib/auth/capabilities";
import { assertCapability } from "@/lib/auth/guards";
import {
  diffGrants,
  fullGrants,
  grantLevel,
  isLevelFor,
  mergeGrantRows,
  rowOfSubject,
  type GrantChange,
  type GrantLevel,
  type GrantRow,
  type GrantSubject,
  type OperatorGrants,
} from "@/lib/auth/grants";
import type { ResolvedOperator } from "@/lib/auth/operator";
import { ConstraintViolated, NotFound, NotPermitted, withTransaction, type Tx } from "@/lib/db";
import { recordAdministrationEvent } from "./administration-audit";
import type { AdministrationAction } from "./administration-events";
import { resolveCommitteeYearForActivation } from "./operator-invitations";

/**
 * A seat's access grants — LAN-429, W1 of mission
 * M-GRANULAR-ROLES-AND-PERMISSIONS (LAN-423).
 *
 * The four writes the seat page calls, and the reads it draws from. Every one
 * of them:
 *
 * - requires `role_management` of the operator (the page is gated on it too;
 *   this is the service boundary, not a courtesy);
 * - refuses any change to a **fixed seat** — President, General Manager, IT
 *   Officer — with `NotPermitted` (`access_fixed_seat`). The floor is this
 *   rule, not a row: the fixed seats hold every line at its maximum from the
 *   seed and from `createEventTemplate`, and nothing here may lower one;
 * - writes its lines and exactly one `audit_events` row in one transaction
 *   (`administration.access.changed`, `.copied` or `.granted_all`, family
 *   `access`), which the seat's History (`readHolderHistory`) shows;
 * - writes nothing, and records nothing, when nothing would change.
 *
 * Last write wins between two administrators; both are audited.
 */

/** The `rule` of the refusal a fixed seat's write receives. */
export const FIXED_SEAT_RULE = "access_fixed_seat";

const FIXED_SEAT_MESSAGE =
  "The President, General Manager and IT Officer hold every access line, and it cannot be changed.";

const ACCESS_CAPABILITY = "role_management" as const;

/** One seat, as the access writes and the seat page name it. */
export interface AccessSeat {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  /** President, General Manager or IT Officer: every line fixed at its maximum. */
  readonly isFixed: boolean;
}

/** A template as an access line names it. */
export interface AccessTemplate {
  readonly id: string;
  readonly name: string;
  readonly colourKey: string;
}

/** What the seat page's Access section draws. */
export interface SeatAccess {
  readonly seat: AccessSeat;
  /** This seat's own lines (not merged with any other seat). Every template is present. */
  readonly grants: OperatorGrants;
  /** Every event template, alphabetical by name — one Events line each. */
  readonly templates: readonly AccessTemplate[];
}

/** What a write did. `changes` is empty when nothing changed, and then nothing was recorded. */
export interface AccessWriteResult {
  readonly seat: AccessSeat;
  readonly changes: readonly GrantChange[];
  /** The seat's lines after the write. */
  readonly grants: OperatorGrants;
}

function authorize(operator: ResolvedOperator | null): ResolvedOperator {
  return assertCapability(operator, ACCESS_CAPABILITY);
}

async function readSeatIn(tx: Tx, roleId: string): Promise<AccessSeat> {
  const result = await tx.query<{ id: string; code: string; name: string }>(
    `select id, code, name from public.roles
      where id::text = $1`,
    [roleId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new NotFound("That is not a club role this catalogue holds.", {
      rule: "access_role_not_found",
    });
  }
  return { id: row.id, code: row.code, name: row.name, isFixed: isFixedAccessSeat(row.code) };
}

async function readTemplatesIn(tx: Tx): Promise<AccessTemplate[]> {
  const result = await tx.query<{ id: string; name: string; colour_key: string }>(
    `select id, name, colour_key from public.event_templates order by lower(name), id`,
  );
  return result.rows.map((row) => ({ id: row.id, name: row.name, colourKey: row.colour_key }));
}

/**
 * One seat's lines. Every template the club has appears, at `none` when the
 * seat has no row for it, so a reader never has to guess.
 */
async function readSeatGrantsIn(
  tx: Tx,
  roleId: string,
  templates: readonly AccessTemplate[],
  { lock }: { lock: boolean },
): Promise<OperatorGrants> {
  const result = await tx.query<GrantRow>(
    `select subject_kind, subject_key, template_id::text as template_id, level
       from public.role_access_grants
      where role_id = $1::uuid
      ${lock ? "for update" : ""}`,
    [roleId],
  );
  const merged = mergeGrantRows(result.rows);
  return Object.freeze({
    ...merged,
    templates: Object.freeze(
      Object.fromEntries(
        templates.map((template) => [template.id, merged.templates[template.id] ?? "none"]),
      ),
    ),
  });
}

function refuseFixed(seat: AccessSeat): void {
  if (seat.isFixed) throw new NotPermitted(FIXED_SEAT_MESSAGE, { rule: FIXED_SEAT_RULE });
}

async function writeLineIn(
  tx: Tx,
  roleId: string,
  subject: GrantSubject,
  level: GrantLevel,
): Promise<void> {
  const row = rowOfSubject(subject);
  await tx.query(
    `insert into public.role_access_grants
         (role_id, subject_kind, subject_key, template_id, level)
       values ($1::uuid, $2, $3, $4::uuid, $5)
     on conflict on constraint role_access_grants_one_line_per_subject
       do update set level = excluded.level, updated_at = now()`,
    [roleId, row.subjectKind, row.subjectKey, row.templateId, level],
  );
}

/** A change as the audit row stores it: the stored columns, the template's name, from and to. */
function describeChange(change: GrantChange, templates: readonly AccessTemplate[]) {
  const row = rowOfSubject(change.subject);
  return {
    subjectKind: row.subjectKind,
    subjectKey: row.subjectKey,
    templateId: row.templateId,
    templateName:
      row.templateId === null
        ? null
        : (templates.find((template) => template.id === row.templateId)?.name ?? null),
    from: change.from,
    to: change.to,
  };
}

async function recordAccessEvent(
  tx: Tx,
  actor: ResolvedOperator,
  seat: AccessSeat,
  action: AdministrationAction,
  fields: {
    fromState?: string;
    toState?: string;
    detail: Record<string, unknown>;
  },
): Promise<void> {
  await recordAdministrationEvent(tx, {
    action,
    actorPersonId: actor.personId,
    authority: { kind: "capability", capability: ACCESS_CAPABILITY, roleCodes: actor.roleCodes },
    role: { id: seat.id, code: seat.code },
    operatingYear: await resolveCommitteeYearForActivation(tx),
    fromState: fields.fromState ?? null,
    toState: fields.toState ?? null,
    detail: fields.detail,
  });
}

async function applyChangesIn(
  tx: Tx,
  seat: AccessSeat,
  changes: readonly GrantChange[],
): Promise<void> {
  for (const change of changes) {
    await writeLineIn(tx, seat.id, change.subject, change.to);
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** The seat page's Access section: the seat, its own lines, and every template. Requires `role_management`. */
export async function readSeatAccess(
  operator: ResolvedOperator | null,
  roleId: string,
): Promise<SeatAccess> {
  authorize(operator);
  return withTransaction(async (tx) => {
    const seat = await readSeatInChecked(tx, roleId);
    const templates = await readTemplatesIn(tx);
    const grants = await readSeatGrantsIn(tx, seat.id, templates, { lock: false });
    return { seat, grants, templates };
  });
}

async function readSeatInChecked(tx: Tx, roleId: string): Promise<AccessSeat> {
  if (!/^[0-9a-f-]{36}$/i.test(roleId)) {
    throw new NotFound("That is not a club role this catalogue holds.", {
      rule: "access_role_not_found",
    });
  }
  return readSeatIn(tx, roleId);
}

// ---------------------------------------------------------------------------
// One line
// ---------------------------------------------------------------------------

/**
 * Set one line of one seat — the seat page's save-on-press. One audit row
 * (`administration.access.changed`), none when the level is already the one
 * asked for. Refuses a fixed seat, a level the line does not admit, and a
 * template that does not exist.
 */
export async function setAccessGrant(
  operator: ResolvedOperator | null,
  params: { roleId: string; subject: GrantSubject; level: GrantLevel },
): Promise<AccessWriteResult> {
  const actor = authorize(operator);
  const { subject, level } = params;

  if (!isLevelFor(subject, level)) {
    throw new ConstraintViolated("That level is not offered for this line.", {
      rule: "access_level_unknown",
    });
  }

  return withTransaction(async (tx) => {
    const seat = await readSeatInChecked(tx, params.roleId);
    refuseFixed(seat);

    const templates = await readTemplatesIn(tx);
    if (
      subject.kind === "template" &&
      !templates.some((template) => template.id === subject.templateId)
    ) {
      throw new NotFound("That event template no longer exists.", {
        rule: "access_template_not_found",
      });
    }

    const before = await readSeatGrantsIn(tx, seat.id, templates, { lock: true });
    const from = grantLevel(before, subject);
    if (from === level) return { seat, changes: [], grants: before };

    const change: GrantChange = { subject, from, to: level };
    await applyChangesIn(tx, seat, [change]);

    const described = describeChange(change, templates);
    await recordAccessEvent(tx, actor, seat, "administration.access.changed", {
      fromState: from,
      toState: level,
      detail: {
        subjectKind: described.subjectKind,
        subjectKey: described.subjectKey,
        templateId: described.templateId,
        templateName: described.templateName,
      },
    });

    const after = await readSeatGrantsIn(tx, seat.id, templates, { lock: false });
    return { seat, changes: [change], grants: after };
  });
}

// ---------------------------------------------------------------------------
// Whole seat: copy access, grant everything
// ---------------------------------------------------------------------------

async function planIn(
  tx: Tx,
  roleId: string,
  target: (templates: readonly AccessTemplate[]) => Promise<OperatorGrants>,
  { lock }: { lock: boolean },
): Promise<{ seat: AccessSeat; templates: AccessTemplate[]; changes: GrantChange[] }> {
  const seat = await readSeatInChecked(tx, roleId);
  refuseFixed(seat);
  const templates = await readTemplatesIn(tx);
  const current = await readSeatGrantsIn(tx, seat.id, templates, { lock });
  const changes = diffGrants(
    current,
    await target(templates),
    templates.map((template) => template.id),
  );
  return { seat, templates, changes };
}

function copyTarget(tx: Tx, sourceRoleId: string) {
  return async (templates: readonly AccessTemplate[]) => {
    const source = await readSeatInChecked(tx, sourceRoleId);
    return readSeatGrantsIn(tx, source.id, templates, { lock: false });
  };
}

function everythingTarget() {
  return async (templates: readonly AccessTemplate[]) =>
    fullGrants(templates.map((template) => template.id));
}

/** Every line Copy access would change on `roleId`, from → to, without writing. For the confirmation dialog. */
export async function planCopyAccessFrom(
  operator: ResolvedOperator | null,
  params: { roleId: string; sourceRoleId: string },
): Promise<readonly GrantChange[]> {
  authorize(operator);
  return withTransaction(
    async (tx) =>
      (await planIn(tx, params.roleId, copyTarget(tx, params.sourceRoleId), { lock: false }))
        .changes,
  );
}

/**
 * Copy access from another seat: every line of `roleId` becomes the source
 * seat's value, with no end date. Copying from a fixed seat copies its values,
 * never its fixed status. One audit row (`administration.access.copied`) with
 * one line per change in `detail.changes`.
 */
export async function copyAccessFrom(
  operator: ResolvedOperator | null,
  params: { roleId: string; sourceRoleId: string },
): Promise<AccessWriteResult> {
  const actor = authorize(operator);
  if (params.roleId === params.sourceRoleId) {
    throw new ConstraintViolated("Choose a different seat to copy from.", {
      rule: "access_copy_same_seat",
    });
  }

  return withTransaction(async (tx) => {
    const { seat, templates, changes } = await planIn(
      tx,
      params.roleId,
      copyTarget(tx, params.sourceRoleId),
      { lock: true },
    );
    const source = await readSeatIn(tx, params.sourceRoleId);

    if (changes.length > 0) {
      await applyChangesIn(tx, seat, changes);
      await recordAccessEvent(tx, actor, seat, "administration.access.copied", {
        detail: {
          sourceRoleId: source.id,
          sourceRoleCode: source.code,
          changes: changes.map((change) => describeChange(change, templates)),
        },
      });
    }

    const after = await readSeatGrantsIn(tx, seat.id, templates, { lock: false });
    return { seat, changes, grants: after };
  });
}

/** Every line Grant everything would raise on `roleId`, without writing. For the confirmation dialog. */
export async function planGrantEverything(
  operator: ResolvedOperator | null,
  params: { roleId: string },
): Promise<readonly GrantChange[]> {
  authorize(operator);
  return withTransaction(
    async (tx) => (await planIn(tx, params.roleId, everythingTarget(), { lock: false })).changes,
  );
}

/**
 * Grant everything: every line of `roleId` at its maximum, Contact & emergency
 * included. One audit row (`administration.access.granted_all`) with one line
 * per change in `detail.changes`.
 */
export async function grantEverything(
  operator: ResolvedOperator | null,
  params: { roleId: string },
): Promise<AccessWriteResult> {
  const actor = authorize(operator);

  return withTransaction(async (tx) => {
    const { seat, templates, changes } = await planIn(tx, params.roleId, everythingTarget(), {
      lock: true,
    });

    if (changes.length > 0) {
      await applyChangesIn(tx, seat, changes);
      await recordAccessEvent(tx, actor, seat, "administration.access.granted_all", {
        detail: { changes: changes.map((change) => describeChange(change, templates)) },
      });
    }

    const after = await readSeatGrantsIn(tx, seat.id, templates, { lock: false });
    return { seat, changes, grants: after };
  });
}

// ---------------------------------------------------------------------------
// Templates — called by the template service inside its own transaction
// ---------------------------------------------------------------------------

/**
 * A new template's lines, one per seat, in the creating transaction: `manage`
 * for the fixed seats, `none` for every other seat, Vice-President and
 * Secretary included (W1: "A template created after delivery arrives at
 * Manage for the fixed seats only").
 */
export async function seedTemplateGrantsIn(tx: Tx, templateId: string): Promise<void> {
  await tx.query(
    `insert into public.role_access_grants (role_id, subject_kind, subject_key, template_id, level)
     select roles.id, 'event_template', null, $1::uuid,
            case when roles.code = any($2::text[]) then 'manage' else 'none' end
       from public.roles`,
    [templateId, [...FIXED_ACCESS_SEATS]],
  );
}

/**
 * A template's lines as they stand, for the deletion's audit row: the cascade
 * removes them, and this records what was lost (every seat above `none`).
 */
export async function readTemplateGrantsIn(
  tx: Tx,
  templateId: string,
): Promise<{ roleCode: string; level: string }[]> {
  const result = await tx.query<{ role_code: string; level: string }>(
    `select roles.code as role_code, grants.level
       from public.role_access_grants grants
       join public.roles on roles.id = grants.role_id
      where grants.template_id = $1::uuid
        and grants.level <> 'none'
      order by roles.code`,
    [templateId],
  );
  return result.rows.map((row) => ({ roleCode: row.role_code, level: row.level }));
}
