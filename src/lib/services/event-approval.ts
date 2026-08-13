import "server-only";

import { ConstraintViolated, InvalidTransition, withTransaction, type Tx } from "@/lib/db";
import { recordAudit } from "./audit";
import {
  EMPTY_AUDIENCE_MESSAGE,
  EMPTY_AUDIENCE_RULE,
  listAudienceCatalogueIn,
  resolveSelection,
  type AudienceCapacity,
  type AudienceCatalogue,
} from "./event-audience";
import { readEventIn, type EventDetail } from "./events";
import { resolveResponseDeadlineIn, type ResolvedResponseDeadline } from "./response-deadline";

/**
 * Proposing an audience, and approving the event. LAN-77.
 *
 * ## Two steps, and why they are two
 *
 * The first implementation resolved the audience inside the approval
 * transaction, from a list the browser posted. Brian rejected that on the real
 * screen for a concrete reason: going to **Edit draft** and back threw the
 * audience away, and an audience of forty people is not something to rebuild
 * because you noticed a typo in the venue.
 *
 * So the audience is now **saved onto the draft** as its own step, which is what
 * `20260810121300_domain_event_audience.sql` says the table is for: "The
 * audience is populated BEFORE approval, because it is the thing the approver is
 * confirming. There is therefore no event-status constraint here: a draft may
 * carry a proposed audience." The schema was built for this; only the earlier
 * implementation was not.
 *
 * `saveEventAudience` writes the proposal. `approveEvent` confirms what is
 * already stored and releases it. That split is his decision of 13 August 2026
 * and is a deliberate widening of LAN-77 as written.
 *
 * ## Approval honours the confirmed list exactly
 *
 * Also his decision, and it is the reason approval does **not** re-resolve the
 * audience against the live roster. If somebody goes inactive between the
 * proposal and the approval they are still invited: a human chose them, the
 * screen showed their name, and the roster and the invitation disagreeing is a
 * fact the club can see rather than a silent edit. The alternative — dropping
 * them — would mean approving a different list from the one on screen.
 *
 * The practical consequence is that `approveEvent` reads rows rather than
 * resolving keys, and its refusals shrink to two: the audience is empty, or the
 * event is not a draft.
 *
 * ## What "one transaction" still has to mean
 *
 * Approval is four writes that are only ever correct together: the event's
 * status and approval columns, one invitation per audience member, one
 * notification job per invitation, and the audit rows. Every partial state is a
 * specific operational failure — approval without invitations is exactly the
 * defect `uninvited_audience_members` exists to report, and jobs without
 * invitations is undeliverable work in the queue forever. `withTransaction`
 * offers no savepoint, so there is no way to half-recover.
 *
 * ## Order, and why it is this order
 *
 * 1. **The guarded status update first.** `where id = $1 and status = 'draft'`
 *    is the concurrency control, not a preceding read: it takes the row lock, so
 *    a second approval arriving at the same instant blocks, then finds the event
 *    is no longer a draft and is refused.
 * 2. **Invitations from the audience rows themselves**, by selecting from the
 *    table. One invitation per audience row is then a property of the statement
 *    instead of a loop that could drift.
 * 3. **Jobs from the invitations**, for the same reason.
 * 4. **Audit last**, once the facts it describes are true.
 *
 * ## What this module does not do
 *
 * It delivers nothing. Jobs are created `pending` on a provider-neutral channel
 * and left there; LAN-78 dispatches them through whatever LAN-92 selects.
 *
 * It also provides no way back. The audience is editable while the event is a
 * draft and frozen the moment it is approved — no late additions, no removals,
 * no resend. Both write paths guard on `status = 'draft'`, so the freeze is
 * structural rather than a control that happens not to be rendered.
 */

/** One member of an event's audience, as stored. */
export interface AudienceMember {
  id: string;
  capacity: AudienceCapacity;
  /** `season_memberships.id` for a player, `people.id` otherwise. Invariant P8. */
  anchorId: string;
  personId: string;
  displayName: string;
  /** The membership status or the seats held, as at the time of reading. */
  standing: string;
  /** Whether this member is still selectable — false once they go inactive. */
  stillSelectable: boolean;
}

/** Everything the builder and UX-41 need before anything is approved. */
export interface ApprovalPreview {
  event: EventDetail;
  catalogue: AudienceCatalogue;
  /** The audience already saved on this event. Empty until one is proposed. */
  audience: AudienceMember[];
  /**
   * Where the deadline would land if the event were approved now. `null` for an
   * event that solicits no response — invariant E6.
   */
  deadline: ResolvedResponseDeadline | null;
}

