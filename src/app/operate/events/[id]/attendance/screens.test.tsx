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
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

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
    readEventAttendanceSummary: vi.fn(),
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
  readEventAttendanceSummary,
  recordAttendance,
  summariseAttendance,
  type AttendanceBoard,
  type AttendanceParticipant,
} from "@/lib/services/attendance";
import { readEvent, type EventDetail } from "@/lib/services/events";
import { readEventAudience } from "@/lib/services/event-approval";
import {
  ATTENDANCE_LOCKED_DETAIL,
  COACH_BOARD_SUBTITLE,
  COACH_LOCKED_DETAIL,
  COACH_LOCKED_RULE,
  REGISTER_NOT_YET_HEADLINE,
} from "./presentation";
import AttendancePage, { filterParticipants } from "./page";
import { AttendanceRow } from "./attendance-row";
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
 * A linked, active operator holding no club role at all — the ordinary player
 * who can sign in.
 *
 * They are refused both LAN-80 capabilities: the board, because Brian's coach
 * decision says an ordinary player is refused at the service boundary, and the
 * occurrence assertion, which was never theirs.
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
    deliveryMode: "in_person",
    venue: "Iffley Road Astro",
    isMandatory: true,
    description: null,
    requiredEquipment: null,
    joiningUrl: null,
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
  const summary = summariseAttendance(participants);
  return {
    // Approved, and behind us — which since LAN-151 is the whole of what makes
    // an event one that has occurred and opens its register (D30).
    event: detail({ status: "approved", scheduledOn: "2020-10-14" }),
    isOpen: true,
    closedReason: null,
    registerOpensAt: "2026-10-14T13:00:00.000Z",
    participants,
    summary,
    invitedCount: summary.invited,
    recordedCount: summary.recorded,
    walkUpCount: summary.walkUps,
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
  vi.mocked(readEventAttendanceSummary).mockResolvedValue(summariseAttendance([]));
  routerPush.mockClear();
});

// ---------------------------------------------------------------------------
// UX-70 and UX-75 — the assertion, on the event detail
// ---------------------------------------------------------------------------

/*
 * UX-70 ("Confirm what happened") and UX-75 ("Event marked not held") had a
 * describe block each, and both are gone with the screens they described.
 *
 * LAN-151 retired the occurrence assertion (D30, REQ-occurrence-retired): an
 * event has occurred when its date has passed and it was not cancelled. There
 * is no decision to offer, no state to be in as a result of one, and nothing to
 * correct. What replaced them is below — a panel that states whether the
 * register is open, and never asks anybody to make it so.
 */

describe("the register panel, which decides nothing", () => {
  it("offers the register once its buffer has lifted", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail({ scheduledOn: "2020-10-14" }));

    render(await EventDetailPage(detailProps()));

    expect(screen.getByTestId("register-panel").textContent).toContain("Attendance is open");
    expect(screen.getByTestId("open-attendance").getAttribute("href")).toBe(
      `/operate/events/${EVENT_ID}/attendance`,
    );
  });

  it("says it is not open yet for an event still ahead, and offers no way in", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail({ scheduledOn: "2099-01-01" }));

    render(await EventDetailPage(detailProps()));

    expect(screen.getByTestId("register-panel").textContent).toContain(REGISTER_NOT_YET_HEADLINE);
    expect(screen.queryByTestId("open-attendance")).toBeNull();
  });

  /**
   * VG-003. The panel says what the surface does; it does not report what the
   * product stopped doing. Brian, on the sentence that used to be here:
   * "That second line is weird. Why is that in the app?"
   */
  it("does not tell anybody that nobody has to mark the event as having happened", async () => {
    for (const scheduledOn of ["2020-10-14", "2099-01-01"]) {
      vi.mocked(readEvent).mockResolvedValue(detail({ scheduledOn }));

      const { container, unmount } = render(await EventDetailPage(detailProps()));

      for (const gone of ["Nobody has to mark", "having happened", "has to mark it", "no longer"]) {
        expect(container.textContent, gone).not.toContain(gone);
      }
      unmount();
    }
  });

  it("offers nobody, of any seat, a way to assert what happened", async () => {
    // REQ-occurrence-retired, on the surface it names. Checked for the operator
    // who used to hold the capability and for one who never did, because the
    // point is that the decision does not exist rather than that it is guarded.
    for (const who of [operator(), plainOperator()]) {
      vi.mocked(resolveOperatorAccess).mockResolvedValue({ state: "active", operator: who });
      vi.mocked(readEvent).mockResolvedValue(detail({ scheduledOn: "2020-10-14" }));

      const { container, unmount } = render(await EventDetailPage(detailProps()));

      for (const gone of [
        "Confirm what happened",
        "Mark occurred",
        "Mark not held",
        "Correct this to not held",
        "Not yet asserted",
        "Never inferred from time",
      ]) {
        expect(container.textContent, gone).not.toContain(gone);
      }
      expect(screen.queryByTestId("occurrence-decision")).toBeNull();
      expect(screen.queryByTestId("outcome-panel")).toBeNull();
      unmount();
    }
  });

  it("shows no register panel at all on a draft", async () => {
    vi.mocked(readEvent).mockResolvedValue(detail({ status: "draft", invitationCount: 0 }));

    render(await EventDetailPage(detailProps()));

    expect(screen.queryByTestId("register-panel")).toBeNull();
  });

  /**
   * `docs/ux/standards.md` rule 7 — this panel and the register answer one
   * question, and it has to be the same answer. LAN-152.
   *
   * The browser preflight found the version where it was not: the panel said
   * "Attendance is open" and offered the button, and the register the button
   * led to said "The register is not open yet". Both were reading the same
   * database at the same moment.
   */
  it("does not offer the board before the register's buffer lifts", async () => {
    vi.mocked(readEvent).mockResolvedValue(
      detail({ status: "approved", scheduledOn: "2099-01-01", startsAt: "20:00" }),
    );
    vi.mocked(readEventAttendanceSummary).mockResolvedValue(summariseAttendance([]));

    const { container } = render(await EventDetailPage(detailProps()));

    expect(screen.queryByTestId("open-attendance")).toBeNull();
    expect(container.textContent).toContain(REGISTER_NOT_YET_HEADLINE);
    expect(container.textContent).toContain("It opens on 1 Jan 2099, 14:00.");
    expect(container.textContent).not.toContain("Attendance is open");
  });

  it("offers the board for a register that already has something in it", async () => {
    // D72: it never closes. The synthetic season records sessions as having
    // happened whose dates are still ahead of today, and refusing a coach the
    // sheet they have already written names on is what this prevents.
    vi.mocked(readEvent).mockResolvedValue(
      detail({ status: "approved", scheduledOn: "2099-01-01", startsAt: "20:00" }),
    );
    vi.mocked(readEventAttendanceSummary).mockResolvedValue(
      summariseAttendance([participant({ presence: "present" })]),
    );

    const { container } = render(await EventDetailPage(detailProps()));

    expect(screen.getByTestId("open-attendance")).toBeVisible();
    expect(container.textContent).toContain("Attendance is open");
  });
});

