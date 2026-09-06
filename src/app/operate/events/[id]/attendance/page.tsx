import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Refusal } from "@/components/refusal";
import { Metric, MetricRow } from "@/components/metric";
import { ArrivalNotice, OutcomeSlotProvider } from "@/components/outcome-slot";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { isNarrowAttendanceRecorder } from "@/lib/auth/capabilities";
import { operatorHasCapability } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import { UnavailableScreen } from "@/app/operate/unavailable";
import {
  readAttendanceBoard,
  type AttendanceBoard,
  type AttendanceParticipant,
} from "@/lib/services/attendance";
import { gateShellPage } from "../../../gate";
import { formatDetailWhen, labelFor, STATUS_LABELS } from "../../presentation";
import { AttendanceFilters } from "./attendance-filters";
import { AttendanceGroups } from "./attendance-groups";
import { WalkUpForm } from "./walk-up-form";
import {
  ADD_WALK_UP,
  ATTENDANCE_HEADLINE_PREFIX,
  ATTENDANCE_LOCKED_HEADLINE,
  COACH_BOARD_SUBTITLE,
  COACH_LOCKED_HEADLINE,
  describeCoachLock,
  describeOperatorLock,
  COACH_RETURN_TO_ELIGIBLE,
  COMPLETE_ATTENDANCE,
  describeRegisterOpensAt,
  NOBODY_INVITED,
  NO_MATCHING_PARTICIPANTS,
  REGISTER_NOT_YET_HEADLINE,
  WALK_UP_ADDED,
} from "./presentation";

/**
 * The attendance surface — UX-71, UX-72, UX-73 and UX-74. LAN-80.
 *
 * ## One route, four screens, and the gate between them
 *
 * The screen registry gives all four `/operate/events/[id]/attendance`, and
 * that is not an oversight: they are states of one thing. The event's status
 * chooses between UX-71 and UX-72, `?add=walk-up` opens UX-73, and UX-74's
 * correction happens in place on the row it belongs to — see
 * `./attendance-row.tsx` for why that is not a fifth screen.
 *
 * ## Authorization, and the two things it is not
 *
 * The page gates on `attendance_recording` — the four calendar roles and the
 * three coaching seats. See `./actions.ts` for why it is that union, and for
 * the reading of § 8 this replaced: an ordinary-operator floor admitted an
 * ordinary player who happened to hold an operator account, which is the thing
 * LAN-80's own criterion says must be refused.
 *
 * That is not the boundary, and neither is this route. Every write re-resolves
 * the operator from the verified session inside its own server action, and the
 * service refuses any event that is not `occurred` after taking a row lock on
 * it. A page rendered a minute ago against an occurred event whose assertion has
 * since been corrected produces a refusal, not a write.
 *
 * ## What this page never puts in the payload
 *
 * A reason behind a "no", a contact detail, an availability or injury note, a
 * delivery diagnostic, or anything about the roster beyond a name. Not filtered
 * out here — never selected. `slice-ux.md` § 3 forbids every one of them on this
 * surface for a coach, and there is no second version of this payload for
 * anybody else, so the rule cannot be true on one path and false on another.
 */
