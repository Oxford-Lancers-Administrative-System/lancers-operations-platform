import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { operatorHasCapability } from "@/lib/auth/guards";
import { todayInClubZone } from "@/lib/club-time";
import { isServiceError } from "@/lib/db";
import {
  buildMonthGrid,
  buildTermCard,
  defaultMonth,
  defaultTerm,
  findTerm,
  groupTermsByAcademicYear,
  parseMonth,
  shiftMonth,
  monthOf,
  type CalendarEvent,
} from "@/lib/services/calendar";
import { listCurrentSeasonEvents, type EventList } from "@/lib/services/events";
import { listTermWindows } from "@/lib/services/seasons";
import type { TermWindow } from "@/lib/services/event-input";
import { gateShellPage } from "../../gate";
import ViewSwitch from "../view-switch";
import CalendarEntry from "./calendar-entry";
import { GregorianControls, OxfordControls, type TermChoice } from "./calendar-controls";
import GregorianMonth from "./gregorian-month";
import TermCard from "./term-card";
import {
  CALENDAR_READ_ONLY_NOTE,
  CALENDAR_SOURCE_NOTE,
  formatTermName,
  MONTH_EMPTY,
  NO_TERMS_CONFIGURED,
  OUTSIDE_ANY_TERM_LABEL,
  OUTSIDE_ANY_TERM_DETAIL,
  OTHER_TERMS_NOTE,
  TERM_CARD_EMPTY,
  UNDATED_DETAIL,
  UNDATED_HEADLINE,
} from "./presentation";

/**
 * The Events calendar — Gregorian month, and the Oxford term card. LAN-114.
 *
 * ## The same events as the list, rearranged
 *
 * This page reads `listCurrentSeasonEvents()` with no filter, which is the same
 * call `/operate/events` makes, so the three presentations cannot show
 * different sets of events or different dates for one event: they are one query
 * and three arrangements of its result. Every tile links to
 * `/operate/events/<id>`, so the detail destination is the same one too.
 *
 * ## It reads, and only reads
 *
 * There is no server action on this page and no form that posts anywhere.
 * Opening the calendar, changing month, changing term and switching mode all
 * resolve to `GET`s that call one read. The issue's requirement that
 * "no audience, invitation, RSVP, attendance, or automation record is created
 * or changed merely by viewing or navigating the calendar" is therefore a
 * property of the module's imports rather than a promise — the write paths are
 * not reachable from here, and the screen test asserts none of them is called.
 *
 * ## Who may read it
 *
 * The ordinary operator gate, exactly as the event list uses it: any linked,
 * active operator. `slice-ux.md` § 8 places Events in the first row, and LAN-76
 * already opened the list on that footing. The four calendar-management roles
 * additionally get the Create control, and `mayManage` decides only what is
 * *rendered* — every write behind it guards itself.
 *
 * The issue's "club-wide read surface for everyone the calendar serves" is
 * implemented at that boundary because it is the widest audience this slice
 * has: players hold no account, and reach the application only through the
 * no-login RSVP token. Opening a calendar to unauthenticated visitors would be
 * a change to the security posture rather than a calendar feature, and
 * `AGENTS.md` reserves that for Brian. Recorded in the pull request.
 *
 * ## Which day is today
 *
 * From `@/lib/club-time`, in the club's zone, and passed down as a plain
 * `YYYY-MM-DD`. The grids never ask a clock anything themselves — a component
 * that read `new Date()` would be the second timezone rule the issue forbids,
 * and would highlight the wrong cell for an hour every summer night.
 */

type CalendarMode = "gregorian" | "oxford";

const BASE_PATH = "/operate/events/calendar";

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function modeOf(value: string): CalendarMode {
  return value === "oxford" ? "oxford" : "gregorian";
}

function gregorianHref(month: string): string {
  return `${BASE_PATH}?mode=gregorian&month=${month}`;
}

function oxfordHref(termId: string | null): string {
  return termId
    ? `${BASE_PATH}?mode=oxford&term=${encodeURIComponent(termId)}`
    : `${BASE_PATH}?mode=oxford`;
}

