import { TableFrame } from "@/components/sortable-header";
import Box from "@mui/material/Box";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import type { GridCell, GridRow, WeeklyReportContent } from "@/lib/services/weekly-report";
import { ReportSection, SortHeader, type GridSortState } from "./report-section";
import {
  ATTENDANCE_LABELS,
  ATTENDED_COLUMN,
  formatIssues,
  formatShortDay,
  formatSpan,
  GRID_EMPTY,
  GRID_HEADLINE,
  ISSUES_COLUMN,
  NOT_RECORDED,
  RSVP_COLUMN,
  RSVP_LABELS,
} from "./presentation";

/**
 * People down, last week's events across — two values under each event
 * (RSVP and attendance), side by side, per Brian's 15 August 2026 spec.
 * Only people something went wrong for appear; a decline reason sits in the cell's `title`.
 */
export function ChaseGrid({
  content,
  sort,
}: {
  content: WeeklyReportContent;
  sort: GridSortState;
}) {
  const { columns } = content.grid;

  // Ordering is a view concern (stored order is `issues` descending); any other order is a URL request.
  const rows = sortRows(content.grid.rows, sort);
  const link = (by: GridSortState["by"]) => {
    const flip = sort.by === by && !sort.ascending;
    return `/operate/report?date=${encodeURIComponent(content.reportOn)}&sort=${by}${
      flip ? "&dir=asc" : ""
    }`;
  };
  const direction = (by: GridSortState["by"]) =>
    sort.by === by ? (sort.ascending ? "ascending" : "descending") : undefined;

  return (
    <ReportSection
      testId="grid"
      headline={GRID_HEADLINE}
      count={rows.length}
      span={formatSpan(content.lookBack)}
      empty={GRID_EMPTY}
      showCount={false}
    >
      <TableFrame>
        <Table size="small" aria-label={GRID_HEADLINE}>
          <TableHead>
            <TableRow>
              <TableCell
                rowSpan={2}
                sx={{ minWidth: 160, verticalAlign: "bottom" }}
                aria-sort={direction("person")}
              >
                <SortHeader label="Person" href={link("person")} active={sort.by === "person"} />
              </TableCell>
              {columns.map((column) => (
                <TableCell
                  key={column.eventId}
                  align="center"
                  colSpan={2}
                  sx={{ whiteSpace: "nowrap", borderLeft: 1, borderColor: "divider" }}
                >
                  {column.label}
                  <Typography variant="caption" component="div" color="text.secondary">
                    {formatShortDay(column.on)}
                  </Typography>
                </TableCell>
              ))}
              <TableCell
                rowSpan={2}
                align="right"
                sx={{ verticalAlign: "bottom", borderLeft: 1, borderColor: "divider" }}
                aria-sort={direction("issues")}
              >
                <SortHeader
                  label={ISSUES_COLUMN}
                  href={link("issues")}
                  active={sort.by === "issues"}
                />
              </TableCell>
            </TableRow>
            <TableRow>
              {columns.map((column) => [
                <TableCell
                  key={`${column.eventId}-rsvp`}
                  align="center"
                  sx={{ borderLeft: 1, borderColor: "divider" }}
                >
                  <Typography variant="caption" color="text.secondary">
                    {RSVP_COLUMN}
                  </Typography>
                </TableCell>,
                <TableCell key={`${column.eventId}-attended`} align="center">
                  <Typography variant="caption" color="text.secondary">
                    {ATTENDED_COLUMN}
                  </Typography>
                </TableCell>,
              ])}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.person} data-testid="grid-row" data-problems={row.problems}>
                <TableCell sx={{ fontWeight: 600 }}>{row.person}</TableCell>
                {columns.map((column) => {
                  const cell = row.cells.find((entry) => entry.eventId === column.eventId);
                  return [
                    <TableCell
                      key={`${column.eventId}-rsvp`}
                      align="center"
                      sx={{ borderLeft: 1, borderColor: "divider" }}
                    >
                      <CellValue cell={cell} of="rsvp" />
                    </TableCell>,
                    <TableCell key={`${column.eventId}-attended`} align="center">
                      <CellValue cell={cell} of="attendance" />
                    </TableCell>,
                  ];
                })}
                <TableCell
                  align="right"
                  sx={{ borderLeft: 1, borderColor: "divider", whiteSpace: "nowrap" }}
                  data-testid="grid-issues"
                >
                  <Typography
                    variant="body2"
                    component="span"
                    sx={{ fontWeight: row.problems === row.cells.length ? 700 : 400 }}
                    color={row.problems === row.cells.length ? "warning.main" : "text.secondary"}
                  >
                    {formatIssues(row.problems, row.cells.length)}
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableFrame>
    </ReportSection>
  );
}

/**
 * One of the two values under an event. Emphasised rather than colour-coded
 * alone (§9). LAN-227: reason rides as a native `title`, not an MUI
 * `Tooltip` — a Tooltip in this Server Component caused a hydration mismatch.
 */
function CellValue({ cell, of }: { cell: GridCell | undefined; of: "rsvp" | "attendance" }) {
  if (!cell) {
    return (
      <Typography variant="body2" color="text.disabled" component="span">
        {NOT_RECORDED}
      </Typography>
    );
  }

  const raw = of === "rsvp" ? cell.rsvp : cell.attendance;
  const labels = of === "rsvp" ? RSVP_LABELS : ATTENDANCE_LABELS;
  const text = raw === null ? NOT_RECORDED : (labels[raw] ?? raw);

  const value = (
    <Typography
      variant="body2"
      component="span"
      color={cell.isDiscrepancy ? "warning.main" : "text.secondary"}
      sx={{ fontWeight: cell.isDiscrepancy ? 700 : 400 }}
    >
      {text}
    </Typography>
  );

  // The reason belongs with what they said, not with what they did.
  return of === "rsvp" && cell.reason ? (
    <Box component="span" title={cell.reason} sx={{ borderBottom: "1px dotted" }}>
      {value}
    </Box>
  ) : (
    value
  );
}

/**
 * Orders the grid. `issues` sorts on proportion, not count (Brian) — four
 * of four is worse than two of five; count breaks ties.
 */
function sortRows(rows: GridRow[], sort: GridSortState): GridRow[] {
  const ordered = [...rows].sort((left, right) => {
    if (sort.by === "person") return left.person.localeCompare(right.person);
    const share = (row: GridRow) => (row.cells.length === 0 ? 0 : row.problems / row.cells.length);
    return (
      share(right) - share(left) ||
      right.problems - left.problems ||
      left.person.localeCompare(right.person)
    );
  });
  return sort.ascending ? ordered.reverse() : ordered;
}
