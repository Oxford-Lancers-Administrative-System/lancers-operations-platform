"use client";

import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TableSortLabel from "@mui/material/TableSortLabel";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

import { isShowedPresence } from "@/lib/services/attendance-vocabulary";
import type { AttendanceEvent } from "@/lib/services/player-record";
import { formatDay } from "../presentation";

/**
 * `WP-player-record`'s Attendance band — `Q15-attendance`, corrected at W1/W2
 * (Brian's walkthrough, `Q-19`). Brian ruled the prose stands over the
 * approved photographs' silence: this season's RSVP and attendance history
 * renders here, read-only, from Mission 2's own tables. The design is a
 * running mockup Brian saw and approved (`chore/roster-fidelity-attendance`'s
 * `attendance-section.tsx`), not a description — this component follows its
 * behaviour, restyled for the real violet band rather than copied wholesale.
 *
 * ## Rows
 *
 * Every event this membership had an invitation **sent** for, this season —
 * `readAttendanceHistoryIn()` already filtered out `pending`, so every row
 * here really was asked. That includes events that have not happened yet;
 * the **Event status** column and its filter (W1) are what let an operator
 * tell those apart from what already occurred, on a table defaulted to
 * showing only the latter.
 *
 * ## What counts toward the score
 *
 * `present` and `late` both count as attended (`isShowedPresence`, unmodified
 * from `attendance.ts`'s own board); `absent` and `excused` do not. The
 * denominator is **mandatory events that carry an attendance record** — not
 * every mandatory invitation. An upcoming event and a cancelled invitation
 * both hold no record yet and are excluded from the score the same way, for
 * different reasons: one rule, reading attendance rather than the calendar or
 * the invitation status, covers both without a special case for "upcoming".
 *
 * A third figure (W2) counts **occurred mandatory events with no attendance
 * record** — the ones Brian's walkthrough found sitting in the table, unequal
 * to the score above it, that neither attended nor missed anything. It reads
 * "N attendants not recorded" and is absent, not zero, when there are none.
 *
 * ## The score follows the filter
 *
 * Mandatory, RSVP, Attendance and Event status each filter the section — the
 * board's own funnel-in-a-bordered-button interaction, restyled here rather
 * than imported, because `roster-board.tsx` is LAN-186's and this package
 * does not edit it. The score always reads the same set the table or the
 * cards are currently showing, with a `Filtered` chip and a "Filtered by …
 * Clear all" row saying which set that is, in labels and values — Event
 * status defaults to `Occurred` (W1) and shows in that row exactly like any
 * other active filter, so the default is visible and reversible rather than
 * hidden.
 *
 * ## Two shapes, one dataset
 *
 * A table with sortable, filterable header cells at and above the board's own
 * breakpoint; a stack of labelled blocks below it, each event its own card,
 * with the same four filters as compact selects and a sort field-plus-
 * direction control, because a six-column row and a header funnel both have
 * nowhere to go at 375px.
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
          size="small"
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
        <Typography color="text.secondary" sx={{ py: 2 }}>
          No invitations sent this season.
        </Typography>
      ) : (
        <>
          {/* Tablet and up: a sortable, filterable table — the board's own idiom. */}
          <Box sx={{ display: { xs: "none", md: "block" } }} data-testid="attendance-desktop">
            <TableContainer sx={{ overflowX: "auto" }}>
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
                        <Typography color="text.secondary" sx={{ py: 1 }}>
                          No events match the current filters.
                        </Typography>
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
            </TableContainer>
          </Box>

          {/* Below the board's breakpoint: a table and a header funnel both have
              nowhere to go at 375px. Each event stacks as its own labelled
              block; the same three filters become compact selects, and
              sorting gets a field picker plus a direction toggle. */}
          <Box sx={{ display: { xs: "block", md: "none" } }} data-testid="attendance-phone">
            <Stack direction="row" spacing={1} sx={{ pb: 1, flexWrap: "wrap", gap: 1 }}>
              {FILTERABLE.map((column) => (
                <Select
                  key={column.key}
                  size="small"
                  displayEmpty
                  value={filters[column.key]}
                  onChange={(event) => setFilter(column.key, event.target.value)}
                  inputProps={{ "aria-label": `Filter ${column.label}` }}
                  sx={{ minWidth: 132, flexGrow: 1 }}
                >
                  <MenuItem value="">{`${column.label}: All`}</MenuItem>
                  {column.options.map((option) => (
                    <MenuItem key={option} value={option}>
                      {`${column.label}: ${option}`}
                    </MenuItem>
                  ))}
                </Select>
              ))}
            </Stack>
            <Stack direction="row" spacing={1} sx={{ pb: 1.5 }}>
              <Select
                size="small"
                value={sort.key}
                onChange={(event) => cycleSort(event.target.value as SortKey)}
                inputProps={{ "aria-label": "Sort attendance by" }}
                sx={{ flexGrow: 1 }}
              >
                {COLUMNS.map((column) => (
                  <MenuItem key={column.key} value={column.key}>
                    {`Sort: ${column.label}`}
                  </MenuItem>
                ))}
              </Select>
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
              <Typography color="text.secondary" sx={{ py: 1 }}>
                No events match the current filters.
              </Typography>
            ) : (
              <Stack spacing={1.5}>
                {sorted.map((event) => (
                  <Box
                    key={event.id}
                    data-testid="attendance-card"
                    sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.5 }}
                  >
                    <Stack direction="row" sx={{ justifyContent: "space-between", gap: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {event.eventName}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
                        {event.date === null ? "not recorded" : formatDay(event.date)}
                      </Typography>
                    </Stack>
                    <Stack
                      direction="row"
                      spacing={2.5}
                      sx={{ pt: 0.75, flexWrap: "wrap", rowGap: 0.5 }}
                    >
                      <CardStat label="Mandatory" value={event.isMandatory ? "Yes" : "No"} />
                      <CardStat
                        label="RSVP"
                        value={event.rsvp === null ? null : RSVP_LABEL[event.rsvp]}
                      />
                      <CardStat
                        label="Attendance"
                        value={
                          event.attendance === null ? null : ATTENDANCE_LABEL[event.attendance]
                        }
                      />
                      <CardStat
                        label="Event status"
                        value={EVENT_STATUS_LABEL[event.eventStatus]}
                      />
                    </Stack>
                  </Box>
                ))}
              </Stack>
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

type SortKey = "eventName" | "date" | "isMandatory" | "rsvp" | "attendance" | "eventStatus";
type FilterKey = "isMandatory" | "rsvp" | "attendance" | "eventStatus";

const COLUMNS: readonly { key: SortKey; label: string; filterKey?: FilterKey }[] = Object.freeze([
  { key: "eventName", label: "Event" },
  { key: "date", label: "Date" },
  { key: "isMandatory", label: "Mandatory", filterKey: "isMandatory" },
  { key: "rsvp", label: "RSVP", filterKey: "rsvp" },
  { key: "attendance", label: "Attendance", filterKey: "attendance" },
  // Appended rather than inserted earlier (W1) — the five existing columns
  // keep their own order and behaviour exactly; this is the one new column.
  { key: "eventStatus", label: "Event status", filterKey: "eventStatus" },
]);

/**
 * Defaults the table to `Occurred` (W1, Q-19) — Brian's walkthrough found
 * every invited event on screen, including ones that had not happened yet,
 * above a score that only ever counted occurred ones. `clearAll()` below
 * drops this back to "everything", same as any other filter.
 */
const DEFAULT_FILTERS: Readonly<Record<FilterKey, string>> = Object.freeze({
  isMandatory: "",
  rsvp: "",
  attendance: "",
  eventStatus: "Occurred",
});

const FILTER_LABEL: Readonly<Record<FilterKey, string>> = Object.freeze({
  isMandatory: "Mandatory",
  rsvp: "RSVP",
  attendance: "Attendance",
  eventStatus: "Event status",
});

const FILTER_OPTIONS: Readonly<Record<FilterKey, readonly string[]>> = Object.freeze({
  isMandatory: ["Mandatory", "Not mandatory"],
  rsvp: ["Yes", "No", "Not recorded"],
  attendance: ["Present", "Late", "Absent", "Excused", "Not recorded"],
  eventStatus: ["Occurred", "Upcoming", "Cancelled"],
});

const FILTERABLE: readonly { key: FilterKey; label: string; options: readonly string[] }[] =
  Object.freeze([
    { key: "isMandatory", label: FILTER_LABEL.isMandatory, options: FILTER_OPTIONS.isMandatory },
    { key: "rsvp", label: FILTER_LABEL.rsvp, options: FILTER_OPTIONS.rsvp },
    { key: "attendance", label: FILTER_LABEL.attendance, options: FILTER_OPTIONS.attendance },
    { key: "eventStatus", label: FILTER_LABEL.eventStatus, options: FILTER_OPTIONS.eventStatus },
  ]);

const RSVP_LABEL: Readonly<Record<"yes" | "no", string>> = Object.freeze({ yes: "Yes", no: "No" });

const ATTENDANCE_LABEL: Readonly<Record<"present" | "late" | "excused" | "absent", string>> =
  Object.freeze({
    present: "Present",
    late: "Late",
    excused: "Excused",
    absent: "Absent",
  });

/**
 * `derivedEventState()`'s three words, in the club's language — the same
 * wording `/operate/events`'s own Status column and filter already use
 * (`DERIVED_STATE_LABELS`, `event-vocabulary.ts`), restyled as a local
 * constant here for the reason this file's own `FilterButton` gives: this
 * package does not import from `roster-board.tsx` or the events surface.
 */
const EVENT_STATUS_LABEL: Readonly<Record<AttendanceEvent["eventStatus"], string>> = Object.freeze({
  upcoming: "Upcoming",
  occurred: "Occurred",
  cancelled: "Cancelled",
});

/**
 * The third score figure (W2, Q-19) — occurred mandatory events with no
 * attendance record, out of exactly the rows given. A separate, named
 * function rather than inlined so a later reversal to a miss-counting
 * denominator is a one-line change here, not a search through the render.
 */
function countUnrecordedOccurredMandatory(rows: readonly AttendanceEvent[]): number {
  return rows.filter(
    (event) => event.isMandatory && event.eventStatus === "occurred" && event.attendance === null,
  ).length;
}

/** One event's display value for a given filterable field — what a filter compares against. */
function filterLabel(event: AttendanceEvent, key: FilterKey): string {
  switch (key) {
    case "isMandatory":
      return event.isMandatory ? "Mandatory" : "Not mandatory";
    case "rsvp":
      return event.rsvp === null ? "Not recorded" : RSVP_LABEL[event.rsvp];
    case "attendance":
      return event.attendance === null ? "Not recorded" : ATTENDANCE_LABEL[event.attendance];
    case "eventStatus":
      return EVENT_STATUS_LABEL[event.eventStatus];
    default:
      return "";
  }
}

/** `not recorded` sorts last in either direction, matching the board's own `comparable()`. */
function comparable(event: AttendanceEvent, key: SortKey): string {
  switch (key) {
    case "eventName":
      return event.eventName;
    case "date":
      return event.date ?? "￿";
    case "isMandatory":
      return event.isMandatory ? "0" : "1";
    case "rsvp":
      return event.rsvp ?? "￿";
    case "attendance":
      return event.attendance ?? "￿";
    case "eventStatus":
      return event.eventStatus;
    default:
      return "";
  }
}

/** A value, or the record's own explicit `not recorded` — never blank. */
function ValueOrNotRecorded({ value }: { value: string | null }) {
  if (value === null) {
    return (
      <Typography
        component="span"
        variant="body2"
        sx={{ color: "text.disabled", fontStyle: "italic" }}
      >
        not recorded
      </Typography>
    );
  }
  return (
    <Typography component="span" variant="body2">
      {value}
    </Typography>
  );
}

/** One label/value pair on a phone card. */
function CardStat({ label, value }: { label: string; value: string | null }) {
  return (
    <Box>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", lineHeight: 1.3 }}
      >
        {label}
      </Typography>
      <ValueOrNotRecorded value={value} />
    </Box>
  );
}

/**
 * The board's own funnel-in-a-bordered-button — restyled here rather than
 * imported from `roster-board.tsx`, which this package does not edit. Same
 * inline SVG for the same reason the board's own comment gives: no icon
 * package in this dependency tree.
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
