"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Drawer from "@mui/material/Drawer";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { Notice } from "@/components/notice";
import { PinnedSelect } from "@/components/pinned-select";
import { SAVING } from "@/components/record-field";
import type { ResolvedOperator } from "@/lib/auth/operator";
import { roleCodesPermit } from "@/lib/auth/capabilities";
import type { MembershipStatus, OnboardingItemStatus } from "@/lib/services/membership";
import type {
  RosterBoardRow,
  PositionColumn,
  Kit,
  FormalwearItemKey,
  BpsValue,
} from "@/lib/services/roster-board";
import { parseKitCellKey, parseSpecialTeamsCellKey } from "@/lib/services/roster-board/vocabulary";
import type { Band } from "./board-columns";
import { setMembershipStatusAction } from "./actions";
import {
  commitAvailabilityAction,
  commitBluesAction,
  commitBpsAction,
  commitCoachingGroupsAction,
  commitEligibilityAction,
  commitEntryAction,
  commitFormalwearItemsAction,
  commitJerseyNumbersAction,
  commitOnboardingItemAction,
  commitPositionAction,
  commitPositionGroupsAction,
  commitKitItemAction,
  commitWarmupSmallGroupAction,
  commitSpecialTeamsAssignmentAction,
} from "./board-actions";
import { commitWithRetry } from "./board-action-state";
import {
  BOARD_ROW_HEIGHT,
  BOARD_SCROLLBAR_GUTTER_PX,
  collapsedBandsFrom,
  nonBandCollapsedKeys,
  displayColumns,
  PLAYER_COLUMN_WIDTH,
  squadBoundaryKeys,
  type ColumnDef,
} from "./board-columns";
import { saveCollapsedGroupsAction } from "./group-preference-actions";
import { applyBoard, filterOptionLabel, filterOptions, optionListLabel } from "./board-data";
import AddPlayersMenu from "./add-players-menu";
import { labelFor, MEMBERSHIP_STATUS_LABELS } from "./presentation";
import { bandBoundaryKeys, ColumnFilterMenu } from "../board-filter-controls";
import RosterHeading from "./roster-heading";
import BoardTableHead from "./roster-board-header";
import { Cell } from "./roster-board-cell";
import PlayerCard from "./roster-board-card";

/** Which position slot each of the four position columns writes — one map, not a chain of ternaries. */
const POSITION_COLUMN_BY_KEY: Readonly<Record<string, PositionColumn>> = Object.freeze({
  offencePosition: "offence",
  offenceBackupPosition: "offenceBackup",
  defencePosition: "defence",
  defenceBackupPosition: "defenceBackup",
});

