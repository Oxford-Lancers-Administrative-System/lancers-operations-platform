// @vitest-environment jsdom
/**
 * May move recruits to Joined, on the board and the recruit record — LAN-505
 * (Brian, 16 October 2026).
 *
 * The switch replaced the fixed four-office rule and works on its own. Each
 * seat sees exactly what it can do:
 *
 * - with the switch, Joined is among the status options, whatever the Recruit
 *   details level (at `none` the status travels for this alone);
 * - with Recruit details at edit and no switch, every other status is offered,
 *   Joined is not, and the control says why;
 * - with neither, the status is read-only and says so.
 *
 * Rendered through the real page components with the server's own redaction
 * (`redactRecruitmentRow`, `redactProspectRecord`) applied first, so what a
 * seat is sent and what it is shown are proved together. The server refusal
 * is `board-actions.test.ts`'s.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("./board-actions", () => ({
  setRecruitmentStatusAction: vi.fn().mockResolvedValue({ error: null }),
  flipRecruitmentProspectAction: vi.fn().mockResolvedValue({ error: null }),
}));
vi.mock("./group-preference-actions", () => ({
  saveRecruitmentCollapsedGroupsAction: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./[prospectId]/actions", () => ({
  addRecruitmentNoteAction: vi.fn().mockResolvedValue({ error: null }),
  sendRecruitmentQuestionnaireAction: vi.fn().mockResolvedValue({ error: null, created: [] }),
  stopMessagesAction: vi.fn().mockResolvedValue({ error: null }),
  recordConsentAction: vi.fn().mockResolvedValue({ error: null }),
}));

import { holdsAccess } from "@/lib/auth/access";
import { NO_GRANTS, type CategoryLevel, type RecruitingCategory } from "@/lib/auth/grants";
import { RECRUITING_REACH } from "@/lib/auth/roster-access";
import { destinationsFor } from "../destinations";
import type { RecruitmentBoardRow } from "@/lib/services/recruitment-board";
import {
  redactProspectRecord,
  redactRecruitmentRow,
  statusControlFor,
} from "@/lib/services/recruitment-board-access";
import type { RecruitmentProspectRecord } from "@/lib/services/recruitment-prospect";
import type { Season } from "@/lib/services/seasons";
import RecruitmentBoardView from "./recruitment-board-view";
import RecruitmentRecordView from "./[prospectId]/record-view";
import { JOINED_NEEDS_PERMISSION, STATUS_READ_ONLY } from "./status-cell";
import { flipRecruitmentProspectAction } from "./board-actions";

type Access = Readonly<Record<RecruitingCategory, CategoryLevel>>;

const SEASON: Season = {
  id: "season-1",
  label: "2026-27",
  status: "open",
  startsOn: null,
  endsOn: null,
};

const ROW: RecruitmentBoardRow = {
  prospectId: "prospect-1",
  personId: "person-1",
  displayName: "Clementine Varrow",
  givenName: "Clementine",
  familyName: "Varrow",
  aliases: [],
  college: "Balliol",
  matriculationYear: 2026,
  expectedGraduationYear: 2029,
  degreeField: null,
  hasMobile: true,
  hasEmail: false,
  phoneForCall: "07700 900123",
  status: "engaged",
  source: "Taster session",
  firstContactOn: "2026-05-01T09:00:00.000Z",
  personalSent: false,
  recruitmentSent: false,
  consent: "granted",
  consentChangedAt: null,
  consentByOperator: false,
  playedBefore: null,
  watchedBefore: null,
  positionInterest: null,
  gearOwned: null,
  howTheyHeard: null,
  anythingElse: null,
  events: {},
  attendedAnyEvent: false,
};

const RECORD: RecruitmentProspectRecord = {
  prospectId: "prospect-1",
  personId: "person-1",
  seasonId: "season-1",
  seasonLabel: "2026-27",
  displayName: "Clementine Varrow",
  status: "engaged",
  source: "Taster session",
  firstContactOn: "2026-05-01T09:00:00.000Z",
  committedOn: null,
  convertedMembershipId: null,
  consent: "never_asked",
  consentSource: null,
  consentChangedAt: null,
  consentByOperator: false,
  personal: { lastSentAt: null, queuedFor: null, cancelledReason: null },
  recruitment: { lastSentAt: null, queuedFor: null, cancelledReason: null },
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

function access(recruitDetails: CategoryLevel): Access {
  return { recruit_person: "view", recruit_details: recruitDetails, recruit_events: "none" };
}

function renderBoard(seat: Access, mayMoveToJoined: boolean) {
  const rows = [redactRecruitmentRow(ROW, seat, mayMoveToJoined)] as RecruitmentBoardRow[];
  return render(
    <RecruitmentBoardView
      operatorPersonId="operator-1"
      season={SEASON}
      rows={rows}
      events={[]}
      totalInSeason={1}
      initialSearch=""
      initialFilters={{}}
      initialSort={[]}
      access={seat}
      mayMoveToJoined={mayMoveToJoined}
    />,
  );
}

function renderRecord(seat: Access, mayMoveToJoined: boolean) {
  return render(
    <RecruitmentRecordView
      record={redactProspectRecord(RECORD, seat, mayMoveToJoined)}
      person={{}}
    />,
  );
}

/** Opens a status control and reads its options. */
function openOptions(testId: string): string[] {
  fireEvent.click(screen.getByTestId(testId));
  return screen.getAllByRole("option").map((option) => option.textContent ?? "");
}

