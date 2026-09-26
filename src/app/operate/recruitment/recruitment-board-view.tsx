"use client";

import { useBandColours } from "@/components/band-colours-provider";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Chip from "@mui/material/Chip";
import Drawer from "@mui/material/Drawer";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
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
import { PinnedSelect } from "@/components/pinned-select";
import type { RecruitmentBoardRow, RecruitmentEventColumn } from "@/lib/services/recruitment-board";
import { CONSENT_LABELS, PROSPECT_STATUS_LABELS } from "@/lib/services/recruitment-vocabulary";
import type { Season } from "@/lib/services/seasons";
import {
  bandBoundaryKeys,
  ColumnFilterMenu,
  FilterButton,
  groupRuns,
} from "../board-filter-controls";
// The gutter is defined once, on the board it was reported against (LAN-395),
// and shared rather than copied: two boards drawing different reserves would
// be the bug back again on whichever one was missed.
import {
  BOARD_SCROLLBAR_GUTTER_PX,
  COLLAPSED_LABEL_LINE_HEIGHT,
  COLLAPSED_LABEL_MAX_HEIGHT,
} from "../roster/board-columns";
import {
  BAND_LABEL_INSET_PX,
  BAND_ROW_HEIGHT,
  bandColour,
  eventIdOfBand,
  RECRUIT_COLUMN_WIDTH,
  RECRUITMENT_COLUMNS,
  FULL_RECRUITING_ACCESS,
  visibleRecruitmentColumns,
  type RecruitingAccess,
  collapsedBandsFrom,
  displayColumns,
  eventColumns,
  type Band,
  type ColumnDef,
} from "./board-columns";
import {
  applyBoard,
  filterOptions,
  optionListLabel,
  type BoardFilters,
  type BoardSort,
} from "./board-data";
import { filterChipLabel, labelForKey, RecruitCard, RecruitCell } from "./recruitment-board-cells";
import { saveRecruitmentCollapsedGroupsAction } from "./group-preference-actions";

