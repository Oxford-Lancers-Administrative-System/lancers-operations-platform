import "server-only";

import { ConstraintViolated, InvalidTransition, type Tx } from "@/lib/db";

import { recordAnswerIn, type SignedRsvpSubmission } from "./rsvp";
import { NO_REASON_GIVEN_DEFAULT } from "./player-answer-tokens";

/**
 * Reads and writes for the two pages LAN-172 adds beyond the answer link
 * itself: the answer-specific landing content, and the player's own durable
 * page. LAN-79's `readSignedRsvpPageIn` already owns "one invitation, one
 * player, one standing answer" — this module adds what that page never
 * needed: an aggregate count across the whole event, the event's own
 * questions, and a second person's-eye-view across every invitation they
 * hold.
 *
 * ## The privacy contract, restated for this module specifically
 *
 * Every query here is scoped by a `personId` or an `invitationId` that the
 * caller has already resolved from a live, verified credential — never from a
 * request parameter taken on trust. `readPlayerHomeIn` in particular is the
 * one place in the codebase that returns *more than one invitation* to an
 * unauthenticated caller, and its whole safety rests on `personId` coming from
 * `resolvePersonTokenIn`, never from the browser.
 */

/** The event's start instant, aliased to whichever table alias a query uses. */
function eventStartExpression(alias: string): string {
  return `(${alias}.scheduled_on + coalesce(${alias}.starts_at, '00:00'::time)) at time zone 'Europe/London'`;
}

const EVENT_START_EXPRESSION = eventStartExpression("e");

// ---------------------------------------------------------------------------
// The answer-specific landing content
// ---------------------------------------------------------------------------

export interface EventQuestionAnswer {
  readonly text: string | null;
  readonly boolean: boolean | null;
  readonly choice: string | null;
}

export interface EventQuestionForAnswer {
  readonly id: string;
  readonly prompt: string;
  readonly answerType: "text" | "boolean" | "choice";
  readonly choices: readonly string[] | null;
  readonly isRequired: boolean;
  readonly currentAnswer: EventQuestionAnswer | null;
}

export interface PlayerAnswerLanding {
  readonly attendingCount: number;
  readonly otherOutstandingCount: number;
  readonly questions: readonly EventQuestionForAnswer[];
  readonly outstandingRequiredQuestions: number;
}

/**
 * Everything `readSignedRsvpPageIn` does not already return for one
 * invitation: the live Yes count for its event, how many *other* invitations
 * this same player still needs to answer, and the event's own questions with
 * whatever this invitation has already answered.
 *
 * A zero Yes count is returned as `0`, not omitted — omission is a
 * message-copy rule (`attendingSentence` in `templates.ts`), not a page rule;
 * the page always has room to say "Nobody has said yes yet" or nothing, and
 * that choice belongs to the component, not the read.
 */
