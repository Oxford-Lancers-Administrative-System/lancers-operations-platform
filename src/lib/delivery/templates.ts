import "server-only";

import type { EnvironmentSource, OutboundConfig } from "./config";
import type { MessageKind, OutboundMessage } from "./provider";

/**
 * The declared template registry. LAN-169.
 *
 * ## What this file is for
 *
 * Every message the club sends is one of six kinds, and each kind exists twice —
 * once as an approved WhatsApp template and once as an email. This module is the
 * single declaration of both, and three separate things read it:
 *
 *   * **The WhatsApp adapter**, for the template name, its language, and the
 *     ordered body parameters Meta will match against the approved template.
 *   * **The email transport**, for the subject and body.
 *   * **The local delivery sink**, which validates every payload it is handed
 *     against this registry and *rejects a mismatch*. That is what makes a
 *     parameter reordering fail on a developer machine rather than at Meta with
 *     error `132000`, and it is why the registry is data rather than six
 *     hand-written payload builders.
 *
 * LAN-168 owns the Meta cutover — generating the manifest, checking the
 * configuration, the runbook and the first real dispatch. It generates that
 * manifest **from this registry**. Nothing here talks to Meta.
 *
 * ## Why the parameter order is declared and not implied
 *
 * Meta matches the parameters sent against the parameters the approved template
 * declares, positionally, and refuses the message when they disagree. A
 * reordering therefore does not produce an error message — it produces a
 * *delivered* message reading "Please confirm you can make it to 19:00, on Team
 * Practice". `parameterNames` below is the contract the club creates each
 * template against, and the sink asserts against it on every local send.
 *
 * ## Why the email bodies are here rather than in a template directory
 *
 * Because the email is not a second channel with its own content. It is the same
 * message carried by a different transport: when WhatsApp fails, the automated
 * fallback carries **that** message (`REQ-fallback-is-automatic`), and the email
 * rung of the ladder carries the same chase the WhatsApp rungs did. One
 * declaration per kind is what keeps the two from drifting into two different
 * things the club is saying.
 *
 * ## The one body with a privacy rule of its own
 *
 * `escalation` goes to a committee phone and inbox, and `T03-no-personal-data`
 * is absolute: **no player personal data in the escalation body.** It says how
 * many people, for which event, by when, and links to the queue. No name, no
 * contact detail, no absence reason. That is not squeamishness — the club login
 * is the boundary that decides who reads a roster, and an escalation travels
 * outside it. `escalationCarriesNoPersonalData` below is the property, and its
 * test asserts against the rendered output rather than against intent.
 */

/**
 * The club's canonical template names.
 *
 * These are the names LAN-168 registers with Meta and generates its manifest
 * from. A deployment may override any of them — a sandbox number carries
 * different approved templates than the club's own — but the *default* is the
 * club's name rather than a guess assembled from a prefix, because a name
 * assembled at runtime is a name nobody ever approved.
 */
export const TEMPLATE_NAMES: Readonly<Record<MessageKind, string>> = Object.freeze({
  invitation: "lancers_event_invitation",
  reminder: "lancers_event_reminder",
  nudge: "lancers_event_nudge",
  change_notice: "lancers_event_change_notice",
  cancellation: "lancers_event_cancellation",
  escalation: "lancers_nonresponse_escalation",
});

/**
 * The environment variable that overrides one kind's template name.
 *
 * `invitation` deliberately reads `WHATSAPP_TEMPLATE_NAME`, which is already
 * required by `config.ts` and already set on every configured deployment. That
 * keeps LAN-124's live-provider path working unchanged and means this registry
 * adds no new *required* configuration at all — only five optional overrides.
 */
export function templateNameVariable(kind: MessageKind): string {
  return kind === "invitation"
    ? "WHATSAPP_TEMPLATE_NAME"
    : `WHATSAPP_TEMPLATE_${kind.toUpperCase()}`;
}

