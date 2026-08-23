import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TableSortLabel from "@mui/material/TableSortLabel";
import Typography from "@mui/material/Typography";
import { isServiceError } from "@/lib/db";
import { UnavailableScreen } from "@/app/operate/unavailable";
import { operatorHasCapability } from "@/lib/auth/guards";
import {
  DEFAULT_EVENT_SORT,
  derivedEventState,
  DRAFTABLE_EVENT_TYPES,
  EVENT_SORT_COLUMNS,
  EVENT_STATUS_FILTERS,
  listCurrentSeasonEvents,
  type EventList,
  type EventListEntry,
} from "@/lib/services/events";
import { todayInClubZone } from "@/lib/club-time";
import { isNarrowAttendanceRecorder } from "@/lib/auth/capabilities";
import { gateShellPage } from "../gate";
import { CoachEligibleEvents } from "./coach-eligible-events";
import {
  bucketCoachEvents,
  isOpenForAttendance,
  isToday,
  londonToday,
} from "./coach-event-buckets";
import EventFilters from "./event-filters";
import ViewSwitch from "./view-switch";
import {
  AUDIENCE_AND_RESPONSES_COME_LATER,
  DELIVERY_MODE_LABELS,
  DERIVED_STATE_LABELS,
  describeAttendance,
  describeAudience,
  formatListWhen,
  labelFor,
  STATUS_LABELS,
  TYPE_LABELS,
} from "./presentation";

/**
 * UX-30 — the current season's events.
 *
 * ## Season-scoped, and what that changes
 *
 * LAN-76 scopes this list to "the current season's events". The wireframe's
 * subtitle names a term (`Michaelmas 2026`); the live issue names the season,
 * and live Linear outranks the SVG (`slice-ux.md` § 1), so the line under the
 * heading names the season the club is operating. Which season that is comes
 * from `readCurrentSeason()`, and a club with none gets a refusal rather than
 * last year's events.
 *
 * ## What the columns are, after Brian's clarification
 *
 * **Occurrence is gone.** It read "Awaiting assertion" for every approved
 * event, which was internal vocabulary for a decision nobody makes any more:
 * LAN-151 retired the assertion entirely, and an event has occurred when its
 * date has passed and it was not cancelled (D30). **Responses is gone too**:
 * RSVP counts are excluded from this list, and the column said "—" for
 * everything a calendar operator can currently create.
 *
 * **Where** replaced the response-solicited column when D23 removed "Response
 * requested". In person or online is a fact about the event that changes what
 * an operator has to do to get to it; whether a response was requested was not
 * a real concept, because everyone sent an event is expected to answer.
 *
 * **Audience stays, and says when it arrives** rather than that it is missing:
 * the clarification asks the list to make clear that audience and response
 * information does not exist until approval is complete, and "Not resolved"
 * reads like an omission somebody should fix.
 *
 * ## Two empty states, not one
 *
 * The shared state contract requires filter-empty and system-empty to be
 * distinguished, because the recovery differs: clear the filter, or create the
 * first event. `totalInSeason` is what tells them apart, and it is counted in
 * the same transaction as the list so the two cannot disagree.
 */

/**
 * What the Status filter offers, and what each row's Status column says — Q-6.
 *
 * Brian, at the visual gate: "I want to be able to see the status on the status
 * filter, and I want to see the events that occurred, to easily be able to tell
 * which ones happened versus not." So **Occurred** is a fourth choice beside
 * the three stored states, and a past approved event reads `Occurred` in the
 * column rather than `Approved`.
 *
 * It stays derived. Nothing stores it, nobody asserts it, and the enum is still
 * three values (D30) — `EVENT_STATUS_FILTERS` lives beside `derivedEventState`
 * in the service layer for exactly that reason, so a reader who follows the
 * word arrives at the rule rather than at a column.
 */