export default async function EventCalendarPage({
  searchParams,
}: PageProps<"/operate/events/calendar">) {
  const gate = await gateShellPage(BASE_PATH);
  if ("screen" in gate) return gate.screen;

  const params = await searchParams;
  const mode = modeOf(first(params.mode));
  const mayManage = operatorHasCapability(gate.operator, "event_calendar_management");
  const today = todayInClubZone();

  let list: EventList;
  let terms: TermWindow[];
  try {
    [list, terms] = await Promise.all([listCurrentSeasonEvents(), listTermWindows()]);
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return (
      <Stack spacing={2} sx={{ maxWidth: 720 }}>
        <Typography variant="h6" component="h1">
          Events calendar
        </Typography>
        <Alert severity="warning" data-testid="calendar-unavailable">
          {error.message}
        </Alert>
      </Stack>
    );
  }

  const events: CalendarEvent[] = list.events;

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
            { href: "/operate/events", label: "List", active: false, testId: "view-list" },
            {
              href: mode === "oxford" ? oxfordHref(first(params.term) || null) : BASE_PATH,
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
              href: `${BASE_PATH}?mode=gregorian`,
              label: "Gregorian",
              active: mode === "gregorian",
              testId: "mode-gregorian",
            },
            {
              href: `${BASE_PATH}?mode=oxford`,
              label: "Oxford term",
              active: mode === "oxford",
              testId: "mode-oxford",
            },
          ]}
        />
      </Stack>

      <Alert severity="info" data-testid="calendar-note">
        {CALENDAR_SOURCE_NOTE}
      </Alert>
      {mayManage ? null : (
        <Alert severity="info" data-testid="calendar-read-only-note">
          {CALENDAR_READ_ONLY_NOTE}
        </Alert>
      )}

      {mode === "gregorian" ? (
        <GregorianView events={events} params={params} today={today} />
      ) : (
        <OxfordView events={events} terms={terms} params={params} today={today} />
      )}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Gregorian
// ---------------------------------------------------------------------------

function GregorianView({
  events,
  params,
  today,
}: {
  events: readonly CalendarEvent[];
  params: Record<string, string | string[] | undefined>;
  today: string;
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
        basePath={BASE_PATH}
      />

      {grid.placedCount === 0 ? (
        <Alert severity="info" data-testid="month-empty">
          {MONTH_EMPTY}
        </Alert>
      ) : null}

      <GregorianMonth grid={grid} />

      <LeftOver
        events={grid.undated}
        testId="undated-events"
        headline={UNDATED_HEADLINE}
        detail={UNDATED_DETAIL}
      />
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Oxford term
// ---------------------------------------------------------------------------

function OxfordView({
  events,
  terms,
  params,
  today,
}: {
  events: readonly CalendarEvent[];
  terms: readonly TermWindow[];
  params: Record<string, string | string[] | undefined>;
  today: string;
}) {
  const selected = findTerm(terms, first(params.term) || null) ?? defaultTerm(terms, today);

  if (!selected) {
    return (
      <Stack spacing={2} data-testid="oxford-view">
        <Alert severity="warning" data-testid="no-terms-configured">
          {NO_TERMS_CONFIGURED}
        </Alert>
      </Stack>
    );
  }

  const card = buildTermCard(selected, terms, events, today);

  // Newest academic year first, each year Michaelmas → Hilary → Trinity, so the
  // two selects are driven by one already-ordered list.
  const choices: TermChoice[] = groupTermsByAcademicYear(terms).flatMap((year) =>
    year.terms.map((term) => ({
      id: term.id,
      label: formatTermName(term),
      name: term.name,
      academicYear: term.academicYear,
    })),
  );

  return (
    <Stack spacing={2} data-testid="oxford-view">
      <OxfordControls terms={choices} termId={selected.id} basePath={BASE_PATH} />

      {card.placedCount === 0 ? (
        <Alert severity="info" data-testid="term-card-empty">
          {TERM_CARD_EMPTY}
        </Alert>
      ) : null}

      <TermCard card={card} />

      {/*
        One quiet line, not a panel. The card now reaches past its own weeks for
        the events around the term, so the only thing left to say is where the
        rest of the season is — and Brian's review was that this had become far
        too prominent for that.
      */}
      <Typography variant="caption" color="text.secondary" data-testid="other-terms-note">
        {OTHER_TERMS_NOTE}
      </Typography>

      <LeftOver
        events={card.elsewhere.farFromAnyTerm}
        testId="far-from-any-term"
        headline={OUTSIDE_ANY_TERM_LABEL}
        detail={OUTSIDE_ANY_TERM_DETAIL}
      />

      <LeftOver
        events={card.elsewhere.undated}
        testId="undated-events"
        headline={UNDATED_HEADLINE}
        detail={UNDATED_DETAIL}
      />
    </Stack>
  );
}

/**
 * The events no cell can hold — undated ones, and dated ones too far from any
 * term for a card to reach.
 *
 * Deliberately understated: a bordered block rather than the heavy panel this
 * started as. It exists so nothing is omitted silently, and on a normal season
 * it renders nothing at all.
 */
function LeftOver({
  events,
  testId,
  headline,
  detail,
}: {
  events: readonly CalendarEvent[];
  testId: string;
  headline: string;
  detail: string;
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
          <CalendarEntry key={event.id} event={event} showDate />
        ))}
      </Stack>
    </Box>
  );
}
