import { Notice } from "@/components/notice";
import { EmptyState } from "@/components/empty-state";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import {
  buildMonthGrid,
  defaultMonth,
  monthGridEvents,
  monthOf,
  parseMonth,
  shiftMonth,
  type CalendarEvent,
} from "@/lib/services/calendar";
import { academicYearEvents } from "@/lib/services/oxford-year";
import { GregorianControls, YearJumpControl } from "@/app/calendar/calendar-controls";
import GregorianMonth from "@/app/calendar/gregorian-month";
import {
  MONTH_EMPTY,
  NO_TERMS_CONFIGURED,
  OUTSIDE_THE_YEAR_DETAIL,
  OUTSIDE_THE_YEAR_HEADLINE,
  UNDATED_DETAIL,
  UNDATED_HEADLINE,
} from "@/app/calendar/presentation";
import { first } from "@/app/calendar/query";
import { OPERATOR_CALENDAR_PATH } from "@/app/calendar/routes";
import type { TileStatus } from "@/app/calendar/tile-status";
import TypeLegend from "@/app/calendar/type-legend";
import YearColumn from "@/app/calendar/year-column";
import type { readEventYear } from "@/app/calendar/year";

export type Tile = (eventId: string) => { href: string; status: TileStatus };

export function gregorianHref(month: string): string {
  return `${OPERATOR_CALENDAR_PATH}?mode=gregorian&month=${month}`;
}

// ---------------------------------------------------------------------------
// Calendar View
// ---------------------------------------------------------------------------

export function GregorianView({
  events,
  params,
  today,
  tile,
}: {
  events: readonly CalendarEvent[];
  params: Record<string, string | string[] | undefined>;
  today: string;
  tile: Tile;
}) {
  // An unreadable `month` falls back rather than failing: the parameter arrives
  // from a URL anybody can edit, and a calendar that throws on `?month=banana`
  // is a worse answer than one that opens where it would have opened anyway.
  const month = parseMonth(first(params.month)) ?? defaultMonth(events, today);
  const grid = buildMonthGrid(month, events, today);
  const todayMonth = monthOf(today) ?? month;

  return (
    <Stack spacing={2} data-testid="gregorian-view">
      <GregorianControls
        month={month}
        previousHref={gregorianHref(shiftMonth(month, -1))}
        nextHref={gregorianHref(shiftMonth(month, 1))}
        todayHref={gregorianHref(todayMonth)}
        basePath={OPERATOR_CALENDAR_PATH}
      />

      {grid.placedCount === 0 ? (
        <EmptyState
          testId="month-empty"
          title={MONTH_EMPTY}
          action={{ href: "/operate/events?period=all", label: "All events" }}
        />
      ) : null}

      <TypeLegend events={monthGridEvents(grid)} />
      <GregorianMonth grid={grid} tile={tile} />

      <LeftOver
        events={grid.undated}
        testId="undated-events"
        headline={UNDATED_HEADLINE}
        detail={UNDATED_DETAIL}
        tile={tile}
      />
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Oxford View
// ---------------------------------------------------------------------------

export function OxfordView({
  year,
  tile,
}: {
  year: Awaited<ReturnType<typeof readEventYear>>;
  tile: Tile;
}) {
  if (year === null || year.column.segments.length === 0) {
    return (
      <Stack spacing={2} data-testid="oxford-view">
        <Notice severity="warning" testId="no-terms-configured">
          {NO_TERMS_CONFIGURED}
        </Notice>
      </Stack>
    );
  }

  return (
    <Stack spacing={2} data-testid="oxford-view">
      <YearJumpControl segments={year.segments} current={year.currentSegmentKey} />
      <TypeLegend events={academicYearEvents(year.column)} />
      <YearColumn column={year.column} tile={tile} />

      <LeftOver
        events={year.column.outsideTheYear}
        testId="outside-the-year"
        headline={OUTSIDE_THE_YEAR_HEADLINE}
        detail={OUTSIDE_THE_YEAR_DETAIL}
        tile={tile}
      />

      <LeftOver
        events={year.column.undated}
        testId="undated-events"
        headline={UNDATED_HEADLINE}
        detail={UNDATED_DETAIL}
        tile={tile}
      />
    </Stack>
  );
}

/**
 * The events no cell can hold — undated ones, and the rare dated one outside the
 * year this column covers.
 *
 * Deliberately understated: a bordered block rather than a panel. It exists so
 * nothing is omitted silently, and on a normal season it renders nothing at all.
 * The term card's old "too far from any term" list is gone with the card — a
 * continuous year has a home for every date in it.
 */
function LeftOver({
  events,
  testId,
  headline,
  detail,
  tile,
}: {
  events: readonly CalendarEvent[];
  testId: string;
  headline: string;
  detail: string;
  tile: Tile;
}) {
  if (events.length === 0) return null;

  return (
    <Box sx={{ borderLeft: 2, borderColor: "divider", pl: 1.5 }} data-testid={testId}>
      <Typography variant="caption" component="h2" sx={{ fontWeight: 700, display: "block" }}>
        {headline}
      </Typography>
      <Typography variant="caption" color="text.secondary" component="p">
        {detail}
      </Typography>
      <Stack spacing={0.5} sx={{ mt: 1 }}>
        {events.map((event) => (
          <Typography
            key={event.id}
            component="a"
            href={tile(event.id).href}
            variant="body2"
            sx={{ color: "text.primary" }}
          >
            {event.name}
          </Typography>
        ))}
      </Stack>
    </Box>
  );
}
