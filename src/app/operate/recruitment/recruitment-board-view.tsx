"use client";

import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Link from "@mui/material/Link";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { RecruitmentBoardRow, RecruitmentEventColumn } from "@/lib/services/recruitment-board";
import { CONSENT_LABELS, PROSPECT_STATUS_LABELS } from "@/lib/services/recruitment-vocabulary";
import type { Season } from "@/lib/services/seasons";
import {
  BAND_COLOURS,
  BAND_LABEL_INSET_PX,
  BAND_ROW_HEIGHT,
  EVENTS_BAND_COLOUR,
  RECRUIT_COLUMN_WIDTH,
  RECRUITMENT_COLUMNS,
  eventColumns,
  rawValue,
  CONSENT_FILTER_OPTIONS,
  STATUS_FILTER_OPTIONS,
} from "./board-columns";
import {
  applyBoard,
  displayOf,
  NOT_RECORDED,
  type BoardFilters,
  type BoardSort,
} from "./board-data";
import StatusCell from "./status-cell";

function buildUrl(base: string, params: URLSearchParams): string {
  const query = params.toString();
  return query === "" ? base : `${base}?${query}`;
}

/**
 * `/operate/recruitment` — `W1`'s board. Table above `md`, cards below it,
 * from the one dataset the server component already read — modelled on
 * `../roster/roster-board.tsx` (LAN-186).
 */
