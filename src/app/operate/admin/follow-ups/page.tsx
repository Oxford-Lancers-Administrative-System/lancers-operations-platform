import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { isServiceError } from "@/lib/db";
import { readEventYear } from "@/app/calendar/year";
import { formatDeadline } from "@/app/operate/events/presentation";
import { SortableColumnHeading } from "@/app/participation/participation-table";
import { todayInClubZone } from "@/lib/club-time";
import { EVENT_PERIODS, periodBounds, type EventPeriod } from "@/lib/services/event-periods";
import { formatLongDate } from "@/lib/services/event-vocabulary";
import {
  countPeople,
  readFollowUpsQueue,
  type FollowUpEvent,
  type FollowUpRow,
  type FollowUpStatus,
} from "@/lib/services/follow-ups";
import { sortColumnHref, sortColumnState, stableSortRows } from "@/lib/services/participation-view";
import { readCurrentSeason } from "@/lib/services/seasons";
import { UnavailableScreen } from "@/app/operate/unavailable";
import { gateShellPage } from "../../gate";
import AdminPageHeading from "../page-heading";
import FollowUpsFilter from "./follow-ups-filter";
import {
  CHASE_NONE,
  DEADLINE_UNSET,
  EMPTY_QUEUE,
  PAGE_HEADING,
  STATUS_COLOURS,
  STATUS_LABELS,
  subheading,
  TABLE_CHASE,
  TABLE_DEADLINE,
  TABLE_EVENT,
  TABLE_PERSON,
  TABLE_STATUS,
  TABLE_WHEN,
} from "./presentation";

const FOLLOW_UPS_PATH = "/operate/admin/follow-ups";

/** Every column the table sorts by — OWNER-LAN173-05. */
const FOLLOWUPS_SORT_COLUMNS = Object.freeze([
  "person",
  "event",
  "when",
  "deadline",
  "chase",
  "status",
] as const);
type FollowUpsSortColumn = (typeof FOLLOWUPS_SORT_COLUMNS)[number];

function isFollowUpsSort(value: string): value is FollowUpsSortColumn {
  return (FOLLOWUPS_SORT_COLUMNS as readonly string[]).includes(value);
}

/** Every other query key this page's URL carries, for a sort or filter link. */
interface FollowUpsFilters {
  readonly search: string;
  readonly status: string;
  readonly period: EventPeriod;
  readonly sort: string;
  readonly direction: string;
}

function followUpsSortHref(basePath: string, filters: FollowUpsFilters, column: string): string {
  return sortColumnHref(
    basePath,
    { q: filters.search, status: filters.status, period: filters.period },
    "sort",
    "dir",
    filters.sort,
    filters.direction,
    "when",
    column,
  );
}

function followUpsSortState(
  filters: FollowUpsFilters,
  column: string,
): { active: boolean; direction: "asc" | "desc" } {
  return sortColumnState(filters.sort, filters.direction, column, "when");
}

/** One flat row — the table's own shape, an event repeated across its people. */
interface QueueRow extends FollowUpRow {
  readonly eventId: string;
  readonly eventName: string;
  readonly scheduledOn: string | null;
}

function flatten(events: readonly FollowUpEvent[]): readonly QueueRow[] {
  return events.flatMap((event) =>
    event.people.map((person) => ({
      ...person,
      eventId: event.eventId,
      eventName: event.eventName,
      scheduledOn: event.scheduledOn,
    })),
  );
}

/** A row's sortable value for one column, as a comparable string or number. */
function followUpsSortValue(row: QueueRow, column: FollowUpsSortColumn): string | number {
  switch (column) {
    case "person":
      return row.personName.toLocaleLowerCase();
    case "event":
      return row.eventName.toLocaleLowerCase();
    case "when":
      // Undated sorts last ascending, the same "￿" convention
      // `participation-view.ts`'s own `sortValue` uses for "no date here" —
      // a plain `""` would put every undated row above the earliest real one.
      return row.scheduledOn ?? "￿";
    case "deadline":
      return row.deadline ? row.deadline.getTime() : Number.MAX_SAFE_INTEGER;
    case "chase":
      return (row.chasePosition ?? "￿").toLocaleLowerCase();
    case "status":
      return row.status;
  }
}

/**
 * Whether a row's event falls inside the chosen date period — OWNER-LAN173-05.
 * An event with no recorded date is never excluded, the same rule
 * `bucketEventsByPeriod` gives an undated event on the Events list: it has no
 * period to be filtered out of.
 */
