// @vitest-environment jsdom
/**
 * `RecruitmentRecordView` — `W2`, correction round 1 (F-LAN204-005).
 *
 * `record-view.tsx` and `send-questionnaire-button.tsx` are rendered
 * directly (not through the page or the gate — `recruitment-prospect.test.ts`
 * and `board-actions.test.ts` already prove authorization and the write
 * paths against the real database and a mocked service layer respectively).
 * What this file proves is `W2-04`'s own three-place redundancy: a banner at
 * the top of the record, and a dialog that is actually reachable when the
 * club will not message this recruit — not a native `disabled` button that
 * silently makes the explanation unreachable, which is exactly what shipped
 * the first time (F-LAN204-005).
 */
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

vi.mock("./actions", () => ({
  addRecruitmentNoteAction: vi.fn().mockResolvedValue({ error: null }),
  sendRecruitmentQuestionnaireAction: vi
    .fn()
    .mockResolvedValue({ error: null, created: [], reason: "not_consented" }),
}));
vi.mock("../status-cell", () => ({
  default: () => null,
}));

import type { PersonRecord, PersonContactValue } from "@/lib/services/person-record";
import type { RecruitmentProspectRecord } from "@/lib/services/recruitment-prospect";
import { selectMobileNumber } from "@/lib/delivery/phone-shape";
import { DEFAULT_CALLING_CODE } from "@/lib/services/person-validation";
import {
  ContactSection,
  IdentitySection,
} from "@/app/operate/people/[personId]/identity-contact-sections";
import {
  AcademicSection,
  RestrictedSection,
} from "@/app/operate/people/[personId]/academic-restricted-sections";
import StatusSection from "@/app/operate/people/[personId]/status-section";
import RecruitmentRecordView from "./record-view";
import { sendRecruitmentQuestionnaireAction } from "./actions";

const BASE_RECORD: RecruitmentProspectRecord = {
  prospectId: "prospect-1",
  personId: "person-1",
  seasonId: "season-1",
  seasonLabel: "2026-27",
  displayName: "Ambrose Kittiwake",
  status: "engaged",
  source: "Freshers' fair",
  firstContactOn: "2026-05-01",
  committedOn: null,
  convertedMembershipId: null,
  consent: "never_asked",
  consentSource: null,
  personal: { lastSentAt: null, queuedFor: null },
  recruitment: { lastSentAt: null, queuedFor: null },
  answers: {
    playedBefore: null,
    watchedBefore: null,
    positionInterest: null,
    gearOwned: null,
    howTheyHeard: null,
    anythingElse: null,
  },
  events: [],
  notes: [],
  statusHistory: [],
};

const NO_PERSON: Partial<PersonRecord> = {};

/** Everything `readPersonRecord` assembles, populated, for the parity test below. */
const FULL_PERSON: PersonRecord = {
  personId: "person-1",
  givenName: "Ambrose",
  givenNameSource: "Rowan Ashdown",
  familyName: "Kittiwake",
  familyNameSource: null,
  aliases: [
    { id: "alias-1", alias: "Bram", isDisplayName: true, source: null, notedAt: new Date() },
  ],
  displayName: "Ambrose Kittiwake",
  knownAs: "Bram",
  status: "recruit",
  college: "Kestrelhall",
  collegeSource: null,
  matriculationYear: 2026,
  matriculationYearSource: null,
  expectedGraduationYear: 2029,
  expectedGraduationYearSource: null,
  degreeField: "Human Sciences",
  degreeFieldSource: null,
  studentNumber: "1234567",
  studentNumberSource: null,
  bafaRegistrationNumber: "BAFA-9",
  bafaRegistrationNumberSource: null,
  dateOfBirth: "2006-04-12",
  dateOfBirthSource: null,
  emergencyContact: {
    givenName: "Rosalind",
    familyName: "Kittiwake",
    relationship: "Mother",
    phone: "07700 900555",
    email: "rosalind@example.test",
  },
  contacts: [
    {
      id: "contact-1",
      kind: "phone",
      scope: null,
      rawValue: "07700 900321",
      normalisedValue: "+447700900321",
      isPreferred: true,
      source: "sign-up form",
      validFrom: new Date(),
      validUntil: null,
    },
    {
      id: "contact-2",
      kind: "email",
      scope: "personal",
      rawValue: "bram@example.test",
      normalisedValue: null,
      isPreferred: true,
      source: null,
      validFrom: new Date(),
      validUntil: null,
    },
  ],
  isPastMember: false,
  standingIsOverridden: false,
  isUnder18: false,
  halfBlueCount: 0,
  fullBlueCount: 0,
  mergedIntoPersonId: null,
  missingRequiredFields: [],
};

