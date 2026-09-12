/**
 * The declared template registry — LAN-169.
 *
 * Three properties are worth a test here and the third is the one with a
 * privacy rule behind it:
 *
 *   1. Every kind declares as many parameters as it renders. Meta matches them
 *      positionally and refuses a mismatch with `132000`, so a declaration that
 *      disagreed with its own builder would be a message the club could never
 *      send — discovered at Meta rather than here.
 *   2. The parameter **order** is the contract the club creates each template
 *      against. Reordering it does not produce an error; it produces a
 *      delivered message with its sentences swapped.
 *   3. The escalation body carries no player personal data. `T03-no-personal-data`
 *      is absolute, and W5's acceptance asks for it "proved by test against the
 *      rendered template" rather than asserted about intent.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { OutboundMessage } from "./provider";
import {
  ANSWER_QUESTIONS_LABEL,
  CHANGE_ANSWER_LABEL,
  INTEREST_SUBJECT,
  MESSAGE_KINDS,
  MESSAGE_TEMPLATES,
  NO_BUTTON_LABEL,
  ONBOARDING_SUBJECT,
  RECRUITMENT_SUBJECT,
  RECRUIT_NO_LABEL,
  RECRUIT_STOP_MESSAGES_LABEL,
  RECRUIT_YES_LABEL,
  TEMPLATE_NAMES,
  VENUE_FALLBACK,
  YES_BUTTON_LABEL,
  escalationCarriesNoPersonalData,
  templateFor,
  templateNameFor,
  templateNameVariable,
} from "./templates";

/**
 * One message with every optional field populated.
 *
 * Deliberately complete: a builder that silently dropped a parameter would
 * still pass a test whose fixture had nothing to drop.
 */
function message(overrides: Partial<OutboundMessage> = {}): OutboundMessage {
  return {
    recipient: "447700900001",
    inviteeName: "Jamie",
    eventName: "Michaelmas week 3",
    whenLabel: "Wednesday 14 October, 20:00",
    rsvpUrl: "https://lancers.example/rsvp/abc",
    yesUrl: "https://lancers.example/a/yes/y.11111111-1111-1111-1111-111111111111.abc",
    noUrl: "https://lancers.example/a/no/n.11111111-1111-1111-1111-111111111111.xyz",
    venue: "Iffley Road Sports Centre",
    deadlineLabel: "Tuesday 13 October, 20:00",
    attendingCount: 18,
    changeSummary: "The venue moved to the University Parks.",
    cancellationReason: "The pitch is waterlogged.",
    outstandingCount: 6,
    queueUrl: "https://lancers.example/operate/follow-ups",
    formUrl: "https://lancers.example/me/abc",
    stopUrl: "https://lancers.example/me/abc/stop",
    ...overrides,
  };
}

describe("every declared template", () => {
  it("renders exactly as many parameters as it declares", () => {
    for (const kind of MESSAGE_KINDS) {
      const template = MESSAGE_TEMPLATES[kind];
      const rendered = template.parameters(message({ kind }));
      expect(rendered, `${kind} parameter count`).toHaveLength(template.parameterNames.length);
      for (const value of rendered) {
        expect(typeof value).toBe("string");
        expect(value.trim(), `${kind} has a blank parameter`).not.toBe("");
      }
    }
  });

  it("covers all fourteen kinds and gives each one a distinct canonical name", () => {
    // Six from LAN-169, plus LAN-203's five recruit kinds — see
    // `recruit_event_followup` and the four capture-cycle templates below —
    // plus LAN-215's one door-independent onboarding welcome, plus LAN-218's
    // chase and its own escalation.
    expect(MESSAGE_KINDS).toHaveLength(14);
    expect(Object.keys(MESSAGE_TEMPLATES).sort()).toEqual([...MESSAGE_KINDS].sort());
    expect(new Set(Object.values(TEMPLATE_NAMES)).size).toBe(14);
  });

  it("renders a subject and a non-empty body for each", () => {
    for (const kind of MESSAGE_KINDS) {
      const template = MESSAGE_TEMPLATES[kind];
      expect(template.subject(message({ kind })).trim()).not.toBe("");
      expect(template.body(message({ kind })).length).toBeGreaterThan(1);
    }
  });

  it("refuses to render a message whose template needs a field it was not given", () => {
    // A blank parameter is a message that reads "Cancelled: undefined". Refusing
    // is the honest answer: the job records a failure a human can read rather
    // than the club sending nonsense.
    expect(() =>
      MESSAGE_TEMPLATES.cancellation.parameters(message({ kind: "cancellation", eventName: "" })),
    ).toThrowError(/event name/);
  });
});

