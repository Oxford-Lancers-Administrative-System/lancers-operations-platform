import { TableFrame } from "@/components/sortable-header";
import { StatusChip } from "@/components/status-chip";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import type { OnboardingRow, WeeklyReportContent } from "@/lib/services/weekly-report";
import { ReportSection, SortHeader, type GridSortState } from "./report-section";
import {
  formatIssues,
  NOT_RECORDED,
  ONBOARDING_EMPTY,
  ONBOARDING_HEADLINE,
  ONBOARDING_STATUS_LABELS,
  OUTSTANDING_COLUMN,
  labelFor,
} from "./presentation";

/**
 * Onboarding as a grid, the same shape as attendance: the club's items across,
 * the members who still owe something down, and a sortable count on the right.
 *
 * Every item, not only the required ones — Brian, 15 August 2026: "It should
 * just be all the things that are considered onboarding things." Subscription
 * paid is why that matters: it is deliberately not `is_required`, because
 * subscription never gates activation, and it is still the thing somebody opens
 * this section to find.
 */
export function Onboarding({
  content,
  sort,
}: {
  content: WeeklyReportContent;
  sort: GridSortState;
}) {
  const { columns } = content.onboarding;
  const rows = sortOnboarding(content.onboarding.rows, sort);
  const link = (by: GridSortState["by"]) => {
    const flip = sort.by === by && !sort.ascending;
    return `/operate/report?date=${encodeURIComponent(content.reportOn)}&osort=${by}${
      flip ? "&odir=asc" : ""
    }`;
  };
  const direction = (by: GridSortState["by"]) =>
    sort.by === by ? (sort.ascending ? "ascending" : "descending") : undefined;

  return (
    <ReportSection
      testId="onboarding"
      headline={ONBOARDING_HEADLINE}
      count={rows.length}
      empty={ONBOARDING_EMPTY}
      showCount={false}
    >
      <TableFrame>
        <Table size="small" aria-label={ONBOARDING_HEADLINE}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ minWidth: 160 }} aria-sort={direction("person")}>
                <SortHeader label="Person" href={link("person")} active={sort.by === "person"} />
              </TableCell>
              {columns.map((column) => (
                <TableCell
                  key={column.code}
                  align="center"
                  sx={{
                    borderLeft: 1,
                    borderColor: "divider",
                    // Seven items is a lot of columns, so the heads wrap rather
                    // than forcing the table wider than a laptop.
                    whiteSpace: "normal",
                    minWidth: 88,
                    verticalAlign: "bottom",
                  }}
                >
                  <Typography variant="caption" sx={{ fontWeight: 600 }}>
                    {column.label}
                  </Typography>
                </TableCell>
              ))}
              <TableCell
                align="right"
                sx={{ borderLeft: 1, borderColor: "divider", verticalAlign: "bottom" }}
                aria-sort={direction("issues")}
              >
                <SortHeader
                  label={OUTSTANDING_COLUMN}
                  href={link("issues")}
                  active={sort.by === "issues"}
                />
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.person}
                data-testid="onboarding-row"
                data-outstanding={row.outstanding}
              >
                <TableCell sx={{ fontWeight: 600 }}>
                  {row.person}
                  {row.membershipStatus === "onboarding" ? (
                    <StatusChip domain="membership" status="onboarding" label="Onboarding" />
                  ) : null}
                </TableCell>
                {columns.map((column) => {
                  const cell = row.cells.find((entry) => entry.code === column.code);
                  return (
                    <TableCell
                      key={column.code}
                      align="center"
                      sx={{ borderLeft: 1, borderColor: "divider" }}
                    >
                      <Typography
                        variant="body2"
                        component="span"
                        color={cell?.isOutstanding ? "warning.main" : "text.secondary"}
                        sx={{ fontWeight: cell?.isOutstanding ? 700 : 400 }}
                      >
                        {cell ? labelFor(ONBOARDING_STATUS_LABELS, cell.status) : NOT_RECORDED}
                      </Typography>
                    </TableCell>
                  );
                })}
                <TableCell
                  align="right"
                  sx={{ borderLeft: 1, borderColor: "divider", whiteSpace: "nowrap" }}
                  data-testid="onboarding-outstanding"
                >
                  <Typography
                    variant="body2"
                    component="span"
                    sx={{ fontWeight: row.outstanding === row.applicable ? 700 : 400 }}
                    color={row.outstanding === row.applicable ? "warning.main" : "text.secondary"}
                  >
                    {formatIssues(row.outstanding, row.applicable)}
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

/** The same ordering rule as the attendance grid: proportion, then count. */
function sortOnboarding(rows: OnboardingRow[], sort: GridSortState): OnboardingRow[] {
  const ordered = [...rows].sort((left, right) => {
    if (sort.by === "person") return left.person.localeCompare(right.person);
    const share = (row: OnboardingRow) =>
      row.applicable === 0 ? 0 : row.outstanding / row.applicable;
    return (
      share(right) - share(left) ||
      right.outstanding - left.outstanding ||
      left.person.localeCompare(right.person)
    );
  });
  return sort.ascending ? ordered.reverse() : ordered;
}
