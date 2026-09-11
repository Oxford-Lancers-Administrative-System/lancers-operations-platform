import { StatusChip } from "@/components/status-chip";
import { NotRecorded } from "@/components/fact";
import { DesktopOnly } from "@/components/row-card";
import { SortableHeader, TableFrame } from "@/components/sortable-header";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import type { PersonListEntry } from "@/lib/services/people-directory";
import { labelFor, personType, PERSON_TYPE_LABELS, STATUS_LABELS } from "./presentation";

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/**
 * One sortable column header — the roster's own `SortableHeader`, carrying
 * `q`, `status`, `missing` and `scope` through so a sort never drops a filter
 * or silently returns to the season in view.
 */
function PeopleSortableHeader({
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
    <SortableHeader
      column={column}
      label={label}
      active={active}
      direction={active && direction === "desc" ? "desc" : "asc"}
      href={`/operate/people?${params.toString()}`}
    />
  );
}

function StatusCell({ status }: { status: PersonListEntry["status"] }) {
  if (status === null) return <NotRecorded />;
  return (
    <StatusChip
      domain={status === "recruit" ? "personType" : "membership"}
      status={status}
      label={labelFor(STATUS_LABELS, status)}
    />
  );
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
    return <NotRecorded />;
  }
  return (
    <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
      {person.hasMobile ? <Typography variant="caption">Mobile</Typography> : null}
      {person.hasPersonalEmail ? <Typography variant="caption">Email</Typography> : null}
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
    return <Typography variant="body2">0</Typography>;
  }
  const count = person.missingRequiredFields.length;
  return (
    <Button
      href={`/operate/people/missing?q=${encodeURIComponent(person.displayName)}`}
      sx={{ p: 0, minHeight: 0, textTransform: "none" }}
    >
      <Typography
        component="span"
        variant="body2"
        color="warning.main"
      >{`${count} missing`}</Typography>
    </Button>
  );
}

/** Finding 8, Brian 2026-09-01 — the right-hand, sortable Player/Recruit column. */
function TypeCell({ status }: { status: PersonListEntry["status"] }) {
  const type = personType(status);
  return (
    <StatusChip
      domain="personType"
      status={type}
      label={PERSON_TYPE_LABELS[type]}
      testId="person-type-chip"
    />
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
      <TableCell>{person.clubRoleSummary ?? <NotRecorded />}</TableCell>
      <TableCell>
        <ContactableCell person={person} />
      </TableCell>
      <TableCell>
        <MissingCell person={person} />
      </TableCell>
      <TableCell>
        <TypeCell status={person.status} />
      </TableCell>
    </TableRow>
  );
}

export const PEOPLE_SORT_OPTIONS: readonly { value: string; label: string }[] = Object.freeze([
  { value: "name", label: "Name" },
  { value: "status", label: "Status" },
  { value: "club", label: "To the club" },
  { value: "contactable", label: "Contactable" },
  { value: "missing", label: "Missing" },
  // Finding 8, Brian 2026-09-01, positioned last — sortable through the
  // identical SortableHeader/query-param mechanism every other column uses.
  { value: "type", label: "Type" },
]);

/** Desktop: the People table, sortable columns wired to the page's own query keys. */
export default function PeopleTable({
  entries,
  sort,
  direction,
  query,
}: {
  entries: readonly PersonListEntry[];
  sort: string;
  direction: string;
  query: Record<string, string | string[] | undefined>;
}) {
  return (
    <DesktopOnly>
      <TableFrame>
        <Table size="small" aria-label="People">
          <TableHead>
            <TableRow>
              <PeopleSortableHeader
                column="name"
                label="Name"
                sort={sort}
                direction={direction}
                query={query}
              />
              <PeopleSortableHeader
                column="status"
                label="Status"
                sort={sort}
                direction={direction}
                query={query}
              />
              <PeopleSortableHeader
                column="club"
                label="To the club"
                sort={sort}
                direction={direction}
                query={query}
              />
              <PeopleSortableHeader
                column="contactable"
                label="Contactable"
                sort={sort}
                direction={direction}
                query={query}
              />
              <PeopleSortableHeader
                column="missing"
                label="Missing"
                sort={sort}
                direction={direction}
                query={query}
              />
              <PeopleSortableHeader
                column="type"
                label="Type"
                sort={sort}
                direction={direction}
                query={query}
              />
            </TableRow>
          </TableHead>
          <TableBody>
            {entries.map((person) => (
              <PersonRow key={person.personId} person={person} />
            ))}
          </TableBody>
        </Table>
      </TableFrame>
    </DesktopOnly>
  );
}
