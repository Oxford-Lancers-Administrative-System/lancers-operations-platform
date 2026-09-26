/**
 * The recruitment board and prospect record narrowed to a seat — LAN-432.
 * Pure: the rows and records are invented here, and the assertions are on the
 * objects the pages hand their client components.
 */
import { describe, expect, it } from "vitest";
import { mergeGrantRows } from "@/lib/auth/grants";
import type { RecruitmentBoardRow } from "./recruitment-board";
import type { RecruitmentProspectRecord } from "./recruitment-prospect";
import {
  recruitingAccessFor,
  redactProspectRecord,
  redactRecruitmentRow,
} from "./recruitment-board-access";

/** W3-04a's seat: View on Recruit details, nothing else. */
const DETAILS_VIEW = recruitingAccessFor(
  mergeGrantRows([
    {
      subject_kind: "recruiting_category",
      subject_key: "recruit_details",
      template_id: null,
      level: "view",
    },
  ]),
);

const ROW = {
  prospectId: "p1",
  personId: "person-1",
  displayName: "Persephone Wilding",
  aliases: ["Percy"],
  college: "Hallamshire",
  matriculationYear: 2026,
  expectedGraduationYear: 2029,
  degreeField: "History",
  hasMobile: true,
  hasEmail: true,
  phoneForCall: "+447700900555",
  status: "identified",
  source: "Referred by a current player",
  firstContactOn: "2026-05-12",
  personalSent: false,
  recruitmentSent: false,
  consent: "never_asked",
  consentChangedAt: null,
  consentByOperator: false,
  playedBefore: null,
  watchedBefore: null,
  positionInterest: null,
  gearOwned: null,
  howTheyHeard: null,
  anythingElse: null,
  events: { e1: { rsvp: "yes", attendance: null } },
  attendedAnyEvent: false,
} as unknown as RecruitmentBoardRow;

describe("redactRecruitmentRow", () => {
  it("View on Recruit details alone: the name, the ids and the Recruitment facts", () => {
    const row = redactRecruitmentRow(ROW, DETAILS_VIEW);
    expect(row.displayName).toBe("Persephone Wilding");
    expect(row.status).toBe("identified");
    expect(row.aliases).toEqual([]);
    for (const key of ["college", "hasMobile", "phoneForCall", "events", "attendedAnyEvent"]) {
      expect(key in row, key).toBe(false);
    }
    expect(JSON.stringify(row)).not.toContain("7700900555");
  });

  it("Personal sent follows Person information, as the record does — LAN-423", () => {
    expect("personalSent" in redactRecruitmentRow(ROW, DETAILS_VIEW)).toBe(false);
    const personOnly = recruitingAccessFor(
      mergeGrantRows([
        {
          subject_kind: "recruiting_category",
          subject_key: "recruit_person",
          template_id: null,
          level: "view",
        },
      ]),
    );
    const row = redactRecruitmentRow(ROW, personOnly);
    expect(row.personalSent).toBe(false);
    expect("recruitmentSent" in row).toBe(false);
  });
});

describe("redactProspectRecord", () => {
  const record = {
    prospectId: "p1",
    personId: "person-1",
    seasonId: "s1",
    seasonLabel: "2026-27",
    displayName: "Persephone Wilding",
    status: "identified",
    personal: { lastSentAt: null, queuedFor: null, cancelledReason: null },
    recruitment: { lastSentAt: null, queuedFor: null, cancelledReason: null },
    answers: {},
    events: [{ eventId: "e1" }],
    notes: [],
    statusHistory: [],
    consent: "never_asked",
  } as unknown as RecruitmentProspectRecord;

  it("locks Person information and Event details for W3-04b's seat", () => {
    const visible = redactProspectRecord(record, DETAILS_VIEW);
    expect("personal" in visible).toBe(false);
    expect("events" in visible).toBe(false);
    expect(visible.status).toBe("identified");
    expect(visible.access?.recruit_details).toBe("view");
  });
});
