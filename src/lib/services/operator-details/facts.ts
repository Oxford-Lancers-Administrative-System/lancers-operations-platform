import "server-only";

import { looksLikeEmailAddress } from "@/lib/auth/recovery";
import type { Tx } from "@/lib/db";
import { recordAudit } from "../audit";
import { readPersonRecordIn, type PersonRecord } from "../person-record";
import { missingRequiredFields, type RequiredField } from "../person-required";

/**
 * The facts LAN-459's operator onboarding reads, in a leaf module: the seat
 * service, activation and the messaging scheduler all need them, and none of
 * those may import the others.
 *
 * Brian, 2 October 2026: an operator seated with a phone number only gets one
 * WhatsApp message with a link to the details form; an operator with an email
 * is invited by email and must complete the same form on first sign-in. The
 * state is derived, never stored — no new table or column:
 *
 *   * a request is a `notification_jobs` row keyed `operator-details:<person>:<nonce>`
 *     (the WhatsApp path), or an `operator_details.requested` audit event (both
 *     paths; the sign-in path writes only this);
 *   * receipt is an `operator_details.received` audit event, written by the
 *     form's save;
 *   * "complete" is the required-fields check (`person-required.ts`) at the
 *     operator's own rung — first name, last name, mobile, personal email. The
 *     player rung adds student facts this form does not ask, so a player who is
 *     also a coach is asked only for the personal facts still missing.
 */

export const OPERATOR_DETAILS_KEY_PREFIX = "operator-details:";
export const OPERATOR_DETAILS_REQUESTED_ACTION = "operator_details.requested";
export const OPERATOR_DETAILS_RECEIVED_ACTION = "operator_details.received";

/** One request's key. `nonce` only has to be unique per request — a fresh random id. */
export function operatorDetailsIdempotencyKey(personId: string, nonce: string): string {
  return `${OPERATOR_DETAILS_KEY_PREFIX}${personId}:${nonce}`;
}

/** The personal facts the form completes that this record lacks — the operator rung of the required-fields check. */
export function missingOperatorDetails(record: PersonRecord): RequiredField[] {
  const current = record.contacts.filter((contact) => contact.validUntil === null);
  return missingRequiredFields(null, {
    givenName: record.givenName.trim() !== "",
    familyName: record.familyName !== null && record.familyName.trim() !== "",
    mobile: current.some((contact) => contact.kind === "phone"),
    personalEmail: current.some(
      (contact) => contact.kind === "email" && contact.scope === "personal",
    ),
    // Not asked at this rung; `missingRequiredFields(null, …)` never reads them.
    collegeEmail: true,
    college: true,
    matriculationYear: true,
    expectedGraduationYear: true,
    degreeField: true,
    dateOfBirth: true,
    emergencyContact: true,
  });
}

/**
 * The person's recorded email: their preferred current email contact point,
 * derived exactly as the candidate search derives the email it shows beside
 * a name (`operator-invitations/candidates.ts`), so the address the panel
 * showed is the address the invitation goes to.
 */
export async function readRecordedEmailIn(tx: Tx, personId: string): Promise<string | null> {
  const result = await tx.query<{ raw_value: string }>(
    `select raw_value from public.contact_points
      where person_id = $1 and kind = 'email' and valid_until is null
      order by is_preferred desc, created_at desc
      limit 1`,
    [personId],
  );
  const value = result.rows[0]?.raw_value?.trim() ?? "";
  return value === "" ? null : value;
}

/** Does the club hold an email it could invite this person at? The rule `planSeatAccountIn` applies. */
export async function hasUsableEmailIn(tx: Tx, personId: string): Promise<boolean> {
  const recorded = await readRecordedEmailIn(tx, personId);
  return recorded !== null && looksLikeEmailAddress(recorded.toLowerCase());
}

/** Does the club hold a current phone number for this person? */
export async function hasCurrentPhoneIn(tx: Tx, personId: string): Promise<boolean> {
  const result = await tx.query(
    `select 1 from public.contact_points
      where person_id = $1::uuid and kind = 'phone' and valid_until is null
      limit 1`,
    [personId],
  );
  return result.rows.length > 0;
}

/**
 * Does this person hold a seat, or are they due to hold one? The same reading
 * as `readAdministrationSubject(…, { includeScheduled: true })`: an assignment
 * not yet ended, whether or not it has started. A details request, its link
 * and the account it opens exist only for a seat (R470-01).
 */
