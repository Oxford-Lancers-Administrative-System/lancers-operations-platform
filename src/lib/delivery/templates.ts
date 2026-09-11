import "server-only";

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

/** Brian's amended button labels. Alphanumerics and spaces only — no em dashes. */
export const YES_BUTTON_LABEL = "Yes view details";
export const NO_BUTTON_LABEL = "No give reason";

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

/** One kind's declaration: what the text says, and what the email says. */
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
   * The text message for this kind — LAN-330. One string, GSM-7 only, sender
   * name first, links on their own lines. See `SMS_BODIES`.
   */
  sms(message: OutboundMessage): string;
  /** Actual indexed URL-button count in the approved template. */
  readonly buttonCount?: 1 | 2;
  buttonUrls?(message: OutboundMessage): readonly string[] | null;
  /** Override for a dynamic query value rather than a final path token. */
  buttonParameter?(url: string): string;
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
  parameterNames: ["eventName", "whenAndVenue", "deadlineLabel"],
  parameters: (message) => [
    required(message.eventName, "event name"),
    [required(message.whenLabel, "date and time"), message.venue?.trim()]
      .filter(Boolean)
      .join(" · "),
    required(message.deadlineLabel, "deadline"),
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
  buttonCount: 2,
  buttonUrls: answerButtonUrls,
};

const REMINDER: MessageTemplate = {
  kind: "reminder",
  parameterNames: ["eventName", "attendingSentence"],
  parameters: (message) => [
    required(message.eventName, "event name"),
    attendingSentence(message) ?? "Your answer helps the coaches plan.",
  ],
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
  buttonCount: 2,
  buttonUrls: answerButtonUrls,
};

const NUDGE: MessageTemplate = {
  kind: "nudge",
  parameterNames: ["eventName"],
  parameters: (message) => [required(message.eventName, "event name")],
  subject: (message) => `One thing left for ${message.eventName}`,
  body: (message) => [
    `${message.inviteeName}, thank you for answering ${message.eventName}.`,
    "There are still a couple of questions to finish, and the coaches need them to plan.",
    "Finish here:",
    message.rsvpUrl,
  ],
  buttonCount: 1,
  buttonUrls: (message) => [required(message.rsvpUrl, "link")],
};