export default function RecruitmentBoardView({
  season,
  rows,
  events,
  totalInSeason,
  initialSearch,
  initialFilters,
  initialSortKey,
  initialSortDirection,
}: {
  operatorPersonId: string;
  season: Season;
  rows: readonly RecruitmentBoardRow[];
  events: readonly RecruitmentEventColumn[];
  totalInSeason: number;
  initialSearch: string;
  initialFilters: BoardFilters;
  initialSortKey: string | null;
  initialSortDirection: "asc" | "desc";
}) {
  const [search, setSearch] = useState(initialSearch);
  const [filters, setFilters] = useState<BoardFilters>(initialFilters);
  const [sort, setSort] = useState<BoardSort | null>(
    initialSortKey ? { key: initialSortKey, direction: initialSortDirection } : null,
  );

  const columns = useMemo(() => [...RECRUITMENT_COLUMNS, ...eventColumns(events)], [events]);

  const visibleRows = useMemo(
    () => applyBoard(rows, { search, filters, sort }),
    [rows, search, filters, sort],
  );

  function syncUrl(nextSearch: string, nextFilters: BoardFilters, nextSort: BoardSort | null) {
    const params = new URLSearchParams();
    if (nextSearch.trim() !== "") params.set("q", nextSearch.trim());
    for (const [key, value] of Object.entries(nextFilters)) if (value) params.set(key, value);
    if (nextSort) {
      params.set("sort", nextSort.key);
      params.set("dir", nextSort.direction);
    }
    window.history.replaceState(null, "", buildUrl("/operate/recruitment", params));
  }

  function updateFilter(key: string, value: string) {
    const next = { ...filters, [key]: value };
    if (value === "") delete next[key];
    setFilters(next);
    syncUrl(search, next, sort);
  }

  function updateSearch(value: string) {
    setSearch(value);
    syncUrl(value, filters, sort);
  }

  function sortBy(key: string) {
    const next: BoardSort =
      sort?.key === key
        ? { key, direction: sort.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" };
    setSort(next);
    syncUrl(search, filters, next);
  }

  const empty = totalInSeason === 0;

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }} data-testid="recruitment-board">
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ justifyContent: "space-between", alignItems: { sm: "center" }, mb: 2 }}
      >
        <Box>
          <Typography variant="h5" component="h1">
            Recruitment
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {season.label}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5}>
          <Button
            variant="outlined"
            href="/operate/recruitment/qr"
            sx={{ minHeight: 44 }}
            data-testid="recruitment-qr-code-button"
          >
            QR CODE
          </Button>
          <Button
            variant="contained"
            href="/operate/recruitment/new"
            sx={{ minHeight: 44 }}
            data-testid="recruitment-add-button"
          >
            ADD RECRUIT
          </Button>
        </Stack>
      </Stack>

      {empty ? (
        <Paper
          variant="outlined"
          sx={{ p: 4, textAlign: "center" }}
          data-testid="recruitment-board-empty"
        >
          <Typography variant="h6" gutterBottom>
            No recruits yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Recruits arrive through the QR sign-up, a walk-up at an event, or an operator adding one
            by hand.
          </Typography>
          <Stack direction="row" spacing={1.5} sx={{ justifyContent: "center" }}>
            <Button variant="outlined" href="/operate/recruitment/qr" sx={{ minHeight: 44 }}>
              QR CODE
            </Button>
            <Button variant="contained" href="/operate/recruitment/new" sx={{ minHeight: 44 }}>
              ADD RECRUIT
            </Button>
          </Stack>
        </Paper>
      ) : (
        <>
          <Stack direction="row" spacing={1.5} useFlexGap sx={{ mb: 2, flexWrap: "wrap" }}>
            <TextField
              size="small"
              placeholder="Search by name"
              value={search}
              onChange={(event) => updateSearch(event.target.value)}
              sx={{ minWidth: 220 }}
              data-testid="recruitment-search"
            />
            <Select
              size="small"
              displayEmpty
              value={filters.status ?? ""}
              onChange={(event) => updateFilter("status", event.target.value)}
              sx={{ minWidth: 160 }}
              data-testid="recruitment-filter-status"
            >
              <MenuItem value="">Every status</MenuItem>
              {STATUS_FILTER_OPTIONS.map((value) => (
                <MenuItem key={value} value={value}>
                  {PROSPECT_STATUS_LABELS[value as keyof typeof PROSPECT_STATUS_LABELS]}
                </MenuItem>
              ))}
            </Select>
            <Select
              size="small"
              displayEmpty
              value={filters.consent ?? ""}
              onChange={(event) => updateFilter("consent", event.target.value)}
              sx={{ minWidth: 160 }}
              data-testid="recruitment-filter-consent"
            >
              <MenuItem value="">Every consent</MenuItem>
              {CONSENT_FILTER_OPTIONS.map((value) => (
                <MenuItem key={value} value={value}>
                  {CONSENT_LABELS[value as keyof typeof CONSENT_LABELS]}
                </MenuItem>
              ))}
            </Select>
            <Select
              size="small"
              displayEmpty
              value={filters.personalSent ?? ""}
              onChange={(event) => updateFilter("personalSent", event.target.value)}
              sx={{ minWidth: 170 }}
              data-testid="recruitment-filter-personal-sent"
            >
              <MenuItem value="">Personal sent — any</MenuItem>
              <MenuItem value="yes">Personal sent</MenuItem>
              <MenuItem value="no">Personal not sent</MenuItem>
            </Select>
            <Select
              size="small"
              displayEmpty
              value={filters.recruitmentSent ?? ""}
              onChange={(event) => updateFilter("recruitmentSent", event.target.value)}
              sx={{ minWidth: 190 }}
              data-testid="recruitment-filter-recruitment-sent"
            >
              <MenuItem value="">Recruitment sent — any</MenuItem>
              <MenuItem value="yes">Recruitment sent</MenuItem>
              <MenuItem value="no">Recruitment not sent</MenuItem>
            </Select>
            <Select
              size="small"
              displayEmpty
              value={filters.attendedAnyEvent ?? ""}
              onChange={(event) => updateFilter("attendedAnyEvent", event.target.value)}
              sx={{ minWidth: 190 }}
              data-testid="recruitment-filter-attended"
            >
              <MenuItem value="">Attended an event — any</MenuItem>
              <MenuItem value="yes">Attended an event</MenuItem>
              <MenuItem value="no">Never attended</MenuItem>
            </Select>
          </Stack>

          {/* Desktop: the table. */}
          <TableContainer
            component={Paper}
            variant="outlined"
            sx={{ display: { xs: "none", md: "block" }, maxHeight: "72vh" }}
          >
            <Table stickyHeader size="small" data-testid="recruitment-board-table">
              <TableHead>
                <TableRow sx={{ height: BAND_ROW_HEIGHT }}>
                  <TableCell
                    sx={{
                      position: "sticky",
                      left: 0,
                      zIndex: 3,
                      bgcolor: BAND_COLOURS.person.header,
                    }}
                  />
                  <TableCell
                    colSpan={RECRUITMENT_COLUMNS.filter((c) => c.band === "person").length}
                    sx={{
                      bgcolor: BAND_COLOURS.person.header,
                      color: "#fff",
                      pl: `${BAND_LABEL_INSET_PX}px`,
                    }}
                  >
                    Person
                  </TableCell>
                  <TableCell
                    colSpan={RECRUITMENT_COLUMNS.filter((c) => c.band === "recruitment").length}
                    sx={{
                      bgcolor: BAND_COLOURS.recruitment.header,
                      color: "#fff",
                      pl: `${BAND_LABEL_INSET_PX}px`,
                    }}
                  >
                    Recruitment
                  </TableCell>
                  {events.map((event) => (
                    <TableCell
                      key={event.eventId}
                      colSpan={2}
                      sx={{
                        bgcolor: EVENTS_BAND_COLOUR.header,
                        color: "#fff",
                        pl: `${BAND_LABEL_INSET_PX}px`,
                      }}
                    >
                      {event.name}
                      {event.date ? ` · ${event.date}` : ""}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell
                    onClick={() => sortBy("displayName")}
                    sx={{
                      position: "sticky",
                      left: 0,
                      zIndex: 3,
                      bgcolor: "background.paper",
                      minWidth: RECRUIT_COLUMN_WIDTH,
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                  >
                    Recruit
                  </TableCell>
                  {columns.map((column) => (
                    <TableCell
                      key={column.key}
                      onClick={column.sortable ? () => sortBy(column.key) : undefined}
                      sx={{
                        minWidth: column.width,
                        cursor: column.sortable ? "pointer" : undefined,
                      }}
                    >
                      {column.label}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {visibleRows.map((row) => (
                  <TableRow
                    key={row.prospectId}
                    hover
                    data-testid={`recruitment-row-${row.prospectId}`}
                  >
                    <TableCell
                      sx={{ position: "sticky", left: 0, zIndex: 1, bgcolor: "background.paper" }}
                    >
                      <Link href={`/operate/recruitment/${row.prospectId}`} underline="hover">
                        {row.displayName}
                      </Link>
                    </TableCell>
                    {columns.map((column) => (
                      <TableCell key={column.key}>
                        {column.key === "status" ? (
                          <StatusCell
                            prospectId={row.prospectId}
                            status={row.status}
                            displayName={row.displayName}
                            seasonLabel={season.label}
                          />
                        ) : column.key === "consent" ? (
                          CONSENT_LABELS[row.consent]
                        ) : column.edit === "record" ? (
                          // `W1`: "routes to the person record on click, exactly as the
                          // roster board's person columns do" — and the roster board's
                          // own person-fact cells route to that row's own record page,
                          // not to a bare `/operate/people/[personId]`, so this does too.
                          <Link
                            href={`/operate/recruitment/${row.prospectId}`}
                            underline="hover"
                            color={
                              rawValue(row, column.key) === null ? "text.disabled" : "text.primary"
                            }
                          >
                            {displayOf(rawValue(row, column.key))}
                          </Link>
                        ) : (
                          displayOf(rawValue(row, column.key))
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Mobile: cards — the roster board's own idiom (LAN-186): a static
              chip, never in-cell editing, and voice call as its own,
              separately tappable control. Editing is desktop work. */}
          <Stack spacing={1.5} sx={{ display: { xs: "flex", md: "none" } }}>
            {visibleRows.map((row) => (
              <RecruitCard key={row.prospectId} row={row} />
            ))}
          </Stack>
        </>
      )}
    </Box>
  );
}

/**
 * The phone card — `W1-01`'s own approved mockup, and `../roster/roster-board.tsx`'s
 * `PlayerCard` (LAN-186, item 15) it is modelled on: the whole card is one
 * tap target opening the record, a static status chip (never an in-cell
 * edit — that is desktop work), and voice call as its own separate control.
 * The call button is a sibling of the card-opening anchor, never nested
 * inside it — two anchors cannot nest, and stacking this one on top by
 * position rather than by DOM order is what keeps both tap targets
 * independently real, with `stopPropagation` on both so a call can never
 * fire from a tap meant for the card and a card navigation can never fire
 * from a tap meant for the call.
 */
function RecruitCard({ row }: { row: RecruitmentBoardRow }) {
  return (
    <Card
      variant="outlined"
      sx={{ position: "relative", p: 0 }}
      data-testid={`recruitment-card-${row.prospectId}`}
    >
      <Box
        component="a"
        href={`/operate/recruitment/${row.prospectId}`}
        data-testid="recruitment-card-open"
        sx={{
          display: "block",
          p: 2,
          pr: 8,
          minHeight: 44,
          textDecoration: "none",
          color: "inherit",
          borderRadius: 1,
          "&:hover": { bgcolor: "action.hover" },
          "&:focus-visible": {
            outline: "2px solid",
            outlineColor: "primary.main",
            outlineOffset: -2,
          },
        }}
      >
        <Stack spacing={1}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            {row.displayName}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
            <Chip size="small" label={PROSPECT_STATUS_LABELS[row.status]} />
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {row.college ?? NOT_RECORDED} · {CONSENT_LABELS[row.consent]}
          </Typography>
        </Stack>
      </Box>

      <Box
        sx={{ position: "absolute", top: 8, right: 8 }}
        onClick={(event) => event.stopPropagation()}
      >
        <Button
          variant="contained"
          component="a"
          href={row.phoneForCall ? `tel:${row.phoneForCall}` : undefined}
          disabled={!row.phoneForCall}
          aria-label="Call"
          onClick={(event) => event.stopPropagation()}
          sx={{
            minHeight: 44,
            minWidth: 44,
            width: 44,
            height: 44,
            p: 0,
            borderRadius: "50%",
          }}
        >
          <PhoneIcon />
        </Button>
      </Box>
    </Card>
  );
}

/** Drawn inline, the same reason `../roster/roster-board.tsx`'s own `PhoneIcon` is: no icon package in this dependency tree. */
function PhoneIcon() {
  return (
    <Box component="svg" viewBox="0 0 24 24" aria-hidden sx={{ width: 18, height: 18 }}>
      <path
        fill="currentColor"
        d="M6.6 10.8c1.4 2.7 3.6 4.9 6.3 6.3l2.1-2.1c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.5.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.4 21 3 13.6 3 4.5c0-.6.4-1 1-1h3.6c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.5.1.4 0 .8-.2 1L6.6 10.8z"
      />
    </Box>
  );
}