export default async function AttendancePage({
  params,
  searchParams,
}: PageProps<"/operate/events/[id]/attendance">) {
  // LAN-110. The one surface a coaching assignment opens, so it opts in — and
  // the refusal here is UX-96 rather than UX-05, because this is the screen
  // whose whole subject is whether the reader may take the register.
  const gate = await gateShellPage("/operate/events", "attendance_recording", {
    narrowRecorder: "allow",
    capabilityRefusal: "coach",
  });
  if ("screen" in gate) return gate.screen;

  // Which board to draw. Not which writes to allow: `./actions.ts` re-resolves
  // the operator from the verified session on every save, and the coach's
  // constraints are enforced there whatever this page rendered.
  const isCoachView = isNarrowAttendanceRecorder(gate.operator.roleCodes);
  // The same four calendar roles plus the IT Officer that `removeAttendanceAction`
  // requires. `event_occurrence_assertion` guarded this until LAN-151 retired
  // it; `event_calendar_management` carries the identical role list, so the
  // boundary is unchanged.
  const mayRemove = operatorHasCapability(gate.operator, "event_calendar_management");

  const { id } = await params;
  const query = await searchParams;
  const search = typeof query.q === "string" ? query.q : "";
  const rsvp = typeof query.rsvp === "string" ? query.rsvp : "";
  const attendance = typeof query.attendance === "string" ? query.attendance : "";
  const addingWalkUp = query.add === "walk-up";
  const justAdded = query.added === "walk-up";

  let board: AttendanceBoard;
  try {
    board = await readAttendanceBoard(id);
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return (
      <UnavailableScreen title="Attendance" message={error.message} testId="attendance-unavailable">
        <Box>
          <Button variant="outlined" href="/operate/events">
            {isCoachView ? COACH_RETURN_TO_ELIGIBLE : "Back to events"}
          </Button>
        </Box>
      </UnavailableScreen>
    );
  }

  const { event } = board;

  // UX-71, and UX-90 for a coach. There is nothing to record yet, and the
  // service refuses a write as firmly as the screen refuses the control.
  if (!board.isOpen) {
    // Two closed states, and they are not the same refusal: one waits on the
    // approval and the other only on the clock. `docs/ux/standards.md` rule 4
    // says a refused control names the step that lifts it, so a register that
    // simply has not opened yet must not be described as waiting on a person.
    if (board.closedReason === "before_buffer") {
      return (
        <RegisterNotOpenYet
          eventId={event.id}
          status={event.status}
          opensAt={board.registerOpensAt}
          isCoachView={isCoachView}
        />
      );
    }

    return isCoachView ? (
      <CoachAttendanceLocked status={event.status} />
    ) : (
      <AttendanceLocked eventId={event.id} status={event.status} />
    );
  }

  if (addingWalkUp) {
    return (
      <Stack
        spacing={3}
        sx={{ maxWidth: 900 }}
        data-testid="walk-up-step"
        data-view={isCoachView ? "coach" : "operator"}
      >
        <Box>
          <Typography variant="body2" color="text.secondary">
            {`${event.name} · ${labelFor(STATUS_LABELS, event.status)}`}
          </Typography>
        </Box>
        <WalkUpForm eventId={event.id} />
      </Stack>
    );
  }

  const visible = filterParticipants(board.participants, { search, rsvp, attendance });
  const basePath = `/operate/events/${event.id}/attendance`;

  return (
    <OutcomeSlotProvider>
      <Stack
        spacing={3}
        sx={{ maxWidth: 1100 }}
        data-testid="attendance-board"
        data-view={isCoachView ? "coach" : "operator"}
      >
        <PageHeader
          title={
            isCoachView ? `${event.name} attendance` : `${ATTENDANCE_HEADLINE_PREFIX} ${event.name}`
          }
          subtitle={
            isCoachView
              ? COACH_BOARD_SUBTITLE
              : `${labelFor(STATUS_LABELS, event.status)} · ${formatDetailWhen(event)}${event.venue ? ` · ${event.venue}` : ""}`
          }
          back={{
            href: isCoachView ? "/operate/events" : `/operate/events/${event.id}`,
            label: isCoachView ? "Back to events" : "Back to event",
          }}
        />

        {justAdded ? (
          <ArrivalNotice severity="success" testId="walk-up-added">
            {WALK_UP_ADDED}
          </ArrivalNotice>
        ) : null}

        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          sx={{ alignItems: { md: "center" }, justifyContent: "space-between" }}
        >
          <AttendanceFilters
            basePath={basePath}
            search={search}
            rsvp={rsvp}
            attendance={attendance}
          />
          <Button
            variant="outlined"
            href={`${basePath}?add=walk-up`}
            sx={{ minHeight: 44, whiteSpace: "nowrap" }}
            data-testid="add-walk-up"
          >
            {ADD_WALK_UP}
          </Button>
        </Stack>

        <Stack spacing={3}>
          {/*
          The counts are the operator's. Invited, Recorded and Walk-ups are
          fine for anyone, but Mismatches is a count of an exception class the
          Monday report acts on and the coach's surface deliberately does not —
          and UX-91 shows no counts row at all, on either presentation.
        */}
          {isCoachView ? null : <Counts board={board} />}

          {board.participants.length === 0 ? (
            <EmptyState
              title={NOBODY_INVITED}
              action={{ href: `${basePath}?add=walk-up`, label: ADD_WALK_UP }}
              testId="attendance-empty"
            />
          ) : visible.length === 0 ? (
            <EmptyState
              title={NO_MATCHING_PARTICIPANTS}
              searched={search || undefined}
              action={{ href: basePath, label: "Clear filters" }}
              testId="attendance-filter-empty"
            />
          ) : (
            <AttendanceGroups
              eventId={event.id}
              eventType={event.eventType}
              participants={visible}
              search={search}
              showMismatch={!isCoachView}
              mayRemove={mayRemove}
            />
          )}
        </Stack>

        {/*
        **Complete attendance** returns to `/operate/events/[id]`, which is
        event administration and refuses a coach outright. Offering a coach a
        button to a screen that will refuse them is worse than offering none,
        and UX-91 shows the coach's board ending at the list.
      */}
        {isCoachView ? null : (
          <Stack spacing={1} sx={{ maxWidth: 420 }}>
            <Button
              variant="contained"
              href={`/operate/events/${event.id}`}
              fullWidth
              sx={{ minHeight: 44 }}
              data-testid="complete-attendance"
            >
              {COMPLETE_ATTENDANCE}
            </Button>
          </Stack>
        )}
      </Stack>
    </OutcomeSlotProvider>
  );
}

