import "server-only";

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { isDeployedRuntime } from "@/lib/db/runtime-target";

import { isLoopbackBaseUrl, type EnvironmentSource } from "./config";
import type { MessageKind, Transport } from "./provider";
import { isAlphanumericSender } from "./config";
import { MESSAGE_KINDS } from "./templates";

/**
 * The local delivery sink. LAN-169.
 *
 * ## What it is
 *
 * A `fetch`-shaped stand-in for Twilio's Messages API and Resend, used by a
 * local runtime and reachable from nowhere else. It accepts the **real**
 * payloads — not a simplified shape — validates each the way the provider
 * would, answers in the provider's own response shape, and writes every
 * rendered payload to disk so a developer can read what the club would
 * actually have said.
 *
 * Without it the whole of this mission is unreviewable locally: the ladder, the
 * escalation, the email fallback and the failure states all need messages to
 * have been sent, and the club has no Meta credentials on a developer machine
 * and must never have real ones there.
 *
 * ## Selected by runtime detection, never by a flag
 *
 * The same posture as `src/lib/db/runtime-target.ts`, and for the same reason:
 * configuration is the thing being defended against. If the sink were chosen by
 * `DELIVERY_SINK=on`, then setting that variable in a deployed revision would
 * silently stop the club's messages reaching anybody while every screen
 * reported them delivered — a failure whose whole symptom is the absence of one.
 *
 * So {@link selectDeliverySink} answers `null` for a deployed runtime and for
 * any deployment whose `APP_BASE_URL` is not loopback, and **there is no
 * variable that changes that answer**. `local-sink.test.ts` asserts exactly
 * that against a fully populated environment with a deployed-looking base URL,
 * which is the case an integration test cannot reach.
 *
 * A local runtime that genuinely wants to reach Meta — LAN-124's live-provider
 * proof — passes its own transport to `resolveDeliveryProvider`, which takes
 * precedence. That path is explicit at the call site rather than switched on by
 * the environment, which is the right way round.
 *
 * ## Why it validates rather than accepting anything
 *
 * Twilio refuses a malformed `To`, a sender that is not usable for the
 * destination, and an empty body. A sink that accepted anything would let a
 * `From` chosen for the wrong country pass every local test and fail for the
 * first time in front of a real phone. Validating the form here is what makes
 * the local environment tell the truth about a payload.
 */

/** The provider message-id prefix Twilio uses. Kept so callback matching is real. */
const SMS_SID_PREFIX = "SM";

/** Where the sink writes what it was asked to send. Ignored by git. */
export const SINK_DIRECTORY = path.join(".lancers-runtime", "delivery-sink");

/**
 * Recipients this sink refuses, so a failure can be reviewed.
 *
 * Read only inside the sink, which is already unreachable from a deployed
 * runtime — so this is a development affordance behind a runtime gate rather
 * than a flag that changes what a deployment does. W6 is unreviewable without
 * it: "a genuine failure" and "a text failure that email then carried" are
 * both states somebody has to be able to look at, and neither can be produced
 * by a sink that always succeeds. Applies to the text channel and to email.
 */
export const SINK_FAILURE_VARIABLE = "DELIVERY_SINK_FAILURES";

export interface SinkOptions {
  /** Where rendered payloads are written. Absolute, or relative to the process. */
  readonly directory?: string;
  /** Recipients the sink refuses, as raw values. */
  readonly failFor?: readonly string[];
  /** Called with each accepted send, so a caller can fire the callback back. */
  readonly onAccepted?: (record: SinkRecord) => void;
  /** Injected so a test can assert on what was written without touching disk. */
  readonly write?: (record: SinkRecord) => void;
}

export interface SinkRecord {
  readonly at: string;
  readonly channel: "sms" | "email";
  /**
   * For a text, read from the `kind` query parameter the adapter puts on its
   * `StatusCallback` URL; `unknown` when it names no declared kind. Never
   * guessed from the body.
   */
  readonly kind: MessageKind | "unknown";
  readonly providerMessageId: string;
  readonly recipient: string;
  readonly payload: unknown;
}