describe("the invitation", () => {
  it("carries five body parameters in the approved order and no raw URL in body copy", () => {
    // LAN-335: name, event, when, venue, deadline. The two answers are
    // WhatsApp URL buttons, declared through `buttonUrls`, not body text.
    expect(MESSAGE_TEMPLATES.invitation.parameterNames).toEqual([
      "inviteeName",
      "eventName",
      "whenLabel",
      "venue",
      "deadlineLabel",
    ]);
    expect(MESSAGE_TEMPLATES.invitation.parameters(message({ kind: "invitation" }))).toEqual([
      "Jamie",
      "Michaelmas week 3",
      "Wednesday 14 October, 20:00",
      "Iffley Road Sports Centre",
      "Tuesday 13 October, 20:00",
    ]);
  });

  it("repeats the event's start as the deadline slot when no response deadline was recorded", () => {
    const rendered = MESSAGE_TEMPLATES.invitation.parameters(
      message({ kind: "invitation", deadlineLabel: null }),
    );
    expect(rendered[4]).toBe("Wednesday 14 October, 20:00");
  });

  it("fills the venue slot with words rather than a blank when no venue is on file", () => {
    // Meta's positional parameters cannot skip a slot, and the sink refuses
    // a blank one. "Venue: to be confirmed." is what the player reads.
    const rendered = MESSAGE_TEMPLATES.invitation.parameters(
      message({ kind: "invitation", venue: null }),
    );
    expect(rendered[3]).toBe(VENUE_FALLBACK);
  });

  it("declares the two answer buttons in Yes-then-No order", () => {
    const buttons = MESSAGE_TEMPLATES.invitation.buttonUrls?.(message({ kind: "invitation" }));
    expect(buttons).toEqual([
      "https://lancers.example/a/yes/y.11111111-1111-1111-1111-111111111111.abc",
      "https://lancers.example/a/no/n.11111111-1111-1111-1111-111111111111.xyz",
    ]);
  });

  it("refuses to render its buttons when a Yes or No link is missing", () => {
    expect(() =>
      MESSAGE_TEMPLATES.invitation.buttonUrls?.(message({ kind: "invitation", yesUrl: null })),
    ).toThrowError(/Yes link/);
  });

  it("is what an unset kind resolves to", () => {
    // The default carries the RSVP link and does the real work, so a kind that
    // arrived unset produces a message somebody can answer rather than one they
    // cannot.
    expect(templateFor(message()).kind).toBe("invitation");
  });
});

