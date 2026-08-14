import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { isServiceError } from "@/lib/db";
import {
  readAttendanceBoard,
  readWalkUpCandidates,
  type AttendanceBoard,
  type AttendanceParticipant,
} from "@/lib/services/attendance";
import { gateShellPage } from "../../../gate";
import { formatDetailWhen, labelFor, STATUS_LABELS } from "../../presentation";
import { AttendanceFilters } from "./attendance-filters";
import { AttendanceRow } from "./attendance-row";
import { WalkUpForm } from "./walk-up-form";
import {
  ADD_WALK_UP,
  ATTENDANCE_HEADLINE_PREFIX,
  ATTENDANCE_LOCKED_DETAIL,
  ATTENDANCE_LOCKED_HEADLINE,
  ATTENDANCE_LOCKED_RULE,
  COMPLETE_ATTENDANCE,
  COMPLETE_ATTENDANCE_MEANING,
  NOBODY_INVITED,
  NO_MATCHING_PARTICIPANTS,
  RSVP_STAYS_SEPARATE,
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
 * The page opens with the shell gate and **no capability**: `slice-ux.md` § 8
 * makes general attendance "authorized operator after `occurred`", which is the
 * ordinary-operator row rather than a role list. Gating it on the narrow
 * `attendance_recorder` grant would lock out the Exec, who are the people the
 * board was drawn for.
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
  const gate = await gateShellPage("/operate/events");
  if ("screen" in gate) return gate.screen;

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
      <Stack spacing={2} sx={{ maxWidth: 720 }}>
        <Typography variant="h6" component="h1">
          Attendance
        </Typography>
        <Alert severity="warning" data-testid="attendance-unavailable">
          {error.message}
        </Alert>
        <Box>
          <Button variant="outlined" href="/operate/events">
            Back to events
          </Button>
        </Box>
      </Stack>
    );
  }

  const { event } = board;

  // UX-71. The event has not been asserted to have happened, or was asserted
  // not to have — either way there is nothing to record, and the service says
  // so as well as the screen does.
  if (!board.isOpen) {
    return <AttendanceLocked eventId={event.id} status={event.status} />;
  }

  if (addingWalkUp) {
    const candidates = await readWalkUpCandidates(event.id);
    return (
      <Stack spacing={3} sx={{ maxWidth: 900 }} data-testid="walk-up-step">
        <Box>
          <Typography variant="body2" color="text.secondary">
            {`${event.name} · ${labelFor(STATUS_LABELS, event.status)}`}
          </Typography>
        </Box>
        <WalkUpForm eventId={event.id} candidates={candidates} />
      </Stack>
    );
  }

  const visible = filterParticipants(board.participants, { search, rsvp, attendance });
  const basePath = `/operate/events/${event.id}/attendance`;

  return (
    <Stack spacing={3} sx={{ maxWidth: 1100 }} data-testid="attendance-board">
      <Box>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          {`${ATTENDANCE_HEADLINE_PREFIX} ${event.name}`}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {`${labelFor(STATUS_LABELS, event.status)} · ${formatDetailWhen(event)}${
            event.venue ? ` · ${event.venue}` : ""
          }`}
        </Typography>
      </Box>

      {justAdded ? (
        <Alert severity="success" data-testid="walk-up-added">
          Walk-up recorded. It is flagged for later reconciliation and no membership was created.
        </Alert>
      ) : null}

      {/*
        Not a warning and not a footnote. The frozen model says mismatches are
        "computed, surfaced as exceptions, and never silently reconciled", and
        a recorder looking at somebody who said no and turned up needs to know
        that recording Present is the correct thing to do rather than a conflict
        to resolve.
      */}
      <Alert severity="info" data-testid="rsvp-separate-note">
        {RSVP_STAYS_SEPARATE}
      </Alert>

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

      <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 3 } }}>
        <Counts board={board} />

        {board.participants.length === 0 ? (
          <Alert severity="info" data-testid="attendance-empty">
            {NOBODY_INVITED}
          </Alert>
        ) : visible.length === 0 ? (
          <Alert severity="info" data-testid="attendance-filter-empty">
            {NO_MATCHING_PARTICIPANTS}
          </Alert>
        ) : (
          <Box component="ul" sx={{ listStyle: "none", p: 0, m: 0 }}>
            {visible.map((participant) => (
              <AttendanceRow key={participant.key} eventId={event.id} participant={participant} />
            ))}
          </Box>
        )}
      </Paper>

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
        <Typography variant="body2" color="text.secondary">
          {COMPLETE_ATTENDANCE_MEANING}
        </Typography>
      </Stack>
    </Stack>
  );
}

/** UX-71, and the state UX-75 leaves an event in permanently. */
function AttendanceLocked({ eventId, status }: { eventId: string; status: string }) {
  return (
    <Stack spacing={3} sx={{ maxWidth: 720 }} data-testid="attendance-locked" data-status={status}>
      <Box>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          {ATTENDANCE_LOCKED_HEADLINE}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {ATTENDANCE_LOCKED_DETAIL}
        </Typography>
      </Box>
      <Alert severity="info">{ATTENDANCE_LOCKED_RULE}</Alert>
      <Box>
        <Button variant="contained" href={`/operate/events/${eventId}`} sx={{ minHeight: 44 }}>
          Return to event
        </Button>
      </Box>
    </Stack>
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
    <Box
      sx={{
        display: "grid",
        gap: 1.5,
        gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", sm: "repeat(4, minmax(0, 1fr))" },
        mb: 2,
      }}
    >
      {entries.map((entry) => (
        <Box key={entry.label} data-testid={entry.testId}>
          <Typography variant="h6" component="p" sx={{ fontWeight: 700 }}>
            {entry.value}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {entry.label}
          </Typography>
        </Box>
      ))}
    </Box>
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
