/**
 * The audit evidence the founding bootstrap leaves behind — LAN-135,
 * `REQ-one-time-bootstrap` ("with audit evidence"), and review finding
 * LAN129-A5.
 *
 * Pure. Builds `public.audit_events` rows; writes nothing. The writing is in
 * `database.mjs`, inside the same transaction as the change each row describes.
 *
 * ## The problem this module exists to solve
 *
 * The founding operators must have visible history. If they do not, the three
 * people who run the club are the only people in it whose appointment nobody
 * can see — which is exactly backwards, and it would also mean *Operator audit
 * history* and *Holder history* opened on a founding seat and showed nothing at
 * all.
 *
 * The obvious way to get that history is to call
 * `recordAdministrationEvent()` from `src/lib/services/administration-audit.ts`.
 * It cannot be done, for two independent reasons, both found by the independent
 * review of `WP-authorization` before this package was written:
 *
 *  1. **There is no actor and no authority.** `prepareAdministrationEvent`
 *     requires `actorPersonId` to be a UUID and requires `authority` to be
 *     either a real `CapabilityKey` with a non-empty role list, or `self`. At
 *     the first bootstrap event nobody holds anything at all — that is the
 *     whole point of a bootstrap — and there is no person to name, because the
 *     Person rows are what the script is about to create.
 *
 *  2. **It cannot run here.** This script is the owner-run procedure that
 *     touches the one hosted database, and the service layer's connection is
 *     guarded by `src/lib/db/url.ts`, which refuses every non-loopback host
 *     unconditionally. That guard is a protected trust boundary (ADR 0001,
 *     ADR 0014, ADR 0026) and weakening it — or adding a hosted branch to it —
 *     to let a provisioning script through would trade the guarantee the whole
 *     repository rests on for one script's convenience. It stays exactly as it
 *     is.
 *
 * ## What is done instead, and why it is honest
 *
 * The rows are built here and written by this script's own connection, in the
 * **exact stored shape** the two projections read. Three decisions carry that:
 *
 * ### The actor is a labelled mechanism, not a person
 *
 * `actor_person_id` is null and `actor_label` names the procedure.
 * `src/lib/services/audit.ts` documents this as the intended path: "Where the
 * actor genuinely is not a person — a scheduled job, an inbound channel event —
 * `actorLabel` names the mechanism honestly instead", and
 * `audit_events_has_an_actor` accepts either. The projections already read it:
 * `columnFields` in `administration-audit.ts` resolves an entry's actor name as
 * `actor_name ?? actor_label ?? "Unknown"`, so a bootstrap event renders with
 * the mechanism's name and no invented person behind it.
 *
 * Naming a human here was considered and rejected. Brian runs the script, but
 * his Person row does not exist until the script creates it, he holds no seat
 * at the moment of the first event, and recording him as the actor of his own
 * appointment would be a fabricated authority in the club's permanent ledger.
 *
 * ### The authority is recorded as "none held", not as a borrowed capability
 *
 * The stored envelope's authority is `{ kind: "capability", capability: null,
 * roleCodes: [] }` — an administrative action, performed by a third party
 * against a target, under no club capability, by somebody holding no club role.
 * That is the literal truth of a bootstrap.
 *
 * It is within the stored contract rather than beside it:
 * `AdministrationEnvelope.authority.capability` is already typed `string | null`
 * and `roleCodes` already `string[]`, and `administration-audit.ts` already
 * produces exactly this triple for an entry whose authority cannot be
 * determined. So the reader needs no change and no new case.
 *
 * The alternative — widening `AdministrationAuthority` with a third `bootstrap`
 * kind — was considered and deliberately not taken. It would change a type that
 * `WP-surfaces` is building its two history screens against right now, for a
 * value only this out-of-band script ever writes, and the widening would buy
 * nothing at the write site (this file cannot import TypeScript in any case).
 * If a first-class bootstrap authority is wanted, it is a shared-vocabulary
 * change to schedule deliberately, after the surfaces land — recorded in this
 * package's receipt rather than smuggled in under it.
 *
 * ### Everything else matches the vocabulary exactly
 *
 * Action, family, entity table, shape rules, envelope version and every
 * envelope key are the ones in `src/lib/services/administration-events.ts`.
 * They are restated here because a `.mjs` operator script cannot import a
 * TypeScript module, and `tests/production-bootstrap-contract.test.ts` pays for
 * that restatement: it builds the same record both ways and fails if the two
 * envelopes differ in any field. It then writes these rows to the local stack
 * and reads them back through `readOperatorAuditHistory` and
 * `readHolderHistory` themselves, so "readable by the same projections" is a
 * demonstrated fact rather than a claim in a comment.
 */

