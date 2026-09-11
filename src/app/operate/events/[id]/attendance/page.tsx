import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ArrivalNotice, OutcomeSlotProvider } from "@/components/outcome-slot";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { isNarrowAttendanceRecorder } from "@/lib/auth/capabilities";
import { operatorHasCapability } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import { UnavailableScreen } from "@/app/operate/unavailable";
import { readAttendanceBoard, type AttendanceBoard } from "@/lib/services/attendance";
import { gateShellPage } from "../../../gate";
import { formatDetailWhen, labelFor, STATUS_LABELS } from "../../presentation";
import { AttendanceFilters } from "./attendance-filters";
import { AttendanceGroups } from "./attendance-groups";
import { WalkUpForm } from "./walk-up-form";
import { filterParticipants } from "./attendance-filter-logic";
import {
  AttendanceLocked,
  CoachAttendanceLocked,
  Counts,
  RegisterNotOpenYet,
} from "./attendance-locked-screens";
import {
  ADD_WALK_UP,
  ATTENDANCE_HEADLINE_PREFIX,
  COACH_BOARD_SUBTITLE,
  COACH_RETURN_TO_ELIGIBLE,
  COMPLETE_ATTENDANCE,
  NOBODY_INVITED,
  NO_MATCHING_PARTICIPANTS,
  WALK_UP_ADDED,
} from "./presentation";

/**
 * The attendance surface — UX-71, UX-72, UX-73 and UX-74. LAN-80. One route,
 * four states: the event's status chooses UX-71/UX-72, `?add=walk-up` opens
 * UX-73, UX-74 corrects in place on its row. Gated on `attendance_recording`
 * (four calendar roles, three coaching seats); every write re-resolves the
 * operator and row-locks the event, so this gate is a courtesy, not the
 * boundary. The payload never carries a decline reason, a contact detail, an
 * availability/injury note, or a delivery diagnostic — not filtered, never
 * selected, for either reader.
 *
 * Decision history: docs/ux/tickets/LAN-80-attendance.md · LAN-110-coach-attendance.md
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
