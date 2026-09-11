import "server-only";

import {
  Conflict,
  ConstraintViolated,
  InvalidTransition,
  NotFound,
  withTransaction,
  type Tx,
} from "@/lib/db";

import { recordAudit } from "./audit";
import { resolveRsvpTokenIn, type TokenState } from "./rsvp-tokens";
import { personDisplayAliasSql } from "./sql-text";

// The player's own RSVP, answered through a signed link — LAN-79, the one unauthenticated write
// in the application: re-resolved inside the writing transaction, append-only, event start is
// the hard cutoff.

export interface SignedRsvpPage {
  readonly invitationId: string;
  readonly capacity: string;
  readonly eventName: string;
  readonly templateName: string;
  readonly eventType: string;
  readonly eventStatus: string;
  readonly scheduledOn: string | null;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly venue: string | null;
  /** LAN-323. What the operator wrote about the event — its own field, never folded into the equipment. */
  readonly description: string | null;
  readonly requiredEquipment: string | null;
  readonly eventStartsAt: Date;
  readonly playerName: string;
  readonly responseDeadline: Date | null;
  readonly currentResponse: CurrentResponse | null;
}

interface CurrentResponse {
  readonly response: "yes" | "no";
  readonly reason: string | null;
  readonly respondedAt: Date;
}

export async function readSignedRsvpPageIn(tx: Tx, invitationId: string): Promise<SignedRsvpPage> {
  const result = await tx.query<{
    invitation_id: string;
    capacity: string;
    event_name: string;
    template_name: string;
    event_type: string;
    event_status: string;
    scheduled_on: string | null;
    starts_at: string | null;
    ends_at: string | null;
    venue: string | null;
    description: string | null;
    required_equipment: string | null;
    event_starts_at: Date;
    player_name: string;
    response_deadline: Date | null;
    response: "yes" | "no" | null;
    reason: string | null;
    responded_at: Date | null;
  }>(
    `select i.id as invitation_id,
            i.capacity::text as capacity,
            e.name as event_name,
            tpl.name as template_name,
            e.event_type::text as event_type,
            e.status::text as event_status,
            to_char(e.scheduled_on, 'YYYY-MM-DD') as scheduled_on,
            to_char(e.starts_at, 'HH24:MI') as starts_at,
            to_char(e.ends_at, 'HH24:MI') as ends_at,
            e.venue,
            e.description,
            e.required_equipment,
            (e.scheduled_on + coalesce(e.starts_at, '00:00'::time))
              at time zone 'Europe/London' as event_starts_at,
            -- concat_ws rather than a plain concatenation: family_name is
            -- nullable, and concatenating against a null would make the whole
            -- name null and render a player no name at all. The seed contains
            -- such a person, which is the point of the seed.
            concat_ws(' ',
              coalesce(nullif(btrim(${personDisplayAliasSql("p")}), ''), p.given_name),
              nullif(btrim(coalesce(p.family_name, '')), '')) as player_name,
            i.expires_at as response_deadline,
            r.response::text as response,
            r.reason,
            r.responded_at
       from public.invitations i
       join public.events e on e.id = i.event_id
       join public.event_templates tpl on tpl.id = e.template_id
       left join public.season_memberships m on m.id = i.season_membership_id
       join public.people p on p.id = coalesce(i.person_id, m.person_id)
       left join public.current_rsvp r on r.invitation_id = i.id
      where i.id = $1`,
    [invitationId],
  );

  const row = result.rows[0];
  if (!row) {
    // Unreachable through the page; kept as a refusal rather than a null.
    throw new ConstraintViolated("That invitation no longer exists.", {
      rule: "rsvp_page_requires_an_invitation",
    });
  }

  return {
    invitationId: row.invitation_id,
    capacity: row.capacity,
    eventName: row.event_name,
    templateName: row.template_name,
    eventType: row.event_type,
    eventStatus: row.event_status,
    scheduledOn: row.scheduled_on,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    venue: row.venue,
    description: row.description,
    requiredEquipment: row.required_equipment,
    eventStartsAt: row.event_starts_at,
    playerName: row.player_name,
    responseDeadline: row.response_deadline,
    currentResponse:
      row.response && row.responded_at
        ? { response: row.response, reason: row.reason, respondedAt: row.responded_at }
        : null,
  };
}

export interface SignedRsvpSubmission {
  readonly response: "yes" | "no";
  readonly reason?: string | null;
}

