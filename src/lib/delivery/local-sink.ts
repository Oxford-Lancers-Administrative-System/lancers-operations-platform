import "server-only";

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { isDeployedRuntime } from "@/lib/db/runtime-target";

import { isLoopbackBaseUrl, type EnvironmentSource } from "./config";
import type { MessageKind, Transport } from "./provider";
import {
  MESSAGE_KINDS,
  MESSAGE_TEMPLATES,
  templateNameVariable,
  TEMPLATE_NAMES,
} from "./templates";

/**
 * The local delivery sink. LAN-169.
 *
 * ## What it is
 *
 * A `fetch`-shaped stand-in for Meta's Graph API and Resend, used by a local
 * runtime and reachable from nowhere else. It accepts the **real** payloads —
 * not a simplified shape — validates each against the declared template
 * registry, rejects a mismatch the way Meta would, answers in Meta's own
 * response shape, fires the delivery webhook back a moment later, and writes
 * every rendered payload to disk so a developer can read what the club would
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
 * Meta matches the parameters sent against the parameters the approved template
 * declares and answers `132000` when they disagree. A sink that accepted
 * anything would let a parameter reordering pass every local test and every
 * visual review, and fail for the first time in front of the club — or worse,
 * succeed, and deliver a correctly-formatted message with its sentences in the
 * wrong order. Validating against `./templates.ts` is what makes the local
 * environment tell the truth about a payload.
 */

/** The provider message-id prefix Meta uses. Kept so callback matching is real. */
const WAMID_PREFIX = "wamid.";

/** Where the sink writes what it was asked to send. Ignored by git. */
export const SINK_DIRECTORY = path.join(".lancers-runtime", "delivery-sink");

/**
 * Recipients this sink refuses, so a failure can be reviewed.
 *
 * Read only inside the sink, which is already unreachable from a deployed
 * runtime — so this is a development affordance behind a runtime gate rather
 * than a flag that changes what a deployment does. W6 is unreviewable without
 * it: "a genuine failure" and "a WhatsApp failure that email then carried" are
 * both states somebody has to be able to look at, and neither can be produced
 * by a sink that always succeeds.
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
  readonly channel: "whatsapp" | "email";
  readonly kind: MessageKind | "unknown";
  readonly providerMessageId: string;
  readonly recipient: string;
  readonly payload: unknown;
}

/** The sink's verdict on one payload, before anything is written. */
type Validation =
  | { readonly ok: true; readonly kind: MessageKind; readonly recipient: string }
  | { readonly ok: false; readonly code: number; readonly detail: string };

/**
 * Every template name this deployment could legitimately send, mapped to its kind.
 *
 * Built from the registry and the deployment's own overrides rather than from
 * the canonical names alone, because a sandbox number carries different
 * approved templates and the sink must not reject a name the adapter was
 * correctly configured to send.
 */
function templateNameIndex(source: EnvironmentSource): ReadonlyMap<string, MessageKind> {
  const index = new Map<string, MessageKind>();
  for (const kind of MESSAGE_KINDS) {
    index.set(TEMPLATE_NAMES[kind], kind);
    const override = (source[templateNameVariable(kind)] ?? "").trim();
    if (override !== "") index.set(override, kind);
  }
  return index;
}

function validateWhatsApp(payload: unknown, source: EnvironmentSource): Validation {
  const body = payload as {
    messaging_product?: unknown;
    to?: unknown;
    type?: unknown;
    template?: {
      name?: unknown;
      language?: { code?: unknown };
      components?: {
        type?: unknown;
        sub_type?: unknown;
        index?: unknown;
        parameters?: unknown[];
      }[];
    };
    text?: { body?: unknown };
  } | null;

  if (body?.messaging_product !== "whatsapp") {
    return { ok: false, code: 100, detail: "messaging_product must be 'whatsapp'." };
  }
  const recipient = typeof body.to === "string" ? body.to : "";
  if (!/^\d{6,20}$/.test(recipient)) {
    return {
      ok: false,
      code: 131_026,
      detail: "The recipient must be E.164 digits with no leading plus.",
    };
  }

  // LAN-124's free-form text mode. It carries no template and therefore has
  // nothing to validate against the registry; it is accepted as an invitation
  // because that is the only message that mode was ever built to prove.
  if (body.type === "text") {
    if (typeof body.text?.body !== "string" || body.text.body.trim() === "") {
      return { ok: false, code: 100, detail: "A text message needs a body." };
    }
    return { ok: true, kind: "invitation", recipient };
  }

  if (body.type !== "template") {
    return { ok: false, code: 100, detail: "Only 'template' and 'text' messages are sent." };
  }

  const name = typeof body.template?.name === "string" ? body.template.name : "";
  const kind = templateNameIndex(source).get(name);
  if (!kind) {
    return {
      ok: false,
      code: 132_001,
      detail:
        `Template "${name}" does not exist in this deployment's registry. ` +
        "Declare it in src/lib/delivery/templates.ts before sending it.",
    };
  }

  if (typeof body.template?.language?.code !== "string") {
    return { ok: false, code: 132_000, detail: "A template message needs a language code." };
  }

  const declared = MESSAGE_TEMPLATES[kind].parameterNames;
  const component = body.template.components?.find((entry) => entry.type === "body");
  const sent = component?.parameters ?? [];

  // The parameterless shape — `hello_world` and anything else that declares no
  // body parameters — is legitimate and is recognised by the absence of the
  // `components` key, exactly as `buildMessageBody` builds it.
  if (body.template.components === undefined) {
    return { ok: true, kind, recipient };
  }

  if (sent.length !== declared.length) {
    return {
      ok: false,
      // Meta's own code for "the parameters do not match the template".
      code: 132_000,
      detail:
        `Template "${name}" declares ${declared.length} body parameters ` +
        `(${declared.join(", ")}) and this message carried ${sent.length}.`,
    };
  }

  const blank = sent.findIndex(
    (parameter) =>
      typeof (parameter as { text?: unknown })?.text !== "string" ||
      ((parameter as { text: string }).text ?? "").trim() === "",
  );
  if (blank !== -1) {
    return {
      ok: false,
      code: 132_000,
      detail: `Body parameter ${blank + 1} (${declared[blank]}) is blank.`,
    };
  }

  // LAN-172, Q-11: `invitation` and `reminder` declare two URL buttons. The
  // registry is the one place that says which kinds do — checking
  // `buttonUrls` here rather than hard-coding the two names is what keeps this
  // validator honest if a future kind gains buttons of its own.
  if (typeof MESSAGE_TEMPLATES[kind].buttonUrls === "function") {
    const buttonError = validateAnswerButtons(name, body.template.components ?? []);
    if (buttonError) return buttonError;
  }

  return { ok: true, kind, recipient };
}