/** Every labelled fact the render put on the page, in order. */
function labelsOf(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("[data-label]")).map(
    (node) => node.getAttribute("data-label") ?? "",
  );
}

/**
 * LAN-307. Brian opened an identified recruit before sending the personal
 * questionnaire and found four academic fields where the person record holds
 * everything: no phone number, so no way to check the destination, and no link
 * to the canonical page either. The fix is not "add a phone field" — it is that
 * this page renders the person page's own sections, from the same record under
 * the same redaction, so the two cannot drift again.
 *
 * Parity is asserted against those components rather than against a list
 * written out here: a field added to the person record appears on both surfaces
 * or this fails.
 */
describe("LAN-307 — the recruit record shows the whole person record", () => {
  it("renders every labelled fact the canonical person sections render", () => {
    const canonical = render(
      <div>
        <IdentitySection record={FULL_PERSON} />
        <ContactSection record={FULL_PERSON} currentSeasonLabel="2026-27" />
        <AcademicSection record={FULL_PERSON} />
        <RestrictedSection record={FULL_PERSON} />
        <StatusSection record={FULL_PERSON} roles={[]} alumniLabel="Never a member" />
      </div>,
    );
    const expected = labelsOf(canonical.container);
    expect(expected.length).toBeGreaterThan(10);
    canonical.unmount();

    const recruit = render(
      <RecruitmentRecordView
        record={BASE_RECORD}
        person={FULL_PERSON}
        currentSeasonLabel="2026-27"
      />,
    );
    const shown = new Set(labelsOf(recruit.container));
    expect([...expected].filter((label) => !shown.has(label))).toEqual([]);
  });

  it("shows the recorded destination beside the questionnaire actions", () => {
    render(<RecruitmentRecordView record={BASE_RECORD} person={FULL_PERSON} />);
    const person = screen.getByTestId("section-person");
    expect(person.textContent).toContain("Sends to");
    expect(person.textContent).toContain(
      `+${selectMobileNumber(FULL_PERSON.contacts, DEFAULT_CALLING_CODE)!}`,
    );
    // The action it qualifies is in the same card, not a section away.
    expect(person.querySelector('[data-testid="recruitment-send-personal"]')).not.toBeNull();
  });

  /**
   * R7-1. "Sends to" ordered the contacts the way the dispatcher does and then
   * printed the chosen contact's raw string. The dispatcher does not stop at
   * the first candidate — it stops at the first one `toE164` can convert — so a
   * preferred number nothing could be sent to was displayed as the destination
   * of a message that would in fact go somewhere else entirely.
   */
  describe("the destination is the one a send would use", () => {
    const phone = (over: Partial<PersonContactValue>): PersonContactValue => ({
      id: "c",
      kind: "phone",
      scope: null,
      rawValue: "07700 900321",
      normalisedValue: null,
      isPreferred: false,
      source: null,
      validFrom: new Date(),
      validUntil: null,
      ...over,
    });

    /** The row read out of the "Sends to" field, whatever it says. */
    function sendsTo(): string {
      const row = screen
        .getAllByTestId("record-row")
        .find((node) => node.getAttribute("data-label") === "Sends to")!;
      return row.textContent ?? "";
    }

    it("skips a preferred number the dispatcher could not convert", () => {
      // "7700 900321" carries no trunk zero and no calling code: `toE164`
      // refuses it rather than guessing, so the send falls through to the
      // second contact. Preferred, and still not the destination.
      const contacts = [
        phone({ id: "unconvertible", rawValue: "7700 900321", isPreferred: true }),
        phone({ id: "reachable", rawValue: "07700 900987" }),
      ];
      render(<RecruitmentRecordView record={BASE_RECORD} person={{ ...FULL_PERSON, contacts }} />);

      const chosen = selectMobileNumber(contacts, DEFAULT_CALLING_CODE);
      expect(chosen).toBe("447700900987");
      expect(sendsTo()).toContain(`+${chosen!}`);
      expect(sendsTo()).not.toContain("7700 900321");
    });

    it("reads not recorded when no recorded number converts", () => {
      const contacts = [
        phone({ id: "short", rawValue: "07700 90012", isPreferred: true }),
        phone({ id: "words", rawValue: "ask Sam" }),
      ];
      expect(selectMobileNumber(contacts, DEFAULT_CALLING_CODE)).toBeNull();

      render(<RecruitmentRecordView record={BASE_RECORD} person={{ ...FULL_PERSON, contacts }} />);
      expect(sendsTo()).toContain("not recorded");
    });

    it("ignores a number that stopped being theirs", () => {
      // `valid_until` is how the club records that. The dispatcher never sees
      // such a row, so neither may the field that claims to name its choice.
      const contacts = [
        phone({ id: "old", rawValue: "07700 900111", isPreferred: true, validUntil: new Date() }),
        phone({ id: "current", rawValue: "07700 900987" }),
      ];
      render(<RecruitmentRecordView record={BASE_RECORD} person={{ ...FULL_PERSON, contacts }} />);
      expect(sendsTo()).toContain("+447700900987");
    });

    /**
     * LAN-307's walk: the Mobile phone fact on the person record renders
     * `+447700900873` and this field rendered `447700900873` for the same
     * number, so an operator checking one against the other was comparing two
     * strings that did not look alike. E.164 is written with its `+`; the bare
     * digits are the provider's wire format, not the club's.
     */
    it("writes the destination the way the record writes the number", () => {
      const contacts = [phone({ id: "current", rawValue: "+447700900873" })];
      render(<RecruitmentRecordView record={BASE_RECORD} person={{ ...FULL_PERSON, contacts }} />);
      expect(sendsTo()).toContain("+447700900873");
    });
  });

  it("offers the canonical record, so a correction is still made in one place", () => {
    render(<RecruitmentRecordView record={BASE_RECORD} person={FULL_PERSON} />);
    const link = screen.getByTestId("open-person-record");
    expect(link.getAttribute("href")).toBe("/operate/people/person-1");
  });

  it("names a missing fact rather than hiding it", () => {
    const partial: Partial<PersonRecord> = {
      ...FULL_PERSON,
      college: null,
      knownAs: null,
      degreeField: null,
    };
    render(<RecruitmentRecordView record={BASE_RECORD} person={partial} />);
    const academic = screen
      .getAllByTestId("record-row")
      .find((row) => row.getAttribute("data-label") === "College")!;
    expect(academic.textContent).toContain("not recorded");
    // And the contact that is recorded is still shown — a partly complete
    // recruit must not lose the number the send needs.
    expect(screen.getByTestId("recruitment-record").textContent).toContain("07700 900321");
  });

  it("draws no restricted section for an operator whose payload does not carry one", () => {
    // What `redactPersonRecord` hands a role without the restricted category:
    // the fields are absent, not null. Nothing below may re-derive them.
    const identityOnly: Partial<PersonRecord> = {
      personId: FULL_PERSON.personId,
      givenName: FULL_PERSON.givenName,
      familyName: FULL_PERSON.familyName,
      aliases: FULL_PERSON.aliases,
      displayName: FULL_PERSON.displayName,
      knownAs: FULL_PERSON.knownAs,
    };
    render(<RecruitmentRecordView record={BASE_RECORD} person={identityOnly} />);

    const shown = new Set(labelsOf(screen.getByTestId("recruitment-record")));
    expect(shown.has("Date of birth")).toBe(false);
    expect(shown.has("Emergency contact")).toBe(false);
    expect(shown.has("Mobile phone")).toBe(false);
    expect(shown.has("College")).toBe(false);
    // Identity still renders, and so does the recruitment half of the page.
    expect(shown.has("Known as")).toBe(true);
    expect(screen.getByTestId("section-recruitment")).toBeTruthy();
    // No destination is claimed when no contact was supplied.
    expect(screen.getByTestId("section-person").textContent).toContain("not recorded");
  });
});

