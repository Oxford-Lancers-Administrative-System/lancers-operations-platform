import "server-only";

/**
 * The club's RSVP response deadline. LAN-77, as amended by LAN-169.
 *
 * ## What this file used to be, and why it is now four functions thick
 *
 * It used to be the deadline itself: a frozen `Record<event_type,
 * {daysBefore, atTime}>` table with Brian's reasoning of 13 August 2026 written
 * beside it, and the arithmetic that turned a row into an instant. ADR 0021
 * recorded that shape deliberately, including its rule that Release One would
 * carry no configuration-administration surface.
 *
 * Brian reversed that on 2026-08-25 — "Okay, we're building it… Yes, it's a
 * superseding ADR" — and the values moved into `public.messaging_schedules`,
 * where the settings page W7 describes can read and write the same rows the
 * scheduler obeys. `docs/adr/0036-messaging-schedule-configuration.md` records
 * the reversal and what survives it.
 *
 * So this module is now a **named view onto one field of the messaging plan**,
 * and it exists rather than being deleted for a reason that is not sentiment:
 * `event-approval.ts` asks a narrower question than the plan answers — "what
 * goes in `invitations.expires_at`?" — and a caller that only needs the
 * deadline should not have to know that a ladder, an escalation threshold and a
 * dispatch anchor were computed alongside it. There is exactly one arithmetic
 * implementation, in `messaging-schedule.ts`, and this file has none of its own.
 *
 * ## What changed about the value, and what did not
 *
 * The **day counts are Brian's, unchanged** — two days for practice, S&C,
 * chalk, recruitment and meeting; seven for a game; five for a social — and
 * they now live in `public.messaging_schedules.rsvp_by_days`.
 *
 * The **fixed 18:00 wall clock is retired.** `REQ-deadline-from-event-start`
 * measures every deadline from the event's own start instead, so a 20:00
 * practice answers by 20:00 two days before. Brian, 2026-08-25: "'by 18:00' is
 * a little bit confusing. It should just be '2 days before the start of the
 * event' because the event is going to be different."
 *
 * ADR 0021's other rules survive and are enforced in `messaging-schedule.ts`:
 * the table is complete with no default arm, a past deadline is clamped to the
 * approval moment, and there is no per-event override.
 *
 * ## What the deadline means
 *
 * Not a cutoff. `docs/ux/slice-ux.md` § 9 is explicit that a player may answer
 * late and may change their answer until the event starts. What the deadline
 * does is decide when an unanswered invitation becomes an *exception the club
 * chases* — it feeds `nonresponse_queue`, the escalation threshold and the
 * Monday report. That is why the values are about planning lead time rather
 * than about politeness.
 */

/**
 * The rule for one event type.
 *
 * `atTime` is gone with the fixed clock. What remains is the day count and the
 * statement of what it is counted from, which is the event's own start.
 */
interface ResponseDeadlineRule {
  /** Calendar days before the event's start. Never negative. */
  readonly daysBefore: number;
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
   * Brian's decision, preserved from ADR 0021: responses are then **due
   * immediately**, the approver is shown that before committing, and approval is
   * not refused. Unanswered invitations enter the exception queue at once, which
   * is the honest consequence of approving after the club's own planning point.
   */
  readonly clamped: boolean;
  readonly rule: ResponseDeadlineRule;
}