export interface RecordedRsvpResponse {
  readonly responseId: string;
  readonly response: "yes" | "no";
  readonly respondedAt: Date;
  readonly invitationId: string;
  readonly cancelledJobs: number;
}

export const NO_REQUIRES_A_REASON_RULE = "rsvp_responses_no_requires_a_reason";
export const RESPONSE_WINDOW_CLOSED_RULE = "rsvp_response_window_closed";
export const INVITATION_WITHDRAWN_RULE = "rsvp_invitation_withdrawn";

const JOB_CANCELLED_REASON = "The invitee responded, so this reminder is no longer needed.";
const FLAG_RESOLVED_BY_ANSWER = "The invitee answered.";

/** Stops chasing one person about one event (LAN-169, `REQ-chase-stopped`); one function every answer path calls. */
export async function stopChasingIn(
  tx: Tx,
  invitationId: string,
  options: { reason?: string; resolvedByPersonId?: string | null } = {},
): Promise<{ cancelledJobs: number; clearedFlags: number }> {
  const cancelled = await tx.query(
    `update public.notification_jobs
        set status = 'cancelled', cancelled_reason = $2, updated_at = now()
      where invitation_id = $1
        and status in ('pending', 'ready')
        and job_type in ('invitation', 'reminder')`,
    [invitationId, options.reason ?? JOB_CANCELLED_REASON],
  );

  const cleared = await tx.query(
    `update public.nonresponse_flags
        set resolved_at = now(),
            resolution = $2,
            resolved_by_person_id = $3
      where invitation_id = $1
        and resolved_at is null`,
    [invitationId, options.reason ?? FLAG_RESOLVED_BY_ANSWER, options.resolvedByPersonId ?? null],
  );

  return { cancelledJobs: cancelled.rowCount ?? 0, clearedFlags: cleared.rowCount ?? 0 };
}

export function composeReason(reason: string | null | undefined): string {
  return (reason ?? "").trim();
}

/** Records one answer against an invitation already known writable; skips token resolution, which each caller has already done. */
export async function recordAnswerIn(
  tx: Tx,
  invitationId: string,
  submission: SignedRsvpSubmission,
  options: { actorLabel: string; source: "signed_link" },
): Promise<RecordedRsvpResponse> {
  // A withdrawn invitation outlives its own cancellation (invariant P4); there is nothing left to answer.
  const invitation = await tx.query<{ status: string }>(
    `select status::text as status from public.invitations where id = $1 for update`,
    [invitationId],
  );
  const previousStatus = invitation.rows[0]?.status ?? null;
  if (previousStatus === "cancelled") {
    throw new InvalidTransition(
      "This invitation has been withdrawn, so a response can no longer be recorded.",
      { rule: INVITATION_WITHDRAWN_RULE },
    );
  }

  const reason = submission.response === "no" ? composeReason(submission.reason) : null;

  if (submission.response === "no" && reason === "") {
    throw new ConstraintViolated("Choose a reason before saving Not attending.", {
      rule: NO_REQUIRES_A_REASON_RULE,
    });
  }

  const inserted = await tx.query<{ id: string; responded_at: Date }>(
    `insert into public.rsvp_responses
       (invitation_id, response, reason, source, responded_at)
     values ($1, $2::public.rsvp_value, $3, $4::public.rsvp_source, now())
     returning id, responded_at`,
    [invitationId, submission.response, reason, options.source],
  );
  const row = inserted.rows[0];

  // `expired` → `responded` is legal and deliberate: late answers are answers (model §2.4).
  await tx.query(
    `update public.invitations set status = 'responded' where id = $1 and status <> 'responded'`,
    [invitationId],
  );

  const { cancelledJobs, clearedFlags } = await stopChasingIn(tx, invitationId);

  // The reason text is deliberately not copied into the audit trail — it would widen who can read it.
  await recordAudit(tx, {
    actorLabel: options.actorLabel,
    action: "invitation.response_recorded",
    entityTable: "invitations",
    entityId: invitationId,
    fromState: previousStatus,
    toState: "responded",
    context: {
      response: submission.response,
      source: options.source,
      cancelledNotificationJobs: cancelledJobs,
      clearedNonresponseFlags: clearedFlags,
    },
  });

  return {
    responseId: row.id,
    response: submission.response,
    respondedAt: row.responded_at,
    invitationId,
    cancelledJobs,
  };
}

