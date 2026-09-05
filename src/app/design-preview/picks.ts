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

  /**
   * One transaction each, six at a time.
   *
   * The first draft ran all thirty-two reads serially inside a single
   * transaction, which is one connection and therefore strictly one query at a
   * time: the page took **eighteen to twenty-two seconds** to open, warm, every
   * time, which made the one screen most worth looking at the slowest to reach.
   * Separate transactions let the pool work. Six, not thirty-two, because
   * `DATABASE_POOL_MAX` defaults to ten and the rest of the render needs a
   * connection too.
   *
   * Deterministic either way: the winner is the highest outstanding count, ties
   * broken by the board's own name order, and `results` is indexed rather than
   * appended so completion order cannot decide it.
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
          // One unreadable candidate leaves this screen without its busiest
          // player at worst; an unhandled rejection here would take the whole
          // page down instead, because `Promise.all` rejects on the first
          // failure and nothing above catches it. The header comment on this
          // module promises a `Refusal` and never a throw, and without this it
          // only kept that promise for "found nothing", not for "the read
          // failed" — the distinction a reviewer found on 5 September 2026.
          // Every read failing still leaves `best` null, which is the
          // `Refusal`.
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

  // Serial on purpose here, unlike `pickPlayerHomeSubject`: this one returns at
  // the first candidate with something outstanding, which on the seed is the
  // first or second, so a parallel scan would do thirty reads to save none.
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
