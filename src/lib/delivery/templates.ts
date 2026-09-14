import "server-only";

import type { EnvironmentSource, OutboundConfig } from "./config";
import type { MessageKind, OutboundMessage } from "./provider";

/**
 * The declared template registry. LAN-169.
 *
 * ## What this file is for
 *
 * Every message the club sends is one of fourteen kinds, and each kind exists
 * twice — once as an approved WhatsApp template and once as an email. This
 * module is the single declaration of both, and three separate things read it:
 *
 *   * **The WhatsApp adapter**, for the template name, its language, the
 *     ordered body parameters Meta will match against the approved template,
 *     and how many indexed URL buttons that template carries.
 *   * **The email transport**, for the subject and body.
 *   * **The local delivery sink**, which validates every payload it is handed
 *     against this registry and *rejects a mismatch*. That is what makes a
 *     parameter reordering fail on a developer machine rather than at Meta with
 *     error `132000`, and it is why the registry is data rather than fourteen
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
 * Practice". `parameterNames` below is the contract the club created each
 * template against, and the sink asserts against it on every local send.
 *
 * ## Why these bodies read the way they do — LAN-334, LAN-335, LAN-348
 *
 * Meta paused Marketing template messages to United States numbers on 1 April
 * 2025, and the club recruits players who are in the United States before they
 * arrive in Oxford. Every template the club registered before September 2026
 * was Marketing, so none of them could reach those people at all.
 *
 * The fourteen bodies below are the ones Meta's classifier accepted as
 * **Utility**, found one probe at a time on 11 September 2026 and recorded in
 * `docs/whatsapp-template-categories.md`. Three rules govern them, and all
 * three are load-bearing: certain words force Marketing whatever the context;
 * the body must contain a `for {thing} on {date}` construction; and it must
 * state the status of the reader's own record rather than ask them for
 * something. That is why the invitation says "you are on the team sheet" and
 * not "you are invited", and why six templates that follow a *person* rather
 * than an event still carry a date — the day that person's record was opened.
 *
 * Copy here is therefore not editorial. A reworded body is a new submission
 * and a new dice roll at the classifier, and the approved template at Meta
 * would no longer match what this file sends.
 *
 * ## The one body with a privacy rule of its own
 *
 * `escalation` goes to a committee phone and inbox, and `T03-no-personal-data`
 * is absolute: **no player personal data in the escalation body.** It says how
 * many people, for which event, by when. No name, no contact detail, no absence
 * reason. That is not squeamishness — the club login is the boundary that
 * decides who reads a roster, and an escalation travels outside it.
 * `escalationCarriesNoPersonalData` below is the property, and its test asserts
 * against the rendered output rather than against intent.
 */

/**
 * The club's canonical template names.
 *
 * LAN-348: the `_v2` generation, approved as Utility on the club's WhatsApp
 * Business Account against `https://app.oxfordlancers.com`. The unsuffixed and
 * `_v1` names these replace were the original Marketing submissions; a
 * Marketing template cannot be reclassified after the fact and cannot be
 * edited into one (`docs/whatsapp-template-categories.md`), so the only route
 * to Utility was a new template under a new name. Those originals are deleted.
 *
 * A deployment may override any of them — a sandbox number carries different
 * approved templates than the club's own — but the *default* is the club's
 * name rather than a guess assembled from a prefix, because a name assembled
 * at runtime is a name nobody ever approved.
 */
export const TEMPLATE_NAMES: Readonly<Record<MessageKind, string>> = Object.freeze({
  invitation: "lancers_event_invitation_v2",
  reminder: "lancers_event_reminder_v2",
  nudge: "lancers_event_nudge_v2",
  change_notice: "lancers_event_change_notice_v2",
  cancellation: "lancers_event_cancellation_v2",
  escalation: "lancers_nonresponse_escalation_v2",
  recruit_event_followup: "recruit_event_followup_v2",
  recruit_welcome: "recruit_welcome_v2",
  recruit_details_reminder: "recruit_details_reminder_v2",
  recruit_interest_ask: "recruit_interest_ask_v2",
  recruit_interest_reminder: "recruit_interest_reminder_v2",
  onboarding_welcome: "onboarding_welcome_v2",
  onboarding_chase: "onboarding_chase_v2",
  onboarding_chase_escalation: "onboarding_chase_escalation_v2",
});

