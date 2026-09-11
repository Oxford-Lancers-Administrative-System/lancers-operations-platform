import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import Stack from "@mui/material/Stack";
import { isServiceError } from "@/lib/db";
import { UnavailableScreen } from "@/app/operate/unavailable";
import { operatorHasCapability } from "@/lib/auth/guards";
import {
  derivedEventState,
  EVENT_SORT_COLUMNS,
  EVENT_STATUS_FILTERS,
  listEventsForOperator,
  type EventList,
} from "@/lib/services/events";
import { bucketedCount, bucketEventsByPeriod, PERIOD_LABELS } from "@/lib/services/event-periods";
import { listEventTemplateOptions, type EventTemplateOption } from "@/lib/services/event-templates";
import { todayInClubZone } from "@/lib/club-time";
import { isNarrowAttendanceRecorder } from "@/lib/auth/capabilities";
import PeriodSwitch from "@/app/calendar/period-switch";
import { first, readListQuery, sortLinkFactory } from "@/app/calendar/query";
import { OPERATOR_CALENDAR_PATH, OPERATOR_EVENTS_PATH } from "@/app/calendar/routes";
import SubscribeToCalendarButton from "@/app/calendar/subscribe-dialog";
import ViewSwitch from "@/app/calendar/view-switch";
import { readEventYear } from "@/app/calendar/year";
import { gateShellPage } from "../gate";
import CreateEventMenu from "./create-menu";
import EventFilters from "./event-filters";
import OperatorList from "./operator-list";
import { EditTemplatesButton } from "./edit-templates-button";
import { coachEventList } from "./coach-event-list";
import { emptyMessage, emptyTestId, SORT_OPTIONS, statusLabel } from "./events-list-support";

/**
 * UX-30 — the open season's events, as the operator reads them. LAN-153.
 * Opens on **This month**, grouped into period tables (D84); season-scoped
 * with no season selector; term/week reads the built academic year, never
 * `events.week_number`, so it agrees with the public Oxford View.
 */

export default async function EventsPage({ searchParams }: PageProps<"/operate/events">) {
  // LAN-110: the coach shell's one destination, so it opts in and renders `./coach-eligible-events.tsx` instead.
  const gate = await gateShellPage(OPERATOR_EVENTS_PATH, undefined, { narrowRecorder: "allow" });
  if ("screen" in gate) return gate.screen;

  const params = await searchParams;

  if (isNarrowAttendanceRecorder(gate.operator.roleCodes)) {
    return await coachEventList(first(params.q));
  }

  const query = readListQuery(params, Object.keys(EVENT_SORT_COLUMNS));

  // Reading the calendar is open to any linked, active operator; actions guard themselves regardless.
  const mayManage = operatorHasCapability(gate.operator, "event_calendar_management");

  // One reading of the club's clock for the whole page — filter, Status column and bucket boundaries must agree.
  const today = todayInClubZone();

  let list: EventList;
  let templates: EventTemplateOption[];
  try {
    // LAN-265. The Type filter offers the club's own templates by name rather
    // than the seven-value enum, which is no longer what anything is called.
    [list, templates] = await Promise.all([
      listEventsForOperator({
        search: query.search,
        status: query.status,
        templateId: query.templateId,
        sort: query.sort,
        direction: query.direction,
        today,
      }),
      listEventTemplateOptions(),
    ]);
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return <UnavailableScreen title="Events" message={error.message} testId="events-unavailable" />;
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
    basePath: OPERATOR_EVENTS_PATH,
    query,
    carryKeys: ["q", "status", "type", "period"],
    params,
  });

  return (
    <Stack spacing={3}>
      <PageHeader
        title="Events"
        subtitle={<span data-testid="season-label">{`Season ${list.season.label}`}</span>}
        actions={
          <>
            {mayManage ? <CreateEventMenu /> : null}
            {mayManage ? <EditTemplatesButton /> : null}
            <SubscribeToCalendarButton />
          </>
        }
      />

      <ViewSwitch
        label="Events view"
        testId="events-view-switch"
        choices={[
          { href: OPERATOR_EVENTS_PATH, label: "List", active: true, testId: "view-list" },
          {
            href: OPERATOR_CALENDAR_PATH,
            label: "Calendar",
            active: false,
            testId: "view-calendar",
          },
        ]}
      />

      <PeriodSwitch
        basePath={OPERATOR_EVENTS_PATH}
        period={query.period}
        carry={{
          q: first(params.q),
          status: first(params.status),
          type: first(params.type),
          sort: query.sort,
          dir: query.direction,
        }}
      />

      <EventFilters
        statuses={EVENT_STATUS_FILTERS}
        templates={templates}
        sortColumns={SORT_OPTIONS}
        search={query.search}
        status={query.status}
        templateId={query.templateId}
        sort={query.sort}
        direction={query.direction}
        period={query.period}
      />

      {bucketedCount(buckets) === 0 ? (
        <EmptyState
          testId={emptyTestId(list, query.filtered)}
          title={emptyMessage(list, query.filtered, mayManage, PERIOD_LABELS[query.period])}
          searched={query.search || undefined}
          action={
            list.totalInSeason === 0
              ? mayManage
                ? { href: "/operate/events/new", label: "Create event" }
                : undefined
              : {
                  href: "/operate/events?period=all",
                  label: query.filtered ? "Clear filters" : "All events",
                }
          }
        />
      ) : (
        <OperatorList
          buckets={buckets}
          sortLinkFor={sortLinkFor}
          sort={query.sort}
          direction={query.direction}
          statusLabelOf={(event) => statusLabel(event, today)}
          statusCodeOf={(event) =>
            event.status === "approved" && derivedEventState(event, today) === "occurred"
              ? "occurred"
              : event.status
          }
          coordinateOf={(event) => (year === null ? "—" : year.coordinateLabel(event.scheduledOn))}
        />
      )}
    </Stack>
  );
}