/**
 * The mechanism that acted, named honestly.
 *
 * Stable: it is stored in the club's permanent ledger and rendered as the actor
 * of three events that can never be rewritten. Changing it would make two
 * bootstraps look like two different mechanisms.
 */
export const BOOTSTRAP_ACTOR_LABEL = "system: founding operator bootstrap";

/** `audit_events.context` key this mission's events reserve. */
export const ADMINISTRATION_CONTEXT_KEY = "administration";

/** Envelope shape version. Pinned against the TypeScript constant by test. */
export const ADMINISTRATION_ENVELOPE_VERSION = 1;

/**
 * The four actions a bootstrap writes, and nothing else.
 *
 * All four are in `ADMINISTRATION_ACTIONS`; the contract test checks that
 * membership rather than trusting this list. There is deliberately no action
 * here for reinstating an account, ending an assignment, or moving an address:
 * a provisioning script that could do those would be an administration surface
 * with no authorization on it.
 */
export const OPERATOR_INVITED = "administration.operator.invited";
export const ROLE_ASSIGNED = "administration.role.assigned";
export const INVITATION_RESENT = "administration.operator.invitation_resent";
export const INVITATION_DELIVERY_FAILED = "administration.operator.invitation_delivery_failed";

/** Two of the five operator states, in `operator-account-state.ts`'s words. */
export const INVITATION_PENDING = "invitation_pending";
export const DELIVERY_FAILED = "delivery_failed";

/** `entity_table` per family, as `ENTITY_TABLES` in the vocabulary. */
export const OPERATOR_ACCOUNTS_TABLE = "public.operator_accounts";
export const ROLE_ASSIGNMENTS_TABLE = "public.role_assignments";

/**
 * The authority a founding bootstrap event records.
 *
 * Frozen, and built once: three events sharing one object would be three events
 * that a caller could mutate together. See the module note for why it is this
 * triple and not another.
 */
export function bootstrapAuthority() {
  return { kind: "capability", capability: null, roleCodes: [] };
}

/**
 * The envelope, in the exact stored shape and key order the vocabulary writes.
 *
 * Key order is not cosmetic here: `jsonb` does not preserve it, but the
 * contract test compares this object against `prepareAdministrationEvent`'s
 * with `toEqual`, and building it in the same order keeps a diff readable when
 * it does fail.
 */
export function bootstrapEnvelope({
  targetPersonId,
  targetOperatorAccountId = null,
  role = null,
  operatingYear,
  correlationId = null,
  detail = {},
}) {
  return {
    version: ADMINISTRATION_ENVELOPE_VERSION,
    targetPersonId,
    targetOperatorAccountId,
    roleId: role?.id ?? null,
    roleCode: role?.code ?? null,
    roleAssignmentId: role?.assignmentId ?? null,
    operatingYear: {
      scope: operatingYear.scope,
      id: operatingYear.id,
      label: operatingYear.label.trim(),
    },
    authority: bootstrapAuthority(),
    correlationId,
    backdated: false,
    detail: { ...detail },
  };
}

/**
 * The `administration.operator.invited` row for one founding operator.
 *
 * `creation` shape: no prior state, and a state it produced. The entity is the
 * operator account, exactly as `ENTITY_TABLES.provisioning` says.
 */
