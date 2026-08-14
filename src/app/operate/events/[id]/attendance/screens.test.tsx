/**
 * UX-70, UX-71, UX-72, UX-73, UX-74 and UX-75 — LAN-80, matrix rows 4, 13 and 15.
 *
 * These render the real pages with the service layer mocked, so what is under
 * test is the screen: which facts it states, which actions it offers, and —
 * for the states before the assertion — that it says plainly that attendance is
 * unavailable and why. The writes are proved against the real database in
 * `src/lib/services/attendance.test.ts`.
 *
 * The privacy assertions here are deliberately about the **DOM**. A
 * server-rendered page ships its markup to the browser, so "the reason behind a
 * no is not on this screen" has to mean "the string is not in the payload",
 * which is what `container.textContent` gets closest to.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("server-only", () => ({}));
const routerPush = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  usePathname: () => "/operate/events",
  useRouter: () => ({ push: routerPush, replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/operator", () => ({ resolveOperatorAccess: vi.fn() }));
vi.mock("../../../../login/actions", () => ({ signOut: vi.fn() }));
vi.mock("@/lib/services/attendance", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/attendance")>();
  return {
    ...actual,
    readAttendanceBoard: vi.fn(),
    readWalkUpCandidates: vi.fn(),
    recordAttendance: vi.fn(),
    recordWalkUpAttendance: vi.fn(),
    removeAttendance: vi.fn(),
  };
});
vi.mock("@/lib/services/events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/events")>();
  return {
    ...actual,
    readEvent: vi.fn(),
    markEventOccurred: vi.fn(),
    markEventNotHeld: vi.fn(),
    correctOccurrenceAssertion: vi.fn(),
  };
});
vi.mock("@/lib/services/event-approval", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/event-approval")>();
  return {
    ...actual,
    readApprovalPreview: vi.fn(),
    readEventAudience: vi.fn(),
  };
});

import { NotFound } from "@/lib/db";
import { resolveOperatorAccess, type ResolvedOperator } from "@/lib/auth/operator";
import {
  readAttendanceBoard,
  readWalkUpCandidates,
  type AttendanceBoard,
  type AttendanceParticipant,
} from "@/lib/services/attendance";
import { readEvent, type EventDetail } from "@/lib/services/events";
import { readEventAudience } from "@/lib/services/event-approval";
import AttendancePage, { filterParticipants } from "./page";
import EventDetailPage from "../page";

const EVENT_ID = "33333333-3333-4333-8333-333333333333";
const MEMBERSHIP_ID = "55555555-5555-4555-8555-555555555555";
const WALK_UP_PERSON_ID = "66666666-6666-4666-8666-666666666666";

/** One of the four roles that may assert what happened. */
function operator(roleCodes: string[] = ["secretary"]): ResolvedOperator {
  return {
    authUserId: "11111111-1111-4111-8111-111111111111",
    personId: "22222222-2222-4222-8222-222222222222",
    displayName: "Morgan Pike",
    roleCodes,
    isActive: true,
  };
}

/**
 * A linked, active operator holding no capability at all.
 *
 * The important case for this route: § 8 makes general attendance ordinary
 * operator work, so this person **can** record attendance, and must still be
 * refused the occurrence assertion.
 */
function plainOperator(): ResolvedOperator {
  return operator([]);
}

function detail(overrides: Partial<EventDetail> = {}): EventDetail {
  return {
    id: EVENT_ID,
    name: "Team Practice",
    eventType: "practice",
    status: "approved",
    scheduledOn: "2026-10-14",
    startsAt: "20:00",
    endsAt: "22:00",
    venue: "Iffley Road Astro",
    isMandatory: true,
    solicitsResponse: true,
    audienceCount: 5,
    invitationCount: 5,
    responseCount: 3,
    origin: "club_controlled",
    termId: null,
    termLabel: "michaelmas 2026-27",
    weekNumber: 2,
    createdByName: "Rowan Ashdown",
    decisionReason: null,
    seasonId: "44444444-4444-4444-8444-444444444444",
    startHasPassed: true,
    ...overrides,
  };
}

function participant(overrides: Partial<AttendanceParticipant> = {}): AttendanceParticipant {
  return {
    key: `player:${MEMBERSHIP_ID}`,
    displayName: "Avery Fielding",
    capacity: "player",
    rsvp: "yes",
    isWalkUp: false,
    presence: null,
    recordedAt: null,
    recordedByName: null,
    mismatch: null,
    ...overrides,
  };
}

