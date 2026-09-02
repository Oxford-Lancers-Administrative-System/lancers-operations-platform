"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import Drawer from "@mui/material/Drawer";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import ListItemText from "@mui/material/ListItemText";
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
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { ResolvedOperator } from "@/lib/auth/operator";
import { roleCodesPermit } from "@/lib/auth/capabilities";
import type { MembershipStatus } from "@/lib/services/membership";
import type {
  RosterBoardRow,
  PositionColumn,
  Kit,
  FormalwearItemKey,
} from "@/lib/services/roster-board";
import { setMembershipStatusAction } from "./actions";
import {
  commitAvailabilityAction,
  commitBluesAction,
  commitCoachGroupAction,
  commitEligibilityAction,
  commitEntryAction,
  commitFormalwearItemAction,
  commitJerseyNumbersAction,
  commitPositionAction,
} from "./board-actions";
import {
  BAND_LABEL_INSET_PX,
  BAND_ROW_HEIGHT,
  bandOf,
  PLAYER_COLUMN_WIDTH,
  type ColumnDef,
} from "./board-columns";
import {
  applyBoard,
  displayOf,
  filterOptionLabel,
  filterOptions,
  NOT_RECORDED,
  onboardingLabel,
  optionListLabel,
  rawValue,
} from "./board-data";
import JerseyPicker from "./jersey-picker";
import { labelFor, MEMBERSHIP_STATUS_LABELS } from "./presentation";
import { ColumnFilterMenu, FilterButton, StatusPill } from "../board-filter-controls";

const AVAILABILITY_COLOUR: Readonly<Record<string, string>> = Object.freeze({
  green: "#2e7d32",
  orange: "#ed6c02",
  red: "#c62828",
});

const STATUS_COLOUR: Readonly<Record<string, "default" | "info" | "success" | "warning">> =
  Object.freeze({ active: "success", onboarding: "info", inactive: "warning" });

/** `MISSING_DATA_ROUTE` links into the queue LAN-184 owns — LAN-186's own words: "if this package lands first, the link arrives with it." */
const MISSING_DATA_ROUTE = "/operate/people/missing";

function buildUrl(base: string, params: URLSearchParams): string {
  const query = params.toString();
  return query === "" ? base : `${base}?${query}`;
}

