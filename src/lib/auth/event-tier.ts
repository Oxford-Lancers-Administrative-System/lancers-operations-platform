import "server-only";

import { NotPermitted } from "@/lib/db";
import { resolveOperatorAccess, type ResolvedOperator } from "./operator";

/**
 * The three tiers an event is read at. LAN-153, `REQ-three-tiers`.
 *
 * ## What the tiers are
 *
 * | Tier        | Sees                                                            |
 * | ----------- | --------------------------------------------------------------- |
 * | `public`    | the event record — and nothing about people                     |
 * | `club_link` | the event record, plus audience, RSVP and attendance            |
 * | `operator`  | all of that, plus delivery                                      |
 *
 * D2, D3 and D65. **Delivery is the only operator-locked element** — everything
 * the club-link tier adds, an operator also has, and the two differ in nothing
 * else. Brian, 20 August 2026, on the public half: _"people who see the calendar
 * should see a normal calendar of events … They shouldn't be able to see other
 * details about it. There are going to be private details per event, like RSVP
 * attendance and things of that nature, that shouldn't be on the public
 * calendar."_
 *
 * ## Authorisation is here, not in the route
 *
 * `slice-ux.md` § 4: "Routes do not authorize." That has always been true of
 * this application, and this package is where it starts to cost something: it
 * opens the first genuinely anonymous read surface, so "the page is under
 * `/operate`" stops being even an approximation of who is reading. Two things
 * carry the boundary instead, and neither is a rendering decision:
 *
 *   1. **The projection.** `listPublicSeasonEvents` and `readPublicEvent` in
 *      `@/lib/services/events` select different columns. A joining URL, an
 *      invitation count or an attendance count is not withheld from the public
 *      payload — it is never read out of the database, so there is nothing to
 *      withhold. The public types have no field for one either.
 *   2. **This guard.** The elevated projection is reached only through
 *      `listEventsForOperator`, which calls `requireEventOperatorTier()` before
 *      it reads anything. Deleting a gate from a page cannot grant it.
 *
 * ## The club-link seam
 *
 * `club_link` is in the vocabulary and in `tierSees` because D2 approved it and
 * because a coach holds no operator account — without the middle tier a coach
 * cannot see who is coming to their own session. `resolveEventReadTier()` never
 * returns it yet: nothing issues a club link. Issuing one, and the participation
 * view behind it, is `WP-participation-club-link`. The seam is written down here
 * so that work adds a resolver rather than inventing a second vocabulary.
 */

export type EventReadTier = "public" | "club_link" | "operator";

export const EVENT_READ_TIERS: readonly EventReadTier[] = Object.freeze([
  "public",
  "club_link",
  "operator",
]);

/**
 * The kinds of thing an event page states, as the tiers divide them.
 *
 * `participation` is one element rather than four because audience, RSVP,
 * attendance and the counts derived from them all answer "who" — and the public
 * tier's rule is that it never names a person or reports an answer, not that it
 * hides four particular tables.
 */
export type EventElement = "event_record" | "joining_url" | "participation" | "delivery";

const TIER_SEES: Readonly<Record<EventReadTier, readonly EventElement[]>> = Object.freeze({
  public: Object.freeze(["event_record"] as const),
  club_link: Object.freeze(["event_record", "joining_url", "participation"] as const),
  operator: Object.freeze(["event_record", "joining_url", "participation", "delivery"] as const),
});

/**
 * May this tier see this element?
 *
 * `joining_url` is deliberately **not** in the public row. `REQ-no-joining-url`:
 * an online event's joining URL is never public, in a page, in a feed or in any
 * payload behind one. Chalk is on Teams (D20) and a publicly readable joining
 * link is an open door into a club meeting for anyone who finds the page.
 */
export function tierSees(tier: EventReadTier, element: EventElement): boolean {
  return TIER_SEES[tier].includes(element);
}

/** `rule` on a refusal of an operator-tier read. */
export const EVENT_OPERATOR_TIER_RULE = "event_operator_tier_required";

/**
 * What a refused reader is told.
 *
 * The requirement, never the holdings — `./guards` explains why at length. It
 * also names the surface that *is* open, because the reader may genuinely have
 * wanted the calendar and there is now a public one to send them to.
 */
export const EVENT_OPERATOR_TIER_MESSAGE =
  "This view of the club's events needs an active Lancers operator profile. The club " +
  "calendar is readable without one.";

/**
 * Pure: the operator, or a refusal. Takes the actor so a test can pass any of
 * them, including ones that could not exist.
 */
export function assertEventOperatorTier(operator: ResolvedOperator | null): ResolvedOperator {
  if (!operator) {
    throw new NotPermitted(EVENT_OPERATOR_TIER_MESSAGE, { rule: EVENT_OPERATOR_TIER_RULE });
  }
  return operator;
}

/**
 * The current request's operator, or `NotPermitted`.
 *
 * The floor for the elevated event projection: a linked, active operator, which
 * is the same floor `/operate/events` has always stood on. It says nothing about
 * roles — a coaching assignment passes it and then sees its own narrowed list,
 * which is `src/app/operate/events/coach-eligible-events.tsx`'s business rather
 * than this one's. Widening or narrowing who counts as an operator is not this
 * package's decision and nothing here takes it.
 */
export async function requireEventOperatorTier(): Promise<ResolvedOperator> {
  const access = await resolveOperatorAccess();
  return assertEventOperatorTier(access.state === "active" ? access.operator : null);
}

/**
 * Which tier this request reads at.
 *
 * `operator` for a linked, active operator; `public` for everybody else,
 * including a signed-in mailbox with no operator profile — that account is a
 * stranger as far as the club's events are concerned, and the public calendar is
 * the honest answer for it rather than a refusal.
 *
 * Never `club_link` yet; see this module's header.
 */
export async function resolveEventReadTier(): Promise<EventReadTier> {
  const access = await resolveOperatorAccess();
  return access.state === "active" ? "operator" : "public";
}
