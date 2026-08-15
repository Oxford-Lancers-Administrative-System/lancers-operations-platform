import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
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
  STORED_NOTE,
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
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          {REPORT_HEADLINE}
        </Typography>
        <Alert severity="warning" data-testid="report-unavailable">
          {error.message}
        </Alert>
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
    <Stack spacing={4} sx={{ maxWidth: 1000 }} data-testid="monday-report" data-report={report.id}>
      <Box>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          {REPORT_HEADLINE}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {formatReportDate(report.reportOn)}
        </Typography>
      </Box>

      <ReportDateForm date={report.reportOn} />

      {content === null ? (
        <Alert severity="info" data-testid="other-metric-version">
          {OTHER_METRIC_VERSION_NOTE}
        </Alert>
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
          {`${STORED_NOTE} Opened ${formatInstant(report.generatedAt)}.`}
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
      {quiet ? (
        <Alert severity="info" data-testid="nothing-at-all">
          {NOTHING_AT_ALL}
        </Alert>
      ) : null}

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
function Section({
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
    <Box component="section" data-testid={`section-${testId}`} data-count={count}>
      <Stack
        direction="row"
        spacing={1.5}
        sx={{ alignItems: "baseline", mb: 1.5, flexWrap: "wrap" }}
      >
        <Typography variant="h6" component="h2" sx={{ fontWeight: 700 }}>
          {headline}
        </Typography>
        {showCount ? (
          <Typography variant="h6" component="p" color="text.secondary" sx={{ fontWeight: 700 }}>
            {count}
          </Typography>
        ) : null}
        {span ? (
          <Typography variant="body2" color="text.secondary">
            {span}
          </Typography>
        ) : null}
      </Stack>

      {count === 0 ? (
        <Typography variant="body2" color="text.secondary" data-testid={`empty-${testId}`}>
          {empty}
        </Typography>
      ) : (
        children
      )}
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
    <Section
      testId="last-week"
      headline={LAST_WEEK_HEADLINE}
      count={content.lastWeek.length}
      span={formatSpan(content.lookBack)}
      empty={LAST_WEEK_EMPTY}
      showCount={false}
    >
      <TableContainer component={Paper} variant="outlined" sx={{ overflowX: "auto" }}>
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
      </TableContainer>
    </Section>
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
      <TableCell align="right">{event.solicitsResponse ? event.respondedYes : "—"}</TableCell>
      <TableCell align="right">{event.solicitsResponse ? event.respondedNo : "—"}</TableCell>
      <TableCell align="right">{event.solicitsResponse ? event.noAnswer : "—"}</TableCell>
      <TableCell align="right">{event.registerTaken ? event.present + event.late : "—"}</TableCell>
      <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>
        {event.turnoutPercent === null ? (
          <Typography variant="body2" color="warning.main" component="span">
            {event.status === "occurred" ? "no register" : "—"}
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
    <Section
      testId="grid"
      headline={GRID_HEADLINE}
      count={rows.length}
      span={formatSpan(content.lookBack)}
      empty={GRID_EMPTY}
      showCount={false}
    >
      <TableContainer component={Paper} variant="outlined" sx={{ overflowX: "auto" }}>
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
      </TableContainer>
    </Section>
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
    <Section
      testId="availability"
      headline={AVAILABILITY_HEADLINE}
      count={content.availability.length}
      empty={AVAILABILITY_EMPTY}
    >
      <Paper variant="outlined">
        <Box component="ul" sx={{ listStyle: "none", p: 0, m: 0 }}>
          {content.availability.map((entry, index) => (
            <Row
              key={`availability-${index}`}
              primary={entry.person}
              badge={labelFor(AVAILABILITY_LABELS, entry.level)}
              badgeColor={entry.level === "red" ? "warning" : "default"}
              secondary={[
                entry.since ? `since ${formatShortDay(entry.since)}` : null,
                entry.reviewOn ? `review ${formatShortDay(entry.reviewOn)}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            />
          ))}
        </Box>
      </Paper>
    </Section>
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
    <Section
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
    </Section>
  );
}

function UpcomingCard({ event }: { event: UpcomingEvent }) {
  // What an operator needs to know at a glance: has anything gone out, and how
  // many people have answered if so.
  const invitations =
    event.invited === 0 ? "No invitations sent" : `${event.answered} of ${event.invited} answered`;

  return (
    <Paper
      variant="outlined"
      sx={{ p: 2 }}
      data-testid={`upcoming-${event.id}`}
      data-status={event.status}
    >
      <Stack spacing={0.75}>
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: "center", flexWrap: "wrap", gap: 0.5 }}
        >
          <Chip
            size="small"
            label={labelFor(EVENT_STATUS_LABELS, event.status)}
            color={event.status === "approved" ? "primary" : "default"}
            variant={event.status === "approved" ? "filled" : "outlined"}
          />
          <Typography variant="body2" color="text.secondary">
            {formatShortDay(event.on)}
          </Typography>
        </Stack>
        <Button
          href={`/operate/events/${event.id}`}
          size="small"
          sx={{
            p: 0,
            minWidth: 0,
            justifyContent: "flex-start",
            fontWeight: 700,
            textTransform: "none",
          }}
        >
          {event.name}
        </Button>
        <Typography variant="body2" color="text.secondary">
          {event.solicitsResponse ? invitations : "No response asked for"}
          {event.isMandatory ? " · mandatory" : ""}
        </Typography>
      </Stack>
    </Paper>
  );
}

// ---------------------------------------------------------------------------
// 5, 6, 7. Named for what they are
// ---------------------------------------------------------------------------

function WalkUps({ content }: { content: WeeklyReportContent }) {
  return (
    <Section
      testId="walk-ups"
      headline={WALK_UPS_HEADLINE}
      count={content.walkUps.length}
      empty={WALK_UPS_EMPTY}
    >
      <Paper variant="outlined">
        <Box component="ul" sx={{ listStyle: "none", p: 0, m: 0 }}>
          {content.walkUps.map((entry, index) => (
            <Row
              key={`walk-up-${index}`}
              primary={entry.person}
              badge={null}
              secondary={`${entry.event} · ${formatShortDay(entry.on)}`}
            />
          ))}
        </Box>
      </Paper>
    </Section>
  );
}

function Recruitment({ content }: { content: WeeklyReportContent }) {
  return (
    <Section
      testId="recruitment"
      headline={RECRUITMENT_HEADLINE}
      count={content.recruitment.length}
      empty={RECRUITMENT_EMPTY}
    >
      <Paper variant="outlined">
        <Box component="ul" sx={{ listStyle: "none", p: 0, m: 0 }}>
          {content.recruitment.map((entry, index) => (
            <Row
              key={`recruit-${index}`}
              primary={entry.person}
              badge={entry.status}
              secondary={[
                entry.source,
                entry.firstContactOn
                  ? `first contact ${formatShortDay(entry.firstContactOn)}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            />
          ))}
        </Box>
      </Paper>
    </Section>
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
    <Section
      testId="onboarding"
      headline={ONBOARDING_HEADLINE}
      count={rows.length}
      empty={ONBOARDING_EMPTY}
      showCount={false}
    >
      <TableContainer component={Paper} variant="outlined" sx={{ overflowX: "auto" }}>
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
                    <Chip size="small" label="Onboarding" variant="outlined" sx={{ ml: 1 }} />
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
      </TableContainer>
    </Section>
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
  badgeColor = "default",
}: {
  primary: string;
  secondary: string;
  badge: string | null;
  badgeColor?: "default" | "warning";
}) {
  return (
    <Box
      component="li"
      sx={{
        px: 2,
        py: 1.5,
        display: "flex",
        flexDirection: { xs: "column", sm: "row" },
        gap: { xs: 0.5, sm: 2 },
        alignItems: { sm: "baseline" },
        borderTop: 1,
        borderColor: "divider",
        "&:first-of-type": { borderTop: 0 },
      }}
    >
      <Typography variant="body1" sx={{ fontWeight: 600, minWidth: { sm: 180 } }}>
        {primary}
      </Typography>
      {badge ? (
        <Chip
          size="small"
          label={badge}
          color={badgeColor}
          variant="outlined"
          sx={{ alignSelf: { xs: "flex-start", sm: "auto" } }}
        />
      ) : null}
      <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
        {secondary}
      </Typography>
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
    <Box component="section" data-testid="week-in-numbers">
      <Typography variant="subtitle2" component="h2" color="text.secondary" sx={{ mb: 1 }}>
        {WEEK_IN_NUMBERS}
      </Typography>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary" data-testid="week-events">
          {`${content.lastWeek.length} events · ${asked} people asked · ${yes} said yes`}
        </Typography>
        <Typography variant="body2" color="text.secondary" data-testid="week-attendance">
          {`Present ${attendance.present} · Late ${attendance.late} · Excused ${attendance.excused} · Absent ${attendance.absent}`}
        </Typography>
        <Typography variant="body2" color="text.secondary" data-testid="availability-levels">
          {`${AVAILABILITY_LABELS.green} ${content.availabilityCounts.green} · ${AVAILABILITY_LABELS.orange} ${content.availabilityCounts.orange} · ${AVAILABILITY_LABELS.red} ${content.availabilityCounts.red}`}
        </Typography>
      </Paper>
    </Box>
  );
}
