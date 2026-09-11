"use client";

import { useActionState, useState } from "react";
import { RowCard } from "@/components/row-card";
import { Notice } from "@/components/notice";
import { useOutcomeSlot } from "@/components/outcome-slot";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import {
  ATTENDANCE_PRESENCES,
  type AttendanceParticipant,
  type AttendancePresence,
} from "@/lib/services/attendance-vocabulary";
import { recordAttendanceAction, removeAttendanceAction } from "./actions";
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

// One participant on the attendance board — UX-72, UX-74, LAN-80. The
// correction is the same control as the first save (§ 7's phone reachability);
// each row is its own form for per-row Saving/Saved/failed state (§ 9).
export function AttendanceRow({
  eventId,
  participant,
  showMismatch = true,
  mayRemove = true,
}: {
  eventId: string;
  participant: AttendanceParticipant;
  /** Off for a coaching assignment — `slice-ux.md` § 3. */
  showMismatch?: boolean;
  /** LAN-110: this decides the control, never the permission (the action guards itself). */
  mayRemove?: boolean;
}) {
  const slot = useOutcomeSlot(`record-${participant.key}`);
  const [state, formAction, pending] = useActionState(recordAttendanceAction, EMPTY_SAVE_STATE);

  const mine = state.key === participant.key;

  // What is recorded comes from server props only, never `state` — a stale
  // save state disagreeing with a removal was a found defect. `state` reports
  // only a failed save.
  const committed: AttendancePresence | null = participant.presence;
  const savedLine = describeCommitted(participant.recordedAt, participant.recordedByName);
  const mismatch = showMismatch ? describeMismatch(participant.mismatch) : null;
  const failure = slot.showing && mine && state.error !== null ? state.error : null;

  return (
    <Box
      component="li"
      data-testid="attendance-row"
      data-participant={participant.key}
      data-presence={committed ?? "none"}
      sx={{ listStyle: "none" }}
    >
      <RowCard
        title={participant.displayName}
        sublines={[describeRsvp(participant.rsvp, participant.isWalkUp)]}
        chips={
          <>
            {participant.isWalkUp ? (
              <Typography variant="body2" color="text.secondary" data-testid="walk-up-chip">
                {WALK_UP_CHIP}
              </Typography>
            ) : null}
            {mismatch ? (
              <Typography variant="body2" data-testid="mismatch-chip">
                {mismatch}
              </Typography>
            ) : null}
          </>
        }
        actionWidth="65%"
        actions={
          <Stack spacing={1} sx={{ width: "100%" }}>
            <Box component="form" action={formAction} onSubmit={slot.claim}>
              <input type="hidden" name="eventId" value={eventId} />
              <input type="hidden" name="participantKey" value={participant.key} />
              <Stack spacing={1}>
                {/* A grid, not a wrapping row — Brian's verdict on the real phone (relocations.md). */}
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
                  <Notice severity="error" testId="attendance-save-error">
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
                  </Notice>
                ) : (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    data-testid="attendance-committed"
                  >
                    {pending ? SAVING : (savedLine ?? NOT_MARKED)}
                  </Typography>
                )}
              </Stack>
            </Box>

            {committed === null || !mayRemove ? null : (
              <RemoveAttendance eventId={eventId} participant={participant} />
            )}
          </Stack>
        }
      />
    </Box>
  );
}

// Takes one attendance record away entirely — unblocks cancelling an event
// (invariant P5's cascading FK). A disclosure, not one of the four buttons —
// destructive, audited (attendance.removed).
function RemoveAttendance({
  eventId,
  participant,
}: {
  eventId: string;
  participant: AttendanceParticipant;
}) {
  const slot = useOutcomeSlot(`remove-${participant.key}`);
  const [state, formAction, pending] = useActionState(removeAttendanceAction, EMPTY_SAVE_STATE);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Box sx={{ gridColumn: { md: "2" } }}>
        <Button
          variant="text"
          size="small"
          color="inherit"
          onClick={() => setOpen(true)}
          data-testid="remove-attendance-open"
          sx={{ minHeight: 44 }}
        >
          Remove this record
        </Button>
      </Box>
    );
  }

  return (
    <Box
      component="form"
      action={formAction}
      onSubmit={slot.claim}
      data-testid="remove-attendance-form"
      sx={{ gridColumn: { md: "2" } }}
    >
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="participantKey" value={participant.key} />
      <Stack spacing={1}>
        <Typography variant="body2" color="text.secondary">
          {`Remove the attendance recorded for ${participant.displayName}? This is not a
            correction — it leaves no observation at all, and it is what you do when the
            record belongs to a different event.`}
        </Typography>
        {slot.showing && state.key === participant.key && state.error ? (
          <Notice severity="error" testId="remove-attendance-error">
            {state.error}
          </Notice>
        ) : null}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          <Button variant="outlined" onClick={() => setOpen(false)} disabled={pending}>
            Keep it
          </Button>
          <Button type="submit" variant="text" color="error" disabled={pending}>
            {pending ? "Removing…" : "Remove record"}
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