// ---------------------------------------------------------------------------
// The register's buffer — D71 and D72. LAN-152.
// ---------------------------------------------------------------------------

describe("the register before its buffer lifts", () => {
  function notYet(overrides: Partial<AttendanceBoard> = {}) {
    return board({
      event: detail({ status: "approved", scheduledOn: "2099-01-01", startsAt: "20:00" }),
      isOpen: false,
      closedReason: "before_buffer",
      registerOpensAt: "2099-01-01T14:00:00.000Z",
      participants: [],
      ...overrides,
    });
  }

  it("says the register is not open yet, and when it will be", async () => {
    // `docs/ux/standards.md` rule 4: a refused control names the step that
    // lifts it. Here nobody can perform that step, so naming the moment is the
    // whole of the answer — and rule 3 says it reads as a formatted moment on
    // club time, never as a raw ISO instant.
    vi.mocked(readAttendanceBoard).mockResolvedValue(notYet());

    const { container } = render(await AttendancePage(attendanceProps()));

    expect(screen.getByTestId("register-not-open-yet")).toBeVisible();
    expect(container.textContent).toContain("The register is not open yet");
    expect(screen.getByTestId("register-opens-at").textContent).toBe(
      "It opens on 1 Jan 2099, 14:00.",
    );
    expect(container.textContent).not.toContain("2099-01-01T14:00:00.000Z");
  });

  it("says the rule, including that it never closes afterwards", async () => {
    vi.mocked(readAttendanceBoard).mockResolvedValue(notYet());

    const { container } = render(await AttendancePage(attendanceProps()));

    expect(container.textContent).toContain(
      "The register opens about 6 hours before the event starts, and never closes afterwards.",
    );
  });

  it("does not tell anybody to go and mark the event occurred", async () => {
    // The other closed state's sentence names an action. This one must not
    // borrow it: the event has been asserted, and the only thing anybody is
    // waiting for is the clock.
    vi.mocked(readAttendanceBoard).mockResolvedValue(notYet());

    const { container } = render(await AttendancePage(attendanceProps()));

    expect(container.textContent).not.toContain("mark this event as occurred");
    expect(screen.queryByTestId("attendance-locked")).toBeNull();
  });

  it("shows no names, no rows and no counts", async () => {
    vi.mocked(readAttendanceBoard).mockResolvedValue(notYet());

    const { container } = render(await AttendancePage(attendanceProps()));

    expect(screen.queryByTestId("attendance-board")).toBeNull();
    expect(screen.queryByTestId("attendance-row")).toBeNull();
    expect(container.textContent).not.toContain("Avery Fielding");
  });

  it("sends a coach back to their eligible events rather than to administration", async () => {
    vi.mocked(resolveOperatorAccess).mockResolvedValue({ state: "active", operator: coach() });
    vi.mocked(readAttendanceBoard).mockResolvedValue(notYet());

    render(await AttendancePage(attendanceProps()));

    expect(screen.getByRole("link", { name: "Return to eligible events" })).toHaveAttribute(
      "href",
      "/operate/events",
    );
  });

  it("says so plainly for an event with no date at all", async () => {
    vi.mocked(readAttendanceBoard).mockResolvedValue(
      notYet({
        event: detail({ status: "approved", scheduledOn: null, startsAt: null }),
        registerOpensAt: null,
      }),
    );

    const { container } = render(await AttendancePage(attendanceProps()));

    expect(container.textContent).toContain("This event has no date yet");
    expect(container.textContent).not.toContain("Invalid Date");
    expect(container.textContent).not.toContain("NaN");
  });
});

