import Stack from "@mui/material/Stack";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TableSortLabel from "@mui/material/TableSortLabel";
import Typography from "@mui/material/Typography";
import { FilterButton, groupRuns } from "../board-filter-controls";
import {
  BAND_LABEL_INSET_PX,
  BAND_ROW_HEIGHT,
  bandOf,
  PLAYER_COLUMN_WIDTH,
  type ColumnDef,
} from "./board-columns";
import { filterOptionLabel } from "./board-data";

/** The board's own two-row sticky head: the band overline, then the sortable, filterable columns. */
export default function BoardTableHead({
  columns,
  bandBoundaries,
  sortKey,
  sortDirection,
  setSort,
  filters,
  onOpenFilter,
}: {
  columns: readonly ColumnDef[];
  bandBoundaries: ReadonlySet<string>;
  sortKey: string;
  sortDirection: "asc" | "desc";
  setSort: (key: string) => void;
  filters: Readonly<Record<string, string>>;
  onOpenFilter: (anchor: HTMLElement, column: ColumnDef) => void;
}) {
  return (
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
                    onOpen={(anchor) => onOpenFilter(anchor, column)}
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
  );
}