/** Records one answer through a signed link, or refuses; everything commits together in one transaction. */
export async function recordSignedLinkResponse(
  token: string,
  submission: SignedRsvpSubmission,
): Promise<RecordedRsvpResponse> {
  return withTransaction(async (tx) => {
    // Re-resolved here, inside the writing transaction — the render proves nothing about now.
    const resolution = await resolveRsvpTokenIn(tx, token);

    if (!resolution.writable || !resolution.invitation) {
      throw new InvalidTransition(closedWindowMessage(resolution.state), {
        rule: RESPONSE_WINDOW_CLOSED_RULE,
      });
    }

    return recordAnswerIn(tx, resolution.invitation.invitationId, submission, {
      actorLabel: "player: signed RSVP link",
      source: "signed_link",
    });
  });
}

function closedWindowMessage(state: TokenState): string {
  return state === "cancelled"
    ? "This event has been cancelled, so there is nothing to respond to."
    : "This RSVP link can no longer be used to record a response.";
}

// The operator's own write — W3, LAN-170.

export interface OperatorRsvpSubmission {
  readonly response: "yes" | "no";
  readonly reason?: string | null;
  readonly respondedAtDate: string;
  readonly respondedAtTime: string;
  /** A blank/missing entry means the question stays outstanding; partial answers are accepted. */
  readonly questionAnswers?: Readonly<Record<string, string>>;
}

export const RESPONDED_AT_INVALID_RULE = "rsvp_operator_responded_at_invalid";
export const RESPONDED_AT_NOT_FUTURE_RULE = "rsvp_operator_responded_at_not_future";
export const RESPONDED_AT_BEFORE_INVITATION_RULE = "rsvp_operator_responded_at_before_invitation";
export const OPERATOR_CANNOT_SUPERSEDE_PLAYER_RULE = "rsvp_operator_cannot_supersede_player";

const CLUB_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CLUB_TIME_PATTERN = /^\d{2}:\d{2}$/;