/** How long a toggle settles before the account is told — folding four groups away is four clicks in about a second, and only where they end up is worth a write. */
const COLLAPSE_SAVE_DELAY_MS = 600;

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
  initialCollapsedGroups,
  seasonHasOnboardingItemTypes,
  canEditCategories = false,
}: {
  operator: ResolvedOperator;
  columns: readonly ColumnDef[];
  /** The whole season, redacted for this viewer's grant — never pre-filtered or pre-sorted. */
  rows: readonly RosterBoardRow[];
  totalInSeason: number;
  seasonId: string;
  seasonLabel: string;
  jerseyHolders: { blue: Record<string, string>; white: Record<string, string> };
  /** LAN-396 — whether this season carries any onboarding item types at all. */
  seasonHasOnboardingItemTypes: boolean;
  /** The URL's own search/filter/sort at the moment this page was requested — seeds, not props this component stays synced to. */
  initialSearch: string;
  initialFilters: Readonly<Record<string, string>>;
  initialSortKey: string;
  initialSortDirection: "asc" | "desc";
  /** What this operator's account remembers about folded-up groups, or `undefined` where it remembers nothing (LAN-387). */
  initialCollapsedGroups: readonly string[] | undefined;
  /** LAN-430 — whether this operator holds `role_management`, and so sees Edit categories. */
  canEditCategories?: boolean;
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
  /** Which row's own save is in flight — LAN-380. `useTransition`'s own flag cannot answer it: the transition is over before the request is. */
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  /**
   * Which groups are folded away — LAN-387. Special teams and Kit arrive closed
   * for an operator who has never said otherwise; once they have, their own
   * account answers instead (Brian's visual pass, item 1), on any device.
   */
  const [collapsedBands, setCollapsedBands] = useState<ReadonlySet<Band>>(() =>
    collapsedBandsFrom(initialCollapsedGroups),
  );

  /**
   * The stored preference, written behind the toggles rather than with them.
   *
   * Debounced because folding four groups away is four clicks in about a
   * second, and each one would otherwise be its own round trip; the last state
   * is the only one worth storing. Nothing on screen waits for it: the board
   * already holds the truth while it is open, and a preference that failed to
   * save is not worth interrupting an operator over.
   */
  const asArrived = useRef(true);
  /**
   * The record's own sections are folded in the same stored list and this
   * board has no opinion about them — LAN-403. The whole list is written every
   * time, so they are carried through rather than dropped; without this, one
   * fold on the board forgets every fold made on a record.
   */
  const recordSections = useMemo(
    () => nonBandCollapsedKeys(initialCollapsedGroups),
    [initialCollapsedGroups],
  );
  useEffect(() => {
    // The state this board arrived holding is the state the account already
    // stores, so writing it back would be a write per page load.
    if (asArrived.current) {
      asArrived.current = false;
      return;
    }
    const groups = [...collapsedBands, ...recordSections];
    const timer = setTimeout(() => void saveCollapsedGroupsAction(groups), COLLAPSE_SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [collapsedBands, recordSections]);

  const drawn = useMemo(() => displayColumns(columns, collapsedBands), [columns, collapsedBands]);
  const toggleBand = useCallback((band: Band) => {
    setCollapsedBands((current) => {
      const next = new Set(current);
      if (next.has(band)) next.delete(band);
      else next.add(band);
      return next;
    });
  }, []);

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
  const bandBoundaries = bandBoundaryKeys(drawn);
  /** And the same seam, one level down, between one special-teams squad's four columns and the next — Brian's visual pass, item 5. */
  const squadBoundaries = squadBoundaryKeys(drawn);

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

  /**
   * One board commit. LAN-380: the cell's editor closes the moment it is
   * committed, the row says it is saving until the answer is back, and a
   * request that did not complete is retried once before the operator is told
   * anything.
   */
  function runCommit(rowId: string, action: () => Promise<{ error: string | null }>) {
    // Outside the transition on purpose: an update made inside one is held back
    // until the transition settles, and it settles exactly when the save stops
    // being outstanding — so a saving state set in there is never drawn.
    setCellError(null);
    setEditing(null);
    setSavingRowId(rowId);
    startTransition(() => {
      void (async () => {
        try {
          const result = await commitWithRetry(action);
          if (result.error) setCellError({ id: rowId, message: result.error });
        } finally {
          // Cleared *in* a transition, so React holds it until the refreshed
          // payload `revalidatePath` triggers is ready to draw. Clearing it
          // urgently put the pre-save value back on screen for the ~200ms
          // between the action resolving and the refresh landing, which is the
          // old value shown as though it were saved.
          startTransition(() => setSavingRowId(null));
        }
      })();
    });
  }

  function commitFor(row: RosterBoardRow, column: ColumnDef, next: string | string[]) {
    // LAN-374: one branch for all twenty-four special-teams cells, keyed by
    // the column's own `st:<squad>:<slot>`.
    const cell = parseSpecialTeamsCellKey(column.key);
    if (cell) {
      runCommit(row.membershipId, () =>
        commitSpecialTeamsAssignmentAction({
          membershipId: row.membershipId,
          seasonId,
          squad: cell.squad,
          slot: cell.slot,
          positionName: (next as string) || null,
        }),
      );
      return;
    }

    // LAN-375: one branch for all eleven issued-kit items. LAN-409: two of
    // them send a whole set, and the action takes either shape.
    const kitItem = parseKitCellKey(column.key);
    if (kitItem) {
      runCommit(row.membershipId, () =>
        commitKitItemAction({
          membershipId: row.membershipId,
          seasonId,
          item: kitItem,
          value: next,
        }),
      );
      return;
    }

    switch (column.key) {
      case "status":
        runCommit(row.membershipId, () =>
          setMembershipStatusAction({
            membershipId: row.membershipId,
            status: next as MembershipStatus,
          }),
        );
        return;
      case "entry":
        runCommit(row.membershipId, () =>
          commitEntryAction({
            membershipId: row.membershipId,
            entry: next as "new" | "returning",
          }),
        );
        return;
      case "offencePosition":
      case "offenceBackupPosition":
      case "defencePosition":
      case "defenceBackupPosition": {
        const positionColumn = POSITION_COLUMN_BY_KEY[column.key];
        runCommit(row.membershipId, () =>
          commitPositionAction({
            membershipId: row.membershipId,
            seasonId,
            column: positionColumn,
            code: (next as string) || null,
          }),
        );
        return;
      }
      case "coachingGroups":
        runCommit(row.membershipId, () =>
          commitCoachingGroupsAction({
            membershipId: row.membershipId,
            seasonId,
            groups: next as string[],
          }),
        );
        return;
      case "offensivePositionGroups":
      case "defensivePositionGroups":
        runCommit(row.membershipId, () =>
          commitPositionGroupsAction({
            membershipId: row.membershipId,
            seasonId,
            side: column.key === "offensivePositionGroups" ? "offence" : "defence",
            groups: next as string[],
          }),
        );
        return;
      case "formalwear":
        runCommit(row.membershipId, () =>
          commitFormalwearItemsAction({
            membershipId: row.membershipId,
            seasonId,
            items: next as FormalwearItemKey[],
          }),
        );
        return;
      case "blues":
        runCommit(row.membershipId, () =>
          commitBluesAction({
            membershipId: row.membershipId,
            seasonId,
            value: next as "Full" | "Half" | "None",
          }),
        );
        return;
      case "eligibility":
        runCommit(row.membershipId, () =>
          commitEligibilityAction({
            membershipId: row.membershipId,
            seasonId,
            status: next as "pending" | "eligible" | "ineligible" | "expired",
          }),
        );
        return;
      case "availability":
        runCommit(row.membershipId, () =>
          commitAvailabilityAction({
            membershipId: row.membershipId,
            level: next as "green" | "orange" | "red",
          }),
        );
        return;
      case "bps":
        runCommit(row.membershipId, () =>
          commitBpsAction({
            membershipId: row.membershipId,
            seasonId,
            value: next as BpsValue,
          }),
        );
        return;
      case "subsInvoiced":
      case "subsPaid":
      case "kitDistributed":
      case "bucsPlay":
      case "hudlAccess":
      case "squadPhoto":
      case "commsGroup": {
        // Correction round 2, item 5: every onboarding column commits
        // through the same one action, keyed by this membership's own
        // item id for that column's `itemCode` — never a direct write.
        const item = column.itemCode ? row.onboardingItems[column.itemCode] : undefined;
        if (!item) return;
        runCommit(row.membershipId, () =>
          commitOnboardingItemAction({
            membershipId: row.membershipId,
            itemId: item.id,
            status: next as OnboardingItemStatus,
          }),
        );
        return;
      }
      // LAN-401: the warmup group's one cell.
      case "warmupSmallGroup":
        runCommit(row.membershipId, () =>
          commitWarmupSmallGroupAction({
            membershipId: row.membershipId,
            seasonId,
            smallGroup: (next as string) || null,
          }),
        );
        return;
      case "blueNumbers":
      case "whiteNumbers": {
        const kit: Kit = column.key === "blueNumbers" ? "blue" : "white";
        runCommit(row.membershipId, () =>
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

  /**
   * LAN-396 — production, 2026-09-17: the 2026-27 season was opened with no
   * onboarding item types, so every onboarding cell on the board was blank and
   * would not open. Said once, above the board, rather than left to be
   * discovered a cell at a time. The membership record's own empty state says
   * the same thing about one membership.
   */
  const noItemTypes = seasonHasOnboardingItemTypes ? null : (
    <Notice severity="warning" testId="roster-no-onboarding-item-types">
      This season has no onboarding items configured, so no membership in it has any.
    </Notice>
  );

  if (visible.length === 0) {
    return (
      <Stack spacing={3}>
        <RosterHeading
          count={seasonEmpty ? 0 : totalInSeason}
          columns={columns.length + 1}
          seasonLabel={seasonLabel}
          canEditCategories={canEditCategories}
        />
        {noItemTypes}
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
              <AddPlayersMenu />
            </Stack>
          </Stack>
        </Paper>
      </Stack>
    );
  }

  return (
    <Stack spacing={3}>
      <RosterHeading
        count={visible.length}
        columns={columns.length + 1}
        seasonLabel={seasonLabel}
        canEditCategories={canEditCategories}
      />
      {noItemTypes}
      {pinned}
      {chips}

      <TableContainer
        component={Paper}
        variant="outlined"
        sx={{
          display: { xs: "none", md: "block" },
          maxHeight: "calc(100dvh - 300px)",
          overflow: "auto",
          // LAN-395: keep the vertical scrollbar off the last folded-up band.
          // See `BOARD_SCROLLBAR_GUTTER_PX` for why it takes both rules. The
          // padding is only ever visible at the far right of the scroll, after
          // the last column, so nothing else about the board moves.
          scrollbarGutter: "stable",
          pr: `${BOARD_SCROLLBAR_GUTTER_PX}px`,
        }}
        data-testid="roster-board"
      >
        <Table size="small" stickyHeader sx={{ width: "max-content", minWidth: "100%" }}>
          <BoardTableHead
            columns={drawn}
            collapsedBands={collapsedBands}
            onToggleBand={toggleBand}
            bandBoundaries={bandBoundaries}
            squadBoundaries={squadBoundaries}
            sortKey={sortKey}
            sortDirection={sortDirection}
            setSort={setSort}
            filters={filters}
            onOpenFilter={(anchor, column) => setMenu({ anchor, column })}
          />

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
                    // Brian's visual pass, items 3 and 4. This cell used to set
                    // the row's height for the whole board: its link was a
                    // `Button`, and the theme gives a medium button the 44px
                    // touch target, which made every row 57px tall for one word
                    // of text. This table is drawn only from `md` up, where the
                    // pointer is a mouse.
                    height: BOARD_ROW_HEIGHT,
                    py: 0,
                    boxSizing: "border-box",
                  }}
                >
                  {/* Saving and the last refusal sit *beside* the name rather
                      than under it: a second line here grew the row the moment
                      a pick was made and dropped it back when the save landed,
                      which is exactly what item 4 refuses. Both truncate; the
                      refusal carries its full text in a tooltip. */}
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ alignItems: "baseline", minWidth: 0, overflow: "hidden" }}
                  >
                    <Typography
                      component="a"
                      href={`/operate/roster/${row.membershipId}`}
                      variant="body2"
                      noWrap
                      sx={{ fontWeight: 600, color: "primary.main", minWidth: 0 }}
                    >
                      {row.displayName}
                    </Typography>
                    {savingRowId === row.membershipId ? (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        noWrap
                        data-testid="row-saving"
                      >
                        {SAVING}
                      </Typography>
                    ) : null}
                    {cellError?.id === row.membershipId ? (
                      <Tooltip title={cellError.message} placement="top">
                        <Typography variant="caption" color="error" noWrap>
                          {cellError.message}
                        </Typography>
                      </Tooltip>
                    ) : null}
                  </Stack>
                </TableCell>

                {drawn.map((column) => (
                  <Cell
                    key={column.key}
                    row={row}
                    boardSaving={savingRowId !== null}
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
                    squadEnd={squadBoundaries.has(column.key)}
                    onOpen={() => setEditing({ id: row.membershipId, key: column.key })}
                    onClose={() => setEditing(null)}
                    onCommit={(next) => commitFor(row, column, next)}
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
