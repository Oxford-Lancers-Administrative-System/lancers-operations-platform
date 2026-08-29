import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
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
  DEFAULT_MISSING_SORT,
  listMissingDataQueue,
  type MissingQueue,
  type PeopleScope,
  type PersonListEntry,
} from "@/lib/services/people-directory";
import { REQUIRED_FIELD_LABELS, type RequiredField } from "@/lib/services/person-required";
import { UnavailableScreen } from "@/app/operate/unavailable";
import { gateShellPage } from "../../gate";
import MissingFilters from "./missing-filters";
import { labelFor, statusColour, STATUS_LABELS } from "../presentation";

/**
 * `W7-01` … `W7-05`, `W7-07` — the missing-data queue. LAN-184,
 * `REQ-missing-queue`.
 *
 * Every person tied to the season in view (or, widened, outside it) with at
 * least one required fact absent, naming which facts per row and never a
 * value. `DEC-w7-07`, drawn deliberately rather than hidden: there is no
 * `refused` or `not applicable` state here, so a departed alumnus with no
 * personal email — `W7-07` — sits in this queue indefinitely until Mission 7
 * builds the state that would retire the row.
 */

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/**
 * Validates the `fact` query param against the real vocabulary rather than
 * trusting a caller's text — the same whitelist discipline `roster.ts`'s
 * `ROSTER_SORT_COLUMNS` uses for `sort`. `REQUIRED_FIELD_LABELS` is the one
 * list of every `RequiredField`, so a new required fact is recognised here
 * without this module naming its own copy of the ten keys.
 */
function isRequiredField(value: string): value is RequiredField {
  return Object.hasOwn(REQUIRED_FIELD_LABELS, value);
}

const SORT_OPTIONS: readonly { value: string; label: string }[] = Object.freeze([
  { value: "missing", label: "How much is missing" },
  { value: "name", label: "Name" },
]);

export default async function MissingDataPage({
  searchParams,
}: PageProps<"/operate/people/missing">) {
  const gate = await gateShellPage("/operate/people/missing", "person_record_authority");
  if ("screen" in gate) return gate.screen;

  const params = await searchParams;
  const search = first(params.q);
  const status = first(params.status);
  const factParam = first(params.fact);
  const fact: RequiredField | null = isRequiredField(factParam) ? factParam : null;
  const sort = first(params.sort) || DEFAULT_MISSING_SORT;
  const direction = first(params.dir) || (sort === "missing" ? "desc" : "asc");
  const scope: PeopleScope = first(params.scope) === "outside" ? "outside_season" : "in_season";
  const filtered = search !== "" || status !== "" || fact !== null;

  let queue: MissingQueue;
  try {
    queue = await listMissingDataQueue({
      scope,
      search,
      status: status || null,
      fact,
      sort,
      direction,
    });
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return (
      <UnavailableScreen
        title="Missing data"
        message={error.message}
        testId="missing-unavailable"
      />
    );
  }

  const basePath = "/operate/people/missing";
  const outsideHref = `${basePath}?scope=outside`;
  const backHref = basePath;
  const totalFactsMissing = queue.entries.reduce(
    (sum, entry) => sum + entry.missingRequiredFields.length,
    0,
  );

  const countLabel = `${queue.totalMissing} of ${queue.totalMissing} ${
    queue.totalMissing === 1 ? "person" : "people"
  }`;
  const subline =
    queue.totalMissing === 0
      ? scope === "in_season"
        ? `Season ${queue.season.label} · nothing missing`
        : `Outside the ${queue.season.label} season · nothing missing`
      : filtered
        ? `${scope === "in_season" ? `Season ${queue.season.label}` : `Outside the ${queue.season.label} season`} · ${queue.entries.length} of ${queue.totalMissing} people · ${totalFactsMissing} facts`
        : `${scope === "in_season" ? `Season ${queue.season.label}` : `Outside the ${queue.season.label} season`} · ${countLabel} · ${totalFactsMissing} facts`;

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ alignItems: { sm: "flex-start" }, justifyContent: "space-between" }}
      >
        <Box>
          <Typography variant="h6" component="h1">
            Missing data
          </Typography>
          <Typography variant="body2" color="text.secondary" data-testid="missing-scope-label">
            {subline}
          </Typography>
        </Box>
        {queue.entries.length > 0 || queue.totalMissing === 0 ? (
          scope === "in_season" ? (
            <Button variant="outlined" href={outsideHref} sx={{ minHeight: 44 }}>
              See people outside this season
            </Button>
          ) : (
            <Button variant="outlined" href={backHref} sx={{ minHeight: 44 }}>
              Back to this season
            </Button>
          )
        ) : null}
      </Stack>

      <MissingFilters
        basePath={basePath}
        scope={scope}
        sortColumns={SORT_OPTIONS}
        search={search}
        status={status}
        fact={fact ?? ""}
        sort={sort}
        direction={direction}
      />

      {queue.entries.length === 0 ? (
        <EmptyQueue totalMissing={queue.totalMissing} scope={scope} outsideHref={outsideHref} />
      ) : (
        <>
          <TableContainer
            component={Paper}
            variant="outlined"
            sx={{ display: { xs: "none", md: "block" } }}
          >
            <Table size="small" aria-label="Missing data">
              <TableHead>
                <TableRow>
                  <SortableHeader
                    column="name"
                    label="Name"
                    sort={sort}
                    direction={direction}
                    query={params}
                  />
                  <TableCell>Status</TableCell>
                  <TableCell>To the club</TableCell>
                  <SortableHeader
                    column="missing"
                    label="Missing"
                    sort={sort}
                    direction={direction}
                    query={params}
                  />
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {queue.entries.map((person) => (
                  <QueueRow key={person.personId} person={person} />
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Stack spacing={2} sx={{ display: { xs: "flex", md: "none" } }}>
            {queue.entries.map((person) => (
              <QueueCard key={person.personId} person={person} />
            ))}
          </Stack>
        </>
      )}
    </Stack>
  );
}

/**
 * Two distinguishable outcomes — `W7-04` and `W7-05` — and neither is a
 * failure. Nobody missing anything is a good outcome and says so; a filter
 * matching nothing offers to clear it, matching the roster's own distinction
 * between a filtered empty and a system empty.
 */
function EmptyQueue({
  totalMissing,
  scope,
  outsideHref,
}: {
  totalMissing: number;
  scope: PeopleScope;
  outsideHref: string;
}) {
  const nothingMissingAtAll = totalMissing === 0;

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 4 } }}>
      <Stack spacing={2} sx={{ maxWidth: 640 }}>
        <Typography variant="h6" component="h2">
          {nothingMissingAtAll ? "Every required fact is recorded" : "Nobody matches these filters"}
        </Typography>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          data-testid={nothingMissingAtAll ? "missing-empty" : "missing-filter-empty"}
        >
          {nothingMissingAtAll ? (
            scope === "in_season" ? (
              <Button variant="contained" href={outsideHref} sx={{ minHeight: 44 }}>
                See people outside this season
              </Button>
            ) : null
          ) : (
            <Button
              variant="outlined"
              href={
                scope === "in_season"
                  ? "/operate/people/missing"
                  : "/operate/people/missing?scope=outside"
              }
              sx={{ minHeight: 44 }}
            >
              Clear filters
            </Button>
          )}
        </Stack>
      </Stack>
    </Paper>
  );
}

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
    : column === "missing"
      ? "desc"
      : "asc";

  const params = new URLSearchParams();
  for (const key of ["q", "status", "fact", "scope"]) {
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
        href={`/operate/people/missing?${params.toString()}`}
        component="a"
      >
        {label}
      </TableSortLabel>
    </TableCell>
  );
}