describe("the top-of-record banner — one of W2-04's three redundant places", () => {
  // LAN-204, item 9 (the consent deadlock, fixed): a never-asked recruit is
  // no longer "somebody the club will not message" — the personal
  // questionnaire is exactly how they get asked. BASE_RECORD's own
  // `consent: "never_asked"` is the deadlock's own starting state, so no
  // banner here is the fix, proved directly.
  it("renders no banner for a never-asked recruit — the personal send is what establishes consent", () => {
    render(<RecruitmentRecordView record={BASE_RECORD} person={NO_PERSON} />);
    expect(screen.queryByTestId("recruitment-cannot-message-banner")).toBeNull();
  });

  it("names the recruit and the reason when consent was refused", () => {
    render(
      <RecruitmentRecordView record={{ ...BASE_RECORD, consent: "refused" }} person={NO_PERSON} />,
    );
    const banner = screen.getByTestId("recruitment-cannot-message-banner");
    expect(banner.textContent).toContain("Ambrose Kittiwake");
    expect(banner.textContent).toContain("consent");
  });

  it("names the recruit and the reason when consent was withdrawn", () => {
    render(
      <RecruitmentRecordView
        record={{ ...BASE_RECORD, consent: "withdrawn" }}
        person={NO_PERSON}
      />,
    );
    const banner = screen.getByTestId("recruitment-cannot-message-banner");
    expect(banner.textContent).toContain("Ambrose Kittiwake");
    expect(banner.textContent).toContain("consent");
  });

  it("names the decline date when the recruit declined", () => {
    const record: RecruitmentProspectRecord = {
      ...BASE_RECORD,
      status: "declined",
      statusHistory: [
        {
          id: "event-1",
          fromStatus: "engaged",
          toStatus: "declined",
          occurredAt: "2026-05-02T10:00:00.000Z",
          actorLabel: "Rowan Ashdown",
          reason: null,
        },
      ],
    };
    render(<RecruitmentRecordView record={record} person={NO_PERSON} />);
    const banner = screen.getByTestId("recruitment-cannot-message-banner");
    expect(banner.textContent).toContain("Ambrose Kittiwake");
    expect(banner.textContent).toContain("Declined");
    expect(banner.textContent).toMatch(/\d{4}/); // the date renders, in some form
  });

  it("renders no banner once consent is granted and the recruit has not declined", () => {
    render(
      <RecruitmentRecordView record={{ ...BASE_RECORD, consent: "granted" }} person={NO_PERSON} />,
    );
    expect(screen.queryByTestId("recruitment-cannot-message-banner")).toBeNull();
  });
});

