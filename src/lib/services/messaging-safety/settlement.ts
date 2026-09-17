import "server-only";

import type { Tx } from "@/lib/db";
import type { SendOutcome } from "@/lib/delivery/provider";
import { emitSafetyEvent } from "./monitor";
import {
  cooldownMinutesForStage,
  PROVIDER_FAULT_STREAK,
  PROVIDER_FAULT_WINDOW_MINUTES,
} from "./policy";
import { lockScopeIn, safetyNowIn } from "./scopes";

/**
 * What the provider's answer does to its circuit. LAN-394.
 *
 * ## The distinction this whole file exists for
 *
 * A message the provider refused is not necessarily a provider that is unwell.
 * A number that is not on WhatsApp, a template Meta has paused, a per-recipient
 * rate limit — each is a refusal, and none of them says anything about whether
 * the next message to a different person would go through. Counting them would
 * mean one unroutable number could stop the club's messaging altogether, which
 * is precisely the failure this feature is supposed to prevent rather than
 * cause (Brian, 17 September 2026).
 *
 * So the adapter classifies its own fault, in `SendOutcome.faultScope`, from
 * the provider's structured error code — never by parsing a human sentence —
 * and only `provider` reaches the streak here.
 *
 * ## Why an acceptance does not prove delivery
 *
 * It closes the circuit, and that is all it is allowed to mean. Meta accepting
 * a message is not Meta delivering it (proved on 13 August 2026), so a healthy
 * circuit says the transport is answering, not that anybody was reached.
 */

/**
 * Called after the provider has answered, outside the claim transaction and
 * inside the recording one.
 *
 * `observedProbeGeneration` is the circuit generation this send was admitted
 * under. A result that arrives after a newer incident has opened carries an
 * older generation and is ignored, so a probe that finally answers twenty
 * minutes late cannot close a cooldown that started since.
 */
export async function recordProviderOutcomeIn(
  tx: Tx,
  channel: "whatsapp" | "email",
  outcome: SendOutcome,
  observedProbeGeneration: number,
): Promise<void> {
  const provider = await lockScopeIn(tx, "provider", channel);
  if (!provider) return;

  if (provider.probeGeneration !== observedProbeGeneration) return;

  const now = await safetyNowIn(tx);

  if (outcome.status === "accepted") {
    if (provider.consecutiveFaults === 0 && provider.cooldownStage === 0) return;
    await tx.query(
      `update public.messaging_safety_scopes
          set consecutive_faults = 0,
              first_fault_at = null,
              cooldown_until = null,
              cooldown_stage = 0,
              version = version + 1,
              updated_at = now()
        where id = $1`,
      [provider.id],
    );
    if (provider.incidentAlertAt !== null) {
      await tx.query(
        "update public.messaging_safety_scopes set incident_alert_at = null where id = $1",
        [provider.id],
      );
      emitSafetyEvent({
        kind: "provider_cooldown",
        phase: "recovered",
        scope: "provider",
        provider: channel,
        reasonCode: "provider_cooldown",
        counts: { cooldownStage: provider.cooldownStage },
      });
    }
    return;
  }

  // A refusal that is not the provider's own fault leaves the circuit exactly
  // as it was. It does not count towards the streak and it does not reset one:
  // "five consecutive provider-side faults" is a statement about provider-side
  // faults, and a bad number in the middle of a run of timeouts has not made
  // the provider well.
  if (outcome.faultScope !== "provider") return;

  // A streak is only a streak inside its window. A fault five minutes after the
  // last one starts a new run of one rather than extending an old one.
  const withinWindow =
    provider.firstFaultAt !== null &&
    now.getTime() - provider.firstFaultAt.getTime() <= PROVIDER_FAULT_WINDOW_MINUTES * 60_000;

  const faults = withinWindow ? provider.consecutiveFaults + 1 : 1;
  const firstFaultAt = withinWindow ? provider.firstFaultAt : now;

  const alreadyCoolingDown = provider.cooldownUntil !== null && provider.cooldownUntil > now;
  const trips = faults >= PROVIDER_FAULT_STREAK && !alreadyCoolingDown;
  const stage = trips ? Math.max(1, provider.cooldownStage) : provider.cooldownStage;
  const cooldownUntil = trips
    ? new Date(now.getTime() + cooldownMinutesForStage(stage) * 60_000)
    : provider.cooldownUntil;

  await tx.query(
    `update public.messaging_safety_scopes
        set consecutive_faults = $2,
            first_fault_at = $3::timestamptz,
            cooldown_stage = $4,
            cooldown_until = $5::timestamptz,
            version = version + 1,
            updated_at = now()
      where id = $1`,
    [provider.id, faults, firstFaultAt, stage, cooldownUntil],
  );

  if (trips && provider.incidentAlertAt === null) {
    await tx.query(
      "update public.messaging_safety_scopes set incident_alert_at = now() where id = $1",
      [provider.id],
    );
    emitSafetyEvent({
      kind: "provider_cooldown",
      phase: "open",
      scope: "provider",
      provider: channel,
      reasonCode: "provider_cooldown",
      counts: { consecutiveFaults: faults, cooldownStage: stage },
    });
  }
}
