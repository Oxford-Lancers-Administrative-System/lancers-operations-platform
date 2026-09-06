import { PageHeader } from "@/components/page-header";
import { Section as KitSection } from "@/components/section";
import { Notice } from "@/components/notice";
import { EmptyState } from "@/components/empty-state";
import { StatusChip, type StatusDomain } from "@/components/status-chip";
import { RowCard, RowCardList } from "@/components/row-card";
import { Metric, MetricRow } from "@/components/metric";
import { TableFrame } from "@/components/sortable-header";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { redirect } from "next/navigation";
import { isServiceError } from "@/lib/db";
import {
  parseReportContent,
  readReportForDate,
  type EventOutcome,
  type GridCell,
  type GridRow,
  type OnboardingRow,
  type StoredReport,
  type UpcomingEvent,
  type WeeklyReportContent,
} from "@/lib/services/weekly-report";
import { gateShellPage } from "../gate";
import { ReportDateForm } from "./report-date-form";
import {
  AVAILABILITY_EMPTY,
  AVAILABILITY_HEADLINE,
  AVAILABILITY_LABELS,
  EVENT_STATUS_LABELS,
  formatInstant,
  formatReportDate,
  formatShortDay,
  formatSpan,
  GRID_EMPTY,
  GRID_HEADLINE,
  formatIssues,
  ISSUES_COLUMN,
  ONBOARDING_STATUS_LABELS,
  OUTSTANDING_COLUMN,
  isGridSort,
  NOT_RECORDED,
  RSVP_LABELS,
  RSVP_COLUMN,
  ATTENDANCE_LABELS,
  ATTENDED_COLUMN,
  labelFor,
  LAST_WEEK_EMPTY,
  LAST_WEEK_HEADLINE,
  NEXT_WEEK_EMPTY,
  NEXT_WEEK_HEADLINE,
  NOTHING_AT_ALL,
  ONBOARDING_EMPTY,
  ONBOARDING_HEADLINE,
  OTHER_METRIC_VERSION_NOTE,
  RECRUITMENT_EMPTY,
  RECRUITMENT_HEADLINE,
  REPORT_HEADLINE,
  todayInClubZone,
  WALK_UPS_EMPTY,
  WALK_UPS_HEADLINE,
  WEEK_IN_NUMBERS,
} from "./presentation";

/**
 * `/operate/report` — the Monday report. LAN-81.
 *
 * ## The order, and whose order it is
 *
 * Brian's, from the 15 August 2026 review, in his words: last week's events
 * with their RSVP numbers and attendance percentage at the very top; then the
 * people who need chasing, as a grid; then availability; then the week ahead;
 * then walk-ups, recruitment and onboarding.
 *
 * Every heading names a thing the club already has a word for. There is no
 * "Fix these things" — his objection to it was exact: those items "all look
 * like events", so they are properties of an event's row, not a bucket of
 * their own. A register nobody took is a missing percentage on that event. A
 * person approved and never invited is a flag on that event.
 *
 * ## It still reads a stored snapshot
 *
 * `readReportForDate` returns the snapshot filed for this date today, filing
 * one first if today has not produced one. So the screen renders stored content
 * and never a live recompute — invariant M5's whole point. The reader is never
 * told any of that; one line at the bottom says the report is kept as it was.
 *
 * ## Authorization
 *
 * `leadership_report` — the four calendar roles. `slice-ux.md` § 3 names the
 * report, and RSVP reasons, among the surfaces a coaching seat never receives.
 */