/**
 * The environment variable that overrides one kind's template name.
 *
 * `invitation` deliberately reads `WHATSAPP_TEMPLATE_NAME`, which is already
 * required by `config.ts` and already set on every configured deployment. That
 * keeps LAN-124's live-provider path working unchanged and means this registry
 * adds no new *required* configuration at all — only optional overrides.
 */
export function templateNameVariable(kind: MessageKind): string {
  return kind === "invitation"
    ? "WHATSAPP_TEMPLATE_NAME"
    : `WHATSAPP_TEMPLATE_${kind.toUpperCase()}`;
}

/** Brian's amended button labels. Alphanumerics and spaces only — no em dashes. */
export const YES_BUTTON_LABEL = "Yes view details";
export const NO_BUTTON_LABEL = "No give reason";

/**
 * The single form-button label every recruit and onboarding template carries,
 * and the two single-button labels on the player ladder (LAN-335, LAN-344).
 *
 * These read the same across six templates deliberately. LAN-344 set out to
 * give each button a label naming its own destination and found the wording is
 * not free: "Fill in your details" and "Finish here" were both read as
 * Marketing. `docs/whatsapp-template-categories.md` records that button labels
 * do not affect categorisation *in general*; these particular words do, for the
 * same reason the bodies avoid them.
 */
export const ANSWER_QUESTIONS_LABEL = "Answer questions";
export const CHANGE_ANSWER_LABEL = "Change your answer";

/**
 * LAN-199's own recruit yes/no labels, verbatim — alphanumerics and spaces
 * only, no em dashes (Q-10). `recruit_event_followup`'s pair reads differently
 * from the player ladder's because a recruit is never asked to "give a reason"
 * (`REQ-no-reason-asked`).
 *
 * `RECRUIT_STOP_MESSAGES_LABEL` survives for the email bodies only. Meta will
 * not classify a template carrying an opt-out button as Utility — tested three
 * ways on 11 September 2026, including renaming the label and changing the URL
 * — so no WhatsApp template carries one. LAN-337 owns the replacement surface
 * and is open: until it lands, the opt-out is reachable from the email rung
 * alone.
 */
export const RECRUIT_STOP_MESSAGES_LABEL = "Stop messages";
export const RECRUIT_YES_LABEL = "Yes I can come";
export const RECRUIT_NO_LABEL = "No thanks";

/**
 * Brian's date decision, carried from LAN-336.
 *
 * Meta's classifier requires every Utility body to anchor on `for {thing} on
 * {date}`. Six of the fourteen templates follow a *person* rather than an event
 * and have no event date to give it, so the thing is the person's own record
 * and the date is the day it was opened. The subject is fixed per kind and
 * carries the word "opened", so the rendered sentence reads "your answers for
 * your recruitment, opened on 11 September, are still outstanding" rather than
 * as though the recruitment were *on* 11 September. `whenLabel` carries that
 * date; the scheduler reads it from the row that opened the record.
 */
export const RECRUITMENT_SUBJECT = "your recruitment, opened";
export const INTEREST_SUBJECT = "your football background questionnaire, opened";
export const ONBOARDING_SUBJECT = "your onboarding, opened";

/** The slot Meta cannot skip when the club has no venue on file yet. */
export const VENUE_FALLBACK = "to be confirmed";

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
   * How many indexed URL buttons the approved template carries — one, two, or
   * absent for none. Declared rather than inferred from `buttonUrls`' length so
   * the sink can refuse a payload carrying a button the approved template has
   * no slot for, which Meta would refuse as `132000` at the other end.
   */
  readonly buttonCount?: 1 | 2;
  /**
   * The URL behind each of those buttons, in index order. The adapter sends
   * only each URL's final path segment — Meta's dynamic suffix — because the
   * approved template holds the fixed prefix, the host included.
   */
  buttonUrls?(message: OutboundMessage): readonly string[] | null;
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

/**
 * Meta's positional parameters cannot skip a slot, so a venue the club has not
 * recorded yet still fills its slot — with words, never a blank the sink would
 * refuse or Meta would render as literal nothing.
 */
function venueSlot(message: OutboundMessage): string {
  const venue = (message.venue ?? "").trim();
  return venue === "" ? VENUE_FALLBACK : venue;
}

/**
 * The deadline slot when no response deadline was recorded for the event. Meta
 * cannot skip it, and "Please respond by as soon as you can" reads as a broken
 * template; the event's own start is the last moment an answer can matter, and
 * repeating it is the same fallback `venueSlot` takes for a missing venue.
 */
