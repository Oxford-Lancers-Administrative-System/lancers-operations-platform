/**
 * Response progress by capacity — LAN-420.
 *
 * Stewart's email "OPS EVENTS UPDATES", 2026-09-22, change 2, following the
 * State of the App call the same day: "the most important information is how
 * many out of the total are saying yes… maybe there's a progress bar." Clint,
 * on the call: "separating how many have RSVPd out of how many are invited by
 * role."
 *
 * This amends D62 / D73 / D74 (Brian, 2026-09-22, on Stewart's request). Those
 * decisions made the event page's headline three raw pairs — "no percentages,
 * no judgment" — and they still govern **Showed**, which keeps its `— / 37`
 * shape on the operator's list of events and on the register. What they no
 * longer govern is the top of the event page: a coloured bar is now part of
 * the headline, because the question an operator opens the page with is not
 * "how many" but "are we there yet", and a coach reading `18 / 41` has to do
 * the arithmetic in their head for every role separately.
 *
 * The numbers themselves stayed raw. Brian's walk of 2026-09-23 took out the
 * response-rate gate that round 2 added, so nothing here judges a number any
 * more; the bar shows the three answers at their true widths and lets the
 * reader see the shape of them.
 *
 * Pure. No database, no React, no `server-only` — the rows come from
 * `participation-view.ts`, which both the operator page and the public Event
 * info link page already read.
 */

/** The four capacities an invitation can carry, as `public.invitation_capacity` spells them. */
type ResponseCapacity = "recruit" | "coach" | "player" | "committee";

/**
 * Which capacity counts somebody who holds more than one — LAN-420's own
 * order, and **not** `CAPACITY_PRECEDENCE` in `audience-selection.ts`, which
 * resolves a *selection* to a row and puts player first.
 *
 * "A person invited under two capacities counts once, under the first of
 * Recruits, Coaches, Players, Committee." An invitation carries exactly one
 * capacity today — invariant P9 gives one audience row per person per event,
 * and the capacity on it was resolved at approval and frozen there (ADR 0022:
 * never re-resolved) — so in practice each row arrives here already collapsed
 * and this order decides nothing. It is applied anyway, over whatever
 * capacities a row declares, so that the rule is in the code rather than in a
 * comment about why it cannot bite.
 */
const COUNTING_PRECEDENCE: readonly ResponseCapacity[] = Object.freeze([
  "recruit",
  "coach",
  "player",
  "committee",
]);

/** The order the blocks are shown in — Stewart's own order, which is not the counting order. */
const DISPLAY_ORDER: readonly ResponseCapacity[] = Object.freeze([
  "recruit",
  "player",
  "coach",
  "committee",
]);

const RESPONSE_CAPACITY_LABELS: Readonly<Record<ResponseCapacity, string>> = Object.freeze({
  recruit: "Recruits",
  player: "Players",
  coach: "Coaches",
  committee: "Committee",
});

/**
 * **There is no band, and no gate.** Stewart asked for "red to orange to green
 * based on reasonable gates (50%, 75%)" and round 2 built exactly that; Brian's
 * walk of 573bb9d4 (2026-09-23) dropped it. The bar now shows the three answers
 * themselves — yes from the left, no from the right, the unanswered remainder
 * between them — and "the gap carries that information". A threshold was a
 * second, coarser reading of the same numbers, and it disagreed with them at
 * the edges: an event where everybody has answered and half of them said no
 * went green, which is the opposite of the news. Nothing replaces it, because
 * the widths say it.
 */
export interface ResponseProgressBlock {
  readonly capacity: ResponseCapacity;
  readonly label: string;
  /** How many invitations this capacity holds. The denominator, and never a roster count. */
  readonly invited: number;
  readonly yes: number;
  readonly no: number;
  /** `yes + no` — how much of the bar is coloured at all. */
  readonly responded: number;
  /** `responded / invited`, as a whole number of per cent. */
  readonly percent: number;
}

/** One row as both tiers of `participation-view.ts` shape it. */
export interface ResponseProgressRow {
  readonly capacity: string;
  readonly isWalkUp: boolean;
  readonly answer: "yes" | "no" | null;
  /** Every capacity this person was invited under, where a caller knows more than one. */
  readonly capacities?: readonly string[];
}

function isResponseCapacity(value: string): value is ResponseCapacity {
  return (COUNTING_PRECEDENCE as readonly string[]).includes(value);
}

/** The one capacity a row counts under, or null where it counts under none. */
function countingCapacityOf(row: ResponseProgressRow): ResponseCapacity | null {
  // A walk-up was never invited, so they are not in any denominator. The block
  // counts invitations; the register counts who turned up, and that is the
  // number that moved below Audience and Distribution.
  if (row.isWalkUp) return null;

  const held = (row.capacities ?? [row.capacity]).filter(isResponseCapacity);
  for (const capacity of COUNTING_PRECEDENCE) {
    if (held.includes(capacity)) return capacity;
  }
  return null;
}

/**
 * One block per capacity present in the event's audience, in display order.
 *
 * A capacity nobody was invited under produces no block at all, which is
 * Stewart's rule ("For a non-Recruitment event … Same as above, just no need to
 * track recruits") expressed as a property of the audience rather than of the
 * event's type — after LAN-416 a recruit can be invited to any type, so the
 * block follows who is there.
 */
export function responseProgressByCapacity(
  rows: readonly ResponseProgressRow[],
): ResponseProgressBlock[] {
  const tally = new Map<ResponseCapacity, { invited: number; yes: number; no: number }>();

  for (const row of rows) {
    const capacity = countingCapacityOf(row);
    if (capacity === null) continue;
    const held = tally.get(capacity) ?? { invited: 0, yes: 0, no: 0 };
    held.invited += 1;
    if (row.answer === "yes") held.yes += 1;
    if (row.answer === "no") held.no += 1;
    tally.set(capacity, held);
  }

  return DISPLAY_ORDER.flatMap((capacity) => {
    const held = tally.get(capacity);
    if (held === undefined || held.invited === 0) return [];
    const responded = held.yes + held.no;
    // Truncated, not rounded, so the figure never claims a person who has not
    // answered. It no longer decides a colour — the bar's own segments are
    // drawn from `yes`, `no` and `invited` directly — and is kept because it is
    // the one plain reading of "how far along is this", for a caller that wants
    // it without doing the division again.
    const percent = Math.floor((responded / held.invited) * 100);
    return [
      {
        capacity,
        label: RESPONSE_CAPACITY_LABELS[capacity],
        invited: held.invited,
        yes: held.yes,
        no: held.no,
        responded,
        percent,
      },
    ];
  });
}