/** The result of a successful approval — UX-43's facts, as observed. */
export interface ApprovalOutcome {
  event: EventDetail;
  members: AudienceMember[];
  invitationCount: number;
  notificationJobCount: number;
  deadline: ResolvedResponseDeadline | null;
}

export const APPROVAL_REQUIRES_DRAFT_MESSAGE = "Only a draft can be approved.";
export const APPROVAL_REQUIRES_DRAFT_RULE = "event_approval_requires_draft";
export const AUDIENCE_EDIT_REQUIRES_DRAFT_MESSAGE =
  "Only a draft's audience can be changed. Once an event is approved its audience is fixed.";
export const AUDIENCE_EDIT_REQUIRES_DRAFT_RULE = "event_audience_requires_draft";

/**
 * The audience stored against an event, with the names a screen has to show.
 *
 * `stillSelectable` is computed rather than stored: it compares each member
 * against the catalogue the builder would offer today. Approval does not act on
 * it — the confirmed list is honoured as-is — but the approver is entitled to
 * see that somebody has gone inactive since they were picked.
 */
async function readAudienceIn(
  tx: Tx,
  eventId: string,
  catalogue: AudienceCatalogue,
): Promise<AudienceMember[]> {
  const result = await tx.query<{
    id: string;
    capacity: AudienceCapacity;
    anchor_id: string;
    person_id: string;
    given_name: string;
    family_name: string | null;
    known_as: string | null;
    standing: string | null;
  }>(
    `select a.id,
            a.capacity::text as capacity,
            a.participant_id as anchor_id,
            coalesce(a.person_id, m.person_id) as person_id,
            p.given_name, p.family_name, p.known_as,
            case when a.capacity = 'player' then initcap(m.status::text) end as standing
       from public.event_audience_members a
       left join public.season_memberships m on m.id = a.season_membership_id
       join public.people p on p.id = coalesce(a.person_id, m.person_id)
      where a.event_id = $1`,
    [eventId],
  );

  const selectable = new Map(
    catalogue.candidates.map((candidate) => [candidate.key, candidate] as const),
  );

  return result.rows
    .map((row) => {
      const known = row.known_as?.trim();
      const first = known && known !== "" ? known : row.given_name;
      const candidate = selectable.get(`${row.capacity}:${row.anchor_id}`);
      return {
        id: row.id,
        capacity: row.capacity,
        anchorId: row.anchor_id,
        personId: row.person_id,
        displayName: row.family_name ? `${first} ${row.family_name}` : first,
        standing: row.standing ?? candidate?.standing ?? "No longer listed",
        stillSelectable: candidate !== undefined,
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/**
 * The event, the people who can be chosen, the audience already chosen, and the
 * deadline approval would apply.
 *
 * Reads the deadline through the same function the write path uses, so the
 * sentence on the confirmation screen and the value stored a moment later come
 * from one rule rather than from two that can disagree.
 */
export async function readApprovalPreview(eventId: string): Promise<ApprovalPreview> {
  return withTransaction(async (tx) => {
    const event = await readEventIn(tx, eventId);
    const catalogue = await listAudienceCatalogueIn(tx, event.seasonId, event.scheduledOn);
    const audience = await readAudienceIn(tx, eventId, catalogue);
    const deadline =
      event.solicitsResponse && event.scheduledOn !== null
        ? await resolveResponseDeadlineIn(tx, event)
        : null;

    return { event, catalogue, audience, deadline };
  });
}

/** The audience saved against an event, for a screen that only wants to show it. */
export async function readEventAudience(eventId: string): Promise<AudienceMember[]> {
  return withTransaction(async (tx) => {
    const event = await readEventIn(tx, eventId);
    const catalogue = await listAudienceCatalogueIn(tx, event.seasonId, event.scheduledOn);
    return readAudienceIn(tx, eventId, catalogue);
  });
}

/**
 * Replaces the audience proposed against a draft.
 *
 * Wholesale replacement rather than a diff, because the operator's screen holds
 * a complete list and sending a complete list is the only way for "I unticked
 * somebody" to arrive at all. Deleting first is safe precisely while the event
 * is a draft: invariant P1 means no invitation can reference these rows yet, so
 * nothing depends on them.
 *
 * An **empty** audience is accepted here and refused at approval. That is not an
 * inconsistency: a draft is allowed to be unfinished, and an operator has to be
 * able to clear a selection they no longer want. Invariant E1b is about
 * approving, and `approveEvent` is where it bites.
 */
export async function saveEventAudience(
  actorPersonId: string,
  eventId: string,
  keys: readonly string[],
): Promise<AudienceMember[]> {
  requireActor(actorPersonId);

  return withTransaction(async (tx) => {
    const event = await readEventIn(tx, eventId);
    if (event.status !== "draft") {
      throw new InvalidTransition(
        `${AUDIENCE_EDIT_REQUIRES_DRAFT_MESSAGE} This event is ${describeStatus(event.status)}.`,
        { rule: AUDIENCE_EDIT_REQUIRES_DRAFT_RULE },
      );
    }

    const catalogue = await listAudienceCatalogueIn(tx, event.seasonId, event.scheduledOn);
    const resolution = resolveSelection(catalogue.candidates, keys);

    // "Empty" is a legal proposal; "unknown" never is. Refusing an unresolvable
    // key rather than skipping it keeps the stored audience equal to the list
    // the operator was looking at.
    if (!resolution.ok && resolution.failure !== "empty") {
      throw new ConstraintViolated(resolution.message, { rule: resolution.rule });
    }
    const members = resolution.ok ? resolution.members : [];

    await tx.query("delete from public.event_audience_members where event_id = $1", [eventId]);

    if (members.length > 0) {
      await tx.query(
        `insert into public.event_audience_members
           (event_id, season_id, capacity, season_membership_id, person_id,
            added_at, added_by_person_id)
         select $1, $2, member.capacity::public.invitation_capacity,
                case when member.capacity = 'player' then member.anchor_id::uuid end,
                case when member.capacity <> 'player' then member.anchor_id::uuid end,
                now(), $5
           from unnest($3::text[], $4::text[]) as member(capacity, anchor_id)`,
        [
          eventId,
          event.seasonId,
          members.map((member) => member.capacity),
          members.map((member) => member.anchorId),
          actorPersonId,
        ],
      );
    }

    await recordAudit(tx, {
      actorPersonId,
      action: "event.audience_proposed",
      entityTable: "events",
      entityId: eventId,
      context: { audienceSize: members.length, byCapacity: countByCapacity(members) },
    });

    return readAudienceIn(tx, eventId, catalogue);
  });
}

/**
 * Approves a draft event and releases its invitations, atomically.
 *
 * Takes no audience: the audience is whatever `saveEventAudience` last stored,
 * which is the list the approver was shown. Nothing is re-resolved and nobody is
 * dropped.
 */
export async function approveEvent(
  actorPersonId: string,
  eventId: string,
): Promise<ApprovalOutcome> {
  requireActor(actorPersonId);

  return withTransaction(async (tx) => {
    const before = await readEventIn(tx, eventId);
    const catalogue = await listAudienceCatalogueIn(tx, before.seasonId, before.scheduledOn);
    const members = await readAudienceIn(tx, eventId, catalogue);

    // Invariant E1b, and the reason it is service-layer work: the database
    // stores the audience and would accept an approval with none, so this
    // sentence is the only thing between an approver and a silent
    // no-recipient approval. Refused before anything is written.
    if (members.length === 0) {
      throw new ConstraintViolated(EMPTY_AUDIENCE_MESSAGE, { rule: EMPTY_AUDIENCE_RULE });
    }

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

    const byCapacity = countByCapacity(members);

    // Two rows, not one per invitee. Where a transition has a typed first-class
    // home the model says that table *is* the record, and an invitation is its
    // own record — 42 audit rows restating 42 invitations is the reconciliation
    // problem register D9 refuses.
    await recordAudit(tx, {
      actorPersonId,
      action: "event.audience_confirmed",
      entityTable: "events",
      entityId: eventId,
      context: {
        audienceSize: members.length,
        byCapacity,
        // Recorded because approval honours the confirmed list as-is: if
        // somebody had gone inactive since they were proposed, the audit says
        // the approver invited them anyway rather than leaving it inferable.
        noLongerSelectable: members.filter((member) => !member.stillSelectable).length,
      },
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

function countByCapacity(members: readonly { capacity: AudienceCapacity }[]) {
  return {
    player: members.filter((member) => member.capacity === "player").length,
    coach: members.filter((member) => member.capacity === "coach").length,
    committee: members.filter((member) => member.capacity === "committee").length,
  };
}

function requireActor(actorPersonId: string): void {
  if (actorPersonId.trim() === "") {
    throw new ConstraintViolated("An audience change has to name the operator who made it.", {
      rule: "audit_events_has_an_actor",
    });
  }
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