function matchesPeriod(
  row: Pick<QueueRow, "scheduledOn">,
  bounds: { startsOn: string | null; endsOn: string | null },
): boolean {
  const day = row.scheduledOn;
  if (day === null) return true;
  if (bounds.startsOn !== null && day < bounds.startsOn) return false;
  if (bounds.endsOn !== null && day > bounds.endsOn) return false;
  return true;
}

/**
 * "This term"'s own boundary, read the same way the Events list and Calendar
 * read it (`@/app/calendar/year`) — so "this term" means the same stretch of
 * days everywhere it appears (`docs/ux/standards.md` rule 7), rather than a
 * second date calculation for this one queue. `[]` in place of an event list:
 * this queue only needs the segment's start and end, never the per-event
 * placement `readEventYear` also computes.
 *
 * A club with no open season, or today in no configured term, degrades to no
 * boundary on either side — `periodBounds`'s own graceful answer for "This
 * term" with nothing to mean — rather than failing the whole page over a
 * lookup this queue does not otherwise need.
 */
async function currentTermBounds(
  today: string,
): Promise<{ startsOn: string | null; endsOn: string | null }> {
  try {
    const season = await readCurrentSeason();
    const year = await readEventYear([], {
      today,
      seasonStartsOn: season.startsOn,
      seasonEndsOn: season.endsOn,
    });
    return {
      startsOn: year?.currentSegmentStartsOn ?? null,
      endsOn: year?.currentSegmentEndsOn ?? null,
    };
  } catch {
    return { startsOn: null, endsOn: null };
  }
}

function FollowUpsHeading({
  filters,
  column,
  label,
}: {
  filters: FollowUpsFilters;
  column: FollowUpsSortColumn;
  label: string;
}) {
  const { active, direction } = followUpsSortState(filters, column);
  return (
    <SortableColumnHeading
      column={column}
      label={label}
      href={followUpsSortHref(FOLLOW_UPS_PATH, filters, column)}
      active={active}
      direction={direction}
    />
  );
}

/**
 * The Follow-ups queue — W5, under Administration.
 *
 * ## One flat table, sorted soonest event first
 *
 * The approved mockup (W5-01) draws one continuous table — Person, Event,
 * When, Deadline, Where the chase has got to, Status — with the event name
 * repeated down the rows rather than a heading per event. "Grouped by event,
 * soonest first" (W5's own words) is the *sort*, not a second visual language:
 * `readFollowUpsQueue` already groups internally so a caller cannot read one
 * event's people out of order, and this page flattens that back to rows for
 * the one table W5-01 shows.
 *
 * ## Nobody compiles a list
 *
 * `T03-nonresponse-queue` is the whole of this page: `readFollowUpsQueue`
 * reads `nonresponse_queue`, a view that already exists, and shows it. There
 * is no button that builds this list and no action that refreshes it — it is
 * a reading of state, exactly as the participation table's Delivery column is.
 *
 * ## Any operator, not a further capability
 *
 * `gateShellPage` is called with no capability, matching `readFollowUpsQueue`'s
 * own floor (`requireGeneralOperator`) — the workflow names its primary actor
 * as "the President, and any operator working follow-ups", not a privileged
 * subset the way Operators and Roles are. Placement under Administration is
 * `DEC-administration-navigation`'s steer on where a low-frequency surface
 * belongs, not a narrower authority.
 */