describe("the chase", () => {
  it("carries name, event, when and venue on WhatsApp, and never the count", () => {
    // LAN-335: the approved reminder has no slot for social proof; the
    // email below keeps it.
    expect(MESSAGE_TEMPLATES.reminder.parameterNames).toEqual([
      "inviteeName",
      "eventName",
      "whenLabel",
      "venue",
    ]);
    expect(MESSAGE_TEMPLATES.reminder.parameters(message({ kind: "reminder" }))).not.toContain(
      "18 other people have already said yes.",
    );
  });

  it("names the count of others on the email reminder, and never zero", () => {
    const withCount = MESSAGE_TEMPLATES.reminder.body(message({ kind: "reminder" })).join("\n");
    expect(withCount).toContain("18 other people have already said yes.");

    // Omitted rather than rendered as zero. "0 people have already said Yes" is
    // true, useless, and reads as a broken template.
    const withoutCount = MESSAGE_TEMPLATES.reminder
      .body(message({ kind: "reminder", attendingCount: 0 }))
      .join("\n");
    expect(withoutCount).not.toMatch(/already said yes/);
  });

  it("carries Brian's amended button labels, with no em dashes anywhere", () => {
    // Q-10: alphanumerics and spaces only, on every button label this mission
    // ships. Brian amended the approved W2 copy himself.
    expect(YES_BUTTON_LABEL).toBe("Yes view details");
    expect(NO_BUTTON_LABEL).toBe("No give reason");
    for (const label of [YES_BUTTON_LABEL, NO_BUTTON_LABEL]) {
      expect(label).toMatch(/^[A-Za-z0-9 ]+$/);
    }
    expect(MESSAGE_TEMPLATES.reminder.body(message({ kind: "reminder" })).join("\n")).not.toContain(
      "—",
    );
  });
});

describe("the cancellation", () => {
  it("offers no link, because there is nothing left to answer", () => {
    const body = MESSAGE_TEMPLATES.cancellation.body(message({ kind: "cancellation" })).join("\n");
    expect(body).not.toContain("https://lancers.example/rsvp/");
    expect(body).toContain("No action is needed. Thank you.");
    // LAN-335: the reason is the fourth body parameter, and the dispatcher
    // supplies the fixed generic sentence, never the operator's own note.
    expect(MESSAGE_TEMPLATES.cancellation.parameterNames).toEqual([
      "inviteeName",
      "eventName",
      "whenLabel",
      "cancellationReason",
    ]);
  });
});

describe("the change notice", () => {
  it("says the player's answer still stands", () => {
    // `REQ-history-is-never-rewritten`: a standing answer survives an
    // amendment, so the message says so rather than asking for it again as
    // though nothing had been recorded.
    const body = MESSAGE_TEMPLATES.change_notice
      .body(message({ kind: "change_notice" }))
      .join("\n");
    expect(body).toContain("Your response still stands");
    expect(body).toContain(`${CHANGE_ANSWER_LABEL}: https://lancers.example/rsvp/abc`);
    // LAN-335: name, event, new when, summary — the venue left the WhatsApp
    // body (the summary says whether it changed).
    expect(MESSAGE_TEMPLATES.change_notice.parameterNames).toEqual([
      "inviteeName",
      "eventName",
      "whenLabel",
      "changeSummary",
    ]);
  });
});

describe("the nudge", () => {
  it("carries name, event and when, and one button on the player's RSVP link", () => {
    expect(MESSAGE_TEMPLATES.nudge.parameterNames).toEqual([
      "inviteeName",
      "eventName",
      "whenLabel",
    ]);
    expect(MESSAGE_TEMPLATES.nudge.buttonCount).toBe(1);
    expect(MESSAGE_TEMPLATES.nudge.buttonUrls?.(message({ kind: "nudge" }))).toEqual([
      "https://lancers.example/rsvp/abc",
    ]);
    expect(MESSAGE_TEMPLATES.nudge.body(message({ kind: "nudge" })).join("\n")).toContain(
      `${ANSWER_QUESTIONS_LABEL}: https://lancers.example/rsvp/abc`,
    );
  });
});

