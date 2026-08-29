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
import {
  DEFAULT_PEOPLE_SORT,
  listPeople,
  type PeopleList,
  type PeopleScope,
  type PersonListEntry,
} from "@/lib/services/people-directory";
import { UnavailableScreen } from "@/app/operate/unavailable";
import { gateShellPage } from "../gate";
import PeopleFilters from "./people-filters";
import { labelFor, statusColour, STATUS_LABELS } from "./presentation";

/**
 * `W1-01` … `W1-04` — the People list, its search, its two empty states and
 * the widened (outside-season) view. LAN-184, `REQ-person-record`.
 *
 * The list scopes to the season in view (`DEC-w1-01`): a season membership in
 * any status, a prospect record, a season-scoped role assignment, or a
 * committee-year role paired with that season by its shared label. Widening is
 * deliberate and reversible, per Brian's own ruling that the surface should
 * not sit in the wide view as a mode — it is `?scope=outside`, one link away
 * from the default in both directions.
 *
 * The desktop table and the phone cards render from the same `entries`, the
 * same idiom `roster/page.tsx` already uses, so the two can never drift apart.
 */

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

const SORT_OPTIONS: readonly { value: string; label: string }[] = Object.freeze([
  { value: "name", label: "Name" },
  { value: "status", label: "Status" },
  { value: "club", label: "To the club" },
  { value: "contactable", label: "Contactable" },
  { value: "missing", label: "Missing" },
]);

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
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ alignItems: { sm: "flex-start" }, justifyContent: "space-between" }}
      >
        <Box>
          <Typography variant="h6" component="h1">
            People
          </Typography>
          <Typography variant="body2" color="text.secondary" data-testid="people-scope-label">
            {subline}
          </Typography>
        </Box>
        {/*
          Amendment W1-A3: the header carries Add a person beside the season
          action, in the roster's own position for "Add player". Both hide
          while an empty state is showing — `roster/page.tsx`'s own rule
          against one primary action appearing twice on the same screen.
        */}
        {list.entries.length > 0 ? (
          <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap" }}>
            {scope === "in_season" ? (
              <Button variant="outlined" href={outsideHref} sx={{ minHeight: 44 }}>
                See people outside this season
              </Button>
            ) : (
              <Button variant="outlined" href={backHref} sx={{ minHeight: 44 }}>
                Back to this season
              </Button>
            )}
            {/* LAN-185 builds `/operate/people/new`; this renders the route it owns. */}
            <Button variant="contained" href="/operate/people/new" sx={{ minHeight: 44 }}>
              Add a person
            </Button>
          </Stack>
        ) : null}
      </Stack>

      <PeopleFilters
        basePath={basePath}
        scope={scope}
        sortColumns={SORT_OPTIONS}
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
          <TableContainer
            component={Paper}
            variant="outlined"
            sx={{ display: { xs: "none", md: "block" } }}
          >
            <Table size="small" aria-label="People">
              <TableHead>
                <TableRow>
                  <SortableHeader
                    column="name"
                    label="Name"
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
                  <SortableHeader
                    column="club"
                    label="To the club"
                    sort={sort}
                    direction={direction}
                    query={params}
                  />
                  <SortableHeader
                    column="contactable"
                    label="Contactable"
                    sort={sort}
                    direction={direction}
                    query={params}
                  />
                  <SortableHeader
                    column="missing"
                    label="Missing"
                    sort={sort}
                    direction={direction}
                    query={params}
                  />
                </TableRow>
              </TableHead>
              <TableBody>
                {list.entries.map((person) => (
                  <PersonRow key={person.personId} person={person} />
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Stack spacing={2} sx={{ display: { xs: "flex", md: "none" } }}>
            {list.entries.map((person) => (
              <PersonCard key={person.personId} person={person} />
            ))}
          </Stack>
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
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 4 } }}>
      <Stack spacing={2} sx={{ maxWidth: 640 }}>
        <Typography variant="h6" component="h2">
          {title}
        </Typography>
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
      </Stack>
    </Paper>
  );
}

