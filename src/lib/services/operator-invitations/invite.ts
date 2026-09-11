import { randomUUID } from "node:crypto";

import type { AdministrationSubject } from "@/lib/auth/administration-authority";
import { looksLikeEmailAddress } from "@/lib/auth/recovery";
import { ConstraintViolated, withTransaction } from "@/lib/db";
import { recordAdministrationEvent } from "../administration-audit";
import { supabaseOperatorIdentity } from "../operator-identity";
import { insertRoleAssignmentIn, resolveActiveCommitteeYear, resolveCycleFor } from "./cycles";
import { deliverInvitation, markDeliveryFailed } from "./delivery";
import { type InviteOperatorParams, type InviteOperatorResult } from "./params";
import { INVALID_EMAIL_RULE, ROLE_REQUIRED_RULE } from "./refusals";
import {
  CALLBACK_URL_MESSAGE,
  CALLBACK_URL_RULE,
  INVALID_EMAIL_MESSAGE,
  ROLE_REQUIRED_MESSAGE,
  administrationAuthority,
  createOrLinkPerson,
  insertOperatorAccount,
  normaliseEmail,
  requireInvitablePerson,
  requireOperator,
  resolveRoles,
  refuseTakenEmail,
  assertEachRolePermitted,
  type RoleRow,
} from "./shared";
import { readAdministrationSubject } from "./subject";

/**
 * Invite — {@link inviteOperator} creates the login, writes every row, then
 * sends the email, in that order (so a delivery failure leaves a complete,
 * resendable record). The target's seats are read inside the transaction
 * that writes, with `includeScheduled: true`. Decision history: missions/intake/M-OPERATOR-ADMIN-WITHOUT-SQL/decision-history.md.
 */

/**
 * A role the caller asked for, resolved against the catalogue with its dates
 * checked.
 *
 * Exported for `./operator-administration.ts` (LAN-132), which creates the same
 * rows for a standalone assignment and for a replacement's successor. Writing
 * those rules a second time there would have been two copies of "the catalogue
 * decides `scope`, `is_constitutional_office` and `is_single_holder_seat`",
 * which is exactly what the composite foreign keys exist to make loud.
 */
export interface ResolvedRole {
  readonly role: RoleRow;
  readonly effectiveFrom: string;
  readonly backdated: boolean;
  readonly scheduled: boolean;
  readonly reason: string | null;
}

/**
 * Invites one operator, in one transaction plus two Auth calls.
 *
 * The order of operations, and why it is that order, is in the module note. The
 * short version: create the login, write everything, send the email — so that a
 * delivery failure leaves a complete, resendable operator record rather than
 * nothing at all.
 */