export default async function ReportPage({ searchParams }: PageProps<"/operate/report">) {
  const gate = await gateShellPage("/operate/report", "leadership_report");
  if ("screen" in gate) return gate.screen;

  const query = await searchParams;
  const requested = typeof query.date === "string" && query.date !== "" ? query.date : null;
  const date = requested ?? todayInClubZone();

  // How the attendance grid is ordered. In the URL rather than in component
  // state so that a sorted view survives a refresh, can be shared, and needs no
  // JavaScript — the same reasoning as the date form beside it.
  const sortBy = typeof query.sort === "string" && isGridSort(query.sort) ? query.sort : "issues";
  const ascending = query.dir === "asc";

  // Its own pair, so ordering one grid never reorders the other.
  const onboardingBy =
    typeof query.osort === "string" && isGridSort(query.osort) ? query.osort : "issues";
  const onboardingAscending = query.odir === "asc";

  // Pressing Show Report files a snapshot; arriving, sorting and refreshing do
  // not. See `readReportForDate` for the rule and why it is that one.
  const pressed = query.show === "1";

  let report: StoredReport;
  try {
    report = await readReportForDate(gate.operator.personId, date, { fileNew: pressed });
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return (
      <Stack spacing={3} sx={{ maxWidth: 720 }} data-testid="report-unavailable-screen">
        <PageHeader title={REPORT_HEADLINE} />
        <Notice severity="warning" testId="report-unavailable">
          {error.message}
        </Notice>
        <ReportDateForm date={isDate(date) ? date : todayInClubZone()} />
      </Stack>
    );
  }

  // Filed, so take the marker out of the address bar. Without this a refresh
  // would file a second snapshot the reader never asked for, and the version
  // chain would record the browser rather than the club.
  if (pressed) {
    redirect(`/operate/report?date=${encodeURIComponent(report.reportOn)}`);
  }

  const content = parseReportContent(report.content);

  return (
    <Stack spacing={4} data-testid="monday-report" data-report={report.id}>
      <PageHeader title={REPORT_HEADLINE} subtitle={formatReportDate(report.reportOn)} />

      <ReportDateForm date={report.reportOn} />

      {content === null ? (
        <Notice severity="info" testId="other-metric-version">
          {OTHER_METRIC_VERSION_NOTE}
        </Notice>
      ) : (
        <ReportBody
          content={content}
          sort={{ by: sortBy, ascending }}
          onboardingSort={{ by: onboardingBy, ascending: onboardingAscending }}
        />
      )}

      <Box>
        <Divider sx={{ mb: 1.5 }} />
        <Typography variant="body2" color="text.secondary" data-testid="stored-note">
          {`Opened ${formatInstant(report.generatedAt)}.`}
        </Typography>
      </Box>
    </Stack>
  );
}

function isDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

interface GridSortState {
  by: "issues" | "person";
  ascending: boolean;
}

function ReportBody({
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
      {quiet ? <EmptyState title={NOTHING_AT_ALL} testId="nothing-at-all" /> : null}

      <LastWeek content={content} />
      <ChaseGrid content={content} sort={sort} />
      <Availability content={content} />
      <NextWeek content={content} />
      <WalkUps content={content} />
      <Recruitment content={content} />
      <Onboarding content={content} sort={onboardingSort} />
      <WeekInNumbers content={content} />
    </>
  );
}

/**
 * A section: a heading that carries its own count and the span it covers, and
 * either its body or the one sentence that says there is none.
 */
