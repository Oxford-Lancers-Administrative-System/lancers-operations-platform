import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { isServiceError } from "@/lib/db";
import {
  DEFAULT_PEOPLE_SORT,
  listPeople,
  type PeopleList,
  type PeopleScope,
} from "@/lib/services/people-directory";
import { UnavailableScreen } from "@/app/operate/unavailable";
import { gateShellPage } from "../gate";
import PeopleFilters from "./people-filters";
import PeopleTable, { PEOPLE_SORT_OPTIONS } from "./people-table";
import PeopleCards from "./people-cards";

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/**
 * `W1-01` … `W1-04` — the People list, its search, its two empty states and
 * the widened (outside-season) view. LAN-184, `REQ-person-record`.
 *
 * Decision history: docs/ux/tickets/LAN-184-people-and-missing-queue.md.
 */
export default async function PeoplePage({ searchParams }: PageProps<"/operate/people">) {
  const gate = await gateShellPage("/operate/people", "person_record_authority");
  if ("screen" in gate) return gate.screen;

  const params = await searchParams;
  const search = first(params.q);
  const status = first(params.status);
  const missingOnly = first(params.missing) === "yes";
  const sort = first(params.sort) || DEFAULT_PEOPLE_SORT;
  const direction = first(params.dir) || "asc";
  const scope: PeopleScope = first(params.scope) === "outside" ? "outside_season" : "in_season";
  const filtered = search !== "" || status !== "" || missingOnly;

  let list: PeopleList;
  try {
    list = await listPeople({
      scope,
      search,
      status: status || null,
      missingOnly,
      sort,
      direction,
    });
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return <UnavailableScreen title="People" message={error.message} testId="people-unavailable" />;
  }

  const basePath = "/operate/people";
  const outsideHref = `${basePath}?scope=outside`;
  const backHref = basePath;

  const countLabel = `${list.totalInScope} ${list.totalInScope === 1 ? "person" : "people"}`;
  const subline =
    scope === "in_season"
      ? `Season ${list.season.label} · ${countLabel}`
      : `Outside the ${list.season.label} season · ${countLabel}`;

  return (
    <Stack spacing={3}>
      <PageHeader
        title="People"
        subtitle={<span data-testid="people-scope-label">{subline}</span>}
        actions={
          list.entries.length > 0 ? (
            <>
              <Button variant="contained" href="/operate/people/new">
                Add a person
              </Button>
              <Button variant="outlined" href={scope === "in_season" ? outsideHref : backHref}>
                {scope === "in_season" ? "See people outside this season" : "Back to this season"}
              </Button>
            </>
          ) : undefined
        }
      />

      <PeopleFilters
        basePath={basePath}
        scope={scope}
        sortColumns={PEOPLE_SORT_OPTIONS}
        search={search}
        status={status}
        missingOnly={missingOnly}
        sort={sort}
        direction={direction}
      />

      {list.entries.length === 0 ? (
        <EmptyPeople scope={scope} filtered={filtered} outsideHref={outsideHref} />
      ) : (
        <>
          <PeopleTable entries={list.entries} sort={sort} direction={direction} query={params} />
          <PeopleCards entries={list.entries} />
        </>
      )}
    </Stack>
  );
}

/**
 * Both empty states the shared state contract requires, distinguished by
 * copy: a filter or search matching nobody, versus the season genuinely
 * carrying nobody yet — LAN-184's acceptance: "Both empty states exist and
 * are distinguishable."
 */
function EmptyPeople({
  scope,
  filtered,
  outsideHref,
}: {
  scope: PeopleScope;
  filtered: boolean;
  outsideHref: string;
}) {
  const title = filtered
    ? scope === "in_season"
      ? "Nobody in this season matches these filters"
      : "Nobody outside this season matches these filters"
    : scope === "in_season"
      ? "Nobody has a tie to this season yet"
      : "Every person the club holds is tied to this season";

  return (
    <EmptyState
      title={title}
      actions={
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          data-testid={filtered ? "people-filter-empty" : "people-empty"}
        >
          {filtered ? (
            <Button
              variant="outlined"
              href={scope === "in_season" ? "/operate/people" : "/operate/people?scope=outside"}
              sx={{ minHeight: 44 }}
            >
              Clear search
            </Button>
          ) : null}
          {scope === "in_season" ? (
            <Button variant="contained" href={outsideHref} sx={{ minHeight: 44 }}>
              See people outside this season
            </Button>
          ) : null}
          <Button variant="outlined" href="/operate/people/new" sx={{ minHeight: 44 }}>
            Add a person
          </Button>
        </Stack>
      }
    />
  );
}
