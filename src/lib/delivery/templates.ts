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
  // LAN-199's own manifest names these four (plus the fifth, off-by-default
  // one) exactly, with the `_v1` suffix — the club's real submission to Meta,
  // not a name this module assembles. Unlike the six above, there is no
  // club-prefixed default to fall back to if the override is unset: LAN-199's
  // names ARE the default.
  recruit_event_followup: "recruit_event_followup_v1",
  recruit_welcome: "recruit_welcome_v1",
  recruit_details_reminder: "recruit_details_reminder_v1",
  recruit_interest_ask: "recruit_interest_ask_v1",
  recruit_interest_reminder: "recruit_interest_reminder_v1",
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
export const FINISH_ANSWERS_LABEL = "Finish your answers";
export const VIEW_EVENT_LABEL = "View the event";
export const OPEN_FOLLOW_UPS_LABEL = "Open follow ups";

/**
 * LAN-199's own recruit button labels, verbatim — alphanumerics and spaces
 * only, no em dashes (Q-10, carried from LAN-168). `recruit_event_followup`'s
 * yes/no pair reads differently from the player ladder's own
 * (`YES_BUTTON_LABEL`/`NO_BUTTON_LABEL`) because it is a different template a
 * recruit reads, never asking them to "give a reason" — `REQ-no-reason-asked`.
 */
export const RECRUIT_FILL_IN_DETAILS_LABEL = "Fill in your details";
export const RECRUIT_STOP_MESSAGES_LABEL = "Stop messages";
export const RECRUIT_ANSWER_QUESTIONS_LABEL = "Answer a few questions";
export const RECRUIT_YES_LABEL = "Yes I can come";
export const RECRUIT_NO_LABEL = "No thanks";

/**
 * Meta's two template categories.
 *
 * The category is submitted with the template and Meta re-checks it against the
 * message's actual content. Since 16 April 2025 a detected misclassification is
 * enforced immediately with no notice period, so this is declared per kind
 * rather than assumed for the account: the player ladder chases an arrangement
 * the person is already part of, and the recruit cycle does not.
 */
export type TemplateCategory = "UTILITY" | "MARKETING";

/**
 * One URL button of an approved template.
 *
 * Meta stores the *fixed prefix* and appends the caller's suffix, so `path` is
 * what the club types into the template editor and the suffix is the one-time
 * token the adapter sends at dispatch. A `dynamic: false` button carries no
 * parameter at all and needs no component in the payload — which is what makes
 * a static destination like the follow-up queue a button rather than a body
 * variable that never varies.
 */
export interface TemplateButton {
  readonly label: string;
  /** The path Meta holds, appended to the application host. Ends with `/` when dynamic. */
  readonly path: string;
  readonly dynamic: boolean;
}

/**
 * What Meta holds for one kind — the approved body, its category and its
 * buttons.
 *
 * ## Why this is declared here and not written down in Linear
 *
 * Meta matches what is sent against what the approved template declares,
 * positionally, and a disagreement is either error `132000` or, worse, a
 * *delivered* message with its sentences swapped. Until this existed, the body
 * copy lived only in a ticket and `parameterNames` lived only in code, and the
 * two had drifted apart on every player-facing kind: parameters the body had no
 * slot for, slots the parameters did not fill, and a `{{n}}` count that matched
 * on none of the six.
 *
 * Declaring the body next to the parameters that fill it makes that drift a
 * test failure (`templates.test.ts` asserts every `{{n}}` in `body` has exactly
 * one entry in `parameterNames`, and vice versa) and makes the LAN-168 manifest
 * something generated rather than something maintained by hand.
 *
 * ## What a Meta body may not do, and the rule that follows
 *
 * A template cannot omit a positional parameter, drop a line, or swap a
 * sentence. The email bodies below do all three and stay free to. **A WhatsApp
 * body always supplies every value and never drops a line** — where the email
 * omits an absent venue, the WhatsApp parameter folds it into the line above;
 * where the email drops a zero attendance count, the WhatsApp parameter carries
 * different words instead. That rule is why there is one approved template per
 * kind rather than a with-count and a without-count variant of each.
 */
