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
  it("names the recruit and the reason when consent has not been granted", () => {
    render(<RecruitmentRecordView record={BASE_RECORD} person={NO_PERSON} />);
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
    render(<RecruitmentRecordView record={BASE_RECORD} person={NO_PERSON} />);
    const button = screen.getByTestId("recruitment-send-personal");
    expect(button).toBeEnabled();
  });

  it("opens a dialog that states the refusal — the explanation a native `disabled` attribute made unreachable", () => {
    render(<RecruitmentRecordView record={BASE_RECORD} person={NO_PERSON} />);
    fireEvent.click(screen.getByTestId("recruitment-send-personal"));
    expect(screen.getByTestId("recruitment-send-personal-refused").textContent).toContain(
      "Consent",
    );
  });

  it("carries no refusal dialog once consent is granted", () => {
    render(
      <RecruitmentRecordView record={{ ...BASE_RECORD, consent: "granted" }} person={NO_PERSON} />,
    );
    fireEvent.click(screen.getByTestId("recruitment-send-personal"));
    expect(screen.queryByTestId("recruitment-send-personal-refused")).toBeNull();
  });
});
