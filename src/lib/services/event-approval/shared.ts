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

export interface AudienceMember {
  id: string;
  capacity: AudienceCapacity;
  anchorId: string; // season_memberships.id for a player, people.id otherwise — invariant P8
  personId: string;
  displayName: string;
  standing: string; // the membership status or seats held, as at the time of reading
  stillSelectable: boolean; // false once they go inactive
}

// W1's panel (D8) — "every user is expected to have WhatsApp" (Brian); an error, never a workaround.
export interface UnreachableAudienceMember {
  readonly member: AudienceMember;
  readonly reason: string; // the club's own sentence — same one W6 reports after a failed send
}

export interface ApprovalPreview {
  event: EventDetail;
  catalogue: AudienceCatalogue;
  audience: AudienceMember[]; // already saved on this event; empty until one is proposed
  deadline: ResolvedResponseDeadline | null; // where it would land if approved now; null only while dateless (E1a)
  plan: MessagingPlan | null; // LAN-171: the whole plan a live approval would commit, read live — see relocations.md
  unreachable: readonly UnreachableAudienceMember[]; // W1's exception table; W6 owns correction and recovery
  questions: EventQuestion[]; // amendment W4-A1: approving the event means approving what these people are asked
  groupSummary: AudienceGroupSummary; // named by groups before people, so the approver checks a shape
  missing: string[]; // the fields D16 requires and this event has not got; empty when ready
}

export interface ApprovalOutcome {
  event: EventDetail;
  members: AudienceMember[];
  invitationCount: number;
  notificationJobCount: number;
  deadline: ResolvedResponseDeadline | null;
  plan?: MessagingPlan | null; // LAN-169: what this approval committed; null on the preview path
}

export const APPROVAL_INCOMPLETE_RULE = "event_approval_requires_complete_event";

// D16's completeness gate: date and start time are the only things that can be missing (D15, F-C1, Q-31).
export function missingForApproval(event: EventDetail): string[] {
  const missing: string[] = [];
  if (event.scheduledOn === null) missing.push("date");
  if (event.startsAt === null) missing.push("start time");
  if (event.name.trim() === "") missing.push("name");
  return missing;
}

export function describeMissingForApproval(missing: readonly string[]): string {
  const list = joinWithAnd(missing);
  return missing.length === 1
    ? `This event has no ${list} yet. Add it and approve when you are ready.`
    : `This event has no ${list} yet. Add them and approve when you are ready.`;
}

// stillSelectable is computed, not stored — approval does not act on it, but the approver sees it.
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

export function deadlineFromPlan(plan: MessagingPlan): ResolvedResponseDeadline {
  return {
    at: plan.responseDeadlineAt,
    configuredAt: plan.configuredDeadlineAt,
    clamped: plan.deadlineClamped,
    rule: { daysBefore: plan.schedule.rsvpByDays },
  };
}
