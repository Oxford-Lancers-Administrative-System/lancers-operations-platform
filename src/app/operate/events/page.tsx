import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { isServiceError } from "@/lib/db";
import { UnavailableScreen } from "@/app/operate/unavailable";
import { operatorHasCapability } from "@/lib/auth/guards";
import {
  derivedEventState,
  DRAFTABLE_EVENT_TYPES,
  EVENT_SORT_COLUMNS,
  EVENT_STATUS_FILTERS,
  listCurrentSeasonEvents,
  listEventsForOperator,
  type EventList,
  type EventListEntry,
} from "@/lib/services/events";
import { bucketedCount, bucketEventsByPeriod, PERIOD_LABELS } from "@/lib/services/event-periods";
import { todayInClubZone } from "@/lib/club-time";
import { isNarrowAttendanceRecorder } from "@/lib/auth/capabilities";
import PeriodSwitch from "@/app/calendar/period-switch";
import { first, readListQuery, sortLinkFactory } from "@/app/calendar/query";
import { OPERATOR_CALENDAR_PATH, OPERATOR_EVENTS_PATH } from "@/app/calendar/routes";
import ViewSwitch from "@/app/calendar/view-switch";
import { readEventYear } from "@/app/calendar/year";
import { gateShellPage } from "../gate";
import { CoachEligibleEvents } from "./coach-eligible-events";
import {
  bucketCoachEvents,
  isOpenForAttendance,
  isToday,
  londonToday,
} from "./coach-event-buckets";
import EventFilters from "./event-filters";
import OperatorList from "./operator-list";
import { DERIVED_STATE_LABELS, formatListWhen, labelFor, STATUS_LABELS } from "./presentation";

/**
 * UX-30 — the open season's events, as the operator reads them. LAN-153.
 *
 * ## It opens on what is upcoming, and it groups
 *
 * D84 and Brian, 20 August 2026. The list no longer renders the whole season in
 * one flat run: it opens on **This month**, breaks what is in view into discrete
 * tables by period, and offers **All events** as the widest bucket with every
 * sort and every filter working there. Past events stay reachable and are never
 * the default. `@/lib/services/event-periods` owns the buckets, and the public
 * list is grouped by the same ones.
 *
 * ## Season-scoped, and no way to leave it
 *
 * The line under the heading names the season the club is operating, and there
 * is no season selector — `REQ-one-open-season`, and Brian, 21 August 2026: "we
 * know what calendar we're looking at." Which season that is comes from
 * `readCurrentSeason()`, and a club with none gets a refusal rather than last
 * year's events.
 *
 * ## Term and week comes from the calendar, not from the row
 *
 * `REQ-three-arrangements` requires the list and the Oxford View to agree about
 * when an event is, so both read one built academic year (`@/app/calendar/year`).
 * Reading `events.week_number` here instead would say "Outside term" for a
 * vacation event the calendar happily calls "Christmas Vacation 2" — the stored
 * column is constrained to −1..8 and cannot hold the second.
 *
 * ## Authorisation is in the service layer
 *
 * `listEventsForOperator` guards itself (`@/lib/auth/event-tier`). The gate below
 * and the layout's own check remain, and this is the third of three independent
 * refusals rather than a replacement for either — which is what `slice-ux.md`
 * § 4's "routes do not authorize" has to mean now that a public calendar exists.
 *
 * ## Three empty states, not one
 *
 * Filter-empty, period-empty and season-empty need different recovery, so they
 * say different things. `totalInSeason` is counted in the same transaction as
 * the list, so the two cannot disagree.
 */

/**
 * What the Status filter offers, and what each row's Status column says — Q-6.
 *
 * Brian, at the visual gate: "I want to be able to see the status on the status
 * filter, and I want to see the events that occurred, to easily be able to tell
 * which ones happened versus not." So **Occurred** is a fourth choice beside the
 * three stored states, and a past approved event reads `Occurred` in the column
 * rather than `Approved`.
 *
 * It stays derived. Nothing stores it, nobody asserts it, and the enum is still
 * three values (D30) — `EVENT_STATUS_FILTERS` lives beside `derivedEventState` in
 * the service layer for exactly that reason, so a reader who follows the word
 * arrives at the rule rather than at a column.
 */