function deadlineSlot(message: OutboundMessage): string {
  const deadline = (message.deadlineLabel ?? "").trim();
  return deadline === "" ? required(message.whenLabel, "date and time") : deadline;
}

/**
 * "Eighteen others are attending" — the dispatch-time snapshot the approved
 * W2-02 mockup carries on the email chase. The WhatsApp reminder has no slot
 * for it in its approved body; the email keeps it.
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
 * The two Yes/No URL buttons — LAN-172, Q-11. Required on `invitation`,
 * `reminder` and `recruit_event_followup`: a player-facing rung with no answer
 * link is a message nobody can act on, so a missing URL is refused here rather
 * than sent as a template with a blank button.
 *
 * The approved templates carry `/a/yes/` and `/a/no/` as their fixed prefixes,
 * because Meta refuses two dynamic buttons sharing one base URL and because
 * LAN-343 put the answer in the path. The token still encodes its own answer,
 * so the segment is checked against the token rather than believed.
 */
function answerButtonUrls(message: OutboundMessage): readonly [string, string] {
  return [required(message.yesUrl, "Yes link"), required(message.noUrl, "No link")];
}

/**
 * The one form button every recruit and onboarding template carries. LAN-343
 * gave each of those messages its own route and its own purpose-tagged
 * credential, so which page this resolves to is a fact about the token rather
 * than about which message happened to carry it.
 */
function formButtonUrls(message: OutboundMessage): readonly [string] {
  return [required(message.formUrl, "form link")];
}

/**
 * Email-only opt-out line. The WhatsApp templates cannot carry it (see
 * `RECRUIT_STOP_MESSAGES_LABEL`); the email transport is not bound by Meta's
 * classifier and keeps offering it wherever the dispatcher minted one.
 */
function stopLine(message: OutboundMessage): readonly string[] {
  const url = (message.stopUrl ?? "").trim();
  return url === "" ? [] : [`${RECRUIT_STOP_MESSAGES_LABEL}: ${url}`];
}

// ---------------------------------------------------------------------------
// The player ladder — bodies as accepted by Meta's classifier (LAN-335), and
// resubmitted for production as `_v2` by LAN-348.
// ---------------------------------------------------------------------------

/**
 * `Hello {{1}}, you are on the team sheet for {{2}} on {{3}}.` / `Venue: {{4}}.`
 * / `Please respond by {{5}}. Thank you.` — two buttons, Yes then No.
 *
 * "On the team sheet" rather than "invited" is not a stylistic choice: the word
 * `invited` forces Marketing on its own, whatever surrounds it.
 */
const INVITATION: MessageTemplate = {
  kind: "invitation",
  parameterNames: ["inviteeName", "eventName", "whenLabel", "venue", "deadlineLabel"],
  parameters: (message) => [
    required(message.inviteeName, "name"),
    required(message.eventName, "event name"),
    required(message.whenLabel, "date and time"),
    venueSlot(message),
    deadlineSlot(message),
  ],
  subject: (message) => `You are on the team sheet: ${message.eventName}`,
  body: (message) => [
    `Hello ${message.inviteeName}, you are on the team sheet for ${message.eventName} on ${message.whenLabel}.`,
    `Venue: ${venueSlot(message)}.`,
    `Please respond by ${deadlineSlot(message)}. Thank you.`,
    // Email's "equivalent calls to action" (W2's own words) rather than one
    // raw link: two distinct URLs, each already the answer, matching what the
    // WhatsApp buttons do. `REQ-no-false-rsvp` covers both — the destination
    // GET is side-effect-free for a mail client's link scanner exactly as it is
    // for WhatsApp's own crawler.
    `${YES_BUTTON_LABEL}: ${message.yesUrl}`,
    `${NO_BUTTON_LABEL}: ${message.noUrl}`,
  ],
  buttonCount: 2,
  buttonUrls: answerButtonUrls,
};

/**
 * `Hello {{1}}, your response for {{2}} on {{3}} is still outstanding.` /
 * `Venue: {{4}}.` / `Please respond below so the coaches can plan.`
 *
 * "Your response is still outstanding" states the state of the reader's own
 * record; "the club still needs your answer" asks them for something, and the
 * classifier reads that as Marketing. The email is under no such constraint and
 * keeps the fuller W2-02 chase, social proof included.
 */
