"use client";

import { useCallback, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Drawer from "@mui/material/Drawer";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
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
import TableSortLabel from "@mui/material/TableSortLabel";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { RecruitmentBoardRow, RecruitmentEventColumn } from "@/lib/services/recruitment-board";
import {
  ATTENDANCE_LABEL,
  CONSENT_LABELS,
  PROSPECT_STATUS_LABELS,
  RSVP_LABEL,
} from "@/lib/services/recruitment-vocabulary";
import type { Season } from "@/lib/services/seasons";
import {
  bandBoundaryKeys,
  ColumnFilterMenu,
  FilterButton,
  groupRuns,
  StatusPill,
} from "../board-filter-controls";
import {
  BAND_LABEL_INSET_PX,
  BAND_ROW_HEIGHT,
  bandColour,
  eventIdOfBand,
  RECRUIT_COLUMN_WIDTH,
  RECRUITMENT_COLUMNS,
  eventColumns,
  rawValue,
  type ColumnDef,
} from "./board-columns";
import {
  applyBoard,
  displayOf,
  filterOptionLabel,
  filterOptions,
  NOT_RECORDED,
  optionListLabel,
  type BoardFilters,
  type BoardSort,
} from "./board-data";
import StatusCell from "./status-cell";
import { STATUS_COLOUR_FOR_PILL } from "./status-colour";

function buildUrl(base: string, params: URLSearchParams): string {
  const query = params.toString();
  return query === "" ? base : `${base}?${query}`;
}

/**
 * `/operate/recruitment` — `W1`'s board, reworked (2026-09-02 correction).
 * Table above `md`, cards below it, from the one dataset the server
 * component already read — built on the same shared header, filter and
 * status-pill machinery `../roster/roster-board.tsx` (LAN-186) itself now
 * imports (`../board-filter-controls.tsx`), not a lookalike of it. Brian,
 * 2026-09-02: "How we did it for the roster should be the same language,
 * the same UI elements, and the same thing should be identical here."
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
  const [menu, setMenu] = useState<{ anchor: HTMLElement; column: ColumnDef } | null>(null);
  const [phoneFilters, setPhoneFilters] = useState(false);

  const columns = useMemo(() => [...RECRUITMENT_COLUMNS, ...eventColumns(events)], [events]);
  const eventByBand = useMemo(
    () => new Map(events.map((event) => [event.eventId, event])),
    [events],
  );
  const bandBoundaries = useMemo(() => bandBoundaryKeys(columns), [columns]);

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

  const setFilter = useCallback(
    (key: string, value: string) => {
      const next = { ...filters, [key]: value };
      if (value === "") delete next[key];
      setFilters(next);
      syncUrl(search, next, sort);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters, search, sort],
  );

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

  const clearAll = () => {
    setSearch("");
    setFilters({});
    setSort(null);
    syncUrl("", {}, null);
  };

  const activeFilters = Object.entries(filters).filter(([, value]) => value !== "");

  const pinned = (
    <Stack
      direction={{ xs: "column", md: "row" }}
      spacing={2}
      sx={{ alignItems: { md: "center" }, flexWrap: "wrap", gap: 2 }}
    >
      <TextField
        size="small"
        label="Search name or alias"
        value={search}
        onChange={(event) => updateSearch(event.target.value)}
        sx={{ minWidth: { xs: "100%", md: 240 } }}
        data-testid="recruitment-search"
      />
      <PinnedSelect
        label="Status"
        value={filters.status ?? ""}
        options={filterOptions({ key: "status" })}
        optionLabel={(value) =>
          PROSPECT_STATUS_LABELS[value as keyof typeof PROSPECT_STATUS_LABELS]
        }
        onChange={(value) => setFilter("status", value)}
        testId="recruitment-filter-status"
      />
      <PinnedSelect
        label="WhatsApp consent"
        value={filters.consent ?? ""}
        options={filterOptions({ key: "consent" })}
        optionLabel={(value) => CONSENT_LABELS[value as keyof typeof CONSENT_LABELS]}
        onChange={(value) => setFilter("consent", value)}
        testId="recruitment-filter-consent"
        minWidth={170}
      />
      <PinnedSelect
        label="Personal sent"
        value={filters.personalSent ?? ""}
        options={["yes", "no"]}
        optionLabel={(value) => (value === "yes" ? "Sent" : "Not sent")}
        onChange={(value) => setFilter("personalSent", value)}
        testId="recruitment-filter-personal-sent"
      />
      <PinnedSelect
        label="Recruitment sent"
        value={filters.recruitmentSent ?? ""}
        options={["yes", "no"]}
        optionLabel={(value) => (value === "yes" ? "Sent" : "Not sent")}
        onChange={(value) => setFilter("recruitmentSent", value)}
        testId="recruitment-filter-recruitment-sent"
      />
      <PinnedSelect
        label="Attended an event"
        value={filters.attendedAnyEvent ?? ""}
        options={["yes", "no"]}
        optionLabel={(value) => (value === "yes" ? "Attended" : "Never attended")}
        onChange={(value) => setFilter("attendedAnyEvent", value)}
        testId="recruitment-filter-attended"
        minWidth={170}
      />
    </Stack>
  );

  const chips =
    activeFilters.length > 0 || search.trim() !== "" ? (
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: "center", flexWrap: "wrap", gap: 1 }}
        data-testid="recruitment-filter-chips"
      >
        <Typography variant="body2" color="text.secondary">
          Filtered by
        </Typography>
        {search.trim() !== "" ? (
          <Chip size="small" label={`Search: ${search}`} onDelete={() => updateSearch("")} />
        ) : null}
        {activeFilters.map(([key, value]) => (
          <Chip
            key={key}
            size="small"
            label={
              <>
                <Box component="span" sx={{ fontWeight: 700 }}>
                  {labelForKey(key, columns)}:
                </Box>{" "}
                {filterChipLabel(key, value, columns)}
              </>
            }
            onDelete={() => setFilter(key, "")}
          />
        ))}
        <Button size="small" onClick={clearAll}>
          Clear all
        </Button>
      </Stack>
    ) : null;

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
          <Typography variant="body2" color="text.secondary" data-testid="season-label">
            {`${season.label} · ${visibleRows.length} ${visibleRows.length === 1 ? "recruit" : "recruits"}`}
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
          <Stack spacing={2} sx={{ mb: 2 }}>
            <Box sx={{ display: { xs: "none", md: "block" } }}>{pinned}</Box>
            <Box sx={{ display: { xs: "block", md: "none" } }}>
              <Button variant="outlined" onClick={() => setPhoneFilters(true)} sx={{ mb: 1 }}>
                Filters{activeFilters.length > 0 ? ` (${activeFilters.length})` : ""}
              </Button>
            </Box>
            {chips}
          </Stack>

          {/* Desktop: the table — the roster board's own banded shape. */}
          <TableContainer
            component={Paper}
            variant="outlined"
            sx={{
              display: { xs: "none", md: "block" },
              maxHeight: "calc(100dvh - 320px)",
              overflow: "auto",
            }}
            data-testid="recruitment-board-table"
          >
            <Table size="small" stickyHeader sx={{ width: "max-content", minWidth: "100%" }}>
              <TableHead>
                <TableRow sx={{ height: BAND_ROW_HEIGHT }}>
                  <TableCell
                    sx={{
                      position: "sticky",
                      left: 0,
                      top: 0,
                      zIndex: 6,
                      bgcolor: "background.paper",
                      borderRight: 1,
                      borderColor: "divider",
                      minWidth: RECRUIT_COLUMN_WIDTH,
                      width: RECRUIT_COLUMN_WIDTH,
                      p: 0,
                    }}
                  />
                  {groupRuns(columns).map((run) => {
                    const colours = bandColour(run.band);
                    const eventId = eventIdOfBand(run.band);
                    const event = eventId ? eventByBand.get(eventId) : undefined;
                    const label = event
                      ? `${event.name}${event.date ? ` · ${event.date}` : ""}`
                      : run.band === "person"
                        ? "Person"
                        : "Recruitment";
                    return (
                      <TableCell
                        key={run.band}
                        colSpan={run.span}
                        sx={{
                          top: 0,
                          bgcolor: colours.header,
                          color: "common.white",
                          pl: `${BAND_LABEL_INSET_PX}px`,
                          pr: 0,
                          py: 0,
                          height: BAND_ROW_HEIGHT,
                          borderBottom: "none",
                          borderRight: 2,
                          borderRightColor: "background.paper",
                        }}
                      >
                        <Typography
                          variant="overline"
                          component="span"
                          sx={{
                            fontWeight: 700,
                            lineHeight: `${BAND_ROW_HEIGHT}px`,
                            position: "sticky",
                            left: RECRUIT_COLUMN_WIDTH + BAND_LABEL_INSET_PX,
                            display: "inline-block",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {label}
                        </Typography>
                      </TableCell>
                    );
                  })}
                </TableRow>

                <TableRow>
                  <TableCell
                    sx={{
                      position: "sticky",
                      left: 0,
                      top: BAND_ROW_HEIGHT,
                      zIndex: 6,
                      bgcolor: "background.paper",
                      borderRight: 1,
                      borderColor: "divider",
                      minWidth: RECRUIT_COLUMN_WIDTH,
                      width: RECRUIT_COLUMN_WIDTH,
                      verticalAlign: "bottom",
                    }}
                  >
                    <TableSortLabel
                      active={sort?.key === "displayName"}
                      direction={sort?.key === "displayName" ? sort.direction : "asc"}
                      onClick={() => sortBy("displayName")}
                    >
                      Recruit
                    </TableSortLabel>
                    <Typography variant="caption" sx={{ display: "block", lineHeight: 1.3 }}>
                      &nbsp;
                    </Typography>
                  </TableCell>

                  {columns.map((column) => {
                    const colours = bandColour(column.band);
                    const filtered = (filters[column.key] ?? "") !== "";
                    return (
                      <TableCell
                        key={column.key}
                        sx={{
                          top: BAND_ROW_HEIGHT,
                          // V-9, correction round 2: `colours.tint` is a ~5%-alpha
                          // wash, correct for a body cell (`RecruitCell` below,
                          // unchanged) that never sits over scrolling content, but
                          // this cell is the sticky header's own second row —
                          // Brian's own board screenshot: "row text bleeds into
                          // the header." A translucent `bgcolor` here lets exactly
                          // that show through. `backgroundColor` paints first, the
                          // tint's own `backgroundImage` layer paints over it, so
                          // the result reads identically to the old tint but is
                          // fully opaque at every scroll position.
                          backgroundColor: "background.paper",
                          backgroundImage: `linear-gradient(${colours.tint}, ${colours.tint})`,
                          minWidth: column.width,
                          width: column.width,
                          verticalAlign: "bottom",
                          whiteSpace: "nowrap",
                          borderBottom: filtered ? 2 : 1,
                          borderBottomColor: filtered ? "primary.main" : "divider",
                          borderRight: bandBoundaries.has(column.key) ? 2 : 0,
                          borderRightColor: "background.paper",
                        }}
                      >
                        <Stack
                          direction="row"
                          spacing={0.5}
                          sx={{ alignItems: "center", justifyContent: "space-between" }}
                        >
                          {column.sortable ? (
                            <TableSortLabel
                              active={sort?.key === column.key}
                              direction={sort?.key === column.key ? sort.direction : "asc"}
                              onClick={() => sortBy(column.key)}
                            >
                              {column.label}
                            </TableSortLabel>
                          ) : (
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {column.label}
                            </Typography>
                          )}
                          {column.filterable ? (
                            <FilterButton
                              label={column.label}
                              active={filtered}
                              onOpen={(anchor) => setMenu({ anchor, column })}
                            />
                          ) : null}
                        </Stack>
                        {filtered ? (
                          <Typography
                            variant="caption"
                            sx={{
                              display: "block",
                              color: "primary.main",
                              fontWeight: 700,
                              lineHeight: 1.3,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {filterOptionLabel(column, filters[column.key])}
                          </Typography>
                        ) : column.edit === "record" ? (
                          <Typography
                            variant="caption"
                            sx={{ display: "block", color: "text.disabled", lineHeight: 1.3 }}
                          >
                            edit on the record
                          </Typography>
                        ) : (
                          <Typography variant="caption" sx={{ display: "block", lineHeight: 1.3 }}>
                            &nbsp;
                          </Typography>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              </TableHead>

              <TableBody>
                {visibleRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={columns.length + 1}>
                      <Typography
                        color="text.secondary"
                        sx={{ py: 3 }}
                        data-testid="recruitment-filter-empty"
                      >
                        No recruits match the current search and filters.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleRows.map((row) => (
                    <TableRow
                      key={row.prospectId}
                      hover
                      data-testid={`recruitment-row-${row.prospectId}`}
                    >
                      <TableCell
                        sx={{
                          position: "sticky",
                          left: 0,
                          zIndex: 2,
                          bgcolor: "background.paper",
                          borderRight: 1,
                          borderColor: "divider",
                          minWidth: RECRUIT_COLUMN_WIDTH,
                          width: RECRUIT_COLUMN_WIDTH,
                        }}
                      >
                        <Link href={`/operate/recruitment/${row.prospectId}`} underline="hover">
                          {row.displayName}
                        </Link>
                      </TableCell>
                      {columns.map((column) => (
                        <RecruitCell
                          key={column.key}
                          row={row}
                          column={column}
                          bandEnd={bandBoundaries.has(column.key)}
                          seasonLabel={season.label}
                        />
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Mobile: cards — the roster board's own idiom (LAN-186): a static
              status pill, never in-cell editing, and voice call as its own,
              separately tappable control. Editing is desktop work. */}
          <Stack spacing={1.5} sx={{ display: { xs: "flex", md: "none" } }}>
            {visibleRows.length === 0 ? (
              <Typography color="text.secondary" data-testid="recruitment-filter-empty-phone">
                No recruits match the current search and filters.
              </Typography>
            ) : (
              visibleRows.map((row) => <RecruitCard key={row.prospectId} row={row} />)
            )}
          </Stack>
        </>
      )}

      <Drawer anchor="bottom" open={phoneFilters} onClose={() => setPhoneFilters(false)}>
        <Box sx={{ p: 2 }}>
          <Stack spacing={2}>{pinned}</Stack>
          <Button fullWidth sx={{ mt: 2 }} onClick={() => setPhoneFilters(false)}>
            Done
          </Button>
        </Box>
      </Drawer>

      <ColumnFilterMenu
        menu={menu}
        filters={filters}
        optionsFor={(column) => filterOptions(column)}
        optionLabel={(column, option) => optionListLabel(column, option)}
        onSelect={setFilter}
        onClose={() => setMenu(null)}
      />
    </Box>
  );
}

function labelForKey(key: string, columns: readonly ColumnDef[]): string {
  if (key === "attendedAnyEvent") return "Attended an event";
  return columns.find((column) => column.key === key)?.label ?? key;
}

function filterChipLabel(key: string, value: string, columns: readonly ColumnDef[]): string {
  if (key === "attendedAnyEvent") return value === "yes" ? "Attended" : "Never attended";
  const column = columns.find((c) => c.key === key);
  return column ? filterOptionLabel(column, value) : value;
}

function PinnedSelect({
  label,
  value,
  options,
  optionLabel,
  onChange,
  minWidth,
  testId,
}: {
  label: string;
  value: string;
  options: readonly string[];
  optionLabel?: (value: string) => string;
  onChange: (value: string) => void;
  minWidth?: number;
  testId?: string;
}) {
  return (
    <FormControl size="small" sx={{ minWidth: minWidth ?? 160 }}>
      <InputLabel>{label}</InputLabel>
      <Select
        label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        data-testid={testId}
      >
        <MenuItem value="">
          <em>All</em>
        </MenuItem>
        {options.map((option) => (
          <MenuItem key={option} value={option}>
            {optionLabel ? optionLabel(option) : option}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

/** One cell — plain text, a record link, or (status only) the click-to-edit pill. */
function RecruitCell({
  row,
  column,
  bandEnd,
  seasonLabel,
}: {
  row: RecruitmentBoardRow;
  column: ColumnDef;
  /** Whether this column is the last in its band's run — see `bandBoundaryKeys`. */
  bandEnd: boolean;
  seasonLabel: string;
}) {
  const colours = bandColour(column.band);
  const shell = {
    bgcolor: colours.tint,
    minWidth: column.width,
    width: column.width,
    whiteSpace: "nowrap" as const,
    borderRight: bandEnd ? 2 : 0,
    borderRightColor: "background.paper",
  };

  if (column.key === "status") {
    return (
      <TableCell sx={shell}>
        <StatusCell
          prospectId={row.prospectId}
          status={row.status}
          displayName={row.displayName}
          seasonLabel={seasonLabel}
        />
      </TableCell>
    );
  }

  if (column.edit === "record") {
    // `W1`: "routes to the person record on click, exactly as the roster
    // board's person columns do" — and the roster board's own person-fact
    // cells route to that row's own record page, not to a bare
    // `/operate/people/[personId]`, so this does too.
    const value = displayOf(rawValue(row, column.key));
    return (
      <TableCell sx={shell}>
        <Link
          href={`/operate/recruitment/${row.prospectId}`}
          underline="hover"
          color={value === NOT_RECORDED ? "text.disabled" : "text.primary"}
        >
          {value}
        </Link>
      </TableCell>
    );
  }

  return (
    <TableCell sx={shell}>
      <Typography
        variant="body2"
        color={displayText(row, column) === NOT_RECORDED ? "text.disabled" : "text.primary"}
      >
        {displayText(row, column)}
      </Typography>
    </TableCell>
  );
}

/**
 * Walk correction (W-2): the RSVP/Attendance and yes/no answer columns were
 * rendering their raw database enum (`present`, `yes`) through the generic
 * `displayOf`'s bare `String(value)`, while `NOT_RECORDED` alongside them
 * read correctly capitalised — the inconsistency the walk caught side by
 * side. The record page (`record-view.tsx`) already renders these same
 * values through `RSVP_LABEL`/`ATTENDANCE_LABEL`; this reuses that mapping
 * rather than writing a third one. Rendering only — `rawValue` and the
 * column definitions are unchanged.
 */
function displayText(row: RecruitmentBoardRow, column: ColumnDef): string {
  if (column.key === "consent") return CONSENT_LABELS[row.consent];
  if (column.key === "playedBefore") {
    return row.playedBefore ? RSVP_LABEL[row.playedBefore] : NOT_RECORDED;
  }
  if (column.key === "watchedBefore") {
    return row.watchedBefore ? RSVP_LABEL[row.watchedBefore] : NOT_RECORDED;
  }
  if (column.key.startsWith("event:")) {
    const [, eventId, cell] = column.key.split(":");
    const eventCell = row.events[eventId];
    if (eventCell) {
      if (cell === "rsvp") return eventCell.rsvp ? RSVP_LABEL[eventCell.rsvp] : NOT_RECORDED;
      if (cell === "attendance") {
        return eventCell.attendance ? ATTENDANCE_LABEL[eventCell.attendance] : NOT_RECORDED;
      }
    }
  }
  return displayOf(rawValue(row, column.key));
}

/**
 * The phone card — `W1-01`'s own approved mockup, and `../roster/roster-board.tsx`'s
 * `PlayerCard` (LAN-186, item 15) it is modelled on: the whole card is one
 * tap target opening the record, a static status pill (never an in-cell
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
            <StatusPill
              color={STATUS_COLOUR_FOR_PILL[row.status]}
              label={PROSPECT_STATUS_LABELS[row.status]}
            />
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