export interface WhatsAppTemplate {
  readonly category: TemplateCategory;
  /**
   * The approved body, one entry per line, exactly as Meta holds it. `{{n}}` is
   * positional and is filled by the nth entry of `parameterNames`.
   */
  readonly body: readonly string[];
  /** The buttons, in Meta's index order. At most two may be URL buttons. */
  readonly buttons: readonly TemplateButton[];
}

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
  /** What Meta holds for this kind. The manifest LAN-168 generates walks this. */
  readonly whatsapp: WhatsAppTemplate;
  /** The email subject line for this kind. */
  subject(message: OutboundMessage): string;
  /** The email body, as plain text. Rendered to HTML by the transport. */
  body(message: OutboundMessage): readonly string[];
  /**
   * One resolved URL per **dynamic** button of `whatsapp.buttons`, in the same
   * order. Static buttons contribute nothing here because they carry no
   * parameter, so this is shorter than the button list whenever a kind mixes
   * the two. Undefined for a kind with no dynamic button at all.
   *
   * Declared on the registry rather than read off `message.kind` a second time
   * somewhere else, for the same reason `parameterNames` is.
   */
  buttonUrls?(message: OutboundMessage): readonly string[];
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
  return deadline === "" ? "Please respond as soon as you can." : `Please respond by ${deadline}.`;
}

function whereAndWhen(message: OutboundMessage): readonly string[] {
  const venue = (message.venue ?? "").trim();
  return venue === "" ? [message.whenLabel] : [message.whenLabel, venue];
}

/**
 * The date, time and venue as one line.
 *
 * The email's `whereAndWhen` drops the venue line when the club has none on
 * file. A Meta body cannot drop a line, so the WhatsApp parameter folds the
 * venue into the line above and simply says less when there is nothing to say.
 */
