"use client";

import { useCallback, useMemo, useRef, useState } from "react";
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

import {
  AVAILABILITY,
  BAND_ROW_HEIGHT,
  bandOf,
  type ColumnDef,
  JERSEY_NUMBERS,
  PLAYER_COLUMN_WIDTH,
  STATUSES,
  visibleColumns,
} from "./columns";
import { buildRoster, type Row, SEASON_LABEL, SIGNED_IN_OPERATOR } from "./fixtures";

/* ------------------------------------------------------------------ types -- */

interface AuditEvent {
  readonly id: number;
  readonly at: string;
  readonly actor: string;
  readonly subject: string;
  readonly field: string;
  readonly before: string;
  readonly after: string;
}

type Filters = Record<string, string>;

const NOT_RECORDED = "Not recorded";

/* -------------------------------------------------------------- utilities -- */

/**
 * One cell's value as a string, for sorting, filtering and display.
 *
 * `not recorded` is explicit and never defaulted — never an empty cell, never a
 * zero, and never conflated with "No". That is the lesson of the 2023
 * workbook's defaulting Rookie column, and it is the reason this returns the
 * empty string only for a value that genuinely is one.
 */
function rawValue(row: Row, key: string): string | string[] | number | null {
  switch (key) {
    case "contactable":
      return [row.hasMobile ? "Mobile" : "", row.hasEmail ? "Email" : ""].filter(Boolean);
    case "missing":
      return row.missing;
    default:
      return (row as unknown as Record<string, string | string[] | number | null>)[key] ?? null;
  }
}

function comparable(row: Row, key: string): string | number {
  const value = rawValue(row, key);
  if (value === null) return "￿"; // `not recorded` sorts last, in both directions' natural place
  if (Array.isArray(value)) return value.join(", ") || "￿";
  if (typeof value === "number") return value;
  // Jersey numbers and years are stored as text but read as numbers.
  const asNumber = Number(value);
  return Number.isNaN(asNumber) ? value : asNumber;
}

/** The values a column's filter offers, read from the data rather than assumed. */
function filterOptions(column: ColumnDef, rows: readonly Row[]): readonly string[] {
  if (column.key === "missing") return ["Yes", "No"];
  if (column.key === "contactable") return ["Has mobile", "Has email", "Neither"];
  if (column.options) return column.options;

  const seen = new Set<string>();
  let blanks = false;
  for (const row of rows) {
    const value = rawValue(row, column.key);
    if (value === null || (Array.isArray(value) && value.length === 0)) {
      blanks = true;
      continue;
    }
    if (Array.isArray(value)) value.forEach((entry) => seen.add(entry));
    else seen.add(String(value));
  }
  const values = [...seen].sort((a, b) => a.localeCompare(b, "en-GB", { numeric: true }));
  return blanks ? [...values, NOT_RECORDED] : values;
}

function matches(row: Row, key: string, wanted: string): boolean {
  if (wanted === "") return true;

  if (key === "missing") return wanted === "Yes" ? row.missing > 0 : row.missing === 0;
  if (key === "contactable") {
    if (wanted === "Has mobile") return row.hasMobile;
    if (wanted === "Has email") return row.hasEmail;
    return !row.hasMobile && !row.hasEmail;
  }

  const value = rawValue(row, key);
  if (wanted === NOT_RECORDED) {
    return value === null || (Array.isArray(value) && value.length === 0);
  }
  if (Array.isArray(value)) return value.includes(wanted);
  return String(value ?? "") === wanted;
}

/** Search is name or alias. The contact values it used to search are gone. */
function searchMatches(row: Row, term: string): boolean {
  if (term.trim() === "") return true;
  const needle = term.trim().toLowerCase();
  if (row.displayName.toLowerCase().includes(needle)) return true;
  return row.aliases.some((alias) => alias.toLowerCase().includes(needle));
}

function displayOf(row: Row, key: string): string {
  const value = rawValue(row, key);
  if (value === null) return "—";
  if (Array.isArray(value)) return value.length === 0 ? "—" : value.join(", ");
  return String(value);
}