/** The sink's verdict on one payload, before anything is written. */
type Validation =
  | { readonly ok: true; readonly kind: MessageKind | "unknown"; readonly recipient: string }
  | { readonly ok: false; readonly code: number; readonly detail: string };

/**
 * Twilio's form body, validated the way Twilio would validate it.
 *
 * `To` must be E.164 with its `+`. `From` must be either a `+`-prefixed number
 * or an alphanumeric sender, and an alphanumeric sender is refused for a
 * North American destination — code 21212, which is exactly what Twilio
 * answers. `Body` must be present. `StatusCallback` must be an absolute URL,
 * because a message sent without one can never be confirmed delivered.
 */
function validateSms(form: Readonly<Record<string, string>>): Validation {
  const to = (form.To ?? "").trim();
  if (!/^\+\d{7,15}$/.test(to)) {
    return { ok: false, code: 21211, detail: "The 'To' number must be E.164 with a leading plus." };
  }
  const from = (form.From ?? "").trim();
  const numericFrom = /^\+\d{7,15}$/.test(from);
  if (!numericFrom && !isAlphanumericSender(from)) {
    return { ok: false, code: 21606, detail: "The 'From' sender is not a usable number or name." };
  }
  if (!numericFrom && /^\+1\d{10}$/.test(to)) {
    return {
      ok: false,
      code: 21212,
      detail: "An alphanumeric sender cannot deliver to a North American destination.",
    };
  }
  if ((form.Body ?? "").trim() === "") {
    return { ok: false, code: 21602, detail: "A message needs a body." };
  }
  let callback: URL;
  try {
    callback = new URL(form.StatusCallback ?? "");
    if (!["http:", "https:"].includes(callback.protocol)) throw new Error();
  } catch {
    return { ok: false, code: 21609, detail: "StatusCallback must be an absolute URL." };
  }
  const declared = callback.searchParams.get("kind") ?? "";
  const kind = (MESSAGE_KINDS as readonly string[]).includes(declared)
    ? (declared as MessageKind)
    : "unknown";
  return { ok: true, kind, recipient: to };
}

function validateEmail(payload: unknown): Validation {
  const body = payload as {
    from?: unknown;
    to?: unknown;
    subject?: unknown;
    text?: unknown;
  } | null;

  const to = Array.isArray(body?.to) ? body.to[0] : body?.to;
  if (typeof to !== "string" || !to.includes("@")) {
    return { ok: false, code: 422, detail: "An email needs a recipient address." };
  }
  if (typeof body?.from !== "string" || body.from.trim() === "") {
    return { ok: false, code: 422, detail: "An email needs a verified sending address." };
  }
  if (typeof body?.subject !== "string" || body.subject.trim() === "") {
    return { ok: false, code: 422, detail: "An email needs a subject." };
  }
  if (typeof body?.text !== "string" || body.text.trim() === "") {
    return { ok: false, code: 422, detail: "An email needs a body." };
  }

  // The kind is not recoverable from a rendered email — that is the honest
  // answer rather than a guess parsed out of the subject line.
  return { ok: true, kind: "invitation", recipient: to };
}

function twilioError(code: number, detail: string): Response {
  return new Response(
    JSON.stringify({
      code,
      message: detail,
      more_info: `https://www.twilio.com/docs/errors/${code}`,
      status: 400,
    }),
    { status: 400, headers: jsonHeaders() },
  );
}

function jsonHeaders(): Record<string, string> {
  return { "content-type": "application/json" };
}

function persist(record: SinkRecord, directory: string): void {
  try {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(
      path.join(directory, `${record.at.replace(/[:.]/g, "-")}-${record.providerMessageId}.json`),
      `${JSON.stringify(record, null, 2)}\n`,
      { mode: 0o600 },
    );
  } catch {
    // A sink that cannot write must still deliver. Losing the transcript costs
    // a developer a diagnostic; failing the send costs the whole local ladder,
    // and the local ladder is the thing this exists to make reviewable.
  }
}

/**
 * Builds the sink transport.
 *
 * Exported separately from {@link selectDeliverySink} so a test can drive it
 * directly without pretending to be a local runtime — and so the runtime gate
 * has exactly one implementation, in the selector, where it can be asserted on.
 */