export async function inviteOperator(params: InviteOperatorParams): Promise<InviteOperatorResult> {
  const identity = params.identity ?? supabaseOperatorIdentity();
  const email = normaliseEmail(params.email);
  const callbackUrl = (params.callbackUrl ?? "").trim();

  if (callbackUrl === "") {
    throw new ConstraintViolated(CALLBACK_URL_MESSAGE, { rule: CALLBACK_URL_RULE });
  }
  if (!looksLikeEmailAddress(email)) {
    throw new ConstraintViolated(INVALID_EMAIL_MESSAGE, { rule: INVALID_EMAIL_RULE });
  }
  if (params.roles.length === 0) {
    throw new ConstraintViolated(ROLE_REQUIRED_MESSAGE, { rule: ROLE_REQUIRED_RULE });
  }

  // ---- Everything that can be refused, refused before anything is created.
  const preflight = await withTransaction(async (tx) => {
    const operatingYear = await resolveActiveCommitteeYear(tx);
    const roles = await resolveRoles(tx, params.roles);
    await refuseTakenEmail(tx, email, null);

    const personId =
      params.subject.kind === "existing"
        ? await requireInvitablePerson(tx, params.subject.personId)
        : // A Person who does not exist yet holds nothing and is nobody, so the
          // pre-flight guard is run against an identity that cannot match the
          // actor and cannot carry a seat. The authoritative guard below runs
          // against the real row.
          randomUUID();

    const subject: AdministrationSubject =
      params.subject.kind === "existing"
        ? await readAdministrationSubject(tx, personId, { includeScheduled: true })
        : { personId, roleCodes: [] };

    assertEachRolePermitted(params.operator, subject, roles);
    return { operatingYear, roles };
  });

  // ---- The login. Creates nothing else, and sends nothing.
  const { authUserId } = await identity.createLogin(email);

  // ---- Every row, or none of them.
  let written: {
    personId: string;
    operatorAccountId: string;
    personCreated: boolean;
    roleAssignmentIds: string[];
  };

  try {
    written = await withTransaction(async (tx) => {
      const correlationId = randomUUID();
      const { personId, personCreated } = await createOrLinkPerson(tx, params.subject, email);

      // The authoritative snapshot: read here, inside the transaction that is
      // about to write, and judged by the guard before a single row is
      // inserted. `WP-authorization` records that a stale or empty snapshot is
      // the one way to disarm the leadership rules; this is the read that stops
      // that being possible.
      //
      // `includeScheduled` for the reason every other administration write
      // gives, and because leaving it off here was the sharper half of it: a
      // Person holding a seat dated to begin at a handover, and no login yet,
      // is exactly the target this flow reaches. Without the widening they are
      // invisible to the leadership rule, and whoever may not assign that seat
      // could give them another one *and* an account at an address they chose.
      // Fail-closed is the only direction the option can move the guard.
      const subject = await readAdministrationSubject(tx, personId, { includeScheduled: true });
      assertEachRolePermitted(params.operator, subject, preflight.roles);

      const operatorAccountId = await insertOperatorAccount(tx, {
        authUserId,
        personId,
        email,
      });

      await recordAdministrationEvent(tx, {
        action: "administration.operator.invited",
        actorPersonId: requireOperator(params.operator).personId,
        authority: administrationAuthority(params.operator),
        target: { personId, operatorAccountId },
        operatingYear: preflight.operatingYear,
        toState: "invitation_pending",
        correlationId,
        detail: {
          personCreated,
          roleCodes: preflight.roles.map((entry) => entry.role.code),
        },
      });

      const roleAssignmentIds: string[] = [];
      for (const entry of preflight.roles) {
        const cycle = await resolveCycleFor(tx, entry.role.scope, preflight.operatingYear);
        const assignmentId = await insertRoleAssignmentIn(tx, {
          personId,
          entry,
          cycle,
          appointedByPersonId: requireOperator(params.operator).personId,
        });

        await recordAdministrationEvent(tx, {
          action: "administration.role.assigned",
          actorPersonId: requireOperator(params.operator).personId,
          authority: administrationAuthority(params.operator),
          target: { personId, operatorAccountId },
          role: { id: entry.role.id, code: entry.role.code, assignmentId },
          operatingYear: cycle.operatingYear,
          toState: entry.scheduled ? "scheduled" : "effective",
          reason: entry.reason,
          backdated: entry.backdated,
          correlationId,
        });

        roleAssignmentIds.push(assignmentId);
      }

      return { personId, operatorAccountId, personCreated, roleAssignmentIds };
    });
  } catch (error) {
    // The only compensation in this module, and it applies to exactly one
    // thing: a login created seconds ago that no `operator_accounts` row
    // points at, because the statement that would have pointed at it did not
    // commit. A dangling login grants nothing — `resolveOperatorAccess()`
    // reports it `unlinked` — but leaving it behind would make the honest
    // retry fail with "that address already has a login".
    //
    // Best effort: if the removal itself fails, the original failure is what
    // the administrator needs to see, and a second error thrown from a catch
    // block would replace it.
    await identity.deleteLogin(authUserId).catch(() => undefined);
    throw error;
  }

  // ---- The email. Everything above is committed; a failure here is a
  //      recorded delivery failure, not a rollback.
  const delivery = await deliverInvitation(identity, email, callbackUrl);

  if (!delivery.ok) {
    await withTransaction((tx) =>
      markDeliveryFailed(tx, {
        operator: params.operator,
        operatorAccountId: written.operatorAccountId,
        personId: written.personId,
        operatingYear: preflight.operatingYear,
        reason: delivery.reason,
      }),
    );
  }

  return {
    personId: written.personId,
    operatorAccountId: written.operatorAccountId,
    authUserId,
    loginEmail: email,
    personCreated: written.personCreated,
    roleAssignmentIds: written.roleAssignmentIds,
    state: delivery.ok ? "invitation_pending" : "delivery_failed",
    delivered: delivery.ok,
    deliveryFailureReason: delivery.ok ? null : delivery.reason,
  };
}