function board(overrides: Partial<AttendanceBoard> = {}): AttendanceBoard {
  const participants = overrides.participants ?? [participant()];
  return {
    event: detail({ status: "occurred" }),
    isOpen: true,
    participants,
    invitedCount: participants.filter((entry) => !entry.isWalkUp).length,
    recordedCount: participants.filter((entry) => entry.presence !== null).length,
    walkUpCount: participants.filter((entry) => entry.isWalkUp).length,
    mismatchCount: participants.filter((entry) => entry.mismatch !== null).length,
    ...overrides,
  };
}

function attendanceProps(query: Record<string, string> = {}) {
  return {
    params: Promise.resolve({ id: EVENT_ID }),
    searchParams: Promise.resolve(query),
  } as unknown as PageProps<"/operate/events/[id]/attendance">;
}

function detailProps(query: Record<string, string> = {}) {
  return {
    params: Promise.resolve({ id: EVENT_ID }),
    searchParams: Promise.resolve(query),
  } as unknown as PageProps<"/operate/events/[id]">;
}

beforeEach(() => {
  vi.mocked(resolveOperatorAccess).mockResolvedValue({ state: "active", operator: operator() });
  vi.mocked(readEventAudience).mockResolvedValue([]);
  routerPush.mockClear();
});

// ---------------------------------------------------------------------------
// UX-70 and UX-75 — the assertion, on the event detail
// ---------------------------------------------------------------------------

describe("UX-70 — Confirm what happened", () => {
  it("offers both assertions on an approved event, and states all three facts", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail());

    const { container } = render(await EventDetailPage(detailProps()));

    const panel = screen.getByTestId("occurrence-decision");
    expect(within(panel).getByText("Confirm what happened")).toBeTruthy();
    expect(within(panel).getByRole("button", { name: "Mark occurred" })).toBeTruthy();
    expect(within(panel).getByRole("button", { name: "Mark not held" })).toBeTruthy();

    // The three facts UX-70 pairs with the buttons.
    expect(container.textContent).toContain("Not yet asserted");
    expect(container.textContent).toContain("Never inferred from time");
    expect(container.textContent).toContain("Opens only after Mark occurred");
    expect(container.textContent).toContain("Start time has passed");
  });

  it("says the start has not passed rather than hiding the decision", async () => {
    // Invariant E5 cuts both ways: time is a fact beside the buttons, never a
    // gate on them. A practice abandoned before its own start is `not_held`.
    vi.mocked(readEvent).mockResolvedValue(detail({ startHasPassed: false }));

    const { container } = render(await EventDetailPage(detailProps()));

    expect(container.textContent).toContain("Start time has not passed");
    expect(screen.getByRole("button", { name: "Mark occurred" })).toBeTruthy();
  });

  it("offers no assertion to an operator without the capability, and says who does", async () => {
    vi.mocked(resolveOperatorAccess).mockResolvedValue({
      state: "active",
      operator: plainOperator(),
    });
    vi.mocked(readEvent).mockResolvedValue(detail());

    render(await EventDetailPage(detailProps()));

    expect(screen.queryByRole("button", { name: "Mark occurred" })).toBeNull();
    expect(screen.getByTestId("occurrence-read-only").textContent).toContain("President");
  });

  it("does not offer the assertion on a draft", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail({ status: "draft", invitationCount: 0 }));

    render(await EventDetailPage(detailProps()));

    expect(screen.queryByTestId("occurrence-decision")).toBeNull();
  });
});

describe("UX-75 — Event marked not held", () => {
  it("says attendance stays unavailable and the decision is kept", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail({ status: "not_held" }));

    const { container } = render(await EventDetailPage(detailProps()));

    expect(screen.getByTestId("outcome-panel")).toBeTruthy();
    expect(container.textContent).toContain("Event marked not held");
    expect(container.textContent).toContain("Attendance remains unavailable");
    expect(container.textContent).toContain("retained in the audit trail");
    // No route through to a board that would refuse them anyway.
    expect(screen.queryByTestId("open-attendance")).toBeNull();
  });

  it("offers the correction, because a completed state offers its correction", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail({ status: "not_held" }));

    render(await EventDetailPage(detailProps()));

    expect(screen.getByTestId("correct-occurrence-open").textContent).toContain(
      "Correct this to occurred",
    );
  });

  it("routes an occurred event through to the board", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail({ status: "occurred" }));

    render(await EventDetailPage(detailProps()));

    const link = screen.getByTestId("open-attendance");
    expect(link.getAttribute("href")).toBe(`/operate/events/${EVENT_ID}/attendance`);
  });
});