const CHANGE_NOTICE: MessageTemplate = {
  kind: "change_notice",
  parameterNames: ["eventName", "changeSummary", "whenAndVenue"],
  parameters: (message) => [
    required(message.eventName, "event name"),
    required(message.changeSummary, "summary of what changed"),
    [required(message.whenLabel, "date and time"), message.venue?.trim()]
      .filter(Boolean)
      .join(" · "),
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
  buttonCount: 1,
  buttonUrls: (message) => [required(message.rsvpUrl, "link")],
};

const CANCELLATION: MessageTemplate = {
  kind: "cancellation",
  parameterNames: ["eventName", "whenLabel"],
  parameters: (message) => [
    required(message.eventName, "event name"),
    required(message.whenLabel, "date and time"),
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
  parameterNames: ["outstandingClause", "eventName", "whenLabel", "deadlineLabel"],
  parameters: (message) => [
    `${message.outstandingCount ?? 0} ${(message.outstandingCount ?? 0) === 1 ? "person has" : "people have"} not responded`,
    required(message.eventName, "event name"),
    required(message.whenLabel, "date and time"),
    required(message.deadlineLabel, "deadline"),
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
  buttonCount: 1,
  buttonUrls: (message) => [required(message.queueUrl, "follow-up queue link")],
  buttonParameter: (url) => required(new URL(url).searchParams.get("event"), "event filter"),
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
  subject: (message) => `${message.eventName} is still coming up`,
  body: (message) => [
    `${message.eventName} is still coming up`,
    message.whenLabel,
    recruitEventVenueLine(message),
    "Come along if you can. No need to decide in advance.",
    `${RECRUIT_YES_LABEL}: ${message.yesUrl}`,
    `${RECRUIT_NO_LABEL}: ${message.noUrl}`,
  ],
  buttonCount: 2,
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
  subject: () => "Thanks for your interest in Oxford Lancers",
  body: (message) => [
    `Thanks for your interest in Oxford Lancers, ${message.inviteeName}`,
    "We would love to tell you more about training and how to get started.",
    "When you have a moment, fill in a few details. It takes a minute, and almost all of it is optional.",
    `${RECRUIT_FILL_IN_DETAILS_LABEL}: ${required(message.formUrl, "form link")}`,
  ],
  buttonCount: 2,
  buttonUrls: recruitFormButtonUrls,
};

/** LAN-199. One nudge to finish the sign-up form. Sent once, ever. No variables. */
const RECRUIT_DETAILS_REMINDER: MessageTemplate = {
  kind: "recruit_details_reminder",
  parameterNames: [],
  parameters: () => [],
  subject: () => "Still interested in Oxford Lancers?",
  body: (message) => [
    "Still interested in Oxford Lancers?",
    "You have not filled in your details yet. It takes a minute, and you can leave anything blank.",
    `${RECRUIT_FILL_IN_DETAILS_LABEL}: ${required(message.formUrl, "form link")}`,
  ],
  buttonCount: 2,
  buttonUrls: recruitFormButtonUrls,
};

/** LAN-199. The football-background questionnaire. Sent only where consent is granted. */
const RECRUIT_INTEREST_ASK: MessageTemplate = {
  kind: "recruit_interest_ask",
  parameterNames: ["inviteeName"],
  parameters: (message) => [required(message.inviteeName, "name")],
  subject: (message) => `One more thing, ${message.inviteeName}`,
  body: (message) => [
    `One more thing, ${message.inviteeName}`,
    "Tell us how you came to American football, whether you have played, watched, or neither. " +
      "There are no wrong answers, and you can skip anything.",
    `${RECRUIT_ANSWER_QUESTIONS_LABEL}: ${required(message.formUrl, "form link")}`,
  ],
  buttonCount: 2,
  buttonUrls: recruitFormButtonUrls,
};

/** LAN-199. Off by default (`recruitment_cycle_steps`). Submitted anyway per LAN-199. */
const RECRUIT_INTEREST_REMINDER: MessageTemplate = {
  kind: "recruit_interest_reminder",
  parameterNames: ["inviteeName"],
  parameters: (message) => [required(message.inviteeName, "name")],
  subject: (message) => `No rush, ${message.inviteeName}`,
  body: (message) => [
    `No rush, ${message.inviteeName}`,
    "We still have a few questions about your football background, whenever you have a moment.",
    `${RECRUIT_ANSWER_QUESTIONS_LABEL}: ${required(message.formUrl, "form link")}`,
  ],
  buttonCount: 2,
  buttonUrls: recruitFormButtonUrls,
};

/** LAN-263: onboarding carries only its personal-page button; recruits retain Stop messages. */
function onboardingWelcomeButtonUrls(message: OutboundMessage): readonly string[] {
  return [required(message.formUrl, "link")];
}

/**
 * LAN-215, `REQ-one-welcome`, `REQ-three-doors`. Fired by all three arrival
 * doors (`roster.ts`'s `enterReturningPlayer`, `recruitment-prospect.ts`'s
 * flip, and the CSV import) through the identical
 * `emitOnboardingOpenedWelcomeIn` call — one template, door-independent, and
 * the only message the club may send before a messaging basis exists
 * (`onboarding-welcome.ts`'s own `mayReceiveWelcomeContactIn` check). Its
 * purpose is to obtain that basis: the tick on the page this links to.
 *
 * Wording is a placeholder in a real, versioned template slot
 * (`nonblocking_unknowns`, packet M-ONBOARDING-AND-INFORMATION-COMPLETION):
 * nothing here is club policy, and the words drop in later without changing
 * the message's kind, its parameters, or any acceptance criterion.
 */
const ONBOARDING_WELCOME: MessageTemplate = {
  kind: "onboarding_welcome",
  parameterNames: ["inviteeName"],
  parameters: (message) => [required(message.inviteeName, "name")],
  subject: () => "Welcome to Oxford Lancers",
  body: (message) => [
    `${message.inviteeName}, welcome to the team.`,
    "There are a few quick things to complete before the season gets going — it takes a few minutes.",
    `Get started: ${required(message.formUrl, "link")}`,
  ],
  buttonCount: 1,
  buttonUrls: onboardingWelcomeButtonUrls,
};

const ONBOARDING_CHASE: MessageTemplate = {
  kind: "onboarding_chase",
  parameterNames: ["inviteeName"],
  parameters: (message) => [required(message.inviteeName, "name")],
  // Placeholder wording in a real, versioned template slot — the same posture
  // `ONBOARDING_WELCOME` above already carries (`nonblocking_unknowns`;
  // LAN-213 owns the club's real copy). Never invented club policy: it names
  // no item, no count and nothing about what is missing, matching W8's own
  // "never a one-fact ask" and "the same compiled ask, re-sent".
  subject: () => "A few things still outstanding",
  body: (message) => [
    `${message.inviteeName}, there are still a few things to complete before the season gets going.`,
    `Finish here: ${required(message.formUrl, "link")}`,
  ],
  buttonCount: 1,
  buttonUrls: onboardingWelcomeButtonUrls,
};

/**
 * LAN-218, `W9`. The escalation's own exact wording, locked by the packet
 * (`missions/intake/M-ONBOARDING-AND-INFORMATION-COMPLETION/workflows/
 * W9-pick-up-a-chase-that-ran-out.md`): "The automated chase has finished for
 * {count} players who still have onboarding details outstanding. {link}" —
 * a count and a link, never a name and never per-person detail, on the
 * identical `T03-no-personal-data` rule `ESCALATION` above already carries.
 * `escalationCarriesNoPersonalData` (below) is asserted against this body
 * too, in `templates.test.ts`.
 */
const ONBOARDING_CHASE_ESCALATION: MessageTemplate = {
  kind: "onboarding_chase_escalation",
  parameterNames: ["outstandingCount", "queueUrl"],
  parameters: (message) => [
    String(message.outstandingCount ?? 0),
    required(message.queueUrl, "link to the missing-data queue"),
  ],
  subject: (message) => `${message.outstandingCount ?? 0} onboarding chases have run out`,
  body: (message) => [
    `The automated chase has finished for ${message.outstandingCount ?? 0} players who still ` +
      "have onboarding details outstanding.",
    required(message.queueUrl, "link to the missing-data queue"),
  ],
};

// ---------------------------------------------------------------------------
// LAN-330 — the texts
// ---------------------------------------------------------------------------

/**
 * The SMS rewrite of every kind. LAN-330, Brian's decision of 11 September.
 *
 * ## The shape
 *
 * Sender name first (`Oxford Lancers:`), then the copy, then each link on its
 * own line with a one-word label. Yes and No are links where the WhatsApp
 * template had buttons; the Stop link is kept on recruit kinds only
 * (LAN-263: onboarding carries no Stop). GSM-7 only — no em dash, no curly
 * quote — because one character outside the alphabet drops the whole message
 * from 160 to 70 characters per segment. `sms-budget.test.ts` measures every
 * kind and fails on a non-GSM-7 character or a third segment.
 *
 * ## Why the copy is short and the links are not
 *
 * A full answer link is about 114 characters (`/a/` plus a `y.<uuid>.<43>`
 * token on the production host), so a two-answer kind carries 228 characters
 * of link before any copy. That leaves under 70 characters for the sender
 * name and the copy inside two segments. The copy here is written to that
 * budget and nothing else; the measured counts are in the PR.
 */

const SENDER = "Oxford Lancers:";

function joinWhen(message: OutboundMessage): string {
  const venue = (message.venue ?? "").trim();
  return venue === "" ? message.whenLabel : `${message.whenLabel}, ${venue}`;
}

const SMS_BODIES: Readonly<Record<MessageKind, (message: OutboundMessage) => string>> =
  Object.freeze({
    // The two answer links alone are 240 characters, so the copy is the
    // person, the event and the time. The deadline is on the page each link
    // opens.
    invitation: (m) =>
      `${SENDER} ${m.inviteeName}, ${required(m.eventName, "event name")}, ` +
      `${required(m.whenLabel, "date and time")}.\n` +
      `Yes: ${required(m.yesUrl, "Yes link")}\nNo: ${required(m.noUrl, "No link")}`,
    reminder: (m) =>
      `${SENDER} ${m.inviteeName}, still need your answer for ` +
      `${required(m.eventName, "event name")}.\n` +
      `Yes: ${required(m.yesUrl, "Yes link")}\nNo: ${required(m.noUrl, "No link")}`,
    nudge: (m) =>
      `${SENDER} ${m.inviteeName}, thanks for answering ${required(m.eventName, "event name")}. ` +
      `A couple of questions are left.\nFinish: ${required(m.rsvpUrl, "link")}`,
    change_notice: (m) =>
      `${SENDER} ${m.inviteeName}, ${required(m.eventName, "event name")} has changed. ` +
      `${required(m.changeSummary, "summary of what changed")} Now ${joinWhen(m)}. ` +
      `Your answer stands.\nChange it: ${required(m.rsvpUrl, "link")}`,
    // No reason and no link: the reason is private to the club, and there is
    // nothing left to answer.
    cancellation: (m) =>
      `${SENDER} ${m.inviteeName}, ${required(m.eventName, "event name")} on ` +
      `${required(m.whenLabel, "date and time")} is cancelled. Nothing you need to do.`,
    // `T03-no-personal-data`: a count, an event, a date, a deadline and the
    // queue link. Never a name.
    escalation: (m) =>
      `${SENDER} ${m.outstandingCount ?? 0} ${(m.outstandingCount ?? 0) === 1 ? "person has" : "people have"} ` +
      `not answered for ${required(m.eventName, "event name")}, ${required(m.whenLabel, "date and time")}. ` +
      `Deadline passed ${required(m.deadlineLabel, "deadline")}.\nSee who: ${required(m.queueUrl, "link to the follow-up queue")}`,
    recruit_event_followup: (m) =>
      `${SENDER} ${required(m.eventName, "event name")} is still on, ` +
      `${required(m.whenLabel, "date and time")}.\n` +
      `Yes: ${required(m.yesUrl, "Yes link")}\nNo: ${required(m.noUrl, "No link")}`,
    recruit_welcome: (m) =>
      `${SENDER} thanks for your interest, ${required(m.inviteeName, "name")}. ` +
      `Fill in a few details, it takes a minute and most of it is optional.\n` +
      `Details: ${required(m.formUrl, "form link")}\nStop: ${required(m.stopUrl, "opt-out link")}`,
    recruit_details_reminder: (m) =>
      `${SENDER} still interested? Your details are not filled in yet. ` +
      `It takes a minute and you can leave anything blank.\n` +
      `Details: ${required(m.formUrl, "form link")}\nStop: ${required(m.stopUrl, "opt-out link")}`,
    recruit_interest_ask: (m) =>
      `${SENDER} one more thing, ${required(m.inviteeName, "name")}. ` +
      `Tell us how you came to American football. No wrong answers, skip anything.\n` +
      `Answer: ${required(m.formUrl, "form link")}\nStop: ${required(m.stopUrl, "opt-out link")}`,
    recruit_interest_reminder: (m) =>
      `${SENDER} no rush, ${required(m.inviteeName, "name")}. ` +
      `A few questions about your football background, whenever you have a moment.\n` +
      `Answer: ${required(m.formUrl, "form link")}\nStop: ${required(m.stopUrl, "opt-out link")}`,
    onboarding_welcome: (m) =>
      `${SENDER} ${required(m.inviteeName, "name")}, welcome to the team. ` +
      `A few quick things to complete before the season starts.\n` +
      `Get started: ${required(m.formUrl, "link")}`,
    onboarding_chase: (m) =>
      `${SENDER} ${required(m.inviteeName, "name")}, a few things are still to complete ` +
      `before the season starts.\nFinish here: ${required(m.formUrl, "link")}`,
    onboarding_chase_escalation: (m) =>
      `${SENDER} the automated chase has finished for ${m.outstandingCount ?? 0} players ` +
      `with onboarding details outstanding.\n${required(m.queueUrl, "link to the missing-data queue")}`,
  });

function withSms(template: MessageTemplate): MessageTemplate {
  return { ...template, sms: SMS_BODIES[template.kind] };
}

export const MESSAGE_TEMPLATES: Readonly<Record<MessageKind, MessageTemplate>> = Object.freeze({
  invitation: withSms(INVITATION),
  reminder: withSms(REMINDER),
  nudge: withSms(NUDGE),
  change_notice: withSms(CHANGE_NOTICE),
  cancellation: withSms(CANCELLATION),
  escalation: withSms(ESCALATION),
  recruit_event_followup: withSms(RECRUIT_EVENT_FOLLOWUP),
  recruit_welcome: withSms(RECRUIT_WELCOME),
  recruit_details_reminder: withSms(RECRUIT_DETAILS_REMINDER),
  recruit_interest_ask: withSms(RECRUIT_INTEREST_ASK),
  recruit_interest_reminder: withSms(RECRUIT_INTEREST_REMINDER),
  onboarding_welcome: withSms(ONBOARDING_WELCOME),
  onboarding_chase: withSms(ONBOARDING_CHASE),
  onboarding_chase_escalation: withSms(ONBOARDING_CHASE_ESCALATION),
});

/** Every kind, in ladder order. */
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
  "onboarding_welcome",
  "onboarding_chase",
  "onboarding_chase_escalation",
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
