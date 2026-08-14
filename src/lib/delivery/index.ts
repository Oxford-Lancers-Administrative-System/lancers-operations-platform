import "server-only";

import {
  describeMissingConfiguration,
  resolveOutboundConfig,
  type EnvironmentSource,
  type OutboundConfig,
} from "./config";
import type { DeliveryProvider, Transport } from "./provider";
import { createWhatsAppCloudProvider } from "./whatsapp-cloud";

/**
 * Choosing the provider. LAN-78.
 *
 * One provider exists today, because LAN-92 chose one. This function is still
 * where the choice is made rather than at the dispatcher's call site, so that
 * the automated email fallback the policy names — and any replacement for Meta
 * — arrives as a branch here and changes nothing above.
 *
 * The unconfigured answer is a value, not an exception: see `config.ts` for why
 * that matters on a machine and in a CI run that will never have credentials.
 */
export type ProviderResolution =
  | { readonly ok: true; readonly provider: DeliveryProvider; readonly config: OutboundConfig }
  | { readonly ok: false; readonly reason: string };

export function resolveDeliveryProvider(
  source: EnvironmentSource = process.env,
  transport?: Transport,
): ProviderResolution {
  const outbound = resolveOutboundConfig(source);
  if (!outbound.configured) {
    return { ok: false, reason: describeMissingConfiguration(outbound.missing) };
  }

  return {
    ok: true,
    provider: createWhatsAppCloudProvider(outbound.config, transport),
    config: outbound.config,
  };
}

export { rsvpUrl } from "./config";
export type { DeliveryProvider, InvitationMessage, SendOutcome, Transport } from "./provider";