export default function RosterBoard({
  operator,
  columns,
  rows,
  totalInSeason,
  seasonId,
  seasonLabel,
  jerseyHolders,
  initialSearch,
  initialFilters,
  initialSortKey,
  initialSortDirection,
}: {
  operator: ResolvedOperator;
  columns: readonly ColumnDef[];
  /** The whole season, redacted for this viewer's grant — never pre-filtered or pre-sorted. */
  rows: readonly RosterBoardRow[];
  totalInSeason: number;
  seasonId: string;
  seasonLabel: string;
  jerseyHolders: { blue: Record<string, string>; white: Record<string, string> };
  /** The URL's own search/filter/sort at the moment this page was requested — seeds, not props this component stays synced to. */
  initialSearch: string;
  initialFilters: Readonly<Record<string, string>>;
  initialSortKey: string;
  initialSortDirection: "asc" | "desc";
}) {
  const [, startTransition] = useTransition();
  const [searchBox, setSearchBox] = useState(initialSearch);
  const [filters, setFilters] = useState<Readonly<Record<string, string>>>(initialFilters);
  const [sortKey, setSortKey] = useState(initialSortKey);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">(initialSortDirection);
  const [editing, setEditing] = useState<{ id: string; key: string } | null>(null);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; column: ColumnDef } | null>(null);
  const [phoneFilters, setPhoneFilters] = useState(false);
  const [cellError, setCellError] = useState<{ id: string; message: string } | null>(null);

  const canManageStatus = roleCodesPermit(operator.roleCodes, "membership_activation");
  const seasonEmpty = totalInSeason === 0;
  /**
   * Which column is the last in its band's run — Person, Onboarding, Season.
   *
   * Brian's own complaint at the walkthrough: "ONBOARDING and SEASON butt
   * straight against each other while PERSON has breathing room." The header's
   * overline row already drew a 2px seam between bands; the body rows drew
   * none at all, so only the boundary next to the always-bordered pinned
   * Player column ever looked separated. The same seam, computed once here, is
   * now applied to the column-header row *and* every body cell — one rule, all
   * three boundaries, equally.
   */
  const bandBoundaries = bandBoundaryKeys(columns);

  /**
   * Search, filter and sort — applied here, over the one set of rows this page
   * already fetched, rather than by re-running the server component. LAN-186
   * item 11: "everything after [the first load], as fast as we can" — a
   * `router.push()` on every change used to re-query the whole board for data
   * this page was already holding. `applyBoard()` is the same pure function
   * `page.tsx` used to call server-side; only where it runs has changed.
   */
  const applied = useMemo(
    () =>
      applyBoard(rows, {
        search: searchBox,
        filters,
        sort: { key: sortKey, direction: sortDirection },
      }),
    [rows, searchBox, filters, sortKey, sortDirection],
  );
  const { visible, isFiltered } = applied;

  /**
   * Keeps the address bar in step with the live view — LAN-186 item 11: "it
   * should be snappy and fast", and still "a filtered view is still linkable
   * and survives a refresh". `history.replaceState` rather than `router.push`
   * or `router.replace` on purpose: either of those asks Next.js to re-render
   * this route from the server, which is exactly the per-keystroke re-fetch
   * this round removes. A plain history update changes only what the browser
   * shows in the address bar and what a refresh or a copied link would carry —
   * it asks nothing of the server, and does not re-run `listRosterBoard()`.
   */
  const syncUrl = useCallback(
    (next: {
      search: string;
      filters: Readonly<Record<string, string>>;
      sortKey: string;
      sortDirection: "asc" | "desc";
    }) => {
      const params = new URLSearchParams();
      if (next.search.trim() !== "") params.set("q", next.search);
      for (const [key, value] of Object.entries(next.filters))
        if (value !== "") params.set(key, value);
      params.set("sort", next.sortKey);
      params.set("dir", next.sortDirection);
      window.history.replaceState(null, "", buildUrl("/operate/roster", params));
    },
    [],
  );

  const setFilter = useCallback(
    (key: string, value: string) => {
      const next = { ...filters, [key]: value };
      if (value === "") delete next[key];
      setFilters(next);
      syncUrl({ search: searchBox, filters: next, sortKey, sortDirection });
    },
    [filters, searchBox, sortKey, sortDirection, syncUrl],
  );
  const clearAll = useCallback(() => {
    setSearchBox("");
    setFilters({});
    syncUrl({ search: "", filters: {}, sortKey, sortDirection });
  }, [sortKey, sortDirection, syncUrl]);
  const setSort = useCallback(
    (key: string) => {
      const direction = sortKey === key && sortDirection === "asc" ? "desc" : "asc";
      setSortKey(key);
      setSortDirection(direction);
      syncUrl({ search: searchBox, filters, sortKey: key, sortDirection: direction });
    },
    [filters, searchBox, sortDirection, sortKey, syncUrl],
  );
  const setSearch = useCallback(
    (value: string) => {
      setSearchBox(value);
      syncUrl({ search: value, filters, sortKey, sortDirection });
    },
    [filters, sortDirection, sortKey, syncUrl],
  );

  const labelForKey = useCallback(
    (key: string) => columns.find((column) => column.key === key)?.label ?? key,
    [columns],
  );

  async function runCommit(rowId: string, action: () => Promise<{ error: string | null }>) {
    setCellError(null);
    const result = await action();
    if (result.error) setCellError({ id: rowId, message: result.error });
    setEditing(null);
  }

  function commitFor(row: RosterBoardRow, column: ColumnDef, next: string | string[]) {
    startTransition(() => {
      void (async () => {
        switch (column.key) {
          case "status":
            await runCommit(row.membershipId, () =>
              setMembershipStatusAction({
                membershipId: row.membershipId,
                status: next as MembershipStatus,
              }),
            );
            return;
          case "entry":
            await runCommit(row.membershipId, () =>
              commitEntryAction({
                membershipId: row.membershipId,
                entry: next as "new" | "returning",
              }),
            );
            return;
          case "offencePosition":
          case "defencePosition":
          case "specialTeamsPosition": {
            const positionColumn: PositionColumn =
              column.key === "offencePosition"
                ? "offence"
                : column.key === "defencePosition"
                  ? "defence"
                  : "specialTeams";
            await runCommit(row.membershipId, () =>
              commitPositionAction({
                membershipId: row.membershipId,
                seasonId,
                column: positionColumn,
                code: (next as string) || null,
              }),
            );
            return;
          }
          case "coachGroup":
            await runCommit(row.membershipId, () =>
              commitCoachGroupAction({
                membershipId: row.membershipId,
                seasonId,
                coachGroup: (next as string) || null,
              }),
            );
            return;
          case "blues":
            await runCommit(row.membershipId, () =>
              commitBluesAction({
                membershipId: row.membershipId,
                seasonId,
                value: next as "Full" | "Half" | "None",
              }),
            );
            return;
          case "eligibility":
            await runCommit(row.membershipId, () =>
              commitEligibilityAction({
                membershipId: row.membershipId,
                seasonId,
                status: next as "pending" | "eligible" | "ineligible" | "expired",
              }),
            );
            return;
          case "availability":
            await runCommit(row.membershipId, () =>
              commitAvailabilityAction({
                membershipId: row.membershipId,
                level: next as "green" | "orange" | "red",
              }),
            );
            return;
          case "blueNumbers":
          case "whiteNumbers": {
            const kit: Kit = column.key === "blueNumbers" ? "blue" : "white";
            await runCommit(row.membershipId, () =>
              commitJerseyNumbersAction({
                membershipId: row.membershipId,
                seasonId,
                kit,
                numbers: next as string[],
              }),
            );
            return;
          }
          default:
            return;
        }
      })();
    });
  }

  function toggleFormalwear(row: RosterBoardRow, item: FormalwearItemKey, owned: boolean) {
    startTransition(() => {
      void runCommit(row.membershipId, () =>
        commitFormalwearItemAction({ membershipId: row.membershipId, seasonId, item, owned }),
      );
    });
  }

  const pinned = (
    <Stack
      direction={{ xs: "column", md: "row" }}
      spacing={2}
      sx={{ alignItems: { md: "center" }, flexWrap: "wrap", gap: 2 }}
    >
      <TextField
        size="small"
        label="Search name or alias"
        value={searchBox}
        onChange={(event) => setSearch(event.target.value)}
        sx={{ minWidth: { xs: "100%", md: 260 } }}
      />
      <PinnedSelect
        label="Status"
        value={filters.status ?? ""}
        options={["onboarding", "active", "inactive", "departed", "archived"]}
        optionLabel={(value) => labelFor(MEMBERSHIP_STATUS_LABELS, value)}
        onChange={(value) => setFilter("status", value)}
      />
      <PinnedSelect
        label="Availability"
        value={filters.availability ?? ""}
        options={["green", "orange", "red"]}
        optionLabel={(value) => value.charAt(0).toUpperCase() + value.slice(1)}
        onChange={(value) => setFilter("availability", value)}
      />
      <PinnedSelect
        label="Missing onboarding data"
        value={filters.missing ?? ""}
        options={["Yes", "No"]}
        onChange={(value) => setFilter("missing", value)}
        minWidth={230}
      />
    </Stack>
  );

  const activeFilters = Object.entries(filters).filter(([, value]) => value !== "");
  const chips = isFiltered ? (
    <Stack
      direction="row"
      spacing={1}
      sx={{ alignItems: "center", flexWrap: "wrap", gap: 1 }}
      data-testid="filter-chips"
    >
      <Typography variant="body2" color="text.secondary">
        Filtered by
      </Typography>
      {searchBox.trim() !== "" ? (
        <Chip size="small" label={`Search: ${searchBox}`} onDelete={() => setSearch("")} />
      ) : null}
      {activeFilters.map(([key, value]) => (
        <Chip
          key={key}
          size="small"
          label={
            <>
              <Box component="span" sx={{ fontWeight: 700 }}>
                {labelForKey(key)}:
              </Box>{" "}
              {filterOptionLabel(columns.find((c) => c.key === key) ?? columns[0], value)}
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

  if (visible.length === 0) {
    return (
      <Stack spacing={3}>
        <Heading
          count={seasonEmpty ? 0 : totalInSeason}
          columns={columns.length + 1}
          seasonLabel={seasonLabel}
        />
        {pinned}
        {chips}
        <Paper variant="outlined" sx={{ p: { xs: 2, md: 4 } }}>
          <Stack spacing={2} sx={{ maxWidth: 640 }}>
            <Typography variant="h6" component="h2">
              {seasonEmpty
                ? "This season has no memberships yet"
                : "No memberships match these filters"}
            </Typography>
            <Typography
              color="text.secondary"
              data-testid={seasonEmpty ? "roster-empty" : "roster-filter-empty"}
            >
              {seasonEmpty
                ? "Nobody has been entered for this season yet. Start with a returning player."
                : "The roster is available, but the current search and filter combination returned no results."}
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              {seasonEmpty ? null : (
                <Button variant="outlined" onClick={clearAll} sx={{ minHeight: 44 }}>
                  Clear filters
                </Button>
              )}
              <Button variant="contained" href="/operate/roster/new" sx={{ minHeight: 44 }}>
                Add player
              </Button>
            </Stack>
          </Stack>
        </Paper>
      </Stack>
    );
  }

  return (
    <Stack spacing={3}>
      <Heading count={visible.length} columns={columns.length + 1} seasonLabel={seasonLabel} />
      {pinned}
      {chips}

      <TableContainer
        component={Paper}
        variant="outlined"
        sx={{
          display: { xs: "none", md: "block" },
          maxHeight: "calc(100dvh - 300px)",
          overflow: "auto",
        }}
        data-testid="roster-board"
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
                  minWidth: PLAYER_COLUMN_WIDTH,
                  width: PLAYER_COLUMN_WIDTH,
                  p: 0,
                }}
              />
              {groupRuns(columns).map((run) => {
                const band = bandOf(run.band);
                return (
                  <TableCell
                    key={run.band}
                    colSpan={run.span}
                    sx={{
                      top: 0,
                      bgcolor: band.header,
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
                        left: PLAYER_COLUMN_WIDTH + BAND_LABEL_INSET_PX,
                        display: "inline-block",
                      }}
                    >
                      {band.label}
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
                  minWidth: PLAYER_COLUMN_WIDTH,
                  width: PLAYER_COLUMN_WIDTH,
                  verticalAlign: "bottom",
                }}
              >
                <TableSortLabel
                  active={sortKey === "displayName"}
                  direction={sortKey === "displayName" ? sortDirection : "asc"}
                  onClick={() => setSort("displayName")}
                >
                  Player
                </TableSortLabel>
                <Typography variant="caption" sx={{ display: "block", lineHeight: 1.3 }}>
                  &nbsp;
                </Typography>
              </TableCell>

              {columns.map((column) => {
                const band = bandOf(column.band);
                const filtered = (filters[column.key] ?? "") !== "";
                return (
                  <TableCell
                    key={column.key}
                    sx={{
                      top: BAND_ROW_HEIGHT,
                      bgcolor: band.solid,
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
                          active={sortKey === column.key}
                          direction={sortKey === column.key ? sortDirection : "asc"}
                          onClick={() => setSort(column.key)}
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
            {visible.map((row) => (
              <TableRow key={row.membershipId} hover data-testid="roster-row">
                <TableCell
                  sx={{
                    position: "sticky",
                    left: 0,
                    zIndex: 2,
                    bgcolor: "background.paper",
                    borderRight: 1,
                    borderColor: "divider",
                    minWidth: PLAYER_COLUMN_WIDTH,
                    width: PLAYER_COLUMN_WIDTH,
                  }}
                >
                  <Button
                    href={`/operate/roster/${row.membershipId}`}
                    sx={{
                      textAlign: "left",
                      justifyContent: "flex-start",
                      p: 0,
                      textTransform: "none",
                      fontWeight: 600,
                      minWidth: 0,
                    }}
                  >
                    {row.displayName}
                  </Button>
                  {cellError?.id === row.membershipId ? (
                    <Typography variant="caption" color="error" sx={{ display: "block" }}>
                      {cellError.message}
                    </Typography>
                  ) : null}
                </TableCell>

                {columns.map((column) => (
                  <Cell
                    key={column.key}
                    row={row}
                    column={column}
                    editing={editing?.id === row.membershipId && editing.key === column.key}
                    holders={
                      column.kit === "blue"
                        ? jerseyHolders.blue
                        : column.kit === "white"
                          ? jerseyHolders.white
                          : undefined
                    }
                    canManageStatus={canManageStatus}
                    bandEnd={bandBoundaries.has(column.key)}
                    onOpen={() => setEditing({ id: row.membershipId, key: column.key })}
                    onClose={() => setEditing(null)}
                    onCommit={(next) => commitFor(row, column, next)}
                    onToggleFormalwear={(item, owned) => toggleFormalwear(row, item, owned)}
                  />
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Box sx={{ display: { xs: "block", md: "none" } }}>
        <Button variant="outlined" onClick={() => setPhoneFilters(true)} sx={{ mb: 2 }}>
          Filters{activeFilters.length > 0 ? ` (${activeFilters.length})` : ""}
        </Button>
        <Stack spacing={2}>
          {visible.map((row) => (
            <PlayerCard key={row.membershipId} row={row} />
          ))}
        </Stack>
      </Box>

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
        optionsFor={(column) => filterOptions(column, visible)}
        optionLabel={(column, option) => optionListLabel(column, option)}
        onSelect={setFilter}
        onClose={() => setMenu(null)}
      />
    </Stack>
  );
}

function Heading({
  count,
  columns,
  seasonLabel,
}: {
  count: number;
  columns: number;
  seasonLabel: string;
}) {
  return (
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
          {`Season ${seasonLabel} · ${count} ${count === 1 ? "player" : "players"} · ${columns} columns`}
        </Typography>
      </Box>
      <Button variant="contained" href="/operate/roster/new" sx={{ minHeight: 44 }}>
        Add player
      </Button>
    </Stack>
  );
}

function PinnedSelect({
  label,
  value,
  options,
  optionLabel,
  onChange,
  minWidth,
}: {
  label: string;
  value: string;
  options: readonly string[];
  optionLabel?: (value: string) => string;
  onChange: (value: string) => void;
  minWidth?: number;
}) {
  return (
    <FormControl size="small" sx={{ minWidth: minWidth ?? 190 }}>
      <InputLabel>{label}</InputLabel>
      <Select label={label} value={value} onChange={(event) => onChange(event.target.value)}>
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

function Cell({
  row,
  column,
  editing,
  holders,
  canManageStatus,
  bandEnd,
  onOpen,
  onClose,
  onCommit,
  onToggleFormalwear,
}: {
  row: RosterBoardRow;
  column: ColumnDef;
  editing: boolean;
  holders?: Record<string, string>;
  canManageStatus: boolean;
  /** Whether this column is the last in its band's run — see `bandBoundaryKeys`. */
  bandEnd: boolean;
  onOpen: () => void;
  onClose: () => void;
  onCommit: (next: string | string[]) => void;
  onToggleFormalwear: (item: FormalwearItemKey, owned: boolean) => void;
}) {
  const band = bandOf(column.band);
  const shell = {
    bgcolor: band.tint,
    minWidth: column.width,
    width: column.width,
    whiteSpace: "nowrap" as const,
    // The same seam the band header draws, carried into the body so all three
    // boundaries — Person|Onboarding, Onboarding|Season — read with equal
    // weight instead of only the always-bordered Player column looking
    // separated (LAN-186 item 12).
    borderRight: bandEnd ? 2 : 0,
    borderRightColor: "background.paper",
  };

  if (editing) {
    if (column.edit === "jersey") {
      const held = column.key === "blueNumbers" ? row.blueNumbers : row.whiteNumbers;
      return (
        <TableCell sx={shell}>
          <JerseyPicker
            held={held}
            holders={holders ?? {}}
            onCommit={onCommit}
            onClose={onClose}
            width={column.width}
          />
        </TableCell>
      );
    }

    if (column.edit === "multiselect") {
      const current = row.formalwear;
      return (
        <TableCell sx={shell}>
          <Select
            size="small"
            open
            multiple
            value={(Object.keys(current) as FormalwearItemKey[]).filter((key) => current[key])}
            onClose={onClose}
            renderValue={(value) => (value as string[]).join(", ") || "—"}
            sx={{ width: Math.max(column.width - 24, 64) }}
          >
            {(column.options ?? []).map((option) => {
              const key = option as FormalwearItemKey;
              return (
                <MenuItem
                  key={option}
                  value={option}
                  onClick={() => onToggleFormalwear(key, !current[key])}
                >
                  <Checkbox size="small" sx={{ p: 0, mr: 1 }} checked={current[key]} />
                  <ListItemText primary={column.optionLabels?.[option] ?? option} />
                </MenuItem>
              );
            })}
          </Select>
        </TableCell>
      );
    }

    // The open list of choices reads `optionListLabel` — the label alone
    // (LAN-186 item 9), except for a position column, whose options carry the
    // code *and* the full name (Brian's walkthrough of the built board). The
    // selected value shown when the dropdown is closed is `displayOf` below,
    // unaffected: item 7's cell half — the code alone for a position — still
    // stands.
    const current = rawValue(row, column.key);
    return (
      <TableCell sx={shell}>
        <Select
          size="small"
          open
          autoFocus
          value={(current as string) ?? ""}
          onClose={onClose}
          onChange={(event) => {
            onCommit(event.target.value);
            onClose();
          }}
          renderValue={() => displayOf(row, column)}
          sx={{ width: Math.max(column.width - 24, 64) }}
        >
          {column.key === "status" ? null : (
            <MenuItem value="">
              <em>{NOT_RECORDED}</em>
            </MenuItem>
          )}
          {(column.options ?? []).map((option) => (
            <MenuItem key={option} value={option}>
              {optionListLabel(column, option)}
            </MenuItem>
          ))}
        </Select>
      </TableCell>
    );
  }

  const editable =
    (column.edit === "select" || column.edit === "multiselect" || column.edit === "jersey") &&
    (column.key !== "status" || canManageStatus);

  return (
    <TableCell
      sx={{
        ...shell,
        cursor: editable ? "pointer" : "default",
        "&:hover": editable
          ? { outline: "1px solid", outlineColor: "primary.light", outlineOffset: -1 }
          : undefined,
      }}
      onClick={editable ? onOpen : undefined}
      data-testid={editable ? "editable-cell" : undefined}
    >
      <CellValue row={row} column={column} />
    </TableCell>
  );
}

function CellValue({ row, column }: { row: RosterBoardRow; column: ColumnDef }) {
  if (column.key === "contactable") {
    if (!row.hasMobile && !row.hasEmail)
      return (
        <Typography variant="body2" color="text.disabled">
          —
        </Typography>
      );
    return (
      <Stack direction="row" spacing={0.5}>
        {row.hasMobile ? <Chip size="small" variant="outlined" label="Mobile" /> : null}
        {row.hasEmail ? <Chip size="small" variant="outlined" label="Email" /> : null}
      </Stack>
    );
  }

  if (column.key === "missing") {
    if (row.missingCount === 0)
      return (
        <Typography variant="body2" color="text.disabled">
          —
        </Typography>
      );
    // Links into the queue LAN-184 owns. If this package lands first, per the
    // issue's own words, the link arrives with it; the route not existing yet
    // on this branch is expected and correct.
    return (
      <Chip
        component="a"
        href={MISSING_DATA_ROUTE}
        clickable
        size="small"
        color="warning"
        variant="outlined"
        label={row.missingCount}
        data-testid="missing-count"
      />
    );
  }

  if (column.key === "onboarding") {
    return <Typography variant="body2">{onboardingLabel(row)}</Typography>;
  }

  if (column.key === "status") {
    // The board's one status-pill formula (`../board-filter-controls.tsx`) —
    // the single exception to "plain text like every other select cell",
    // kept because a status is the fact an operator scans the whole row
    // for. Editing still opens the identical generic dropdown every other
    // season fact uses.
    return (
      <StatusPill
        color={STATUS_COLOUR[row.status] ?? "default"}
        label={labelFor(MEMBERSHIP_STATUS_LABELS, row.status)}
      />
    );
  }

  if (column.key === "availability" && row.availability) {
    return (
      <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
        <Box
          aria-hidden
          sx={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            bgcolor: AVAILABILITY_COLOUR[row.availability],
          }}
        />
        <Typography variant="body2">{displayOf(row, column)}</Typography>
      </Stack>
    );
  }

  const text = displayOf(row, column);
  if (column.edit === "record") {
    return (
      <Tooltip title="Opens the person record — W2's rules apply" placement="top">
        <Typography
          variant="body2"
          sx={{
            color: text === NOT_RECORDED ? "text.disabled" : "text.primary",
            textDecoration: text === NOT_RECORDED ? "none" : "underline dotted",
            textUnderlineOffset: 3,
          }}
          component="a"
          href={`/operate/roster/${row.membershipId}`}
        >
          {text}
        </Typography>
      </Tooltip>
    );
  }

  return (
    <Typography
      variant="body2"
      sx={{ color: text === NOT_RECORDED ? "text.disabled" : "text.primary" }}
    >
      {text}
    </Typography>
  );
}

/**
 * The phone card — LAN-186's owner walkthrough, item 15.
 *
 * Not a miniature board. Brian, 2026-08-29: "the mobile view is horrendous.
 * Most of the time, the operators aren't going to be using this as a mobile
 * view anyway, so it should just be a way to click in." So the card carries
 * exactly three things — the player's name, their status, and the missing-data
 * flag when it is set — and nothing else from the twenty columns. There is no
 * in-cell editing at 375px; editing is desktop work, and the phone is for
 * finding somebody and opening them.
 *
 * The whole card is the tap target, not a chevron or a "View" link in a
 * corner — the anchor wraps the name and the chips. The call button is the one
 * deliberate exception: its own control, its own tap target, `stopPropagation`
 * on both so a call can never fire from a tap meant for the card and a card
 * navigation can never fire from a tap meant for the call. W5 locks voice call
 * as the mobile quick action and nothing else — a one-tap WhatsApp link would
 * be manual sending outside the pipeline's consent checks, which R12 and R15
 * prohibit.
 */
function PlayerCard({ row }: { row: RosterBoardRow }) {
  return (
    <Card variant="outlined" sx={{ position: "relative", p: 0 }} data-testid="roster-card">
      <Box
        component="a"
        href={`/operate/roster/${row.membershipId}`}
        data-testid="roster-card-open"
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
              color={STATUS_COLOUR[row.status] ?? "default"}
              label={labelFor(MEMBERSHIP_STATUS_LABELS, row.status)}
            />
            {row.missingCount > 0 ? (
              <Chip
                size="small"
                color="warning"
                variant="outlined"
                label={`${row.missingCount} missing`}
                data-testid="card-missing-flag"
              />
            ) : null}
          </Stack>
        </Stack>
      </Box>

      {/* A sibling of the card-opening anchor, never nested inside it — two
          anchors cannot nest, and stacking this one on top by position rather
          than by DOM order is what keeps both tap targets independently real. */}
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

/** Drawn inline, the same reason `FilterButton`'s funnel is: no icon package in this dependency tree. */
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

function groupRuns(columns: readonly ColumnDef[]): { band: ColumnDef["band"]; span: number }[] {
  const runs: { band: ColumnDef["band"]; span: number }[] = [];
  for (const column of columns) {
    const last = runs[runs.length - 1];
    if (last && last.band === column.band) last.span += 1;
    else runs.push({ band: column.band, span: 1 });
  }
  return runs;
}

/** The key of the last column in each band's run — see the caller's own comment. */
function bandBoundaryKeys(columns: readonly ColumnDef[]): ReadonlySet<string> {
  const keys = new Set<string>();
  columns.forEach((column, index) => {
    const next = columns[index + 1];
    if (!next || next.band !== column.band) keys.add(column.key);
  });
  return keys;
}

export { MISSING_DATA_ROUTE };