/** Records what an operator was told in person — W3, LAN-170. Never refuses for a prior operator answer or event start. */
export async function recordOperatorRsvpResponse(
  operatorPersonId: string,
  eventId: string,
  invitationId: string,
  submission: OperatorRsvpSubmission,
): Promise<RecordedRsvpResponse> {
  return withTransaction(async (tx) => {
    const invitation = await tx.query<{
      status: string;
      event_id: string;
      created_at: Date;
    }>(
      `select status::text as status, event_id, created_at
         from public.invitations
        where id = $1
        for update`,
      [invitationId],
    );
    const invitationRow = invitation.rows[0];
    if (!invitationRow || invitationRow.event_id !== eventId) {
      throw new NotFound("That invitation no longer exists.", {
        rule: "rsvp_operator_requires_an_invitation",
      });
    }
    if (invitationRow.status === "cancelled") {
      throw new InvalidTransition(
        "This invitation has been withdrawn, so a response can no longer be recorded.",
        { rule: INVITATION_WITHDRAWN_RULE },
      );
    }

    // DEC-no-supersede, checked inside the row lock above — see decision history.
    const existingPlayerResponse = await tx.query<{ id: string }>(
      `select id from public.rsvp_responses
        where invitation_id = $1 and source = 'signed_link'
        limit 1`,
      [invitationId],
    );
    if (existingPlayerResponse.rows.length > 0) {
      throw new Conflict(
        "This player has already answered for themselves, so an operator " +
          "cannot record over it. Ask them to change their answer from " +
          "their own RSVP link.",
        { rule: OPERATOR_CANNOT_SUPERSEDE_PLAYER_RULE },
      );
    }

    if (!CLUB_DATE_PATTERN.test(submission.respondedAtDate)) {
      throw new ConstraintViolated("Choose a date and time.", {
        rule: RESPONDED_AT_INVALID_RULE,
      });
    }
    if (!CLUB_TIME_PATTERN.test(submission.respondedAtTime)) {
      throw new ConstraintViolated("Choose a date and time.", {
        rule: RESPONDED_AT_INVALID_RULE,
      });
    }

    // now() read in the same statement so both are compared on the database's clock.
    const resolved = await tx.query<{ instant: Date | null; db_now: Date }>(
      `select ($1::date + $2::time) at time zone 'Europe/London' as instant, now() as db_now`,
      [submission.respondedAtDate, submission.respondedAtTime],
    );
    const resolvedRow = resolved.rows[0];
    const respondedAt = resolvedRow?.instant ?? null;
    if (!respondedAt || Number.isNaN(new Date(respondedAt).getTime())) {
      throw new ConstraintViolated("Choose a date and time.", {
        rule: RESPONDED_AT_INVALID_RULE,
      });
    }
    if (respondedAt.getTime() > resolvedRow.db_now.getTime()) {
      throw new ConstraintViolated(
        "This can't be in the future. Choose a time that has already happened.",
        {
          rule: RESPONDED_AT_NOT_FUTURE_RULE,
        },
      );
    }
    // Floored to the minute: respondedAt only carries minute precision, created_at carries seconds.
    const invitationCreatedAtFloor = new Date(invitationRow.created_at);
    invitationCreatedAtFloor.setSeconds(0, 0);
    if (respondedAt.getTime() < invitationCreatedAtFloor.getTime()) {
      throw new ConstraintViolated(
        "This can't be before the invitation. The player cannot have answered before being asked.",
        { rule: RESPONDED_AT_BEFORE_INVITATION_RULE },
      );
    }

    const reason = submission.response === "no" ? composeReason(submission.reason) : null;
    if (submission.response === "no" && reason === "") {
      throw new ConstraintViolated("Choose a reason before saving Not attending.", {
        rule: NO_REQUIRES_A_REASON_RULE,
      });
    }

    const inserted = await tx.query<{ id: string; responded_at: Date }>(
      `insert into public.rsvp_responses
         (invitation_id, response, reason, source, responded_at, recorded_by_person_id)
       values ($1, $2::public.rsvp_value, $3, 'operator', $4, $5)
       returning id, responded_at`,
      [invitationId, submission.response, reason, respondedAt, operatorPersonId],
    );
    const responseRow = inserted.rows[0];

    await tx.query(
      `update public.invitations set status = 'responded' where id = $1 and status <> 'responded'`,
      [invitationId],
    );

    const { cancelledJobs } = await stopChasingIn(tx, invitationId, {
      resolvedByPersonId: operatorPersonId,
    });

    const answeredQuestionIds = Object.entries(submission.questionAnswers ?? {})
      .filter(([, value]) => value.trim() !== "")
      .map(([questionId]) => questionId);

    if (answeredQuestionIds.length > 0) {
      const questions = await tx.query<{
        id: string;
        answer_type: string;
        choices: string[] | null;
      }>(
        `select id, answer_type::text as answer_type, choices
           from public.event_questions
          where event_id = $1 and id = any($2::uuid[])`,
        [eventId, answeredQuestionIds],
      );
      const questionById = new Map(questions.rows.map((question) => [question.id, question]));

      for (const [questionId, rawValue] of Object.entries(submission.questionAnswers ?? {})) {
        const value = rawValue.trim();
        if (value === "") continue;
        const question = questionById.get(questionId);
        if (!question) continue;

        let answerText: string | null = null;
        let answerBoolean: boolean | null = null;
        let answerChoice: string | null = null;

        if (question.answer_type === "boolean") {
          const normalized = value.toLowerCase();
          if (normalized === "yes" || normalized === "true") answerBoolean = true;
          else if (normalized === "no" || normalized === "false") answerBoolean = false;
          else continue;
        } else if (question.answer_type === "choice") {
          if (!question.choices?.includes(value)) continue;
          answerChoice = value;
        } else {
          answerText = value;
        }

        await tx.query(
          `insert into public.question_responses
             (invitation_id, event_id, event_question_id,
              answer_text, answer_boolean, answer_choice, responded_at)
           values ($1, $2, $3, $4, $5, $6, $7)
           on conflict (invitation_id, event_question_id) do update
             set answer_text = excluded.answer_text,
                 answer_boolean = excluded.answer_boolean,
                 answer_choice = excluded.answer_choice,
                 responded_at = excluded.responded_at`,
          [invitationId, eventId, questionId, answerText, answerBoolean, answerChoice, respondedAt],
        );
      }
    }

    // Provenance lives in the audit trail only — the row reads exactly like a player's own answer.
    await recordAudit(tx, {
      actorPersonId: operatorPersonId,
      action: "invitation.response_recorded",
      entityTable: "invitations",
      entityId: invitationId,
      fromState: invitationRow.status,
      toState: "responded",
      context: {
        response: submission.response,
        source: "operator",
        cancelledNotificationJobs: cancelledJobs,
        questionsAnswered: answeredQuestionIds.length,
      },
    });

    return {
      responseId: responseRow.id,
      response: submission.response,
      respondedAt: responseRow.responded_at,
      invitationId,
      cancelledJobs,
    };
  });
}
