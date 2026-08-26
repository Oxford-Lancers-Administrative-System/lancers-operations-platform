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
  MESSAGE_KINDS,
  MESSAGE_TEMPLATES,
  NO_BUTTON_LABEL,
  TEMPLATE_NAMES,
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
    venue: "Iffley Road Sports Centre",
    deadlineLabel: "Tuesday 13 October, 20:00",
    attendingCount: 18,
    changeSummary: "The venue moved to the University Parks.",
    cancellationReason: "The pitch is waterlogged.",
    outstandingCount: 6,
    queueUrl: "https://lancers.example/operate/follow-ups",
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

  it("covers all six kinds and gives each one a distinct canonical name", () => {
    expect(MESSAGE_KINDS).toHaveLength(6);
    expect(Object.keys(MESSAGE_TEMPLATES).sort()).toEqual([...MESSAGE_KINDS].sort());
    expect(new Set(Object.values(TEMPLATE_NAMES)).size).toBe(6);
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
      MESSAGE_TEMPLATES.cancellation.parameters(
        message({ kind: "cancellation", cancellationReason: null }),
      ),
    ).toThrowError(/reason/);
  });
});

describe("the invitation", () => {
  it("keeps LAN-78's four parameters in their shipped order", () => {
    // The club's approved template already matches this contract. Reordering it
    // would need Meta's review again, and would deliver a correctly-formatted
    // message reading "Please confirm you can make it to 20:00, on Michaelmas
    // week 3" in the meantime.
    expect(MESSAGE_TEMPLATES.invitation.parameterNames).toEqual([
      "inviteeName",
      "eventName",
      "whenLabel",
      "rsvpUrl",
    ]);
    expect(MESSAGE_TEMPLATES.invitation.parameters(message({ kind: "invitation" }))).toEqual([
      "Jamie",
      "Michaelmas week 3",
      "Wednesday 14 October, 20:00",
      "https://lancers.example/rsvp/abc",
    ]);
  });

  it("is what an unset kind resolves to", () => {
    // The default carries the RSVP link and does the real work, so a kind that
    // arrived unset produces a message somebody can answer rather than one they
    // cannot.
    expect(templateFor(message()).kind).toBe("invitation");
  });
});

describe("the chase", () => {
  it("names the count of others on a reminder, and never zero", () => {
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
    expect(body).toContain("There is nothing you need to do.");
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
    expect(body).toContain("Your answer still stands");
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
      "queueUrl",
    ]);
    expect(MESSAGE_TEMPLATES.escalation.parameterNames).not.toContain("inviteeName");
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