const AVAILABILITY_COLOUR: Readonly<Record<string, string>> = Object.freeze({
  Green: "#2e7d32",
  Orange: "#ed6c02",
  Red: "#c62828",
});

const STATUS_COLOUR: Readonly<
  Record<string, "default" | "info" | "success" | "warning" | "error">
> = Object.freeze({
  Active: "success",
  Onboarding: "info",
  Inactive: "warning",
  Departed: "default",
  Archived: "default",
});

/* ----------------------------------------------------------------- board -- */

export default function RosterBoard({
  grants,
  seasonEmpty,
  onAudit,
  audit,
}: {
  readonly grants: readonly string[];
  readonly seasonEmpty: boolean;
  readonly onAudit: (event: AuditEvent) => void;
  readonly audit: readonly AuditEvent[];
}) {
  const [rows, setRows] = useState<Row[]>(() => buildRoster());
  const [search, setSearch] = useState("");
  // One filter per column key. The pinned controls and the column carets write
  // to this same object, which is what makes them two controls over one filter
  // rather than two filters that have to be kept in step.
  // The board opens already filtered, deliberately. `Coach group: Offense` is
  // set on a column far off to the right — scroll to it and you will find the
  // caret lit. It is the case the chip bar exists for: without the bar the
  // board would look mysteriously short and nothing on screen would say why.
  const [filters, setFilters] = useState<Filters>({
    status: "Active",
    coachGroup: "Offense",
  });
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({
    key: "displayName",
    dir: "asc",
  });
  const [editing, setEditing] = useState<{ id: string; key: string } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; column: ColumnDef } | null>(null);
  const [phoneFilters, setPhoneFilters] = useState(false);
  const nextAuditId = useRef(1);

  const columns = useMemo(() => visibleColumns(grants), [grants]);

  /**
   * Who holds which number, per kit.
   *
   * Built from **every** row, never from the filtered view. A number worn by a
   * Departed player, or by somebody the current filter has hidden, is still
   * issued — and a picker that offered it because that player was off screen
   * would hand out a collision the database then refuses. Season-wide is the
   * scope the constraint uses, so it is the scope this uses.
   */
  const jerseyHolders = useMemo(() => {
    const byKit: Record<string, Map<string, string>> = { blue: new Map(), white: new Map() };
    for (const row of rows) {
      for (const number of row.blueNumbers) byKit.blue.set(number, row.displayName);
      for (const number of row.whiteNumbers) byKit.white.set(number, row.displayName);
    }
    return byKit;
  }, [rows]);

  /* ------------------------------------------------------------ committing -- */

  /**
   * A season fact changes. There is no save button and no confirmation step:
   * the change commits on its own, and an audit event is written without asking
   * for a reason.
   *
   * The reason belongs to `W2`, where a durable *person* fact is being
   * overwritten. Nothing on this board overwrites one — these values belong to
   * this season and this season only — so asking would be ceremony.
   */
  const commit = useCallback(
    (row: Row, column: ColumnDef, next: string | string[]) => {
      const before = displayOf(row, column.key);
      setRows((current) =>
        current.map((candidate) =>
          candidate.id === row.id
            ? ({ ...candidate, [column.key]: next } as Row)
            : candidate,
        ),
      );
      const after = Array.isArray(next) ? (next.join(", ") || "—") : (next || "—");
      if (before === after) return;

      onAudit({
        id: nextAuditId.current++,
        at: new Intl.DateTimeFormat("en-GB", {
          timeStyle: "medium",
          timeZone: "Europe/London",
        }).format(new Date()),
        actor: SIGNED_IN_OPERATOR,
        subject: row.displayName,
        field: column.label,
        before,
        after,
      });

      const cell = `${row.id}:${column.key}`;
      setFlash(cell);
      window.setTimeout(() => setFlash((c) => (c === cell ? null : c)), 900);
    },
    [onAudit],
  );

  /* -------------------------------------------------------------- deriving -- */

  const visible = useMemo(() => {
    if (seasonEmpty) return [];
    const kept = rows.filter(
      (row) =>
        searchMatches(row, search) &&
        Object.entries(filters).every(([key, wanted]) => matches(row, key, wanted)),
    );
    const direction = sort.dir === "asc" ? 1 : -1;
    return [...kept].sort((a, b) => {
      const left = sort.key === "displayName" ? a.displayName : comparable(a, sort.key);
      const right = sort.key === "displayName" ? b.displayName : comparable(b, sort.key);
      if (typeof left === "number" && typeof right === "number") {
        return (left - right) * direction;
      }
      return String(left).localeCompare(String(right), "en-GB", { numeric: true }) * direction;
    });
  }, [rows, search, filters, sort, seasonEmpty]);

  const activeFilters = useMemo(
    () => Object.entries(filters).filter(([, value]) => value !== ""),
    [filters],
  );
  const isFiltered = activeFilters.length > 0 || search.trim() !== "";

  const setFilter = useCallback((key: string, value: string) => {
    setFilters((current) => {
      const next = { ...current };
      if (value === "") delete next[key];
      else next[key] = value;
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setFilters({});
    setSearch("");
  }, []);

  const labelFor = useCallback(
    (key: string) => columns.find((column) => column.key === key)?.label ?? key,
    [columns],
  );

  /* --------------------------------------------------------------- header -- */

  /**
   * The pinned set is three, amended 2026-08-27. Entry left it — "entry status:
   * yes, entry: no" — and filters from its own column header like the other
   * fifteen. The separate Onboarding filter went with it, because the useful
   * question is not what onboarding state somebody is in but what onboarding
   * data is missing, which is one filter rather than two.
   */
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
        onChange={(event) => setSearch(event.target.value)}
        sx={{ minWidth: { xs: "100%", md: 280 }, flexGrow: { md: 1 }, maxWidth: { md: 420 } }}
      />
      <PinnedFilter
        label="Status"
        value={filters.status ?? ""}
        options={STATUSES}
        onChange={(value) => setFilter("status", value)}
      />
      <PinnedFilter
        label="Availability"
        value={filters.availability ?? ""}
        options={AVAILABILITY}
        onChange={(value) => setFilter("availability", value)}
        disabled={!grants.includes("availability_read")}
      />
      <PinnedFilter
        label="Missing onboarding data"
        value={filters.missing ?? ""}
        options={["Yes", "No"]}
        onChange={(value) => setFilter("missing", value)}
        minWidth={230}
      />
    </Stack>
  );

  /**
   * The chip bar, and it is not optional.
   *
   * Header filtering has one real flaw: a filter set on a column scrolled off
   * the screen is invisible, so the board can be silently narrowed and look
   * mysteriously short with nothing to say why. This is what fixes it. The chip
   * does not record which control set the filter, because once it is set that
   * stops mattering.
   *
   * Open this page and `Coach group: Offense` is already set, on a column far
   * off to the right. That is deliberate.
   */
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
        <Chip size="small" label={`Search: ${search}`} onDelete={() => setSearch("")} />
      ) : null}
      {activeFilters.map(([key, value]) => (
        <Chip
          key={key}
          size="small"
          label={
            <>
              <Box component="span" sx={{ fontWeight: 700 }}>
                {labelFor(key)}:
              </Box>{" "}
              {value}
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

  /* ---------------------------------------------------------------- empty -- */

  if (visible.length === 0) {
    return (
      <Stack spacing={3}>
        <RosterHeading count={seasonEmpty ? 0 : rows.length} columns={columns.length + 1} />
        {pinned}
        {chips}
        <Paper variant="outlined" sx={{ p: { xs: 2, md: 4 } }}>
          <Stack spacing={2} sx={{ maxWidth: 640 }}>
            <Typography variant="h6" component="h2">
              {seasonEmpty
                ? "This season has no memberships yet"
                : "No memberships match these filters"}
            </Typography>
            <Typography color="text.secondary">
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
              <Button variant="contained" sx={{ minHeight: 44 }}>
                Add player
              </Button>
            </Stack>
          </Stack>
        </Paper>
      </Stack>
    );
  }

  /* ---------------------------------------------------------------- board -- */

  return (
    <Stack spacing={3}>
      <RosterHeading count={visible.length} columns={columns.length + 1} />
      {pinned}
      {chips}

      {/* Desktop: the board. Wide, scrolling sideways inside its own container,
          with the Player column pinned so a row stays identifiable at column
          sixteen. One page scrolled — never a second table. */}
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
            {/* The band row. Labelled, so colour never carries the meaning alone.

                Its height is pinned to `BAND_ROW_HEIGHT` and the column row
                below offsets by exactly the same number. Letting the row size
                itself leaves a few pixels of gap between the two sticky rows,
                and a data row scrolls up into that gap and floats above the
                header. */}
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
                    align="left"
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
                    {/*
                      The label sticks to the left edge of the scroll area, just
                      clear of the pinned Player column, so it stays legible for
                      as long as any part of its band is on screen.

                      Without this a band scrolled halfway past is an unlabelled
                      colour bar — which is exactly what happened in the W5
                      review: `W5-05-proposed-desktop.png` shows the Season
                      group as a blue strip with no word on it, because the
                      label had scrolled off to the left. Colour would then be
                      carrying the meaning alone, which is the one condition
                      Brian attached to approving the grouping.
                    */}
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

            {/* The column row: label, sort, and a filter caret on every one. */}
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
                  active={sort.key === "displayName"}
                  direction={sort.key === "displayName" ? sort.dir : "asc"}
                  onClick={() =>
                    setSort((current) => ({
                      key: "displayName",
                      dir: current.key === "displayName" && current.dir === "asc" ? "desc" : "asc",
                    }))
                  }
                >
                  Player
                </TableSortLabel>
                {/* Player carries no funnel — the search field above is its
                    filter. The blank line keeps its header the same height as
                    every other, so the two sticky rows stay square. */}
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
                      // A filtered column says so at the column, not only in
                      // the chip bar — so scrolling onto one answers "why is
                      // this board short" without a trip back to the top.
                      borderBottom: filtered ? 2 : 1,
                      borderBottomColor: filtered ? "primary.main" : "divider",
                    }}
                  >
                    <Stack
                      direction="row"
                      spacing={0.5}
                      sx={{ alignItems: "center", justifyContent: "space-between" }}
                    >
                      {/* Sort is the label. Filter is the funnel. Two jobs,
                          two shapes, and neither is a bare caret that could be
                          mistaken for the other. */}
                      <TableSortLabel
                        active={sort.key === column.key}
                        direction={sort.key === column.key ? sort.dir : "asc"}
                        onClick={() =>
                          setSort((current) => ({
                            key: column.key,
                            dir:
                              current.key === column.key && current.dir === "asc" ? "desc" : "asc",
                          }))
                        }
                      >
                        {column.label}
                      </TableSortLabel>
                      <FilterButton
                        label={column.label}
                        active={filtered}
                        onOpen={(anchor) => setMenu({ anchor, column })}
                      />
                    </Stack>
                    {/*
                      The second line carries the live filter value where there
                      is one, and otherwise tells a Person column where it is
                      edited. The filter value wins the space because an active
                      filter is the fact that changes what the board is showing.
                    */}
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
                        {filters[column.key]}
                      </Typography>
                    ) : column.edit === "record" ? (
                      <Typography
                        variant="caption"
                        sx={{ display: "block", color: "text.disabled", lineHeight: 1.3 }}
                      >
                        edit on the record
                      </Typography>
                    ) : (
                      // Holds the line's height so a filter appearing or
                      // clearing never makes the header row jump.
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
              <TableRow key={row.id} hover data-testid="roster-row">
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
                </TableCell>

                {columns.map((column) => (
                  <Cell
                    key={column.key}
                    row={row}
                    column={column}
                    editing={editing?.id === row.id && editing.key === column.key}
                    flashing={flash === `${row.id}:${column.key}`}
                    holders={column.kit ? jerseyHolders[column.kit] : undefined}
                    onOpen={() => setEditing({ id: row.id, key: column.key })}
                    onClose={() => setEditing(null)}
                    onCommit={(next) => commit(row, column, next)}
                  />
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Phone: the condensed view, and voice call is the only quick action. A
          one-tap WhatsApp link would be manual sending outside the pipeline's
          consent checks, which R12 and R15 prohibit. */}
      <Box sx={{ display: { xs: "block", md: "none" } }}>
        <Button variant="outlined" onClick={() => setPhoneFilters(true)} sx={{ mb: 2 }}>
          Filters{activeFilters.length > 0 ? ` (${activeFilters.length})` : ""}
        </Button>
        <Stack spacing={2}>
          {visible.map((row) => (
            <PlayerCard key={row.id} row={row} grants={grants} />
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

      {/* One filter, two controls. Setting it here moves the pinned control
          above, and clearing the chip clears both. */}
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
                {menu.column.optionLabels?.[option]
                  ? `${option} · ${menu.column.optionLabels[option]}`
                  : option}
              </MenuItem>
            ))
          : null}
      </Menu>

      <AuditLog events={audit} />
    </Stack>
  );
}

/* -------------------------------------------------------- jersey picker -- */

/**
 * Every number in the kit, and who has it.
 *
 * ## Why this is a picker and not a text field
 *
 * `jersey_assignments_number_range` allows 1–99 and nothing else, so free entry
 * can only ever produce a value the database will refuse. More importantly, a
 * list is the only place the board can tell an operator which numbers are
 * already gone — a text field can say "22 is taken" *after* you type it, which
 * is a worse version of showing you before.
 *
 * ## The rule this enforces
 *
 * A number held by somebody else is shown ticked, named, and **cannot be
 * clicked**. There is no take-it-from-them gesture, deliberately: an assigned
 * number is assigned, and the way to get it is to go to the player who holds
 * it and untick it there. That makes the swap two deliberate acts by an
 * operator who has seen both sides of it, rather than one click that silently
 * strips a number off somebody who is not on screen.
 *
 * The holder's name is on the row precisely so the operator knows where to go.
 *
 * This is the surface form of invariant S2 — the exclusion constraint over
 * `(season, kit, number)` among concurrent assignments. The database would
 * refuse the collision anyway; it would refuse it with a Postgres exclusion
 * violation, which is not something a person can act on.
 *
 * ## What it does not model
 *
 * Effective dating. Unticking here is really "set `effective_to`", and ticking
 * is "open a new assignment" — so the number a player wore last month stays
 * answerable. The mockup drops the whole row instead. Real unassignment
 * preserves history; this does not, and no worker should read it as saying
 * otherwise.
 *
 * `is_predominant` is likewise absent. One number per kit is the one the club
 * reports against, and picking it belongs on player detail with the fuller
 * editor rather than in a grid cell.
 */
function JerseyPicker({
  held,
  holders,
  onCommit,
  onClose,
  width,
}: {
  held: readonly string[];
  /** Number → the player holding it. Includes this player's own numbers. */
  holders: ReadonlyMap<string, string>;
  ownerName: string;
  onCommit: (next: string[]) => void;
  onClose: () => void;
  width: number;
}) {
  const mine = new Set(held);

  return (
    <Select
      size="small"
      open
      multiple
      value={held as string[]}
      onClose={onClose}
      renderValue={(value) => (value as string[]).join(", ")}
      sx={{ width: width - 24 }}
      MenuProps={{
        // The scrollable list. Ninety-nine rows is a lot to render and a lot
        // to scroll; it is still the right control, because the operator is
        // looking for a specific number and needs to see its state.
        slotProps: { paper: { sx: { maxHeight: 340, width: 260 } } },
      }}
    >
      {JERSEY_NUMBERS.map((number) => {
        const holder = holders.get(number);
        const isMine = mine.has(number);
        const takenByAnother = holder !== undefined && !isMine;

        return (
          <MenuItem
            key={number}
            value={number}
            disabled={takenByAnother}
            onClick={
              takenByAnother
                ? undefined
                : () => {
                    const next = isMine
                      ? held.filter((entry) => entry !== number)
                      : [...held, number].sort((a, b) => Number(a) - Number(b));
                    onCommit(next);
                  }
            }
            sx={{
              opacity: takenByAnother ? 1 : undefined,
              // A taken row is not greyed into invisibility — the operator has
              // to be able to read the name to know where to go and untick it.
              "&.Mui-disabled": { opacity: 1, color: "text.disabled" },
            }}
          >
            <Checkbox
              size="small"
              sx={{ p: 0, mr: 1 }}
              checked={isMine || takenByAnother}
              disabled={takenByAnother}
              // The tick means "issued", not "issued to the player you are
              // looking at". Colour separates the two.
              color={takenByAnother ? "default" : "primary"}
            />
            <ListItemText
              primary={number}
              secondary={takenByAnother ? holder : isMine ? "Held — untick to free" : undefined}
              slotProps={{
                primary: {
                  sx: {
                    fontWeight: isMine ? 700 : 500,
                    fontVariantNumeric: "tabular-nums",
                    color: takenByAnother ? "text.disabled" : "text.primary",
                  },
                },
                secondary: { sx: { fontSize: 12 } },
              }}
            />
          </MenuItem>
        );
      })}
    </Select>
  );
}

/* --------------------------------------------------------- filter button -- */

/**
 * The per-column filter control.
 *
 * A funnel rather than a caret, in a bordered target rather than loose in the
 * header. The caret this replaces failed twice over: at eleven pixels with no
 * border it read as punctuation rather than as a control, and it sat next to
 * the sort arrow, so the two marks that do the header's two different jobs
 * looked like the same kind of thing.
 *
 * Drawn inline because `@mui/icons-material` is not a dependency of this
 * repository, and a mockup is the wrong reason to add one.
 *
 * Filled and primary-coloured when the filter is set, outlined and grey when it
 * is not — but the fill is never the only signal. The value appears under the
 * column label and the header takes a 2px rule, because colour and shape alone
 * would fail exactly the reader this board cannot afford to fail.
 */
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
          transition: "background-color 120ms ease, border-color 120ms ease",
          "&:hover": {
            borderColor: "primary.main",
            bgcolor: active ? "primary.dark" : "action.hover",
            color: active ? "common.white" : "primary.main",
          },
          "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main" },
        }}
      >
        <Funnel filled={active} />
      </Box>
    </Tooltip>
  );
}