// ---------------------------------------------------------------------------
// UX-71 — attendance is not available yet
// ---------------------------------------------------------------------------

describe("UX-71 — attendance is not available yet", () => {
  for (const status of ["draft", "approved", "cancelled"] as const) {
    it(`renders the locked screen for a ${status} event`, async () => {
      vi.mocked(readAttendanceBoard).mockResolvedValue(
        board({ event: detail({ status }), isOpen: false, participants: [] }),
      );

      const { container } = render(await AttendancePage(attendanceProps()));

      expect(screen.getByTestId("attendance-locked")).toBeTruthy();
      expect(container.textContent).toContain("Attendance is not available yet");
      expect(container.textContent).toContain(ATTENDANCE_LOCKED_DETAIL);
      expect(container.textContent).toContain("The service rejects attendance writes");
      // And it never tells anybody to go and mark it, because nobody can.
      expect(container.textContent).not.toContain("mark this event as occurred");

      // No board, no names, no states to press.
      expect(screen.queryByTestId("attendance-row")).toBeNull();
      expect(container.textContent).not.toContain("Avery Fielding");
    });
  }

  it("refuses the board to an operator without the capability, and shows no names", async () => {
    // The route is not the boundary — every write guards itself — but a screen
    // that rendered the roster to somebody who may not record it would leak the
    // payload regardless of what the actions then refused.
    vi.mocked(resolveOperatorAccess).mockResolvedValue({
      state: "active",
      operator: plainOperator(),
    });
    vi.mocked(readAttendanceBoard).mockResolvedValue(board());

    const { container } = render(await AttendancePage(attendanceProps()));

    expect(screen.queryByTestId("attendance-board")).toBeNull();
    expect(screen.queryByTestId("attendance-row")).toBeNull();
    expect(container.textContent).not.toContain("Avery Fielding");
    // LAN-110 replaced the general UX-05 on this route with UX-96, whose whole
    // subject is that the reader may not take this register. The property under
    // test — no board, no names — is unchanged.
    expect(container.textContent).toContain("You cannot record attendance for this event");
  });

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

  it("offers no removal until there is something to remove", async () => {
    // Nothing recorded, nothing to take away — and the control is what makes
    // the occurrence-correction refusal's instruction followable, so its
    // presence is load-bearing rather than decorative.
    render(await AttendancePage(attendanceProps()));
    expect(screen.queryByTestId("remove-attendance-open")).toBeNull();
  });

  it("offers removal on a recorded row, behind a disclosure", async () => {
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

    render(await AttendancePage(attendanceProps()));

    const open = screen.getByTestId("remove-attendance-open");
    expect(open.textContent).toContain("Remove this record");
    // Behind a disclosure: removing an observation is a real loss, so it is not
    // a fifth button sitting beside the four states.
    expect(screen.queryByTestId("remove-attendance-form")).toBeNull();

    fireEvent.click(open);
    expect(screen.getByTestId("remove-attendance-form")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove record" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Keep it" })).toBeTruthy();
  });

  /**
   * The defect the removal control shipped with, and the reason this row reads
   * the server props rather than its own memory.
   *
   * Removing a record revalidates and soft-navigates to the same route, so the
   * row component survives under its stable key while the board underneath goes
   * to `null`. When the row preferred its own last-save state over the props, it
   * went on showing `Saved · … · 20:07` for a record that no longer existed,
   * still offered the removal control, and answered a second press with "there
   * is no attendance recorded for that person" printed beneath the Saved line.
   *
   * The sequence has to be real to reproduce it: the row must actually save —
   * that is the only thing that puts a value in `useActionState` — and only then
   * see props that say the record is gone. A test that merely re-renders never
   * populates the state and passes against the defect, which is how the first
   * attempt at this test fooled itself.
   *
   * The row is rendered directly rather than through the page, because what is
   * under test is one component's state across an action round trip.
   */
  it("stops showing a record once the board says it is gone", async () => {
    vi.mocked(recordAttendance).mockResolvedValue({
      key: `player:${MEMBERSHIP_ID}`,
      displayName: "Avery Fielding",
      presence: "present",
      recordedAt: "2026-10-14T19:07:00.000Z",
      recordedByName: "Casey North",
      previousPresence: null,
    });

    const { rerender } = render(<AttendanceRow eventId={EVENT_ID} participant={participant()} />);

    // The save is what puts a committed value in `useActionState`. Nothing
    // revalidates in an isolated render, so the props stay as they are — which
    // is exactly the shape the board has after a removal, and the shape the
    // stale-state bug got wrong.
    fireEvent.click(screen.getByRole("button", { name: "Present" }));
    await waitFor(() => {
      expect(recordAttendance).toHaveBeenCalled();
    });

    // Same participant key, nothing recorded. The component is not remounted —
    // that is the whole point: a soft navigation keeps this row instance.
    rerender(<AttendanceRow eventId={EVENT_ID} participant={participant()} />);

    await waitFor(() => {
      expect(screen.getByTestId("attendance-row").dataset.presence).toBe("none");
    });
    expect(screen.getByTestId("attendance-committed").textContent).toBe("Not marked");
    expect(screen.getByTestId("attendance-committed").textContent).not.toContain("Casey North");
    // And the control goes with it, so a second press cannot ask the service to
    // remove something that is not there.
    expect(screen.queryByTestId("remove-attendance-open")).toBeNull();
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

    // The mismatch here is somebody who said no, so they are in **Everyone
    // else**, which is closed until the recorder opens it. The walk-up is in
    // its own group, which is open. Opening the one is part of the test: the
    // chips are what is under the disclosure, not what replaced it.
    fireEvent.click(screen.getByTestId("attendance-group-toggle-everyone_else"));

    expect(screen.getByTestId("walk-up-chip").textContent).toContain("in recruitment");
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
  });

  it("asks the same four fields as adding a player, and nothing else", async () => {
    // Brian, 14 August 2026: "it should be almost identical to adding a
    // player… first name, last name, phone, and email".
    const { container } = render(await AttendancePage(attendanceProps({ add: "walk-up" })));

    expect(container.textContent).toContain("Add a walk-on");
    expect(screen.getByLabelText(/^First name/)).toBeTruthy();
    expect(screen.getByLabelText(/^Last name/)).toBeTruthy();
    expect(screen.getByLabelText(/^Phone/)).toBeTruthy();
    expect(screen.getByLabelText(/^Email/)).toBeTruthy();

    // The three the first version had, all gone.
    expect(container.textContent).not.toContain("Possible roster match");
    expect(container.textContent).not.toContain("Email or phone");
    expect(screen.queryByLabelText(/^Name$/)).toBeNull();

    // Nothing recruitment- or onboarding-shaped is asked for on the field.
    for (const absent of ["date of birth", "emergency", "subscription", "consent", "position"]) {
      expect(container.textContent?.toLowerCase()).not.toContain(absent);
    }
  });

  it("does not ask what the attendance was, and says what it recorded", async () => {
    // Brian, 14 August 2026. Somebody is being typed into a form because they
    // are standing in front of the person typing; an uninvited person who is
    // absent is not an event that happens.
    const { container } = render(await AttendancePage(attendanceProps({ add: "walk-up" })));

    expect(screen.queryByLabelText(/^Attendance/)).toBeNull();
    expect(container.querySelector("[name='presence']")).toBeNull();
    expect(screen.getByTestId("walk-up-presence-note").textContent).toBe(
      "Recorded as Present. Correct it on their row afterwards if you need to.",
    );
  });

  it("says the record is flagged and creates no membership, before it is committed", async () => {
    const { container } = render(await AttendancePage(attendanceProps({ add: "walk-up" })));

    const note = screen.getByTestId("walk-up-reconciliation-note");
    expect(note.textContent).toContain("added to recruitment");
    expect(note.textContent).toContain("does not put them on the roster");

    // And it says that without naming an issue tracker. A sentence pointing at
    // LAN-85 was here and Brian cut it: an operator on a pitch has no use for
    // the number, and the club's own screens are not where a backlog belongs.
    // The deferral is still real — it is in the code and in this ticket's
    // contract — it is just not something the interface talks about.
    expect(container.textContent).not.toMatch(/LAN-\d+/);
  });

  it("confirms the same two facts after it is committed", async () => {
    const { container } = render(await AttendancePage(attendanceProps({ added: "walk-up" })));

    expect(screen.getByTestId("walk-up-added").textContent).toContain("in recruitment");
    expect(container.textContent).toContain("were not put on the roster");
  });
});

