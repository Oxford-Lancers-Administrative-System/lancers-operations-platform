import "server-only";

import { ConstraintViolated, InvalidTransition, withTransaction } from "@/lib/db";
import { recordAudit } from "./audit";
import { listAudienceCatalogueIn, resolveSelection } from "./event-audience";
import { joinApprovedEventIn } from "./event-audience-rule";
import { assertNotTerminal } from "./event-amendment/shared";
import { lockEventIn, readEventIn } from "./events";
import { readCurrentSeasonIn } from "./seasons";

/**
 * Adding a named person to an approved event's audience — LAN-393.
 *
 * ## Why this is its own service and not the amendment path
 *
 * The issue says "through the existing amend path", and the existing amend path
 * refuses it twice over:
 *
 *   * `saveEventAudience` guards on `status = 'draft'`
 *     (`event_audience_requires_draft`) and is a wholesale delete-and-reinsert.
 *     Reusing it would mean turning it into a diff, which would silently make
 *     *removal* possible — which this issue puts out of scope.
 *   * `amendApprovedEvent` diffs only the event's own fields and throws
 *     `NOTHING_CHANGED_RULE` when that diff is empty, so an audience-only
 *     amendment is refused outright. It also holds and resumes every unsent job
 *     on the event and, where the event has no plan, re-freezes the whole
 *     schedule — three side effects that adding one person must not cause.
 *
 * So this shares the audience *resolution* and the picker component with the
 * draft path, and the four writes with LAN-392's group rule
 * ({@link joinApprovedEventIn}), and shares the amendment diff with nothing.
 *
 * ## What the person gets
 *
 * The same thing a LAN-392 late joiner gets — the invitation, then the event's
 * existing ladder for every rung still ahead — with one difference Brian
 * settled: no grace delay. The ten minutes exist so a status flip can be put
 * back before anything is sent; an operator who has just pressed **Add** has
 * already decided.
 */

export const ADD_AUDIENCE_REQUIRES_APPROVED_RULE = "event_audience_add_requires_approved";
const ADD_AUDIENCE_REQUIRES_APPROVED_MESSAGE = "Only an approved event's audience can be added to.";

export const ADD_AUDIENCE_REQUIRES_FUTURE_RULE = "event_audience_add_requires_future_event";
const ADD_AUDIENCE_REQUIRES_FUTURE_MESSAGE =
  "This event has already started, so nobody else can be invited to it.";

const ADD_AUDIENCE_NEEDS_SOMEBODY_RULE = "event_audience_add_needs_somebody";
const ADD_AUDIENCE_NEEDS_SOMEBODY_MESSAGE =
  "Choose at least one person who is not already in this event's audience.";

interface AddedAudienceMember {
  readonly personId: string;
  readonly displayName: string;
  readonly capacity: string;
  readonly messageDeclared: boolean;
}

export interface AddEventAudienceResult {
  readonly added: readonly AddedAudienceMember[];
  readonly alreadyPresent: number;
  readonly exclusionsCleared: number;
}