const REMINDER: MessageTemplate = {
  kind: "reminder",
  parameterNames: ["inviteeName", "eventName", "whenLabel", "venue"],
  parameters: (message) => [
    required(message.inviteeName, "name"),
    required(message.eventName, "event name"),
    required(message.whenLabel, "date and time"),
    venueSlot(message),
  ],
  subject: (message) => `Action required: RSVP for ${message.eventName}`,
  body: (message) => {
    const attending = attendingSentence(message);
    return [
      `${message.inviteeName}, the club still needs your answer.`,
      message.whenLabel,
      `Venue: ${venueSlot(message)}.`,
      ...(attending ? [attending] : []),
      "Please respond now. Your answer affects numbers, transport and coaching plans.",
      `${YES_BUTTON_LABEL}: ${message.yesUrl}`,
      `${NO_BUTTON_LABEL}: ${message.noUrl}`,
    ];
  },
  buttonCount: 2,
  buttonUrls: answerButtonUrls,
};

/**
 * `Hello {{1}}, you are attending {{2}} on {{3}}, but there are still some
 * outstanding questions.` / `Please answer them below.` — one button on the
 * `/questions/` base.
 *
 * LAN-343 gave this message its own page. It asks for the event's own questions
 * and used to link at the RSVP page, which does not ask them: the questions
 * were reachable only by expanding a row on the player's events page, so the
 * one message about them did not lead to them.
 */
const NUDGE: MessageTemplate = {
  kind: "nudge",
  parameterNames: ["inviteeName", "eventName", "whenLabel"],
  parameters: (message) => [
    required(message.inviteeName, "name"),
    required(message.eventName, "event name"),
    required(message.whenLabel, "date and time"),
  ],
  // W2's single nudge, and it is deliberately not a chase. The player has
  // already said yes; what is outstanding is the event's own questions, and W5
  // is explicit that "a Yes with unanswered questions is answered" and never
  // reaches the nonresponse queue.
  subject: (message) => `One thing left for ${message.eventName}`,
  body: (message) => [
    `Hello ${message.inviteeName}, you are attending ${message.eventName} on ${message.whenLabel}, but there are still some outstanding questions.`,
    "Please answer them below.",
    `${ANSWER_QUESTIONS_LABEL}: ${required(message.questionsUrl, "link")}`,
  ],
  buttonCount: 1,
  buttonUrls: (message) => [required(message.questionsUrl, "link")],
};

/**
 * `Hello {{1}}, the arrangements for {{2}} on {{3}} have changed.` / `{{4}}` /
 * `Your response still stands. Please use the link below if you need to change
 * it.` — one button on the `/rsvp/` base.
 *
 * This is the one template that may say details "have changed": the word is
 * contextual rather than blocked, and stating a fact passes where asking for
 * details does not.
 */
const CHANGE_NOTICE: MessageTemplate = {
  kind: "change_notice",
  parameterNames: ["inviteeName", "eventName", "whenLabel", "changeSummary"],
  parameters: (message) => [
    required(message.inviteeName, "name"),
    required(message.eventName, "event name"),
    required(message.whenLabel, "date and time"),
    required(message.changeSummary, "summary of what changed"),
  ],
  subject: (message) => `Changed: ${message.eventName}`,
  body: (message) => [
    `Hello ${message.inviteeName}, the arrangements for ${message.eventName} on ${message.whenLabel} have changed.`,
    required(message.changeSummary, "summary of what changed"),
    ...((message.venue ?? "").trim() === "" ? [] : [`Venue: ${message.venue?.trim()}.`]),
    // `REQ-history-is-never-rewritten`. A player's standing answer survives an
    // amendment, so the message says so rather than asking them to answer again
    // as though nothing had been recorded.
    "Your response still stands. Please use the link below if you need to change it.",
    `${CHANGE_ANSWER_LABEL}: ${required(message.rsvpUrl, "link")}`,
  ],
  buttonCount: 1,
  buttonUrls: (message) => [required(message.rsvpUrl, "link")],
};

/**
 * `Hello {{1}}, {{2}} on {{3}} has been cancelled.` / `Reason: {{4}}.` / `No
 * action is needed. Thank you.` — no buttons. The dispatcher supplies the
 * fixed, generic reason, never the operator's own recorded one.
 */
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
    `Hello ${message.inviteeName}, ${message.eventName} on ${message.whenLabel} has been cancelled.`,
    `Reason: ${required(message.cancellationReason, "reason")}.`,
    // No link. There is nothing left to answer, and offering one would be a
    // control that cannot act — `docs/ux/standards.md` rule 4.
    "No action is needed. Thank you.",
  ],
};

