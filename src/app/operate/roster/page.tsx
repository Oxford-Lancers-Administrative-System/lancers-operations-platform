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
import {
  DEFAULT_ROSTER_SORT,
  listCurrentSeasonRoster,
  ROSTER_SORT_COLUMNS,
  type Roster,
  type RosterEntry,
} from "@/lib/services/membership";
import { gateShellPage } from "../gate";
import RosterFilters from "./roster-filters";
import {
  describeOnboarding,
  ENTRY_LABELS,
  FILTERABLE_ENTRIES,
  FILTERABLE_MEMBERSHIP_STATUSES,
  labelFor,
  MEMBERSHIP_STATUS_LABELS,
  membershipStatusColour,
} from "./presentation";

/**
 * UX-20 — the current season's roster — and UX-23, its filter-empty state.
 * LAN-75.
 *
 * ## A wide command view, not a stretched phone layout
 *
 * Brian's 12 August 2026 roster decision, recorded on LAN-90 and repeated in
 * LAN-75's own acceptance criteria, is explicit: at desktop width this is "a
 * wide operational table or grid with filtering, sorting, clear row separation,
 * and visible membership/status indicators", and it "may not merely stretch
 * phone cards across a wider screen". So the desktop presentation is a real
 * table with sortable headers, and the phone presentation is a separate set of
 * cards — the same memberships, the same facts, a different shape.
 *
 * At 375px the approved boundary is narrower on purpose: "roster summary and
 * player lookup", not the full committee scanning workflow. The cards therefore
 * lead with the name and carry status, entry and onboarding as chips, and the
 * one search box is the entry point. Nothing an operator needs to *find*
 * somebody is missing; the dense comparison stays on the desktop, where it was
 * approved to live.
 *
 * ## Two empty states, and why they are not one
 *
 * The shared state contract requires filter-empty and system-empty to be
 * distinguished, because the recovery differs: clear the filters, or enter the
 * first returner. UX-23 is the first of those. `totalInSeason` tells them
 * apart and is counted in the same transaction as the list, so the screen can
 * never claim "no memberships match" about a season that has none at all.
 *
 * ## What this screen deliberately does not do
 *
 * No inline editing, no saved views, no bulk actions and no export — all four
 * are LAN-103's, and the acceptance criteria require that none of them leak in
 * here. Selecting a row opens the membership record, which is where every
 * change in this slice is made.
 */

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/** The sort choices, as the phone control needs them. */
const SORT_OPTIONS: readonly { value: string; label: string }[] = Object.freeze([
  { value: "name", label: "Name" },
  { value: "status", label: "Status" },
  { value: "entry", label: "Entry" },
  { value: "onboarding", label: "Onboarding" },
]);

