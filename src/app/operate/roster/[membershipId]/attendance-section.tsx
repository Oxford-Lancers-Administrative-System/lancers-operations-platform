"use client";

import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import { Field } from "@/components/field";
import { Fact, FactGrid, NotRecorded } from "@/components/fact";
import { RowCard, RowCardList } from "@/components/row-card";
import { TableFrame } from "@/components/sortable-header";
import { EmptyState } from "@/components/empty-state";
import { StatusChip } from "@/components/status-chip";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TableSortLabel from "@mui/material/TableSortLabel";
import Typography from "@mui/material/Typography";

import { isShowedPresence } from "@/lib/services/attendance-vocabulary";
import type { AttendanceEvent } from "@/lib/services/player-record";
import { formatDay } from "../presentation";
import {
  ATTENDANCE_LABEL,
  COLUMNS,
  comparable,
  countUnrecordedOccurredMandatory,
  DEFAULT_FILTERS,
  EVENT_STATUS_LABEL,
  FILTER_LABEL,
  FILTER_OPTIONS,
  FILTERABLE,
  filterLabel,
  type FilterKey,
  RSVP_LABEL,
  type SortKey,
} from "./attendance-filters";
import { FilterButton, ValueOrNotRecorded } from "./attendance-table-bits";

/**
 * `WP-player-record`'s Attendance band — `Q15-attendance`, corrected at W1/W2
 * (Brian's walkthrough, `Q-19`): this season's RSVP and attendance history,
 * read-only, with a mandatory-attendance score that follows the same four
 * filters (Mandatory, RSVP, Attendance, Event status) the table applies.
 */