/**
 * The escalation, and the one body in this file with a privacy rule.
 *
 * `T03-no-personal-data`: the message says how many people, for which event, by
 * when. Names, contact details and reasons stay behind the operator login. The
 * parameters are therefore a count, an event name, a date and a deadline, and
 * there is deliberately **no name parameter at all** — including the
 * recipient's own. A template with a name slot is a template something can
 * later put a player's name into.
 *
 * `Attendance follow-up needed. {{1}} people have not answered for {{2}} on
 * {{3}}.` / `The response deadline passed at {{4}}.` / `Please use the link
 * below to review and follow up: <queue URL>` — the queue URL is **hardcoded in
 * the approved body** because Meta refuses a body variable holding a URL. The
 * WhatsApp payload therefore never carries `queueUrl`; the email still does,
 * and carries the event-scoped one the dispatcher minted.
 */
const ESCALATION: MessageTemplate = {
  kind: "escalation",
  parameterNames: ["outstandingCount", "eventName", "whenLabel", "deadlineLabel"],
  parameters: (message) => [
    String(message.outstandingCount ?? 0),
    required(message.eventName, "event name"),
    required(message.whenLabel, "date and time"),
    required(message.deadlineLabel, "deadline"),
  ],
  subject: (message) => `${message.outstandingCount ?? 0} unanswered for ${message.eventName}`,
  body: (message) => {
    const count = message.outstandingCount ?? 0;
    return [
      "Attendance follow-up needed. " +
        (count === 1
          ? `One person has not answered for ${message.eventName} on ${message.whenLabel}.`
          : `${count} people have not answered for ${message.eventName} on ${message.whenLabel}.`),
      `The response deadline passed at ${message.deadlineLabel}.`,
      "Please use the link below to review and follow up:",
      required(message.queueUrl, "link to the follow-up queue"),
    ];
  },
};

// ---------------------------------------------------------------------------
// Recruitment — LAN-199, LAN-203, reshaped by LAN-335.
// ---------------------------------------------------------------------------

/**
 * `Hello {{1}}, your response for {{2}} on {{3}} is still outstanding.` /
 * `Venue: {{4}}.` / `Please let us know below whether you would like to
 * attend.` — the single polite follow-up after a recruitment event invitation,
 * with LAN-199's own yes/no pair.
 *
 * `REQ-no-reason-asked`: the two URL buttons are the whole of the recruit's
 * answer, and neither carries the word "reason".
 */
const RECRUIT_EVENT_FOLLOWUP: MessageTemplate = {
  kind: "recruit_event_followup",
  parameterNames: ["inviteeName", "eventName", "whenLabel", "venue"],
  parameters: (message) => [
    required(message.inviteeName, "name"),
    required(message.eventName, "event name"),
    required(message.whenLabel, "date and time"),
    venueSlot(message),
  ],
  subject: (message) => `${message.eventName} is still coming up`,
  body: (message) => [
    `Hello ${message.inviteeName}, your response for ${message.eventName} on ${message.whenLabel} is still outstanding.`,
    `Venue: ${venueSlot(message)}.`,
    "Please let us know below whether you would like to attend. No need to decide in advance.",
    `${RECRUIT_YES_LABEL}: ${message.yesUrl}`,
    `${RECRUIT_NO_LABEL}: ${message.noUrl}`,
  ],
  buttonCount: 2,
  buttonUrls: answerButtonUrls,
};

/**
 * The six person-following bodies share one parameter shape: the reader's name,
 * the fixed subject naming their own record, and the day it was opened. That is
 * rule 2 of the classifier — `for {thing} on {date}` — satisfied by a message
 * that has no event to point at.
 */
function personRecordParameters(subject: string) {
  return (message: OutboundMessage): readonly string[] => [
    required(message.inviteeName, "name"),
    subject,
    required(message.whenLabel, "date opened"),
  ];
}

/**
 * LAN-199. Carries the signed link to the sign-up form. The one template a
 * door's opt-in authorises on its own — sent only on walk-up capture and
 * operator add, never to a QR arrival, who has already filled the form in
 * (W10's own door table).
 *
 * `Hello {{1}}, your answers for {{2}} on {{3}} are still outstanding.` /
 * `Please complete the remaining questions below.` — one button, `/signup/`.
 */