describe("reaching Recruitment — LAN-505", () => {
  it("is open to the switch alone, so it is never granted where it does nothing", () => {
    const switchOnly = {
      roleCodes: ["kit_manager"],
      grants: {
        ...NO_GRANTS,
        switches: { ...NO_GRANTS.switches, move_recruits_to_joined: "yes" as const },
      },
    };
    expect(holdsAccess(switchOnly, RECRUITING_REACH)).toBe(true);
    expect(destinationsFor(switchOnly).map((entry) => entry.label)).toContain("Recruitment");
    expect(holdsAccess({ roleCodes: ["kit_manager"], grants: NO_GRANTS }, RECRUITING_REACH)).toBe(
      false,
    );
  });
});

describe("statusControlFor — LAN-505", () => {
  it("decides the four states from the two grants", () => {
    expect(statusControlFor("edit", true)).toBe("full");
    expect(statusControlFor("edit", false)).toBe("without_joined");
    expect(statusControlFor("view", true)).toBe("joined_only");
    expect(statusControlFor("none", true)).toBe("joined_only");
    expect(statusControlFor("view", false)).toBe("read_only");
  });
});

describe("the board — LAN-505", () => {
  it("offers Joined with the switch, even with Recruit details at view", () => {
    renderBoard(access("view"), true);
    const row = within(screen.getByTestId("recruitment-row-prospect-1"));
    expect(row.queryByText(STATUS_READ_ONLY)).toBeNull();

    expect(openOptions("recruitment-status-select-prospect-1")).toEqual(["Engaged", "Joined"]);
    fireEvent.click(screen.getByRole("option", { name: "Joined" }));
    expect(screen.getByText("Join Clementine Varrow?")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("recruitment-flip-confirm"));
    expect(flipRecruitmentProspectAction).toHaveBeenCalledWith({ prospectId: "prospect-1" });
  });

  it("offers Joined with the switch alone, Recruit details at none", () => {
    renderBoard(access("none"), true);
    expect(openOptions("recruitment-status-select-prospect-1")).toEqual(["Engaged", "Joined"]);
  });

  it("offers every status with both", () => {
    renderBoard(access("edit"), true);
    expect(openOptions("recruitment-status-select-prospect-1")).toEqual([
      "Identified",
      "Engaged",
      "Committed",
      "Joined",
      "Declined",
      "Disengaged",
      "Void",
    ]);
  });

  it("offers every other status without the switch, and says why Joined is not there", () => {
    renderBoard(access("edit"), false);
    const options = openOptions("recruitment-status-select-prospect-1");
    expect(options).not.toContain("Joined");
    expect(options).toEqual([
      "Identified",
      "Engaged",
      "Committed",
      "Declined",
      "Disengaged",
      "Void",
      JOINED_NEEDS_PERMISSION,
    ]);
    expect(screen.getByRole("option", { name: JOINED_NEEDS_PERMISSION })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("reads, and says so, with neither", () => {
    renderBoard(access("view"), false);
    const row = within(screen.getByTestId("recruitment-row-prospect-1"));
    expect(row.getByText("Engaged")).toBeInTheDocument();
    expect(row.getByText(STATUS_READ_ONLY)).toBeInTheDocument();
    expect(screen.queryByTestId("recruitment-status-select-prospect-1")).toBeNull();
    const card = within(screen.getByTestId("recruitment-card-prospect-1"));
    expect(card.getByText(STATUS_READ_ONLY)).toBeInTheDocument();
  });

  it("does not send or show the status with neither and Recruit details at none", () => {
    renderBoard(access("none"), false);
    expect(screen.queryByTestId("recruitment-status-cell-prospect-1")).toBeNull();
    expect("status" in redactRecruitmentRow(ROW, access("none"), false)).toBe(false);
  });

  it("sends the status alone for the switch at Recruit details none", () => {
    const sent = redactRecruitmentRow(ROW, access("none"), true);
    expect(sent.status).toBe("engaged");
    expect("consent" in sent).toBe(false);
    expect("source" in sent).toBe(false);
  });
});

describe("the recruit record — LAN-505", () => {
  it("offers Joined with the switch, even with Recruit details at view", () => {
    renderRecord(access("view"), true);
    expect(openOptions("recruitment-status-select-prospect-1")).toEqual(["Engaged", "Joined"]);
  });

  it("offers Joined with the switch alone, Recruit details at none, and nothing else of the section", () => {
    renderRecord(access("none"), true);
    const section = within(screen.getByTestId("section-recruitment"));
    expect(section.queryByText("Source")).toBeNull();
    expect(openOptions("recruitment-status-select-prospect-1")).toEqual(["Engaged", "Joined"]);
  });

  it("offers every other status without the switch, and says why", () => {
    renderRecord(access("edit"), false);
    const options = openOptions("recruitment-status-select-prospect-1");
    expect(options).not.toContain("Joined");
    expect(options).toContain(JOINED_NEEDS_PERMISSION);
  });

  it("reads, and says so, with neither", () => {
    renderRecord(access("view"), false);
    expect(screen.getByText(STATUS_READ_ONLY)).toBeInTheDocument();
    expect(screen.queryByTestId("recruitment-status-select-prospect-1")).toBeNull();
  });
});
