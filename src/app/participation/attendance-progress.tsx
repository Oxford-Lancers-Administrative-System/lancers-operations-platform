import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

import {
  attendanceProgressByCapacity,
  formatAttendanceHeadline,
  type AttendanceBucket,
  type AttendanceProgressBlock,
  type AttendanceProgressRow,
} from "@/lib/services/event-attendance-progress";
import { PRESENCE_COLORS, PRESENCE_LABELS } from "../operate/events/[id]/attendance/presentation";

import { ResponseBlockToggle } from "./response-block-toggle";
import { ATTENDANCE_NO_SHOW_LABEL, cardTitle } from "./presentation";

/**
 * LAN-504 — an occurred event's attendance, directly below the RSVP cards and
 * laid out like them ("literally this exact same screen", Brian, 16 October
 * 2026): one card per group, a headline, the four counts and a bar. Brian's
 * walk of 22 October 2026 made the card a dropdown too, closed on arrival,
 * opening in place onto the names. Counting is `event-attendance-progress.ts`.
 */

const BAR_HEIGHT = 8;

/** Left to right in the order the card reads: present, late, no-show, excused. */
const PARTS: readonly {
  bucket: AttendanceBucket;
  label: string;
  color: "success" | "warning" | "info" | "error";
  testId: string;
}[] = [
  {
    bucket: "present",
    label: PRESENCE_LABELS.present,
    color: PRESENCE_COLORS.present,
    testId: "present",
  },
  { bucket: "late", label: PRESENCE_LABELS.late, color: PRESENCE_COLORS.late, testId: "late" },
  {
    bucket: "noShow",
    label: ATTENDANCE_NO_SHOW_LABEL,
    color: PRESENCE_COLORS.absent,
    testId: "no-show",
  },
  {
    bucket: "excused",
    label: PRESENCE_LABELS.excused,
    color: PRESENCE_COLORS.excused,
    testId: "excused",
  },
];

/** The four values across the expected people, with no empty remainder: the segments are the whole bar. */
function AttendanceBar({ block }: { block: AttendanceProgressBlock }) {
  const segment = { height: BAR_HEIGHT, borderRadius: 0, minWidth: 0 } as const;

  return (
    <Box
      sx={{ mt: 1.5, display: "flex", height: BAR_HEIGHT, borderRadius: 1, overflow: "hidden" }}
      role="img"
      aria-label={`${cardTitle(block.label, "Attendance")}: ${block.present} present, ${block.late} late, ${block.noShow} no-show, ${block.excused} excused, of ${block.expected} expected`}
      data-testid="attendance-bar"
    >
      {PARTS.map((part) => (
        <LinearProgress
          key={part.bucket}
          variant="determinate"
          value={100}
          color={part.color}
          sx={{ ...segment, flexGrow: block[part.bucket] }}
          data-testid={`attendance-bar-${part.testId}`}
          data-width={block[part.bucket]}
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

function BlockBody({ block }: { block: AttendanceProgressBlock }) {
  return (
    <>
      <Typography variant="body2" sx={{ fontWeight: 700 }}>
        {cardTitle(block.label, "Attendance")}
      </Typography>

      <Typography variant="h2" component="p" sx={{ mt: 0.5 }} data-testid="attendance-headline">
        {formatAttendanceHeadline(block)}
      </Typography>

      <Box
        sx={{ mt: 1, display: "grid", gap: 1, gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}
      >
        {PARTS.map((part) => (
          <Count
            key={part.bucket}
            value={block[part.bucket]}
            label={part.label}
            testId={`attendance-${part.testId}`}
          />
        ))}
      </Box>

      <AttendanceBar block={block} />
    </>
  );
}

/**
 * The names: Present top left, Late top right, No-show bottom left, Excused
 * bottom right; one column on a phone, in that same order. The list styling is
 * the Responses panel's own.
 */
function AttendanceNames({ block }: { block: AttendanceProgressBlock }) {
  return (
    <Box
      data-testid={`attendance-names-${block.capacity}-grid`}
      sx={{
        display: "grid",
        columnGap: 3,
        rowGap: 1.5,
        gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))" },
      }}
    >
      {PARTS.map((part) => (
        <Box
          key={part.bucket}
          sx={{ minWidth: 0 }}
          data-testid={`attendance-names-${block.capacity}-${part.testId}`}
          data-count={block.names[part.bucket].length}
        >
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {`${part.label} · ${block.names[part.bucket].length}`}
          </Typography>
          <Box component="ul" sx={{ m: 0, mt: 0.5, p: 0, listStyle: "none" }}>
            {block.names[part.bucket].map((name, at) => (
              <Typography
                key={`${name}:${at}`}
                component="li"
                variant="body2"
                sx={{ overflowWrap: "anywhere" }}
              >
                {name}
              </Typography>
            ))}
          </Box>
        </Box>
      ))}
    </Box>
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
        // An opened card grows downward on its own; its neighbours keep their height.
        alignItems: "start",
        gridTemplateColumns: {
          xs: "minmax(0, 1fr)",
          sm: "repeat(2, minmax(0, 1fr))",
          md: `repeat(${blocks.length}, minmax(0, 1fr))`,
        },
      }}
    >
      {blocks.map((block) => (
        <Paper
          key={block.capacity}
          variant="outlined"
          sx={{ p: 0, minWidth: 0 }}
          data-testid={`attendance-progress-${block.capacity}`}
        >
          <ResponseBlockToggle
            capacity={`attendance-${block.capacity}`}
            panel={<AttendanceNames block={block} />}
          >
            <BlockBody block={block} />
          </ResponseBlockToggle>
        </Paper>
      ))}
    </Box>
  );
}
