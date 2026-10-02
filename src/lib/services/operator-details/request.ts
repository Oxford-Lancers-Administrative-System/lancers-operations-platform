import "server-only";

import { randomUUID } from "node:crypto";

import { assertAdministrationTarget } from "@/lib/auth/administration-authority";
import { assertCapability } from "@/lib/auth/guards";
import type { ResolvedOperator } from "@/lib/auth/operator";
import type { Transport } from "@/lib/delivery";
import type { EnvironmentSource } from "@/lib/delivery/config";
import {
  Conflict,
  ConstraintViolated,
  InvalidTransition,
  type Tx,
  withTransaction,
} from "@/lib/db";
import { recordAudit } from "../audit";
import { MAX_ATTEMPTS } from "../delivery";
import { dispatchOperatorDetailsJob } from "../messaging-scheduler";
import { lightsOutWaitingUntil } from "../messaging-schedule/lights-out";
import { readAdministrationSubject } from "../operator-invitations";
import {
  ADMINISTRATION_CAPABILITY,
  operatorAccountIdFor,
  requireAssignablePerson,
  requireOperator,
} from "../operator-administration/shared";
import {
  OPERATOR_DETAILS_KEY_PREFIX,
  OPERATOR_DETAILS_RECEIVED_ACTION,
  OPERATOR_DETAILS_REQUESTED_ACTION,
  hasCurrentPhoneIn,
  hasUsableEmailIn,
  operatorDetailsIdempotencyKey,
} from "./facts";

/**
 * The WhatsApp details request — LAN-459. One message, to an operator the club
 * has only a phone number for, carrying a link to the details form. Queued in
 * the transaction that seats them (`operator-administration/seat-account.ts`)
 * or from the seat page's "Send details request"; dispatched straight after
 * the commit, by the same dispatcher the sweep uses, so lights-out (held until
 * 07:00) and the sending allowance apply like any other send.
 */

/** Options only tests set: the delivery environment and transport. */
export interface DetailsRequestMessaging {
  readonly source?: EnvironmentSource;
  readonly transport?: Transport;
}

/** What became of one request, in the words the seat page shows. */
export interface DetailsRequestOutcome {
  readonly outcome: "sent" | "waiting" | "not_sent";
  readonly waitingUntil: Date | null;
  /** Why it was not sent, in the dispatcher's own sentence. */
  readonly reason: string | null;
}

/** Queues one request and records it. The caller dispatches after commit. */
export async function queueOperatorDetailsRequestIn(
  tx: Tx,
  input: { readonly personId: string; readonly actorPersonId: string },
): Promise<string> {
  const job = await tx.query<{ id: string }>(
    `insert into public.notification_jobs
       (idempotency_key, job_type, status, person_id, channel, scheduled_for, template_variables)
     values ($1, 'other', 'pending', $2::uuid, 'whatsapp', now(), '{}'::jsonb)
     returning id`,
    [operatorDetailsIdempotencyKey(input.personId, randomUUID()), input.personId],
  );
  await recordAudit(tx, {
    actorPersonId: input.actorPersonId,
    action: OPERATOR_DETAILS_REQUESTED_ACTION,
    entityTable: "people",
    entityId: input.personId,
    toState: "whatsapp",
    context: { issue: "LAN-459", channel: "whatsapp", notificationJobId: job.rows[0].id },
  });
  return job.rows[0].id;
}

/** Dispatches a queued request now; overnight it waits for 07:00. */
export async function dispatchOperatorDetailsRequest(
  jobId: string,
  messaging: DetailsRequestMessaging = {},
): Promise<DetailsRequestOutcome> {
  const outcome = await dispatchOperatorDetailsJob(jobId, messaging);
  if (outcome === "accepted") return { outcome: "sent", waitingUntil: null, reason: null };
  if (outcome === "deferred") {
    return { outcome: "waiting", waitingUntil: lightsOutWaitingUntil(outcome), reason: null };
  }
  const job = await withTransaction((tx) =>
    tx.query<{ last_error: string | null }>(
      "select last_error from public.notification_jobs where id = $1",
      [jobId],
    ),
  );
  return { outcome: "not_sent", waitingUntil: null, reason: job.rows[0]?.last_error ?? null };
}

const DETAILS_REQUEST_NOT_NEEDED_RULE = "operator_details_request_not_needed";
const DETAILS_REQUEST_NO_PHONE_RULE = "operator_details_request_no_phone";
const NO_SEAT_MESSAGE =
  "This person holds no role, so there is no seat to ask for their details for.";
const HAS_ACCOUNT_MESSAGE =
  "This person already has an operator account. Open their operator record instead.";
const HAS_EMAIL_MESSAGE =
  "The club has an email for this person. Send the invitation instead; WhatsApp is used only " +
  "when a phone number is all the club has.";
const NO_PHONE_MESSAGE = "This person has no mobile number on record to send the request to.";

/**
 * Send details request, from a seat's holder line — "a way to send the request
 * again". Guarded as `assign_role` for every seat the person holds or is due to
 * hold, exactly as Send invitation is, because the request leads to an account.
 */