// ---------------------------------------------------------------------------
// UX-90 to UX-97 — the same route, seen by a coaching assignment. LAN-110
// ---------------------------------------------------------------------------

/** An active Head Coach and nothing else — LAN-110's actor. */
function coach(code = "head_coach"): ResolvedOperator {
  return { ...operator([code]), displayName: "Casey North" };
}

function givenCoach(code = "head_coach") {
  vi.mocked(resolveOperatorAccess).mockResolvedValue({ state: "active", operator: coach(code) });
}

describe("UX-91 — the coach's board", () => {
  for (const code of ["head_coach", "offence_coach", "defence_coach"]) {
    it(`opens for an active ${code} assignment`, async () => {
      givenCoach(code);
      vi.mocked(readAttendanceBoard).mockResolvedValue(board());

      render(await AttendancePage(attendanceProps()));

      expect(screen.getByTestId("attendance-board")).toHaveAttribute("data-view", "coach");
      expect(screen.getByTestId("attendance-row")).toBeVisible();
    });
  }

  it("offers all four states, and the walk-up", async () => {
    givenCoach();
    vi.mocked(readAttendanceBoard).mockResolvedValue(board());

    render(await AttendancePage(attendanceProps()));

    for (const label of ["Present", "Late", "Excused", "Absent"]) {
      expect(screen.getByRole("button", { name: label }), label).toBeVisible();
    }
    expect(screen.getByTestId("add-walk-up")).toBeVisible();
  });

  it("states what the surface withholds, rather than leaving it to be noticed", async () => {
    givenCoach();
    vi.mocked(readAttendanceBoard).mockResolvedValue(board());

    const { container } = render(await AttendancePage(attendanceProps()));

    expect(screen.getByTestId("coach-scope-note")).toBeVisible();
    expect(container.textContent).toContain(
      "RSVP reasons, contact, availability and administration are omitted",
    );
    expect(container.textContent).toContain(COACH_BOARD_SUBTITLE);
    // VG-003: the subtitle names the reader's seat, not a status the model
    // retired.
    expect(container.textContent).not.toContain("Occurred ·");
  });

  it("carries the standing RSVP, which is what the coach is given", async () => {
    givenCoach();
    vi.mocked(readAttendanceBoard).mockResolvedValue(board());

    const { container } = render(await AttendancePage(attendanceProps()));

    expect(container.textContent).toContain("Avery Fielding");
    expect(container.textContent).toMatch(/Attending/);
  });

  it("shows the latest committed value with its actor and time", async () => {
    // LAN-110's two-recorder criterion, at the presentation end: the value on
    // screen is the committed one and it says who put it there.
    givenCoach();
    vi.mocked(readAttendanceBoard).mockResolvedValue(
      board({
        participants: [
          participant({
            presence: "present",
            recordedAt: "2026-10-14T20:07:00Z",
            recordedByName: "Morgan Pike",
          }),
        ],
      }),
    );

    const { container } = render(await AttendancePage(attendanceProps()));

    expect(container.textContent).toContain("Morgan Pike");
    expect(screen.getByTestId("attendance-committed").textContent).toMatch(/Saved/);
  });

  it("withholds the operator's chrome — counts, mismatch and the event detail", async () => {
    givenCoach();
    vi.mocked(readAttendanceBoard).mockResolvedValue(
      board({
        participants: [
          participant({ rsvp: "no", presence: "present", mismatch: "said_no_but_attended" }),
        ],
      }),
    );

    const { container } = render(await AttendancePage(attendanceProps()));

    expect(screen.queryByTestId("count-mismatches")).toBeNull();
    expect(screen.queryByTestId("count-invited")).toBeNull();
    expect(screen.queryByTestId("mismatch-chip")).toBeNull();
    expect(screen.queryByTestId("rsvp-separate-note")).toBeNull();
    // **Complete attendance** returns to `/operate/events/[id]`, which is event
    // administration and refuses a coach outright.
    expect(screen.queryByTestId("complete-attendance")).toBeNull();
    expect(container.innerHTML).not.toContain(`/operate/events/${EVENT_ID}"`);
  });

  it("offers no way to remove a record, because removal unwinds the assertion", async () => {
    givenCoach();
    vi.mocked(readAttendanceBoard).mockResolvedValue(
      board({
        participants: [
          participant({
            presence: "present",
            recordedAt: "2026-10-14T20:07:00Z",
            recordedByName: "Casey North",
          }),
        ],
      }),
    );

    render(await AttendancePage(attendanceProps()));

    expect(screen.queryByTestId("remove-attendance-open")).toBeNull();
  });

  it("still offers removal to an operator who may assert occurrence", async () => {
    // The narrowing reaches the coach and nobody else.
    vi.mocked(readAttendanceBoard).mockResolvedValue(
      board({
        participants: [
          participant({
            presence: "present",
            recordedAt: "2026-10-14T20:07:00Z",
            recordedByName: "Morgan Pike",
          }),
        ],
      }),
    );

    render(await AttendancePage(attendanceProps()));

    expect(screen.getByTestId("remove-attendance-open")).toBeVisible();
  });

  it("is handed a participant that has no reason, contact or availability to leak", async () => {
    // The strongest form of "the coach cannot see it" is that the payload has
    // no field for it. Asserted as an exact key set: adding `rsvpReason` or
    // `phone` to the participant type fails here, before any screen has had the
    // chance to render it. § 3 forbids every one of them on this surface.
    const keys = Object.keys(participant()).sort();

    expect(keys).toEqual([
      "capacity",
      "displayName",
      "isWalkUp",
      "key",
      "mismatch",
      "presence",
      "recordedAt",
      "recordedByName",
      "rsvp",
    ]);
  });

  it("renders no email address and no telephone number", async () => {
    // The other half, at the DOM: whatever the fixture carries, nothing that
    // looks like a contact detail reaches the markup a browser is sent.
    givenCoach();
    vi.mocked(readAttendanceBoard).mockResolvedValue(
      board({ participants: [participant({ rsvp: "no" })] }),
    );

    const { container } = render(await AttendancePage(attendanceProps()));

    expect(container.innerHTML).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(container.innerHTML).not.toMatch(/(?:\+44|0)\d[\d\s]{8,}/);
  });
});

