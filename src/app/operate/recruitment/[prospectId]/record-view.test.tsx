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
  personal: { lastSentAt: null },
  recruitment: { lastSentAt: null },
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
      <RecruitmentRecordView record={{ ...BASE_RECORD, consent: "withdrawn" }} person={NO_PERSON} />,
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
