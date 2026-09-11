import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { Notice } from "@/components/notice";
import { EmptyState } from "@/components/empty-state";
import Stack from "@mui/material/Stack";
import { CALENDAR_DESCRIPTION, publicPageMetadata } from "@/lib/brand";
import { todayInClubZone } from "@/lib/club-time";
import { isServiceError } from "@/lib/db";
import { bucketEventsByPeriod, bucketedCount, PERIOD_LABELS } from "@/lib/services/event-periods";
import { listEventTemplateOptions, type EventTemplateOption } from "@/lib/services/event-templates";
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
import SubscribeToCalendarButton from "./subscribe-dialog";
import ViewSwitch from "./view-switch";
import { readEventYear } from "./year";

/**
 * The public calendar — the club's own noticeboard. LAN-153. D1/D5,
 * owner-approved 14 August 2026: the application's first genuinely anonymous
 * read surface, unprotected by the same rule (`src/proxy.ts`) that governs
 * every other route rather than by an exception. `REQ-public-calendar`:
 * imports no server action or write path; `tests/public-calendar-side-effects
 * .test.ts` counts rows either side of a render. No joining URL, count or
 * status column, so nothing to withhold.
 *
 * Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE
 */
/** The club's noticeboard as a shared link (LAN-269 item 4). Static: describes the calendar, not this week's events, so nothing reads the database. */
export const metadata: Metadata = publicPageMetadata("Club calendar", CALENDAR_DESCRIPTION);

export default async function PublicCalendarPage({ searchParams }: PageProps<"/calendar">) {
  const params = await searchParams;
  const query = readListQuery(params, PUBLIC_EVENT_SORT_COLUMNS);
  const today = todayInClubZone();

  let list: PublicEventList;
  let templates: EventTemplateOption[];
  try {
    [list, templates] = await Promise.all([
      listPublicSeasonEvents({
        search: query.search,
        templateId: query.templateId,
        sort: query.sort,
        direction: query.direction,
      }),
      listEventTemplateOptions(), // LAN-265: Type filter offers the club's templates by name, not the old seven-value enum.
    ]);
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return (
      <PublicShell seasonLabel={null}>
        <Notice severity="info" testId="public-calendar-unavailable">
          {error.message}
        </Notice>
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
    <PublicShell seasonLabel={list.season.label} action={<SubscribeToCalendarButton />}>
      <Stack spacing={3}>
        <PageHeader title="What’s on" />

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
          templates={templates}
          search={query.search}
          templateId={query.templateId}
          sort={query.sort}
          direction={query.direction}
          sortColumns={PUBLIC_SORT_OPTIONS}
          period={query.period}
        />

        {bucketedCount(buckets) === 0 ? (
          <EmptyState
            testId={emptyTestId(list, query.filtered)}
            title={emptyMessage(list, query.filtered, PERIOD_LABELS[query.period])}
            searched={query.search || undefined}
            action={
              list.totalInSeason > 0
                ? {
                    href: "/calendar?period=all",
                    label: query.filtered ? "Clear filters" : "All events",
                  }
                : undefined
            }
          />
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

/** Three empty states, distinguished (`slice-ux.md` § 9): the recovery differs, and none explains a rule. */
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
