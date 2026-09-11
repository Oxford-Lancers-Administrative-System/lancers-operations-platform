import type { Tx } from "@/lib/db";
import type { AudienceCapacity, AudienceCatalogue } from "../event-audience";
import type { EventDetail } from "../events";
import type { MessagingPlan } from "../messaging-schedule";
import type { ResolvedResponseDeadline } from "../response-deadline";
import { personDisplayAliasSql } from "../sql-text";
import { joinWithAnd } from "../event-vocabulary";
import type { EventQuestion } from "../event-questions";
import type { AudienceGroupSummary } from "../event-audience";

/**
 * Types and reads both the preview and the approval share — LAN-77, D16.
 * Decision history: docs/adr/0022-audience-proposed-then-frozen.md · docs/ux/tickets/LAN-77-event-approval.md.
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

/**
 * One audience member W1's panel names before approval — D8, LAN-171.
 *
 * "Every user is expected to have WhatsApp" (Brian, 2026-08-24), so a missing
 * or unconvertible number is an error the approver reads by name, not a
 * configuration choice and not something this screen offers to work around.
 */
export interface UnreachableAudienceMember {
  readonly member: AudienceMember;
  /** The club's own sentence — the same one W6 reports after a failed send. */
  readonly reason: string;
}

/** Everything the builder and UX-41 need before anything is approved. */
export interface ApprovalPreview {
  event: EventDetail;
  catalogue: AudienceCatalogue;
  /** The audience already saved on this event. Empty until one is proposed. */
  audience: AudienceMember[];
  /**
   * Where the deadline would land if the event were approved now. `null` only
   * while the event has no date — approval is refused without one (E1a).
   */
  deadline: ResolvedResponseDeadline | null;
  /**
   * LAN-171. The whole plan a live approval would commit — the dispatch
   * anchor, the ladder and the escalation threshold — read through the same
   * arithmetic `approveEvent` uses, at the moment this preview is read rather
   * than at some earlier snapshot. `null` exactly where `deadline` is: an
   * event with no date yet has no plan to project.
   */
  plan: MessagingPlan | null;
  /**
   * Audience members with no usable WhatsApp route right now. W1's exception
   * table: the panel treats this as an error and names the person, and offers
   * no manual-send workaround — W6 owns correction and recovery.
   */
  unreachable: readonly UnreachableAudienceMember[];
  /**
   * The questions this event asks, in the order a player will meet them —
   * amendment W4-A1. "Approve this event" means approving what these people are
   * about to be asked, and a question is not a detail to discover afterwards.
   */
  questions: EventQuestion[];
  /**
   * The audience named by its groups before its people, so the approver checks a
   * shape rather than reading thirty-five names to work one out.
   */
  groupSummary: AudienceGroupSummary;
  /** The fields D16 requires and this event has not got. Empty when it is ready. */
  missing: string[];
}

/** The result of a successful approval — UX-43's facts, as observed. */
export interface ApprovalOutcome {
  event: EventDetail;
  members: AudienceMember[];
  invitationCount: number;
  notificationJobCount: number;
  deadline: ResolvedResponseDeadline | null;
  /**
   * LAN-169. The whole plan this approval committed — the dispatch anchor, the
   * ladder and the escalation threshold — so the confirmation can restate what
   * was actually set in motion rather than only when an answer is due.
   *
   * Null on the preview path, which has no approval to describe.
   */
  plan?: MessagingPlan | null;
}

export const APPROVAL_INCOMPLETE_RULE = "event_approval_requires_complete_event";

/**
 * The fields an event must have before it can be approved — D16, the
 * completeness gate.
 *
 * The date and the start time, and that is all that can be missing. `name`
 * and `event_type` are `not null` and are the minimum to save a draft at all
 * (D15). Start time is the one exception to "TBD stays legitimate" — F-C1,
 * owner decision Q-31 (Brian, 2026-08-27). Decision history: docs/adr/0022-audience-proposed-then-frozen.md · docs/ux/tickets/LAN-77-event-approval.md.
 *
 * The list is a function rather than a constant so the refusal can name which
 * fields are missing rather than which fields exist (`docs/ux/standards.md`
 * rule 5). Enforced here, above the database, so it holds when the screen is
 * bypassed and `approveEvent` is called directly.
 */
export function missingForApproval(event: EventDetail): string[] {
  const missing: string[] = [];
  if (event.scheduledOn === null) missing.push("date");
  if (event.startsAt === null) missing.push("start time");
  if (event.name.trim() === "") missing.push("name");
  return missing;
}

/** "This event cannot be approved without its date." — the refusal, named. */
export function describeMissingForApproval(missing: readonly string[]): string {
  const list = joinWithAnd(missing);
  return missing.length === 1
    ? `This event has no ${list} yet. Add it and approve when you are ready.`
    : `This event has no ${list} yet. Add them and approve when you are ready.`;
}

/**
 * The audience stored against an event, with the names a screen has to show.
 *
 * `stillSelectable` is computed rather than stored: it compares each member
 * against the catalogue the builder would offer today. Approval does not act on
 * it — the confirmed list is honoured as-is — but the approver is entitled to
 * see that somebody has gone inactive since they were picked.
 */
export async function readAudienceIn(
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
    display_alias: string | null;
    standing: string | null;
  }>(
    `select a.id,
            a.capacity::text as capacity,
            a.participant_id as anchor_id,
            coalesce(a.person_id, m.person_id) as person_id,
            p.given_name, p.family_name,
              ${personDisplayAliasSql("p")} as display_alias,
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
      const known = row.display_alias?.trim();
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

/** The deadline, as its own small shape, read from the one arithmetic that decides it. */
export function deadlineFromPlan(plan: MessagingPlan): ResolvedResponseDeadline {
  return {
    at: plan.responseDeadlineAt,
    configuredAt: plan.configuredDeadlineAt,
    clamped: plan.deadlineClamped,
    rule: { daysBefore: plan.schedule.rsvpByDays },
  };
}
