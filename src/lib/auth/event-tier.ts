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
 * ## The club-link seam, now that something is standing on it
 *
 * `club_link` is in the vocabulary and in `tierSees` because D2 approved it and
 * because a coach holds no operator account — without the middle tier a coach
 * cannot see who is coming to their own session. This header used to say
 * "`resolveEventReadTier()` never returns it yet: nothing issues a club link".
 * LAN-157 issues one, so that sentence is corrected below rather than left to
 * mislead the next reader (R157-B7).
 *
 * **The club link does not come through `resolveEventReadTier()`, and should
 * not.** That function resolves a tier from the *session*, and the whole point
 * of a club link is that there is no session — the signed token is the
 * authorisation, resolved in `@/lib/services/club-link` and consumed by
 * `readClubLinkParticipation`. So the middle tier is reached by holding a
 * token, never by being recognised, and the resolver keeps answering the
 * question it was written for: what does *this session* read at?
 *
 * ## Two names for the same idea, pinned rather than merged
 *
 * `@/lib/services/participation-view` declares `ParticipationTier`, which is
 * this type with `public` removed. They are not collapsed into one, for two
 * reasons that are worth stating because "just use one type" is the obvious
 * suggestion:
 *
 *   1. This module is `server-only` and `participation-view` is imported by a
 *      client component, so the import would have to be type-only forever, one
 *      careless value import away from dragging `server-only` into the bundle.
 *   2. There is no public participation payload. A `tier: "public"` has nothing
 *      to discriminate — `Participation` cannot represent it — so widening that
 *      field to `EventReadTier` would add an impossible branch to every switch
 *      over it. Narrowing is the true relationship, not sameness.
 *
 * `./event-tier.test.ts` asserts at compile time that `ParticipationTier` is
 * exactly `Exclude<EventReadTier, "public">`, so the two cannot drift into
 * being two vocabularies without a test failing.
 *
 * ## One open disagreement, and it is not this module's to settle
 *
 * `TIER_SEES.club_link` lists `joining_url`. LAN-157's own contract —
 * `docs/ux/tickets/LAN-157-participation-and-club-link.md` — states the
 * opposite as an acceptance criterion: "No club-link response carries an online
 * event's joining URL, in the page or in any payload behind it", and puts the
 * joining URL in the operator row of its tier table. The shipped code follows
 * the contract: `ClubLinkEvent` has no `joiningUrl` key.
 *
 * The row below is left exactly as LAN-153 wrote it rather than quietly flipped
 * either way. Nothing consults `tierSees` for `club_link` — it is a written
 * declaration, not a gate — so the disagreement costs no behaviour today, and
 * resolving it changes what an unauthenticated, forwardable link exposes. That
 * is Brian's decision, not a refactor. Raised as R157-B6.
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
 * **Never `club_link`, and that is now permanent rather than pending.** LAN-157
 * ships the club link, and it is reached by holding a signed token with no
 * session at all — `readClubLinkParticipation` consults no cookie and takes no
 * actor. There is nothing about a *session* that makes it club-link tier, so
 * this function has no way to return one and no reason to. See this module's
 * header (R157-B7).
 */
export async function resolveEventReadTier(): Promise<EventReadTier> {
  const access = await resolveOperatorAccess();
  return access.state === "active" ? "operator" : "public";
}
