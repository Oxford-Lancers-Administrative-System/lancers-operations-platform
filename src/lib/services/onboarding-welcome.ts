import "server-only";

import { InvalidTransition, type Tx, withTransaction } from "@/lib/db";
import { mayReceiveWelcomeContactIn } from "./messaging-consent";
import { recordOnboardingActivityIn } from "./onboarding-activity-log";

/**
 * The `onboarding-opened` welcome emitter — LAN-214, `REQ-one-welcome` and
 * `REQ-transport`. One welcome template for everybody, door-independent
 * (W1/W2/W3 all fire it, and none of them is built here): "Welcome to the
 * team, 2026–27," carrying the compiled-outstanding-ask link.
 *
 * ## Idempotent, once per membership, regardless of door
 *
 * `notification_jobs.idempotency_key` is `onboarding-welcome:<membershipId>`
 * — the same "one key per real-world event" idiom `recruitment-cycle.ts`
 * uses (`recruit-cycle:<step>:<personId>:<seasonId>`) and
 * `messaging-scheduler.ts` uses throughout. `on conflict (idempotency_key) do
 * nothing` is what makes calling this twice for the same membership — a
 * retried request, two doors racing on the same person, a re-run after a
 * crash — insert nothing the second time rather than queue a second welcome.
 *
 * ## `REQ-transport`: the one message permitted before a basis exists
 *
 * `mayReceiveWelcomeContactIn` (built for the recruitment cycle's identical
 * consent deadlock — LAN-204: "If consent is not given, sending the personal
 * questionnaire is how we get it") is reused verbatim rather than
 * reimplemented: it already expresses exactly `REQ-transport`'s "the
 * refuse-without-basis check permits only the welcome before a basis exists"
 * — allowed unless the person has explicitly `refused` or `withdrawn`, which
 * is every other send's hard "no" and stays one here too. Every other kind of
 * onboarding message (a follow-up, a nudge, a targeted ask) keeps calling
 * `requireGrantedSeasonMessagingConsentIn`, unchanged — this module never
 * touches that gate, and `onboarding-welcome.test.ts` proves the two
 * disagree on exactly the case that matters: a person who has neither
 * granted nor refused anything yet.
 *
 * ## `job_type = 'other'`
 *
 * The same adoption `recruitment-cycle.ts`'s own note explains: the one
 * `notification_job_type` value nothing else in this codebase's *player-side*
 * onboarding jobs writes, discriminated by `idempotency_key` rather than a
 * new column. This module only ever declares the job — claiming and sending
 * it rides Mission 4's pipeline (`messaging-scheduler.ts`), whose dispatch
 * loop a later package wires to recognise the `onboarding-welcome:` prefix
 * exactly as it already recognises `recruit-cycle:`. That wiring is out of
 * this package's scope; see the receipt's limitations.
 */

export type OnboardingWelcomeResult =
  { queued: true; jobId: string } | { queued: false; reason: "already_queued" };

const WELCOME_SECTION = "welcome";
const WELCOME_CHANNEL = "whatsapp";

function welcomeIdempotencyKey(membershipId: string): string {
  return `onboarding-welcome:${membershipId}`;
}

/**
 * Declares the welcome job for one membership, idempotently, and logs it as
 * one `ask` entry in that membership's activity log (`REQ-activity-log`) —
 * the log's very first entry for a new membership.
 *
 * Throws {@link InvalidTransition} when the person has explicitly `refused`
 * or `withdrawn` messaging consent for this season — the one case even the
 * welcome does not override.
 */
export async function emitOnboardingOpenedWelcomeIn(
  tx: Tx,
  params: { membershipId: string; personId: string; seasonId: string },
): Promise<OnboardingWelcomeResult> {
  const { membershipId, personId, seasonId } = params;

  const allowed = await mayReceiveWelcomeContactIn(tx, personId, seasonId);
  if (!allowed) {
    throw new InvalidTransition(
      "This person has declined messaging contact, so even the welcome cannot be sent.",
      { rule: "onboarding_welcome_requires_a_basis" },
    );
  }

  const idempotencyKey = welcomeIdempotencyKey(membershipId);
  const inserted = await tx.query<{ id: string }>(
    `insert into public.notification_jobs
       (idempotency_key, job_type, status, person_id, channel, scheduled_for, template_variables)
     values ($1, 'other', 'pending', $2::uuid, $3::public.notification_channel, now(), '{}'::jsonb)
     on conflict (idempotency_key) do nothing
     returning id`,
    [idempotencyKey, personId, WELCOME_CHANNEL],
  );

  const jobId = inserted.rows[0]?.id;
  if (!jobId) return { queued: false, reason: "already_queued" };

  await recordOnboardingActivityIn(tx, {
    membershipId,
    seasonId,
    section: WELCOME_SECTION,
    kind: "ask",
    channel: WELCOME_CHANNEL,
    actorLabel: "the club",
  });

  return { queued: true, jobId };
}

/** Convenience wrapper for a caller with no open transaction. */
export async function emitOnboardingOpenedWelcome(params: {
  membershipId: string;
  personId: string;
  seasonId: string;
}): Promise<OnboardingWelcomeResult> {
  return withTransaction((tx) => emitOnboardingOpenedWelcomeIn(tx, params));
}

/** Whether this membership's welcome has already been queued or sent — for a caller checking before it decides to call the emitter again. */
export async function onboardingWelcomeAlreadyQueuedIn(
  tx: Tx,
  membershipId: string,
): Promise<boolean> {
  const result = await tx.query(
    `select 1 from public.notification_jobs where idempotency_key = $1 limit 1`,
    [welcomeIdempotencyKey(membershipId)],
  );
  return result.rows.length > 0;
}
