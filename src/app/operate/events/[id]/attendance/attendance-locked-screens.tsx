import { Refusal } from "@/components/refusal";
import { Metric, MetricRow } from "@/components/metric";
import Box from "@mui/material/Box";
import type { AttendanceBoard } from "@/lib/services/attendance";
import {
  ATTENDANCE_LOCKED_HEADLINE,
  COACH_LOCKED_HEADLINE,
  COACH_RETURN_TO_ELIGIBLE,
  describeCoachLock,
  describeOperatorLock,
  describeRegisterOpensAt,
  REGISTER_NOT_YET_HEADLINE,
} from "./presentation";

// The register's buffer, before it lifts — D71, D72, LAN-152. One screen for
// both readers (nobody can hurry a clock); only the way back out differs.
// Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md.
export function RegisterNotOpenYet({
  eventId,
  status,
  opensAt,
  isCoachView,
}: {
  eventId: string;
  status: string;
  opensAt: string | null;
  isCoachView: boolean;
}) {
  return (
    <Box data-testid="register-not-open-yet" data-status={status}>
      <Refusal
        title={REGISTER_NOT_YET_HEADLINE}
        message={describeRegisterOpensAt(opensAt)}
        action={{
          href: isCoachView ? "/operate/events" : `/operate/events/${eventId}`,
          label: isCoachView ? COACH_RETURN_TO_ELIGIBLE : "Return to event",
        }}
      />
    </Box>
  );
}

/** UX-90 — the lock, told to somebody who cannot lift it. */
export function CoachAttendanceLocked({ status }: { status: string }) {
  return (
    <Box data-testid="coach-attendance-locked" data-status={status}>
      <Refusal
        title={COACH_LOCKED_HEADLINE}
        message={describeCoachLock(status)}
        action={{ href: "/operate/events", label: COACH_RETURN_TO_ELIGIBLE }}
      />
    </Box>
  );
}

/** UX-71, and the state UX-75 leaves an event in permanently. */
export function AttendanceLocked({ eventId, status }: { eventId: string; status: string }) {
  return (
    <Box data-testid="attendance-locked" data-status={status}>
      <Refusal
        title={ATTENDANCE_LOCKED_HEADLINE}
        message={describeOperatorLock(status)}
        action={{ href: `/operate/events/${eventId}`, label: "Return to event" }}
      />
    </Box>
  );
}

/** The four numbers a recorder actually wants: how many left, and what is odd. */
export function Counts({ board }: { board: AttendanceBoard }) {
  const entries = [
    { label: "Invited", value: board.invitedCount, testId: "count-invited" },
    { label: "Recorded", value: board.recordedCount, testId: "count-recorded" },
    { label: "Walk-ups", value: board.walkUpCount, testId: "count-walk-ups" },
    { label: "Mismatches", value: board.mismatchCount, testId: "count-mismatches" },
  ];

  return (
    <MetricRow columns={4}>
      {entries.map((entry) => (
        <Metric key={entry.label} value={entry.value} label={entry.label} testId={entry.testId} />
      ))}
    </MetricRow>
  );
}