// ---------------------------------------------------------------------------
// UX-71 — attendance is not available yet
// ---------------------------------------------------------------------------

describe("UX-71 — attendance is not available yet", () => {
  for (const status of ["approved", "not_held", "cancelled"] as const) {
    it(`renders the locked screen for a ${status} event`, async () => {
      vi.mocked(readAttendanceBoard).mockResolvedValue(
        board({ event: detail({ status }), isOpen: false, participants: [] }),
      );

      const { container } = render(await AttendancePage(attendanceProps()));

      expect(screen.getByTestId("attendance-locked")).toBeTruthy();
      expect(container.textContent).toContain("Attendance is not available yet");
      expect(container.textContent).toContain("must first mark this event as occurred");
      expect(container.textContent).toContain("The service rejects attendance writes");

      // No board, no names, no states to press.
      expect(screen.queryByTestId("attendance-row")).toBeNull();
      expect(container.textContent).not.toContain("Avery Fielding");
    });
  }

  it("says the event is gone rather than rendering an empty board", async () => {
    vi.mocked(readAttendanceBoard).mockRejectedValue(new NotFound("That event no longer exists."));

    render(await AttendancePage(attendanceProps()));

    expect(screen.getByTestId("attendance-unavailable").textContent).toContain(
      "That event no longer exists.",
    );
  });
});

// ---------------------------------------------------------------------------
// UX-72 and UX-74 — the board, and the correction in place
// ---------------------------------------------------------------------------

describe("UX-72 — the attendance board", () => {
  beforeEach(() => {
    vi.mocked(readAttendanceBoard).mockResolvedValue(board());
  });

  it("offers all four states, with the approved labels", async () => {
    render(await AttendancePage(attendanceProps()));

    for (const label of ["Present", "Late", "Excused", "Absent"]) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
  });

  it("states that RSVP and attendance stay separate and are never reconciled", async () => {
    const { container } = render(await AttendancePage(attendanceProps()));

    expect(container.textContent).toContain("RSVP and attendance remain separate");
    expect(container.textContent).toContain("never auto-reconciled");
  });

  it("shows the standing RSVP for context, prefixed so it cannot read as attendance", async () => {
    const { container } = render(await AttendancePage(attendanceProps()));
    expect(container.textContent).toContain("RSVP: Attending");
  });

  it("shows the latest committed value with its actor and time", async () => {
    vi.mocked(readAttendanceBoard).mockResolvedValue(
      board({
        participants: [
          participant({
            presence: "present",
            recordedAt: "2026-10-14T19:07:00Z",
            recordedByName: "Casey North",
          }),
        ],
      }),
    );

    const { container } = render(await AttendancePage(attendanceProps()));

    expect(container.textContent).toContain("Saved · Casey North · 20:07");
  });

  it("says Not marked when nothing has been recorded for somebody", async () => {
    const { container } = render(await AttendancePage(attendanceProps()));
    expect(container.textContent).toContain("Not marked");
  });

  it("flags a walk-up for reconciliation, and a mismatch as information", async () => {
    vi.mocked(readAttendanceBoard).mockResolvedValue(
      board({
        participants: [
          participant({
            key: `guest:${WALK_UP_PERSON_ID}`,
            displayName: "Devon Skye",
            capacity: "guest",
            rsvp: null,
            isWalkUp: true,
            presence: "present",
          }),
          participant({ mismatch: "said_no_but_attended", rsvp: "no", presence: "present" }),
        ],
      }),
    );

    const { container } = render(await AttendancePage(attendanceProps()));

    expect(screen.getByTestId("walk-up-chip").textContent).toContain("to reconcile");
    expect(screen.getByTestId("mismatch-chip").textContent).toContain("turned up");
    expect(container.textContent).toContain("Walk-up · never invited");
  });

  it("distinguishes an event with nobody on it from a filter that matched nobody", async () => {
    vi.mocked(readAttendanceBoard).mockResolvedValue(board({ participants: [] }));
    render(await AttendancePage(attendanceProps()));
    expect(screen.getByTestId("attendance-empty")).toBeTruthy();

    vi.mocked(readAttendanceBoard).mockResolvedValue(board());
    render(await AttendancePage(attendanceProps({ q: "nobody by that name" })));
    expect(screen.getByTestId("attendance-filter-empty")).toBeTruthy();
  });

  it("offers the walk-up and the finish, and says what finishing means", async () => {
    const { container } = render(await AttendancePage(attendanceProps()));

    expect(screen.getByTestId("add-walk-up").getAttribute("href")).toBe(
      `/operate/events/${EVENT_ID}/attendance?add=walk-up`,
    );
    expect(screen.getByTestId("complete-attendance").textContent).toContain("Complete attendance");
    // Honest about a lock the schema does not have.
    expect(container.textContent).toContain("Values stay correctable afterwards");
  });

  it("puts no RSVP reason, contact detail or availability note in the payload", async () => {
    // The board type has no field for any of them, so this is a guard against a
    // later widening rather than a filter being tested. § 3 forbids all three
    // on this surface.
    const { container } = render(await AttendancePage(attendanceProps()));
    const markup = container.innerHTML;

    for (const forbidden of ["reason", "availability", "injur", "@", "07700"]) {
      expect(markup.toLowerCase()).not.toContain(forbidden);
    }
  });
});