describe("the escalation", () => {
  const escalation = message({ kind: "escalation" });

  it("declares no name parameter at all", () => {
    // Not "does not currently put a name in one". A template with a name slot
    // is a template something can later put a player's name into, so the slot
    // itself is what must not exist.
    expect(MESSAGE_TEMPLATES.escalation.parameterNames).toEqual([
      "outstandingCount",
      "eventName",
      "whenLabel",
      "deadlineLabel",
    ]);
    expect(MESSAGE_TEMPLATES.escalation.parameterNames).not.toContain("inviteeName");
  });

  it("never sends the queue link as a parameter — the approved body hardcodes it", () => {
    // LAN-335: Meta refuses a body variable holding a URL. The WhatsApp
    // payload carries a bare count; the email still carries the queue link.
    expect(MESSAGE_TEMPLATES.escalation.parameterNames).not.toContain("queueUrl");
    expect(MESSAGE_TEMPLATES.escalation.buttonCount).toBeUndefined();
    expect(MESSAGE_TEMPLATES.escalation.parameters(escalation)).toEqual([
      "6",
      "Michaelmas week 3",
      "Wednesday 14 October, 20:00",
      "Tuesday 13 October, 20:00",
    ]);
  });

  it("carries no player personal data in its rendered body", () => {
    const body = MESSAGE_TEMPLATES.escalation.body(escalation);

    expect(escalationCarriesNoPersonalData(body)).toBe(true);
    expect(body.join("\n")).not.toContain("Jamie");
    expect(body.join("\n")).not.toContain("447700900001");
    // The reason a player gave for saying no is the most sensitive field on the
    // message object, and it must not reach a committee phone.
    expect(body.join("\n")).not.toContain("waterlogged");
  });

  it("says how many, for which event, by when, and links to the queue", () => {
    const body = MESSAGE_TEMPLATES.escalation.body(escalation).join("\n");
    expect(body).toContain("6 people have not answered");
    expect(body).toContain("Michaelmas week 3");
    expect(body).toContain("Tuesday 13 October, 20:00");
    expect(body).toContain("https://lancers.example/operate/follow-ups");
  });

  it("reads naturally when exactly one person has not answered", () => {
    const body = MESSAGE_TEMPLATES.escalation
      .body(message({ kind: "escalation", outstandingCount: 1 }))
      .join("\n");
    expect(body).toContain("One person has not answered");
    expect(body).not.toContain("1 people");
  });

  it("is caught by the personal-data check when something does leak in", () => {
    // The guard has to be able to fail, or it proves nothing about the body it
    // passed. A telephone number and an email address are the two shapes a
    // person most often arrives as.
    expect(escalationCarriesNoPersonalData(["Ring Jamie on +44 7700 900001."])).toBe(false);
    expect(escalationCarriesNoPersonalData(["Email jamie@example.com."])).toBe(false);
  });
});

describe("the onboarding chase", () => {
  it("carries the same compiled-ask link the welcome does, and never names what is missing", () => {
    const body = MESSAGE_TEMPLATES.onboarding_chase
      .body(message({ kind: "onboarding_chase" }))
      .join("\n");
    expect(body).toContain("https://lancers.example/me/abc");
    // OD7-no-targeted-ask: never a one-fact ask, so the body cannot single
    // out one required field or checklist item by name.
    expect(body).not.toMatch(/college|matriculation|degree|emergency contact/i);
  });

  it("carries only its personal-page button", () => {
    const buttons = MESSAGE_TEMPLATES.onboarding_chase.buttonUrls?.(
      message({ kind: "onboarding_chase" }),
    );
    expect(buttons).toEqual(["https://lancers.example/me/abc"]);
  });
});

describe("the onboarding chase escalation", () => {
  const escalation = message({ kind: "onboarding_chase_escalation" });

  it("declares no name parameter at all", () => {
    // LAN-335: a bare count. The queue URL is hardcoded in the approved body.
    expect(MESSAGE_TEMPLATES.onboarding_chase_escalation.parameterNames).toEqual([
      "outstandingCount",
    ]);
    expect(MESSAGE_TEMPLATES.onboarding_chase_escalation.parameterNames).not.toContain(
      "inviteeName",
    );
  });

  it("carries no player personal data in its rendered body", () => {
    const body = MESSAGE_TEMPLATES.onboarding_chase_escalation.body(escalation);

    expect(escalationCarriesNoPersonalData(body)).toBe(true);
    expect(body.join("\n")).not.toContain("Jamie");
    expect(body.join("\n")).not.toContain("447700900001");
  });

  it("carries the packet's own exact wording — a count and a link, nothing else", () => {
    const body = MESSAGE_TEMPLATES.onboarding_chase_escalation
      .body(message({ kind: "onboarding_chase_escalation", outstandingCount: 3 }))
      .join(" ");
    // LAN-335: "answers", not "details" — `details` is a classifier trigger.
    expect(body).toContain(
      "The automated chase has finished for 3 players who still have onboarding answers " +
        "outstanding.",
    );
    expect(body).toContain("https://lancers.example/operate/follow-ups");
  });
});

