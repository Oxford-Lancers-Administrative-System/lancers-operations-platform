"use client";

import { useActionState, useState } from "react";
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
  showMismatch = true,
  mayRemove = true,
}: {
  eventId: string;
  participant: AttendanceParticipant;
  /**
   * The RSVP-versus-attendance mismatch chip. Off for a coaching assignment:
   * `slice-ux.md` § 3 keeps the mismatch exception on the operator's board and
   * in the Monday report, and the chip is one word away from the RSVP reason a
   * coach may not have.
   */
  showMismatch?: boolean;
  /**
   * Whether **Remove this record** is offered. LAN-110: removal exists to
   * unwind an occurrence assertion, so it belongs to whoever may make one — and
   * a coach may not. `removeAttendanceAction` guards on the same capability, so
   * this decides the control and never the permission.
   */
  mayRemove?: boolean;
}) {
  const [state, formAction, pending] = useActionState(recordAttendanceAction, EMPTY_SAVE_STATE);

  // The state only speaks for the row it came from. Without this check a
  // failure on one person could render under another after a revalidation
  // reordered the list.
  const mine = state.key === participant.key;

  /**
   * What is recorded comes from the **server props**, and only from them.
   *
   * This row used to prefer its own last save state over the props —
   * `state.presence ?? participant.presence` in effect — on the reasoning that
   * the state was fresher for one render after a save. That was unsound, and
   * independent review demonstrated the failure: `removeAttendanceAction`
   * revalidates and soft-navigates to the same route, so the row instance
   * survives under its stable key while the props go to `null`. The stale save
   * state then won, and the board went on displaying `Saved · … · 20:07` for a
   * record that no longer existed — with the removal control still offered,
   * whose second press returned "there is no attendance recorded for that
   * person" directly beneath it. Two contradictory claims on one row about who
   * was at a practice.
   *
   * The premise was wrong as well as the consequence: `recordAttendanceAction`
   * calls `revalidatePath` **before** it returns, so the props a save produces
   * have already been re-rendered by the time the state carrying them arrives.
   * There was no window to cover.
   *
   * So `state` now does the one job props cannot: report a save that **failed**,
   * which by definition left the server value alone.
   */
  const committed: AttendancePresence | null = participant.presence;
  const savedLine = describeCommitted(participant.recordedAt, participant.recordedByName);
  const mismatch = showMismatch ? describeMismatch(participant.mismatch) : null;
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

      {committed === null || !mayRemove ? null : (
        <RemoveAttendance eventId={eventId} participant={participant} />
      )}
    </Box>
  );
}

/**
 * Takes one attendance record away entirely.
 *
 * ## Why this is on the screen at all
 *
 * Because a row recorded against the wrong person, or against the wrong event
 * in a list, is otherwise permanent. A save corrects an observation — "they
 * were late, not absent" — and there is no save that means "there is no
 * observation here at all".
 *
 * It also unblocks cancelling an event. Invariant P5's cascading foreign key
 * refuses to move an event out of `approved` while attendance hangs off it, and
 * the service's own refusal reads "remove them before changing what happened at
 * the event". The service function existed from the start; the control did not,
 * so that instruction was a dead end. Independent review found it, and this is
 * the half that was missing.
 *
 * ## Why it is not one of the four buttons
 *
 * Removing a record is not correcting one. A correction says "they were late,
 * not absent" and keeps the history; this says "there is no observation here",
 * which is a real loss of evidence about who was at a practice. So it is behind
 * a disclosure, the way abandoning a draft is, and it asks a question with the
 * destructive answer second.
 *
 * It is still audited: `attendance.removed` records the actor and the value
 * that was removed, so the deletion is itself part of the trail.
 */
function RemoveAttendance({
  eventId,
  participant,
}: {
  eventId: string;
  participant: AttendanceParticipant;
}) {
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
        {state.key === participant.key && state.error ? (
          <Alert severity="error" data-testid="remove-attendance-error">
            {state.error}
          </Alert>
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
