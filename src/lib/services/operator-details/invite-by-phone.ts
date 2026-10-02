import "server-only";

import { randomUUID } from "node:crypto";

import type { AdministrationSubject } from "@/lib/auth/administration-authority";
import { ConstraintViolated, withTransaction } from "@/lib/db";
import { inviteOperator, writeInitialRolesIn } from "../operator-invitations/invite";
import type { InviteOperatorParams, InviteOperatorResult } from "../operator-invitations/params";
import { NAME_REQUIRED_RULE, ROLE_REQUIRED_RULE } from "../operator-invitations/refusals";
import { readAdministrationSubject } from "../operator-invitations/subject";
import { resolveActiveCommitteeYear } from "../operator-invitations/cycles";
import {
  ROLE_REQUIRED_MESSAGE,
  assertEachRolePermitted,
  blankToNull,
  createOrLinkPerson,
  requireInvitablePerson,
  requireInvitationPhone,
  requireOperator,
  resolveRoles,
} from "../operator-invitations/shared";
import { hasCurrentPhoneIn, readRecordedEmailIn, hasUsableEmailIn } from "./facts";
import {
  dispatchOperatorDetailsRequest,
  queueOperatorDetailsRequestIn,
  type DetailsRequestMessaging,
  type DetailsRequestOutcome,
} from "./request";

/**
 * Invite operator with a phone number or an email — LAN-459, item 2. With an
 * email, or for an existing person the club holds an email for, this is
 * Invite operator exactly as it was. With neither, a mobile is required: the
 * person is created or linked and given their roles with no account, and is
 * sent the one WhatsApp details request. Their account and invitation follow
 * when they save the form.
 */

const EMAIL_OR_MOBILE_REQUIRED_RULE = "operator_invitation_email_or_mobile_required";
const EMAIL_OR_MOBILE_REQUIRED_MESSAGE =
  "Give an email or a mobile number. With only a mobile, they are sent a WhatsApp message " +
  "asking for their details, and their invitation follows.";
const NAME_REQUIRED_MESSAGE = "A new person needs a first name and a last name.";

export type InviteWithoutEmailResult =
  | { readonly kind: "email"; readonly result: InviteOperatorResult }
  | {
      readonly kind: "details_request";
      readonly personId: string;
      readonly personCreated: boolean;
      readonly roleAssignmentIds: readonly string[];
      readonly detailsRequest: DetailsRequestOutcome;
    };

export async function inviteOperatorWithoutEmail(
  params: Omit<InviteOperatorParams, "email"> & { readonly messaging?: DetailsRequestMessaging },
): Promise<InviteWithoutEmailResult> {
  if (params.roles.length === 0) {
    throw new ConstraintViolated(ROLE_REQUIRED_MESSAGE, { rule: ROLE_REQUIRED_RULE });
  }

  const preflight = await withTransaction(async (tx) => {
    const operatingYear = await resolveActiveCommitteeYear(tx);
    const roles = await resolveRoles(tx, params.roles);

    if (params.subject.kind === "existing") {
      const personId = await requireInvitablePerson(tx, params.subject.personId);
      // Email whenever the club has one (Brian, 2 October 2026).
      if (await hasUsableEmailIn(tx, personId)) {
        return { recordedEmail: await readRecordedEmailIn(tx, personId), operatingYear, roles };
      }
      if (!(await hasCurrentPhoneIn(tx, personId))) {
        throw new ConstraintViolated(EMAIL_OR_MOBILE_REQUIRED_MESSAGE, {
          rule: EMAIL_OR_MOBILE_REQUIRED_RULE,
        });
      }
      const subject = await readAdministrationSubject(tx, personId, { includeScheduled: true });
      assertEachRolePermitted(params.operator, subject, roles);
    } else {
      if (blankToNull(params.subject.givenName) === null) {
        throw new ConstraintViolated(NAME_REQUIRED_MESSAGE, { rule: NAME_REQUIRED_RULE });
      }
      if (blankToNull(params.subject.familyName) === null) {
        throw new ConstraintViolated(NAME_REQUIRED_MESSAGE, { rule: NAME_REQUIRED_RULE });
      }
      if (requireInvitationPhone(params.subject.phone) === null) {
        throw new ConstraintViolated(EMAIL_OR_MOBILE_REQUIRED_MESSAGE, {
          rule: EMAIL_OR_MOBILE_REQUIRED_RULE,
        });
      }
      // Nobody yet: guarded against an identity that holds nothing, as Invite operator does.
      const nobody: AdministrationSubject = { personId: randomUUID(), roleCodes: [] };
      assertEachRolePermitted(params.operator, nobody, roles);
    }
    return { recordedEmail: null, operatingYear, roles };
  });

  if (preflight.recordedEmail !== null) {
    return {
      kind: "email",
      result: await inviteOperator({ ...params, email: preflight.recordedEmail }),
    };
  }

  const actor = requireOperator(params.operator);
  const written = await withTransaction(async (tx) => {
    const { personId, personCreated } = await createOrLinkPerson(tx, params.subject, null);
    const subject = await readAdministrationSubject(tx, personId, { includeScheduled: true });
    assertEachRolePermitted(params.operator, subject, preflight.roles);
    const roleAssignmentIds = await writeInitialRolesIn(tx, {
      operator: params.operator,
      personId,
      operatorAccountId: null,
      roles: preflight.roles,
      operatingYear: preflight.operatingYear,
      correlationId: randomUUID(),
      trigger: "operator_invited",
    });
    const jobId = await queueOperatorDetailsRequestIn(tx, {
      personId,
      actorPersonId: actor.personId,
    });
    return { personId, personCreated, roleAssignmentIds, jobId };
  });

  return {
    kind: "details_request",
    personId: written.personId,
    personCreated: written.personCreated,
    roleAssignmentIds: written.roleAssignmentIds,
    detailsRequest: await dispatchOperatorDetailsRequest(written.jobId, params.messaging),
  };
}
