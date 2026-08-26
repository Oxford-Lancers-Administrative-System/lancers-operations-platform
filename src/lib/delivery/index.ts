import "server-only";

import {
  describeMissingConfiguration,
  resolveEmailConfig,
  resolveOutboundConfig,
  type EmailConfig,
  type EnvironmentSource,
  type OutboundConfig,
} from "./config";
import { createEmailProvider } from "./email";
import { selectDeliverySink } from "./local-sink";
import type { DeliveryProvider, Transport } from "./provider";
import { createWhatsAppCloudProvider } from "./whatsapp-cloud";

/**
 * Choosing the provider. LAN-78, extended by LAN-169.
 *
 * One provider existed here because LAN-92 chose one. `provider.ts` said the
 * automated email fallback the policy names "implements this interface and
 * changes nothing else", and this is where that claim is cashed: a second
 * branch, and nothing above this file altered.
 *
 * The unconfigured answer is a value, not an exception: see `config.ts` for why
 * that matters on a machine and in a CI run that will never have credentials.
 *
 * ## Why the channel is an argument
 *
 * Because the *job* knows which rung of the ladder it is. `REQ-ladder-order`
 * fixes the sequence — WhatsApp, WhatsApp again, email, then the President —
 * and the scheduler writes that into `notification_jobs.channel` when it
 * creates the rung. Deciding the channel here from configuration instead would
 * mean a deployment whose email happened to be unconfigured silently sent the
 * email rung over WhatsApp, which is not a fallback but a duplicate.
 *
 * ## Why the transport is resolved here and not at the call site
 *
 * `selectDeliverySink` answers with the local delivery sink for a local runtime
 * and with `null` for every other, by runtime detection and not by any setting.
 * Putting it here means the dispatcher, the retry path and the scheduler all
 * inherit it without any of them knowing the sink exists — and means an
 * explicitly injected transport, which is how LAN-124's live-provider proof and
 * every test supply their own, still takes precedence.
 */

/** Everything one attempt needs, once the channel has been decided. */
export interface DeliveryContext {
  readonly channel: "whatsapp" | "email";
  readonly provider: DeliveryProvider;
  /** Where this deployment answers. The RSVP link is built from it. */
  readonly appBaseUrl: string;
  /** The default calling code for a national-format number, e.g. `44`. */
  readonly defaultCallingCode: string;
  /** Permitted telephone numbers. Empty on the email channel. */
  readonly recipientAllowlist: readonly string[];
  /** Permitted email addresses. Empty on the WhatsApp channel. */
  readonly emailAllowlist: readonly string[];
  /** The WhatsApp configuration, where this channel needed one. */
  readonly outbound: OutboundConfig | null;
  /** The email configuration, where this channel needed one. */
  readonly email: EmailConfig | null;
}

export type ProviderResolution =
  | { readonly ok: true; readonly context: DeliveryContext }
  | { readonly ok: false; readonly reason: string };

export function resolveDeliveryProvider(
  source: EnvironmentSource = process.env,
  transport?: Transport,
  channel: "whatsapp" | "email" = "whatsapp",
): ProviderResolution {
  // Explicit first, runtime-selected second, `fetch` last. The order is the
  // whole of the sink's safety: it can only ever be reached when nobody named a
  // transport and the runtime is local.
  const wire = transport ?? selectDeliverySink(source) ?? undefined;

  if (channel === "email") {
    const email = resolveEmailConfig(source);
    if (!email.configured) {
      return { ok: false, reason: describeMissingConfiguration(email.missing) };
    }

    // `APP_BASE_URL` is read through the outbound resolution because that is
    // where it is declared and validated, and because a deployment sending the
    // email rung of a WhatsApp ladder has one by construction. An email-only
    // deployment is not a state this club has, and inventing a second reader
    // for one variable to represent a state nobody is in would be two places
    // for the application's own address to come from.
    const outbound = resolveOutboundConfig(source);
    if (!outbound.configured) {
      return { ok: false, reason: describeMissingConfiguration(outbound.missing) };
    }

    return {
      ok: true,
      context: {
        channel: "email",
        provider: createEmailProvider(email.config, wire),
        appBaseUrl: outbound.config.appBaseUrl,
        defaultCallingCode: outbound.config.defaultCallingCode,
        recipientAllowlist: [],
        emailAllowlist: email.config.recipientAllowlist,
        outbound: outbound.config,
        email: email.config,
      },
    };
  }

  const outbound = resolveOutboundConfig(source);
  if (!outbound.configured) {
    return { ok: false, reason: describeMissingConfiguration(outbound.missing) };
  }

  return {
    ok: true,
    context: {
      channel: "whatsapp",
      provider: createWhatsAppCloudProvider(outbound.config, wire),
      appBaseUrl: outbound.config.appBaseUrl,
      defaultCallingCode: outbound.config.defaultCallingCode,
      recipientAllowlist: outbound.config.recipientAllowlist,
      emailAllowlist: [],
      outbound: outbound.config,
      email: null,
    },
  };
}

export { rsvpUrl } from "./config";
export type {
  DeliveryProvider,
  InvitationMessage,
  MessageKind,
  OutboundMessage,
  SendOutcome,
  Transport,
} from "./provider";