export async function readPlayerAnswerLandingIn(
  tx: Tx,
  invitationId: string,
): Promise<PlayerAnswerLanding> {
  const context = await tx.query<{
    event_id: string;
    person_id: string | null;
    capacity: string;
  }>(
    `select i.event_id, coalesce(i.person_id, m.person_id) as person_id, i.capacity::text as capacity
       from public.invitations i
       left join public.season_memberships m on m.id = i.season_membership_id
      where i.id = $1`,
    [invitationId],
  );
  const row = context.rows[0];
  if (!row) {
    throw new ConstraintViolated("That invitation no longer exists.", {
      rule: "player_answer_landing_requires_an_invitation",
    });
  }

  const attending = await tx.query<{ count: string }>(
    `select count(*) as count
       from public.current_rsvp r
       join public.invitations i2 on i2.id = r.invitation_id
      where i2.event_id = $1 and r.response = 'yes'`,
    [row.event_id],
  );

  const outstanding = row.person_id
    ? await tx.query<{ count: string }>(
        `select count(*) as count
           from public.invitations i2
           join public.events e2 on e2.id = i2.event_id
           left join public.season_memberships m2 on m2.id = i2.season_membership_id
           left join public.current_rsvp r2 on r2.invitation_id = i2.id
          where coalesce(i2.person_id, m2.person_id) = $1
            and i2.id <> $2
            and r2.response is null
            and e2.status = 'approved'
            and ${eventStartExpression("e2")} > now()`,
        [row.person_id, invitationId],
      )
    : { rows: [{ count: "0" }] };

  const questions = await tx.query<{
    id: string;
    prompt: string;
    answer_type: string;
    choices: string[] | null;
    is_required: boolean;
    answer_text: string | null;
    answer_boolean: boolean | null;
    answer_choice: string | null;
  }>(
    `select q.id, q.prompt, q.answer_type::text as answer_type, q.choices, q.is_required,
            qr.answer_text, qr.answer_boolean, qr.answer_choice
       from public.event_questions q
       left join public.question_responses qr
         on qr.event_question_id = q.id and qr.invitation_id = $2
      where q.event_id = $1
        and $3::public.invitation_capacity = any(q.applies_to_capacities)
      order by q.sort_order, q.prompt`,
    [row.event_id, invitationId, row.capacity],
  );

  const questionRows: EventQuestionForAnswer[] = questions.rows.map((q) => ({
    id: q.id,
    prompt: q.prompt,
    answerType: q.answer_type as "text" | "boolean" | "choice",
    choices: q.choices,
    isRequired: q.is_required,
    currentAnswer:
      q.answer_text !== null || q.answer_boolean !== null || q.answer_choice !== null
        ? { text: q.answer_text, boolean: q.answer_boolean, choice: q.answer_choice }
        : null,
  }));

  return {
    attendingCount: Number(attending.rows[0]?.count ?? 0),
    otherOutstandingCount: Number(outstanding.rows[0]?.count ?? 0),
    questions: questionRows,
    outstandingRequiredQuestions: questionRows.filter(
      (q) => q.isRequired && q.currentAnswer === null,
    ).length,
  };
}

export const QUESTION_ANSWER_REQUIRES_A_VALUE_RULE = "event_question_answer_requires_a_value";

/** What the form posts for one question. Exactly one of the three is set. */
export interface QuestionAnswerSubmission {
  readonly questionId: string;
  readonly text?: string | null;
  readonly boolean?: boolean | null;
  readonly choice?: string | null;
}

/**
 * Saves the questions a Yes still owes the event, or refuses.
 *
 * Refuses the whole batch rather than saving some and refusing others — a
 * forced failure must leave no partial completed answer, per LAN-172's
 * acceptance list. Everything commits together because the caller wraps this
 * in the same transaction as everything else on the request.
 *
 * `personId` must come from a resolved, verified credential — never from the
 * request — and is re-proved against the invitation here, the same way
 * `recordPlayerHomeAnswerIn` proves it for the standing-answer write. Without
 * this, `invitationId` alone is enough to overwrite anyone's answers, because
 * an invitation's existence says nothing about who is submitting the form.
 */
