import "server-only";

import { InvalidTransition, type Tx } from "@/lib/db";
import { mayReceiveWelcomeContactIn } from "./messaging-consent";
import { recordOnboardingActivityIn } from "./onboarding-activity-log";

// The `onboarding-opened` welcome emitter (LAN-214, `REQ-one-welcome`, `REQ-transport`) — one door-independent welcome per membership, idempotent on `onboarding-welcome:<membershipId>`. Sending rides `messaging-scheduler.ts`.
// Decision history: missions/intake/M-ONBOARDING-AND-INFORMATION-COMPLETION

export type OnboardingWelcomeResult =
  { queued: true; jobId: string } | { queued: false; reason: "already_queued" };

const WELCOME_SECTION = "welcome";
const WELCOME_CHANNEL = "whatsapp";

function welcomeIdempotencyKey(membershipId: string): string {
  return `onboarding-welcome:${membershipId}`;
}

/** Declares the welcome job idempotently and logs one `ask` activity entry. Throws {@link InvalidTransition} if consent was `refused`/`withdrawn`. */
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