function Funnel({ filled }: { filled: boolean }) {
  return (
    <Box component="svg" viewBox="0 0 24 24" aria-hidden sx={{ width: 14, height: 14 }}>
      <path
        d="M4 5.5h16l-6.2 7.2V19l-3.6 1.8v-8.1z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinejoin="round"
      />
    </Box>
  );
}

/* ------------------------------------------------------------------ cell -- */

function Cell({
  row,
  column,
  editing,
  flashing,
  holders,
  onOpen,
  onClose,
  onCommit,
}: {
  row: Row;
  column: ColumnDef;
  editing: boolean;
  flashing: boolean;
  holders?: ReadonlyMap<string, string>;
  onOpen: () => void;
  onClose: () => void;
  onCommit: (next: string | string[]) => void;
}) {
  const band = bandOf(column.band);
  const shell = {
    bgcolor: flashing ? "rgba(46, 125, 50, 0.18)" : band.tint,
    transition: "background-color 600ms ease",
    minWidth: column.width,
    width: column.width,
    whiteSpace: "nowrap" as const,
  };

  /* An open editor. One click got here; the next change commits it. */
  if (editing) {
    if (column.edit === "jersey") {
      return (
        <TableCell sx={shell}>
          <JerseyPicker
            held={(rawValue(row, column.key) as string[]) ?? []}
            holders={holders ?? new Map()}
            ownerName={row.displayName}
            onCommit={onCommit}
            onClose={onClose}
            width={column.width}
          />
        </TableCell>
      );
    }

    const current = rawValue(row, column.key);
    const multiple = column.edit === "multiselect";
    return (
      <TableCell sx={shell}>
        <Select
          size="small"
          open
          autoFocus
          multiple={multiple}
          value={multiple ? ((current as string[]) ?? []) : ((current as string) ?? "")}
          // A multi-value cell stays open across picks — MUI only fires
          // `onClose` on a click outside, the arrow, or Escape, never on
          // selecting an item — so this closes the editor on exactly the
          // gestures that mean "I'm finished" and needs no Done button to say
          // so. A single-value cell commits and closes in one click.
          onClose={onClose}
          onChange={(event) => {
            onCommit(event.target.value as string | string[]);
            if (!multiple) onClose();
          }}
          renderValue={(value) => (Array.isArray(value) ? value.join(", ") : String(value))}
          sx={{ width: column.width - 24 }}
        >
          {!multiple ? (
            <MenuItem value="">
              <em>Not recorded</em>
            </MenuItem>
          ) : null}
          {(column.options ?? []).map((option) => (
            <MenuItem key={option} value={option}>
              {multiple ? (
                <>
                  <Checkbox
                    size="small"
                    sx={{ p: 0, mr: 1 }}
                    checked={((current as string[]) ?? []).includes(option)}
                  />
                  {/* The code leads because it is what the cell will show; the
                      name follows because nobody should have to already know
                      the codes to use the control. */}
                  <ListItemText
                    primary={option}
                    secondary={column.optionLabels?.[option]}
                    slotProps={{
                      primary: { sx: { fontWeight: 700, fontVariantNumeric: "tabular-nums" } },
                      secondary: { sx: { fontSize: 12 } },
                    }}
                  />
                </>
              ) : (
                option
              )}
            </MenuItem>
          ))}
        </Select>
      </TableCell>
    );
  }

  const editable = column.edit !== "none" && column.edit !== "record";

  return (
    <TableCell
      sx={{
        ...shell,
        cursor: editable || column.edit === "record" ? "pointer" : "default",
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

function CellValue({ row, column }: { row: Row; column: ColumnDef }) {
  if (column.key === "contactable") {
    if (!row.hasMobile && !row.hasEmail) {
      return <Typography variant="body2">—</Typography>;
    }
    return (
      <Stack direction="row" spacing={0.5}>
        {row.hasMobile ? <Chip size="small" variant="outlined" label="Mobile" /> : null}
        {row.hasEmail ? <Chip size="small" variant="outlined" label="Email" /> : null}
      </Stack>
    );
  }

  if (column.key === "missing") {
    return row.missing === 0 ? (
      <Typography variant="body2" color="text.disabled">
        —
      </Typography>
    ) : (
      <Chip size="small" color="warning" variant="outlined" label={row.missing} />
    );
  }

  if (column.key === "status") {
    return (
      <Chip size="small" color={STATUS_COLOUR[row.status] ?? "default"} label={row.status} />
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
        <Typography variant="body2">{row.availability}</Typography>
      </Stack>
    );
  }

  const text = displayOf(row, column.key);
  if (column.edit === "record") {
    return (
      <Tooltip title="Opens the person record — W2's rules apply" placement="top">
        <Typography
          variant="body2"
          sx={{
            color: text === "—" ? "text.disabled" : "text.primary",
            textDecoration: text === "—" ? "none" : "underline dotted",
            textUnderlineOffset: 3,
          }}
        >
          {text}
        </Typography>
      </Tooltip>
    );
  }

  return (
    <Typography variant="body2" sx={{ color: text === "—" ? "text.disabled" : "text.primary" }}>
      {text}
    </Typography>
  );
}

/* ------------------------------------------------------------- fragments -- */

function RosterHeading({ count, columns }: { count: number; columns: number }) {
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
        <Typography variant="body2" color="text.secondary">
          {`Season ${SEASON_LABEL} · ${count} ${count === 1 ? "player" : "players"} · ${columns} columns`}
        </Typography>
      </Box>
      <Button variant="contained" sx={{ minHeight: 44 }}>
        Add player
      </Button>
    </Stack>
  );
}

function PinnedFilter({
  label,
  value,
  options,
  onChange,
  disabled,
  minWidth,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  disabled?: boolean;
  /** The "Missing onboarding data" label needs more room than the other two. */
  minWidth?: number;
}) {
  return (
    <FormControl size="small" sx={{ minWidth: minWidth ?? 190 }} disabled={disabled}>
      <InputLabel>{label}</InputLabel>
      <Select label={label} value={value} onChange={(event) => onChange(event.target.value)}>
        <MenuItem value="">
          <em>All</em>
        </MenuItem>
        {options.map((option) => (
          <MenuItem key={option} value={option}>
            {option}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

function PlayerCard({ row, grants }: { row: Row; grants: readonly string[] }) {
  return (
    <Card variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {row.displayName}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
          <Chip size="small" color={STATUS_COLOUR[row.status] ?? "default"} label={row.status} />
          <Chip size="small" label={row.entry} />
          {/* All three sides on one line at 375px — the card has room for the
              codes but not for three labelled groups. */}
          {[...row.offencePositions, ...row.defencePositions, ...row.specialTeams].length > 0 ? (
            <Chip
              size="small"
              variant="outlined"
              label={[...row.offencePositions, ...row.defencePositions, ...row.specialTeams].join(
                " · ",
              )}
            />
          ) : null}
          {grants.includes("availability_read") && row.availability ? (
            <Chip
              size="small"
              variant="outlined"
              label={row.availability}
              sx={{ borderColor: AVAILABILITY_COLOUR[row.availability] }}
            />
          ) : null}
          {row.missing > 0 ? (
            <Chip size="small" color="warning" variant="outlined" label={`${row.missing} missing`} />
          ) : null}
        </Stack>
        <Typography variant="body2" color="text.secondary">
          {row.onboarding}
        </Typography>
        {/* The only channel action on this surface. Nothing here composes,
            schedules or sends a message. */}
        <Box>
          <Button
            size="small"
            variant="outlined"
            disabled={!row.hasMobile}
            sx={{ minHeight: 44, minWidth: 44 }}
          >
            Call
          </Button>
        </Box>
      </Stack>
    </Card>
  );
}

/**
 * Every commit, as it lands.
 *
 * This panel is **preview scaffolding, not a screen**. The real audit event
 * goes onto the person's change history (`W8`), so a season change made on this
 * board is answerable in the same place as a correction made anywhere else.
 * It is here because "every commit writes an audit event" is otherwise an
 * invisible claim, and the point of a fidelity mockup is that you can see it
 * happen.
 */
function AuditLog({ events }: { events: readonly AuditEvent[] }) {
  return (
    <Paper
      variant="outlined"
      sx={{ p: 2, borderStyle: "dashed", bgcolor: "grey.50" }}
      data-testid="audit-log"
    >
      <Typography variant="overline" sx={{ fontWeight: 700, color: "text.secondary" }}>
        Audit events written this session — preview scaffolding, not a screen
      </Typography>
      {events.length === 0 ? (
        <Typography variant="body2" color="text.disabled" sx={{ mt: 1 }}>
          None yet. Click any Season cell to change it.
        </Typography>
      ) : (
        <Stack spacing={0.5} sx={{ mt: 1 }}>
          {events
            .slice()
            .reverse()
            .map((event) => (
              <Typography
                key={event.id}
                variant="body2"
                sx={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 12 }}
              >
                {event.at} · {event.actor} · {event.subject} · {event.field}:{" "}
                <Box component="span" sx={{ color: "text.secondary" }}>
                  {event.before}
                </Box>{" "}
                → <Box component="span" sx={{ fontWeight: 700 }}>{event.after}</Box>
              </Typography>
            ))}
        </Stack>
      )}
    </Paper>
  );
}

/** Consecutive columns sharing a band, so the band row can span them. */
function groupRuns(columns: readonly ColumnDef[]): { band: ColumnDef["band"]; span: number }[] {
  const runs: { band: ColumnDef["band"]; span: number }[] = [];
  for (const column of columns) {
    const last = runs[runs.length - 1];
    if (last && last.band === column.band) last.span += 1;
    else runs.push({ band: column.band, span: 1 });
  }
  return runs;
}

export type { AuditEvent };