describe("choosing a template name", () => {
  const config = { templateName: "club_invitation_v3" } as Parameters<typeof templateNameFor>[1];

  it("uses the invitation name a configured deployment already has", () => {
    // `WHATSAPP_TEMPLATE_NAME` is required by `config.ts` and set on every
    // configured deployment, so LAN-124's live-provider path keeps sending
    // exactly what it sends today and this registry adds no new required
    // configuration at all.
    expect(templateNameVariable("invitation")).toBe("WHATSAPP_TEMPLATE_NAME");
    expect(templateNameFor("invitation", config, {})).toBe("club_invitation_v3");
  });

  it("falls back to the club's canonical name for every other kind", () => {
    expect(templateNameFor("reminder", config, {})).toBe(TEMPLATE_NAMES.reminder);
    expect(templateNameFor("escalation", config, {})).toBe(TEMPLATE_NAMES.escalation);
  });

  it("honours a per-kind override, because a sandbox number carries other templates", () => {
    expect(
      templateNameFor("reminder", config, { WHATSAPP_TEMPLATE_REMINDER: "sandbox_reminder" }),
    ).toBe("sandbox_reminder");
  });
});

// ---------------------------------------------------------------------------
// LAN-199, LAN-203 — the five recruit templates
// ---------------------------------------------------------------------------

describe("the recruit event follow-up", () => {
  it("carries the recruit's name and the event's three facts, with LAN-199's yes/no buttons", () => {
    expect(MESSAGE_TEMPLATES.recruit_event_followup.parameterNames).toEqual([
      "inviteeName",
      "eventName",
      "whenLabel",
      "venue",
    ]);
    expect(
      MESSAGE_TEMPLATES.recruit_event_followup.parameters(
        message({ kind: "recruit_event_followup" }),
      ),
    ).toEqual([
      "Jamie",
      "Michaelmas week 3",
      "Wednesday 14 October, 20:00",
      "Iffley Road Sports Centre",
    ]);

    const buttons = MESSAGE_TEMPLATES.recruit_event_followup.buttonUrls?.(
      message({ kind: "recruit_event_followup" }),
    );
    expect(buttons).toEqual([
      "https://lancers.example/a/yes/y.11111111-1111-1111-1111-111111111111.abc",
      "https://lancers.example/a/no/n.11111111-1111-1111-1111-111111111111.xyz",
    ]);
  });

  it("carries both answer links in the email body, not just the WhatsApp buttons", () => {
    // Correction B1: buildEmailBody (src/lib/delivery/email.ts) renders only
    // template.body(message) — it never reads buttonUrls. Every other
    // template with buttonUrls repeats those URLs as text inside body() for
    // exactly this reason; this template must too, or an email recipient
    // whose WhatsApp job fell back to email (the reachable path is an
    // unconvertible or unallowlisted number, see delivery.ts's unconditional
    // scheduleWhatsAppFallbackIn) has no way to answer at all.
    const body = MESSAGE_TEMPLATES.recruit_event_followup
      .body(message({ kind: "recruit_event_followup" }))
      .join("\n");
    expect(body).toContain(
      "Yes I can come: https://lancers.example/a/yes/y.11111111-1111-1111-1111-111111111111.abc",
    );
    expect(body).toContain(
      "No thanks: https://lancers.example/a/no/n.11111111-1111-1111-1111-111111111111.xyz",
    );
  });

  it("never carries a count, and never implies obligation", () => {
    // REQ-never-harsh: no message tells a recruit they are required to be
    // anywhere and nothing here carries a count of anyone.
    const body = MESSAGE_TEMPLATES.recruit_event_followup
      .body(message({ kind: "recruit_event_followup" }))
      .join("\n");
    expect(body).toContain("No need to decide in advance.");
    expect(body).not.toMatch(/\d+ (people|others)/);
    expect(body).not.toMatch(/required|must/i);
  });

  it("fills the venue slot with words rather than sending a blank parameter when there is no venue yet", () => {
    // Meta's positional parameters cannot skip a slot.
    const rendered = MESSAGE_TEMPLATES.recruit_event_followup.parameters(
      message({ kind: "recruit_event_followup", venue: null }),
    );
    expect(rendered[3]).toBe(VENUE_FALLBACK);
  });
});

