"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
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
import type {
  RosterBoardRow,
  PositionColumn,
  Kit,
  FormalwearItemKey,
} from "@/lib/services/roster-board";
import {
  ActivateMembershipForm,
  DeactivateMembershipForm,
  ReactivateMembershipForm,
} from "./membership-actions";
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
import { BAND_ROW_HEIGHT, bandOf, PLAYER_COLUMN_WIDTH, type ColumnDef } from "./board-columns";
import {
  displayOf,
  filterOptionLabel,
  filterOptions,
  NOT_RECORDED,
  onboardingLabel,
  rawValue,
} from "./board-data";
import JerseyPicker from "./jersey-picker";
import { labelFor, MEMBERSHIP_STATUS_LABELS } from "./presentation";

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
  search,
  filters,
  sortKey,
  sortDirection,
}: {
  operator: ResolvedOperator;
  columns: readonly ColumnDef[];
  /** Already filtered, sorted, and — for a narrower future grant — redacted. */
  rows: readonly RosterBoardRow[];
  totalInSeason: number;
  seasonId: string;
  seasonLabel: string;
  jerseyHolders: { blue: Record<string, string>; white: Record<string, string> };
  search: string;
  filters: Readonly<Record<string, string>>;
  sortKey: string;
  sortDirection: "asc" | "desc";
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [searchBox, setSearchBox] = useState(search);
  const [editing, setEditing] = useState<{ id: string; key: string } | null>(null);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; column: ColumnDef } | null>(null);
  const [phoneFilters, setPhoneFilters] = useState(false);
  const [cellError, setCellError] = useState<{ id: string; message: string } | null>(null);

  const canManageStatus = roleCodesPermit(operator.roleCodes, "membership_activation");
  const seasonEmpty = totalInSeason === 0;
  const isFiltered = Object.values(filters).some((value) => value !== "") || search.trim() !== "";

  const navigate = useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams();
      if (search.trim() !== "") params.set("q", search);
      for (const [key, value] of Object.entries(filters)) if (value !== "") params.set(key, value);
      params.set("sort", sortKey);
      params.set("dir", sortDirection);
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "") params.delete(key);
        else params.set(key, value);
      }
      router.push(buildUrl("/operate/roster", params));
    },
    [router, search, filters, sortKey, sortDirection],
  );

  const setFilter = useCallback(
    (key: string, value: string) => navigate({ [key]: value || null }),
    [navigate],
  );
  const clearAll = useCallback(() => {
    const params = new URLSearchParams();
    params.set("sort", sortKey);
    params.set("dir", sortDirection);
    router.push(buildUrl("/operate/roster", params));
  }, [router, sortKey, sortDirection]);
  const setSort = useCallback(
    (key: string) =>
      navigate({ sort: key, dir: sortKey === key && sortDirection === "asc" ? "desc" : "asc" }),
    [navigate, sortKey, sortDirection],
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
        onChange={(event) => {
          setSearchBox(event.target.value);
          navigate({ q: event.target.value || null });
        }}
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
      {search.trim() !== "" ? (
        <Chip
          size="small"
          label={`Search: ${search}`}
          onDelete={() => {
            setSearchBox("");
            navigate({ q: null });
          }}
        />
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

  if (rows.length === 0) {
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
      <Heading count={rows.length} columns={columns.length + 1} seasonLabel={seasonLabel} />
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
                      p: 0,
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
                        left: PLAYER_COLUMN_WIDTH + 16,
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
            {rows.map((row) => (
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
          {rows.map((row) => (
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

      <Menu
        open={menu !== null}
        anchorEl={menu?.anchor ?? null}
        onClose={() => setMenu(null)}
        slotProps={{ paper: { sx: { maxHeight: 360 } } }}
      >
        <MenuItem
          selected={(filters[menu?.column.key ?? ""] ?? "") === ""}
          onClick={() => {
            if (menu) setFilter(menu.column.key, "");
            setMenu(null);
          }}
        >
          <em>All</em>
        </MenuItem>
        <Divider />
        {menu
          ? filterOptions(menu.column, rows).map((option) => (
              <MenuItem
                key={option}
                selected={(filters[menu.column.key] ?? "") === option}
                onClick={() => {
                  setFilter(menu.column.key, option);
                  setMenu(null);
                }}
              >
                {filterOptionLabel(menu.column, option)}
              </MenuItem>
            ))
          : null}
      </Menu>
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

function FilterButton({
  label,
  active,
  onOpen,
}: {
  label: string;
  active: boolean;
  onOpen: (anchor: HTMLElement) => void;
}) {
  return (
    <Tooltip title={active ? `Filtering ${label}` : `Filter ${label}`} placement="top">
      <Box
        component="button"
        type="button"
        aria-label={active ? `Filtering ${label}` : `Filter ${label}`}
        aria-pressed={active}
        onClick={(event) => onOpen(event.currentTarget as HTMLElement)}
        sx={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          width: 24,
          height: 24,
          p: 0,
          cursor: "pointer",
          borderRadius: 1,
          border: 1,
          borderColor: active ? "primary.main" : "divider",
          bgcolor: active ? "primary.main" : "transparent",
          color: active ? "common.white" : "text.secondary",
          "&:hover": {
            borderColor: "primary.main",
            bgcolor: active ? "primary.dark" : "action.hover",
            color: active ? "common.white" : "primary.main",
          },
          "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main" },
        }}
      >
        <Box component="svg" viewBox="0 0 24 24" aria-hidden sx={{ width: 14, height: 14 }}>
          <path
            d="M4 5.5h16l-6.2 7.2V19l-3.6 1.8v-8.1z"
            fill={active ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinejoin="round"
          />
        </Box>
      </Box>
    </Tooltip>
  );
}

function Cell({
  row,
  column,
  editing,
  holders,
  canManageStatus,
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
  };

  if (column.edit === "status") {
    return (
      <TableCell sx={shell}>
        <StatusCell row={row} canManage={canManageStatus} />
      </TableCell>
    );
  }

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
          renderValue={(value) =>
            column.optionLabels?.[value as string]
              ? `${value} · ${column.optionLabels[value as string]}`
              : displayOf(row, column)
          }
          sx={{ width: Math.max(column.width - 24, 64) }}
        >
          <MenuItem value="">
            <em>{NOT_RECORDED}</em>
          </MenuItem>
          {(column.options ?? []).map((option) => (
            <MenuItem key={option} value={option}>
              {column.optionLabels?.[option]
                ? `${option} · ${column.optionLabels[option]}`
                : column.optionLabels
                  ? option
                  : filterOptionLabel(column, option)}
            </MenuItem>
          ))}
        </Select>
      </TableCell>
    );
  }

  const editable =
    column.edit === "select" || column.edit === "multiselect" || column.edit === "jersey";

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
 * The Status column. Reuses `membership.ts`'s own transition rules and forms
 * rather than a bare dropdown: `onboarding → active` commits with one click
 * when nothing required is outstanding; `active → inactive` and
 * `inactive → active` reuse the exact controls the membership record already
 * carries, because those transitions' legality and reason requirements are
 * `membership.ts`'s to enforce, not this board's to reinterpret.
 */
function StatusCell({ row, canManage }: { row: RosterBoardRow; canManage: boolean }) {
  const colour = STATUS_COLOUR[row.status] ?? "default";
  if (!canManage || row.status === "departed" || row.status === "archived") {
    return (
      <Chip size="small" color={colour} label={labelFor(MEMBERSHIP_STATUS_LABELS, row.status)} />
    );
  }

  if (row.status === "onboarding") {
    return (
      <Stack spacing={0.5} sx={{ minWidth: 140 }}>
        <Chip size="small" color={colour} label={labelFor(MEMBERSHIP_STATUS_LABELS, row.status)} />
        <ActivateMembershipForm
          membershipId={row.membershipId}
          displayName={row.displayName}
          outstanding={[]}
        />
        {row.requiredOutstanding > 0 ? (
          <Typography variant="caption" color="text.secondary">
            {row.requiredOutstanding} required outstanding — open the record for the override reason
          </Typography>
        ) : null}
      </Stack>
    );
  }

  if (row.status === "active") {
    return (
      <Stack spacing={0.5} sx={{ minWidth: 140 }}>
        <Chip size="small" color={colour} label={labelFor(MEMBERSHIP_STATUS_LABELS, row.status)} />
        <DeactivateMembershipForm membershipId={row.membershipId} />
      </Stack>
    );
  }

  return (
    <Stack spacing={0.5} sx={{ minWidth: 140 }}>
      <Chip size="small" color={colour} label={labelFor(MEMBERSHIP_STATUS_LABELS, row.status)} />
      <ReactivateMembershipForm membershipId={row.membershipId} />
    </Stack>
  );
}

function PlayerCard({ row }: { row: RosterBoardRow }) {
  const positions = [row.offencePosition, row.defencePosition, row.specialTeamsPosition].filter(
    (value): value is string => value !== null,
  );
  return (
    <Card variant="outlined" sx={{ p: 2 }} data-testid="roster-card">
      <Stack spacing={1}>
        <Typography
          variant="subtitle2"
          component="a"
          href={`/operate/roster/${row.membershipId}`}
          sx={{ fontWeight: 700, color: "primary.main" }}
        >
          {row.displayName}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
          <Chip
            size="small"
            color={STATUS_COLOUR[row.status] ?? "default"}
            label={labelFor(MEMBERSHIP_STATUS_LABELS, row.status)}
          />
          {positions.length > 0 ? (
            <Chip size="small" variant="outlined" label={positions.join(" · ")} />
          ) : null}
          {row.availability ? (
            <Chip
              size="small"
              variant="outlined"
              label={row.availability}
              sx={{ borderColor: AVAILABILITY_COLOUR[row.availability] }}
            />
          ) : null}
          {row.missingCount > 0 ? (
            <Chip
              size="small"
              color="warning"
              variant="outlined"
              label={`${row.missingCount} missing`}
            />
          ) : null}
        </Stack>
        <Typography variant="body2" color="text.secondary">
          {onboardingLabel(row)}
        </Typography>
        {/* The only channel action on this surface — a voice call, and nothing that composes, schedules or sends a message. */}
        <Box>
          <Button
            size="small"
            variant="outlined"
            component="a"
            href={row.phoneForCall ? `tel:${row.phoneForCall}` : undefined}
            disabled={!row.phoneForCall}
            sx={{ minHeight: 44, minWidth: 44 }}
          >
            Call
          </Button>
        </Box>
      </Stack>
    </Card>
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

export { MISSING_DATA_ROUTE };