function whenAndVenue(message: OutboundMessage): string {
  const when = required(message.whenLabel, "date and time");
  const venue = (message.venue ?? "").trim();
  return venue === "" ? when : `${when}, ${venue}`;
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
function attendingSentence(message: OutboundMessage): string {
  const count = message.attendingCount;
  if (typeof count !== "number" || count <= 0) {
    // The zero wording, and the reason there is no second approved template.
    // The LAN-168 draft answered a zero count with `event_reminder_nocount_v1`,
    // a whole second Meta submission whose only difference was a missing line.
    // A parameter that carries a sentence rather than a number answers it
    // instead. It states no count and no absence, so
    // `REQ-attendance-not-absence` holds: "0 people have said yes" is the
    // sentence this exists to avoid, and it is not this one.
    return "You would be among the first to respond.";
  }
  return count === 1
    ? "One other person has confirmed they are attending."
    : `${count} others have confirmed they are attending.`;
}

/**
 * "One person has not answered" / "18 people have not answered".
 *
 * The whole clause, not the bare number, for the same reason the attendance
 * sentence is a sentence: a Meta template cannot choose between a singular and
 * a plural verb, and "1 people have not answered" is what a number parameter
 * produces on the day one person is late.
 */
function outstandingClause(message: OutboundMessage): string {
  const count = message.outstandingCount ?? 0;
  return count === 1 ? "One person has not responded" : `${count} people have not responded`;
}

/**
 * The two Yes/No URL buttons — LAN-172, Q-11. Required on `invitation` and
 * `reminder`: a player-facing rung with no answer link is a message nobody
 * can act on, so a missing URL is refused here rather than sent as a template
 * with a blank button.
 */
function answerButtonUrls(message: OutboundMessage): readonly string[] {
  return [required(message.yesUrl, "Yes link"), required(message.noUrl, "No link")];
}

const INVITATION: MessageTemplate = {
  kind: "invitation",
  // The approved W2-01 shape, and it carries no name. WhatsApp arrives in a
  // one-to-one thread where a greeting earns nothing, and a name parameter is
  // a slot something can later put the wrong name into — the same reasoning
  // `ESCALATION` records for having no name parameter at all. The email keeps
  // its greeting, where a name is worth something.
  //
  // `rsvpUrl` is absent for a second reason (LAN-172): the two answers are URL
  // buttons, not body text.
  parameterNames: ["eventName", "whenAndVenue", "deadlineLabel"],
  parameters: (message) => [
    required(message.eventName, "event name"),
    whenAndVenue(message),
    // Nullable on `invitations.expires_at`, but every dispatched invitation has
    // one: the messaging plan writes its not-null `response_deadline_at` to
    // each invitation of the event. So this refuses rather than inventing a
    // fallback phrase — "Please answer by as soon as you can" is the sentence a
    // fallback would produce.
    required(message.deadlineLabel, "response deadline"),
  ],
  whatsapp: {
    // The player ladder chases an event the person is already rostered for,
    // which is the ongoing arrangement UTILITY describes.
    category: "UTILITY",
    body: ["You are invited to {{1}}", "", "{{2}}", "", "Please respond by {{3}}."],
    buttons: [
      { label: YES_BUTTON_LABEL, path: "/a/", dynamic: true },
      { label: NO_BUTTON_LABEL, path: "/a/", dynamic: true },
    ],
  },
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
  // No date or venue: the player already has them from the invitation, and the
  // approved W2-02 chase deliberately says less rather than repeating itself.
  parameterNames: ["eventName", "attendingSentence"],
  parameters: (message) => [required(message.eventName, "event name"), attendingSentence(message)],
  whatsapp: {
    category: "UTILITY",
    body: [
      "We still need your response",
      "",
      "{{1}} is coming up.",
      "{{2}}",
      "",
      "Please respond below so the coaches can plan.",
    ],
    buttons: [
      { label: YES_BUTTON_LABEL, path: "/a/", dynamic: true },
      { label: NO_BUTTON_LABEL, path: "/a/", dynamic: true },
    ],
  },
  // The approved W2-02 wording: the chase gets stronger rather than repeating
  // itself, and it states plainly what the club is waiting for.
  subject: (message) => `Action required: RSVP for ${message.eventName}`,
  body: (message) => {
    return [
      `${message.inviteeName}, the club still needs your response.`,
      ...whereAndWhen(message),
      attendingSentence(message),
      "Please respond now. Your response affects numbers, transport and coaching plans.",
      `${YES_BUTTON_LABEL}: ${message.yesUrl}`,
      `${NO_BUTTON_LABEL}: ${message.noUrl}`,
    ];
  },
  buttonUrls: answerButtonUrls,
};

const NUDGE: MessageTemplate = {
  kind: "nudge",
  // `rsvpUrl` left this list: it is a button now, not a raw URL in body text.
  //
  // What is outstanding is deliberately *not* a parameter. Naming the specific
  // unanswered questions would need a field `OutboundMessage` does not carry
  // and the scheduler does not compute; the generic sentence needs nothing and
  // says the same thing to a player who is one tap from seeing the list.
  parameterNames: ["eventName"],
  parameters: (message) => [required(message.eventName, "event name")],
  whatsapp: {
    category: "UTILITY",
    body: [
      "You are attending {{1}}, but there are still some outstanding questions.",
      "",
      "Please answer them below.",
    ],
    buttons: [{ label: FINISH_ANSWERS_LABEL, path: "/rsvp/", dynamic: true }],
  },
  // W2's single nudge, and it is deliberately not a chase. The player has
  // already said yes; what is outstanding is the event's own questions, and W5
  // is explicit that "a Yes with unanswered questions is answered" and never
  // reaches the nonresponse queue.
  subject: (message) => `Outstanding questions for ${message.eventName}`,
  body: (message) => [
    `${message.inviteeName}, you are attending ${message.eventName}, but there are still some outstanding questions.`,
    "Please answer them here:",
    message.rsvpUrl,
  ],
  buttonUrls: (message) => [required(message.rsvpUrl, "link")],
};

const CHANGE_NOTICE: MessageTemplate = {
  kind: "change_notice",
  parameterNames: ["eventName", "changeSummary", "whenAndVenue"],
  parameters: (message) => [
    required(message.eventName, "event name"),
    required(message.changeSummary, "summary of what changed"),
    whenAndVenue(message),
  ],
  whatsapp: {
    category: "UTILITY",
    body: [
      "{{1}} has changed",
      "",
      "{{2}}",
      "It is now scheduled for {{3}}.",
      "",
      "Your response still stands. Please use the link below if you need to change it.",
    ],
    buttons: [{ label: VIEW_EVENT_LABEL, path: "/rsvp/", dynamic: true }],
  },
  subject: (message) => `Changed: ${message.eventName}`,
  body: (message) => [
    `${message.inviteeName}, ${message.eventName} has changed.`,
    required(message.changeSummary, "summary of what changed"),
    "It is now scheduled for:",
    ...whereAndWhen(message),
    // `REQ-history-is-never-rewritten`. A player's standing answer survives an
    // amendment, so the message says so rather than asking them to answer again
    // as though nothing had been recorded.
    "Your response still stands. Please use this link if you need to change it:",
    message.rsvpUrl,
  ],
  buttonUrls: (message) => [required(message.rsvpUrl, "link")],
};

const CANCELLATION: MessageTemplate = {
  kind: "cancellation",
  // `cancellationReason` left this list, and that is the point.
  //
  // The scheduler has only ever filled it with the constant
  // `CANCELLATION_NOTICE_SAFE_REASON` — the internal reason never reached the
  // payload — so `REQ-cancellation-reason-is-internal` held by what the caller
  // passed. Now it holds by shape: the approved template has no slot a reason
  // could go in, so no future caller can put one there. A Meta variable whose
  // value never varies is also a review risk, so the sentence is body copy.
  parameterNames: ["eventName", "whenLabel"],
  parameters: (message) => [
    required(message.eventName, "event name"),
    required(message.whenLabel, "date and time"),
  ],
  whatsapp: {
    category: "UTILITY",
    // No button. There is nothing left to answer, and a control that cannot
    // act is `docs/ux/standards.md` rule 4.
    body: ["{{1}} has been cancelled", "", "It was originally scheduled for {{2}}."],
    buttons: [],
  },
  subject: (message) => `Cancelled: ${message.eventName}`,
  body: (message) => [
    `${message.inviteeName}, ${message.eventName} has been cancelled.`,
    // No link, and nothing after this line. There is nothing left to answer,
    // and a control that cannot act is `docs/ux/standards.md` rule 4.
    `It was originally scheduled for ${required(message.whenLabel, "date and time")}.`,
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
  // `queueUrl` left this list: the follow-up queue is a fixed path, so as a
  // Meta variable it never varied. It is a static button now, which needs no
  // parameter at all.
  //
  // The count is a clause rather than a number so one template reads correctly
  // at one and at eighteen. Still no name, contact or reason parameter — a
  // template with a name slot is a template something can later put a player's
  // name into.
  parameterNames: ["outstandingClause", "eventName", "whenLabel", "deadlineLabel"],
  parameters: (message) => [
    outstandingClause(message),
    required(message.eventName, "event name"),
    required(message.whenLabel, "date and time"),
    required(message.deadlineLabel, "deadline"),
  ],
  whatsapp: {
    category: "UTILITY",
    body: [
      "{{1}} for {{2}}",
      "",
      "Scheduled for {{3}}.",
      "The response deadline passed at {{4}}.",
      "",
      "Please use the link below to review and follow up.",
    ],
    buttons: [
      { label: OPEN_FOLLOW_UPS_LABEL, path: "/operate/admin/follow-ups?event=", dynamic: true },
    ],
  },
  subject: (message) =>
    `${message.outstandingCount ?? 0} outstanding responses for ${message.eventName}`,
  body: (message) => {
    return [
      `${outstandingClause(message)} for ${message.eventName}.`,
      `Scheduled for ${message.whenLabel}.`,
      `The response deadline passed at ${message.deadlineLabel}.`,
      "Please use this link to review and follow up:",
      required(message.queueUrl, "link to the follow-up queue"),
    ];
  },
  buttonUrls: (message) => [required(message.queueUrl, "link to the follow-up queue")],
};

/**
 * LAN-199, LAN-203. `recruit_event_followup_v1` — the single polite follow-up
 * after a recruitment event invitation. The invitation itself reuses
 * `INVITATION` above unchanged (`event_invitation` is already Meta-approved
 * and is the same message for every audience); this is only the one-and-only
 * follow-up recruits get instead of the player ladder's chase.
 *
 * `REQ-no-reason-asked`: the two URL buttons are the whole of the recruit's
 * answer, and neither carries the word "reason" — a No is a No, taken to the
 * shipped `/rsvp/[token]` saved page exactly as a Yes is.
 */
function recruitEventVenueLine(message: OutboundMessage): string {
  const venue = (message.venue ?? "").trim();
  // Meta's positional parameters cannot skip a slot, and this template has no
  // conditional third line the way `whereAndWhen`'s two-or-three-line body
  // does for the player ladder — LAN-199's copy is fixed at three lines. A
  // recruitment event without a venue on file still sends; the line simply
  // repeats the date and time rather than leaving the parameter blank, which
  // is what an unset value would otherwise send to Meta as literal text.
  return venue === "" ? required(message.whenLabel, "date and time") : venue;
}

const RECRUIT_EVENT_FOLLOWUP: MessageTemplate = {
  kind: "recruit_event_followup",
  parameterNames: ["eventName", "whenLabel", "venue"],
  parameters: (message) => [
    required(message.eventName, "event name"),
    required(message.whenLabel, "date and time"),
    recruitEventVenueLine(message),
  ],
  whatsapp: {
    // Nothing a recruit is sent follows a user-initiated action, so none of the
    // five qualifies as UTILITY — LAN-199, against Meta's own categorization
    // guidance. Since 16 April 2025 a detected misclassification is enforced
    // with no notice period.
    category: "MARKETING",
    body: [
      "{{1}} is coming up",
      "",
      "{{2}}",
      "{{3}}",
      "",
      "Please let us know below whether you would like to attend.",
    ],
    // The one recruit template without `Stop messages`: two URL buttons is
    // Meta's ceiling and the yes/no pair spends both. LAN-199 carries the
    // question of whether to trade an answer button for the opt-out.
    buttons: [
      { label: RECRUIT_YES_LABEL, path: "/a/", dynamic: true },
      { label: RECRUIT_NO_LABEL, path: "/a/", dynamic: true },
    ],
  },
  subject: (message) => `${message.eventName} is coming up`,
  body: (message) => [
    `${message.eventName} is coming up`,
    message.whenLabel,
    recruitEventVenueLine(message),
    "Please let us know whether you would like to attend.",
    `${RECRUIT_YES_LABEL}: ${message.yesUrl}`,
    `${RECRUIT_NO_LABEL}: ${message.noUrl}`,
  ],
  buttonUrls: answerButtonUrls,
};

/**
 * The two URL buttons every recruit cycle template but the event follow-up
 * carries — the form link and the opt-out, on the "at most two URL buttons"
 * limit LAN-199 already spent on `recruit_event_followup`'s yes/no pair.
 */
function recruitFormButtonUrls(message: OutboundMessage): readonly [string, string] {
  return [required(message.formUrl, "form link"), required(message.stopUrl, "opt-out link")];
}

/**
 * LAN-199. Carries the signed link to the sign-up form. The one template a
 * door's opt-in authorises on its own — sent only on walk-up capture and
 * operator add, never to a QR arrival, who has already filled the form in
 * (W10's own door table).
 */
const RECRUIT_WELCOME: MessageTemplate = {
  kind: "recruit_welcome",
  parameterNames: ["inviteeName"],
  parameters: (message) => [required(message.inviteeName, "name")],
  whatsapp: {
    category: "MARKETING",
    // The one place a name belongs in a WhatsApp body: a cold first contact
    // from a number the recruit has not saved.
    body: [
      "Thank you for your interest in Oxford Lancers, {{1}}",
      "",
      "We would like to tell you more about training and how to get started.",
      "",
      "Please complete the sign-up form below.",
    ],
    buttons: [
      { label: RECRUIT_FILL_IN_DETAILS_LABEL, path: "/me/join/", dynamic: true },
      { label: RECRUIT_STOP_MESSAGES_LABEL, path: "/me/stop/", dynamic: true },
    ],
  },
  subject: () => "Thank you for your interest in Oxford Lancers",
  body: (message) => [
    `Thank you for your interest in Oxford Lancers, ${message.inviteeName}`,
    "We would like to tell you more about training and how to get started.",
    "Please complete the sign-up form:",
    `${RECRUIT_FILL_IN_DETAILS_LABEL}: ${required(message.formUrl, "form link")}`,
  ],
  buttonUrls: recruitFormButtonUrls,
};

/** LAN-199. One nudge to finish the sign-up form. Sent once, ever. No variables. */
const RECRUIT_DETAILS_REMINDER: MessageTemplate = {
  kind: "recruit_details_reminder",
  parameterNames: [],
  parameters: () => [],
  whatsapp: {
    category: "MARKETING",
    body: [
      "Oxford Lancers sign-up",
      "",
      "We have not yet received your completed sign-up form.",
      "",
      "Please complete it below.",
    ],
    buttons: [
      { label: RECRUIT_FILL_IN_DETAILS_LABEL, path: "/me/join/", dynamic: true },
      { label: RECRUIT_STOP_MESSAGES_LABEL, path: "/me/stop/", dynamic: true },
    ],
  },
  subject: () => "Oxford Lancers sign-up",
  body: (message) => [
    "We have not yet received your completed sign-up form.",
    "Please complete it here:",
    `${RECRUIT_FILL_IN_DETAILS_LABEL}: ${required(message.formUrl, "form link")}`,
  ],
  buttonUrls: recruitFormButtonUrls,
};

/** LAN-199. The football-background questionnaire. Sent only where consent is granted. */
const RECRUIT_INTEREST_ASK: MessageTemplate = {
  kind: "recruit_interest_ask",
  parameterNames: ["inviteeName"],
  parameters: (message) => [required(message.inviteeName, "name")],
  whatsapp: {
    category: "MARKETING",
    body: [
      "One more thing, {{1}}",
      "",
      "We would like to know about your football background, whether you have played, watched, or neither.",
      "",
      "Please answer below.",
    ],
    buttons: [
      { label: RECRUIT_ANSWER_QUESTIONS_LABEL, path: "/me/join/", dynamic: true },
      { label: RECRUIT_STOP_MESSAGES_LABEL, path: "/me/stop/", dynamic: true },
    ],
  },
  subject: (message) => `One more thing, ${message.inviteeName}`,
  body: (message) => [
    `One more thing, ${message.inviteeName}`,
    "We would like to know about your football background, whether you have played, watched, or neither.",
    "Please answer here:",
    `${RECRUIT_ANSWER_QUESTIONS_LABEL}: ${required(message.formUrl, "form link")}`,
  ],
  buttonUrls: recruitFormButtonUrls,
};

/** LAN-199. Off by default (`recruitment_cycle_steps`). Submitted anyway per LAN-199. */
const RECRUIT_INTEREST_REMINDER: MessageTemplate = {
  kind: "recruit_interest_reminder",
  parameterNames: ["inviteeName"],
  parameters: (message) => [required(message.inviteeName, "name")],
  whatsapp: {
    category: "MARKETING",
    body: [
      "There are still a few questions about your football background, {{1}}.",
      "",
      "Please answer them below when you have a moment.",
    ],
    buttons: [
      { label: RECRUIT_ANSWER_QUESTIONS_LABEL, path: "/me/join/", dynamic: true },
      { label: RECRUIT_STOP_MESSAGES_LABEL, path: "/me/stop/", dynamic: true },
    ],
  },
  subject: () => "Questions about your football background",
  body: (message) => [
    `${message.inviteeName}, there are still a few questions about your football background.`,
    "Please answer them when you have a moment:",
    `${RECRUIT_ANSWER_QUESTIONS_LABEL}: ${required(message.formUrl, "form link")}`,
  ],
  buttonUrls: recruitFormButtonUrls,
};

export const MESSAGE_TEMPLATES: Readonly<Record<MessageKind, MessageTemplate>> = Object.freeze({
  invitation: INVITATION,
  reminder: REMINDER,
  nudge: NUDGE,
  change_notice: CHANGE_NOTICE,
  cancellation: CANCELLATION,
  escalation: ESCALATION,
  recruit_event_followup: RECRUIT_EVENT_FOLLOWUP,
  recruit_welcome: RECRUIT_WELCOME,
  recruit_details_reminder: RECRUIT_DETAILS_REMINDER,
  recruit_interest_ask: RECRUIT_INTEREST_ASK,
  recruit_interest_reminder: RECRUIT_INTEREST_REMINDER,
});

/** Every kind, in ladder order. The manifest LAN-168 generates walks this. */
export const MESSAGE_KINDS: readonly MessageKind[] = Object.freeze([
  "invitation",
  "reminder",
  "nudge",
  "change_notice",
  "cancellation",
  "escalation",
  "recruit_event_followup",
  "recruit_welcome",
  "recruit_details_reminder",
  "recruit_interest_ask",
  "recruit_interest_reminder",
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