describe("the board's filters", () => {
  const people = [
    participant({ key: "player:a", displayName: "Avery Fielding", rsvp: "yes", presence: null }),
    participant({ key: "player:b", displayName: "Nora Vale", rsvp: "no", presence: "present" }),
    participant({ key: "player:c", displayName: "Samira Quinn", rsvp: null, presence: "absent" }),
    participant({
      key: "guest:d",
      displayName: "Devon Skye",
      rsvp: null,
      isWalkUp: true,
      presence: "late",
    }),
  ];

  const all = { search: "", rsvp: "", attendance: "" };

  it("returns everybody when nothing is chosen", () => {
    expect(filterParticipants(people, all)).toHaveLength(4);
  });

  it("searches the name, case-insensitively", () => {
    expect(
      filterParticipants(people, { ...all, search: "nora" }).map((p) => p.displayName),
    ).toEqual(["Nora Vale"]);
  });

  it("filters by the standing RSVP, including no response", () => {
    expect(filterParticipants(people, { ...all, rsvp: "yes" })).toHaveLength(1);
    expect(filterParticipants(people, { ...all, rsvp: "no" })).toHaveLength(1);
    expect(filterParticipants(people, { ...all, rsvp: "none" })).toHaveLength(2);
  });

  it("filters by what is recorded, including what is not", () => {
    expect(filterParticipants(people, { ...all, attendance: "unmarked" })).toHaveLength(1);
    expect(filterParticipants(people, { ...all, attendance: "present" })).toHaveLength(1);
    expect(filterParticipants(people, { ...all, attendance: "late" })).toHaveLength(1);
  });

  it("combines rather than replacing", () => {
    expect(
      filterParticipants(people, { search: "a", rsvp: "no", attendance: "present" }),
    ).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// UX-73 — the walk-up
// ---------------------------------------------------------------------------

describe("UX-73 — add walk-up attendance", () => {
  beforeEach(() => {
    vi.mocked(readAttendanceBoard).mockResolvedValue(board());
    vi.mocked(readWalkUpCandidates).mockResolvedValue([
      { membershipId: MEMBERSHIP_ID, displayName: "Leo Hartwell" },
    ]);
  });

  it("asks for a name, a contact, a state and a possible roster match, and nothing else", async () => {
    const { container } = render(await AttendancePage(attendanceProps({ add: "walk-up" })));

    expect(container.textContent).toContain("Add walk-up attendance");
    expect(container.textContent).toContain("Capture only enough identity to record attendance");
    expect(screen.getByLabelText(/^Name/)).toBeTruthy();
    expect(screen.getByLabelText(/Email or phone/)).toBeTruthy();
    expect(container.textContent).toContain("Possible roster match");

    // Nothing recruitment- or onboarding-shaped is asked for on the field.
    for (const absent of ["date of birth", "emergency", "subscription", "consent", "position"]) {
      expect(container.textContent?.toLowerCase()).not.toContain(absent);
    }
  });

  it("says the record is flagged and creates no membership, before it is committed", async () => {
    const { container } = render(await AttendancePage(attendanceProps({ add: "walk-up" })));

    const note = screen.getByTestId("walk-up-reconciliation-note");
    expect(note.textContent).toContain("flagged for later reconciliation");
    expect(note.textContent).toContain("does not create or activate a membership");
    // The deferred workflow is named rather than implemented.
    expect(container.textContent).toContain("LAN-85");
  });

  it("confirms the same two facts after it is committed", async () => {
    const { container } = render(await AttendancePage(attendanceProps({ added: "walk-up" })));

    expect(screen.getByTestId("walk-up-added").textContent).toContain(
      "flagged for later reconciliation",
    );
    expect(container.textContent).toContain("no membership was created");
  });
});