export default async function RosterPage({ searchParams }: PageProps<"/operate/roster">) {
  const gate = await gateShellPage("/operate/roster");
  if ("screen" in gate) return gate.screen;

  const params = await searchParams;
  const search = first(params.q);
  const status = first(params.status);
  const entry = first(params.entry);
  const sort = first(params.sort) || DEFAULT_ROSTER_SORT;
  const direction = first(params.dir) || ROSTER_SORT_COLUMNS[sort]?.default || "asc";
  const filtered = search !== "" || status !== "" || entry !== "";

  let roster: Roster;
  try {
    roster = await listCurrentSeasonRoster({ search, status, entry, sort, direction });
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return (
      <Stack spacing={2} sx={{ maxWidth: 720 }}>
        <Typography variant="h6" component="h1">
          Roster
        </Typography>
        <Alert severity="warning" data-testid="roster-unavailable">
          {error.message}
        </Alert>
      </Stack>
    );
  }

  const countLabel = `${roster.totalInSeason} ${
    roster.totalInSeason === 1 ? "membership" : "memberships"
  }`;

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ alignItems: { sm: "flex-start" }, justifyContent: "space-between" }}
      >
        <Box>
          <Typography variant="h6" component="h1">
            Roster
          </Typography>
          <Typography variant="body2" color="text.secondary" data-testid="season-label">
            {`Season ${roster.season.label} · ${countLabel}`}
          </Typography>
        </Box>
        {/*
          Only when there is a roster to stand beside. Both empty states carry
          this action themselves — UX-23 puts it next to "Clear filters" — and
          rendering it in the header as well would put the same primary action
          on one screen twice, two inches apart.
        */}
        {roster.entries.length > 0 ? (
          <Button variant="contained" href="/operate/roster/new" sx={{ minHeight: 44 }}>
            Add player
          </Button>
        ) : null}
      </Stack>

      <RosterFilters
        statuses={FILTERABLE_MEMBERSHIP_STATUSES}
        entries={FILTERABLE_ENTRIES}
        sortColumns={SORT_OPTIONS}
        search={search}
        status={status}
        entry={entry}
        sort={sort}
        direction={direction}
      />

      {roster.entries.length === 0 ? (
        <EmptyRoster filtered={filtered} />
      ) : (
        <>
          {/* Desktop: the wide command view Brian approved. */}
          <TableContainer
            component={Paper}
            variant="outlined"
            sx={{ display: { xs: "none", md: "block" } }}
          >
            <Table size="small" aria-label="Roster">
              <TableHead>
                <TableRow>
                  <SortableHeader
                    column="name"
                    label="Member"
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
                    column="entry"
                    label="Entry"
                    sort={sort}
                    direction={direction}
                    query={params}
                  />
                  <TableCell>Email</TableCell>
                  <TableCell>Phone</TableCell>
                  <SortableHeader
                    column="onboarding"
                    label="Onboarding"
                    sort={sort}
                    direction={direction}
                    query={params}
                  />
                </TableRow>
              </TableHead>
              <TableBody>
                {roster.entries.map((member) => (
                  <TableRow key={member.membershipId} hover data-testid="roster-row">
                    <TableCell>
                      {/*
                        `textTransform: none` because MUI upper-cases button
                        text by default, and a person's name is not a label —
                        "DASHIELL ASHCOMBE-VALE" is not how the club writes it,
                        and it destroys the capitalisation that tells a
                        first-name-only record apart from a full one.
                      */}
                      <Button
                        href={`/operate/roster/${member.membershipId}`}
                        sx={{
                          textAlign: "left",
                          justifyContent: "flex-start",
                          p: 0,
                          textTransform: "none",
                          fontWeight: 600,
                        }}
                      >
                        {member.displayName}
                      </Button>
                      {member.knownAs ? (
                        <Typography variant="caption" component="p" color="text.secondary">
                          Known as {member.knownAs}
                        </Typography>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={labelFor(MEMBERSHIP_STATUS_LABELS, member.status)}
                        color={membershipStatusColour(member.status)}
                      />
                    </TableCell>
                    <TableCell>{labelFor(ENTRY_LABELS, member.entry)}</TableCell>
                    <TableCell sx={{ maxWidth: 220, overflowWrap: "anywhere" }}>
                      {member.email ?? "—"}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>{member.phone ?? "—"}</TableCell>
                    <TableCell>{describeOnboarding(member)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Phone: summary and lookup, per the approved boundary. */}
          <Stack spacing={2} sx={{ display: { xs: "flex", md: "none" } }}>
            {roster.entries.map((member) => (
              <MemberCard key={member.membershipId} member={member} />
            ))}
          </Stack>
        </>
      )}
    </Stack>
  );
}

/**
 * UX-23 when a filter matched nothing, and a different sentence when the season
 * is genuinely empty.
 *
 * The wireframe's own note says it: "A system-empty roster uses different copy
 * and points to the authorized intake workflow." Both offer the smallest
 * authorized recovery, which is what the shared state contract asks for.
 */
function EmptyRoster({ filtered }: { filtered: boolean }) {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 4 } }}>
      <Stack spacing={2} sx={{ maxWidth: 640 }}>
        <Typography variant="h6" component="h2">
          {filtered ? "No memberships match these filters" : "This season has no memberships yet"}
        </Typography>
        <Typography
          color="text.secondary"
          data-testid={filtered ? "roster-filter-empty" : "roster-empty"}
        >
          {filtered
            ? "The roster is available, but the current search and filter combination returned no results."
            : "Nobody has been entered for this season yet. Start with a returning player."}
        </Typography>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          {filtered ? (
            <Button variant="outlined" href="/operate/roster" sx={{ minHeight: 44 }}>
              Clear filters
            </Button>
          ) : null}
          <Button variant="contained" href="/operate/roster/new" sx={{ minHeight: 44 }}>
            Add player
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}

/**
 * One sortable column header.
 *
 * A link rather than a button: sorting is a different view of the same list, so
 * it belongs in the URL, works with the back button and survives a refresh.
 * Clicking the active column flips its direction; clicking another takes that
 * column's own default, because "A to Z" and "most outstanding first" are each
 * the useful starting point for their own column.
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
    : (ROSTER_SORT_COLUMNS[column]?.default ?? "asc");

  const params = new URLSearchParams();
  for (const key of ["q", "status", "entry"]) {
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
        href={`/operate/roster?${params.toString()}`}
        component="a"
      >
        {label}
      </TableSortLabel>
    </TableCell>
  );
}

/**
 * The phone presentation of one membership.
 *
 * Status, entry and onboarding travel with the name rather than being dropped
 * on the narrow screen: § 7 forbids reflow that removes data needed for the
 * task, and an operator who cannot tell a confirmed member from an active one
 * cannot do the lookup this screen exists for. Contact detail is deliberately
 * not on the card — it is on the record one tap away, and the phone boundary is
 * summary and lookup rather than the full scanning workflow.
 */
function MemberCard({ member }: { member: RosterEntry }) {
  return (
    <Card variant="outlined" data-testid="roster-card">
      <CardActionArea href={`/operate/roster/${member.membershipId}`} sx={{ p: 2 }}>
        <Stack spacing={1}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {member.displayName}
          </Typography>
          {member.knownAs ? (
            <Typography variant="body2" color="text.secondary">
              Known as {member.knownAs}
            </Typography>
          ) : null}
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
            <Chip
              size="small"
              label={labelFor(MEMBERSHIP_STATUS_LABELS, member.status)}
              color={membershipStatusColour(member.status)}
            />
            <Chip size="small" label={labelFor(ENTRY_LABELS, member.entry)} />
            <Chip size="small" variant="outlined" label={describeOnboarding(member)} />
          </Stack>
        </Stack>
      </CardActionArea>
    </Card>
  );
}
