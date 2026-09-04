import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type {
  EventOutcome,
  GridCell,
  GridRow,
  OnboardingRow,
  StoredReport,
  WeeklyReportContent,
} from "@/lib/services/weekly-report";
import { Fact, FactList } from "@/components/fact";
import { Metric, MetricRow } from "@/components/metric";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { RowCard } from "@/components/row-card";
import { SortableHeader, TableFrame } from "@/components/sortable-header";
import { StatusChip } from "@/components/status-chip";
import {
  ATTENDANCE_LABELS,
  ATTENDED_COLUMN,
  AVAILABILITY_EMPTY,
  AVAILABILITY_HEADLINE,
  AVAILABILITY_LABELS,
  EVENT_STATUS_LABELS,
  formatInstant,
  formatIssues,
  formatReportDate,
  formatShortDay,
  formatSpan,
  GRID_EMPTY,
  GRID_HEADLINE,
  ISSUES_COLUMN,
  labelFor,
  LAST_WEEK_EMPTY,
  LAST_WEEK_HEADLINE,
  NEXT_WEEK_EMPTY,
  NEXT_WEEK_HEADLINE,
  NOT_RECORDED,
  NOTHING_AT_ALL,
  ONBOARDING_EMPTY,
  ONBOARDING_HEADLINE,
  ONBOARDING_STATUS_LABELS,
  OTHER_METRIC_VERSION_NOTE,
  OUTSTANDING_COLUMN,
  RECRUITMENT_EMPTY,
  RECRUITMENT_HEADLINE,
  REPORT_HEADLINE,
  RSVP_COLUMN,
  RSVP_LABELS,
  STORED_NOTE,
  WALK_UPS_EMPTY,
  WALK_UPS_HEADLINE,
  WEEK_IN_NUMBERS,
} from "@/app/operate/report/presentation";
import ReportDatePreview from "./report-date-preview";

/**
 * The Monday report, rendered from the kit — LAN-225 S6.
 *
 * Brian's order from 15 August 2026, unchanged: last week's events, who
 * needs chasing, availability, next week, walk-ups, recruitment, onboarding,
 * the week in numbers. What changes is the vocabulary: each section is an
 * `h2` at the `h3` size with its span beside it, tables sit in `TableFrame`
 * at the page's 1200 measure (C4), the headline counts are `Metric`s (E3),
 * every status is a `StatusChip`, and the date control is a `DateField` (E9).
 */
interface GridSortState {
  by: "issues" | "person";
  ascending: boolean;
}

export default function ReportPreview({
  report,
  content,
  sort,
  onboardingSort,
}: {
  report: StoredReport;
  content: WeeklyReportContent | null;
  sort: GridSortState;
  onboardingSort: GridSortState;
}) {
  return (
    <Stack spacing={4} data-testid="report-preview">
      <PageHeader title={REPORT_HEADLINE} subtitle={formatReportDate(report.reportOn)} />
      <ReportDatePreview date={report.reportOn} />
      {content === null ? (
        <Notice severity="info">{OTHER_METRIC_VERSION_NOTE}</Notice>
      ) : (
        <Body content={content} sort={sort} onboardingSort={onboardingSort} />
      )}
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ borderTop: 1, borderColor: "divider", pt: 1.5 }}
      >
        {`${STORED_NOTE} Opened ${formatInstant(report.generatedAt)}.`}
      </Typography>
    </Stack>
  );
}

