import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { todayInClubZone } from "@/lib/club-time";
import { isServiceError } from "@/lib/db";
import {
  buildMonthGrid,
  defaultMonth,
  monthGridEvents,
  monthOf,
  parseMonth,
  shiftMonth,
} from "@/lib/services/calendar";
import type { CalendarEvent } from "@/lib/services/calendar";
import { academicYearEvents } from "@/lib/services/oxford-year";
import { listPublicSeasonEvents, type PublicEventList } from "@/lib/services/events";
import { GregorianControls, YearJumpControl } from "../calendar-controls";
import GregorianMonth from "../gregorian-month";
import {
  MONTH_EMPTY,
  NO_TERMS_CONFIGURED,
  UNDATED_DETAIL,
  UNDATED_HEADLINE,
} from "../presentation";
import { first } from "../query";
import { PUBLIC_CALENDAR_PATH, PUBLIC_CALENDAR_VIEW_PATH, publicEventHref } from "../routes";
import PublicShell from "../public-shell";
import { publicTileStatus, type TileStatus } from "../tile-status";
import TypeLegend from "../type-legend";
import ViewSwitch from "../view-switch";
import YearColumn from "../year-column";
import { readEventYear } from "../year";

/**
 * The public calendar's two calendar arrangements. LAN-153.
 *
 * ## The same query, rearranged
 *
 * This page and `/calendar` call `listPublicSeasonEvents` with the same tier and
 * the same season, so `REQ-three-arrangements` — "the list, Calendar View and
 * Oxford View … cannot disagree about which events exist or when they are" —
 * holds because there is one read, not because three reads happen to agree.
 * Every tile links to `/calendar/<id>`, the same page the list rows open.
 *
 * ## Calendar View is unchanged
 *
 * Brian, 20 August 2026: "The Gregorian calendar is fine as it is." The month
 * grid is LAN-114's, moved rather than rewritten.
 *
 * ## Oxford View is the new one
 *
 * One continuous academic year with a jump control and no season selector —
 * `REQ-oxford-continuous`. `@/lib/services/oxford-year` builds it.
 */

type CalendarMode = "gregorian" | "oxford";

function modeOf(value: string): CalendarMode {
  return value === "oxford" ? "oxford" : "gregorian";
}

function gregorianHref(month: string): string {
  return `${PUBLIC_CALENDAR_VIEW_PATH}?mode=gregorian&month=${month}`;
}

export default async function PublicCalendarViewPage({
  searchParams,
}: PageProps<"/calendar/view">) {
  const params = await searchParams;
  const mode = modeOf(first(params.mode));
  const today = todayInClubZone();

  let list: PublicEventList;
  try {
    list = await listPublicSeasonEvents();
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return (
      <PublicShell seasonLabel={null}>
        <Alert severity="info" data-testid="public-calendar-unavailable">
          {error.message}
        </Alert>
      </PublicShell>
    );
  }

  const events = list.events;

  // Awaited here rather than inside the arrangement below: an async component
  // element returned from another async component is resolved by the framework
  // but not by a direct `render(await Page())`, which is the level these screens
  // are tested at. Only the Oxford arrangement needs it, and building it for the
  // Gregorian one costs a term read the page has to do anyway on half its loads.
  const year =
    mode === "oxford"
      ? await readEventYear(list.events, {
          today,
          seasonStartsOn: list.season.startsOn,
          seasonEndsOn: list.season.endsOn,
        })
      : null;
  // One tier decision, applied to every tile on the page: the public event page,
  // and a word only where the event is off.
  const tile = (eventId: string) => {
    const event = events.find((candidate) => candidate.id === eventId);
    return {
      href: publicEventHref(eventId),
      status: publicTileStatus(event?.isCancelled ?? false),
    };
  };

  return (
    <PublicShell seasonLabel={list.season.label}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h6" component="h1">
            What&rsquo;s on
          </Typography>
        </Box>

        <Stack spacing={1.5}>
          <ViewSwitch
            label="Calendar view"
            testId="public-view-switch"
            choices={[
              {
                href: PUBLIC_CALENDAR_PATH,
                label: "List",
                active: false,
                testId: "public-view-list",
              },
              {
                href: PUBLIC_CALENDAR_VIEW_PATH,
                label: "Calendar",
                active: true,
                testId: "public-view-calendar",
              },
            ]}
          />
          <ViewSwitch
            label="Calendar mode"
            testId="public-mode-switch"
            choices={[
              {
                href: `${PUBLIC_CALENDAR_VIEW_PATH}?mode=gregorian`,
                label: "Calendar View",
                active: mode === "gregorian",
                testId: "public-mode-gregorian",
              },
              {
                href: `${PUBLIC_CALENDAR_VIEW_PATH}?mode=oxford`,
                label: "Oxford View",
                active: mode === "oxford",
                testId: "public-mode-oxford",
              },
            ]}
          />
        </Stack>

        {mode === "gregorian" ? (
          <GregorianArrangement events={events} params={params} today={today} tile={tile} />
        ) : (
          <OxfordArrangement year={year} tile={tile} />
        )}
      </Stack>
    </PublicShell>
  );
}

type Tile = (eventId: string) => { href: string; status: TileStatus };

function GregorianArrangement({
  events,
  params,
  today,
  tile,
}: {
  events: PublicEventList["events"];
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
    <Stack spacing={2} data-testid="public-gregorian-view">
      <GregorianControls
        month={month}
        previousHref={gregorianHref(shiftMonth(month, -1))}
        nextHref={gregorianHref(shiftMonth(month, 1))}
        todayHref={gregorianHref(todayMonth)}
        basePath={PUBLIC_CALENDAR_VIEW_PATH}
      />

      {grid.placedCount === 0 ? (
        <Alert severity="info" data-testid="public-month-empty">
          {MONTH_EMPTY}
        </Alert>
      ) : null}

      <TypeLegend events={monthGridEvents(grid)} />
      <GregorianMonth grid={grid} tile={tile} />
      <Undated events={grid.undated} tile={tile} />
    </Stack>
  );
}

function OxfordArrangement({
  year,
  tile,
}: {
  year: Awaited<ReturnType<typeof readEventYear>>;
  tile: Tile;
}) {
  if (year === null || year.column.segments.length === 0) {
    return (
      <Stack spacing={2} data-testid="public-oxford-view">
        <Alert severity="warning" data-testid="public-no-terms">
          {NO_TERMS_CONFIGURED}
        </Alert>
      </Stack>
    );
  }

  return (
    <Stack spacing={2} data-testid="public-oxford-view">
      <YearJumpControl segments={year.segments} current={year.currentSegmentKey} />
      <TypeLegend events={academicYearEvents(year.column)} />
      <YearColumn column={year.column} tile={tile} />
      <Undated events={year.column.undated} tile={tile} />
    </Stack>
  );
}

/**
 * The events no cell can hold.
 *
 * `W1`'s exception table: an event with no date "cannot be placed on a calendar;
 * listed separately rather than dropped". Understated, and on a normal season it
 * renders nothing at all.
 */
function Undated({ events, tile }: { events: readonly CalendarEvent[]; tile: Tile }) {
  if (events.length === 0) return null;

  return (
    <Box sx={{ borderLeft: 2, borderColor: "divider", pl: 1.5 }} data-testid="public-undated">
      <Typography variant="caption" component="h2" sx={{ fontWeight: 700, display: "block" }}>
        {UNDATED_HEADLINE}
      </Typography>
      <Typography variant="caption" color="text.secondary" component="p">
        {UNDATED_DETAIL}
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
