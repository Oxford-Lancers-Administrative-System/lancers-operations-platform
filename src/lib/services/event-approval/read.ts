import "server-only";

import { resolveDefaultCallingCode } from "@/lib/delivery/config";
import { NO_USABLE_NUMBER_REASON, selectMobileNumber } from "@/lib/delivery/phone";
import { withTransaction, type Tx } from "@/lib/db";
import {
  listAudienceCatalogueIn,
  summariseAudienceGroups,
  type AudienceGroupSummary,
} from "../event-audience";
import { readEventQuestionsIn } from "../event-questions";
import { readEventIn } from "../events";
import { resolveMessagingPlanIn } from "../messaging-schedule";
import {
  deadlineFromPlan,
  missingForApproval,
  readAudienceIn,
  type ApprovalPreview,
  type AudienceMember,
  type UnreachableAudienceMember,
} from "./shared";

/** The preview an approver reads, and the two plainer audience reads. */

// Audience members with no usable WhatsApp route right now (W1's D8, LAN-171) — reads the same
// contact points, same order, through the same selectMobileNumber the dispatcher uses at send time,
// so this count and W6's failures can't disagree. It answers "has a usable number", nothing more.
async function resolveUnreachableIn(
  tx: Tx,
  members: readonly AudienceMember[],
): Promise<UnreachableAudienceMember[]> {
  if (members.length === 0) return [];

  const personIds = Array.from(new Set(members.map((member) => member.personId)));

  const contacts = await tx.query<{
    person_id: string;
    kind: string;
    raw_value: string;
    normalised_value: string | null;
    is_preferred: boolean;
  }>(
    // same ordering delivery.ts reads — sending to an arbitrary number is the kind of wrong that looks like working software
    `select person_id, kind::text as kind, raw_value, normalised_value, is_preferred
       from public.contact_points
      where person_id = any($1::uuid[])
        and valid_from <= current_date
        and (valid_until is null or valid_until > current_date)
      order by person_id, is_preferred desc, valid_from desc, created_at desc, id`,
    [personIds],
  );

  const byPerson = new Map<
    string,
    { kind: string; rawValue: string; normalisedValue: string | null; isPreferred: boolean }[]
  >();
  for (const row of contacts.rows) {
    const list = byPerson.get(row.person_id) ?? [];
    list.push({
      kind: row.kind,
      rawValue: row.raw_value,
      normalisedValue: row.normalised_value,
      isPreferred: row.is_preferred,
    });
    byPerson.set(row.person_id, list);
  }

  const callingCode = resolveDefaultCallingCode();

  const unreachable: UnreachableAudienceMember[] = [];
  for (const member of members) {
    const usable = selectMobileNumber(byPerson.get(member.personId) ?? [], callingCode);
    if (!usable) unreachable.push({ member, reason: NO_USABLE_NUMBER_REASON });
  }
  return unreachable;
}

// Reads the plan through the same function the write path uses (resolveMessagingPlanIn), so the
// confirmation screen and what's stored a moment later come from one rule, not two that can disagree.
export async function readApprovalPreview(eventId: string): Promise<ApprovalPreview> {
  return withTransaction(async (tx) => {
    const event = await readEventIn(tx, eventId);
    const catalogue = await listAudienceCatalogueIn(
      tx,
      event.seasonId,
      event.scheduledOn,
      event.eventType,
    );
    const audience = await readAudienceIn(tx, eventId, catalogue);
    const plan = event.scheduledOn !== null ? await resolveMessagingPlanIn(tx, event) : null; // D23: a plan needs only a date; response is never required

    return {
      event,
      catalogue,
      audience,
      deadline: plan ? deadlineFromPlan(plan) : null,
      plan,
      unreachable: await resolveUnreachableIn(tx, audience),
      questions: await readEventQuestionsIn(tx, eventId),
      groupSummary: summariseAudienceGroups(
        catalogue.candidates,
        audience.map((member) => `${member.capacity}:${member.anchorId}`),
        event.eventType,
      ),
      missing: missingForApproval(event),
    };
  });
}

/** The audience saved against an event, for a screen that only wants to show it. */
export async function readEventAudience(eventId: string): Promise<AudienceMember[]> {
  return withTransaction(async (tx) => {
    const event = await readEventIn(tx, eventId);
    const catalogue = await listAudienceCatalogueIn(
      tx,
      event.seasonId,
      event.scheduledOn,
      event.eventType,
    );
    return readAudienceIn(tx, eventId, catalogue);
  });
}

// Just the shape ("All active players — 32 people") without the full candidate catalogue
// readApprovalPreview returns — D3 round 2 (see relocations.md).
export async function readEventAudienceGroupSummary(
  eventId: string,
): Promise<AudienceGroupSummary> {
  return withTransaction(async (tx) => {
    const event = await readEventIn(tx, eventId);
    const catalogue = await listAudienceCatalogueIn(
      tx,
      event.seasonId,
      event.scheduledOn,
      event.eventType,
    );
    const audience = await readAudienceIn(tx, eventId, catalogue);
    return summariseAudienceGroups(
      catalogue.candidates,
      audience.map((member) => `${member.capacity}:${member.anchorId}`),
      event.eventType,
    );
  });
}