function Body({
  content,
  sort,
  onboardingSort,
}: {
  content: WeeklyReportContent;
  sort: GridSortState;
  onboardingSort: GridSortState;
}) {
  const quiet =
    content.lastWeek.length === 0 &&
    content.grid.rows.length === 0 &&
    content.nextWeek.length === 0;
  return (
    <>
      {quiet ? <Notice severity="info">{NOTHING_AT_ALL}</Notice> : null}
      <LastWeek content={content} />
      <ChaseGrid content={content} sort={sort} />
      <Availability content={content} />
      <NextWeek content={content} />
      <NamedList
        headline={WALK_UPS_HEADLINE}
        count={content.walkUps.length}
        empty={WALK_UPS_EMPTY}
        rows={content.walkUps.map((entry, index) => ({
          key: `walk-up-${index}`,
          primary: entry.person,
          secondary: `${entry.event} · ${formatShortDay(entry.on)}`,
        }))}
      />
      <NamedList
        headline={RECRUITMENT_HEADLINE}
        count={content.recruitment.length}
        empty={RECRUITMENT_EMPTY}
        rows={content.recruitment.map((entry, index) => ({
          key: `recruit-${index}`,
          primary: entry.person,
          chip: <StatusChip domain="recruitment" status={entry.status} label={entry.status} />,
          secondary: [
            entry.source,
            entry.firstContactOn ? `first contact ${formatShortDay(entry.firstContactOn)}` : null,
          ]
            .filter(Boolean)
            .join(" · "),
        }))}
      />
      <Onboarding content={content} sort={onboardingSort} />
      <WeekInNumbers content={content} />
    </>
  );
}

function SectionHead({
  headline,
  count,
  span,
  showCount = true,
}: {
  headline: string;
  count: number;
  span?: string;
  showCount?: boolean;
}) {
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: "baseline", flexWrap: "wrap" }}>
      <Typography variant="h3" component="h2">
        {headline}
      </Typography>
      {showCount ? (
        <Typography variant="h3" component="p" color="text.secondary">
          {count}
        </Typography>
      ) : null}
      {span ? (
        <Typography variant="body2" color="text.secondary">
          {span}
        </Typography>
      ) : null}
    </Stack>
  );
}

function ReportSection({
  headline,
  count,
  span,
  empty,
  showCount = true,
  children,
}: {
  headline: string;
  count: number;
  span?: string;
  empty: string;
  showCount?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Stack component="section" spacing={1.5} data-count={count}>
      <SectionHead headline={headline} count={count} span={span} showCount={showCount} />
      {count === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {empty}
        </Typography>
      ) : (
        children
      )}
    </Stack>
  );
}

function LastWeek({ content }: { content: WeeklyReportContent }) {
  return (
    <ReportSection
      headline={LAST_WEEK_HEADLINE}
      count={content.lastWeek.length}
      span={formatSpan(content.lookBack)}
      empty={LAST_WEEK_EMPTY}
      showCount={false}
    >
      <TableFrame>
        <Table size="small" aria-label={LAST_WEEK_HEADLINE}>
          <TableHead>
            <TableRow>
              <TableCell>Event</TableCell>
              <TableCell align="right">Asked</TableCell>
              <TableCell align="right">Yes</TableCell>
              <TableCell align="right">No</TableCell>
              <TableCell align="right">Silent</TableCell>
              <TableCell align="right">Turned up</TableCell>
              <TableCell align="right">Turnout</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {content.lastWeek.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </TableBody>
        </Table>
      </TableFrame>
    </ReportSection>
  );
}

function EventRow({ event }: { event: EventOutcome }) {
  const flags: string[] = [];
  if (event.walkUps > 0) flags.push(`${event.walkUps} walk-up${event.walkUps === 1 ? "" : "s"}`);
  if (event.neverInvited > 0) flags.push(`${event.neverInvited} approved, never invited`);
  return (
    <TableRow hover>
      <TableCell>
        <Button
          href={`/operate/events/${event.id}`}
          size="small"
          sx={{ p: 0, minWidth: 0, minHeight: 0, textAlign: "left" }}
        >
          {event.name}
        </Button>
        <Typography variant="body2" color="text.secondary">
          {`${formatShortDay(event.on)} · ${labelFor(EVENT_STATUS_LABELS, event.status)}${event.isMandatory ? " · mandatory" : ""}`}
        </Typography>
        {flags.length > 0 ? (
          <Typography variant="body2" color="warning.main">
            {flags.join(" · ")}
          </Typography>
        ) : null}
      </TableCell>
      <TableCell align="right">{event.invited}</TableCell>
      <TableCell align="right">{event.respondedYes}</TableCell>
      <TableCell align="right">{event.respondedNo}</TableCell>
      <TableCell align="right">{event.noAnswer}</TableCell>
      <TableCell align="right">{event.registerTaken ? event.present + event.late : "—"}</TableCell>
      <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>
        {event.turnoutPercent === null ? (
          <Typography variant="body2" color="warning.main" component="span">
            {event.occurred ? "no register" : "—"}
          </Typography>
        ) : (
          `${event.turnoutPercent}%`
        )}
      </TableCell>
    </TableRow>
  );
}

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
  return of === "rsvp" && cell.reason ? (
    <Tooltip title={cell.reason}>
      <Typography component="span" sx={{ borderBottom: "1px dotted" }}>
        {value}
      </Typography>
    </Tooltip>
  ) : (
    value
  );
}

