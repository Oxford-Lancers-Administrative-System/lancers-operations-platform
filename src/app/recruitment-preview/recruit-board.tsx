"use client";

import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
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
import { Aside, Scaffold, StatusChip } from "./chrome";
import {
  BAND_LABEL_INSET_PX,
  BAND_ROW_HEIGHT,
  RECRUIT_COLUMN_WIDTH,
  askedLabel,
  bandColoursOf,
  buildColumns,
  NOT_RECORDED,
  valueOf,
  type ColumnDef,
} from "./columns";
import {
  EVENTS,
  LADDER_ORDER,
  OFF_BOARD_STATUSES,
  PROSPECT_STATUSES,
  SEASON_LABEL,
  STATUS_MEANING,
  type ProspectStatus,
  type Recruit,
} from "./fixtures";
import type { RecruitmentStore } from "./store";

/**
 * `W1` — the recruit board, with `W13`'s exits and `W14`'s flip on it.
 *
 * Modelled on the shipped roster board and deliberately not a new invention:
 * the band model, the 28px band-header row, the 16px label inset, the pinned
 * first column, the funnel-in-a-bordered-button per-column filter, the
 * `Filtered by` chip bar, in-cell editing for the facts this mission owns
 * against read-only cells that route to the person record, and the phone card
 * that carries a name and a status and nothing else — all of that is
 * `roster-board.tsx`'s, carried across.
 *
 * What is different is **which** columns exist, because a recruit holds no
 * membership and therefore has no Onboarding or Season band, and the appended
 * event bands, which the roster board has no equivalent of.
 *
 * The three exits and the flip both live here because Brian settled that they
 * are status changes and nothing more: "It doesn't happen on this page. It is
 * something that happens on a status change, not a button." There is no
 * archive, no delete and no separate removal mechanism anywhere in this file.
 */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** `28 April 2026` → a sortable number. The fixtures write dates the way the screens do. */
function dateKey(text: string): number {
  const [day, month, year] = text.split(" ");
  const index = MONTHS.indexOf(month);
  if (index < 0) return 0;
  return Number(year) * 10000 + (index + 1) * 100 + Number(day);
}