export async function holdsOrIsDueASeatIn(tx: Tx, personId: string): Promise<boolean> {
  const result = await tx.query(
    `select 1 from public.role_assignments
      where person_id = $1::uuid
        and (effective_to is null or effective_to > current_date)
      limit 1`,
    [personId],
  );
  return result.rows.length > 0;
}

/** Why a queued details request was cancelled when the person's last seat ended. */
export const DETAILS_REQUEST_NO_SEAT_REASON =
  "This person no longer holds a role, so the details request was withdrawn.";
/** Why a live details link was revoked when the person's last seat ended. */
const DETAILS_LINK_NO_SEAT_REASON = "The person no longer holds a role.";
/** Why a live details link was revoked when an account was opened for the person. */
export const DETAILS_LINK_ACCOUNT_OPENED_REASON = "An operator account was opened for the person.";

/**
 * Revokes every live `operator_details` link the person holds, in any season.
 * Returns how many were revoked.
 */
export async function revokeOperatorDetailsLinksIn(
  tx: Tx,
  personId: string,
  reason: string,
): Promise<number> {
  const revoked = await tx.query(
    `update public.person_access_tokens
        set revoked_at = now(), revoked_reason = $2
      where person_id = $1::uuid
        and purpose = 'operator_details'
        and revoked_at is null`,
    [personId, reason],
  );
  return revoked.rowCount ?? 0;
}

/**
 * An operator has just ended one of the person's seats on `endsOn` (End role,
 * or Replace role handing it on). If no seat of theirs runs past that day,
 * this was their last: stand the details journey down now, the way an event's
 * cancellation stands its messages down — every queued request cancelled with
 * a reason, every live link revoked. Now, not on `endsOn`: a seat cannot end
 * on the day it began, so the earliest end of a mistyped seat is tomorrow, and
 * a link left live until then could still open an account.
 */
export async function standDownOperatorDetailsIfSeatlessIn(
  tx: Tx,
  personId: string,
  endsOn: string,
): Promise<{ requestsCancelled: number; linksRevoked: number }> {
  const remaining = await tx.query(
    `select 1 from public.role_assignments
      where person_id = $1::uuid
        and (effective_to is null or effective_to > $2::date)
      limit 1`,
    [personId, endsOn],
  );
  if (remaining.rows.length > 0) return { requestsCancelled: 0, linksRevoked: 0 };
  const cancelled = await tx.query(
    `update public.notification_jobs
        set status = 'cancelled', cancelled_reason = $2,
            claimed_at = null, claimed_by = null, updated_at = now()
      where person_id = $1::uuid
        and job_type = 'other'
        and idempotency_key like '${OPERATOR_DETAILS_KEY_PREFIX}%'
        and status in ('pending', 'ready', 'failed')`,
    [personId, DETAILS_REQUEST_NO_SEAT_REASON],
  );
  return {
    requestsCancelled: cancelled.rowCount ?? 0,
    linksRevoked: await revokeOperatorDetailsLinksIn(tx, personId, DETAILS_LINK_NO_SEAT_REASON),
  };
}

/**
 * Must this signed-in operator complete the details form before reaching the
 * app? Yes while a request stands (either path) and the check still finds a
 * personal fact missing. Completing the facts by any route — the form, or an
 * operator correcting the record — ends it; there is no "Not now".
 */
export async function operatorDetailsDueIn(tx: Tx, personId: string): Promise<boolean> {
  const requested = await tx.query(
    `select 1 from public.audit_events
      where entity_table = 'people' and entity_id = $1::uuid and action = $2
      limit 1`,
    [personId, OPERATOR_DETAILS_REQUESTED_ACTION],
  );
  if (requested.rows.length === 0) return false;
  return missingOperatorDetails(await readPersonRecordIn(tx, personId)).length > 0;
}

/**
 * Activation's half — `activateOperatorAccount` returns `activated: true`
 * exactly once, and that is the moment the form becomes due for an operator
 * whose personal facts are incomplete. Records the request; writes nothing
 * when the facts are already complete.
 */
export async function requestOperatorDetailsOnActivationIn(
  tx: Tx,
  personId: string,
): Promise<boolean> {
  const missing = missingOperatorDetails(await readPersonRecordIn(tx, personId));
  if (missing.length === 0) return false;
  await recordAudit(tx, {
    actorPersonId: personId,
    action: OPERATOR_DETAILS_REQUESTED_ACTION,
    entityTable: "people",
    entityId: personId,
    toState: "sign_in",
    context: { issue: "LAN-459", channel: "sign_in", missing },
  });
  return true;
}
