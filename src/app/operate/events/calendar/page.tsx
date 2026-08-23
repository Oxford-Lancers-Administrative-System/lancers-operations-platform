import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { operatorHasCapability } from "@/lib/auth/guards";
import { todayInClubZone } from "@/lib/club-time";
import { isServiceError } from "@/lib/db";
import { UnavailableScreen } from "@/app/operate/unavailable";
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
import { listEventsForOperator, type EventList } from "@/lib/services/events";
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
import {
  operatorEventHref,
  OPERATOR_CALENDAR_PATH,
  OPERATOR_EVENTS_PATH,
} from "@/app/calendar/routes";
import { operatorTileStatus, type TileStatus } from "@/app/calendar/tile-status";
import TypeLegend from "@/app/calendar/type-legend";
import ViewSwitch from "@/app/calendar/view-switch";
import YearColumn from "@/app/calendar/year-column";
import { readEventYear } from "@/app/calendar/year";
import { gateShellPage } from "../../gate";

/**
 * The Events calendar — Calendar View, and the Oxford View. LAN-114, remade by
 * LAN-153.
 *
 * ## The same events as the list, rearranged
 *
 * This page reads `listEventsForOperator()` with no filter, which is the same
 * call `/operate/events` makes, so the three arrangements cannot show different
 * sets of events or different dates for one event: they are one query and three
 * arrangements of its result (`REQ-three-arrangements`). Every tile links to
 * `/operate/events/<id>`, the same destination the list rows open.
 *
 * ## Calendar View is unchanged
 *
 * Brian, 20 August 2026: "The Gregorian calendar is fine as it is."
 *
 * ## Oxford View is a continuous academic year
 *
 * Not three term cards behind two selectors — the exact thing Stewart Humble
 * asked to replace on 17 August 2026, recorded as D85. One column runs Long
 * Vacation into Michaelmas into Christmas Vacation into Hilary into Easter
 * Vacation into Trinity into the next Long Vacation, with a jump control instead
 * of a calendar switch, vacation weeks numbered forward from 1, and a vacation
 * belonging to neither adjacent term.
 *
 * The academic-year and Oxford-term selectors are gone, and so is any way to
 * reach another season: one season is open and the mission knows no other
 * (`REQ-one-open-season`). The page header says which one.
 *
 * ## It reads, and only reads
 *
 * There is no server action on this page and no form that posts anywhere.
 * Opening the calendar, changing month and switching mode all resolve to `GET`s
 * that call one read. The requirement that no audience, invitation, RSVP,
 * attendance or automation record is created merely by viewing or navigating is
 * therefore a property of the module's imports rather than a promise.
 *
 * ## Which day is today
 *
 * From `@/lib/club-time`, in the club's zone, and passed down as a plain
 * `YYYY-MM-DD`. The grids never ask a clock anything themselves — a component
 * that read `new Date()` would be the second timezone rule the issue forbids,
 * and would highlight the wrong cell for an hour every summer night.
 */

type CalendarMode = "gregorian" | "oxford";

type Tile = (eventId: string) => { href: string; status: TileStatus };

function modeOf(value: string): CalendarMode {
  return value === "oxford" ? "oxford" : "gregorian";
}

function gregorianHref(month: string): string {
  return `${OPERATOR_CALENDAR_PATH}?mode=gregorian&month=${month}`;
}

export default async function EventCalendarPage({
  searchParams,
}: PageProps<"/operate/events/calendar">) {
  const gate = await gateShellPage(OPERATOR_CALENDAR_PATH);
  if ("screen" in gate) return gate.screen;

  const params = await searchParams;
  const mode = modeOf(first(params.mode));
  const mayManage = operatorHasCapability(gate.operator, "event_calendar_management");
  const today = todayInClubZone();

  let list: EventList;
  try {
    list = await listEventsForOperator();
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return (
      <UnavailableScreen
        title="Events calendar"
        message={error.message}
        testId="calendar-unavailable"
      />
    );
  }

  // Awaited here rather than inside the arrangement below: an async component
  // element returned from another async component is resolved by the framework
  // but not by a direct `render(await Page())`, which is the level these screens
  // are tested at.
  const year =
    mode === "oxford"
      ? await readEventYear(list.events, {
          today,
          seasonStartsOn: list.season.startsOn,
          seasonEndsOn: list.season.endsOn,
        })
      : null;

  const byId = new Map(list.events.map((event) => [event.id, event]));
  const tile: Tile = (eventId: string) => ({
    href: operatorEventHref(eventId),
    status: operatorTileStatus(byId.get(eventId)?.status ?? "approved"),
  });

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ alignItems: { sm: "flex-start" }, justifyContent: "space-between" }}
      >
        <Box>
          <Typography variant="h6" component="h1">
            Events
          </Typography>
          <Typography variant="body2" color="text.secondary" data-testid="season-label">
            {`Season ${list.season.label}`}
          </Typography>
        </Box>
        {mayManage ? (
          <Button variant="contained" href="/operate/events/new">
            Create event
          </Button>
        ) : null}
      </Stack>

      <Stack spacing={1.5}>
        <ViewSwitch
          label="Events view"
          testId="events-view-switch"
          choices={[
            { href: OPERATOR_EVENTS_PATH, label: "List", active: false, testId: "view-list" },
            {
              // Carries where you are, so re-clicking the view you are already
              // in does not quietly send you back to the default month.
              href:
                mode === "oxford"
                  ? `${OPERATOR_CALENDAR_PATH}?mode=oxford`
                  : gregorianHref(
                      parseMonth(first(params.month)) ?? defaultMonth(list.events, today),
                    ),
              label: "Calendar",
              active: true,
              testId: "view-calendar",
            },
          ]}
        />
        <ViewSwitch
          label="Calendar mode"
          testId="calendar-mode-switch"
          choices={[
            {
              href: `${OPERATOR_CALENDAR_PATH}?mode=gregorian`,
              label: "Calendar View",
              active: mode === "gregorian",
              testId: "mode-gregorian",
            },
            {
              href: `${OPERATOR_CALENDAR_PATH}?mode=oxford`,
              label: "Oxford View",
              active: mode === "oxford",
              testId: "mode-oxford",
            },
          ]}
        />
      </Stack>

      {mode === "gregorian" ? (
        <GregorianView events={list.events} params={params} today={today} tile={tile} />
      ) : (
        <OxfordView year={year} tile={tile} />
      )}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Calendar View
// ---------------------------------------------------------------------------

function GregorianView({
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
        <Alert severity="info" data-testid="month-empty">
          {MONTH_EMPTY}
        </Alert>
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

function OxfordView({
  year,
  tile,
}: {
  year: Awaited<ReturnType<typeof readEventYear>>;
  tile: Tile;
}) {
  if (year === null || year.column.segments.length === 0) {
    return (
      <Stack spacing={2} data-testid="oxford-view">
        <Alert severity="warning" data-testid="no-terms-configured">
          {NO_TERMS_CONFIGURED}
        </Alert>
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
