import "server-only";
import { testTransport, testSource } from "@/lib/test-runtime";

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
import { createTwilioSmsProvider } from "./sms-twilio";

/**
 * Choosing the provider. LAN-78, extended by LAN-169, re-pointed by LAN-330.
 *
 * The phone channel is SMS on Twilio; the email channel is Resend. The
 * unconfigured answer is a value, not an exception: see `config.ts` for why
 * that matters on a machine and in a CI run that will never have credentials.
 *
 * ## Why the channel is an argument
 *
 * Because the *job* knows which rung of the ladder it is. `REQ-ladder-order`
 * fixes the sequence — text, text again, email, then the President — and the
 * scheduler writes that into `notification_jobs.channel` when it creates the
 * rung. Deciding the channel here from configuration instead would mean a
 * deployment whose email happened to be unconfigured silently sent the email
 * rung as a text, which is not a fallback but a duplicate.
 *
 * ## Why the transport is resolved here and not at the call site
 *
 * `selectDeliverySink` answers with the local delivery sink for a local runtime
 * and with `null` for every other, by runtime detection and not by any setting.
 * Putting it here means the dispatcher, the retry path and the scheduler all
 * inherit it without any of them knowing the sink exists — and means an
 * explicitly injected transport still takes precedence.
 */

/** Everything one attempt needs, once the channel has been decided. */
export interface DeliveryContext {
  readonly channel: "sms" | "email";
  readonly provider: DeliveryProvider;
  /** Where this deployment answers. The RSVP link is built from it. */
  readonly appBaseUrl: string;
  /** The default calling code for a national-format number, e.g. `44`. */
  readonly defaultCallingCode: string;
  /** Permitted telephone numbers. Empty on the email channel. */
  readonly recipientAllowlist: readonly string[];
  /** Permitted email addresses. Empty on the SMS channel. */
  readonly emailAllowlist: readonly string[];
  /** The SMS configuration, where this channel needed one. */
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
  channel: "sms" | "email" = "sms",
): ProviderResolution {
  // Explicit first, runtime-selected second, `fetch` last. The order is the
  // whole of the sink's safety: it can only ever be reached when nobody named a
  // transport and the runtime is local.
  source = testSource(source);
  const wire = transport ?? testTransport(source) ?? selectDeliverySink(source) ?? undefined;

  if (channel === "email") {
    const email = resolveEmailConfig(source);
    if (!email.configured) {
      return { ok: false, reason: describeMissingConfiguration(email.missing) };
    }

    // `APP_BASE_URL` is read through the outbound resolution because that is
    // where it is declared and validated, and because a deployment sending the
    // email rung of a text ladder has one by construction.
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
      channel: "sms",
      provider: createTwilioSmsProvider(outbound.config, wire),
      appBaseUrl: outbound.config.appBaseUrl,
      defaultCallingCode: outbound.config.defaultCallingCode,
      recipientAllowlist: outbound.config.recipientAllowlist,
      emailAllowlist: [],
      outbound: outbound.config,
      email: null,
    },
  };
}

export { rsvpUrl, playerAnswerUrl, playerHomeUrl } from "./config";
export type {
  DeliveryProvider,
  InvitationMessage,
  MessageKind,
  OutboundMessage,
  SendOutcome,
  Transport,
} from "./provider";
