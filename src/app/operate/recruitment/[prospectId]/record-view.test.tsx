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
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("./actions", () => ({
  addRecruitmentNoteAction: vi.fn().mockResolvedValue({ error: null }),
  sendRecruitmentQuestionnaireAction: vi
    .fn()
    .mockResolvedValue({ error: null, created: [], reason: "not_consented" }),
}));
vi.mock("../status-cell", () => ({
  default: () => null,
}));

import type { PersonRecord } from "@/lib/services/person-record";
import type { RecruitmentProspectRecord } from "@/lib/services/recruitment-prospect";
import RecruitmentRecordView from "./record-view";

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
          personal: { lastSentAt: null, queuedFor: "2026-09-05T12:00:00.000Z" },
        }}
        person={NO_PERSON}
      />,
    );
    const caption = screen.getByTestId("personal-send-caption");
    expect(caption.textContent).toMatch(/^Queued for/);
    expect(caption.textContent).not.toBe("Not sent");
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