describe("the SEND button — never natively disabled (F-LAN204-005)", () => {
  it("is a real, clickable button even when the club will not message this recruit", () => {
    render(
      <RecruitmentRecordView record={{ ...BASE_RECORD, consent: "refused" }} person={NO_PERSON} />,
    );
    const button = screen.getByTestId("recruitment-send-personal");
    expect(button).toBeEnabled();
  });

  it("opens a dialog that states the refusal — the explanation a native `disabled` attribute made unreachable", () => {
    render(
      <RecruitmentRecordView record={{ ...BASE_RECORD, consent: "refused" }} person={NO_PERSON} />,
    );
    fireEvent.click(screen.getByTestId("recruitment-send-personal"));
    expect(screen.getByTestId("recruitment-send-personal-refused").textContent).toContain(
      "consent",
    );
  });

  it("carries no refusal dialog once consent is granted", () => {
    render(
      <RecruitmentRecordView record={{ ...BASE_RECORD, consent: "granted" }} person={NO_PERSON} />,
    );
    fireEvent.click(screen.getByTestId("recruitment-send-personal"));
    expect(screen.queryByTestId("recruitment-send-personal-refused")).toBeNull();
  });

  // LAN-204, item 9 — the deadlock's own UI proof: the personal send is
  // reachable for a never-asked recruit, because it is the one message that
  // establishes consent rather than requiring it already exist.
  it("carries no refusal dialog for a never-asked recruit — the deadlock, fixed", () => {
    render(<RecruitmentRecordView record={BASE_RECORD} person={NO_PERSON} />);
    fireEvent.click(screen.getByTestId("recruitment-send-personal"));
    expect(screen.queryByTestId("recruitment-send-personal-refused")).toBeNull();
  });

  it("the recruitment questionnaire keeps requiring granted consent — the strict gate is unchanged", () => {
    render(<RecruitmentRecordView record={BASE_RECORD} person={NO_PERSON} />);
    fireEvent.click(screen.getByTestId("recruitment-send-recruitment"));
    expect(screen.getByTestId("recruitment-send-recruitment-refused").textContent).toContain(
      "onsent",
    );
  });

  // `Q-read-back-authorises-how-much` (Brian, 2026-09-02, answered narrow):
  // a touchline read-back's grant authorises the welcome track alone.
  it("the recruitment questionnaire refuses a grant recorded at a walk-up read-back, not through the sign-up form", () => {
    render(
      <RecruitmentRecordView
        record={{ ...BASE_RECORD, consent: "granted", consentSource: "walk_up_read_back" }}
        person={NO_PERSON}
      />,
    );
    fireEvent.click(screen.getByTestId("recruitment-send-recruitment"));
    expect(screen.getByTestId("recruitment-send-recruitment-refused").textContent).toContain(
      "sign-up form",
    );
  });

  it("the recruitment questionnaire is sendable once consent was granted through the sign-up form", () => {
    render(
      <RecruitmentRecordView
        record={{ ...BASE_RECORD, consent: "granted", consentSource: "qr_self_entry" }}
        person={NO_PERSON}
      />,
    );
    fireEvent.click(screen.getByTestId("recruitment-send-recruitment"));
    expect(screen.queryByTestId("recruitment-send-recruitment-refused")).toBeNull();
  });
});

