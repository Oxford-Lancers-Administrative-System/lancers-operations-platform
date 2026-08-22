import "server-only";

import { ConstraintViolated, InvalidTransition, withTransaction, type Tx } from "@/lib/db";

import { recordAudit } from "./audit";
import { resolveRsvpTokenIn, type TokenState } from "./rsvp-tokens";

/**
 * The player's own RSVP, answered through a signed link. LAN-79.
 *
 * ## The one unauthenticated write in the application
 *
 * Everything else in this codebase writes on behalf of a verified operator
 * resolved from a session. This module writes on behalf of whoever holds a
 * 256-bit token, which is a genuinely different trust model: the token *is* the
 * authorization, there is no second factor, and the holder is never asked who
 * they are. Two consequences run through every function here.
 *
 * First, **the token is re-resolved inside the writing transaction**, never
 * trusted from the render that produced the form. A page rendered at 19:59 and
 * submitted at 20:01 must be refused, and the only way to guarantee that is to
 * ask again while holding the transaction that would do the writing. The read
 * path and the write path therefore both go through `resolveRsvpTokenIn`, and
 * neither takes an invitation id from the browser.
 *
 * Second, **the actor is a mechanism, not a person**. `audit.ts` requires an
 * actor and refuses to guess one; a token holder is not a verified person, so
 * these rows carry `actorLabel` naming the channel. Writing the invitee's
 * person id there would assert an identity the token never proved.
 *
 * ## Two different times, kept apart
 *
 * `invitations.expires_at` is the **response deadline**: it decides when an
 * unanswered invitation becomes something the club chases, and it is displayed
 * to the player. It is not a cutoff — a late answer is still an answer, and the
 * invitation moves `expired` → `responded` when one arrives.
 *
 * **Event start is the cutoff**, and it is hard. After it this module writes
 * nothing at all, whatever the token still says. That decision is not taken
 * here: `resolveRsvpTokenIn` already refuses to call such a token writable, and
 * this module has no path that second-guesses it.
 *
 * ## Append-only, by construction
 *
 * A change of answer inserts another row. Nothing here updates or deletes a
 * response, and the database would refuse it if something tried — `service_role`
 * holds only `select, insert` on `rsvp_responses`. The standing answer is
 * whatever `public.current_rsvp` says it is.
 */

/** What the player is shown. Their own invitation, and nothing else's. */
export interface SignedRsvpPage {
  readonly invitationId: string;
  readonly eventName: string;
  /** `events.event_type`, raw. The page turns it into the club's word for it. */
  readonly eventType: string;
  readonly eventStatus: string;
  /** Calendar date of the event, `YYYY-MM-DD`, in the club's zone. */
  readonly scheduledOn: string | null;
  /** Local wall-clock `HH:MM`, or null where the event records no time. */
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly venue: string | null;
  /** The instant the write window closes. */
  readonly eventStartsAt: Date;
  /** The player, as they would be addressed. */
  readonly playerName: string;
  /** The response deadline — displayed, never enforced as a cutoff. */
  readonly responseDeadline: Date | null;
  /** The standing answer, or null where none has been given. */
  readonly currentResponse: CurrentResponse | null;
}

export interface CurrentResponse {
  readonly response: "yes" | "no";
  readonly reason: string | null;
  readonly respondedAt: Date;
}

/**
 * Everything the page renders, for one invitation, in one statement.
 *
 * Reads by invitation id — which only ever arrives from a resolved token, never
 * from the browser. There is deliberately no function here that takes an
 * invitation id from a request parameter.
 *
 * The select list is the whole privacy contract of this screen: one event, one
 * person, one standing answer. It cannot return another invitee's name, another
 * invitee's response, or a count of either, because it never joins to a second
 * invitation.
 */
