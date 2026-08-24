import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { visuallyHidden } from "@mui/utils";
import { WEEKDAY_LABELS } from "@/lib/services/calendar";
import type { AcademicYearColumn, YearSegment, YearWeek } from "@/lib/services/oxford-year";
import CalendarEntry from "./calendar-entry";
import { formatCellDate, formatDayNumber, formatWeekRange } from "./presentation";
import type { TileStatus } from "./tile-status";

/**
 * The Oxford View — one continuous academic year. LAN-153.
 *
 * ## One table, not seven
 *
 * Long Vacation, Michaelmas, Christmas Vacation, Hilary, Easter Vacation,
 * Trinity, Long Vacation, in one scroll. The segments are headings *inside* the
 * grid rather than separate tables, because the whole point is that the year is
 * continuous: seven tables would be seven calendars again, which is what D85
 * retired. Each heading carries an `id`, and the jump control scrolls to it.
 *
 * A vacation row is tinted so the eye can find the boundaries while scrolling,
 * and it also states its name in every row label ("Christmas Vacation 2"), so a
 * reader who cannot separate the tint from the ground loses nothing — the same
 * rule the type colours follow.
 *
 * ## Both tiers, one component
 *
 * `href` and `status` are computed per event by the page, which knows the tier.
 * Nothing here reads a status off an event or builds a destination, so the
 * public column and the operator's are the same grid with different tiles.
 *
 * ## Phone
 *
 * Below `md` the grid becomes stacked week cards, which is the shape the term
 * card already used below its own breakpoint. Every week the desktop grid holds
 * is present, empty ones included, so `slice-ux.md` § 7's rule against dropping
 * data on reflow holds: a week with nothing in it is a fact about the week.
 */

export interface YearColumnProps {
  column: AcademicYearColumn;
  /** Where one event's tile goes, and what word it carries. Tier decisions. */
  tile: (eventId: string) => { href: string; status: TileStatus };
}

export default function YearColumn({ column, tile }: YearColumnProps) {
  if (column.segments.length === 0) return null;

  return (
    <Paper variant="outlined" sx={{ overflow: "hidden" }} data-testid="year-column">
      {/* Desktop: the week grid. */}
      <Box sx={{ display: { xs: "none", md: "block" }, overflowX: "auto" }}>
        <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
          <caption style={visuallyHidden as React.CSSProperties}>
            {`Academic year ${column.academicYear}, one continuous column`}
          </caption>
          <Box component="thead">
            <Box component="tr">
              <HeadCell>Week</HeadCell>
              {WEEKDAY_LABELS.map((label) => (
                <HeadCell key={label}>{label.slice(0, 3)}</HeadCell>
              ))}
            </Box>
          </Box>
          <Box component="tbody">
            {column.segments.map((segment) => (
              <SegmentRows key={segment.key} segment={segment} tile={tile} />
            ))}
          </Box>
        </Box>
      </Box>

      {/* Phone: the same weeks, stacked. */}
      <Stack sx={{ display: { xs: "flex", md: "none" } }} data-testid="year-column-stack">
        {column.segments.map((segment) => (
          <Box key={segment.key}>
            <SegmentHeading segment={segment} />
            {segment.weeks.map((week) => (
              <Box
                key={week.startsOn}
                sx={{
                  p: 1.5,
                  borderTop: 1,
                  borderColor: "divider",
                  bgcolor: segment.kind === "vacation" ? "action.hover" : "transparent",
                }}
                data-testid="year-week-card"
              >
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ justifyContent: "space-between", flexWrap: "wrap" }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {week.label}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {formatWeekRange(week.startsOn, week.endsOn)}
                  </Typography>
                </Stack>
                <WeekEvents week={week} tile={tile} />
              </Box>
            ))}
          </Box>
        ))}
      </Stack>
    </Paper>
  );
}

