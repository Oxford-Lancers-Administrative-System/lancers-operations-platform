import "server-only";

import { ConstraintViolated, InvalidTransition, withTransaction } from "@/lib/db";
import { recordAudit } from "./audit";
import {
  listAudienceCatalogueIn,
  requireSelection,
  type AudienceCatalogue,
  type ResolvedAudienceMember,
} from "./event-audience";
import { readEventIn, type EventDetail } from "./events";
import { resolveResponseDeadlineIn, type ResolvedResponseDeadline } from "./response-deadline";

/**
 * The approval transaction. LAN-77, and the point of the whole slice.
 *
 * ## What "one transaction" has to mean here
 *
 * Approving an event is six writes that are only ever correct together: the
 * audience snapshot, the event's own status and approval columns, one invitation
 * per audience member, one notification job per invitation, and the audit rows
 * that say a human did it. A partial commit is not a smaller success — every
 * partial state is a specific operational failure:
 *
 *   * audience without approval — the calendar shows a draft the club believes
 *     it approved;
 *   * approval without invitations — everybody is in the audience and nobody is
 *     ever asked, which is precisely the defect `uninvited_audience_members`
 *     exists to report;
 *   * invitations without jobs — invitations that will never be delivered, with
 *     nothing queued to notice;
 *   * jobs without invitations — undeliverable work in the queue forever.
 *
 * `withTransaction` gives that guarantee and deliberately offers no savepoint,
 * so there is no way for a caller to half-recover: see
 * `src/lib/db/transaction.ts`, which names this exact failure as the reason.
 *
 * ## Order, and why it is this order
 *
 * 1. **The guarded status update first.** `where id = $1 and status = 'draft'`
 *    is the concurrency control, not a preceding read: it takes the row lock, so
 *    a second approval arriving at the same instant blocks, then finds the event
 *    is no longer a draft and is refused. A read-then-write would leave a window
 *    where both submissions pass the check and both write an audience. This is
 *    what makes double submission safe rather than merely unlikely.
 * 2. **The audience next.** `invitations` carries a composite foreign key to
 *    `event_audience_members`, so the audience has to exist first.
 * 3. **Invitations from the audience rows themselves**, by selecting from the
 *    table rather than from a list in memory. One invitation per audience row is
 *    then a property of the statement instead of a loop that could drift, which
 *    is what keeps `uninvited_audience_members` empty by construction.
 * 4. **Jobs from the invitations**, for the same reason.
 * 5. **Audit last**, once the facts it describes are true.
 *
 * ## What this module does not do
 *
 * It delivers nothing. Jobs are created `pending` on a provider-neutral channel
 * and left there; LAN-78 dispatches them through whatever LAN-92 selects. There
 * is no manual-send path here, and `manual` is deliberately not the channel — a
 * job this transaction creates is automated work waiting for its dispatcher.
 *
 * It also provides no way back. Brian's clarification freezes the audience at
 * approval: no late additions, no removals, no re-resolution, no resend. That is
 * a decision to build later and separately, not a seam to leave half-open here.
 */

/** Everything UX-41 needs to show before anything is written. */
export interface ApprovalPreview {
  event: EventDetail;
  catalogue: AudienceCatalogue;
  /**
   * Where the deadline would land if the event were approved now. `null` for an
   * event that solicits no response — invariant E6.
   */
  deadline: ResolvedResponseDeadline | null;
}

/** The result of a successful approval — UX-43's facts, as observed. */
export interface ApprovalOutcome {
  event: EventDetail;
  members: ResolvedAudienceMember[];
  invitationCount: number;
  notificationJobCount: number;
  deadline: ResolvedResponseDeadline | null;
}

export const APPROVAL_REQUIRES_DRAFT_MESSAGE = "Only a draft can be approved.";
export const APPROVAL_REQUIRES_DRAFT_RULE = "event_approval_requires_draft";

/**
 * The audience, the deadline and the event, for the screen that asks an approver
 * to commit.
 *
 * Reads the deadline through the same function the write path uses, so the
 * sentence on the confirmation screen and the value stored a moment later come
 * from one rule rather than from two that can disagree.
 */
export async function readApprovalPreview(eventId: string): Promise<ApprovalPreview> {
  return withTransaction(async (tx) => {
    const event = await readEventIn(tx, eventId);
    const catalogue = await listAudienceCatalogueIn(tx, event.seasonId, event.scheduledOn);
    const deadline =
      event.solicitsResponse && event.scheduledOn !== null
        ? await resolveResponseDeadlineIn(tx, event)
        : null;

    return { event, catalogue, deadline };
  });
}

/**
 * Approves a draft event and releases its invitations, atomically.
 *
 * `keys` are the selection tokens from `event-audience.ts`, and are resolved
 * against a catalogue read **inside this transaction** — so an audience built
 * ten minutes ago against a membership that has since gone inactive is refused
 * rather than snapshotted from a stale screen.
 */