export async function readSignedRsvpPageIn(tx: Tx, invitationId: string): Promise<SignedRsvpPage> {
  const result = await tx.query<{
    invitation_id: string;
    event_name: string;
    event_type: string;
    event_status: string;
    scheduled_on: string | null;
    starts_at: string | null;
    ends_at: string | null;
    venue: string | null;
    event_starts_at: Date;
    player_name: string;
    response_deadline: Date | null;
    response: "yes" | "no" | null;
    reason: string | null;
    responded_at: Date | null;
  }>(
    `select i.id as invitation_id,
            e.name as event_name,
            e.event_type::text as event_type,
            e.status::text as event_status,
            to_char(e.scheduled_on, 'YYYY-MM-DD') as scheduled_on,
            to_char(e.starts_at, 'HH24:MI') as starts_at,
            to_char(e.ends_at, 'HH24:MI') as ends_at,
            e.venue,
            (e.scheduled_on + coalesce(e.starts_at, '00:00'::time))
              at time zone 'Europe/London' as event_starts_at,
            -- concat_ws rather than a plain concatenation: family_name is
            -- nullable, and concatenating against a null would make the whole
            -- name null and render a player no name at all. The seed contains
            -- such a person, which is the point of the seed.
            concat_ws(' ',
              coalesce(nullif(btrim(p.known_as), ''), p.given_name),
              nullif(btrim(coalesce(p.family_name, '')), '')) as player_name,
            i.expires_at as response_deadline,
            r.response::text as response,
            r.reason,
            r.responded_at
       from public.invitations i
       join public.events e on e.id = i.event_id
       left join public.season_memberships m on m.id = i.season_membership_id
       join public.people p on p.id = coalesce(i.person_id, m.person_id)
       left join public.current_rsvp r on r.invitation_id = i.id
      where i.id = $1`,
    [invitationId],
  );

  const row = result.rows[0];
  if (!row) {
    // Unreachable through the page: the invitation was joined to a live token
    // moments ago. Kept as a refusal rather than a null so that a future caller
    // inventing an id gets an error instead of a blank screen.
    throw new ConstraintViolated("That invitation no longer exists.", {
      rule: "rsvp_page_requires_an_invitation",
    });
  }

  return {
    invitationId: row.invitation_id,
    eventName: row.event_name,
    eventType: row.event_type,
    eventStatus: row.event_status,
    scheduledOn: row.scheduled_on,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    venue: row.venue,
    eventStartsAt: row.event_starts_at,
    playerName: row.player_name,
    responseDeadline: row.response_deadline,
    currentResponse:
      row.response && row.responded_at
        ? { response: row.response, reason: row.reason, respondedAt: row.responded_at }
        : null,
  };
}

/** What a caller may submit. The domain value is binary — locked Requirement 5. */
export interface SignedRsvpSubmission {
  readonly response: "yes" | "no";
  /** Required for `no`, ignored for `yes`. */
  readonly reason?: string | null;
}

export interface RecordedRsvpResponse {
  readonly responseId: string;
  readonly response: "yes" | "no";
  readonly respondedAt: Date;
  readonly invitationId: string;
  /** How many pending reminder jobs this answer called off. */
  readonly cancelledJobs: number;
}

export const NO_REQUIRES_A_REASON_RULE = "rsvp_responses_no_requires_a_reason";
export const RESPONSE_WINDOW_CLOSED_RULE = "rsvp_response_window_closed";
export const INVITATION_WITHDRAWN_RULE = "rsvp_invitation_withdrawn";

/** Why a pending reminder was called off, recorded on the job itself. */
const JOB_CANCELLED_REASON = "The invitee responded, so this reminder is no longer needed.";

/**
 * The player's reason, normalised.
 *
 * One field, and one column. The approved wireframe paired the reason with an
 * optional "Additional detail" box; Brian removed it on 14 August 2026 — a
 * player leaves one reason, and nothing downstream reads the two apart.
 *
 * Trimming happens here rather than in the route so that the database's
 * `no_requires_a_reason` check and this module's refusal are talking about the
 * same string. That is what makes the form's validation and the server's
 * validation genuinely equivalent rather than merely similar: a reason of three
 * spaces satisfies the browser's `required` attribute and must still be
 * refused.
 */
export function composeReason(reason: string | null | undefined): string {
  return (reason ?? "").trim();
}

/**
 * Records one answer through a signed link, or refuses.
 *
 * Everything commits together: the response row, the invitation's move to
 * `responded`, the reminder jobs this answer calls off, and the audit record.
 * A failure anywhere leaves the player's standing answer exactly as it was.
 *
 * Refuses with `InvalidTransition` when the write window is shut — which is any
 * reason the token is not writable, including the hard event-start cutoff — and
 * with `ConstraintViolated` when a `no` carries no reason. The caller maps both
 * onto the screen; neither is allowed to say *which* token state was the
 * problem, because the public response for all of them is uniform.
 */
