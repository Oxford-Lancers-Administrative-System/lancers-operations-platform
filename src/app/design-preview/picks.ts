import "server-only";

import { listEventsForOperator, type EventListEntry } from "@/lib/services/events";
import { listRosterBoard } from "@/lib/services/roster-board";
import { readOperatorParticipation } from "@/lib/services/participation";
import {
  readOperatorDirectory,
  type DirectoryOperator,
} from "@/lib/services/administration-directory";
import type { ResolvedOperator } from "@/lib/auth/operator";
import { todayInClubZone } from "@/lib/club-time";

/**
 * Which seeded record each preview screen shows — LAN-225.
 *
 * The preview routes carry no ids in their URLs so that `visual:preflight` can
 * be pointed at fixed paths on any reseed. Each pick is deterministic over the
 * seed (`db:seed` is deterministic) and reads through the same services the
 * real page reads through, so it is refused where the real page would be.
 * A pick that finds nothing renders a `Refusal` on the screen, never a throw.
 */

/** The busiest active player: on the roster, reachable, with a college recorded. */
export async function pickPlayerMembershipId(): Promise<string | null> {
  const board = await listRosterBoard();
  const rows = [...board.rows].sort((a, b) => a.displayName.localeCompare(b.displayName));
  const preferred =
    rows.find((row) => row.status === "active" && row.hasMobile && row.hasEmail && row.college) ??
    rows.find((row) => row.status === "active") ??
    rows[0];
  return preferred?.membershipId ?? null;
}

/** The next approved event with invitations, or the most recent one with any. */
export async function pickApprovedEvent(): Promise<EventListEntry | null> {
  const list = await listEventsForOperator({ status: "approved", sort: "date", direction: "asc" });
  const today = todayInClubZone();
  const withInvitations = list.events.filter((event) => event.invitationCount > 0);
  return (
    withInvitations.find((event) => event.scheduledOn !== null && event.scheduledOn >= today) ??
    withInvitations.at(-1) ??
    null
  );
}

/** One player's invitation on that event — the RSVP page is about one person. */
export async function pickInvitationId(eventId: string): Promise<string | null> {
  const participation = await readOperatorParticipation(eventId);
  const person =
    participation.people.find(
      (row) =>
        row.invitationId && !row.isWalkUp && row.capacity === "player" && row.answer === null,
    ) ?? participation.people.find((row) => row.invitationId && !row.isWalkUp);
  return person?.invitationId ?? null;
}

/** An operator other than the reader, active and seated, so the record has something on it. */
export async function pickOperator(operator: ResolvedOperator): Promise<DirectoryOperator | null> {
  const directory = await readOperatorDirectory(operator);
  const others = directory.operators.filter((row) => row.personId !== operator.personId);
  return (
    others.find((row) => row.state === "active" && row.roles.length > 0) ??
    others[0] ??
    directory.operators[0] ??
    null
  );
}
