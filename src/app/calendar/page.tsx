import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { todayInClubZone } from "@/lib/club-time";
import { isServiceError } from "@/lib/db";
import { bucketEventsByPeriod, bucketedCount, PERIOD_LABELS } from "@/lib/services/event-periods";
import { DRAFTABLE_EVENT_TYPES } from "@/lib/services/event-input";
import {
  listPublicSeasonEvents,
  PUBLIC_EVENT_SORT_COLUMNS,
  type PublicEventList,
} from "@/lib/services/events";
import PeriodSwitch from "./period-switch";
import PublicFilters from "./public-filters";
import PublicList from "./public-list";
import { PUBLIC_CALENDAR_PATH, PUBLIC_CALENDAR_VIEW_PATH } from "./routes";
import PublicShell from "./public-shell";
import { first, readListQuery, sortLinkFactory } from "./query";
import ViewSwitch from "./view-switch";
import { readEventYear } from "./year";

/**
 * The public calendar — the club's own noticeboard. LAN-153.
 *
 * ## Readable by anyone, with no account
 *
 * D1 and D5, owner-approved 14 August 2026. This is the application's first
 * genuinely anonymous read surface: every other route needs an operator session
 * or a signed token. `src/proxy.ts` protects `/dashboard` and `/operate` and
 * nothing else, so this route is unprotected by the same rule that has always
 * governed the others rather than by an exception written for it.
 *
 * LAN-114 deliberately did **not** open the calendar and recorded why: opening
 * one to unauthenticated visitors "would be a change to the security posture
 * rather than a calendar feature, and `AGENTS.md` reserves that for Brian." That
 * reservation is satisfied here, not overridden.
 *
 * ## Reading it creates nothing
 *
 * `REQ-public-calendar`. This module imports no server action and no write path,
 * and `listPublicSeasonEvents` is one `select`. It is a property of what is
 * imported rather than a promise, and `tests/public-calendar-side-effects.test.ts`
 * counts the rows in the audience, invitation, RSVP, attendance and notification
 * tables either side of a render rather than taking anyone's word for it.
 *
 * ## And it carries nothing about people
 *
 * The public read has no column for a joining URL, a count or a status, so there
 * is nothing on this page to withhold. See `PUBLIC_EVENT_COLUMNS`.
 */
export default async function PublicCalendarPage({ searchParams }: PageProps<"/calendar">) {
  const params = await searchParams;
  const query = readListQuery(params, PUBLIC_EVENT_SORT_COLUMNS);
  const today = todayInClubZone();

  let list: PublicEventList;
  try {
    list = await listPublicSeasonEvents({
      search: query.search,
      eventType: query.eventType,
      sort: query.sort,
      direction: query.direction,
    });
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

  const year = await readEventYear(list.events, {
    today,
    seasonStartsOn: list.season.startsOn,
    seasonEndsOn: list.season.endsOn,
  });

  const buckets = bucketEventsByPeriod(list.events, {
    today,
    period: query.period,
    segmentStartsOn: year?.currentSegmentStartsOn ?? null,
    segmentEndsOn: year?.currentSegmentEndsOn ?? null,
  });

  const sortLinkFor = sortLinkFactory({
    basePath: PUBLIC_CALENDAR_PATH,
    query,
    carryKeys: ["q", "type", "period"],
    params,
  });

  return (
    <PublicShell seasonLabel={list.season.label}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h6" component="h1">
            What&rsquo;s on
          </Typography>
        </Box>

        <ViewSwitch
          label="Calendar view"
          testId="public-view-switch"
          choices={[
            {
              href: PUBLIC_CALENDAR_PATH,
              label: "List",
              active: true,
              testId: "public-view-list",
            },
            {
              href: PUBLIC_CALENDAR_VIEW_PATH,
              label: "Calendar",
              active: false,
              testId: "public-view-calendar",
            },
          ]}
        />

        <PeriodSwitch
          basePath={PUBLIC_CALENDAR_PATH}
          period={query.period}
          carry={{
            q: first(params.q),
            type: first(params.type),
            sort: query.sort,
            dir: query.direction,
          }}
        />

        <PublicFilters
          types={DRAFTABLE_EVENT_TYPES}
          search={query.search}
          eventType={query.eventType}
          sort={query.sort}
          direction={query.direction}
          sortColumns={PUBLIC_SORT_OPTIONS}
          period={query.period}
        />

        {bucketedCount(buckets) === 0 ? (
          <Alert severity="info" data-testid={emptyTestId(list, query.filtered)}>
            {emptyMessage(list, query.filtered, PERIOD_LABELS[query.period])}
          </Alert>
        ) : (
          <PublicList
            buckets={buckets}
            sortLinkFor={sortLinkFor}
            sort={query.sort}
            direction={query.direction}
            coordinateOf={(event) =>
              year === null ? "—" : year.coordinateLabel(event.scheduledOn)
            }
          />
        )}
      </Stack>
    </PublicShell>
  );
}

/**
 * Three empty states, distinguished, because the recovery differs.
 *
 * `slice-ux.md` § 9 and `W1`'s exception table: "nothing this month" is not
 * "nothing all season", which is not "nothing matching your filter". Each says
 * what is true and, where there is one, the smallest thing the reader can do —
 * and none of them explains a rule.
 */
function emptyTestId(list: PublicEventList, filtered: boolean): string {
  if (list.totalInSeason === 0) return "public-season-empty";
  return filtered ? "public-filter-empty" : "public-period-empty";
}

function emptyMessage(list: PublicEventList, filtered: boolean, periodLabel: string): string {
  if (list.totalInSeason === 0) return "There are no events in the club's calendar yet.";
  if (filtered) return "No event matches that search. Clear it to see the season's events.";
  return `Nothing in ${periodLabel.toLowerCase()}. Try a wider period.`;
}

/** The sort choices, as the phone control needs them. */
const PUBLIC_SORT_OPTIONS: readonly { value: string; label: string }[] = Object.freeze([
  { value: "date", label: "Date" },
  { value: "term", label: "Term and week" },
  { value: "name", label: "Event name" },
  { value: "type", label: "Type" },
  { value: "venue", label: "Where" },
]);