export async function approveEvent(
  actorPersonId: string,
  eventId: string,
  keys: readonly string[],
): Promise<ApprovalOutcome> {
  if (actorPersonId.trim() === "") {
    throw new ConstraintViolated("An approval has to name the operator who made it.", {
      rule: "audit_events_has_an_actor",
    });
  }

  return withTransaction(async (tx) => {
    const before = await readEventIn(tx, eventId);

    // Resolved before anything is written, so the two refusals an approver is
    // most likely to hit — an empty audience and a stale selection — cost
    // nothing and leave nothing behind.
    const catalogue = await listAudienceCatalogueIn(tx, before.seasonId, before.scheduledOn);
    const members = requireSelection(catalogue, keys);

    const moment = await tx.query<{ at: Date }>("select now() as at");
    const approvedAt = moment.rows[0].at;

    // Invariant E6: a non-soliciting event carries no deadline at all, which is
    // also what stops its invitations ever reaching `expired`.
    const deadline = before.solicitsResponse
      ? await resolveResponseDeadlineIn(tx, before, approvedAt)
      : null;

    const updated = await tx.query<{ id: string }>(
      `update public.events
          set status = 'approved',
              approved_at = $2,
              approved_by_person_id = $3,
              audience_confirmed_at = $2,
              audience_confirmed_by_person_id = $3,
              response_deadline_at = $4::timestamptz,
              updated_at = now()
        where id = $1 and status = 'draft'
       returning id`,
      [eventId, approvedAt, actorPersonId, deadline?.at ?? null],
    );

    if (updated.rowCount === 0) {
      // The double-submission path. The second press finds the event already
      // approved and is told so; nothing it would have written was written,
      // because this is the first statement that writes anything.
      throw new InvalidTransition(
        `${APPROVAL_REQUIRES_DRAFT_MESSAGE} This event is ${describeStatus(before.status)}.`,
        { rule: APPROVAL_REQUIRES_DRAFT_RULE },
      );
    }

    await tx.query(
      `insert into public.event_audience_members
         (event_id, season_id, capacity, season_membership_id, person_id,
          added_at, added_by_person_id)
       select $1, $2, member.capacity::public.invitation_capacity,
              case when member.capacity = 'player' then member.anchor_id::uuid end,
              case when member.capacity <> 'player' then member.anchor_id::uuid end,
              $5, $6
         from unnest($3::text[], $4::text[]) as member(capacity, anchor_id)`,
      [
        eventId,
        before.seasonId,
        members.map((member) => member.capacity),
        members.map((member) => member.anchorId),
        approvedAt,
        actorPersonId,
      ],
    );

    // Selected from the audience rather than from `members`, so "one invitation
    // per audience member" is a property of the statement. Invariant P7's
    // `never_invited` state cannot arise from an approval that ran this code.
    const invitations = await tx.query<{ id: string }>(
      `insert into public.invitations
         (event_id, event_status, solicits_response, season_id, capacity,
          season_membership_id, person_id, status, expires_at, audience_member_id)
       select a.event_id, 'approved'::public.event_status, $2, a.season_id, a.capacity,
              a.season_membership_id, a.person_id, 'pending', $3::timestamptz, a.id
         from public.event_audience_members a
        where a.event_id = $1
       returning id`,
      [eventId, before.solicitsResponse, deadline?.at ?? null],
    );

    // Invariant M1: the key is derived from facts that do not change — the
    // event, the capacity and the participant — so a retry of this whole
    // transaction cannot produce a second job for one invitee. The unique index
    // on `idempotency_key` is what turns that intent into a guarantee.
    const jobs = await tx.query<{ id: string }>(
      `insert into public.notification_jobs
         (idempotency_key, job_type, status, invitation_id, event_id, person_id,
          channel, template_variables)
       select 'event:' || i.event_id::text || ':invitation:' || i.capacity::text
                || ':' || i.participant_id::text,
              'invitation', 'pending', i.id, i.event_id,
              coalesce(i.person_id, m.person_id),
              'whatsapp', '{}'::jsonb
         from public.invitations i
         left join public.season_memberships m on m.id = i.season_membership_id
        where i.event_id = $1
       returning id`,
      [eventId],
    );

    const byCapacity = {
      player: members.filter((member) => member.capacity === "player").length,
      coach: members.filter((member) => member.capacity === "coach").length,
      committee: members.filter((member) => member.capacity === "committee").length,
    };

    // Two rows, not one per invitee. Where a transition has a typed first-class
    // home the model says that table *is* the record, and an invitation is its
    // own record — 42 audit rows restating 42 invitations is the reconciliation
    // problem register D9 refuses.
    await recordAudit(tx, {
      actorPersonId,
      action: "event.audience_confirmed",
      entityTable: "events",
      entityId: eventId,
      context: { audienceSize: members.length, byCapacity },
    });

    await recordAudit(tx, {
      actorPersonId,
      action: "event.approved",
      entityTable: "events",
      entityId: eventId,
      fromState: "draft",
      toState: "approved",
      context: {
        audienceSize: members.length,
        byCapacity,
        invitationsCreated: invitations.rowCount,
        notificationJobsCreated: jobs.rowCount,
        solicitsResponse: before.solicitsResponse,
        responseDeadlineAt: deadline?.at.toISOString() ?? null,
        responseDeadlineClamped: deadline?.clamped ?? false,
      },
    });

    return {
      event: await readEventIn(tx, eventId),
      members,
      invitationCount: invitations.rowCount ?? 0,
      notificationJobCount: jobs.rowCount ?? 0,
      deadline,
    };
  });
}

const STATUS_DESCRIPTIONS: Readonly<Record<string, string>> = Object.freeze({
  draft: "a draft",
  pending_approval: "awaiting approval",
  approved: "already approved",
  occurred: "recorded as having happened",
  not_held: "recorded as not held",
  cancelled: "cancelled",
  rejected: "rejected",
  withdrawn: "withdrawn",
});

function describeStatus(status: string): string {
  return STATUS_DESCRIPTIONS[status] ?? status;
}