export function createDeliverySink(
  source: EnvironmentSource = process.env,
  options: SinkOptions = {},
): Transport {
  const directory = options.directory ?? SINK_DIRECTORY;
  const failFor =
    options.failFor ??
    (source[SINK_FAILURE_VARIABLE] ?? "")
      .split(/[,;\s]+/)
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry !== "");

  return async (url: string, init: RequestInit): Promise<Response> => {
    const target = new URL(url);
    const isEmail = target.pathname.endsWith("/emails");
    const isSms = /^\/2010-04-01\/Accounts\/[^/]+\/Messages\.json$/.test(target.pathname);

    if (!isEmail && !isSms) {
      // Unrecognised, and refused rather than passed through to the network. A
      // sink that forwarded what it did not understand would be a local
      // environment that sometimes reaches the internet, which is the property
      // it exists to remove.
      return new Response(
        JSON.stringify({ error: { message: `The local delivery sink does not serve ${url}.` } }),
        { status: 404, headers: jsonHeaders() },
      );
    }

    let payload: unknown = null;
    if (isEmail) {
      try {
        payload = JSON.parse(typeof init.body === "string" ? init.body : "null");
      } catch {
        payload = null;
      }
    } else {
      const form: Record<string, string> = {};
      for (const [key, value] of new URLSearchParams(
        typeof init.body === "string" ? init.body : "",
      )) {
        form[key] = value;
      }
      payload = form;
    }

    const verdict = isEmail
      ? validateEmail(payload)
      : validateSms(payload as Readonly<Record<string, string>>);

    if (!verdict.ok) {
      return isEmail
        ? new Response(JSON.stringify({ message: verdict.detail, name: "validation_error" }), {
            status: 422,
            headers: jsonHeaders(),
          })
        : twilioError(verdict.code, verdict.detail);
    }

    if (failFor.includes(verdict.recipient.toLowerCase())) {
      return isEmail
        ? new Response(
            JSON.stringify({ message: "The local sink was asked to fail for this recipient." }),
            { status: 502, headers: jsonHeaders() },
          )
        : twilioError(21610, "The local sink was asked to fail for this recipient.");
    }

    const providerMessageId = isEmail
      ? crypto.randomUUID()
      : `${SMS_SID_PREFIX}${crypto.randomBytes(16).toString("hex")}`;

    const record: SinkRecord = {
      at: new Date().toISOString(),
      channel: isEmail ? "email" : "sms",
      kind: verdict.kind,
      providerMessageId,
      recipient: verdict.recipient,
      payload,
    };

    (options.write ?? ((entry: SinkRecord) => persist(entry, directory)))(record);
    options.onAccepted?.(record);

    return isEmail
      ? new Response(JSON.stringify({ id: providerMessageId }), {
          status: 200,
          headers: jsonHeaders(),
        })
      : new Response(
          JSON.stringify({
            sid: providerMessageId,
            status: "queued",
            to: verdict.recipient,
            from: (payload as Record<string, string>).From,
            error_code: null,
            error_message: null,
          }),
          { status: 201, headers: jsonHeaders() },
        );
  };
}

/**
 * The sink, or nothing at all.
 *
 * Two conditions, both necessary, and neither of them a setting:
 *
 *   * The process is not the deployed Cloud Run service. `K_SERVICE` is set by
 *     Cloud Run itself; it is not a value this repository supplies.
 *   * `APP_BASE_URL` is loopback. The base URL is the address the application
 *     tells the world to visit, so a deployment that has one cannot also be a
 *     loopback deployment.
 *
 * A deployed runtime therefore gets `null` however its environment is
 * populated, and `local-sink.test.ts` asserts that with every sink variable
 * set. There is deliberately no third branch and no variable that reaches one.
 */
export function selectDeliverySink(
  source: EnvironmentSource = process.env,
  options: SinkOptions = {},
): Transport | null {
  if (isDeployedRuntime(source)) return null;

  const appBaseUrl = (source.APP_BASE_URL ?? "").trim().replace(/\/+$/, "");
  if (!isLoopbackBaseUrl(appBaseUrl)) return null;

  return createDeliverySink(source, options);
}