function ChaseGrid({ content, sort }: { content: WeeklyReportContent; sort: GridSortState }) {
  const { columns } = content.grid;
  const rows = sortRows(content.grid.rows, sort);
  const link = (by: GridSortState["by"]) => {
    const flip = sort.by === by && !sort.ascending;
    return `/design-preview/report?date=${encodeURIComponent(content.reportOn)}&sort=${by}${flip ? "&dir=asc" : ""}`;
  };
  return (
    <ReportSection
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
              <SortableHeader
                column="person"
                label="Person"
                href={link("person")}
                active={sort.by === "person"}
                direction={sort.ascending ? "asc" : "desc"}
              />
              {columns.map((column) => (
                <TableCell
                  key={column.eventId}
                  align="center"
                  colSpan={2}
                  sx={{ borderLeft: 1, borderColor: "divider" }}
                >
                  {column.label}
                  <Typography variant="caption" component="div" color="text.secondary">
                    {formatShortDay(column.on)}
                  </Typography>
                </TableCell>
              ))}
              <SortableHeader
                column="issues"
                label={ISSUES_COLUMN}
                href={link("issues")}
                active={sort.by === "issues"}
                direction={sort.ascending ? "asc" : "desc"}
                align="right"
              />
            </TableRow>
            <TableRow>
              <TableCell />
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
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.person} hover>
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

function Availability({ content }: { content: WeeklyReportContent }) {
  return (
    <ReportSection
      headline={AVAILABILITY_HEADLINE}
      count={content.availability.length}
      empty={AVAILABILITY_EMPTY}
    >
      <TableFrame>
        <FactList>
          {content.availability.map((entry, index) => (
            <Stack key={`availability-${index}`} sx={{ px: 2 }}>
              <Fact
                label={entry.person}
                layout="inline"
                value={
                  <StatusChip
                    domain="availability"
                    status={entry.level}
                    label={labelFor(AVAILABILITY_LABELS, entry.level)}
                  />
                }
                note={[
                  entry.since ? `since ${formatShortDay(entry.since)}` : null,
                  entry.reviewOn ? `review ${formatShortDay(entry.reviewOn)}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
            </Stack>
          ))}
        </FactList>
      </TableFrame>
    </ReportSection>
  );
}

function NextWeek({ content }: { content: WeeklyReportContent }) {
  return (
    <ReportSection
      headline={NEXT_WEEK_HEADLINE}
      count={content.nextWeek.length}
      span={formatSpan(content.lookAhead)}
      empty={NEXT_WEEK_EMPTY}
    >
      <Stack
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: {
            xs: "1fr",
            sm: "repeat(2, minmax(0, 1fr))",
            lg: "repeat(3, minmax(0, 1fr))",
          },
        }}
      >
        {content.nextWeek.map((event) => (
          <RowCard
            key={event.id}
            title={event.name}
            href={`/operate/events/${event.id}`}
            trailing={formatShortDay(event.on)}
            chips={
              <StatusChip
                domain="event"
                status={event.status}
                label={labelFor(EVENT_STATUS_LABELS, event.status)}
              />
            }
            sublines={[
              `${event.invited === 0 ? "No invitations sent" : `${event.answered} of ${event.invited} answered`}${event.isMandatory ? " · mandatory" : ""}`,
            ]}
          />
        ))}
      </Stack>
    </ReportSection>
  );
}

function NamedList({
  headline,
  count,
  empty,
  rows,
}: {
  headline: string;
  count: number;
  empty: string;
  rows: ReadonlyArray<{ key: string; primary: string; secondary: string; chip?: React.ReactNode }>;
}) {
  return (
    <ReportSection headline={headline} count={count} empty={empty}>
      <TableFrame>
        <FactList>
          {rows.map((row) => (
            <Stack key={row.key} sx={{ px: 2 }}>
              <Fact
                label={row.primary}
                layout="inline"
                value={row.chip ?? row.secondary}
                note={row.chip ? row.secondary : undefined}
              />
            </Stack>
          ))}
        </FactList>
      </TableFrame>
    </ReportSection>
  );
}

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

function Onboarding({ content, sort }: { content: WeeklyReportContent; sort: GridSortState }) {
  const { columns } = content.onboarding;
  const rows = sortOnboarding(content.onboarding.rows, sort);
  const link = (by: GridSortState["by"]) => {
    const flip = sort.by === by && !sort.ascending;
    return `/design-preview/report?date=${encodeURIComponent(content.reportOn)}&osort=${by}${flip ? "&odir=asc" : ""}`;
  };
  return (
    <ReportSection
      headline={ONBOARDING_HEADLINE}
      count={rows.length}
      empty={ONBOARDING_EMPTY}
      showCount={false}
    >
      <TableFrame>
        <Table size="small" aria-label={ONBOARDING_HEADLINE}>
          <TableHead>
            <TableRow>
              <SortableHeader
                column="person"
                label="Person"
                href={link("person")}
                active={sort.by === "person"}
                direction={sort.ascending ? "asc" : "desc"}
              />
              {columns.map((column) => (
                <TableCell
                  key={column.code}
                  align="center"
                  sx={{
                    borderLeft: 1,
                    borderColor: "divider",
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
              <SortableHeader
                column="issues"
                label={OUTSTANDING_COLUMN}
                href={link("issues")}
                active={sort.by === "issues"}
                direction={sort.ascending ? "asc" : "desc"}
                align="right"
              />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.person} hover>
                <TableCell sx={{ fontWeight: 600 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <span>{row.person}</span>
                    {row.membershipStatus === "onboarding" ? (
                      <StatusChip domain="membership" status="onboarding" label="Onboarding" />
                    ) : null}
                  </Stack>
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

function WeekInNumbers({ content }: { content: WeeklyReportContent }) {
  const attendance = content.attendance;
  const asked = content.lastWeek.reduce((total, event) => total + event.invited, 0);
  const yes = content.lastWeek.reduce((total, event) => total + event.respondedYes, 0);
  return (
    <Stack component="section" spacing={1.5}>
      <SectionHead headline={WEEK_IN_NUMBERS} count={0} showCount={false} />
      <MetricRow columns={4}>
        <Metric value={String(content.lastWeek.length)} label="Events" />
        <Metric value={String(asked)} label="People asked" />
        <Metric value={String(yes)} label="Said yes" />
        <Metric
          value={`${attendance.present + attendance.late}`}
          label="Turned up"
          caption={`Present ${attendance.present} · Late ${attendance.late}`}
        />
        <Metric value={String(attendance.excused)} label="Excused" />
        <Metric value={String(attendance.absent)} label="Absent" />
        <Metric
          value={String(attendance.eventsWithNoRegister)}
          label="No register"
          caption="Occurred events"
        />
        <Metric
          value={`${content.availabilityCounts.green} · ${content.availabilityCounts.orange} · ${content.availabilityCounts.red}`}
          label="Availability"
          caption={`${AVAILABILITY_LABELS.green} · ${AVAILABILITY_LABELS.orange} · ${AVAILABILITY_LABELS.red}`}
        />
      </MetricRow>
    </Stack>
  );
}