/**
 * One sortable column header — the roster's own `SortableHeader`, carrying
 * `q`, `status`, `missing` and `scope` through so a sort never drops a filter
 * or silently returns to the season in view.
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
  const next = active ? (direction === "asc" ? "desc" : "asc") : "asc";

  const params = new URLSearchParams();
  for (const key of ["q", "status", "missing", "scope"]) {
    const value = first(query[key]);
    if (value !== "") params.set(key, value);
  }
  params.set("sort", column);
  params.set("dir", next);

  return (
    <TableCell sortDirection={active ? (direction === "asc" ? "asc" : "desc") : false}>
      <TableSortLabel
        active={active}
        direction={active && direction === "desc" ? "desc" : "asc"}
        href={`/operate/people?${params.toString()}`}
        component="a"
      >
        {label}
      </TableSortLabel>
    </TableCell>
  );
}

function StatusCell({ status }: { status: PersonListEntry["status"] }) {
  if (status === null) return <Typography color="text.secondary">—</Typography>;
  return <Chip size="small" label={labelFor(STATUS_LABELS, status)} color={statusColour(status)} />;
}

function NameCell({ person }: { person: PersonListEntry }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Button
        href={`/operate/people/${person.personId}`}
        sx={{
          textAlign: "left",
          justifyContent: "flex-start",
          p: 0,
          textTransform: "none",
          fontWeight: 600,
        }}
      >
        {person.displayName}
      </Button>
      {person.matchedAlias ? (
        <Typography variant="caption" color="text.secondary" component="div">
          matched alias &ldquo;{person.matchedAlias}&rdquo;
        </Typography>
      ) : null}
    </Box>
  );
}

function ContactableCell({ person }: { person: PersonListEntry }) {
  if (!person.hasMobile && !person.hasPersonalEmail) {
    return <Typography color="text.secondary">—</Typography>;
  }
  return (
    <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
      {person.hasMobile ? <Chip size="small" variant="outlined" label="Mobile" /> : null}
      {person.hasPersonalEmail ? <Chip size="small" variant="outlined" label="Email" /> : null}
    </Stack>
  );
}

/**
 * Amendment `W1-A1`: the count is the route an operator falls into — they are
 * looking at somebody and click the number beside them. Scoped to this
 * person's name so the queue they land on shows exactly this row.
 */
function MissingCell({ person }: { person: PersonListEntry }) {
  if (person.missingRequiredFields.length === 0) {
    return <Typography color="text.secondary">—</Typography>;
  }
  const count = person.missingRequiredFields.length;
  return (
    <Button
      href={`/operate/people/missing?q=${encodeURIComponent(person.displayName)}`}
      sx={{ p: 0, minHeight: 0, textTransform: "none" }}
    >
      <Chip size="small" variant="outlined" color="warning" label={`${count} missing`} />
    </Button>
  );
}

function PersonRow({ person }: { person: PersonListEntry }) {
  return (
    <TableRow hover data-testid="people-row">
      <TableCell>
        <NameCell person={person} />
      </TableCell>
      <TableCell>
        <StatusCell status={person.status} />
      </TableCell>
      <TableCell>
        {person.clubRoleSummary ?? <Typography color="text.secondary">—</Typography>}
      </TableCell>
      <TableCell>
        <ContactableCell person={person} />
      </TableCell>
      <TableCell>
        <MissingCell person={person} />
      </TableCell>
    </TableRow>
  );
}

function PersonCard({ person }: { person: PersonListEntry }) {
  return (
    <Card variant="outlined" data-testid="people-card">
      <CardActionArea href={`/operate/people/${person.personId}`} sx={{ p: 2 }}>
        <Stack spacing={1}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {person.displayName}
          </Typography>
          {person.matchedAlias ? (
            <Typography variant="caption" color="text.secondary">
              matched alias &ldquo;{person.matchedAlias}&rdquo;
            </Typography>
          ) : null}
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
            {person.status !== null ? (
              <Chip
                size="small"
                label={labelFor(STATUS_LABELS, person.status)}
                color={statusColour(person.status)}
              />
            ) : null}
            {person.clubRoleSummary ? (
              <Chip size="small" variant="outlined" label={person.clubRoleSummary} />
            ) : null}
            {person.missingRequiredFields.length > 0 ? (
              <Chip
                size="small"
                variant="outlined"
                color="warning"
                label={`${person.missingRequiredFields.length} missing`}
              />
            ) : null}
          </Stack>
        </Stack>
      </CardActionArea>
    </Card>
  );
}