function ReportSection({
  testId,
  headline,
  count,
  span,
  empty,
  showCount = true,
  children,
}: {
  testId: string;
  headline: string;
  count: number;
  span?: string;
  empty: string;
  /**
   * Brian, 15 August: "Don't include the number. The numbers don't really
   * help." True of the two sections that already carry a date — the span says
   * what the section is about better than a tally of its rows does.
   */
  showCount?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Box data-count={count}>
      <KitSection
        title={`${headline}${showCount ? ` · ${count}` : ""}`}
        description={span}
        testId={testId}
      >
        {count === 0 ? (
          <Typography variant="body2" color="text.secondary" data-testid={`empty-${testId}`}>
            {empty}
          </Typography>
        ) : (
          children
        )}
      </KitSection>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// 1. Last week
// ---------------------------------------------------------------------------

/**
 * The event table Brian opens the report to read: what happened, who was asked,
 * who said yes, who came, and what percentage that is.
 *
 * The two event-level exceptions ride on the row rather than in a list of their
 * own. A register nobody took shows as "not taken" where the percentage would
 * be — never as 0%, which would read as nobody turning up.
 */
function LastWeek({ content }: { content: WeeklyReportContent }) {
  return (
    <ReportSection
      testId="last-week"
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
    <TableRow
      data-testid={`event-${event.id}`}
      data-register={event.registerTaken ? "taken" : "missing"}
    >
      <TableCell>
        <Button
          href={`/operate/events/${event.id}`}
          size="small"
          sx={{ p: 0, minWidth: 0, textAlign: "left", fontWeight: 600, textTransform: "none" }}
        >
          {event.name}
        </Button>
        <Typography variant="body2" color="text.secondary">
          {`${formatShortDay(event.on)} · ${labelFor(EVENT_STATUS_LABELS, event.status)}${
            event.isMandatory ? " · mandatory" : ""
          }`}
        </Typography>
        {flags.length > 0 ? (
          <Typography variant="body2" color="warning.main" data-testid={`flags-${event.id}`}>
            {flags.join(" · ")}
          </Typography>
        ) : null}
      </TableCell>
      <TableCell align="right">{event.invited}</TableCell>
      {/*
        Unconditional since D23 removed "Response requested": every event asks
        its audience to answer, so there is no event whose answer columns are
        not a real number.
      */}
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

// ---------------------------------------------------------------------------
// 2. Who needs chasing
// ---------------------------------------------------------------------------

/**
 * People down, last week's events across — and **two** values under each event.
 *
 * Brian's own specification, 15 August 2026: "I then want to see RSVP status
 * and attendance status for the two of them. For each one of the events, did
 * they come? Did they RSVP, or did they not RSVP? Did they attend, or did they
 * not attend? We're looking for discrepancies there." Four events gives the
 * eight values he counted.
 *
 * A single collapsed verdict per event — which is what this was — hides the
 * comparison that is the whole point of the section. Here the two are side by
 * side and the eye does the work.
 *
 * Only people something went wrong for appear. A reason for declining sits in
 * the cell's tooltip, so it is there for the operator who needs it without
 * turning a grid into prose.
 */
function ChaseGrid({ content, sort }: { content: WeeklyReportContent; sort: GridSortState }) {
  const { columns } = content.grid;

  // Ordering is a view concern, so it happens here rather than in the snapshot.
  // The stored order is `issues` descending, which is what an unsorted visit
  // shows — so the default view and the filed record agree, and any other order
  // is something the reader asked for in the URL.
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
 * One of the two values under an event.
 *
 * A discrepancy is emphasised rather than colour-coded alone: § 9 requires
 * status not to rely on colour, and a Monday report read on a phone in daylight
 * is exactly where that matters.
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
    <Tooltip title={cell.reason}>
      <Box component="span" sx={{ borderBottom: "1px dotted" }}>
        {value}
      </Box>
    </Tooltip>
  ) : (
    value
  );
}

/**
 * Orders the grid.
 *
 * `issues` sorts on the **proportion** rather than the count, because that is
 * the comparison Brian asked for: four of four is a worse week than two of
 * five, and ranking on the bare count would put them the other way round. The
 * count breaks ties, so two people at 100% are ordered by how many events that
 * covers.
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

/** A column head that is also the control for ordering by it. */
function SortHeader({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Button
      href={href}
      size="small"
      sx={{
        p: 0,
        minWidth: 0,
        textTransform: "none",
        fontWeight: active ? 700 : 600,
        color: active ? "primary.main" : "text.primary",
      }}
    >
      {label}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// 3. Availability
// ---------------------------------------------------------------------------

/**
 * Who is not fully available, and since when.
 *
 * A level and two dates, and nothing else — `availability_statuses` has no
 * column that could hold a note and none is to be added until the Oxford
 * guidance arrives. The screen no longer says so: Brian's instruction on
 * 15 August was to take the caption out, and a sentence explaining an absence
 * belongs in the code that maintains it rather than on his Monday morning.
 */
function Availability({ content }: { content: WeeklyReportContent }) {
  return (
    <ReportSection
      testId="availability"
      headline={AVAILABILITY_HEADLINE}
      count={content.availability.length}
      empty={AVAILABILITY_EMPTY}
    >
      <RowCardList at="all" component="ul">
        {content.availability.map((entry, index) => (
          <Row
            key={`availability-${index}`}
            primary={entry.person}
            badge={labelFor(AVAILABILITY_LABELS, entry.level)}
            badgeDomain="availability"
            badgeStatus={entry.level}
            secondary={[
              entry.since ? `since ${formatShortDay(entry.since)}` : null,
              entry.reviewOn ? `review ${formatShortDay(entry.reviewOn)}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          />
        ))}
      </RowCardList>
    </ReportSection>
  );
}

// ---------------------------------------------------------------------------
// 4. Next week
// ---------------------------------------------------------------------------

/**
 * The week ahead, read-only, with a link into each event.
 *
 * Brian's bounded amendment of 15 August: one week forward, so he can see which
 * of next week's events are still drafts and which have already gone out. The
 * three-week planning horizon remains LAN-109's, and nothing here edits.
 */
function NextWeek({ content }: { content: WeeklyReportContent }) {
  return (
    <ReportSection
      testId="next-week"
      headline={NEXT_WEEK_HEADLINE}
      count={content.nextWeek.length}
      span={formatSpan(content.lookAhead)}
      empty={NEXT_WEEK_EMPTY}
    >
      <Box
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
          <UpcomingCard key={event.id} event={event} />
        ))}
      </Box>
    </ReportSection>
  );
}

function UpcomingCard({ event }: { event: UpcomingEvent }) {
  // What an operator needs to know at a glance: has anything gone out, and how
  // many people have answered if so.
  const invitations =
    event.invited === 0 ? "No invitations sent" : `${event.answered} of ${event.invited} answered`;

  return (
    <RowCard
      testId={`upcoming-${event.id}`}
      title={event.name}
      href={`/operate/events/${event.id}`}
      chips={
        <StatusChip
          domain="event"
          status={event.status}
          label={labelFor(EVENT_STATUS_LABELS, event.status)}
        />
      }
      sublines={[
        formatShortDay(event.on),
        `${invitations}${event.isMandatory ? " · mandatory" : ""}`,
      ]}
    />
  );
}

// ---------------------------------------------------------------------------
// 5, 6, 7. Named for what they are
// ---------------------------------------------------------------------------

function WalkUps({ content }: { content: WeeklyReportContent }) {
  return (
    <ReportSection
      testId="walk-ups"
      headline={WALK_UPS_HEADLINE}
      count={content.walkUps.length}
      empty={WALK_UPS_EMPTY}
    >
      <RowCardList at="all" component="ul">
        {content.walkUps.map((entry, index) => (
          <Row
            key={`walk-up-${index}`}
            primary={entry.person}
            badge={null}
            secondary={`${entry.event} · ${formatShortDay(entry.on)}`}
          />
        ))}
      </RowCardList>
    </ReportSection>
  );
}

function Recruitment({ content }: { content: WeeklyReportContent }) {
  return (
    <ReportSection
      testId="recruitment"
      headline={RECRUITMENT_HEADLINE}
      count={content.recruitment.length}
      empty={RECRUITMENT_EMPTY}
    >
      <RowCardList at="all" component="ul">
        {content.recruitment.map((entry, index) => (
          <Row
            key={`recruit-${index}`}
            primary={entry.person}
            badge={entry.status}
            badgeDomain="recruitment"
            badgeStatus={entry.status}
            secondary={[
              entry.source,
              entry.firstContactOn ? `first contact ${formatShortDay(entry.firstContactOn)}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          />
        ))}
      </RowCardList>
    </ReportSection>
  );
}

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
function Onboarding({ content, sort }: { content: WeeklyReportContent; sort: GridSortState }) {
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

/** A name, an optional badge, and a line of detail. */
function Row({
  primary,
  secondary,
  badge,
  badgeDomain,
  badgeStatus,
}: {
  primary: string;
  secondary: string;
  badge: string | null;
  badgeDomain?: StatusDomain;
  badgeStatus?: string;
}) {
  return (
    <Box component="li">
      <RowCard
        title={primary}
        sublines={[secondary]}
        chips={
          badge && badgeDomain && badgeStatus ? (
            <StatusChip domain={badgeDomain} status={badgeStatus} label={badge} />
          ) : undefined
        }
      />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// 8. The week in numbers
// ---------------------------------------------------------------------------

function WeekInNumbers({ content }: { content: WeeklyReportContent }) {
  const attendance = content.attendance;
  const asked = content.lastWeek.reduce((total, event) => total + event.invited, 0);
  const yes = content.lastWeek.reduce((total, event) => total + event.respondedYes, 0);

  return (
    <KitSection title={WEEK_IN_NUMBERS} testId="week-in-numbers">
      <Stack spacing={2}>
        <MetricRow testId="week-events">
          <Metric label="Events" value={content.lastWeek.length} />
          <Metric label="People asked" value={asked} />
          <Metric label="Said yes" value={yes} />
        </MetricRow>
        <MetricRow columns={4} testId="week-attendance">
          <Metric label={ATTENDANCE_LABELS.present} value={attendance.present} />
          <Metric label={ATTENDANCE_LABELS.late} value={attendance.late} />
          <Metric label={ATTENDANCE_LABELS.excused} value={attendance.excused} />
          <Metric label={ATTENDANCE_LABELS.absent} value={attendance.absent} />
        </MetricRow>
        <MetricRow testId="availability-levels">
          <Metric label={AVAILABILITY_LABELS.green} value={content.availabilityCounts.green} />
          <Metric label={AVAILABILITY_LABELS.orange} value={content.availabilityCounts.orange} />
          <Metric label={AVAILABILITY_LABELS.red} value={content.availabilityCounts.red} />
        </MetricRow>
      </Stack>
    </KitSection>
  );
}