describe("UX-90 — attendance is not open, told to a coach", () => {
  for (const status of ["draft", "approved", "cancelled"] as const) {
    it(`refuses the board for a ${status} event, and does not tell a coach to assert it`, async () => {
      givenCoach();
      vi.mocked(readAttendanceBoard).mockResolvedValue(
        board({ event: detail({ status }), isOpen: false, participants: [] }),
      );

      const { container } = render(await AttendancePage(attendanceProps()));

      expect(screen.getByTestId("coach-attendance-locked")).toBeVisible();
      expect(container.textContent).toContain("Attendance is not open");
      expect(container.textContent).toContain(COACH_LOCKED_DETAIL);
      expect(container.textContent).toContain(COACH_LOCKED_RULE);
      // Nobody is waiting on anybody: the sentence names the clock, not a
      // person, because since LAN-151 that is what it is waiting for.
      expect(container.textContent).not.toContain("An authorized operator has not marked");
      expect(container.textContent).not.toContain("Mark occurred");
      expect(screen.queryByTestId("attendance-row")).toBeNull();
    });
  }

  it("returns the coach to their own list, never to the event detail", async () => {
    givenCoach();
    vi.mocked(readAttendanceBoard).mockResolvedValue(
      board({ event: detail({ status: "approved" }), isOpen: false, participants: [] }),
    );

    render(await AttendancePage(attendanceProps()));

    expect(screen.getByRole("link", { name: "Return to eligible events" })).toHaveAttribute(
      "href",
      "/operate/events",
    );
  });

  it("keeps the operator's own locked screen unchanged", async () => {
    vi.mocked(readAttendanceBoard).mockResolvedValue(
      board({ event: detail({ status: "approved" }), isOpen: false, participants: [] }),
    );

    const { container } = render(await AttendancePage(attendanceProps()));

    expect(screen.getByTestId("attendance-locked")).toBeVisible();
    expect(container.textContent).toContain("Attendance is not available yet");
  });
});