export async function recordSignedLinkResponse(
  token: string,
  submission: SignedRsvpSubmission,
): Promise<RecordedRsvpResponse> {
  return withTransaction(async (tx) => {
    // Re-resolved here, inside the transaction that will do the writing. The
    // render that produced this form proves nothing about now.
    const resolution = await resolveRsvpTokenIn(tx, token);

    if (!resolution.writable || !resolution.invitation) {
      throw new InvalidTransition(closedWindowMessage(resolution.state), {
        rule: RESPONSE_WINDOW_CLOSED_RULE,
      });
    }

    const invitationId = resolution.invitation.invitationId;

    // The refusal that used to be here — "this event is for information only,
    // so there is nothing to respond to" — went with `solicits_response`. D23
    // removed the flag: everyone sent an event is expected to answer, and
    // whether the club expects them to be there is mandatory-or-optional, which
    // is a different question. There is no longer an event a signed link can
    // reach that has nothing to answer.

    // A withdrawn invitation outlives its own cancellation (invariant P4), so
    // the token can still resolve against it. There is nothing left to answer.
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

    // The same rule the database enforces, refused here so the player gets a
    // sentence instead of an integrity error. Both checks are load-bearing:
    // this one for the message, the constraint for the guarantee.
    if (submission.response === "no" && reason === "") {
      throw new ConstraintViolated("Choose a reason before saving Not attending.", {
        rule: NO_REQUIRES_A_REASON_RULE,
      });
    }

    const inserted = await tx.query<{ id: string; responded_at: Date }>(
      `insert into public.rsvp_responses
         (invitation_id, response, reason, source, responded_at)
       values ($1, $2::public.rsvp_value, $3, 'signed_link', now())
       returning id, responded_at`,
      [invitationId, submission.response, reason],
    );
    const row = inserted.rows[0];

    // `expired` → `responded` is legal and deliberate: late answers are
    // answers (model §2.4). So is `responded` → `responded`, which is what a
    // changed answer does.
    await tx.query(
      `update public.invitations set status = 'responded' where id = $1 and status <> 'responded'`,
      [invitationId],
    );

    // Model §2.7 — an arriving RSVP calls off that person's pending reminders.
    // `processing` is left alone on purpose: it is claimed and in flight, and
    // racing the dispatcher for it would produce a job that is cancelled and
    // delivered. The dispatcher's own idempotency owns that case.
    const cancelled = await tx.query(
      `update public.notification_jobs
          set status = 'cancelled', cancelled_reason = $2, updated_at = now()
        where invitation_id = $1
          and status in ('pending', 'ready')`,
      [invitationId, JOB_CANCELLED_REASON],
    );
    const cancelledJobs = cancelled.rowCount ?? 0;

    // The response itself is recorded in `rsvp_responses`, which is its typed
    // first-class home; this row records the invitation's *transition* and the
    // reminders it called off. The reason text is deliberately not copied here
    // — absence reasons are private to the response, and duplicating them into
    // the audit trail would widen who can read them.
    await recordAudit(tx, {
      actorLabel: "player: signed RSVP link",
      action: "invitation.response_recorded",
      entityTable: "invitations",
      entityId: invitationId,
      fromState: previousStatus,
      toState: "responded",
      context: {
        response: submission.response,
        source: "signed_link",
        cancelledNotificationJobs: cancelledJobs,
      },
    });

    return {
      responseId: row.id,
      response: submission.response,
      respondedAt: row.responded_at,
      invitationId,
      cancelledJobs,
    };
  });
}

/**
 * One sentence for every shut-window state.
 *
 * The *message* is uniform on purpose. The state is still passed in so that a
 * future caller with a legitimate reason to distinguish them — a secure log, a
 * test — has it available, and so that this function never becomes the place
 * where the distinction is quietly lost.
 */
function closedWindowMessage(state: TokenState): string {
  return state === "cancelled"
    ? "This event has been cancelled, so there is nothing to respond to."
    : "This RSVP link can no longer be used to record a response.";
}