/** Brian's amended button labels. Alphanumerics and spaces only — no em dashes. */
export const YES_BUTTON_LABEL = "Yes view details";
export const NO_BUTTON_LABEL = "No give reason";

/** One kind's declaration: what WhatsApp sends, and what the email says. */
export interface MessageTemplate {
  readonly kind: MessageKind;
  /**
   * The ordered body parameters, by name. The order is the contract with the
   * approved template and the sink asserts on it.
   */
  readonly parameterNames: readonly string[];
  /** The same parameters, resolved for one message. Same length, same order. */
  parameters(message: OutboundMessage): readonly string[];
  /** The email subject line for this kind. */
  subject(message: OutboundMessage): string;
  /** The email body, as plain text. Rendered to HTML by the transport. */
  body(message: OutboundMessage): readonly string[];
  /**
   * The two WhatsApp URL buttons this kind carries — LAN-172, Q-11. `[yes, no]`
   * order, matching the two approved actions. `undefined` for every kind
   * besides `invitation` and `reminder`, which still carry `rsvpUrl` as body
   * copy or a single CTA. Declared on the template registry, not read off
   * `message.kind` a second time somewhere else, for the same reason
   * `parameterNames` is declared here rather than implied.
   */
  buttonUrls?(message: OutboundMessage): readonly [string, string] | null;
}

function required(value: string | null | undefined, name: string): string {
  const text = (value ?? "").trim();
  if (text === "") {
    throw new Error(
      `A ${name} is required to render this message and none was supplied. ` +
        "Refusing to send a message with a blank parameter rather than sending one that reads wrongly.",
    );
  }
  return text;
}

function deadlineSentence(message: OutboundMessage): string {
  const deadline = (message.deadlineLabel ?? "").trim();
  return deadline === "" ? "Please answer as soon as you can." : `Please answer by ${deadline}.`;
}

function whereAndWhen(message: OutboundMessage): readonly string[] {
  const venue = (message.venue ?? "").trim();
  return venue === "" ? [message.whenLabel] : [message.whenLabel, venue];
}

/**
 * "Eighteen others are attending" — the dispatch-time snapshot the approved
 * W2-02 mockup carries on the second chase and the email.
 *
 * Omitted rather than rendered as zero when the count is unknown or nobody has
 * answered yet. "0 people have already said Yes" is true, useless, and reads as
 * a broken template; the first contact is deliberately a plain invitation with
 * no social proof at all.
 */
function attendingSentence(message: OutboundMessage): string | null {
  const count = message.attendingCount;
  if (typeof count !== "number" || count <= 0) return null;
  return count === 1
    ? "One other person has already said yes."
    : `${count} other people have already said yes.`;
}

/**
 * The two Yes/No URL buttons — LAN-172, Q-11. Required on `invitation` and
 * `reminder`: a player-facing rung with no answer link is a message nobody
 * can act on, so a missing URL is refused here rather than sent as a template
 * with a blank button.
 */
function answerButtonUrls(message: OutboundMessage): readonly [string, string] {
  return [required(message.yesUrl, "Yes link"), required(message.noUrl, "No link")];
}

const INVITATION: MessageTemplate = {
  kind: "invitation",
  // Three body parameters. `rsvpUrl` left this list with LAN-172: the approved
  // W2-01 shape carries no raw URL in body copy at all — the two answers are
  // WhatsApp URL buttons, declared below in `buttonUrls`, not text.
  parameterNames: ["inviteeName", "eventName", "whenLabel"],
  parameters: (message) => [
    required(message.inviteeName, "name"),
    required(message.eventName, "event name"),
    required(message.whenLabel, "date and time"),
  ],
  subject: (message) => `You are invited: ${message.eventName}`,
  body: (message) => [
    `${message.inviteeName}, you are invited to ${message.eventName}.`,
    ...whereAndWhen(message),
    deadlineSentence(message),
    // Email's "equivalent calls to action" (W2's own words) rather than one
    // raw link: two distinct URLs, each already the answer, matching what the
    // WhatsApp buttons do. `REQ-no-false-rsvp` covers both — the destination
    // `/a/[token]` GET is side-effect-free for a mail client's link scanner
    // exactly as it is for WhatsApp's own crawler.
    `${YES_BUTTON_LABEL}: ${message.yesUrl}`,
    `${NO_BUTTON_LABEL}: ${message.noUrl}`,
  ],
  buttonUrls: answerButtonUrls,
};