/** A row names which facts are absent — the queue shows an absence, never a value. */
function GapsCell({ person }: { person: PersonListEntry }) {
  return (
    <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
      {person.missingRequiredFields.map((field) => (
        <Chip
          key={field}
          size="small"
          variant="outlined"
          color="warning"
          label={REQUIRED_FIELD_LABELS[field]}
        />
      ))}
    </Stack>
  );
}

function QueueRow({ person }: { person: PersonListEntry }) {
  return (
    <TableRow hover data-testid="missing-row">
      <TableCell>
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
      </TableCell>
      <TableCell>
        {person.status === null ? (
          <Typography color="text.secondary">—</Typography>
        ) : (
          <Chip
            size="small"
            label={labelFor(STATUS_LABELS, person.status)}
            color={statusColour(person.status)}
          />
        )}
      </TableCell>
      <TableCell>
        {person.clubRoleSummary ?? <Typography color="text.secondary">—</Typography>}
      </TableCell>
      <TableCell>
        <GapsCell person={person} />
      </TableCell>
      <TableCell>
        {/* LAN-185 builds `/operate/people/[personId]/edit`; this routes to
            correction and, once that surface writes a redirect back here, will
            return the operator to the next row — `W7`'s own handoff. */}
        <Button
          variant="outlined"
          size="small"
          href={`/operate/people/${person.personId}/edit?from=missing`}
          sx={{ minHeight: 36 }}
        >
          Correct
        </Button>
      </TableCell>
    </TableRow>
  );
}

function QueueCard({ person }: { person: PersonListEntry }) {
  return (
    <Card variant="outlined" data-testid="missing-card" sx={{ p: 2 }}>
      <Stack spacing={1}>
        <Button
          href={`/operate/people/${person.personId}`}
          sx={{
            textAlign: "left",
            justifyContent: "flex-start",
            p: 0,
            textTransform: "none",
            fontWeight: 700,
          }}
        >
          {person.displayName}
        </Button>
        <Typography variant="caption" color="text.secondary">
          {person.clubRoleSummary ?? "—"}
        </Typography>
        <GapsCell person={person} />
        <Box>
          <Button
            variant="outlined"
            size="small"
            href={`/operate/people/${person.personId}/edit?from=missing`}
            sx={{ minHeight: 44 }}
          >
            Correct
          </Button>
        </Box>
      </Stack>
    </Card>
  );
}
