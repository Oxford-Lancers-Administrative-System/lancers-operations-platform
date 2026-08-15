import "server-only";

import { CLUB_TIME_ZONE } from "@/lib/club-time";
import { ConstraintViolated, type Tx } from "@/lib/db";

/**
 * The club's RSVP response-deadline configuration. LAN-77.
 *
 * ## This file is a recorded owner decision, not an engineering choice
 *
 * Brian decided these values on **13 August 2026**, after the implementation
 * stopped and asked for them. The issue's own words were that the governing
 * documentation contained no approved duration for any event type and that
 * "implementers must not invent them" — so nothing here was derived, inferred
 * from the wireframe, or copied from the seed. Changing a number in the table
 * below changes club policy and needs him, not a reviewer.
 *
 * His reasoning, preserved because a bare table invites someone to "tidy" it:
 *
 *   * **Two days** — practice, S&C, chalk, recruitment, meeting, other. Routine
 *     events. Long enough to see a shortage, short enough not to manufacture a
 *     chase queue against people who would have answered anyway.
 *   * **Seven days** — fixture, varsity, camp. A shortfall here affects team
 *     eligibility, travel, accommodation and opposition coordination, and all
 *     of those have to be dealt with well before the day.
 *   * **Five days** — social. A middle tier for catering, deposits and venue
 *     numbers. A social that needs no numbers is better modelled as an
 *     informational event carrying no deadline at all.
 *
 * He also recorded the uncertainty: the club has no measured evidence for any
 * of it, socials and camps vary, and these are the fixed MVP values to be
 * revisited after the controlled pilot. They are not an implementation blocker
 * and they are not a placeholder — do not "improve" them, and do not add a
 * per-event override, which LAN-77 explicitly withholds.
 *
 * ## What the deadline means
 *
 * Not a cutoff. `docs/ux/slice-ux.md` § 9 is explicit that a player may answer
 * late and may change their answer until the event starts. What the deadline
 * does is decide when an unanswered invitation becomes an *exception the club
 * chases* — it feeds `nonresponse_queue` and the Monday report. That is why the
 * values are about planning lead time rather than about politeness.
 *
 * ## Why the arithmetic happens in PostgreSQL
 *
 * "18:00 Europe/London on the day two days before" is a wall-clock rule, and
 * Britain changes offset twice a year inside the season. PostgreSQL carries the
 * IANA database and `(date + time) at time zone 'Europe/London'` is correct
 * across both transitions; the equivalent in JavaScript is a hand-rolled offset
 * search that is one edge case away from putting a deadline an hour out every
 * October. The *rule* lives here in TypeScript, where club policy belongs; only
 * the calendar arithmetic is delegated.
 */

/** The rule for one event type: a whole-day offset and a local wall-clock time. */
export interface ResponseDeadlineRule {
  /** Calendar days before the event date. Never negative. */
  readonly daysBefore: number;
  /** Local time on that day, `HH:MM`, in `RESPONSE_DEADLINE_ZONE`. */
  readonly atTime: string;
}

/**
 * The zone every rule's `atTime` is expressed in. The club is in Oxford.
 *
 * Re-pointed at `CLUB_TIME_ZONE` by LAN-114, which needed the calendar to use
 * "the application's configured club timezone" rather than declare a second
 * one. Same value; one declaration. The name stays because the deadline rules
 * read better naming their own zone, and callers already import it.
 */
export const RESPONSE_DEADLINE_ZONE = CLUB_TIME_ZONE;

function rule(daysBefore: number, atTime: string): ResponseDeadlineRule {
  return Object.freeze({ daysBefore, atTime });
}

/**
 * Every value of `public.event_type`, and the deadline rule for each.
 *
 * Deliberately complete rather than defaulted. A `default` arm would silently
 * absorb a future event type and give it a deadline nobody approved, which is
 * exactly the invention this file exists to prevent — so an unknown type is a
 * refusal (see `responseDeadlineRule`), and adding an event type to the enum
 * forces the decision to be made rather than inherited.
 */