export async function addEventAudienceMembers(
  actorPersonId: string,
  eventId: string,
  keys: readonly string[],
): Promise<AddEventAudienceResult> {
  if (actorPersonId.trim() === "") {
    throw new ConstraintViolated("An audience change has to name the operator who made it.", {
      rule: "event_audience_add_requires_an_actor",
    });
  }

  return withTransaction(async (tx) => {
    const event = await lockEventIn(tx, eventId);
    // The amend screen's own refusal, in its own words, rather than a second
    // sentence saying the same thing differently.
    assertNotTerminal(event);
    if (event.status !== "approved") {
      throw new InvalidTransition(ADD_AUDIENCE_REQUIRES_APPROVED_MESSAGE, {
        rule: ADD_AUDIENCE_REQUIRES_APPROVED_RULE,
      });
    }

    const season = await readCurrentSeasonIn(tx);
    const startsAt = await readEventStartIn(tx, eventId);
    const now = await nowIn(tx);
    if (startsAt === null || startsAt.getTime() <= now.getTime()) {
      throw new InvalidTransition(ADD_AUDIENCE_REQUIRES_FUTURE_MESSAGE, {
        rule: ADD_AUDIENCE_REQUIRES_FUTURE_RULE,
      });
    }

    const catalogue = await listAudienceCatalogueIn(
      tx,
      event.seasonId,
      event.scheduledOn,
      event.eventType,
    );
    const resolution = resolveSelection(catalogue.candidates, keys);
    if (!resolution.ok) {
      throw new ConstraintViolated(
        resolution.failure === "empty" ? ADD_AUDIENCE_NEEDS_SOMEBODY_MESSAGE : resolution.message,
        {
          rule: resolution.failure === "empty" ? ADD_AUDIENCE_NEEDS_SOMEBODY_RULE : resolution.rule,
        },
      );
    }

    const added: AddedAudienceMember[] = [];
    let alreadyPresent = 0;
    let exclusionsCleared = 0;

    for (const member of resolution.members) {
      const joined = await joinApprovedEventIn(tx, {
        eventId,
        seasonId: event.seasonId,
        capacity: member.capacity,
        anchorId: member.anchorId,
        personId: member.personId,
        group: null, // an operator put them here, not a rule
        addedByPersonId: actorPersonId,
        sendAt: now, // Brian: no grace delay on a hand-add
        eventStartsAt: startsAt,
      });

      if (joined.audienceMemberId === null) {
        // Already on the event under some capacity. The picker does not offer
        // them, so this is the race and the belt-and-braces conflict rule
        // rather than the ordinary path — a no-op, not a refusal.
        alreadyPresent += 1;
        continue;
      }

      // Brian's decision 5: the hand-add is the one door that clears a
      // deselection. An operator naming somebody specifically outranks the
      // earlier decision to leave them out of a group.
      const cleared = await tx.query(
        `delete from public.event_audience_exclusions
          where event_id = $1::uuid and person_id = $2::uuid`,
        [eventId, member.personId],
      );
      exclusionsCleared += cleared.rowCount ?? 0;

      added.push({
        personId: member.personId,
        displayName: member.displayName,
        capacity: member.capacity,
        messageDeclared: joined.declared,
      });
    }

    if (added.length === 0 && alreadyPresent === 0) {
      throw new ConstraintViolated(ADD_AUDIENCE_NEEDS_SOMEBODY_MESSAGE, {
        rule: ADD_AUDIENCE_NEEDS_SOMEBODY_RULE,
      });
    }

    await recordAudit(tx, {
      actorPersonId,
      action: "event.audience_added_by_operator",
      entityTable: "events",
      entityId: eventId,
      context: {
        // Ids and counts. No names, no numbers: who was added is answerable
        // from the ids, and nothing here needs their contact details.
        personIds: added.map((member) => member.personId),
        byCapacity: added.map((member) => member.capacity),
        messagesDeclared: added.filter((member) => member.messageDeclared).length,
        alreadyPresent,
        exclusionsCleared,
        seasonId: season.id,
      },
    });

    return { added, alreadyPresent, exclusionsCleared };
  });
}

async function readEventStartIn(
  tx: Parameters<typeof listAudienceCatalogueIn>[0],
  eventId: string,
): Promise<Date | null> {
  const result = await tx.query<{ starts_at_utc: Date | null }>(
    `select (scheduled_on + coalesce(starts_at, '00:00'::time))
              at time zone 'Europe/London' as starts_at_utc
       from public.events
      where id = $1::uuid`,
    [eventId],
  );
  return result.rows[0]?.starts_at_utc ?? null;
}

async function nowIn(tx: Parameters<typeof listAudienceCatalogueIn>[0]): Promise<Date> {
  const result = await tx.query<{ at: Date }>("select now() as at");
  return result.rows[0].at;
}

/**
 * The people this event's audience can still be added to — the picker's
 * candidates, minus everybody already on it.
 *
 * Filtered by **human**, not by selection key: a person already on the event as
 * a committee member must not be offered again as a player, because invariant
 * P9 is one row per human per event and the add would be a no-op the operator
 * had no way of predicting.
 */
export async function readAddableAudience(eventId: string): Promise<{
  readonly candidates: Awaited<ReturnType<typeof listAudienceCatalogueIn>>["candidates"];
  readonly counts: Awaited<ReturnType<typeof listAudienceCatalogueIn>>["counts"];
  readonly alreadyOnEvent: number;
}> {
  return withTransaction(async (tx) => {
    // A plain read, not `lockEventIn`: this runs while a page is being
    // rendered, and a `for update` on every amend-screen load would be a lock
    // taken for nothing.
    const event = await readEventIn(tx, eventId);
    const catalogue = await listAudienceCatalogueIn(
      tx,
      event.seasonId,
      event.scheduledOn,
      event.eventType,
    );
    const held = await tx.query<{ invitee_person_id: string }>(
      `select invitee_person_id from public.event_audience_members where event_id = $1::uuid`,
      [eventId],
    );
    const on = new Set(held.rows.map((row) => row.invitee_person_id));
    const candidates = catalogue.candidates.filter((candidate) => !on.has(candidate.personId));
    return {
      candidates,
      counts: {
        player: candidates.filter((candidate) => candidate.capacity === "player").length,
        coach: candidates.filter((candidate) => candidate.capacity === "coach").length,
        committee: candidates.filter((candidate) => candidate.capacity === "committee").length,
        recruit: candidates.filter((candidate) => candidate.capacity === "recruit").length,
      },
      alreadyOnEvent: on.size,
    };
  });
}