export default function AttendanceSection({ events }: { events: readonly AttendanceEvent[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "date",
    dir: "desc",
  });
  const [filters, setFilters] = useState<Record<FilterKey, string>>(() => ({ ...DEFAULT_FILTERS }));
  const [menu, setMenu] = useState<{ anchor: HTMLElement; key: FilterKey } | null>(null);

  const setFilter = (key: FilterKey, value: string) =>
    setFilters((current) => ({ ...current, [key]: value }));
  // "Widen it to everything" (W1) — clearing removes every filter, including
  // the Event status default, rather than restoring it. The default only ever
  // governs the very first render.
  const clearAll = () => setFilters({ isMandatory: "", rsvp: "", attendance: "", eventStatus: "" });
  const activeFilters = (Object.entries(filters) as [FilterKey, string][]).filter(
    ([, value]) => value !== "",
  );
  const isFiltered = activeFilters.length > 0;

  const filtered = useMemo(
    () =>
      events.filter((event) =>
        activeFilters.every(([key, wanted]) => filterLabel(event, key) === wanted),
      ),
    [events, activeFilters],
  );

  const sorted = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort(
      (a, b) =>
        comparable(a, sort.key).localeCompare(comparable(b, sort.key), "en-GB", { numeric: true }) *
        dir,
    );
  }, [filtered, sort]);

  // Mandatory, and carrying an attendance record — the only rows the score
  // reads, out of exactly the set the filters have left standing. An upcoming
  // event and a cancelled invitation both drop out here because both have
  // `attendance: null`, not because either was special-cased.
  const scored = filtered.filter((event) => event.isMandatory && event.attendance !== null);
  const attended = scored.filter((event) => isShowedPresence(event.attendance));
  const pct = scored.length === 0 ? null : Math.round((attended.length / scored.length) * 100);
  // W2/Q-19: occurred mandatory events with no attendance record, out of the
  // same filtered set the score above reads — "occurred" is asked explicitly
  // here (rather than only via the Event status filter) so widening that
  // filter to show upcoming events too never counts one of *those* as
  // unrecorded. Neither attended nor missed; a value that cannot be derived
  // says so, per REQ-not-recorded, rather than being silently absorbed into
  // the score. Kept as one small, named count — easy to change to a
  // miss-counting denominator instead, should Brian reverse W2's call.
  const unrecordedCount = countUnrecordedOccurredMandatory(filtered);
  const unrecordedLabel =
    unrecordedCount === 0
      ? null
      : `${unrecordedCount} attendant${unrecordedCount === 1 ? "" : "s"} not recorded`;

  const cycleSort = (key: SortKey) => {
    setSort((current) => ({
      key,
      dir: current.key === key && current.dir === "asc" ? "desc" : "asc",
    }));
  };

  const chips = isFiltered ? (
    <Stack
      direction="row"
      spacing={1}
      sx={{ alignItems: "center", flexWrap: "wrap", gap: 1, pb: 1.5 }}
      data-testid="attendance-filter-chips"
    >
      <Typography variant="body2" color="text.secondary">
        Filtered by
      </Typography>
      {activeFilters.map(([key, value]) => (
        <Chip
          key={key}
          label={
            <>
              <Box component="span" sx={{ fontWeight: 700 }}>
                {FILTER_LABEL[key]}:
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

  return (
    <Box>
      <Stack
        direction="row"
        spacing={1.5}
        sx={{ alignItems: "baseline", flexWrap: "wrap", gap: 1, pb: 1.5 }}
      >
        {pct === null ? (
          <Typography
            variant="body2"
            data-testid="attendance-score"
            sx={{ color: "text.disabled", fontStyle: "italic" }}
          >
            {["not recorded", unrecordedLabel].filter(Boolean).join(" · ")}
          </Typography>
        ) : (
          <Typography variant="body2" data-testid="attendance-score" sx={{ fontWeight: 700 }}>
            {[`${attended.length} of ${scored.length} mandatory · ${pct}%`, unrecordedLabel]
              .filter(Boolean)
              .join(" · ")}
          </Typography>
        )}
        <Typography variant="caption" color="text.secondary">
          Mandatory attendance
        </Typography>
        {isFiltered ? (
          <Chip size="small" color="primary" variant="outlined" label="Filtered" />
        ) : null}
      </Stack>

      {chips}

      {events.length === 0 ? (
        <EmptyState title="No invitations sent this season." />
      ) : (
        <>
          {/* Tablet and up: a sortable, filterable table — the board's own idiom. */}
          <Box sx={{ display: { xs: "none", md: "block" } }} data-testid="attendance-desktop">
            <TableFrame>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {COLUMNS.map((column) => (
                      <TableCell key={column.key}>
                        <Stack
                          direction="row"
                          spacing={0.5}
                          sx={{ alignItems: "center", justifyContent: "space-between" }}
                        >
                          <TableSortLabel
                            active={sort.key === column.key}
                            direction={sort.key === column.key ? sort.dir : "asc"}
                            onClick={() => cycleSort(column.key)}
                          >
                            {column.label}
                          </TableSortLabel>
                          {column.filterKey ? (
                            <FilterButton
                              label={column.label}
                              active={filters[column.filterKey] !== ""}
                              onOpen={(anchor) =>
                                setMenu({ anchor, key: column.filterKey as FilterKey })
                              }
                            />
                          ) : null}
                        </Stack>
                        {column.filterKey && filters[column.filterKey] !== "" ? (
                          <Typography
                            variant="caption"
                            sx={{
                              display: "block",
                              color: "primary.main",
                              fontWeight: 700,
                              lineHeight: 1.3,
                            }}
                          >
                            {filters[column.filterKey]}
                          </Typography>
                        ) : null}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sorted.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={COLUMNS.length}>
                        <EmptyState
                          title="No events match the current filters."
                          actions={<Button onClick={clearAll}>Clear all</Button>}
                        />
                      </TableCell>
                    </TableRow>
                  ) : (
                    sorted.map((event) => (
                      <TableRow key={event.id} data-testid="attendance-row">
                        <TableCell>{event.eventName}</TableCell>
                        <TableCell>
                          <ValueOrNotRecorded
                            value={event.date === null ? null : formatDay(event.date)}
                          />
                        </TableCell>
                        <TableCell>{event.isMandatory ? "Yes" : "No"}</TableCell>
                        <TableCell>
                          <ValueOrNotRecorded
                            value={event.rsvp === null ? null : RSVP_LABEL[event.rsvp]}
                          />
                        </TableCell>
                        <TableCell>
                          <ValueOrNotRecorded
                            value={
                              event.attendance === null ? null : ATTENDANCE_LABEL[event.attendance]
                            }
                          />
                        </TableCell>
                        <TableCell>{EVENT_STATUS_LABEL[event.eventStatus]}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableFrame>
          </Box>

          {/* Below the board's breakpoint: a table and a header funnel both have
              nowhere to go at 375px. Each event stacks as its own labelled
              block; the same three filters become compact selects, and
              sorting gets a field picker plus a direction toggle. */}
          <Box sx={{ display: { xs: "block", md: "none" } }} data-testid="attendance-phone">
            <Stack direction="row" spacing={1} sx={{ pb: 1, flexWrap: "wrap", gap: 1 }}>
              {FILTERABLE.map((column) => (
                <Field
                  select
                  key={column.key}
                  value={filters[column.key]}
                  onChange={(event) => setFilter(column.key, event.target.value)}
                  slotProps={{
                    select: {
                      displayEmpty: true,
                      inputProps: { "aria-label": `Filter ${column.label}` },
                    },
                  }}
                  sx={{ minWidth: 132, flexGrow: 1 }}
                >
                  <MenuItem value="">{`${column.label}: All`}</MenuItem>
                  {column.options.map((option) => (
                    <MenuItem key={option} value={option}>
                      {`${column.label}: ${option}`}
                    </MenuItem>
                  ))}
                </Field>
              ))}
            </Stack>
            <Stack direction="row" spacing={1} sx={{ pb: 1.5 }}>
              <Field
                select
                value={sort.key}
                onChange={(event) => cycleSort(event.target.value as SortKey)}
                slotProps={{ select: { inputProps: { "aria-label": "Sort attendance by" } } }}
                sx={{ flexGrow: 1 }}
              >
                {COLUMNS.map((column) => (
                  <MenuItem key={column.key} value={column.key}>
                    {`Sort: ${column.label}`}
                  </MenuItem>
                ))}
              </Field>
              <Box
                component="button"
                type="button"
                aria-label={
                  sort.dir === "asc"
                    ? "Sorted ascending — tap to reverse"
                    : "Sorted descending — tap to reverse"
                }
                onClick={() =>
                  setSort((current) => ({
                    ...current,
                    dir: current.dir === "asc" ? "desc" : "asc",
                  }))
                }
                sx={{
                  minWidth: 44,
                  minHeight: 44,
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 1,
                  bgcolor: "transparent",
                  cursor: "pointer",
                  fontSize: 18,
                  lineHeight: 1,
                }}
              >
                {sort.dir === "asc" ? "↑" : "↓"}
              </Box>
            </Stack>
            {sorted.length === 0 ? (
              <EmptyState
                title="No events match the current filters."
                actions={<Button onClick={clearAll}>Clear all</Button>}
              />
            ) : (
              <RowCardList>
                {sorted.map((event) => (
                  <RowCard
                    key={event.id}
                    testId="attendance-card"
                    title={event.eventName}
                    sublines={[
                      event.date === null ? <NotRecorded /> : formatDay(event.date),
                      <FactGrid key="facts" columns={2}>
                        <Fact label="Mandatory" value={event.isMandatory ? "Yes" : "No"} />
                        <Fact
                          label="RSVP"
                          value={
                            event.rsvp === null ? null : (
                              <StatusChip
                                domain="rsvp"
                                status={event.rsvp}
                                label={RSVP_LABEL[event.rsvp]}
                              />
                            )
                          }
                        />
                        <Fact
                          label="Attendance"
                          value={
                            event.attendance === null ? null : (
                              <StatusChip
                                domain="attendance"
                                status={event.attendance}
                                label={ATTENDANCE_LABEL[event.attendance]}
                              />
                            )
                          }
                        />
                        <Fact
                          label="Event status"
                          value={
                            <StatusChip
                              domain="event"
                              status={event.eventStatus}
                              label={EVENT_STATUS_LABEL[event.eventStatus]}
                            />
                          }
                        />
                      </FactGrid>,
                    ]}
                  />
                ))}
              </RowCardList>
            )}
          </Box>
        </>
      )}

      {/* One filter, two controls — the header funnel and this menu — the same
          relationship the board's own column filters have. */}
      <Menu
        open={menu !== null}
        anchorEl={menu?.anchor ?? null}
        onClose={() => setMenu(null)}
        slotProps={{ paper: { sx: { maxHeight: 360 } } }}
      >
        <MenuItem
          selected={(menu ? filters[menu.key] : "") === ""}
          onClick={() => {
            if (menu) setFilter(menu.key, "");
            setMenu(null);
          }}
        >
          <em>All</em>
        </MenuItem>
        <Divider />
        {menu
          ? FILTER_OPTIONS[menu.key].map((option) => (
              <MenuItem
                key={option}
                selected={filters[menu.key] === option}
                onClick={() => {
                  setFilter(menu.key, option);
                  setMenu(null);
                }}
              >
                {option}
              </MenuItem>
            ))
          : null}
      </Menu>
    </Box>
  );
}