/** The events of one week, in date order, or the fact that there are none. */
function WeekEvents({ week, tile }: { week: YearWeek; tile: YearColumnProps["tile"] }) {
  const events = week.days.flatMap((day) => day.events.map((event) => ({ day, event })));

  if (events.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
        Nothing this week
      </Typography>
    );
  }

  return (
    <Stack spacing={0.5} sx={{ mt: 0.75 }}>
      {events.map(({ event }) => {
        const { href, status } = tile(event.id);
        return (
          <CalendarEntry
            key={event.id}
            event={event}
            href={href}
            statusWord={status.word}
            announcedStatus={status.announced}
            struck={status.struck}
            showDate
          />
        );
      })}
    </Stack>
  );
}

/**
 * One segment's heading row and its weeks.
 *
 * The heading is a full-width row inside the table rather than a caption above
 * a new one, so the year stays a single scroll and a week row never loses its
 * columns to a heading.
 */
function SegmentRows({ segment, tile }: { segment: YearSegment; tile: YearColumnProps["tile"] }) {
  return (
    <>
      <Box component="tr">
        <Box
          component="th"
          scope="colgroup"
          colSpan={8}
          id={segment.key}
          sx={{
            textAlign: "left",
            p: 1.25,
            borderTop: 1,
            borderColor: "divider",
            bgcolor: "action.selected",
            // So a jump does not tuck the heading under a sticky bar or the very
            // top edge of the viewport.
            scrollMarginTop: 16,
          }}
          data-testid="year-segment-heading"
          data-segment-kind={segment.kind}
        >
          <Typography variant="overline" component="span" sx={{ fontWeight: 700 }}>
            {segment.jumpLabel}
          </Typography>
        </Box>
      </Box>

      {segment.weeks.map((week) => (
        <Box
          component="tr"
          key={week.startsOn}
          sx={{
            bgcolor: segment.kind === "vacation" ? "action.hover" : "transparent",
            verticalAlign: "top",
          }}
          data-testid="year-week-row"
        >
          <Box
            component="th"
            scope="row"
            sx={{
              textAlign: "left",
              p: 1,
              borderTop: 1,
              borderColor: "divider",
              minWidth: 168,
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {week.label}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {formatWeekRange(week.startsOn, week.endsOn)}
            </Typography>
          </Box>

          {week.days.map((day) => (
            <Box
              component="td"
              key={day.day}
              sx={{
                p: 0.75,
                borderTop: 1,
                borderLeft: 1,
                borderColor: "divider",
                width: "12.5%",
                ...(day.isToday
                  ? { outline: 2, outlineColor: "primary.main", outlineOffset: -2 }
                  : {}),
              }}
              data-testid="year-day"
              data-day={day.day}
            >
              <Typography variant="caption" color="text.secondary" component="p">
                {formatDayNumber(day.day)}
                <Box component="span" sx={visuallyHidden}>
                  {` ${formatCellDate(day.day)}${day.isToday ? ", today" : ""}`}
                </Box>
              </Typography>
              <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                {day.events.map((event) => {
                  const { href, status } = tile(event.id);
                  return (
                    <CalendarEntry
                      key={event.id}
                      event={event}
                      href={href}
                      statusWord={status.word}
                      announcedStatus={status.announced}
                      struck={status.struck}
                    />
                  );
                })}
              </Stack>
            </Box>
          ))}

          {/* A clipped final vacation row is short; the columns still line up. */}
          {week.days.length < 7
            ? Array.from({ length: 7 - week.days.length }, (_, index) => (
                <Box
                  component="td"
                  key={`pad-${index}`}
                  sx={{ borderTop: 1, borderLeft: 1, borderColor: "divider" }}
                />
              ))
            : null}
        </Box>
      ))}
    </>
  );
}

function SegmentHeading({ segment }: { segment: YearSegment }) {
  return (
    <Box
      id={`${segment.key}-stack`}
      sx={{ p: 1.25, bgcolor: "action.selected", borderTop: 1, borderColor: "divider" }}
    >
      <Typography variant="overline" component="h2" sx={{ fontWeight: 700 }}>
        {segment.jumpLabel}
      </Typography>
    </Box>
  );
}

function HeadCell({ children }: { children: React.ReactNode }) {
  return (
    <Box
      component="th"
      scope="col"
      sx={{ textAlign: "left", p: 1, borderBottom: 1, borderColor: "divider" }}
    >
      <Typography variant="caption" sx={{ fontWeight: 700 }}>
        {children}
      </Typography>
    </Box>
  );
}
