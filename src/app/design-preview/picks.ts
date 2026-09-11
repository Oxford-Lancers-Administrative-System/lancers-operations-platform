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
import { withTransaction } from "@/lib/db";
import {
  readPlayerHomeIn,
  type PlayerHome,
  type PlayerHomeInvitation,
} from "@/lib/services/player-home";
import {
  readQuestionnaireViewIn,
  type QuestionnaireView,
} from "@/lib/services/player-questionnaire";

/**
 * Which seeded record each preview screen shows — LAN-225. No ids in the
 * URLs, so `visual:preflight` can target fixed paths on any reseed. Each pick
 * is deterministic over the seed and reads through the same services the
 * real page does. A pick that finds nothing renders `Refusal`, never a throw.
 *
 * Decision history: docs/ux/tickets/LAN-231-design-rollout.md
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

// The player surfaces — LAN-225's addendum (Brian, 5 September 2026)

/**
 * Which player the three player screens photograph. No token minted,
 * rendered or in the address bar — a captured credential would be unpasteable
 * evidence and a writable one left behind for good. The hardest honest case,
 * not the tidiest: active, most invitations outstanding, ties by name.
 */
export async function pickPlayerHomeSubject(): Promise<{
  personId: string;
  home: PlayerHome;
} | null> {
  const board = await listRosterBoard();
  const candidates = board.rows
    .filter((row) => row.status === "active")
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  if (candidates.length === 0) return null;

  /**
   * One transaction each, six at a time — serial reads inside one connection
   * took 18-22s to open; 6, not all, because `DATABASE_POOL_MAX` defaults to
   * 10 and the render needs a connection too. `results` is indexed so
   * completion order cannot decide the deterministic winner.
   */
  const CONCURRENCY = 6;
  const results = new Array<PlayerHome | null>(candidates.length).fill(null);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, async () => {
      for (let index = next++; index < candidates.length; index = next++) {
        try {
          results[index] = await withTransaction((tx) =>
            readPlayerHomeIn(tx, candidates[index].personId),
          );
        } catch {
          // One unreadable candidate leaves this screen without its busiest player, not down entirely (Promise.all rejects on first uncaught failure).
          results[index] = null;
        }
      }
    }),
  );

  let best: { personId: string; home: PlayerHome } | null = null;
  let bestOutstanding = -1;
  candidates.forEach((row, index) => {
    const home = results[index];
    if (!home) return;
    const outstanding = home.newInvitations.length + home.stillNeedAnswer.length;
    if (outstanding > bestOutstanding) {
      bestOutstanding = outstanding;
      best = { personId: row.personId, home };
    }
  });
  return best;
}

/** The event this player's focused panel is opened on: their soonest unanswered one. */
export function pickFocusedInvitation(home: PlayerHome): PlayerHomeInvitation | null {
  const unanswered = [...home.newInvitations, ...home.stillNeedAnswer];
  return (
    unanswered.find((entry) => entry.invitationId === home.nextInvitationId) ??
    unanswered[0] ??
    null
  );
}

/** The questionnaire's subject: active, something outstanding. Falls back to a finished one — already-complete is a real state, not a failure. */
export async function pickQuestionnaireSubject(): Promise<QuestionnaireView | null> {
  const board = await listRosterBoard();
  const candidates = board.rows
    .filter((row) => row.status === "active")
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  // Serial on purpose, unlike `pickPlayerHomeSubject`: returns at the first candidate with something outstanding.
  return withTransaction(async (tx) => {
    let fallback: QuestionnaireView | null = null;
    for (const row of candidates) {
      const view = await readQuestionnaireViewIn(tx, row.personId, board.season.id);
      if (!view) continue;
      fallback ??= view;
      if (!view.nothingOutstanding) return view;
    }
    return fallback;
  });
}