describe("the Person and Recruitment bands — stacked, not side by side (Brian, 2026-09-02)", () => {
  // "The bands are side by side when really they should be layered on top of
  // each other." Asserts the rendered DOM shape, not a class name: today
  // (reverted) each band sits in its own separate half-width Grid item, so
  // the two Section roots do not share an immediate parent — each one's
  // parent is its own Grid item, one level further from the other's. Once
  // they are plain full-width children of one stack, in order, they do.
  it("renders Person then Recruitment as direct siblings of one full-width container, in that order", () => {
    render(<RecruitmentRecordView record={BASE_RECORD} person={NO_PERSON} />);
    const person = screen.getByTestId("section-person");
    const recruitment = screen.getByTestId("section-recruitment");

    expect(person.parentElement).not.toBeNull();
    expect(person.parentElement).toBe(recruitment.parentElement);

    const container = person.parentElement as HTMLElement;
    const children = Array.from(container.children);
    expect(children.indexOf(person)).toBeLessThan(children.indexOf(recruitment));
  });

  // LAN-253, and the same shape for the same reason (Brian, 2026-09-09:
  // stack them; they should not be side by side). The 2026-09-02 correction
  // above stacked Person and Recruitment and left Recruitment events and
  // Notes in a two-up Grid, so the record went full width, then half width,
  // then full width again. `LAN-204-recruit-board-record-exits-flip.md`:
  // "Every card is full width, stacked one above the other, in table order".
  it("renders Recruitment events, Notes and Status history as siblings of one full-width container, in that order", () => {
    render(<RecruitmentRecordView record={BASE_RECORD} person={NO_PERSON} />);
    const events = screen.getByTestId("section-events");
    const notes = screen.getByTestId("section-notes");
    const history = screen.getByTestId("section-status-history");

    expect(events.parentElement).not.toBeNull();
    expect(events.parentElement).toBe(notes.parentElement);
    expect(events.parentElement).toBe(history.parentElement);

    const children = Array.from((events.parentElement as HTMLElement).children);
    expect(children.indexOf(events)).toBeLessThan(children.indexOf(notes));
    expect(children.indexOf(notes)).toBeLessThan(children.indexOf(history));
  });
});