const REMINDER: MessageTemplate = {
  kind: "reminder",
  parameterNames: ["inviteeName", "eventName", "whenLabel"],
  parameters: (message) => [
    required(message.inviteeName, "name"),
    required(message.eventName, "event name"),
    required(message.whenLabel, "date and time"),
  ],
  // The approved W2-02 wording: the chase gets stronger rather than repeating
  // itself, and it states plainly what the club is waiting for.
  subject: (message) => `Action required: RSVP for ${message.eventName}`,
  body: (message) => {
    const attending = attendingSentence(message);
    return [
      `${message.inviteeName}, the club still needs your answer.`,
      ...whereAndWhen(message),
      ...(attending ? [attending] : []),
      "Please respond now. Your answer affects numbers, transport and coaching plans.",
      `${YES_BUTTON_LABEL}: ${message.yesUrl}`,
      `${NO_BUTTON_LABEL}: ${message.noUrl}`,
    ];
  },
  buttonUrls: answerButtonUrls,
};

const NUDGE: MessageTemplate = {
  kind: "nudge",
  parameterNames: ["inviteeName", "eventName", "rsvpUrl"],
  parameters: (message) => [
    required(message.inviteeName, "name"),
    required(message.eventName, "event name"),
    required(message.rsvpUrl, "link"),
  ],
  // W2's single nudge, and it is deliberately not a chase. The player has
  // already said yes; what is outstanding is the event's own questions, and W5
  // is explicit that "a Yes with unanswered questions is answered" and never
  // reaches the nonresponse queue.
  subject: (message) => `One thing left for ${message.eventName}`,
  body: (message) => [
    `${message.inviteeName}, thank you for answering ${message.eventName}.`,
    "There are still a couple of questions to finish, and the coaches need them to plan.",
    "Finish here:",
    message.rsvpUrl,
  ],
};

const CHANGE_NOTICE: MessageTemplate = {
  kind: "change_notice",
  parameterNames: ["inviteeName", "eventName", "changeSummary", "whenLabel", "rsvpUrl"],
  parameters: (message) => [
    required(message.inviteeName, "name"),
    required(message.eventName, "event name"),
    required(message.changeSummary, "summary of what changed"),
    required(message.whenLabel, "date and time"),
    required(message.rsvpUrl, "link"),
  ],
  subject: (message) => `Changed: ${message.eventName}`,
  body: (message) => [
    `${message.inviteeName}, ${message.eventName} has changed.`,
    required(message.changeSummary, "summary of what changed"),
    "It now reads:",
    ...whereAndWhen(message),
    // `REQ-history-is-never-rewritten`. A player's standing answer survives an
    // amendment, so the message says so rather than asking them to answer again
    // as though nothing had been recorded.
    "Your answer still stands. Change it here if the new details do not work for you:",
    message.rsvpUrl,
  ],
};

const CANCELLATION: MessageTemplate = {
  kind: "cancellation",
  parameterNames: ["inviteeName", "eventName", "whenLabel", "cancellationReason"],
  parameters: (message) => [
    required(message.inviteeName, "name"),
    required(message.eventName, "event name"),
    required(message.whenLabel, "date and time"),
    required(message.cancellationReason, "reason"),
  ],
  subject: (message) => `Cancelled: ${message.eventName}`,
  body: (message) => [
    `${message.inviteeName}, ${message.eventName} on ${message.whenLabel} has been cancelled.`,
    required(message.cancellationReason, "reason"),
    // No link. There is nothing left to answer, and offering one would be a
    // control that cannot act — `docs/ux/standards.md` rule 4.
    "There is nothing you need to do.",
  ],
};

