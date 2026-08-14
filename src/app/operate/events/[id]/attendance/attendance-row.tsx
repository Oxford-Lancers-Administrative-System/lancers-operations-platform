"use client";

import { useActionState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import {
  ATTENDANCE_PRESENCES,
  type AttendanceParticipant,
  type AttendancePresence,
} from "@/lib/services/attendance-vocabulary";
import { recordAttendanceAction } from "./actions";
import { EMPTY_SAVE_STATE } from "./action-state";
import {
  describeCommitted,
  describeMismatch,
  describeRsvp,
  NOT_MARKED,
  PRESENCE_COLORS,
  PRESENCE_LABELS,
  SAVE_FAILED_HEADLINE,
  SAVING,
  WALK_UP_CHIP,
} from "./presentation";

/**
 * One participant on the attendance board — UX-72, and UX-74's correction in
 * place. LAN-80.
 *
 * ## Why the correction is not a second screen
 *
 * UX-74 is "Correct attendance", and what it shows is the latest committed
 * value, the four states, and a note that the correction changes attendance
 * only. Every one of those is already on this row. Sending an operator standing
 * at the side of a pitch to a separate screen to change Absent to Present —
 * because they misheard a name in the dark — is the interaction the phone
 * layout exists to avoid, and § 7 requires the four states to stay reachable at
 * 375px. So the first save and the correction are the same control, and the
 * difference between them lives in the audit trail where it belongs.
 *
 * ## Why each row is its own form
 *
 * § 9 wants `Saving…`, then the committed value with its actor and time, or a
 * failure that keeps the unsaved selection visible beside what is really
 * recorded. That is per-row state, and a single form around the whole board
 * could only have one of it.
 *
 * Each button is a real submit carrying its own `value`, so the four states
 * work with JavaScript disabled and with a screen reader driving the page. The
 * pending state comes from `useActionState`, not from a click handler, so it
 * cannot disagree with what the form is actually doing.
 *
 * ## What is on screen, and what is not
 *
 * The person's name, their standing RSVP, the four states, and the committed
 * line. Not the reason behind a "no", not a contact detail, not an availability
 * or injury note — none of which this row is given, because the service never
 * selects them.
 */
export function AttendanceRow({
  eventId,
  participant,
}: {
  eventId: string;
  participant: AttendanceParticipant;
}) {
  const [state, formAction, pending] = useActionState(recordAttendanceAction, EMPTY_SAVE_STATE);

  // The state only speaks for the row it came from. Without this check a
  // failure on one person could render under another after a revalidation
  // reordered the list.
  const mine = state.key === participant.key;

  // The server's value wins over the props on the render immediately after a
  // save, before revalidation has replaced the board underneath.
  const committed: AttendancePresence | null =
    mine && state.presence !== null ? state.presence : participant.presence;
  const committedAt = mine && state.presence !== null ? state.recordedAt : participant.recordedAt;
  const committedBy =
    mine && state.presence !== null ? state.recordedByName : participant.recordedByName;

  const savedLine = describeCommitted(committedAt, committedBy);
  const mismatch = describeMismatch(participant.mismatch);
  const failure = mine && state.error !== null ? state.error : null;

  return (
    <Box
      component="li"
      data-testid="attendance-row"
      data-participant={participant.key}
      data-presence={committed ?? "none"}
      sx={{
        listStyle: "none",
        py: 2,
        borderBottom: 1,
        borderColor: "divider",
        display: "grid",
        gap: 1.5,
        gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) minmax(0, 2fr)" },
        alignItems: "center",
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body1" sx={{ fontWeight: 600 }}>
          {participant.displayName}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {describeRsvp(participant.rsvp, participant.isWalkUp)}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ mt: 0.5, flexWrap: "wrap", gap: 0.5 }}>
          {participant.isWalkUp ? (
            <Chip size="small" color="warning" label={WALK_UP_CHIP} data-testid="walk-up-chip" />
          ) : null}
          {mismatch ? (
            <Chip size="small" variant="outlined" label={mismatch} data-testid="mismatch-chip" />
          ) : null}
        </Stack>
      </Box>

      <Box component="form" action={formAction}>
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="participantKey" value={participant.key} />
        <Stack spacing={1}>
          {/*
            A grid, not a wrapping row. Brian's verdict on the real phone: four
            buttons flowing until they run out of width put three on the first
            line and one orphaned underneath, at three different widths — "super
            janky", and worse than janky at the side of a pitch, because the
            odd-one-out reads as the important one.

            Two by two, each half the width available, so the block is a
            predictable target square whichever state you are reaching for. Four
            across on the desktop, where there is room and a row scans faster.
          */}
          <Box
            role="group"
            aria-label={`Attendance for ${participant.displayName}`}
            sx={{
              display: "grid",
              gap: 1,
              gridTemplateColumns: {
                xs: "repeat(2, minmax(0, 1fr))",
                md: "repeat(4, minmax(0, 1fr))",
              },
            }}
          >
            {ATTENDANCE_PRESENCES.map((presence) => {
              const selected = committed === presence;
              return (
                <Button
                  key={presence}
                  type="submit"
                  name="presence"
                  value={presence}
                  size="small"
                  disabled={pending}
                  aria-pressed={selected}
                  variant={selected ? "contained" : "outlined"}
                  color={selected ? PRESENCE_COLORS[presence] : "inherit"}
                  sx={{ minHeight: 44, width: "100%" }}
                >
                  {PRESENCE_LABELS[presence]}
                </Button>
              );
            })}
          </Box>

          {failure ? (
            // § 9's failed save: the attempted value stays visible, and so does
            // what is actually recorded, because those are two different facts
            // and the operator has to be able to tell them apart.
            <Alert severity="error" data-testid="attendance-save-error">
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {SAVE_FAILED_HEADLINE}
              </Typography>
              <Typography variant="body2">{failure}</Typography>
              {state.attempted ? (
                <Typography variant="body2">
                  {`Not saved: ${PRESENCE_LABELS[state.attempted]}. Recorded: ${
                    committed ? PRESENCE_LABELS[committed] : NOT_MARKED
                  }.`}
                </Typography>
              ) : null}
            </Alert>
          ) : (
            <Typography variant="body2" color="text.secondary" data-testid="attendance-committed">
              {pending ? SAVING : (savedLine ?? NOT_MARKED)}
            </Typography>
          )}
        </Stack>
      </Box>
    </Box>
  );
}
