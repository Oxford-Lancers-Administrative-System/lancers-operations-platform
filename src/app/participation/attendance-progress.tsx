import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

import {
  attendanceProgressByCapacity,
  type AttendanceProgressBlock,
  type AttendanceProgressRow,
} from "@/lib/services/event-attendance-progress";
import { PRESENCE_COLORS, PRESENCE_LABELS } from "../operate/events/[id]/attendance/presentation";

import {
  ATTENDANCE_NO_SHOW_LABEL,
  ATTENDANCE_NOT_RECORDED_LABEL,
  HEADLINE_INVITED_LABEL,
} from "./presentation";

/**
 * LAN-504 — an occurred event's attendance, directly below the RSVP blocks and
 * laid out like them ("literally this exact same screen", Brian, 16 October
 * 2026): one block per group, the four recorded values, the not-recorded count
 * that makes them add up, and a bar. Counting is `event-attendance-progress.ts`.
 */

const BAR_HEIGHT = 8;

/** Turned up from the left, didn't from the right, nothing recorded as the pale track between — the RSVP bar's shape. */
function AttendanceBar({ block }: { block: AttendanceProgressBlock }) {
  const segment = { height: BAR_HEIGHT, borderRadius: 0, minWidth: 0 } as const;
  const parts = [
    { key: "present", width: block.present, color: PRESENCE_COLORS.present, value: 100 },
    { key: "late", width: block.late, color: PRESENCE_COLORS.late, value: 100 },
    { key: "not-recorded", width: block.notRecorded, color: undefined, value: 0 },
    { key: "excused", width: block.excused, color: PRESENCE_COLORS.excused, value: 100 },
    { key: "no-show", width: block.noShow, color: PRESENCE_COLORS.absent, value: 100 },
  ] as const;

  return (
    <Box
      sx={{ mt: 1.5, display: "flex", height: BAR_HEIGHT, borderRadius: 1, overflow: "hidden" }}
      role="img"
      aria-label={`${block.label}: ${block.present} present, ${block.late} late, ${block.noShow} no-show, ${block.excused} excused, ${block.notRecorded} not recorded, of ${block.total}`}
      data-testid="attendance-bar"
    >
      {parts.map((part) => (
        <LinearProgress
          key={part.key}
          variant="determinate"
          value={part.value}
          color={part.color}
          sx={{ ...segment, flexGrow: part.width }}
          data-testid={`attendance-bar-${part.key}`}
          data-width={part.width}
        />
      ))}
    </Box>
  );
}

function Count({ value, label, testId }: { value: number; label: string; testId: string }) {
  return (
    <Box sx={{ minWidth: 0 }} data-testid={testId} data-count={value}>
      <Typography variant="h2" component="p">
        {value}
      </Typography>
      <Typography variant="body2" color="text.secondary" noWrap>
        {label}
      </Typography>
    </Box>
  );
}

function AttendanceBlock({ block }: { block: AttendanceProgressBlock }) {
  return (
    <Paper
      variant="outlined"
      sx={{ p: 2, minWidth: 0 }}
      data-testid={`attendance-progress-${block.capacity}`}
    >
      {/* No percentage: Showed is never one (D62, D74), and the RSVP block shows none either. */}
      <Typography variant="body2" sx={{ fontWeight: 700 }}>
        {block.label}
      </Typography>

      <Box
        sx={{ mt: 0.5, display: "grid", gap: 1, gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}
      >
        <Count value={block.present} label={PRESENCE_LABELS.present} testId="attendance-present" />
        <Count value={block.late} label={PRESENCE_LABELS.late} testId="attendance-late" />
        <Count value={block.noShow} label={ATTENDANCE_NO_SHOW_LABEL} testId="attendance-no-show" />
        <Count value={block.excused} label={PRESENCE_LABELS.excused} testId="attendance-excused" />
      </Box>

      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ mt: 1 }}
        data-testid="attendance-not-recorded"
        data-count={block.notRecorded}
      >
        {`${block.notRecorded} ${ATTENDANCE_NOT_RECORDED_LABEL.toLowerCase()} / ${block.total} ${HEADLINE_INVITED_LABEL.toLowerCase()}`}
      </Typography>

      <AttendanceBar block={block} />
    </Paper>
  );
}

/** Operator event page only, and only once the event has occurred — the caller decides. */
export function AttendanceProgress({ people }: { people: readonly AttendanceProgressRow[] }) {
  const blocks = attendanceProgressByCapacity(people);
  if (blocks.length === 0) return null;

  return (
    <Box
      data-testid="attendance-progress"
      sx={{
        display: "grid",
        gap: 2,
        alignItems: "start",
        gridTemplateColumns: {
          xs: "minmax(0, 1fr)",
          sm: "repeat(2, minmax(0, 1fr))",
          md: `repeat(${blocks.length}, minmax(0, 1fr))`,
        },
      }}
    >
      {blocks.map((block) => (
        <AttendanceBlock key={block.capacity} block={block} />
      ))}
    </Box>
  );
}