const RECRUIT_WELCOME: MessageTemplate = {
  kind: "recruit_welcome",
  parameterNames: ["inviteeName", "subject", "openedOn"],
  parameters: personRecordParameters(RECRUITMENT_SUBJECT),
  subject: () => "Thanks for your interest in Oxford Lancers",
  body: (message) => [
    `Thanks for your interest in Oxford Lancers, ${message.inviteeName}.`,
    `Your answers for ${RECRUITMENT_SUBJECT} on ${message.whenLabel}, are still outstanding.`,
    "When you have a moment, fill in the form. It takes a minute, and almost all of it is optional.",
    `${ANSWER_QUESTIONS_LABEL}: ${required(message.formUrl, "form link")}`,
    ...stopLine(message),
  ],
  buttonCount: 1,
  buttonUrls: formButtonUrls,
};

/**
 * LAN-199. One nudge to finish the sign-up form. Sent once, ever. The same
 * approved body as the welcome; one button, `/signup/`.
 */
const RECRUIT_DETAILS_REMINDER: MessageTemplate = {
  kind: "recruit_details_reminder",
  parameterNames: ["inviteeName", "subject", "openedOn"],
  parameters: personRecordParameters(RECRUITMENT_SUBJECT),
  subject: () => "Still interested in Oxford Lancers?",
  body: (message) => [
    `Hello ${message.inviteeName}, still interested in Oxford Lancers?`,
    `Your answers for ${RECRUITMENT_SUBJECT} on ${message.whenLabel}, are still outstanding. You can leave anything blank.`,
    `${ANSWER_QUESTIONS_LABEL}: ${required(message.formUrl, "form link")}`,
    ...stopLine(message),
  ],
  buttonCount: 1,
  buttonUrls: formButtonUrls,
};

/**
 * LAN-199. The football-background questionnaire. Sent only where consent is
 * granted. One button, `/background/`.
 *
 * Its WhatsApp body is the same sentence as the welcome's and is told apart by
 * the subject slot alone — the distinguishing clause ("whether you have played,
 * watched, or neither") was read as Marketing. The email keeps it.
 */
const RECRUIT_INTEREST_ASK: MessageTemplate = {
  kind: "recruit_interest_ask",
  parameterNames: ["inviteeName", "subject", "openedOn"],
  parameters: personRecordParameters(INTEREST_SUBJECT),
  subject: (message) => `One more thing, ${message.inviteeName}`,
  body: (message) => [
    `One more thing, ${message.inviteeName}.`,
    `Your answers for ${INTEREST_SUBJECT} on ${message.whenLabel}, are still outstanding.`,
    "Tell us how you came to American football, whether you have played, watched, or neither. " +
      "There are no wrong answers, and you can skip anything.",
    `${ANSWER_QUESTIONS_LABEL}: ${required(message.formUrl, "form link")}`,
    ...stopLine(message),
  ],
  buttonCount: 1,
  buttonUrls: formButtonUrls,
};

/**
 * LAN-199. Off by default (`recruitment_cycle_steps`). `Hello {{1}}, your
 * answers for {{2}} on {{3}} are still outstanding.` / `Please answer them
 * below when you have a moment.` — one button, `/background/`.
 */
const RECRUIT_INTEREST_REMINDER: MessageTemplate = {
  kind: "recruit_interest_reminder",
  parameterNames: ["inviteeName", "subject", "openedOn"],
  parameters: personRecordParameters(INTEREST_SUBJECT),
  subject: (message) => `No rush, ${message.inviteeName}`,
  body: (message) => [
    `No rush, ${message.inviteeName}.`,
    `Your answers for ${INTEREST_SUBJECT} on ${message.whenLabel}, are still outstanding.`,
    "Please answer them below when you have a moment.",
    `${ANSWER_QUESTIONS_LABEL}: ${required(message.formUrl, "form link")}`,
    ...stopLine(message),
  ],
  buttonCount: 1,
  buttonUrls: formButtonUrls,
};

// ---------------------------------------------------------------------------
// Onboarding — LAN-215, LAN-218, reshaped by LAN-335.
// ---------------------------------------------------------------------------