export default async function FollowUpsPage({
  searchParams,
}: PageProps<"/operate/admin/follow-ups">) {
  const gate = await gateShellPage("/operate/admin/follow-ups");
  if ("screen" in gate) return gate.screen;

  const query = await searchParams;
  const search = typeof query.q === "string" ? query.q : "";
  const status = typeof query.status === "string" ? query.status : "";
  const rawPeriod = typeof query.period === "string" ? query.period : "";
  // OWNER-LAN173-05. Unlike the Events list, an unrecognised or absent period
  // resolves to **All events** — this queue's own existing default — never to
  // "This month": defaulting a cross-event queue to a narrower window than it
  // has always shown would be changing what it selects, which the finding is
  // explicit this correction must not do.
  const period: EventPeriod = (EVENT_PERIODS as readonly string[]).includes(rawPeriod)
    ? (rawPeriod as EventPeriod)
    : "all";
  // The escalation's own link (`templates.ts`, `messaging-scheduler.ts`) opens
  // this queue already narrowed to the event it was about. An unknown id
  // filters to nothing rather than silently showing everything: the officer
  // followed a link about one event, and a full queue would read as that
  // event's outstanding list.
  const eventFilter = typeof query.event === "string" ? query.event : "";
  const rawSort = typeof query.sort === "string" ? query.sort : "";
  const sort = isFollowUpsSort(rawSort) ? rawSort : "";
  const rawDirection = typeof query.dir === "string" ? query.dir : "";
  const direction = rawDirection === "desc" ? "desc" : rawDirection === "asc" ? "asc" : "";
  const filters: FollowUpsFilters = { search, status, period, sort, direction };

  let events: readonly FollowUpEvent[];
  try {
    events = await readFollowUpsQueue();
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return (
      <UnavailableScreen
        title={PAGE_HEADING}
        message={error.message}
        testId="follow-ups-unavailable"
      />
    );
  }

  const today = todayInClubZone();
  const segment =
    period === "term" ? await currentTermBounds(today) : { startsOn: null, endsOn: null };
  const bounds = periodBounds(period, today, segment);

  const rows = flatten(events);
  const needle = search.trim().toLowerCase();
  const filtered = rows.filter(
    (row) =>
      (status === "" || row.status === status) &&
      (eventFilter === "" || row.eventId === eventFilter) &&
      (needle === "" || row.personName.toLowerCase().includes(needle)) &&
      matchesPeriod(row, bounds),
  );

  const sortColumn: FollowUpsSortColumn = isFollowUpsSort(sort) ? sort : "when";
  const descending = direction === "desc";
  const sorted = stableSortRows(
    filtered,
    (row) => followUpsSortValue(row, sortColumn),
    descending,
    (left, right) => {
      const order = left.personName.localeCompare(right.personName);
      // The tie-break stays ascending in both directions, the same rule
      // `participation-view.ts`'s own `applyParticipationView` documents:
      // reversing "When" must not also reverse two people at the same event.
      return order === 0 ? left.invitationId.localeCompare(right.invitationId) : order;
    },
  );

  return (
    <Stack spacing={3} data-testid="follow-ups-screen">
      <AdminPageHeading
        title={PAGE_HEADING}
        subtitle={subheading(countPeople(events), events.length)}
      />

      <FollowUpsFilter
        basePath={FOLLOW_UPS_PATH}
        search={search}
        status={status}
        period={period}
        sort={sort}
        direction={direction}
      />

      {sorted.length === 0 ? (
        <Alert severity="info" data-testid="follow-ups-empty">
          {rows.length === 0
            ? EMPTY_QUEUE
            : eventFilter !== ""
              ? "No one is outstanding for that event."
              : "No one matches this search."}
        </Alert>
      ) : (
        <Paper variant="outlined">
          {/* Desktop: one continuous table, per W5-01. */}
          <TableContainer sx={{ display: { xs: "none", md: "block" }, overflowX: "auto" }}>
            <Table size="small" data-testid="follow-ups-table">
              <TableHead>
                <TableRow>
                  <FollowUpsHeading filters={filters} column="person" label={TABLE_PERSON} />
                  <FollowUpsHeading filters={filters} column="event" label={TABLE_EVENT} />
                  <FollowUpsHeading filters={filters} column="when" label={TABLE_WHEN} />
                  <FollowUpsHeading filters={filters} column="deadline" label={TABLE_DEADLINE} />
                  <FollowUpsHeading filters={filters} column="chase" label={TABLE_CHASE} />
                  <FollowUpsHeading filters={filters} column="status" label={TABLE_STATUS} />
                </TableRow>
              </TableHead>
              <TableBody>
                {sorted.map((row) => (
                  <TableRow key={row.invitationId} data-testid="follow-ups-row">
                    <TableCell sx={{ fontWeight: 600 }}>{row.personName}</TableCell>
                    <TableCell>{row.eventName}</TableCell>
                    <TableCell>
                      {row.scheduledOn ? formatLongDate(row.scheduledOn) : CHASE_NONE}
                    </TableCell>
                    <TableCell>
                      {row.deadline ? formatDeadline(row.deadline) : DEADLINE_UNSET}
                    </TableCell>
                    <TableCell>{row.chasePosition ?? CHASE_NONE}</TableCell>
                    <TableCell>
                      <StatusChip status={row.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Phone: one card per row, per § 7 — no horizontal scrolling. */}
          <Stack sx={{ display: { xs: "flex", md: "none" } }}>
            {sorted.map((row) => (
              <Box
                key={row.invitationId}
                sx={{ p: 2, borderBottom: 1, borderColor: "divider" }}
                data-testid="follow-ups-card"
              >
                <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between" }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {row.personName}
                  </Typography>
                  <StatusChip status={row.status} />
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {row.eventName}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {row.deadline ? formatDeadline(row.deadline) : DEADLINE_UNSET}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {row.chasePosition ?? CHASE_NONE}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}

function StatusChip({ status }: { status: FollowUpStatus }) {
  return (
    <Chip
      size="small"
      color={STATUS_COLOURS[status] ?? "default"}
      label={STATUS_LABELS[status] ?? status}
    />
  );
}