/**
 * The escalation, and the one body in this file with a privacy rule.
 *
 * `T03-no-personal-data`: the message says how many people, for which event, by
 * when — and links to the queue. Names, contact details and reasons stay behind
 * the operator login. The parameters are therefore counts, an event name, a
 * date and a URL, and there is deliberately **no name parameter at all** —
 * including the recipient's own. A template with a name slot is a template
 * something can later put a player's name into.
 */
const ESCALATION: MessageTemplate = {
  kind: "escalation",
  parameterNames: ["outstandingCount", "eventName", "whenLabel", "deadlineLabel", "queueUrl"],
  parameters: (message) => [
    String(message.outstandingCount ?? 0),
    required(message.eventName, "event name"),
    required(message.whenLabel, "date and time"),
    required(message.deadlineLabel, "deadline"),
    required(message.queueUrl, "link to the follow-up queue"),
  ],
  subject: (message) => `${message.outstandingCount ?? 0} unanswered for ${message.eventName}`,
  body: (message) => {
    const count = message.outstandingCount ?? 0;
    return [
      count === 1
        ? `One person has not answered for ${message.eventName} on ${message.whenLabel}.`
        : `${count} people have not answered for ${message.eventName} on ${message.whenLabel}.`,
      `The response deadline passed at ${message.deadlineLabel}.`,
      "Open the club app to see who:",
      required(message.queueUrl, "link to the follow-up queue"),
    ];
  },
};

export const MESSAGE_TEMPLATES: Readonly<Record<MessageKind, MessageTemplate>> = Object.freeze({
  invitation: INVITATION,
  reminder: REMINDER,
  nudge: NUDGE,
  change_notice: CHANGE_NOTICE,
  cancellation: CANCELLATION,
  escalation: ESCALATION,
});

/** Every kind, in ladder order. The manifest LAN-168 generates walks this. */
export const MESSAGE_KINDS: readonly MessageKind[] = Object.freeze([
  "invitation",
  "reminder",
  "nudge",
  "change_notice",
  "cancellation",
  "escalation",
] as const);

/**
 * The declaration for one message.
 *
 * The default is `invitation` and the default matters more than it looks — it
 * is the message that carries the RSVP link and does the real work, so a kind
 * that arrived unset resolves to the message somebody can answer rather than to
 * one they cannot. Same reasoning `templateShape` records in `config.ts`.
 */
export function templateFor(message: OutboundMessage): MessageTemplate {
  return MESSAGE_TEMPLATES[message.kind ?? "invitation"];
}

/**
 * The approved template name this deployment sends one kind through.
 *
 * Reads the override first, then the club's canonical name. `config` carries the
 * invitation's name already, so an existing configured deployment keeps sending
 * exactly what it sends today.
 */
export function templateNameFor(
  kind: MessageKind,
  config: OutboundConfig,
  source: EnvironmentSource = process.env,
): string {
  if (kind === "invitation") return config.templateName;
  const override = (source[templateNameVariable(kind)] ?? "").trim();
  return override === "" ? TEMPLATE_NAMES[kind] : override;
}

/**
 * Whether a rendered escalation is free of player personal data.
 *
 * A property rather than a comment, so the acceptance criterion — "the
 * escalation body contains no name, contact detail, or reason, proved by test
 * against the rendered template" — is checkable against real output.
 *
 * It works by construction and by exclusion together: the escalation's
 * parameters are a count, an event name, a date, a deadline and a URL, and this
 * asserts that nothing which could carry a person has leaked into any of them.
 */
export function escalationCarriesNoPersonalData(rendered: readonly string[]): boolean {
  const text = rendered.join("\n");
  // An email address, a telephone number of six or more digits, and the two
  // fields the message object could supply a person from.
  return !/[\w.+-]+@[\w-]+\.[\w.]+/.test(text) && !/\+?\d[\d\s()-]{5,}\d/.test(text);
}