export async function sendOperatorDetailsRequest(params: {
  readonly operator: ResolvedOperator | null;
  readonly personId: string;
  readonly messaging?: DetailsRequestMessaging;
}): Promise<DetailsRequestOutcome> {
  const actor = requireOperator(params.operator);

  const jobId = await withTransaction(async (tx) => {
    await requireAssignablePerson(tx, params.personId);
    const subject = await readAdministrationSubject(tx, params.personId, {
      includeScheduled: true,
    });
    if (subject.roleCodes.length === 0) {
      throw new InvalidTransition(NO_SEAT_MESSAGE, { rule: DETAILS_REQUEST_NOT_NEEDED_RULE });
    }
    for (const roleCode of subject.roleCodes) {
      assertAdministrationTarget(params.operator, {
        action: "assign_role",
        target: subject,
        roleCode,
      });
    }
    if ((await operatorAccountIdFor(tx, params.personId)) !== null) {
      throw new Conflict(HAS_ACCOUNT_MESSAGE, { rule: DETAILS_REQUEST_NOT_NEEDED_RULE });
    }
    if (await hasUsableEmailIn(tx, params.personId)) {
      throw new Conflict(HAS_EMAIL_MESSAGE, { rule: DETAILS_REQUEST_NOT_NEEDED_RULE });
    }
    if (!(await hasCurrentPhoneIn(tx, params.personId))) {
      throw new ConstraintViolated(NO_PHONE_MESSAGE, { rule: DETAILS_REQUEST_NO_PHONE_RULE });
    }
    return queueOperatorDetailsRequestIn(tx, {
      personId: params.personId,
      actorPersonId: actor.personId,
    });
  });

  return dispatchOperatorDetailsRequest(jobId, params.messaging);
}

/** Where a holder's details request stands — the seat page's line. */
export type DetailsRequestState = "requested" | "not_delivered" | "received";

export interface DetailsRequestStatus {
  readonly state: DetailsRequestState;
  /** The personal email on record once received: the address the invitation went to. */
  readonly email: string | null;
}

interface StatusRow {
  person_id: string;
  requested_at: Date | null;
  job_status: string | null;
  job_retry_due: boolean | null;
  job_attempts: number | null;
  last_outcome: string | null;
  received_at: Date | null;
  email: string | null;
}

/**
 * Each person's latest details request and whether it was received. Derived
 * from the request job, its delivery results and the two audit actions; a
 * person with none of them has no entry.
 */
export async function readOperatorDetailsStatuses(
  operator: ResolvedOperator | null,
  personIds: readonly string[],
): Promise<ReadonlyMap<string, DetailsRequestStatus>> {
  assertCapability(requireOperator(operator), ADMINISTRATION_CAPABILITY);
  const statuses = new Map<string, DetailsRequestStatus>();
  if (personIds.length === 0) return statuses;

  const result = await withTransaction((tx) =>
    tx.query<StatusRow>(
      `with wanted as (select unnest($1::uuid[]) as person_id),
       latest_job as (
         select distinct on (j.person_id)
                j.person_id, j.id, j.created_at, j.status::text as status,
                j.next_attempt_at is not null as retry_due, j.attempt_count
           from public.notification_jobs j
          where j.person_id = any($1::uuid[])
            and j.job_type = 'other'
            and j.idempotency_key like '${OPERATOR_DETAILS_KEY_PREFIX}%'
          order by j.person_id, j.created_at desc
       ),
       requested as (
         select entity_id as person_id, max(occurred_at) as at
           from public.audit_events
          where entity_table = 'people' and action = $2 and entity_id = any($1::uuid[])
          group by entity_id
       ),
       received as (
         select entity_id as person_id, max(occurred_at) as at
           from public.audit_events
          where entity_table = 'people' and action = $3 and entity_id = any($1::uuid[])
          group by entity_id
       )
       select w.person_id,
              greatest(lj.created_at, rq.at) as requested_at,
              lj.status as job_status,
              lj.retry_due as job_retry_due,
              lj.attempt_count as job_attempts,
              (select r.outcome::text from public.delivery_results r
                where r.notification_job_id = lj.id
                order by r.attempt_number desc limit 1) as last_outcome,
              rc.at as received_at,
              (select c.raw_value from public.contact_points c
                where c.person_id = w.person_id and c.kind = 'email'
                  and c.scope = 'personal' and c.valid_until is null
                order by c.is_preferred desc, c.created_at desc limit 1) as email
         from wanted w
         left join latest_job lj on lj.person_id = w.person_id
         left join requested rq on rq.person_id = w.person_id
         left join received rc on rc.person_id = w.person_id`,
      [
        [...new Set(personIds)],
        OPERATOR_DETAILS_REQUESTED_ACTION,
        OPERATOR_DETAILS_RECEIVED_ACTION,
      ],
    ),
  );

  for (const row of result.rows) {
    const state = detailsRequestStateOf(row);
    if (state !== null) {
      statuses.set(row.person_id, { state, email: state === "received" ? row.email : null });
    }
  }
  return statuses;
}

function detailsRequestStateOf(row: StatusRow): DetailsRequestState | null {
  if (
    row.received_at !== null &&
    (row.requested_at === null || row.received_at >= row.requested_at)
  ) {
    return "received";
  }
  if (row.requested_at === null) return null;
  if (row.job_status === null) return "requested";
  const terminal =
    row.job_status === "cancelled" ||
    (row.job_status === "failed" &&
      (row.job_retry_due !== true || (row.job_attempts ?? 0) >= MAX_ATTEMPTS));
  const undelivered =
    row.last_outcome !== null && row.last_outcome !== "delivered" && row.job_retry_due !== true;
  return terminal || undelivered ? "not_delivered" : "requested";
}