describe("LAN-248 — every recorded moment on the record reads the club's way", () => {
  const RECORD_WITH_HISTORY: RecruitmentProspectRecord = {
    ...BASE_RECORD,
    statusHistory: [
      {
        id: "event-1",
        fromStatus: "identified",
        toStatus: "engaged",
        occurredAt: "2026-09-08T18:31:20.000Z",
        actorLabel: "Wilhelmina Astor",
        reason: null,
      },
    ],
    notes: [
      {
        id: "note-1",
        note: "Spoke at the fair.",
        authorLabel: "Wilhelmina Astor",
        createdAt: "2026-09-08T18:31:20.000Z",
      },
    ],
  };

  // `9/8/2026, 7:31:20 PM` was what `toLocaleString()` with no arguments
  // produced here, on a page whose every other date reads day-month-year.
  // `docs/ux/standards.md` rule 3 fixes both the order and the clock.
  it("reads the Status history 'When' column as day-month-year on club time", () => {
    render(<RecruitmentRecordView record={RECORD_WITH_HISTORY} person={NO_PERSON} />);
    const history = screen.getByTestId("recruitment-record-history");
    expect(history.textContent).toContain("8 Sept 2026, 19:31");
    expect(history.textContent).not.toContain("9/8/2026");
    expect(history.textContent).not.toContain("PM");
  });

  it("stamps a note the same way, so one record never shows two spellings of one date", () => {
    render(<RecruitmentRecordView record={RECORD_WITH_HISTORY} person={NO_PERSON} />);
    const notes = screen.getByTestId("section-notes");
    expect(notes.textContent).toContain("8 Sept 2026, 19:31");
    expect(notes.textContent).not.toContain("9/8/2026");
  });
});

describe("V-7, correction round 2 — the status pill names its subject", () => {
  // Brian: the pill read "Engaged" alone, with nothing saying what was
  // engaged. Reverting to the bare `PROSPECT_STATUS_LABELS[record.status]`
  // label reproduces exactly that — this assertion fails against it.
  it("reads 'Recruit status · Engaged', not the bare status word", () => {
    render(<RecruitmentRecordView record={BASE_RECORD} person={NO_PERSON} />);
    // The pill in the header's own top-right corner, specifically — not the
    // headline strip's separate "Recruit status" Headline below it, which
    // (like the player record's own Headline) pairs a bare value with its
    // own caption underneath rather than a colon-joined string.
    expect(screen.getByText("Recruit status · Engaged")).not.toBeNull();
  });
});

describe("V-8, correction round 2 — the header follows the shipped player record's shape", () => {
  // The player record's own header carries "{season} membership · {entry} ·
  // {status}" under the name. This is the same rhythm over what a recruit's
  // record actually has.
  it("carries a season-and-status subtitle under the name", () => {
    render(<RecruitmentRecordView record={BASE_RECORD} person={NO_PERSON} />);
    expect(screen.getByTestId("recruitment-subtitle").textContent).toBe(
      "2026-27 recruitment · Engaged",
    );
  });

  // The player record's own "strip of labelled facts above the bands" —
  // brought into this record's own shape as four Headline items.
  it("renders a headline strip above the Person/Recruitment bands, with status, consent and both sends", () => {
    render(<RecruitmentRecordView record={BASE_RECORD} person={NO_PERSON} />);
    const strip = screen.getByTestId("recruitment-headline-strip");
    expect(strip.textContent).toContain("Recruit status");
    expect(strip.textContent).toContain("WhatsApp consent");
    expect(strip.textContent).toContain("Personal questionnaire");
    expect(strip.textContent).toContain("Recruitment questionnaire");
  });
});

describe("W-1, walk correction — a declined recruit's SEND buttons are disabled up front", () => {
  // Before the fix, both buttons rendered as ordinary active buttons for a
  // `declined` recruit and only reported the refusal one click later, inside
  // the confirm dialog — this fails against that shipped behaviour and
  // passes once `blockedByDecline` reaches the native `disabled` attribute.
  it("disables the personal questionnaire SEND button for a declined recruit", () => {
    render(
      <RecruitmentRecordView record={{ ...BASE_RECORD, status: "declined" }} person={NO_PERSON} />,
    );
    expect(screen.getByTestId("recruitment-send-personal")).toBeDisabled();
  });

  it("disables the recruitment questionnaire SEND button for a declined recruit", () => {
    render(
      <RecruitmentRecordView record={{ ...BASE_RECORD, status: "declined" }} person={NO_PERSON} />,
    );
    expect(screen.getByTestId("recruitment-send-recruitment")).toBeDisabled();
  });

  it("leaves both buttons enabled for a non-declined recruit the club will not message", () => {
    // Guards against over-broadening the fix to every refusal reason —
    // `refused` consent keeps the dialog-reachable pattern F-LAN204-005 shipped.
    render(
      <RecruitmentRecordView record={{ ...BASE_RECORD, consent: "refused" }} person={NO_PERSON} />,
    );
    expect(screen.getByTestId("recruitment-send-personal")).toBeEnabled();
  });
});