function validateAnswerButtons(
  templateName: string,
  components: readonly {
    type?: unknown;
    sub_type?: unknown;
    index?: unknown;
    parameters?: unknown[];
  }[],
): Validation | null {
  for (const expectedIndex of ["0", "1"] as const) {
    const component = components.find(
      (entry) => entry.type === "button" && String(entry.index) === expectedIndex,
    );
    if (!component) {
      return {
        ok: false,
        code: 132_000,
        detail: `Template "${templateName}" declares two URL buttons and button ${expectedIndex} was not sent.`,
      };
    }
    if (component.sub_type !== "url") {
      return {
        ok: false,
        code: 132_000,
        detail: `Button ${expectedIndex} on "${templateName}" must be a URL button, not a Quick Reply.`,
      };
    }
    const suffix = component.parameters?.[0] as { text?: unknown } | undefined;
    if (typeof suffix?.text !== "string" || suffix.text.trim() === "") {
      return {
        ok: false,
        code: 132_000,
        detail: `Button ${expectedIndex} on "${templateName}" carries no dynamic URL suffix.`,
      };
    }
  }
  return null;
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
  // answer rather than a guess parsed out of the subject line — so the record
  // says so and the registry check that matters has already happened on the
  // WhatsApp side of the same message.
  return { ok: true, kind: "invitation", recipient: to };
}

function metaError(code: number, detail: string): Response {
  return new Response(
    JSON.stringify({
      error: {
        message: detail,
        type: "OAuthException",
        code,
        fbtrace_id: `sink-${crypto.randomUUID().slice(0, 12)}`,
      },
    }),
    { status: code === 132_000 || code === 132_001 ? 400 : 400, headers: jsonHeaders() },
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
    const isWhatsApp = /\/v\d+\.\d+\/[^/]+\/messages$/.test(target.pathname);

    if (!isEmail && !isWhatsApp) {
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
    try {
      payload = JSON.parse(typeof init.body === "string" ? init.body : "null");
    } catch {
      payload = null;
    }

    const verdict = isEmail ? validateEmail(payload) : validateWhatsApp(payload, source);

    if (!verdict.ok) {
      return isEmail
        ? new Response(JSON.stringify({ message: verdict.detail, name: "validation_error" }), {
            status: 422,
            headers: jsonHeaders(),
          })
        : metaError(verdict.code, verdict.detail);
    }

    if (failFor.includes(verdict.recipient.toLowerCase())) {
      return isEmail
        ? new Response(
            JSON.stringify({ message: "The local sink was asked to fail for this recipient." }),
            { status: 502, headers: jsonHeaders() },
          )
        : metaError(131_047, "The local sink was asked to fail for this recipient.");
    }

    const providerMessageId = isEmail
      ? crypto.randomUUID()
      : `${WAMID_PREFIX}${crypto.randomBytes(16).toString("base64url")}`;

    const record: SinkRecord = {
      at: new Date().toISOString(),
      channel: isEmail ? "email" : "whatsapp",
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
            messaging_product: "whatsapp",
            contacts: [{ input: verdict.recipient, wa_id: verdict.recipient }],
            messages: [{ id: providerMessageId, message_status: "accepted" }],
          }),
          { status: 200, headers: jsonHeaders() },
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