export async function answerEventQuestionsIn(
  tx: Tx,
  personId: string,
  invitationId: string,
  submissions: readonly QuestionAnswerSubmission[],
): Promise<void> {
  if (submissions.length === 0) return;

  const eventContext = await tx.query<{
    event_id: string;
    resolved_person_id: string | null;
  }>(
    `select i.event_id, coalesce(i.person_id, m.person_id) as resolved_person_id
       from public.invitations i
       left join public.season_memberships m on m.id = i.season_membership_id
      where i.id = $1`,
    [invitationId],
  );
  const row = eventContext.rows[0];
  if (!row) {
    throw new ConstraintViolated("That invitation no longer exists.", {
      rule: "event_question_answer_requires_an_invitation",
    });
  }
  if (row.resolved_person_id !== personId) {
    throw new ConstraintViolated("That invitation does not belong to this page.", {
      rule: INVITATION_NOT_OWNED_RULE,
    });
  }
  const eventId = row.event_id;

  for (const submission of submissions) {
    const provided = [submission.text, submission.boolean, submission.choice].filter(
      (value) => value !== undefined && value !== null && value !== "",
    );
    if (provided.length === 0) continue; // Optional and left blank — nothing to save.
    if (provided.length > 1) {
      throw new ConstraintViolated("Each question takes exactly one kind of answer.", {
        rule: QUESTION_ANSWER_REQUIRES_A_VALUE_RULE,
      });
    }

    await tx.query(
      `insert into public.question_responses
         (invitation_id, event_id, event_question_id, answer_text, answer_boolean, answer_choice)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (invitation_id, event_question_id)
       do update set
         answer_text = excluded.answer_text,
         answer_boolean = excluded.answer_boolean,
         answer_choice = excluded.answer_choice,
         responded_at = now()`,
      [
        invitationId,
        eventId,
        submission.questionId,
        submission.text ?? null,
        submission.boolean ?? null,
        submission.choice ?? null,
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// The durable, season-scoped player page
// ---------------------------------------------------------------------------

export interface PlayerHomeInvitation {
  readonly invitationId: string;
  readonly eventId: string;
  readonly eventName: string;
  readonly eventType: string;
  readonly scheduledOn: string | null;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly venue: string | null;
  readonly responseDeadline: Date | null;
  /** The live Yes count for this event — the same aggregate the answer link shows. */
  readonly attendingCount: number;
  /** Whether the club has already chased this invitation with a reminder rung — see `PlayerHome`'s own doc comment. */
  readonly reminderSent: boolean;
  readonly standingAnswer: "yes" | "no" | null;
  /** The No's reason, verbatim — the default or whatever real reason replaced it. */
  readonly reason: string | null;
  readonly reasonIsDefault: boolean;
  readonly outstandingRequiredQuestions: number;
}

/**
 * Owner correction round 2 (LAN-172, Q-22/Q-23): the approved W2-05 mockup
 * draws four sections, not two — `New invitations`, `Still need your
 * answer`, `Follow-up needed`, `Your answers — still to come`
 * (`W2-answer-an-invitation.md:201-210`). The first ticket collapsed this to
 * two sections on the reasoning that "new" versus "still need an answer"
 * needs an opened/unopened column no table carries. That reasoning was never
 * put to Brian, and LAN-169 has since shipped the messaging ladder: whether
 * this player has already been *chased* — a WhatsApp reminder or the email
 * rung has actually gone out — is now a real, derivable fact
 * (`notification_jobs.job_type = 'reminder'`, the same predicate
 * `stopChasingIn` already uses for Q-12's cancellation scope). An invitation
 * still on its first contact is `New`; one the club has already chased once
 * moves to `Still need your answer`. This is not literal "the player opened
 * the link" — Q-11 keeps the answer link's GET side-effect-free, so that
 * literal fact can never be tracked without violating the release gate — but
 * it is a genuine structural distinction the data supports, not an invented
 * one.
 */
export interface PlayerHome {
  readonly playerName: string;
  /**
   * Owner correction round 3 (LAN-172, Q-26): scoped to approved and within
   * the horizon — the same set the near-term sections render, never
   * further-out unanswered work. Brian's ruling overrides the count's
   * original horizon-independent definition: "The six outstanding should
   * just be the ones within the 21-day time horizon." A player whose only
   * outstanding work sits beyond the horizon sees zero here and their work
   * in `furtherOut` — that is intended, not a bug.
   */
  readonly outstandingCount: number;
  /**
   * The single soonest unanswered invitation across `newInvitations` and
   * `stillNeedAnswer` combined — "the next invitation is visually dominant"
   * (`W2-answer-an-invitation.md:204`). Null when nothing needs an answer.
   */
  readonly nextInvitationId: string | null;
  readonly newInvitations: readonly PlayerHomeInvitation[];
  readonly stillNeedAnswer: readonly PlayerHomeInvitation[];
  readonly followUpNeeded: readonly PlayerHomeInvitation[];
  readonly answeredUpcoming: readonly PlayerHomeInvitation[];
  /** Everything past the horizon, of any kind, in one openable section — Q-20. */
  readonly furtherOut: readonly PlayerHomeInvitation[];
}

/**
 * Q-20's ruling: the main sections show only events within this many days;
 * everything beyond sits in one separate section the player can open.
 * `REQ-approved-means-visible` is unaffected — nothing is hidden, only moved
 * further down the same page. A single named constant, not a setting: Brian,
 * 2026-08-26, "I'd rather get this out and see what the functionality looks
 * like rather than change it."
 */
export const PLAYER_HOME_HORIZON_DAYS = 21;

/**
 * A standing No still carrying the honest default, or a Yes still owing
 * questions. Exported so the page can classify a mixed `furtherOut` entry the
 * same way the four near-term sections already were.
 */
export function needsFollowUp(
  entry: Pick<
    PlayerHomeInvitation,
    "standingAnswer" | "reasonIsDefault" | "outstandingRequiredQuestions"
  >,
): boolean {
  return (
    (entry.standingAnswer === "no" && entry.reasonIsDefault) ||
    entry.outstandingRequiredQuestions > 0
  );
}

/**
 * Everything this person's own page shows — their own work, and nothing that
 * belongs to anybody else. Scoped entirely by `personId`, which the caller
 * must already have resolved from a live durable token.
 *
 * `REQ-approved-means-visible`: the `where e.status = 'approved'` predicate
 * has no dispatch condition beside it, so an invitation is here from the
 * moment its event is approved — whether or not any message has gone out yet.
 */
export async function readPlayerHomeIn(tx: Tx, personId: string): Promise<PlayerHome> {
  const person = await tx.query<{ player_name: string }>(
    `select concat_ws(' ',
              coalesce(nullif(btrim(p.known_as), ''), p.given_name),
              nullif(btrim(coalesce(p.family_name, '')), '')) as player_name
       from public.people p
      where p.id = $1`,
    [personId],
  );
  const playerName = person.rows[0]?.player_name ?? "";

  const result = await tx.query<{
    invitation_id: string;
    event_id: string;
    event_name: string;
    event_type: string;
    scheduled_on: string | null;
    starts_at: string | null;
    ends_at: string | null;
    venue: string | null;
    response_deadline: Date | null;
    response: "yes" | "no" | null;
    reason: string | null;
    capacity: string;
    attending_count: string;
    reminder_sent: boolean;
    beyond_horizon: boolean;
  }>(
    `select i.id as invitation_id, e.id as event_id, e.name as event_name,
            e.event_type::text as event_type,
            to_char(e.scheduled_on, 'YYYY-MM-DD') as scheduled_on,
            to_char(e.starts_at, 'HH24:MI') as starts_at,
            to_char(e.ends_at, 'HH24:MI') as ends_at,
            e.venue,
            i.expires_at as response_deadline,
            r.response::text as response,
            r.reason,
            i.capacity::text as capacity,
            (select count(*)
               from public.current_rsvp r2
               join public.invitations i2 on i2.id = r2.invitation_id
              where i2.event_id = e.id and r2.response = 'yes') as attending_count,
            exists (
              select 1 from public.notification_jobs nj
               where nj.invitation_id = i.id
                 and nj.job_type = 'reminder'
                 and nj.status = 'completed'
            ) as reminder_sent,
            ${EVENT_START_EXPRESSION} > now() + make_interval(days => ${PLAYER_HOME_HORIZON_DAYS}) as beyond_horizon
       from public.invitations i
       join public.events e on e.id = i.event_id
       left join public.season_memberships m on m.id = i.season_membership_id
       left join public.current_rsvp r on r.invitation_id = i.id
      where coalesce(i.person_id, m.person_id) = $1
        and e.status = 'approved'
        and ${EVENT_START_EXPRESSION} > now()
      order by ${EVENT_START_EXPRESSION} asc`,
    [personId],
  );

  const newInvitations: PlayerHomeInvitation[] = [];
  const stillNeedAnswer: PlayerHomeInvitation[] = [];
  const followUpNeeded: PlayerHomeInvitation[] = [];
  const answeredUpcoming: PlayerHomeInvitation[] = [];
  const furtherOut: PlayerHomeInvitation[] = [];
  let outstandingCount = 0;
  let nextInvitationId: string | null = null;

  for (const row of result.rows) {
    const outstanding = await tx.query<{ count: string }>(
      `select count(*) as count
         from public.event_questions q
         left join public.question_responses qr
           on qr.event_question_id = q.id and qr.invitation_id = $2
        where q.event_id = $1
          and $3::public.invitation_capacity = any(q.applies_to_capacities)
          and q.is_required
          and qr.id is null`,
      [row.event_id, row.invitation_id, row.capacity],
    );

    const entry: PlayerHomeInvitation = {
      invitationId: row.invitation_id,
      eventId: row.event_id,
      eventName: row.event_name,
      eventType: row.event_type,
      scheduledOn: row.scheduled_on,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      venue: row.venue,
      responseDeadline: row.response_deadline,
      attendingCount: Number(row.attending_count ?? 0),
      reminderSent: row.reminder_sent,
      standingAnswer: row.response,
      reason: row.response === "no" ? row.reason : null,
      reasonIsDefault:
        row.response === "no" && (row.reason ?? "").trim() === NO_REASON_GIVEN_DEFAULT,
      outstandingRequiredQuestions: Number(outstanding.rows[0]?.count ?? 0),
    };

    if (row.beyond_horizon) {
      furtherOut.push(entry);
      continue;
    }

    if (row.response === null) {
      outstandingCount += 1;
      if (nextInvitationId === null) nextInvitationId = entry.invitationId;
      if (row.reminder_sent) stillNeedAnswer.push(entry);
      else newInvitations.push(entry);
    } else if (needsFollowUp(entry)) {
      followUpNeeded.push(entry);
    } else {
      answeredUpcoming.push(entry);
    }
  }

  return {
    playerName,
    outstandingCount,
    nextInvitationId,
    newInvitations,
    stillNeedAnswer,
    followUpNeeded,
    answeredUpcoming,
    furtherOut,
  };
}

export const INVITATION_NOT_OWNED_RULE = "player_home_invitation_not_owned";
export const INVITATION_WRITE_WINDOW_CLOSED_RULE = "player_home_write_window_closed";

/**
 * Records a Yes/No change made from the player's own page, or refuses.
 *
 * The durable token proves *who this is*, never *which invitation* — so every
 * write here re-proves ownership inside the same transaction that does the
 * writing, exactly the discipline `recordSignedLinkResponse` already applies
 * to the per-invitation link. An invitation belonging to somebody else is
 * refused identically to one that does not exist: `REQ-cross-person-isolation`
 * extends to the durable page's own writes, not only its reads.
 */
export async function recordPlayerHomeAnswerIn(
  tx: Tx,
  personId: string,
  invitationId: string,
  submission: SignedRsvpSubmission,
): Promise<void> {
  const context = await tx.query<{
    resolved_person_id: string | null;
    event_status: string;
    already_started: boolean;
  }>(
    `select coalesce(i.person_id, m.person_id) as resolved_person_id,
            e.status::text as event_status,
            ${EVENT_START_EXPRESSION} <= now() as already_started
       from public.invitations i
       join public.events e on e.id = i.event_id
       left join public.season_memberships m on m.id = i.season_membership_id
      where i.id = $1`,
    [invitationId],
  );

  const row = context.rows[0];
  if (!row || row.resolved_person_id !== personId) {
    throw new ConstraintViolated("That invitation does not belong to this page.", {
      rule: INVITATION_NOT_OWNED_RULE,
    });
  }
  if (row.already_started || row.event_status === "cancelled") {
    throw new InvalidTransition(
      "This response window is closed, so a change can no longer be recorded.",
      { rule: INVITATION_WRITE_WINDOW_CLOSED_RULE },
    );
  }

  await recordAnswerIn(tx, invitationId, submission, {
    actorLabel: "player: own page",
    source: "signed_link",
  });
}