/**
 * The register's buffer, before it lifts — D71 and D72. LAN-152.
 *
 * One screen for both readers, unlike the two above. The reason those differ is
 * authority: an operator can go and assert occurrence and a coach cannot, so
 * the sentence has to change with who is reading it. Nobody can hurry a clock,
 * so this one says the same thing to everybody, and only the way back out
 * differs — a coach's route is their eligible events, not event administration
 * that would refuse them.
 */
function RegisterNotOpenYet({
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
function CoachAttendanceLocked({ status }: { status: string }) {
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
function AttendanceLocked({ eventId, status }: { eventId: string; status: string }) {
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
function Counts({ board }: { board: AttendanceBoard }) {
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

/**
 * The board's filters, applied in memory.
 *
 * In memory rather than in SQL because the list is one event's audience — tens
 * of people, already read in full to compute the counts above — and a recorder
 * switching filters mid-evening should not re-run a `full outer join` for it.
 * The counts deliberately describe the **whole** event rather than the filtered
 * view, so a filter never makes the club look like it invited fewer people.
 */
export function filterParticipants(
  participants: AttendanceParticipant[],
  filters: { search: string; rsvp: string; attendance: string },
): AttendanceParticipant[] {
  const needle = filters.search.trim().toLowerCase();

  return participants.filter((participant) => {
    if (needle !== "" && !participant.displayName.toLowerCase().includes(needle)) return false;

    if (filters.rsvp === "yes" && participant.rsvp !== "yes") return false;
    if (filters.rsvp === "no" && participant.rsvp !== "no") return false;
    if (filters.rsvp === "none" && participant.rsvp !== null) return false;

    if (filters.attendance === "unmarked" && participant.presence !== null) return false;
    if (
      filters.attendance !== "" &&
      filters.attendance !== "unmarked" &&
      participant.presence !== filters.attendance
    ) {
      return false;
    }

    return true;
  });
}