/**
 * LAN-215, `REQ-one-welcome`, `REQ-three-doors`. Fired by all three arrival
 * doors (`roster.ts`'s `enterReturningPlayer`, `recruitment-prospect.ts`'s
 * flip, and the CSV import) through the identical `emitOnboardingOpenedWelcomeIn`
 * call — one template, door-independent, and the only message the club may send
 * before a messaging basis exists (`onboarding-welcome.ts`'s own
 * `mayReceiveWelcomeContactIn` check). Its purpose is to obtain that basis: the
 * tick on the page this links to.
 *
 * `Hello {{1}}, welcome to the team. Your answers for {{2}} on {{3}} are still
 * outstanding.` / `It takes a few minutes. Please complete the remaining
 * questions below.` — one button, `/onboarding/`, on its own purpose-tagged
 * credential (LAN-343). Never a Stop messages button (LAN-263).
 */
const ONBOARDING_WELCOME: MessageTemplate = {
  kind: "onboarding_welcome",
  parameterNames: ["inviteeName", "subject", "openedOn"],
  parameters: personRecordParameters(ONBOARDING_SUBJECT),
  subject: () => "Welcome to Oxford Lancers",
  body: (message) => [
    `Hello ${message.inviteeName}, welcome to the team.`,
    `Your answers for ${ONBOARDING_SUBJECT} on ${message.whenLabel}, are still outstanding.`,
    "It takes a few minutes. Please complete the remaining questions below.",
    `${ANSWER_QUESTIONS_LABEL}: ${required(message.formUrl, "link")}`,
    ...stopLine(message),
  ],
  buttonCount: 1,
  buttonUrls: formButtonUrls,
};

/**
 * `Hello {{1}}, your answers for {{2}} on {{3}} are still outstanding.` /
 * `Please complete the remaining questions below.` Never names an item, a count
 * or what is missing — W8's own "never a one-fact ask" and "the same compiled
 * ask, re-sent".
 */
const ONBOARDING_CHASE: MessageTemplate = {
  kind: "onboarding_chase",
  parameterNames: ["inviteeName", "subject", "openedOn"],
  parameters: personRecordParameters(ONBOARDING_SUBJECT),
  subject: () => "A few things still outstanding",
  body: (message) => [
    `Hello ${message.inviteeName}, your answers for ${ONBOARDING_SUBJECT} on ${message.whenLabel}, are still outstanding.`,
    "Please complete the remaining questions below.",
    `${ANSWER_QUESTIONS_LABEL}: ${required(message.formUrl, "link")}`,
    ...stopLine(message),
  ],
  buttonCount: 1,
  buttonUrls: formButtonUrls,
};

/**
 * LAN-218, `W9`. `The automated chase has finished for {{1}} players who still
 * have onboarding answers outstanding.` / `Please use the link below to review
 * and follow up: <queue URL>` — a count and nothing else in the WhatsApp
 * payload, the queue URL hardcoded in the approved body exactly as
 * `ESCALATION`'s is, never a name and never per-person detail, on the identical
 * `T03-no-personal-data` rule. `escalationCarriesNoPersonalData` is asserted
 * against this body too, in `templates.test.ts`.
 */
const ONBOARDING_CHASE_ESCALATION: MessageTemplate = {
  kind: "onboarding_chase_escalation",
  parameterNames: ["outstandingCount"],
  parameters: (message) => [String(message.outstandingCount ?? 0)],
  subject: (message) => `${message.outstandingCount ?? 0} onboarding chases have run out`,
  body: (message) => [
    `The automated chase has finished for ${message.outstandingCount ?? 0} players who still ` +
      "have onboarding answers outstanding.",
    "Please use the link below to review and follow up:",
    required(message.queueUrl, "link to the missing-data queue"),
  ],
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
  onboarding_welcome: ONBOARDING_WELCOME,
  onboarding_chase: ONBOARDING_CHASE,
  onboarding_chase_escalation: ONBOARDING_CHASE_ESCALATION,
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
 * parameters are a count, an event name, a date and a deadline, and this
 * asserts that nothing which could carry a person has leaked into any of them.
 */
export function escalationCarriesNoPersonalData(rendered: readonly string[]): boolean {
  const text = rendered.join("\n");
  // An email address, a telephone number of six or more digits, and the two
  // fields the message object could supply a person from.
  return !/[\w.+-]+@[\w-]+\.[\w.]+/.test(text) && !/\+?\d[\d\s()-]{5,}\d/.test(text);
}