describe("UX-96 — you cannot record attendance for this event", () => {
  it("refuses an ordinary player, with no board and no names", async () => {
    vi.mocked(resolveOperatorAccess).mockResolvedValue({
      state: "active",
      operator: plainOperator(),
    });
    vi.mocked(readAttendanceBoard).mockResolvedValue(board());

    const { container } = render(await AttendancePage(attendanceProps()));

    expect(screen.getByTestId("coach-not-permitted")).toBeVisible();
    expect(container.textContent).toContain(
      "This account does not have an active Head Coach, Offensive Coordinator or Defensive " +
        "Coordinator assignment for this scope.",
    );
    expect(container.textContent).toContain(
      "No roster, contact, RSVP reason, availability, attendance data or operator navigation " +
        "is exposed.",
    );
    expect(screen.queryByTestId("attendance-board")).toBeNull();
    expect(container.textContent).not.toContain("Avery Fielding");
  });

  it("refuses a coach whose seat has ended, exactly as it refuses anybody else", async () => {
    // An ended assignment is not in `roleCodes` at all — `resolveOperatorAccess`
    // bounds effectiveness at both ends — so a coach out of post reaches this
    // screen and not the board.
    vi.mocked(resolveOperatorAccess).mockResolvedValue({
      state: "active",
      operator: operator([]),
    });
    vi.mocked(readAttendanceBoard).mockResolvedValue(board());

    render(await AttendancePage(attendanceProps()));

    expect(screen.getByTestId("coach-not-permitted")).toBeVisible();
  });

  it("names no role the reader holds, and nobody who holds the missing one", async () => {
    vi.mocked(resolveOperatorAccess).mockResolvedValue({
      state: "active",
      operator: operator(["kit_manager", "social_secretary"]),
    });
    vi.mocked(readAttendanceBoard).mockResolvedValue(board());

    const { container } = render(await AttendancePage(attendanceProps()));

    const html = container.innerHTML.toLowerCase();
    for (const code of ["kit_manager", "kit manager", "social secretary"]) {
      expect(html, code).not.toContain(code);
    }
  });

  it("sends an unlinked account to the account state, not to this screen", async () => {
    vi.mocked(resolveOperatorAccess).mockResolvedValue({ state: "unlinked" });

    render(await AttendancePage(attendanceProps()));

    expect(screen.queryByTestId("coach-not-permitted")).toBeNull();
    expect(screen.queryByTestId("attendance-board")).toBeNull();
  });

  it("sends an inactive account to the account state, not to this screen", async () => {
    vi.mocked(resolveOperatorAccess).mockResolvedValue({ state: "inactive" });

    render(await AttendancePage(attendanceProps()));

    expect(screen.queryByTestId("coach-not-permitted")).toBeNull();
    expect(screen.queryByTestId("attendance-board")).toBeNull();
  });
});

/**
 * The two groups — Brian, 14 August 2026.
 *
 * "I want to look at the people who RSVPed yes, and then I want everyone else
 * (no or otherwise)… those are not the people I'm expecting to be there." Both
 * boards get it: the row list is one implementation and the operator's board
 * reads the same way.
 */