describe("the recruitment cycle's four templates", () => {
  const FOUR = [
    "recruit_welcome",
    "recruit_details_reminder",
    "recruit_interest_ask",
    "recruit_interest_reminder",
  ] as const;

  it("each carries name, a fixed subject and the day the recruit was added — LAN-336", () => {
    // Meta's classifier requires `for {{thing}} on {{date}}`; Brian chose the
    // day the person was added as a recruit as the date, and the subject
    // carries "opened" so the sentence does not read as though the
    // recruitment were on that day. `whenLabel` carries the date.
    for (const kind of FOUR) {
      expect(MESSAGE_TEMPLATES[kind].parameterNames).toEqual([
        "inviteeName",
        "subject",
        "openedOn",
      ]);
      const rendered = MESSAGE_TEMPLATES[kind].parameters(
        message({ kind, whenLabel: "11 September" }),
      );
      expect(rendered[0]).toBe("Jamie");
      expect(rendered[2]).toBe("11 September");
    }
    expect(MESSAGE_TEMPLATES.recruit_welcome.parameters(message())[1]).toBe(RECRUITMENT_SUBJECT);
    expect(MESSAGE_TEMPLATES.recruit_details_reminder.parameters(message())[1]).toBe(
      RECRUITMENT_SUBJECT,
    );
    // The two questionnaire asks are told apart from the sign-up pair by the
    // subject alone — the distinguishing clause was rejected by the classifier.
    expect(MESSAGE_TEMPLATES.recruit_interest_ask.parameters(message())[1]).toBe(INTEREST_SUBJECT);
    expect(MESSAGE_TEMPLATES.recruit_interest_reminder.parameters(message())[1]).toBe(
      INTEREST_SUBJECT,
    );
  });

  it("refuses to render without the date the recruit was added", () => {
    expect(() =>
      MESSAGE_TEMPLATES.recruit_welcome.parameters(
        message({ kind: "recruit_welcome", whenLabel: "" }),
      ),
    ).toThrowError(/date opened/);
  });

  it("every one of the four carries exactly one button, the form link — never an opt-out button", () => {
    // LAN-335: Meta will not classify a template carrying an opt-out button
    // as Utility, so no recruit template carries one. LAN-337 owns the
    // replacement surface. The email keeps its opt-out line.
    for (const kind of FOUR) {
      expect(MESSAGE_TEMPLATES[kind].buttonCount).toBe(1);
      expect(MESSAGE_TEMPLATES[kind].buttonUrls?.(message({ kind }))).toEqual([
        "https://lancers.example/me/abc",
      ]);
      const body = MESSAGE_TEMPLATES[kind].body(message({ kind })).join("\n");
      expect(body).toContain(`${ANSWER_QUESTIONS_LABEL}: https://lancers.example/me/abc`);
      expect(body).toContain(`${RECRUIT_STOP_MESSAGES_LABEL}: https://lancers.example/me/abc/stop`);
    }
  });

  it("never asks a recruit for permission to send WhatsApp messages", () => {
    // Consent is obtained in person, at the door — a WhatsApp message asking
    // permission to send WhatsApp messages would itself require consent it
    // does not have (LAN-199's own reasoning for why no such template exists).
    for (const kind of FOUR) {
      const body = MESSAGE_TEMPLATES[kind].body(message({ kind })).join("\n").toLowerCase();
      expect(body).not.toMatch(/permission|opt.?in|consent/);
    }
  });
});

