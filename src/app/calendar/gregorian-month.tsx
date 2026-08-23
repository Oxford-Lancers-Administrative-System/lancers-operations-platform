import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { visuallyHidden } from "@mui/utils";
import { WEEKDAY_LABELS, type MonthGrid } from "@/lib/services/calendar";
import CalendarEntry from "./calendar-entry";
import { formatCellDate, formatDayNumber, formatMonthLabel } from "./presentation";
import type { TileStatus } from "./tile-status";

/**
 * The conventional Gregorian month. LAN-114.
 *
 * ## One month, two shapes, no hidden days
 *
 * At desktop width this is the familiar seven-column grid. Below `md` seven
 * columns cannot hold a legible event tile at 375px, so the same days become a
 * vertical agenda — **every** day the grid contains, in order, whether or not
 * it has events. That is a reflow, not a filter: the issue requires the view to
 * "remain operable on a narrow viewport without silently hiding dates or
 * events", and the two layouts render the identical set of days and the
 * identical set of events.
 *
 * Days borrowed from the months either side are dimmed rather than blanked, and
 * they carry their events. A practice on Sunday 27 September is real, it sits
 * in October's first row on any paper calendar, and blanking that cell would
 * hide a real event in a week the page appears to be showing.
 *
 * ## The grid is a table
 *
 * A month is tabular — day of the week against week of the month — so it is a
 * `table` with a header row of weekday names. Assistive technology can then
 * read a cell in its column; a `div` grid would have to re-implement what the
 * element already provides. Each cell states its full date to a screen reader
 * and its day number to the eye, because "14" alone is not navigable.
 */
export default function GregorianMonth({
  grid,
  tile,
}: {
  grid: MonthGrid;
  /**
   * Where one event's tile goes, and what word it carries — LAN-153.
   *
   * Supplied by the page because both are tier decisions: the two tiers have two
   * event pages, and the status column is the operator's. A component that chose
   * for itself would send a public reader to a route they cannot open, or print
   * "Draft" on a public calendar.
   */
  tile: (eventId: string) => { href: string; status: TileStatus };
}) {
  const monthLabel = formatMonthLabel(grid.month);

  return (
    <>
      {/* Desktop: the conventional month. */}
      <Paper
        variant="outlined"
        sx={{ display: { xs: "none", md: "block" }, overflowX: "auto" }}
        data-testid="gregorian-grid"
      >
        <Box
          component="table"
          sx={{ width: "100%", minWidth: 760, borderCollapse: "collapse", tableLayout: "fixed" }}
        >
          <Box component="caption" sx={{ captionSide: "top", textAlign: "left", p: 1.5 }}>
            <Typography variant="subtitle2" component="span">
              {monthLabel}
            </Typography>
          </Box>
          <Box component="thead">
            <Box component="tr">
              {WEEKDAY_LABELS.map((weekday) => (
                <Box
                  key={weekday}
                  component="th"
                  scope="col"
                  sx={{
                    p: 1,
                    borderBottom: 1,
                    borderColor: "divider",
                    textAlign: "left",
                    typography: "caption",
                    fontWeight: 700,
                  }}
                >
                  {weekday}
                </Box>
              ))}
            </Box>
          </Box>
          <Box component="tbody">
            {grid.weeks.map((week) => (
              <Box component="tr" key={week[0].day}>
                {week.map((day) => (
                  <Box
                    key={day.day}
                    component="td"
                    data-testid="gregorian-cell"
                    data-day={day.day}
                    sx={{
                      verticalAlign: "top",
                      p: 0.75,
                      height: 112,
                      border: 1,
                      borderColor: "divider",
                      bgcolor: day.inMonth ? "background.paper" : "action.disabledBackground",
                      outline: day.isToday ? 2 : 0,
                      outlineColor: "primary.main",
                      outlineOffset: -2,
                    }}
                  >
                    <Stack spacing={0.5}>
                      <Typography
                        variant="caption"
                        component="p"
                        color={day.inMonth ? "text.primary" : "text.secondary"}
                        sx={{ fontWeight: day.isToday ? 700 : 400 }}
                      >
                        <Box component="span" sx={visuallyHidden}>
                          {formatCellDate(day.day)}
                          {day.isToday ? " (today)" : ""}
                        </Box>
                        <Box component="span" aria-hidden="true">
                          {formatDayNumber(day.day)}
                          {day.isToday ? " · Today" : ""}
                        </Box>
                      </Typography>
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
              </Box>
            ))}
          </Box>
        </Box>
      </Paper>

      {/* Phone: the same days, stacked. Empty days stay listed, compactly. */}
      <Box
        component="section"
        aria-label={`${monthLabel}, day by day`}
        sx={{ display: { xs: "block", md: "none" } }}
        data-testid="gregorian-agenda"
      >
        <Stack spacing={0.5}>
          {grid.weeks.flat().map((day) =>
            day.events.length === 0 ? (
              <Typography
                key={day.day}
                variant="caption"
                component="p"
                color="text.secondary"
                data-testid="gregorian-agenda-day"
                data-day={day.day}
                sx={{
                  px: 1,
                  py: 0.25,
                  borderLeft: 2,
                  borderColor: day.isToday ? "primary.main" : "transparent",
                }}
              >
                {formatCellDate(day.day)}
                {day.isToday ? " · Today" : ""} — no events
              </Typography>
            ) : (
              <Paper
                key={day.day}
                variant="outlined"
                data-testid="gregorian-agenda-day"
                data-day={day.day}
                sx={{
                  p: 1,
                  bgcolor: day.inMonth ? "background.paper" : "action.disabledBackground",
                  borderColor: day.isToday ? "primary.main" : "divider",
                  borderWidth: day.isToday ? 2 : 1,
                }}
              >
                <Typography variant="caption" component="p" sx={{ fontWeight: 700 }}>
                  {formatCellDate(day.day)}
                  {day.isToday ? " · Today" : ""}
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
              </Paper>
            ),
          )}
        </Stack>
      </Box>
    </>
  );
}
