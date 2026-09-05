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

// ---------------------------------------------------------------------------
// The player surfaces — LAN-225's addendum (Brian, 5 September 2026)
// ---------------------------------------------------------------------------

/**
 * Which player the three player screens photograph.
 *
 * The real routes are reached with a token in the URL. These previews are not:
 * they resolve a person the same way every other preview resolves its record —
 * deterministically, through the operator tier, with no token minted, none
 * rendered and none in the address bar. That is deliberate. A capture whose URL
 * carried a live credential would be a screenshot nobody could paste into a
 * review page (`docs/ux/mockup-standards.md`), and minting one to photograph a
 * layout would put a writable credential in the evidence folder for good.
 *
 * The pick is the hardest honest case rather than the tidiest: the active
 * player with the most invitations still needing an answer, ties broken by
 * name. That is the player the addendum measured at 5,770px, and a proposal
 * judged on an easy record is not judged at all.
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

  return withTransaction(async (tx) => {
    let best: { personId: string; home: PlayerHome } | null = null;
    for (const row of candidates) {
      const home = await readPlayerHomeIn(tx, row.personId);
      const outstanding = home.newInvitations.length + home.stillNeedAnswer.length;
      const bestOutstanding = best
        ? best.home.newInvitations.length + best.home.stillNeedAnswer.length
        : -1;
      if (outstanding > bestOutstanding) best = { personId: row.personId, home };
    }
    return best;
  });
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

/**
 * The questionnaire's subject: an active player with something still
 * outstanding, so the sequence has a step to be on. Falls back to the player
 * home's own subject, whose questionnaire may well be finished — the
 * already-complete page is a real state and photographing it is not a failure.
 */
export async function pickQuestionnaireSubject(): Promise<QuestionnaireView | null> {
  const board = await listRosterBoard();
  const candidates = board.rows
    .filter((row) => row.status === "active")
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

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