describe("the button labels", () => {
  it("are Q-10's alphanumerics-and-spaces shape, no em dashes, exactly as Meta accepted them", () => {
    // LAN-335: button labels are classified content. "Fill in your details"
    // and "Finish here" were rejected; these six were accepted.
    const labels = [
      YES_BUTTON_LABEL,
      NO_BUTTON_LABEL,
      ANSWER_QUESTIONS_LABEL,
      CHANGE_ANSWER_LABEL,
      RECRUIT_YES_LABEL,
      RECRUIT_NO_LABEL,
      RECRUIT_STOP_MESSAGES_LABEL,
    ];
    for (const label of labels) expect(label).toMatch(/^[A-Za-z0-9 ]+$/);

    expect(ANSWER_QUESTIONS_LABEL).toBe("Answer questions");
    expect(CHANGE_ANSWER_LABEL).toBe("Change your answer");
    expect(RECRUIT_YES_LABEL).toBe("Yes I can come");
    expect(RECRUIT_NO_LABEL).toBe("No thanks");
  });
});

describe("the five recruit template names", () => {
  it("match LAN-199's own manifest exactly, including the _v1 suffix", () => {
    expect(TEMPLATE_NAMES.recruit_welcome).toBe("recruit_welcome_v1");
    expect(TEMPLATE_NAMES.recruit_details_reminder).toBe("recruit_details_reminder_v1");
    expect(TEMPLATE_NAMES.recruit_interest_ask).toBe("recruit_interest_ask_v1");
    expect(TEMPLATE_NAMES.recruit_event_followup).toBe("recruit_event_followup_v1");
    expect(TEMPLATE_NAMES.recruit_interest_reminder).toBe("recruit_interest_reminder_v1");
  });
});

describe("the onboarding welcome — LAN-215, REQ-one-welcome", () => {
  it("is the same one template regardless of which door queued it", () => {
    // There is exactly one declaration for `onboarding_welcome` — the whole
    // of what "door-independent" means at the template layer: nothing here
    // takes a "which door" parameter for the template to branch on.
    const template = MESSAGE_TEMPLATES.onboarding_welcome;
    expect(template.kind).toBe("onboarding_welcome");
    // LAN-336: name, the fixed onboarding subject, and the day the person
    // was added to onboarding.
    expect(template.parameterNames).toEqual(["inviteeName", "subject", "openedOn"]);
    expect(
      template.parameters(message({ kind: "onboarding_welcome", whenLabel: "11 September" })),
    ).toEqual(["Jamie", ONBOARDING_SUBJECT, "11 September"]);
    expect(
      MESSAGE_TEMPLATES.onboarding_chase.parameters(message({ whenLabel: "11 September" })),
    ).toEqual(["Jamie", ONBOARDING_SUBJECT, "11 September"]);
  });

  it("carries only its durable personal-page button", () => {
    const rendered = MESSAGE_TEMPLATES.onboarding_welcome.buttonUrls?.(
      message({
        kind: "onboarding_welcome",
        formUrl: "https://lancers.example/me/abc",
        stopUrl: "https://lancers.example/me/stop/abc",
      }),
    );
    expect(rendered).toEqual(["https://lancers.example/me/abc"]);
  });

  it("refuses to render without the durable link", () => {
    expect(() =>
      MESSAGE_TEMPLATES.onboarding_welcome.body(
        message({ kind: "onboarding_welcome", formUrl: null }),
      ),
    ).toThrowError(/link/);
  });

  it("carries a canonical, unapproved-so-far template name", () => {
    expect(TEMPLATE_NAMES.onboarding_welcome).toBe("onboarding_welcome_v1");
  });
});
