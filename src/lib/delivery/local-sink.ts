import "server-only";

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { isDeployedRuntime } from "@/lib/db/runtime-target";
import { RESEND_ENCODED_EMAIL_LIMIT_BYTES } from "@/lib/services/club-message-input";

import { isLoopbackBaseUrl, type EnvironmentSource } from "./config";
import {
  base64FileSink,
  isSpooledAttachment,
  StreamingJsonParser,
  type SpooledAttachment,
} from "./local-sink-body";
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

  // LAN-508. A template whose header is an image must carry it, by media id,
  // exactly as Meta requires; one without must carry no header at all.
  {
    const headers = (body.template.components ?? []).filter((entry) => entry.type === "header");
    if (MESSAGE_TEMPLATES[kind].headerImage) {
      const image = (headers[0]?.parameters?.[0] ?? null) as {
        type?: unknown;
        image?: { id?: unknown };
      } | null;
      if (
        headers.length !== 1 ||
        image?.type !== "image" ||
        typeof image.image?.id !== "string" ||
        image.image.id.trim() === ""
      ) {
        return {
          ok: false,
          code: 132_000,
          detail: `Template "${name}" has an image header and this message carried no uploaded image.`,
        };
      }
    } else if (headers.length > 0) {
      return {
        ok: false,
        code: 132_000,
        detail: `Template "${name}" has no header and this message carried one.`,
      };
    }
  }

  // LAN-172, Q-11, LAN-348: eleven of the fourteen approved templates declare
  // URL buttons — eight with one, three with a Yes/No pair. The registry is the
  // one place that says how many each carries, and reading `buttonCount` here
  // rather than hard-coding names is what keeps this validator honest when a
  // template's buttons change. A kind that declares none must send none.
  {
    const buttonError = validateAnswerButtons(
      name,
      body.template.components ?? [],
      MESSAGE_TEMPLATES[kind].buttonCount ?? 0,
    );
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
  count: number,
): Validation | null {
  if (components.filter((c) => c.type === "button").length !== count)
    return {
      ok: false,
      code: 132_000,
      detail: `Template "${templateName}" requires exactly ${count} URL buttons.`,
    };
  for (const expectedIndex of Array.from({ length: count }, (_, i) => String(i))) {
    const component = components.find(
      (entry) => entry.type === "button" && String(entry.index) === expectedIndex,
    );
    if (!component) {
      return {
        ok: false,
        code: 132_000,
        detail: `Template "${templateName}" declares ${count} URL buttons and button ${expectedIndex} was not sent.`,
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

  // LAN-514. Resend's attachment shape and its 40 MB ceiling after encoding,
  // refused here the way Resend would refuse them.
  const attachments = (payload as { attachments?: unknown }).attachments;
  if (attachments !== undefined) {
    if (!Array.isArray(attachments)) {
      return { ok: false, code: 422, detail: "Attachments must be a list." };
    }
    let encoded = 0;
    for (const attachment of attachments as { filename?: unknown; content?: unknown }[]) {
      if (typeof attachment?.filename !== "string" || attachment.filename.trim() === "") {
        return { ok: false, code: 422, detail: "Every attachment needs a filename." };
      }
      // A streamed body's content was decoded to disk as it arrived.
      if (isSpooledAttachment(attachment.content)) {
        if (!attachment.content.validBase64) {
          return { ok: false, code: 422, detail: "Every attachment needs its content as base64." };
        }
        encoded += attachment.content.encodedLength;
        continue;
      }
      if (
        typeof attachment.content !== "string" ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(attachment.content)
      ) {
        return { ok: false, code: 422, detail: "Every attachment needs its content as base64." };
      }
      encoded += attachment.content.length;
    }
    if (encoded > RESEND_ENCODED_EMAIL_LIMIT_BYTES) {
      return {
        ok: false,
        code: 422,
        detail: "The email is larger than 40 MB after encoding, which Resend refuses.",
      };
    }
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

/**
 * LAN-514. An email's HTML and its attachments, written beside its record as
 * files so a reviewer can open what the club sent; the record keeps each
 * attachment's name, size and where it was saved instead of a wall of base64.
 */
export function persistAttachments(
  record: SinkRecord,
  directory: string,
  stem: string,
): SinkRecord {
  const payload = record.payload as {
    html?: unknown;
    attachments?: { filename: string; content: string | SpooledAttachment }[];
  };
  if (record.channel !== "email") return record;
  // The rendered email too, so it opens in a browser as the recipient sees it.
  if (typeof payload?.html === "string") {
    fs.writeFileSync(path.join(directory, `${stem}.html`), payload.html, { mode: 0o600 });
  }
  if (!Array.isArray(payload?.attachments)) return record;
  const folder = path.join(directory, `${stem}-attachments`);
  fs.mkdirSync(folder, { recursive: true });
  const saved = payload.attachments.map((attachment, index) => {
    const name = `${index + 1}-${path.basename(attachment.filename).replace(/[^\w. -]+/g, "_")}`;
    const savedAs = path.join(folder, name);
    if (isSpooledAttachment(attachment.content)) {
      fs.renameSync(attachment.content.spooledTo, savedAs);
      return { filename: attachment.filename, bytes: attachment.content.bytes, savedAs };
    }
    const bytes = Buffer.from(attachment.content, "base64");
    fs.writeFileSync(savedAs, bytes, { mode: 0o600 });
    return { filename: attachment.filename, bytes: bytes.length, savedAs };
  });
  return { ...record, payload: { ...payload, attachments: saved } };
}

function persist(record: SinkRecord, directory: string): void {
  try {
    fs.mkdirSync(directory, { recursive: true });
    const stem = `${record.at.replace(/[:.]/g, "-")}-${record.providerMessageId}`;
    fs.writeFileSync(
      path.join(directory, `${stem}.json`),
      `${JSON.stringify(persistAttachments(record, directory, stem), null, 2)}\n`,
      { mode: 0o600 },
    );
  } catch {
    // A sink that cannot write must still deliver. Losing the transcript costs
    // a developer a diagnostic; failing the send costs the whole local ladder,
    // and the local ladder is the thing this exists to make reviewable.
  }
}

/**
 * LAN-514. The emails this process's sink accepted under an `Idempotency-Key`,
 * so a retried attempt is answered the way Resend answers it. Held for the
 * process's life; a local process does not live the 24 hours Resend keeps one.
 */
const SINK_IDEMPOTENCY = new Map<string, { readonly id: string; readonly digest: string }>();

function headerOf(init: RequestInit, name: string): string | null {
  return new Headers(init.headers).get(name);
}

/**
 * The request body parsed, whether it came as a string or a stream, its
 * SHA-256 (for the idempotency check), and whether a declared
 * `Content-Length` matched it. A streamed body is parsed as it arrives, with
 * each attachment's base64 decoded straight to a file under `spoolDirectory`
 * (`./local-sink-body.ts`), so the sink holds no whole file either.
 */
async function readSinkBody(
  init: RequestInit,
  spoolDirectory: string,
  spooled: string[],
): Promise<{
  readonly payload: unknown;
  readonly digest: string;
  readonly lengthMismatch: boolean;
}> {
  const hash = crypto.createHash("sha256");
  const declared = headerOf(init, "content-length");
  if (init.body === undefined || init.body === null || typeof init.body === "string") {
    const text = typeof init.body === "string" ? init.body : "";
    const bytes = Buffer.from(text, "utf8");
    let payload: unknown = null;
    try {
      payload = JSON.parse(text === "" ? "null" : text);
    } catch {
      payload = null;
    }
    return {
      payload,
      digest: hash.update(bytes).digest("hex"),
      lengthMismatch: declared !== null && Number(declared) !== bytes.length,
    };
  }

  fs.mkdirSync(spoolDirectory, { recursive: true });
  const parser = new StreamingJsonParser((at) => {
    if (at.length !== 3 || at[0] !== "attachments" || at[2] !== "content") return null;
    const file = path.join(spoolDirectory, `${crypto.randomUUID()}.part`);
    spooled.push(file);
    return base64FileSink(file);
  });
  let length = 0;
  let parsed = true;
  const reader = new Response(init.body).body?.getReader();
  for (;;) {
    const next = reader ? await reader.read() : { done: true as const, value: undefined };
    if (next.done) break;
    length += next.value.byteLength;
    hash.update(next.value);
    if (parsed) {
      try {
        parser.write(next.value);
      } catch {
        parsed = false;
      }
    }
  }
  let payload: unknown = null;
  if (parsed) {
    try {
      payload = parser.end();
    } catch {
      payload = null;
    }
  }
  return {
    payload,
    digest: hash.digest("hex"),
    lengthMismatch: declared !== null && Number(declared) !== length,
  };
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
    const isMedia = /\/v\d+\.\d+\/[^/]+\/media$/.test(target.pathname);

    // LAN-508. The brief's image header is uploaded before the message that
    // names it. The sink keeps nothing: it checks there is a PNG and answers
    // with an id, which the message's header then has to carry.
    if (isMedia) {
      const file = init.body instanceof FormData ? init.body.get("file") : null;
      if (!(file instanceof Blob) || file.type !== "image/png" || file.size === 0) {
        return metaError(100, "A media upload needs a PNG file.");
      }
      return new Response(JSON.stringify({ id: `sink-media-${crypto.randomUUID()}` }), {
        status: 200,
        headers: jsonHeaders(),
      });
    }

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

    // LAN-514. An email with attachments arrives as a stream at a declared
    // length; a body that is not that length is refused, as an HTTP server
    // would refuse it.
    const spooled: string[] = [];
    try {
      return await respond(init, isEmail, spooled);
    } finally {
      // Whatever was not kept as a delivered email's attachment.
      for (const file of spooled) fs.rmSync(file, { force: true });
    }
  };

  async function respond(
    init: RequestInit,
    isEmail: boolean,
    spooled: string[],
  ): Promise<Response> {
    const received = await readSinkBody(init, path.join(directory, ".spool"), spooled);
    if (received.lengthMismatch) {
      return new Response(
        JSON.stringify({
          message: "The request body was not the length its Content-Length declared.",
          name: "validation_error",
        }),
        { status: 400, headers: jsonHeaders() },
      );
    }

    const payload = received.payload;

    // LAN-514. Resend's `Idempotency-Key`: the same key and the same body
    // answer with the first email and send nothing; the same key with a
    // different body is Resend's 409 `invalid_idempotent_request`.
    const idempotencyKey = isEmail ? headerOf(init, "idempotency-key") : null;
    const digest = received.digest;
    if (idempotencyKey) {
      const earlier = SINK_IDEMPOTENCY.get(idempotencyKey);
      if (earlier && earlier.digest === digest) {
        return new Response(JSON.stringify({ id: earlier.id }), {
          status: 200,
          headers: jsonHeaders(),
        });
      }
      if (earlier) {
        return new Response(
          JSON.stringify({
            statusCode: 409,
            name: "invalid_idempotent_request",
            message:
              "This idempotency key has been used with this HTTP method and endpoint within the last 24 hours, but the request body was modified and doesn't match the original request.",
          }),
          { status: 409, headers: jsonHeaders() },
        );
      }
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
    if (idempotencyKey) SINK_IDEMPOTENCY.set(idempotencyKey, { id: providerMessageId, digest });

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
  }
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