describe("the board is read in two groups", () => {
  /** Four people whose names sort differently from the order they arrive in. */
  function mixedBoard() {
    return board({
      participants: [
        participant({ key: "player:d", displayName: "Zara Winterbourne", rsvp: "yes" }),
        participant({ key: "player:c", displayName: "Alwyn Cholmondley", rsvp: "yes" }),
        participant({ key: "player:b", displayName: "Samira Quinn", rsvp: null }),
        participant({ key: "player:a", displayName: "Bar Sedgewick", rsvp: "no" }),
      ],
    });
  }

  function namesIn(group: "attending" | "everyone_else" | "walk_ups"): string[] {
    const panel = screen.getByTestId(`attendance-group-${group}`);
    return [...panel.querySelectorAll("[data-testid='attendance-row']")].map(
      (row) => row.querySelector("p")?.textContent ?? "",
    );
  }

  it("puts the people who said yes in one group and everybody else in the other", async () => {
    vi.mocked(readAttendanceBoard).mockResolvedValue(mixedBoard());

    render(await AttendancePage(attendanceProps()));
    fireEvent.click(screen.getByTestId("attendance-group-toggle-everyone_else"));

    expect(namesIn("attending")).toEqual(["Alwyn Cholmondley", "Zara Winterbourne"]);
    expect(namesIn("everyone_else")).toEqual(["Bar Sedgewick", "Samira Quinn"]);
  });

  it("sorts each group by name, not by the order the service returned", async () => {
    vi.mocked(readAttendanceBoard).mockResolvedValue(mixedBoard());

    render(await AttendancePage(attendanceProps()));

    // The fixture arrives Zara, Alwyn, Samira, Bar. Sorted, Alwyn leads.
    expect(namesIn("attending")).toEqual([...namesIn("attending")].sort());
  });

  /**
   * Brian, 14 August 2026: a walk-up gets "its own separate group that
   * attended", at the bottom.
   *
   * It cannot be in either of the others without lying. "Everyone else" says
   * the club was not expecting them, next to people who are not there;
   * "Attending" means *said yes* throughout this product, and Locked
   * Requirement 7 forbids reading somebody's presence as their intent.
   */
  function walkUpBoard() {
    return board({
      participants: [
        participant({ key: "player:x", displayName: "Alwyn Cholmondley", rsvp: "yes" }),
        participant({ key: "player:y", displayName: "Bar Sedgewick", rsvp: "no" }),
        participant({
          key: `guest:${WALK_UP_PERSON_ID}`,
          displayName: "Devon Skye",
          capacity: "guest",
          rsvp: null,
          isWalkUp: true,
          presence: "present",
        }),
      ],
    });
  }

  it("gives a walk-up its own group, and keeps them out of the other two", async () => {
    vi.mocked(readAttendanceBoard).mockResolvedValue(walkUpBoard());

    render(await AttendancePage(attendanceProps()));
    fireEvent.click(screen.getByTestId("attendance-group-toggle-everyone_else"));

    expect(namesIn("walk_ups")).toEqual(["Devon Skye"]);
    expect(namesIn("attending")).toEqual(["Alwyn Cholmondley"]);
    expect(namesIn("everyone_else")).toEqual(["Bar Sedgewick"]);
  });

  it("puts the walk-up group last, under the two RSVP groups", async () => {
    vi.mocked(readAttendanceBoard).mockResolvedValue(walkUpBoard());

    const { container } = render(await AttendancePage(attendanceProps()));

    const groups = [...container.querySelectorAll("[data-testid^='attendance-group-']")]
      .map((node) => node.getAttribute("data-testid"))
      .filter((id) => id !== null && !id.includes("toggle") && !id.includes("count"));

    expect(groups).toEqual([
      "attendance-group-attending",
      "attendance-group-everyone_else",
      "attendance-group-walk_ups",
    ]);
  });

  it("opens the walk-up group, because it is the receipt for what was just done", async () => {
    // Empty at almost every event, and an empty group is not drawn at all — so
    // the open state costs nothing until the recorder has just added somebody
    // and been returned here to see it.
    vi.mocked(readAttendanceBoard).mockResolvedValue(walkUpBoard());

    render(await AttendancePage(attendanceProps()));

    expect(screen.getByTestId("attendance-group-walk_ups")).toHaveAttribute("data-open", "true");
  });

  it("says what the walk-up group is, without calling it an RSVP", async () => {
    vi.mocked(readAttendanceBoard).mockResolvedValue(walkUpBoard());

    const { container } = render(await AttendancePage(attendanceProps()));

    expect(container.textContent).toContain("Walk-ups");
    expect(container.textContent).toContain("Turned up uninvited, recorded present, to reconcile");
    // And the RSVP group's own line no longer claims to hold them.
    expect(container.textContent).toContain("Not attending, and no response");
  });

  it("opens Attending and closes Everyone else, and lets either be changed", async () => {
    vi.mocked(readAttendanceBoard).mockResolvedValue(mixedBoard());

    render(await AttendancePage(attendanceProps()));

    expect(screen.getByTestId("attendance-group-attending")).toHaveAttribute("data-open", "true");
    expect(screen.getByTestId("attendance-group-everyone_else")).toHaveAttribute(
      "data-open",
      "false",
    );

    fireEvent.click(screen.getByTestId("attendance-group-toggle-attending"));
    expect(screen.getByTestId("attendance-group-attending")).toHaveAttribute("data-open", "false");
  });

  it("counts what is under each heading", async () => {
    vi.mocked(readAttendanceBoard).mockResolvedValue(mixedBoard());

    render(await AttendancePage(attendanceProps()));

    expect(screen.getByTestId("attendance-group-count-attending").textContent).toBe("2");
    expect(screen.getByTestId("attendance-group-count-everyone_else").textContent).toBe("2");
  });

  it("draws no heading for a group with nobody in it", async () => {
    // An empty "Attending (0)" reads as a team nobody said yes to.
    vi.mocked(readAttendanceBoard).mockResolvedValue(
      board({ participants: [participant({ rsvp: "no" })] }),
    );

    render(await AttendancePage(attendanceProps()));

    expect(screen.queryByTestId("attendance-group-attending")).toBeNull();
    expect(screen.getByTestId("attendance-group-everyone_else")).toBeVisible();
  });

  it("groups the operator's board the same way", async () => {
    // One row list, one behaviour — the answer to "does this apply to the
    // operator's board too", 14 August 2026.
    vi.mocked(readAttendanceBoard).mockResolvedValue(mixedBoard());

    render(await AttendancePage(attendanceProps()));

    expect(screen.getByTestId("attendance-board")).toHaveAttribute("data-view", "operator");
    expect(screen.getByTestId("attendance-group-attending")).toBeVisible();
  });

  it("groups the coach's board the same way", async () => {
    givenCoach();
    vi.mocked(readAttendanceBoard).mockResolvedValue(mixedBoard());

    render(await AttendancePage(attendanceProps()));

    expect(screen.getByTestId("attendance-board")).toHaveAttribute("data-view", "coach");
    expect(screen.getByTestId("attendance-group-attending")).toBeVisible();
  });

  it("opens both groups while a search is running", async () => {
    // A search that only looked inside the open section would be a search that
    // lies: the recorder types a name, sees nothing, and concludes the person
    // is not on the event.
    vi.mocked(readAttendanceBoard).mockResolvedValue(mixedBoard());

    render(await AttendancePage(attendanceProps({ q: "Sedgewick" })));

    await waitFor(() => {
      expect(screen.getByTestId("attendance-group-everyone_else")).toHaveAttribute(
        "data-open",
        "true",
      );
    });
    expect(namesIn("everyone_else")).toEqual(["Bar Sedgewick"]);
  });

  it("puts the groups back the way they were when the search clears", async () => {
    vi.mocked(readAttendanceBoard).mockResolvedValue(mixedBoard());

    const { rerender } = render(await AttendancePage(attendanceProps({ q: "Sedgewick" })));
    await waitFor(() => {
      expect(screen.getByTestId("attendance-group-everyone_else")).toHaveAttribute(
        "data-open",
        "true",
      );
    });

    rerender(await AttendancePage(attendanceProps()));

    await waitFor(() => {
      expect(screen.getByTestId("attendance-group-everyone_else")).toHaveAttribute(
        "data-open",
        "false",
      );
    });
    expect(screen.getByTestId("attendance-group-attending")).toHaveAttribute("data-open", "true");
  });

  it("keeps a choice the recorder made during the search", async () => {
    // The one case where "back to the way it was" would undo something they
    // just did deliberately: an explicit toggle wins over the restore.
    vi.mocked(readAttendanceBoard).mockResolvedValue(mixedBoard());

    const { rerender } = render(await AttendancePage(attendanceProps({ q: "e" })));
    await waitFor(() => {
      expect(screen.getByTestId("attendance-group-everyone_else")).toHaveAttribute(
        "data-open",
        "true",
      );
    });

    fireEvent.click(screen.getByTestId("attendance-group-toggle-attending"));
    rerender(await AttendancePage(attendanceProps()));

    await waitFor(() => {
      expect(screen.getByTestId("attendance-group-attending")).toHaveAttribute(
        "data-open",
        "false",
      );
    });
  });
});

describe("UX-97 — the coach's walk-up", () => {
  it("offers the same minimal capture, on the same route", async () => {
    givenCoach();
    vi.mocked(readAttendanceBoard).mockResolvedValue(board());

    const { container } = render(await AttendancePage(attendanceProps({ add: "walk-up" })));

    expect(screen.getByTestId("walk-up-step")).toHaveAttribute("data-view", "coach");
    expect(container.textContent).toContain("Add a walk-on");
    expect(container.textContent).toContain("added to recruitment");
    // The deferred workflow is named and not offered — LAN-85, per LAN-80.
    expect(screen.queryByRole("link", { name: /onboard/i })).toBeNull();
  });

  it("cancels back to the board, not to the event", async () => {
    givenCoach();
    vi.mocked(readAttendanceBoard).mockResolvedValue(board());

    render(await AttendancePage(attendanceProps({ add: "walk-up" })));

    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute(
      "href",
      `/operate/events/${EVENT_ID}/attendance`,
    );
  });
});