export default function RecruitBoard({
  store,
  onOpenRecruit,
  onAddRecruit,
  onOpenQr,
}: {
  store: RecruitmentStore;
  onOpenRecruit: (id: string) => void;
  onAddRecruit: () => void;
  onOpenQr: () => void;
}) {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Readonly<Record<string, string>>>({});
  const [sortKey, setSortKey] = useState("ladder");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [editing, setEditing] = useState<{ id: string; key: string } | null>(null);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; column: ColumnDef } | null>(null);
  const [phoneFilters, setPhoneFilters] = useState(false);
  /** The interruption `W14` requires, and the reason `W13` asks for. */
  const [pendingExit, setPendingExit] = useState<{ id: string; status: ProspectStatus } | null>(
    null,
  );
  const [exitReason, setExitReason] = useState("");
  /** Scaffolding switches, so the two empty states can actually be looked at. */
  const [noEvents, setNoEvents] = useState(false);
  const [seasonEmpty, setSeasonEmpty] = useState(false);

  const columns = useMemo(
    () => buildColumns().filter((column) => !(noEvents && column.band === "event")),
    [noEvents],
  );

  const rows = useMemo(() => (seasonEmpty ? [] : store.recruits), [seasonEmpty, store.recruits]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const matched = rows.filter((recruit) => {
      if (needle !== "") {
        const haystack = [recruit.displayName, ...recruit.aliases].join(" ").toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      if (filters.status && recruit.status !== filters.status) return false;
      if (filters.source && !recruit.source.startsWith(filters.source)) return false;
      if (filters.asked && askedLabel(recruit) !== filters.asked) return false;
      if (filters.attended) {
        const attended = recruit.events.some((entry) => entry.attendance !== null);
        if ((filters.attended === "Yes") !== attended) return false;
      }
      for (const [key, value] of Object.entries(filters)) {
        if (["status", "source", "asked", "attended"].includes(key)) continue;
        if (value === "") continue;
        if (valueOf(recruit, key) !== value) return false;
      }
      return true;
    });

    const sorted = [...matched].sort((left, right) => {
      // The default: ladder order, then most recent first contact. Delegated to
      // the Mission Lead in `W1` as reversible and changing no meaning.
      if (sortKey === "ladder") {
        const ladder = LADDER_ORDER[left.status] - LADDER_ORDER[right.status];
        if (ladder !== 0) return ladder;
        return dateKey(right.firstContactOn) - dateKey(left.firstContactOn);
      }
      if (sortKey === "displayName") return left.displayName.localeCompare(right.displayName);
      if (sortKey === "firstContact")
        return dateKey(left.firstContactOn) - dateKey(right.firstContactOn);
      if (sortKey === "status") return LADDER_ORDER[left.status] - LADDER_ORDER[right.status];
      return valueOf(left, sortKey).localeCompare(valueOf(right, sortKey));
    });

    return sortDirection === "asc" ? sorted : sorted.reverse();
  }, [rows, search, filters, sortKey, sortDirection]);

  const activeFilters = Object.entries(filters).filter(([, value]) => value !== "");
  const isFiltered = activeFilters.length > 0 || search.trim() !== "";

  function setFilter(key: string, value: string) {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      if (value === "") delete next[key];
      return next;
    });
  }

  function clearAll() {
    setSearch("");
    setFilters({});
  }

  function setSort(key: string) {
    setSortDirection(sortKey === key && sortDirection === "asc" ? "desc" : "asc");
    setSortKey(key);
  }

  /**
   * A status change from a cell.
   *
   * Every value except the four that take somebody off the board commits on
   * its own, audited, with no interruption — the roster board's in-cell rule.
   * `joined` is intercepted by `W14`; `declined`, `disengaged` and `void` are
   * intercepted by `W13`'s reason step, which is recommended for `disengaged`
   * and required for `void`.
   */
  function commitStatus(recruit: Recruit, status: ProspectStatus) {
    setEditing(null);
    if (status === recruit.status) return;
    if (OFF_BOARD_STATUSES.has(status)) {
      setExitReason("");
      setPendingExit({ id: recruit.id, status });
      return;
    }
    store.setStatus(recruit.id, status, null);
  }

  const pendingRecruit = pendingExit ? store.find(pendingExit.id) : undefined;

  /**
   * The pinned controls.
   *
   * `inDrawer` is what keeps them from being drawn twice at 375px. The shipped
   * roster board shows the pinned set from `md` up and, below it, one `Filters`
   * button that opens the same set in a drawer — a phone that showed both had
   * five stacked selects above a button that opened five more.
   */
  const pinnedControls = (inDrawer: boolean) => (
    <Stack
      direction={{ xs: "column", md: "row" }}
      spacing={2}
      sx={{
        display: inDrawer ? "flex" : { xs: "none", md: "flex" },
        alignItems: { md: "center" },
        flexWrap: "wrap",
        gap: 2,
      }}
    >
      <TextField
        size="small"
        label="Search name or alias"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        sx={{ minWidth: { xs: "100%", md: 260 } }}
      />
      <PinnedSelect
        label="Status"
        value={filters.status ?? ""}
        options={[...PROSPECT_STATUSES]}
        onChange={(value) => setFilter("status", value)}
      />
      <PinnedSelect
        label="Source"
        value={filters.source ?? ""}
        options={["QR", "Walk-up", "Operator"]}
        onChange={(value) => setFilter("source", value)}
      />
      <PinnedSelect
        label="Ask outstanding"
        value={filters.asked ?? ""}
        options={["Not sent", "Outstanding", "Answered"]}
        onChange={(value) => setFilter("asked", value)}
        minWidth={210}
      />
      <PinnedSelect
        label="Attended any event"
        value={filters.attended ?? ""}
        options={["Yes", "No"]}
        onChange={(value) => setFilter("attended", value)}
        minWidth={210}
      />
    </Stack>
  );

  const pinned = pinnedControls(false);

  const chips = isFiltered ? (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", gap: 1 }}>
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
                {labelForKey(columns, key)}:
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

  const heading = (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={2}
      sx={{ alignItems: { sm: "flex-start" }, justifyContent: "space-between" }}
    >
      <Box>
        <Typography variant="h6" component="h1">
          Recruitment
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {`Season ${SEASON_LABEL} · ${visible.length} ${
            visible.length === 1 ? "recruit" : "recruits"
          } · ${noEvents ? 0 : EVENTS.length} recruitment events`}
        </Typography>
      </Box>
      {/*
        `QR CODE` outlined beside `ADD RECRUIT` contained — this application's
        own primary/secondary pairing, in the slot that already existed. Brian,
        2026-08-31: "It should be on the recruit page. It should be at the top
        right, so you can just go get the QR code if you need to."
      */}
      <Stack direction="row" spacing={2}>
        <Button variant="outlined" onClick={onOpenQr} sx={{ minHeight: 44 }}>
          QR code
        </Button>
        <Button variant="contained" onClick={onAddRecruit} sx={{ minHeight: 44 }}>
          Add recruit
        </Button>
      </Stack>
    </Stack>
  );

  const switches = (
    <Scaffold title="Board states">
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <Button
          size="small"
          variant={seasonEmpty ? "contained" : "outlined"}
          onClick={() => setSeasonEmpty((on) => !on)}
        >
          No recruits yet
        </Button>
        <Button
          size="small"
          variant={noEvents ? "contained" : "outlined"}
          onClick={() => setNoEvents((on) => !on)}
        >
          No recruitment events yet
        </Button>
      </Stack>
      <Aside>
        Two exceptions `W1` names. With no recruits the board tells an operator how somebody gets
        onto it rather than saying &ldquo;no results&rdquo;. With no events the Events band is
        <strong> absent rather than empty</strong>, because a band header over no columns is noise.
      </Aside>
      <Aside>
        <strong>Open, and found by building this.</strong> `W13` and `W14` both say a recruit who
        declines or joins is <em>off the board</em>, and the packet makes that &ldquo;a display rule
        read off this one field&rdquo;. But the approved `W1-01` and `W13-01` frames keep{" "}
        <code>declined</code> and <code>disengaged</code> rows on it, and that is what Brian looked
        at. This board follows the frames — everybody is shown, ladder order sinks the exits to the
        bottom, and the Status filter takes them off — so the two readings are visible side by side
        rather than one of them quietly winning. Which it is needs his word.
      </Aside>
    </Scaffold>
  );

  if (visible.length === 0) {
    return (
      <Stack spacing={3}>
        {heading}
        {pinnedControls(true)}
        {chips}
        <Paper variant="outlined" sx={{ p: { xs: 2, md: 4 } }}>
          <Stack spacing={2} sx={{ maxWidth: 640 }}>
            <Typography variant="h6" component="h2">
              {seasonEmpty
                ? "Nobody is on the recruit board yet"
                : "No recruits match these filters"}
            </Typography>
            {seasonEmpty ? (
              <>
                {/*
                  `W1`: "The empty state names the doors rather than saying 'no
                  results' — a board with nothing on it should tell an operator
                  how somebody gets onto it."
                */}
                <Typography color="text.secondary">
                  Three doors put somebody here. All of them create the person and start the
                  recruitment cycle.
                </Typography>
                <Box component="ul" sx={{ m: 0, pl: 3, color: "text.secondary" }}>
                  <li>
                    <strong>They sign themselves in</strong> — a QR code at the stand, pointing at
                    the club&rsquo;s own sign-up page.
                  </li>
                  <li>
                    <strong>Somebody walks up</strong> — recorded on any event&rsquo;s attendance
                    sheet, by anybody taking it.
                  </li>
                  <li>
                    <strong>An operator adds them</strong> — somebody the club went looking for.
                  </li>
                </Box>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <Button variant="contained" onClick={onAddRecruit} sx={{ minHeight: 44 }}>
                    Add recruit
                  </Button>
                  <Button variant="outlined" onClick={onOpenQr} sx={{ minHeight: 44 }}>
                    Get the sign-up QR code
                  </Button>
                </Stack>
              </>
            ) : (
              <>
                <Typography color="text.secondary">
                  The board is available, but the current search and filter combination returned no
                  results.
                </Typography>
                <Button variant="outlined" onClick={clearAll} sx={{ minHeight: 44 }}>
                  Clear filters
                </Button>
              </>
            )}
          </Stack>
        </Paper>
        {switches}
      </Stack>
    );
  }

  return (
    <Stack spacing={3}>
      {heading}
      {pinned}
      {chips}

      <TableContainer
        component={Paper}
        variant="outlined"
        sx={{
          display: { xs: "none", md: "block" },
          maxHeight: "calc(100dvh - 340px)",
          overflow: "auto",
        }}
        data-testid="recruit-board"
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
              {groupRuns(columns).map((run) => (
                <TableCell
                  key={run.bandKey}
                  colSpan={run.span}
                  sx={{
                    top: 0,
                    bgcolor: run.header,
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
                    {run.label}
                  </Typography>
                </TableCell>
              ))}
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
                  active={sortKey === "displayName"}
                  direction={sortKey === "displayName" ? sortDirection : "asc"}
                  onClick={() => setSort("displayName")}
                >
                  Recruit
                </TableSortLabel>
                <Typography variant="caption" sx={{ display: "block", lineHeight: 1.3 }}>
                  &nbsp;
                </Typography>
              </TableCell>

              {columns.map((column) => {
                const colours = bandColoursOf(column);
                const filtered = (filters[column.key] ?? "") !== "";
                return (
                  <TableCell
                    key={column.key}
                    sx={{
                      top: BAND_ROW_HEIGHT,
                      bgcolor: colours.solid,
                      minWidth: column.width,
                      width: column.width,
                      verticalAlign: "bottom",
                      whiteSpace: "nowrap",
                      borderBottom: filtered ? 2 : 1,
                      borderBottomColor: filtered ? "primary.main" : "divider",
                      borderRight: isBandEnd(columns, column) ? 2 : 0,
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
                    <ColumnCaption column={column} filtered={filters[column.key]} />
                  </TableCell>
                );
              })}
            </TableRow>
          </TableHead>

          <TableBody>
            {visible.map((recruit) => (
              <TableRow key={recruit.id} hover data-testid="recruit-row">
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
                  <Button
                    onClick={() => onOpenRecruit(recruit.id)}
                    sx={{
                      textAlign: "left",
                      justifyContent: "flex-start",
                      p: 0,
                      textTransform: "none",
                      fontWeight: 600,
                      minWidth: 0,
                    }}
                  >
                    {recruit.displayName}
                  </Button>
                </TableCell>

                {columns.map((column) => (
                  <Cell
                    key={column.key}
                    recruit={recruit}
                    column={column}
                    editing={editing?.id === recruit.id && editing.key === column.key}
                    bandEnd={isBandEnd(columns, column)}
                    onOpen={() => setEditing({ id: recruit.id, key: column.key })}
                    onClose={() => setEditing(null)}
                    onCommitStatus={(next) => commitStatus(recruit, next)}
                    onCommitText={(value) =>
                      store.setRecruitmentField(
                        recruit.id,
                        column.key === "source" ? "source" : "firstContactOn",
                        value,
                      )
                    }
                    onOpenRecruit={() => onOpenRecruit(recruit.id)}
                  />
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/*
        The phone view — `roster-board.tsx`'s own card, not a miniature board.
        A name, a status and a way in. There is no in-cell editing at 375px;
        editing is desktop work and the phone is for finding somebody and
        opening them.
      */}
      <Box sx={{ display: { xs: "block", md: "none" } }}>
        <Button variant="outlined" onClick={() => setPhoneFilters(true)} sx={{ mb: 2 }}>
          Filters{activeFilters.length > 0 ? ` (${activeFilters.length})` : ""}
        </Button>
        <Stack spacing={2}>
          {visible.map((recruit) => (
            <Card key={recruit.id} variant="outlined" sx={{ p: 0 }}>
              <Box
                component="button"
                type="button"
                onClick={() => onOpenRecruit(recruit.id)}
                sx={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  p: 2,
                  minHeight: 44,
                  border: "none",
                  bgcolor: "transparent",
                  cursor: "pointer",
                  borderRadius: 1,
                  "&:hover": { bgcolor: "action.hover" },
                }}
              >
                <Stack spacing={1}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    {recruit.displayName}
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
                    <StatusChip status={recruit.status} />
                    <Chip size="small" variant="outlined" label={recruit.source} />
                  </Stack>
                </Stack>
              </Box>
            </Card>
          ))}
        </Stack>
      </Box>

      <Dialog open={phoneFilters} onClose={() => setPhoneFilters(false)} fullWidth>
        <DialogContent>
          <Stack spacing={2}>{pinnedControls(true)}</Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPhoneFilters(false)}>Done</Button>
        </DialogActions>
      </Dialog>

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
          ? distinctValues(rows, menu.column.key).map((option) => (
              <MenuItem
                key={option}
                selected={(filters[menu.column.key] ?? "") === option}
                onClick={() => {
                  setFilter(menu.column.key, option);
                  setMenu(null);
                }}
              >
                {option}
              </MenuItem>
            ))
          : null}
      </Menu>

      {pendingRecruit && pendingExit ? (
        pendingExit.status === "joined" ? (
          <FlipDialog
            recruit={pendingRecruit}
            onCancel={() => setPendingExit(null)}
            onConfirm={() => {
              store.setStatus(pendingExit.id, "joined", null);
              setPendingExit(null);
            }}
          />
        ) : (
          <ExitDialog
            recruit={pendingRecruit}
            status={pendingExit.status}
            reason={exitReason}
            onReason={setExitReason}
            onCancel={() => setPendingExit(null)}
            onConfirm={() => {
              store.setStatus(pendingExit.id, pendingExit.status, exitReason.trim() || null);
              setPendingExit(null);
            }}
          />
        )
      ) : null}

      <Scaffold title="What every commit wrote">
        {store.audit.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Nothing yet. Change a status in a cell, or edit a source, and the audit line appears
            here.
          </Typography>
        ) : (
          <Stack spacing={0.75}>
            {store.audit.slice(0, 8).map((entry) => (
              <Box key={entry.id}>
                <Typography variant="body2">{entry.what}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {entry.who}
                  {entry.detail ? ` · ${entry.detail}` : ""}
                </Typography>
              </Box>
            ))}
          </Stack>
        )}
        <Aside>
          In the real implementation this goes onto the recruit&rsquo;s own status history, so a
          change made on the board is answerable in the same place as one made on the record. The
          dashed panel exists because &ldquo;every commit writes an audit event&rdquo; is otherwise
          an invisible claim.
        </Aside>
      </Scaffold>

      {switches}
    </Stack>
  );
}

/**
 * `W14` — the interruption.
 *
 * Brian, 2026-08-31: "When it flips to 'Join,' there should be a pop-up that
 * comes up… they're now joined, they joined this season, and they're moved on
 * to Onboard." So it names the three consequences and the season, and nothing
 * else — and it says plainly what it does **not** do, because "on the team" is
 * not "active" and activation is a separate later human gate that belongs to
 * onboarding.
 */
function FlipDialog({
  recruit,
  onCancel,
  onConfirm,
}: {
  recruit: Recruit;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>
        {`Add ${recruit.displayName} to ${SEASON_LABEL}?`}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Joining is a membership, and it is the hand-off out of recruitment.
        </Typography>
        <Box component="dl" sx={{ m: 0 }}>
          <FlipRow label="Creates" value={`A season membership for ${SEASON_LABEL}`} />
          <FlipRow label="Puts them on" value="The roster, as joined" />
          <FlipRow label="Opens" value="Onboarding" />
          <FlipRow
            label="Does not"
            value="Make them active. That stays a separate later step, at the end of onboarding."
          />
          <FlipRow
            label="Recorded as"
            value="Flipped by Caspian Hallowfield, Secretary · audited"
          />
        </Box>
        <Aside>
          Missing information never blocks this. Whatever was not collected becomes
          onboarding&rsquo;s work, and there is deliberately no duplicate check here — the person
          has existed for weeks.
        </Aside>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="contained" onClick={onConfirm} sx={{ minHeight: 44 }}>
          Add to the season
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function FlipRow({ label, value }: { label: string; value: string }) {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={{ xs: 0.25, sm: 2 }}
      sx={{ py: 1, borderTop: 1, borderColor: "divider", "&:first-of-type": { borderTop: "none" } }}
    >
      <Typography component="dt" variant="body2" color="text.secondary" sx={{ minWidth: 140 }}>
        {label}
      </Typography>
      <Typography component="dd" variant="body2" sx={{ m: 0 }}>
        {value}
      </Typography>
    </Stack>
  );
}

/**
 * `W13` — leaving the board.
 *
 * A status change and nothing more. Nothing is deleted, nothing is archived,
 * the history stays intact, and the board resorts. The reason is
 * **recommended** for `disengaged` and **required** for `void`, because a
 * mistake worth recording is worth explaining; `declined` asks for none,
 * because the recruit already gave it.
 */
function ExitDialog({
  recruit,
  status,
  reason,
  onReason,
  onCancel,
  onConfirm,
}: {
  recruit: Recruit;
  status: ProspectStatus;
  reason: string;
  onReason: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const reasonRequired = status === "void";
  const blocked = reasonRequired && reason.trim() === "";
  return (
    <Dialog open onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>
        {`Take ${recruit.givenName} off the board as ${status}?`}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2 }}>
          {STATUS_MEANING[status]}
        </Typography>
        <Box component="dl" sx={{ m: 0, mb: 2 }}>
          <FlipRow
            label="What changes"
            value="The status. The board resorts and they drop off it."
          />
          <FlipRow
            label="What stops"
            value="Everything. Nothing is sent to them again while the status stands."
          />
          <FlipRow
            label="What is kept"
            value="All of it. No archive, no delete — their record and their history are untouched."
          />
          {status === "disengaged" ? (
            <FlipRow
              label="Recoverable"
              value="Yes. People resurface in Hilary; setting them back to engaged keeps the history."
            />
          ) : null}
        </Box>
        {status === "declined" ? (
          <Aside>
            No reason is asked for. They gave one, and the club writes down what they were told
            rather than asking the operator to justify it.
          </Aside>
        ) : (
          <TextField
            label={reasonRequired ? "Reason (required)" : "Reason (recommended)"}
            value={reason}
            onChange={(event) => onReason(event.target.value)}
            fullWidth
            multiline
            minRows={2}
            required={reasonRequired}
            helperText={
              reasonRequired
                ? "Voiding says the record is wrong, not that the person is. That is worth explaining."
                : "A judgement rather than something you were told, so it is worth saying why."
            }
          />
        )}
        {status === "void" ? (
          <Aside>
            <strong>Still open.</strong> `void` is drawn here as a seventh status value because that
            is what the schema has. `W13` recommends the opposite — a separate marker, leaving six
            values that are all about the person — so that a record marked committed by mistake
            keeps the status it had, and so un-voiding is trivial. That needs Brian&rsquo;s word.
          </Aside>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="contained" onClick={onConfirm} disabled={blocked} sx={{ minHeight: 44 }}>
          {`Set ${status}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

function Cell({
  recruit,
  column,
  editing,
  bandEnd,
  onOpen,
  onClose,
  onCommitStatus,
  onCommitText,
  onOpenRecruit,
}: {
  recruit: Recruit;
  column: ColumnDef;
  editing: boolean;
  bandEnd: boolean;
  onOpen: () => void;
  onClose: () => void;
  onCommitStatus: (next: ProspectStatus) => void;
  onCommitText: (value: string) => void;
  onOpenRecruit: () => void;
}) {
  const colours = bandColoursOf(column);
  const shell = {
    bgcolor: colours.tint,
    minWidth: column.width,
    width: column.width,
    whiteSpace: "nowrap" as const,
    borderRight: bandEnd ? 2 : 0,
    borderRightColor: "background.paper",
  };

  if (editing && column.key === "status") {
    return (
      <TableCell sx={shell}>
        <Select
          size="small"
          open
          autoFocus
          value={recruit.status}
          onClose={onClose}
          onChange={(event) => onCommitStatus(event.target.value as ProspectStatus)}
          renderValue={() => recruit.status}
          sx={{ width: Math.max(column.width - 24, 64) }}
        >
          {PROSPECT_STATUSES.map((option) => (
            <MenuItem key={option} value={option}>
              <Stack>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {option}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {STATUS_MEANING[option]}
                </Typography>
              </Stack>
            </MenuItem>
          ))}
        </Select>
      </TableCell>
    );
  }

  if (editing && column.edit === "text") {
    return (
      <TableCell sx={shell}>
        <TextField
          size="small"
          autoFocus
          defaultValue={valueOf(recruit, column.key)}
          onBlur={(event) => {
            onCommitText(event.target.value);
            onClose();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") (event.target as HTMLInputElement).blur();
            if (event.key === "Escape") onClose();
          }}
          sx={{ width: Math.max(column.width - 24, 64) }}
        />
      </TableCell>
    );
  }

  const editable = column.edit === "select" || column.edit === "text";

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
      <CellValue recruit={recruit} column={column} onOpenRecruit={onOpenRecruit} />
    </TableCell>
  );
}

function CellValue({
  recruit,
  column,
  onOpenRecruit,
}: {
  recruit: Recruit;
  column: ColumnDef;
  onOpenRecruit: () => void;
}) {
  if (column.key === "status") return <StatusChip status={recruit.status} />;

  if (column.key === "contactable") {
    // Contactability indicators only. A raw contact value never appears on any
    // grid, board or queue in this product — Task 08 § 5.
    if (!recruit.mobile && !recruit.email) {
      return (
        <Typography variant="body2" color="text.disabled">
          {NOT_RECORDED}
        </Typography>
      );
    }
    return (
      <Stack direction="row" spacing={0.5}>
        {recruit.mobile ? <Chip size="small" variant="outlined" label="Mobile" /> : null}
        {recruit.email ? <Chip size="small" variant="outlined" label="Email" /> : null}
      </Stack>
    );
  }

  const text = valueOf(recruit, column.key);

  if (column.edit === "record") {
    return (
      <Tooltip title="Opens the person record — Mission 5's rules apply" placement="top">
        <Typography
          component="button"
          type="button"
          onClick={onOpenRecruit}
          variant="body2"
          sx={{
            border: "none",
            bgcolor: "transparent",
            p: 0,
            font: "inherit",
            cursor: "pointer",
            color: text === NOT_RECORDED ? "text.disabled" : "text.primary",
            textDecoration: text === NOT_RECORDED ? "none" : "underline dotted",
            textUnderlineOffset: 3,
          }}
        >
          {text}
        </Typography>
      </Tooltip>
    );
  }

  if (column.key === "notes") {
    return (
      <Typography
        variant="body2"
        sx={{
          color: text === NOT_RECORDED ? "text.disabled" : "text.primary",
          maxWidth: column.width,
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {text}
      </Typography>
    );
  }

  return (
    <Typography
      variant="body2"
      sx={{
        color: text === NOT_RECORDED ? "text.disabled" : "text.primary",
        fontStyle: text === NOT_RECORDED ? "italic" : "normal",
      }}
    >
      {text}
    </Typography>
  );
}

function ColumnCaption({ column, filtered }: { column: ColumnDef; filtered?: string }) {
  if (filtered) {
    return (
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
        {filtered}
      </Typography>
    );
  }
  if (column.edit === "record") {
    return (
      <Typography
        variant="caption"
        sx={{ display: "block", color: "text.disabled", lineHeight: 1.3 }}
      >
        edit on the record
      </Typography>
    );
  }
  if (column.key === "contactable") {
    return (
      <Typography
        variant="caption"
        sx={{ display: "block", color: "text.disabled", lineHeight: 1.3 }}
      >
        indicators only
      </Typography>
    );
  }
  if (column.edit === "select" || column.edit === "text") {
    return (
      <Typography
        variant="caption"
        sx={{ display: "block", color: "text.disabled", lineHeight: 1.3 }}
      >
        edit here
      </Typography>
    );
  }
  return (
    <Typography variant="caption" sx={{ display: "block", lineHeight: 1.3 }}>
      &nbsp;
    </Typography>
  );
}

function PinnedSelect({
  label,
  value,
  options,
  onChange,
  minWidth,
}: {
  label: string;
  value: string;
  options: readonly string[];
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
            {option}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

/** The funnel, in a bordered button — the shape Brian chose on 2026-08-28 from four options. */
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

// ---------------------------------------------------------------------------

function labelForKey(columns: readonly ColumnDef[], key: string): string {
  if (key === "asked") return "Ask";
  if (key === "attended") return "Attended";
  return columns.find((column) => column.key === key)?.label ?? key;
}

function distinctValues(rows: readonly Recruit[], key: string): readonly string[] {
  return [...new Set(rows.map((recruit) => valueOf(recruit, key)))].sort();
}

function groupRuns(
  columns: readonly ColumnDef[],
): { bandKey: string; label: string; header: string; span: number }[] {
  const runs: { bandKey: string; label: string; header: string; span: number }[] = [];
  for (const column of columns) {
    const last = runs[runs.length - 1];
    if (last && last.bandKey === column.bandKey) last.span += 1;
    else
      runs.push({
        bandKey: column.bandKey,
        label: column.bandLabel,
        header: bandColoursOf(column).header,
        span: 1,
      });
  }
  return runs;
}

/** The seam between bands, drawn in the header and every body cell alike. */
function isBandEnd(columns: readonly ColumnDef[], column: ColumnDef): boolean {
  const index = columns.indexOf(column);
  const next = columns[index + 1];
  return !next || next.bandKey !== column.bandKey;
}
