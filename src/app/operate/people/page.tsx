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
import { mayEditRoster, mayViewRoster, ROSTER_REACH } from "@/lib/auth/roster-access";
import type { PersonListEntry } from "@/lib/services/people-directory";

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/**
 * `W1-01` … `W1-04` — the People list, its search, its two empty states and
 * the widened (outside-season) view. LAN-184, `REQ-person-record`.
 */
export default async function PeoplePage({ searchParams }: PageProps<"/operate/people">) {
  // LAN-432: People follows the roster's grants (Brian, 2026-09-25). Anyone
  // who reaches the roster reaches the list; with None on Person a row is the
  // name alone, and nothing of Person is filtered, sorted or sent.
  const gate = await gateShellPage("/operate/people", ROSTER_REACH);
  if ("screen" in gate) return gate.screen;
  const personVisible = mayViewRoster(gate.operator.grants, "person");
  const mayAdd = mayEditRoster(gate.operator.grants, "person");

  const params = await searchParams;
  const search = first(params.q);
  const status = personVisible ? first(params.status) : "";
  const missingOnly = personVisible && first(params.missing) === "yes";
  const sort = (personVisible ? first(params.sort) : "") || DEFAULT_PEOPLE_SORT;
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

  const entries = personVisible ? list.entries : list.entries.map(nameOnly);
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
          entries.length > 0 ? (
            <>
              {mayAdd ? (
                <Button variant="contained" href="/operate/people/new">
                  Add a person
                </Button>
              ) : null}
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
        sortColumns={personVisible ? PEOPLE_SORT_OPTIONS : PEOPLE_SORT_OPTIONS.slice(0, 1)}
        nameOnly={!personVisible}
        search={search}
        status={status}
        missingOnly={missingOnly}
        sort={sort}
        direction={direction}
      />

      {entries.length === 0 ? (
        <EmptyPeople scope={scope} filtered={filtered} outsideHref={outsideHref} mayAdd={mayAdd} />
      ) : (
        <>
          <PeopleTable
            entries={entries}
            sort={sort}
            direction={direction}
            query={params}
            nameOnly={!personVisible}
          />
          <PeopleCards entries={entries} />
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
  mayAdd,
}: {
  scope: PeopleScope;
  filtered: boolean;
  outsideHref: string;
  /** Person at `edit` (LAN-432). */
  mayAdd: boolean;
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
          {mayAdd ? (
            <Button variant="outlined" href="/operate/people/new" sx={{ minHeight: 44 }}>
              Add a person
            </Button>
          ) : null}
        </Stack>
      }
    />
  );
}

/**
 * A row as a seat with None on Person receives it — LAN-432: the name and the
 * id that opens the record, and nothing else of the person.
 */
function nameOnly(entry: PersonListEntry): PersonListEntry {
  return {
    personId: entry.personId,
    displayName: entry.displayName,
    matchedAlias: null,
    status: null,
    clubRoleSummary: null,
    hasMobile: false,
    hasPersonalEmail: false,
    missingRequiredFields: [],
  };
}
