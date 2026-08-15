import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { visuallyHidden } from "@mui/utils";
import { WEEKDAY_LABELS, type TermCard as TermCardModel } from "@/lib/services/calendar";
import CalendarEntry from "./calendar-entry";
import {
  formatCellDate,
  formatDayNumber,
  formatWeekLabel,
  formatTermName,
  formatWeekRange,
} from "./presentation";

/**
 * The Oxford term card. LAN-114.
 *
 * ## This is the club's own artefact, not a relabelled week view
 *
 * The three supplied OULAFC term cards are one grid per term: Oxford weeks down
 * the side, Sunday through Saturday across the top, and the exact Gregorian
 * dates printed on every week row. That shape is the point of the issue — it is
 * how the club plans its year, and it is what the committee currently maintains
 * in a spreadsheet. So the rows are the term's **configured** weeks, which for
 * Michaelmas begins at −1st and for Hilary and Trinity at 0th, and each row
 * states its date range rather than leaving the reader to count sevens from the
 * heading.
 *
 * ## Every row carries its dates
 *
 * "0th week" means nothing on its own to a player, a new committee member, or
 * anybody reading the card in July. `formatWeekRange` prints the month whenever
 * a week crosses one and the year whenever it crosses that, so a row is
 * readable without reference to any other row — which is more than the source
 * spreadsheets manage, and deliberately so given their stale headings.
 *
 * ## Narrow viewports
 *
 * A ten-row, seven-column card cannot shrink to 375px and stay a card, so below
 * `md` the same term becomes week sections, each listing its seven days. Every
 * week, every day and every event that the desktop card shows is present; the
 * issue forbids hiding a date or an event to fit, and a horizontally scrolling
 * ten-column table on a phone would satisfy the letter of that and fail the
 * "remains operable" half of the same sentence.
 */
export default function TermCard({ card }: { card: TermCardModel }) {
  const termName = formatTermName(card.term);

  return (
    <>
      {/* Desktop: the term card as the club draws it. */}
      <Paper
        variant="outlined"
        sx={{ display: { xs: "none", md: "block" }, overflowX: "auto" }}
        data-testid="term-card-grid"
      >
        <Box
          component="table"
          sx={{ width: "100%", minWidth: 980, borderCollapse: "collapse", tableLayout: "fixed" }}
        >
          <Box component="caption" sx={{ captionSide: "top", textAlign: "left", p: 1.5 }}>
            <Typography variant="subtitle2" component="span">
              {`OULAFC term card — ${termName}`}
            </Typography>
          </Box>
          <Box component="thead">
            <Box component="tr">
              <Box
                component="th"
                scope="col"
                sx={{
                  p: 1,
                  width: 190,
                  borderBottom: 1,
                  borderColor: "divider",
                  textAlign: "left",
                  typography: "caption",
                  fontWeight: 700,
                }}
              >
                Week
              </Box>
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
            {card.weeks.map((week) => (
              <Box
                component="tr"
                key={week.startsOn}
                data-testid="term-card-week"
                data-week={week.week === null ? week.outside : week.week}
              >
                <Box
                  component="th"
                  scope="row"
                  sx={{
                    p: 1,
                    verticalAlign: "top",
                    border: 1,
                    borderColor: "divider",
                    textAlign: "left",
                    // A context row is quieter than a real Oxford week: it is
                    // there so an event just outside term is still on the card,
                    // not to suggest the term runs longer than it does.
                    bgcolor: week.week === null ? "action.disabledBackground" : "action.hover",
                    color: week.week === null ? "text.secondary" : "text.primary",
                  }}
                >
                  <Typography variant="caption" component="p" sx={{ fontWeight: 700 }}>
                    {formatWeekLabel(week)}
                  </Typography>
                  <Typography variant="caption" component="p" color="text.secondary">
                    {formatWeekRange(week.startsOn, week.endsOn)}
                  </Typography>
                </Box>
                {week.days.map((day) => (
                  <Box
                    key={day.day}
                    component="td"
                    data-testid="term-card-cell"
                    data-day={day.day}
                    sx={{
                      verticalAlign: "top",
                      p: 0.75,
                      height: 96,
                      border: 1,
                      borderColor: "divider",
                      outline: day.isToday ? 2 : 0,
                      outlineColor: "primary.main",
                      outlineOffset: -2,
                    }}
                  >
                    <Stack spacing={0.5}>
                      <Typography
                        variant="caption"
                        component="p"
                        color="text.secondary"
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
                      {day.events.map((event) => (
                        <CalendarEntry key={event.id} event={event} />
                      ))}
                    </Stack>
                  </Box>
                ))}
              </Box>
            ))}
          </Box>
        </Box>
      </Paper>

      {/* Phone: the same weeks and the same days, stacked. */}
      <Box
        component="section"
        aria-label={`${termName} term card, week by week`}
        sx={{ display: { xs: "block", md: "none" } }}
        data-testid="term-card-agenda"
      >
        <Stack spacing={1.5}>
          {card.weeks.map((week) => (
            <Paper
              key={week.startsOn}
              variant="outlined"
              sx={{ p: 1 }}
              data-testid="term-card-agenda-week"
              data-week={week.week === null ? week.outside : week.week}
            >
              <Typography variant="subtitle2" component="h3">
                {formatWeekLabel(week)}
              </Typography>
              <Typography variant="caption" component="p" color="text.secondary">
                {formatWeekRange(week.startsOn, week.endsOn)}
              </Typography>
              <Stack spacing={0.5} sx={{ mt: 1 }}>
                {week.days.map((day) =>
                  day.events.length === 0 ? (
                    <Typography
                      key={day.day}
                      variant="caption"
                      component="p"
                      color="text.secondary"
                      data-testid="term-card-agenda-day"
                      data-day={day.day}
                      sx={{
                        borderLeft: 2,
                        borderColor: day.isToday ? "primary.main" : "transparent",
                        pl: 1,
                      }}
                    >
                      {formatCellDate(day.day)}
                      {day.isToday ? " · Today" : ""} — no events
                    </Typography>
                  ) : (
                    <Box
                      key={day.day}
                      data-testid="term-card-agenda-day"
                      data-day={day.day}
                      sx={{
                        borderLeft: 2,
                        borderColor: day.isToday ? "primary.main" : "divider",
                        pl: 1,
                      }}
                    >
                      <Typography variant="caption" component="p" sx={{ fontWeight: 700 }}>
                        {formatCellDate(day.day)}
                        {day.isToday ? " · Today" : ""}
                      </Typography>
                      <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                        {day.events.map((event) => (
                          <CalendarEntry key={event.id} event={event} />
                        ))}
                      </Stack>
                    </Box>
                  ),
                )}
              </Stack>
            </Paper>
          ))}
        </Stack>
      </Box>
    </>
  );
}