describe("V-6, correction round 2 — sending says something happened", () => {
  // Reverting the caption to always read "Not sent" once `lastSentAt` is
  // null — ignoring `queuedFor` — reproduces the defect Brian found: nothing
  // says a send was queued. This assertion fails against that.
  it("reads 'Queued for …' once a job is outstanding, not 'Not sent'", () => {
    render(
      <RecruitmentRecordView
        record={{
          ...BASE_RECORD,
          personal: { lastSentAt: null, queuedFor: "2099-09-05T12:00:00.000Z" },
        }}
        person={NO_PERSON}
      />,
    );
    const caption = screen.getByTestId("personal-send-caption");
    expect(caption.textContent).toMatch(/^Queued for/);
    expect(caption.textContent).not.toBe("Not sent");
  });

  it.each(["personal", "recruitment"] as const)(
    "uses awaiting dispatch for an overdue %s job",
    (track) => {
      render(
        <RecruitmentRecordView
          record={{
            ...BASE_RECORD,
            [track]: { lastSentAt: null, queuedFor: "2000-01-01T00:00:00Z" },
          }}
          person={NO_PERSON}
        />,
      );
      expect(screen.getByTestId(`${track}-send-caption`)).toHaveTextContent(
        "Queued — awaiting dispatch",
      );
    },
  );

  it("replaces a future caption when its due time arrives on an open page", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-08T12:00:00Z"));
    try {
      const view = render(
        <RecruitmentRecordView
          record={{
            ...BASE_RECORD,
            personal: { lastSentAt: null, queuedFor: "2026-09-08T12:00:01Z" },
          }}
          person={NO_PERSON}
        />,
      );
      expect(screen.getByTestId("personal-send-caption")).toHaveTextContent("Queued for");
      act(() => vi.advanceTimersByTime(1001));
      expect(screen.getByTestId("personal-send-caption")).toHaveTextContent(
        "Queued — awaiting dispatch",
      );
      view.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it("reads 'Sent — last sent …' once a delivery is accepted, even if a later job is also queued", () => {
    render(
      <RecruitmentRecordView
        record={{
          ...BASE_RECORD,
          recruitment: {
            lastSentAt: "2026-09-01T09:00:00.000Z",
            queuedFor: "2026-09-08T09:00:00.000Z",
          },
        }}
        person={NO_PERSON}
      />,
    );
    const caption = screen.getByTestId("recruitment-send-caption");
    expect(caption.textContent).toMatch(/^Sent — last sent/);
  });

  it("still reads 'Not sent' when nothing has been queued or sent at all", () => {
    render(<RecruitmentRecordView record={BASE_RECORD} person={NO_PERSON} />);
    expect(screen.getByTestId("personal-send-caption").textContent).toBe("Not sent");
    expect(screen.getByTestId("recruitment-send-caption").textContent).toBe("Not sent");
  });
});

describe("LAN-237 — the manual send reports the dispatch outcome", () => {
  it.each([
    ["accepted", "Sent."],
    ["refused", "Not sent — delivery could not be completed."],
    [
      "skipped",
      "Not sent — delivery is already in progress or this questionnaire is no longer eligible.",
    ],
  ] as const)(
    "reports %s without an optimistic Queued or Sent message",
    async (delivery, message) => {
      vi.mocked(sendRecruitmentQuestionnaireAction).mockResolvedValueOnce({
        error: null,
        created: ["welcome", "details_reminder"],
        reason: null,
        delivery,
      });
      render(<RecruitmentRecordView record={BASE_RECORD} person={NO_PERSON} />);
      fireEvent.click(screen.getByTestId("recruitment-send-personal"));
      fireEvent.click(screen.getByTestId("recruitment-send-personal-confirm"));
      expect(await screen.findByTestId("recruitment-send-personal-delivery")).toHaveTextContent(
        message,
      );
      expect(screen.queryByTestId("recruitment-send-personal-ok")).toBeNull();
      expect(screen.queryByTestId("recruitment-send-personal-no-op")).toBeNull();
    },
  );
});