/** The roster board's own debounce: folding three groups away is three clicks in about a second, and only the last state is worth storing. */
const COLLAPSE_SAVE_DELAY_MS = 600;

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
  initialCollapsedGroups,
  access = FULL_RECRUITING_ACCESS,
  mayAddRecruits = true,
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
  /** What this operator's account remembers about folded-away groups, or `undefined` where it remembers nothing (LAN-404). */
  initialCollapsedGroups?: readonly string[] | undefined;
  /** LAN-432 — the seat's level on each recruiting category; a `none` category's columns are absent. */
  access?: RecruitingAccess;
  /** LAN-432 — the May add recruits switch: Add recruit and QR code. */
  mayAddRecruits?: boolean;
}) {
  const bandColours = useBandColours();
  const [search, setSearch] = useState(initialSearch);
  const [filters, setFilters] = useState<BoardFilters>(initialFilters);
  const [sort, setSort] = useState<BoardSort | null>(
    initialSortKey ? { key: initialSortKey, direction: initialSortDirection } : null,
  );
  const [menu, setMenu] = useState<{ anchor: HTMLElement; column: ColumnDef } | null>(null);
  const [phoneFilters, setPhoneFilters] = useState(false);

  const columns = useMemo(
    () => visibleRecruitmentColumns([...RECRUITMENT_COLUMNS, ...eventColumns(events)], access),
    [events, access],
  );
  // LAN-432: the pinned filters follow their categories — Status, consent and
  // Recruitment sent Recruit details, Personal sent Person information
  // (LAN-423), Attended an event Event details.
  const personShown = access.recruit_person !== "none";
  const detailsShown = access.recruit_details !== "none";
  const eventsShown = access.recruit_events !== "none";
  const eventByBand = useMemo(
    () => new Map(events.map((event) => [event.eventId, event])),
    [events],
  );
  /** An event band's template colour key (LAN-423 round 6); `null` for Person and Recruitment. */
  const eventColourOf = (band: Band): string | null => {
    const eventId = eventIdOfBand(band);
    return eventId === null ? null : (eventByBand.get(eventId)?.colourKey ?? null);
  };
  /**
   * Which groups are folded away — LAN-404. The band is the control, the
   * folded group keeps one narrow cell with its name written down it, and the
   * row height does not change: the roster board's answer, on this board.
   */
  const [collapsedBands, setCollapsedBands] = useState<ReadonlySet<Band>>(() =>
    collapsedBandsFrom(initialCollapsedGroups, columns),
  );
  const toggleBand = useCallback((band: Band) => {
    setCollapsedBands((current) => {
      const next = new Set(current);
      if (next.has(band)) next.delete(band);
      else next.add(band);
      return next;
    });
  }, []);

  /**
   * The stored preference, written behind the toggles rather than with them —
   * the roster board's own arrangement. Nothing on screen waits for it: this
   * board holds the truth while it is open, and a preference that failed to
   * save is not worth interrupting an operator over.
   */
  const asArrived = useRef(true);
  useEffect(() => {
    // The state this board arrived holding is already what the account stores,
    // so writing it back would be a write per page load.
    if (asArrived.current) {
      asArrived.current = false;
      return;
    }
    const groups = [...collapsedBands];
    const timer = setTimeout(
      () => void saveRecruitmentCollapsedGroupsAction(groups),
      COLLAPSE_SAVE_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [collapsedBands]);

  const drawn = useMemo(() => displayColumns(columns, collapsedBands), [columns, collapsedBands]);
  /** One group's own name — the event's where the band is an event's, the fixed word otherwise. */
  const bandLabel = useCallback(
    (band: Band): string => {
      const eventId = eventIdOfBand(band);
      const event = eventId ? eventByBand.get(eventId) : undefined;
      if (event) return `${event.name}${event.date ? ` · ${event.date}` : ""}`;
      return band === "person" ? "Person" : "Recruitment";
    },
    [eventByBand],
  );
  const bandBoundaries = useMemo(() => bandBoundaryKeys(drawn), [drawn]);

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
      {detailsShown ? (
        <PinnedSelect
          label="Status"
          value={filters.status ?? ""}
          options={filterOptions({ key: "status" })}
          optionLabel={(value) =>
            PROSPECT_STATUS_LABELS[value as keyof typeof PROSPECT_STATUS_LABELS]
          }
          onChange={(value) => setFilter("status", value)}
          testId="recruitment-filter-status"
          minWidth={160}
        />
      ) : null}
      {detailsShown ? (
        <PinnedSelect
          label="WhatsApp consent"
          value={filters.consent ?? ""}
          options={filterOptions({ key: "consent" })}
          optionLabel={(value) => CONSENT_LABELS[value as keyof typeof CONSENT_LABELS]}
          onChange={(value) => setFilter("consent", value)}
          testId="recruitment-filter-consent"
          minWidth={170}
        />
      ) : null}
      {personShown ? (
        <PinnedSelect
          label="Personal sent"
          value={filters.personalSent ?? ""}
          options={["yes", "no"]}
          optionLabel={(value) => (value === "yes" ? "Sent" : "Not sent")}
          onChange={(value) => setFilter("personalSent", value)}
          testId="recruitment-filter-personal-sent"
          minWidth={160}
        />
      ) : null}
      {detailsShown ? (
        <PinnedSelect
          label="Recruitment sent"
          value={filters.recruitmentSent ?? ""}
          options={["yes", "no"]}
          optionLabel={(value) => (value === "yes" ? "Sent" : "Not sent")}
          onChange={(value) => setFilter("recruitmentSent", value)}
          testId="recruitment-filter-recruitment-sent"
          minWidth={160}
        />
      ) : null}
      {eventsShown ? (
        <PinnedSelect
          label="Attended an event"
          value={filters.attendedAnyEvent ?? ""}
          options={["yes", "no"]}
          optionLabel={(value) => (value === "yes" ? "Attended" : "Never attended")}
          onChange={(value) => setFilter("attendedAnyEvent", value)}
          testId="recruitment-filter-attended"
          minWidth={170}
        />
      ) : null}
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
        {mayAddRecruits ? (
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
        ) : null}
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
          {mayAddRecruits ? (
            <Stack direction="row" spacing={1.5} sx={{ justifyContent: "center" }}>
              <Button variant="outlined" href="/operate/recruitment/qr" sx={{ minHeight: 44 }}>
                QR CODE
              </Button>
              <Button variant="contained" href="/operate/recruitment/new" sx={{ minHeight: 44 }}>
                ADD RECRUIT
              </Button>
            </Stack>
          ) : null}
        </Paper>
      ) : (
        <>
          <Stack spacing={2} sx={{ mb: 2 }}>
            <Box sx={{ display: { xs: "none", md: "block" } }}>{pinned}</Box>
            {personShown || detailsShown || eventsShown ? (
              <Box sx={{ display: { xs: "block", md: "none" } }}>
                <Button variant="outlined" onClick={() => setPhoneFilters(true)} sx={{ mb: 1 }}>
                  Filters{activeFilters.length > 0 ? ` (${activeFilters.length})` : ""}
                </Button>
              </Box>
            ) : null}
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
              // LAN-395, the same two rules the roster board carries: this is
              // the roster board's scroll container, so the bar lands on this
              // board's last column for the same reason.
              scrollbarGutter: "stable",
              pr: `${BOARD_SCROLLBAR_GUTTER_PX}px`,
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
                  {groupRuns(drawn).map((run) => {
                    const colours = bandColour(run.band, bandColours, eventColourOf(run.band));
                    const folded = collapsedBands.has(run.band);
                    return (
                      <TableCell
                        key={run.band}
                        colSpan={run.span}
                        sx={{
                          top: 0,
                          bgcolor: colours.header,
                          color: colours.text,
                          pl: `${BAND_LABEL_INSET_PX}px`,
                          pr: 0,
                          py: 0,
                          height: BAND_ROW_HEIGHT,
                          borderBottom: "none",
                          borderRight: 2,
                          borderRightColor: "background.paper",
                        }}
                      >
                        {/* LAN-404: the band is the control, exactly as it is on the roster board. */}
                        <ButtonBase
                          onClick={() => toggleBand(run.band)}
                          aria-expanded={!folded}
                          aria-label={bandLabel(run.band)}
                          data-testid={`band-toggle-${run.band}`}
                          sx={{
                            position: "sticky",
                            left: RECRUIT_COLUMN_WIDTH + BAND_LABEL_INSET_PX,
                            color: "inherit",
                            gap: 0.75,
                            px: 0,
                            height: BAND_ROW_HEIGHT,
                          }}
                        >
                          <Box
                            aria-hidden
                            sx={{
                              width: 7,
                              height: 7,
                              borderRight: "2px solid",
                              borderBottom: "2px solid",
                              borderColor: "inherit",
                              transform: folded
                                ? "rotate(-45deg)"
                                : "translateY(-2px) rotate(45deg)",
                            }}
                          />
                          <Typography
                            variant="overline"
                            component="span"
                            sx={{
                              fontWeight: 700,
                              lineHeight: `${BAND_ROW_HEIGHT}px`,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {folded ? "" : bandLabel(run.band)}
                          </Typography>
                        </ButtonBase>
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

                  {drawn.map((column) => {
                    const colours = bandColour(
                      column.band,
                      bandColours,
                      eventColourOf(column.band),
                    );
                    const filtered = (filters[column.key] ?? "") !== "";
                    if (column.placeholder) {
                      // The roster board's own answer to a folded-away group:
                      // the name written down the one narrow cell it leaves,
                      // so two closed groups are never told apart by hue alone.
                      return (
                        <TableCell
                          key={column.key}
                          sx={{
                            top: BAND_ROW_HEIGHT,
                            bgcolor: colours.solid,
                            minWidth: column.width,
                            width: column.width,
                            p: 0,
                            verticalAlign: "bottom",
                            borderRight: bandBoundaries.has(column.key) ? 2 : 0,
                            borderRightColor: "background.paper",
                          }}
                        >
                          <Typography
                            variant="caption"
                            component="span"
                            data-testid={`band-collapsed-label-${column.band}`}
                            sx={{
                              display: "block",
                              writingMode: "vertical-rl",
                              transform: "rotate(180deg)",
                              fontWeight: 700,
                              fontSize: 10,
                              letterSpacing: 0,
                              lineHeight: `${COLLAPSED_LABEL_LINE_HEIGHT}px`,
                              whiteSpace: "normal",
                              overflow: "hidden",
                              height: COLLAPSED_LABEL_MAX_HEIGHT,
                              py: 0.5,
                              mx: "auto",
                            }}
                          >
                            {bandLabel(column.band)}
                          </Typography>
                        </TableCell>
                      );
                    }
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
                            {optionListLabel(column, filters[column.key])}
                          </Typography>
                        ) : column.viewOnly ? (
                          // LAN-432: the category is held at view.
                          <Typography
                            variant="caption"
                            sx={{ display: "block", color: "text.disabled", lineHeight: 1.3 }}
                            data-testid="column-view-caption"
                          >
                            view
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
                    <TableCell colSpan={drawn.length + 1}>
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
                      {drawn.map((column) => (
                        <RecruitCell
                          key={column.key}
                          row={row}
                          column={column}
                          bandEnd={bandBoundaries.has(column.key)}
                          seasonLabel={season.label}
                          eventColourKey={eventColourOf(column.band)}
                        />
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Mobile: cards — the roster board's own idiom (LAN-186), with
              voice call as its own separately tappable control. LAN-319: the
              card carries the same status control the table's cell does, with
              the same interrupt and the same confirm. Editing is not desktop
              work; recruitment is run from a phone. */}
          <Stack spacing={1.5} sx={{ display: { xs: "flex", md: "none" } }}>
            {visibleRows.length === 0 ? (
              <Typography color="text.secondary" data-testid="recruitment-filter-empty-phone">
                No recruits match the current search and filters.
              </Typography>
            ) : (
              visibleRows.map((row) => (
                <RecruitCard
                  key={row.prospectId}
                  row={row}
                  seasonLabel={season.label}
                  statusEditable={access.recruit_details === "edit"}
                />
              ))
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