function statusLabel(event: EventListEntry, today: string): string {
  const derived = derivedEventState(event, today);
  return event.status === "approved" && derived === "occurred"
    ? labelFor(DERIVED_STATE_LABELS, derived)
    : labelFor(STATUS_LABELS, event.status);
}

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/**
 * Colour is never the only carrier — every chip states its status in words.
 *
 * Keyed on the word the chip actually shows rather than on the stored status,
 * so an `Occurred` chip cannot be shaded as though it read `Approved`.
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
  const gate = await gateShellPage("/operate/events", undefined, { narrowRecorder: "allow" });
  if ("screen" in gate) return gate.screen;

  const params = await searchParams;
  const search = first(params.q);

  if (isNarrowAttendanceRecorder(gate.operator.roleCodes)) {
    return await coachEventList(search);
  }

  const status = first(params.status);
  const eventType = first(params.type);
  const sort = first(params.sort) || DEFAULT_EVENT_SORT;
  const direction = first(params.dir) || EVENT_SORT_COLUMNS[sort]?.default || "desc";
  const filtered = search !== "" || status !== "" || eventType !== "";

  // Reading the calendar is open to any linked, active operator — Events is an
  // ordinary operator surface in `slice-ux.md` § 3 and § 8. Changing it is what
  // decides whether the actions are offered, and the actions guard themselves
  // regardless: a hidden button is a courtesy, never a boundary.
  const mayManage = operatorHasCapability(gate.operator, "event_calendar_management");

  // One reading of the club's clock for the whole page: the filter and every
  // row's Status column must agree about which day it is, and two calls either
  // side of midnight would not.
  const today = todayInClubZone();

  let list: EventList;
  try {
    list = await listCurrentSeasonEvents({ search, status, eventType, sort, direction, today });
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return <UnavailableScreen title="Events" message={error.message} testId="events-unavailable" />;
  }

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
          { href: "/operate/events", label: "List", active: true, testId: "view-list" },
          {
            href: "/operate/events/calendar",
            label: "Calendar",
            active: false,
            testId: "view-calendar",
          },
        ]}
      />

      <EventFilters
        statuses={EVENT_STATUS_FILTERS}
        types={DRAFTABLE_EVENT_TYPES}
        sortColumns={SORT_OPTIONS}
        search={search}
        status={status}
        eventType={eventType}
        sort={sort}
        direction={direction}
      />

      <Alert severity="info" data-testid="audience-note">
        {AUDIENCE_AND_RESPONSES_COME_LATER}
      </Alert>

      {list.events.length === 0 ? (
        <Alert severity="info" data-testid={filtered ? "events-filter-empty" : "events-empty"}>
          {filtered
            ? "No event in this season matches those filters. Clear them to see the season’s events."
            : mayManage
              ? "This season has no events yet. Create the first one."
              : "This season has no events yet."}
        </Alert>
      ) : (
        <>
          {/* Desktop: the scannable command view. */}
          <TableContainer
            component={Paper}
            variant="outlined"
            sx={{ display: { xs: "none", md: "block" } }}
          >
            <Table size="small" aria-label="Events">
              <TableHead>
                <TableRow>
                  <SortableHeader
                    column="name"
                    label="Event"
                    sort={sort}
                    direction={direction}
                    query={params}
                  />
                  <SortableHeader
                    column="date"
                    label="Date"
                    sort={sort}
                    direction={direction}
                    query={params}
                  />
                  <SortableHeader
                    column="venue"
                    label="Venue"
                    sort={sort}
                    direction={direction}
                    query={params}
                  />
                  <SortableHeader
                    column="status"
                    label="Status"
                    sort={sort}
                    direction={direction}
                    query={params}
                  />
                  <TableCell>Where</TableCell>
                  <TableCell>Audience</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {list.events.map((event) => (
                  <TableRow key={event.id} hover data-testid="event-row">
                    <TableCell>
                      <Button
                        href={`/operate/events/${event.id}`}
                        sx={{ textAlign: "left", justifyContent: "flex-start", p: 0 }}
                      >
                        {event.name}
                      </Button>
                      <Typography variant="caption" component="p" color="text.secondary">
                        {labelFor(TYPE_LABELS, event.eventType)}
                      </Typography>
                    </TableCell>
                    <TableCell>{formatListWhen(event)}</TableCell>
                    <TableCell>{event.venue ?? "—"}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={statusLabel(event, today)}
                        color={statusColour(statusLabel(event, today))}
                      />
                    </TableCell>
                    <TableCell>{labelFor(DELIVERY_MODE_LABELS, event.deliveryMode)}</TableCell>
                    <TableCell>{describeAudience(event)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Phone: the same events as cards, with nothing left out. */}
          <Stack spacing={2} sx={{ display: { xs: "flex", md: "none" } }}>
            {list.events.map((event) => (
              <EventCard key={event.id} event={event} today={today} />
            ))}
          </Stack>
        </>
      )}
    </Stack>
  );
}