function statusLabel(event: EventListEntry, today: string): string {
  const derived = derivedEventState(event, today);
  return event.status === "approved" && derived === "occurred"
    ? labelFor(DERIVED_STATE_LABELS, derived)
    : labelFor(STATUS_LABELS, event.status);
}

/**
 * Colour is never the only carrier — every chip states its status in words.
 *
 * Keyed on the word the chip actually shows rather than on the stored status, so
 * an `Occurred` chip cannot be shaded as though it read `Approved`.
 */
function statusColour(label: string): "default" | "info" | "success" | "warning" {
  switch (label) {
    case "Approved":
      return "success";
    case "Occurred":
      return "warning";
    case "Draft":
      return "info";
    default:
      return "default";
  }
}

export default async function EventsPage({ searchParams }: PageProps<"/operate/events">) {
  // LAN-110. The coach shell's one destination is this route, so it opts in —
  // and then renders something else entirely. See `./coach-eligible-events.tsx`
  // for why the coach list lives on the operator's route rather than on a new
  // one, and for what it withholds.
  const gate = await gateShellPage(OPERATOR_EVENTS_PATH, undefined, { narrowRecorder: "allow" });
  if ("screen" in gate) return gate.screen;

  const params = await searchParams;

  if (isNarrowAttendanceRecorder(gate.operator.roleCodes)) {
    return await coachEventList(first(params.q));
  }

  const query = readListQuery(params, Object.keys(EVENT_SORT_COLUMNS));

  // Reading the calendar is open to any linked, active operator — Events is an
  // ordinary operator surface in `slice-ux.md` § 3 and § 8. Changing it is what
  // decides whether the actions are offered, and the actions guard themselves
  // regardless: a hidden button is a courtesy, never a boundary.
  const mayManage = operatorHasCapability(gate.operator, "event_calendar_management");

  // One reading of the club's clock for the whole page: the filter, every row's
  // Status column and every bucket boundary must agree about which day it is,
  // and two calls either side of midnight would not.
  const today = todayInClubZone();

  let list: EventList;
  try {
    list = await listEventsForOperator({
      search: query.search,
      status: query.status,
      eventType: query.eventType,
      sort: query.sort,
      direction: query.direction,
      today,
    });
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
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <Button variant="contained" href="/operate/events/new">
              Create event
            </Button>
            {/*
              D40's administration surface, reached from the Events area rather
              than from the shell: a template is a property of an event type, and
              somebody comes to it having noticed that every practice needs the
              same thing typed in again.
            */}
            <Button
              variant="outlined"
              href="/operate/events/templates"
              data-testid="open-templates"
              sx={{ minHeight: 44 }}
            >
              Templates
            </Button>
          </Stack>
        ) : null}
      </Stack>

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
        types={DRAFTABLE_EVENT_TYPES}
        sortColumns={SORT_OPTIONS}
        search={query.search}
        status={query.status}
        eventType={query.eventType}
        sort={query.sort}
        direction={query.direction}
        period={query.period}
      />

      {bucketedCount(buckets) === 0 ? (
        <Alert severity="info" data-testid={emptyTestId(list, query.filtered)}>
          {emptyMessage(list, query.filtered, mayManage, PERIOD_LABELS[query.period])}
        </Alert>
      ) : (
        <OperatorList
          buckets={buckets}
          sortLinkFor={sortLinkFor}
          sort={query.sort}
          direction={query.direction}
          statusLabelOf={(event) => statusLabel(event, today)}
          statusColourOf={statusColour}
          coordinateOf={(event) => (year === null ? "—" : year.coordinateLabel(event.scheduledOn))}
        />
      )}
    </Stack>
  );
}