export const RESPONSE_DEADLINE_RULES: Readonly<Record<string, ResponseDeadlineRule>> =
  Object.freeze({
    practice: rule(2, "18:00"),
    strength_and_conditioning: rule(2, "18:00"),
    chalk: rule(2, "18:00"),
    fixture: rule(7, "18:00"),
    social: rule(5, "18:00"),
    recruitment: rule(2, "18:00"),
    camp: rule(7, "18:00"),
    varsity: rule(7, "18:00"),
    meeting: rule(2, "18:00"),
    other: rule(2, "18:00"),
  });

export const UNCONFIGURED_EVENT_TYPE_RULE = "response_deadline_not_configured";

/**
 * The rule for an event type, or a refusal naming the gap.
 *
 * The refusal is the point. If a later issue widens `public.event_type` without
 * Brian deciding the new type's deadline, approving such an event fails loudly
 * here rather than quietly inheriting two days from a fallback.
 */
export function responseDeadlineRule(eventType: string): ResponseDeadlineRule {
  const configured = RESPONSE_DEADLINE_RULES[eventType];
  if (!configured) {
    throw new ConstraintViolated(
      `No response deadline has been agreed for ${eventType} events, so this event ` +
        "cannot be approved. That is a club decision rather than a fault in the app.",
      { rule: UNCONFIGURED_EVENT_TYPE_RULE },
    );
  }
  return configured;
}

/** A deadline, resolved against a specific event and a specific moment. */
export interface ResolvedResponseDeadline {
  /** The instant that goes into `invitations.expires_at`. */
  readonly at: Date;
  /** Where the rule alone put it, before any clamp. Shown for transparency. */
  readonly configuredAt: Date;
  /**
   * The configured deadline had already passed, so it was clamped forward.
   *
   * Brian's decision: responses are then **due immediately**, the approver is
   * shown that before committing, and approval is not refused. Unanswered
   * invitations enter the exception queue at once, which is the honest
   * consequence of approving after the club's own planning point.
   */
  readonly clamped: boolean;
  readonly rule: ResponseDeadlineRule;
}

export const DEADLINE_NEEDS_A_DATE_RULE = "response_deadline_requires_a_date";

/**
 * Resolves the deadline for one event, as of a given moment.
 *
 * `asOf` is the approval instant on the write path and `now()` on the preview
 * path, so the approver sees the same value the transaction is about to store —
 * the small drift between rendering the page and pressing the button can only
 * move a clamped deadline forward by seconds, and the stored value is always
 * the one computed inside the transaction.
 */
export async function resolveResponseDeadlineIn(
  tx: Tx,
  event: { eventType: string; scheduledOn: string | null },
  asOf?: Date,
): Promise<ResolvedResponseDeadline> {
  const configured = responseDeadlineRule(event.eventType);

  if (event.scheduledOn === null) {
    // Invariant E1a requires a date from approval onward anyway, and the
    // database would refuse the row. Refusing here means the operator is told
    // which fact is missing instead of being shown a constraint name.
    throw new ConstraintViolated(
      "This event needs a date before it can be approved — the response deadline is " +
        "worked out from it.",
      { rule: DEADLINE_NEEDS_A_DATE_RULE },
    );
  }

  const result = await tx.query<{ configured_at: Date; as_of: Date }>(
    `select (($1::date - $2::integer) + $3::time) at time zone $4 as configured_at,
            coalesce($5::timestamptz, now()) as as_of`,
    [
      event.scheduledOn,
      configured.daysBefore,
      configured.atTime,
      RESPONSE_DEADLINE_ZONE,
      asOf ?? null,
    ],
  );

  const { configured_at: configuredAt, as_of: at } = result.rows[0];
  const clamped = configuredAt.getTime() <= at.getTime();

  return {
    at: clamped ? at : configuredAt,
    configuredAt,
    clamped,
    rule: configured,
  };
}
