import { EmptyState } from "@/components/empty-state";
import Stack from "@mui/material/Stack";
import { isServiceError } from "@/lib/db";
import { todayInClubZone } from "@/lib/club-time";
import { EVENT_PERIODS, periodBounds, type EventPeriod } from "@/lib/services/event-periods";
import { countPeople, readFollowUpsQueue, type FollowUpEvent } from "@/lib/services/follow-ups";
import { UnavailableScreen } from "@/app/operate/unavailable";
import { gateShellPage } from "../../gate";
import AdminPageHeading from "../page-heading";
import FollowUpsFilter from "./follow-ups-filter";
import FollowUpsTable from "./follow-ups-table";
import FollowUpsCards from "./follow-ups-cards";
import {
  currentTermBounds,
  dayParam,
  flatten,
  isFollowUpsSort,
  sortFilteredRows,
  type FollowUpsFilters,
} from "./queue-filters";
import { EMPTY_QUEUE, PAGE_HEADING, subheading } from "./presentation";

const FOLLOW_UPS_PATH = "/operate/admin/follow-ups";

// The Follow-ups queue — W5.
export default async function FollowUpsPage({
  searchParams,
}: PageProps<"/operate/admin/follow-ups">) {
  const gate = await gateShellPage("/operate/admin/follow-ups");
  if ("screen" in gate) return gate.screen;

  const query = await searchParams;
  const search = typeof query.q === "string" ? query.q : "";
  const status = typeof query.status === "string" ? query.status : "";
  const rawPeriod = typeof query.period === "string" ? query.period : "";
  // OWNER-LAN173-05: unrecognised/absent period resolves to All events, never "This month".
  const period: EventPeriod = (EVENT_PERIODS as readonly string[]).includes(rawPeriod)
    ? (rawPeriod as EventPeriod)
    : "all";
  const from = dayParam(query.from);
  const to = dayParam(query.to);
  const rawSort = typeof query.sort === "string" ? query.sort : "";
  const sort = isFollowUpsSort(rawSort) ? rawSort : "";
  const rawDirection = typeof query.dir === "string" ? query.dir : "";
  const direction = rawDirection === "desc" ? "desc" : rawDirection === "asc" ? "asc" : "";
  const filters: FollowUpsFilters = { search, status, period, from, to, sort, direction };

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
  const sorted = sortFilteredRows(rows, filters, bounds);

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
        from={from}
        to={to}
        sort={sort}
        direction={direction}
      />

      {sorted.length === 0 ? (
        <EmptyState
          testId="follow-ups-empty"
          title={rows.length === 0 ? EMPTY_QUEUE : "No one matches this search."}
          searched={rows.length > 0 ? search : undefined}
          action={rows.length > 0 ? { href: FOLLOW_UPS_PATH, label: "Clear filters" } : undefined}
        />
      ) : (
        <>
          <FollowUpsTable filters={filters} rows={sorted} />
          <FollowUpsCards rows={sorted} />
        </>
      )}
    </Stack>
  );
}