/**
 * Three empty states, distinguished, because the recovery differs.
 *
 * `slice-ux.md` § 9, and `W1`'s exception table: "nothing this week" is not
 * "nothing all season", which is not "nothing matching your filter". Each says
 * what is true and offers the smallest recovery the reader is authorized to
 * take — and none of them explains a rule.
 */
function emptyTestId(list: EventList, filtered: boolean): string {
  if (list.totalInSeason === 0) return "events-empty";
  return filtered ? "events-filter-empty" : "events-period-empty";
}

function emptyMessage(
  list: EventList,
  filtered: boolean,
  mayManage: boolean,
  periodLabel: string,
): string {
  if (list.totalInSeason === 0) {
    return mayManage
      ? "This season has no events yet. Create the first one."
      : "This season has no events yet.";
  }
  if (filtered) {
    return "No event in this season matches those filters. Clear them to see the season’s events.";
  }
  return `Nothing in ${periodLabel.toLowerCase()}. Try a wider period.`;
}

/**
 * The coaching assignment's event list. LAN-110.
 *
 * It reads through `listCurrentSeasonEvents` — the same service, the same season
 * resolution, the same query — rather than through a second reader of its own,
 * and filters the statuses in `./coach-event-buckets.ts`. LAN-110's own criterion
 * is that "no code path duplicates LAN-80's attendance model", and a private
 * events query for coaches would be the first step towards two answers to "which
 * events are there".
 *
 * It reads the unguarded service call rather than `listEventsForOperator`, and
 * that is not a gap: the page's own gate has already resolved this coach as a
 * linked, active operator, and calling the guard again would resolve the same
 * session a second time to reach the same answer. What the coach may *see* is
 * narrowed below and in `./coach-event-buckets.ts`, which is where LAN-110 put
 * it — approved and occurred, no status from the query string, and none of the
 * counts.
 *
 * A function the page awaits rather than a component it returns. An async
 * component element returned from another async component is resolved by the
 * framework but not by a direct `render(await Page())`, so writing it that way
 * would have made the coach's list untestable at exactly the level the rest of
 * this screen is tested at.
 */
async function coachEventList(search: string) {
  let list: EventList;
  try {
    list = await listCurrentSeasonEvents({ search, sort: "date", direction: "desc" });
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return (
      <UnavailableScreen title="Attendance" message={error.message} testId="events-unavailable" />
    );
  }

  const today = londonToday();
  // The card's open/not-open line is about an instant, not a day — W-F1. The
  // sections are still bucketed by date; only the register's own question needs
  // the clock.
  const now = new Date();

  return (
    <CoachEligibleEvents
      search={search}
      filtered={search !== ""}
      sections={bucketCoachEvents(list.events, today).map((bucket) => ({
        key: bucket.key,
        label: bucket.label,
        detail: bucket.detail,
        events: bucket.events.map((event) => ({
          id: event.id,
          name: event.name,
          when: formatListWhen(event),
          venue: event.venue,
          isToday: isToday(event, today),
          isOpen: isOpenForAttendance(event, now),
        })),
      }))}
    />
  );
}

/**
 * The sort choices, as the phone control needs them.
 *
 * Every column in the table, so the phone has the sorts the desktop headers
 * have — `REQ-list-shape`: "Every column sorts". **Term and week** is here and
 * resolves to the same SQL as Date, which is the requirement rather than a
 * shortcut.
 */
const SORT_OPTIONS: readonly { value: string; label: string }[] = Object.freeze([
  { value: "date", label: "Date" },
  { value: "term", label: "Term and week" },
  { value: "name", label: "Event name" },
  { value: "type", label: "Type" },
  { value: "venue", label: "Where" },
  { value: "status", label: "Status" },
  { value: "invited", label: "Invited" },
  { value: "said_yes", label: "Said yes" },
  { value: "showed", label: "Showed" },
]);