/**
 * The coaching assignment's event list. LAN-110.
 *
 * It reads through `listCurrentSeasonEvents` — the same service, the same
 * season resolution, the same query — rather than through a second reader of
 * its own, and filters the statuses in `./coach-event-buckets.ts`. LAN-110's own criterion is that "no code
 * path duplicates LAN-80's attendance model", and a private events query for
 * coaches would be the first step towards two answers to "which events are
 * there".
 *
 * No status comes from the query string, so `?status=draft` on this route
 * cannot show a coach a draft. Which statuses they see is decided in
 * `./coach-event-buckets.ts` and applied there — approved and occurred, and
 * nothing else.
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

/** The sort choices, as the phone control needs them. */
const SORT_OPTIONS: readonly { value: string; label: string }[] = Object.freeze([
  { value: "date", label: "Date" },
  { value: "name", label: "Event name" },
  { value: "venue", label: "Venue" },
  { value: "status", label: "Status" },
]);

/**
 * One sortable column header.
 *
 * A link rather than a button: sorting is a different view of the same list, so
 * it belongs in the URL, works with the back button, and survives a page
 * refresh. Clicking the active column flips its direction; clicking another
 * takes that column's own default, because "newest first" and "A to Z" are
 * both the useful starting point for their own column.
 */
function SortableHeader({
  column,
  label,
  sort,
  direction,
  query,
}: {
  column: string;
  label: string;
  sort: string;
  direction: string;
  query: Record<string, string | string[] | undefined>;
}) {
  const active = sort === column;
  const next = active
    ? direction === "asc"
      ? "desc"
      : "asc"
    : (EVENT_SORT_COLUMNS[column]?.default ?? "desc");

  const params = new URLSearchParams();
  for (const key of ["q", "status", "type"]) {
    const value = first(query[key]);
    if (value !== "") params.set(key, value);
  }
  params.set("sort", column);
  params.set("dir", next);

  return (
    <TableCell sortDirection={active ? (direction === "asc" ? "asc" : "desc") : false}>
      <TableSortLabel
        active={active}
        direction={active && direction === "asc" ? "asc" : "desc"}
        href={`/operate/events?${params.toString()}`}
        component="a"
      >
        {label}
      </TableSortLabel>
    </TableCell>
  );
}

/**
 * The phone presentation of one event.
 *
 * The wireframe's card carries name, date and venue. Status, where the event
 * is and whether attendance is expected are carried too — dropping a status on
 * a narrow screen would leave an operator unable to tell a draft from an
 * approved event, and § 7 forbids reflow that removes data needed for the
 * task.
 */
function EventCard({ event, today }: { event: EventListEntry; today: string }) {
  return (
    <Card variant="outlined" data-testid="event-card">
      <CardActionArea href={`/operate/events/${event.id}`} sx={{ p: 2 }}>
        <Stack spacing={1}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {event.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {formatListWhen(event)}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
            <Chip
              size="small"
              label={statusLabel(event, today)}
              color={statusColour(statusLabel(event, today))}
            />
            <Chip size="small" label={labelFor(TYPE_LABELS, event.eventType)} />
            {event.venue ? <Chip size="small" label={event.venue} /> : null}
            <Chip size="small" label={labelFor(DELIVERY_MODE_LABELS, event.deliveryMode)} />
            <Chip size="small" label={describeAttendance(event.isMandatory)} />
          </Stack>
        </Stack>
      </CardActionArea>
    </Card>
  );
}