export function operatorInvitedRow({
  personId,
  operatorAccountId,
  operatingYear,
  correlationId,
  detail,
}) {
  return {
    actorPersonId: null,
    actorLabel: BOOTSTRAP_ACTOR_LABEL,
    action: OPERATOR_INVITED,
    entityTable: OPERATOR_ACCOUNTS_TABLE,
    entityId: operatorAccountId,
    fromState: null,
    toState: INVITATION_PENDING,
    reason: null,
    context: {
      [ADMINISTRATION_CONTEXT_KEY]: bootstrapEnvelope({
        targetPersonId: personId,
        targetOperatorAccountId: operatorAccountId,
        operatingYear,
        correlationId,
        detail,
      }),
    },
  };
}

/**
 * The `administration.operator.invitation_resent` row.
 *
 * `attempt` shape: something was tried against an account whose state it did
 * not move. Written when `--resend` sends a second invitation, so that an email
 * arriving twice is never a thing that happened with no record of it.
 */
export function invitationResentRow({
  personId,
  operatorAccountId,
  operatingYear,
  correlationId,
  detail,
}) {
  return {
    actorPersonId: null,
    actorLabel: BOOTSTRAP_ACTOR_LABEL,
    action: INVITATION_RESENT,
    entityTable: OPERATOR_ACCOUNTS_TABLE,
    entityId: operatorAccountId,
    fromState: null,
    toState: null,
    reason: null,
    context: {
      [ADMINISTRATION_CONTEXT_KEY]: bootstrapEnvelope({
        targetPersonId: personId,
        targetOperatorAccountId: operatorAccountId,
        operatingYear,
        correlationId,
        detail,
      }),
    },
  };
}

/**
 * The `administration.operator.invitation_delivery_failed` row.
 *
 * `transition` shape, and a real one: the account moves from Invitation pending
 * to Delivery failed. Recorded rather than merely printed, because an account
 * the club's record calls "Invitation pending" when the email bounced is a
 * record that says nothing is wrong when something is.
 */
export function invitationDeliveryFailedRow({
  personId,
  operatorAccountId,
  operatingYear,
  correlationId,
  reason,
  detail,
}) {
  return {
    actorPersonId: null,
    actorLabel: BOOTSTRAP_ACTOR_LABEL,
    action: INVITATION_DELIVERY_FAILED,
    entityTable: OPERATOR_ACCOUNTS_TABLE,
    entityId: operatorAccountId,
    fromState: INVITATION_PENDING,
    toState: DELIVERY_FAILED,
    reason: null,
    context: {
      [ADMINISTRATION_CONTEXT_KEY]: bootstrapEnvelope({
        targetPersonId: personId,
        targetOperatorAccountId: operatorAccountId,
        operatingYear,
        correlationId,
        detail: { ...detail, reason },
      }),
    },
  };
}

/**
 * The `administration.role.assigned` row for one founding appointment.
 *
 * `creation` shape again, and role-related — which is the only thing that puts
 * it into *Holder history* as well as *Operator audit history*. One row, two
 * projections; nothing here writes a second copy for the second screen.
 *
 * `toState` is `"effective"` rather than `"scheduled"` because a bootstrap
 * appointment is effective the day it is run — the script refuses a future
 * effective date rather than offering scheduling, which belongs to the
 * application.
 */
export function roleAssignedRow({
  personId,
  operatorAccountId,
  role,
  operatingYear,
  correlationId,
  detail,
}) {
  return {
    actorPersonId: null,
    actorLabel: BOOTSTRAP_ACTOR_LABEL,
    action: ROLE_ASSIGNED,
    entityTable: ROLE_ASSIGNMENTS_TABLE,
    entityId: role.assignmentId,
    fromState: null,
    toState: "effective",
    reason: null,
    context: {
      [ADMINISTRATION_CONTEXT_KEY]: bootstrapEnvelope({
        targetPersonId: personId,
        targetOperatorAccountId: operatorAccountId,
        role,
        operatingYear,
        correlationId,
        detail,
      }),
    },
  };
}
