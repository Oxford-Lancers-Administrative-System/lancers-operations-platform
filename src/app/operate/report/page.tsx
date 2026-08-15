import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { isServiceError } from "@/lib/db";
import {
  parseReportContent,
  readReportForDate,
  type ChaseItem,
  type FixItem,
  type StoredReport,
  type WeeklyReportContent,
} from "@/lib/services/weekly-report";
import { gateShellPage } from "../gate";
import { ReportDateForm } from "./report-date-form";
import {
  AVAILABILITY_HEADLINE,
  AVAILABILITY_LABELS,
  AVAILABILITY_NOTE,
  CHASE_EMPTY,
  CHASE_HEADLINE,
  CHASE_LABELS,
  FIX_EMPTY,
  FIX_HEADLINE,
  FIX_LABELS,
  formatInstant,
  formatReportDate,
  formatShortDay,
  formatWindow,
  NOTHING_AT_ALL,
  ONBOARDING_EMPTY,
  ONBOARDING_HEADLINE,
  OTHER_METRIC_VERSION_NOTE,
  REPORT_HEADLINE,
  STORED_NOTE,
  todayInClubZone,
  WEEK_IN_NUMBERS,
} from "./presentation";

/**
 * `/operate/report` — the Monday report. LAN-81.
 *
 * ## One screen
 *
 * Open it and the report is there. There is no preview step, no Generate
 * button, no version list and no "Open first action" — Brian's review of
 * 15 August 2026 removed all four, and every one of them was something the
 * first build asked him to understand before it would tell him anything.
 *
 * What is left is what he asked for: **chase these people**, then **fix these
 * things**, then the onboarding backlog, then the week's numbers in one small
 * block at the bottom for anybody who wants them.
 *
 * ## It still reads a stored snapshot
 *
 * `readReportForDate` returns the snapshot filed for this date today, filing
 * one first if today has not produced one. So the screen renders stored content
 * and never a live recompute — invariant M5's whole point, and the property
 * that would have been quietly lost by making the page "just show the numbers".
 * The reader is never told any of that; the one line at the bottom says the
 * report is kept as it was, which is the part that matters to them.
 *
 * ## Authorization
 *
 * `leadership_report` — the four calendar roles. It is the one destination in
 * the shell that is capability-gated, and `slice-ux.md` § 3 names the report,
 * and RSVP reasons, among the surfaces a coaching seat never receives.
 */
export default async function ReportPage({ searchParams }: PageProps<"/operate/report">) {
  const gate = await gateShellPage("/operate/report", "leadership_report");
  if ("screen" in gate) return gate.screen;

  const query = await searchParams;
  const requested = typeof query.date === "string" && query.date !== "" ? query.date : null;
  const date = requested ?? todayInClubZone();

  let report: StoredReport;
  try {
    report = await readReportForDate(gate.operator.personId, date);
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

  const content = parseReportContent(report.content);

  return (
    <Stack spacing={4} sx={{ maxWidth: 860 }} data-testid="monday-report" data-report={report.id}>
      <Box>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          {REPORT_HEADLINE}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {formatReportDate(report.reportOn)}
          {content ? ` · ${formatWindow(content.window)}` : ""}
        </Typography>
      </Box>

      <ReportDateForm date={report.reportOn} />

      {content === null ? (
        <Alert severity="info" data-testid="other-metric-version">
          {OTHER_METRIC_VERSION_NOTE}
        </Alert>
      ) : (
        <ReportBody content={content} />
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

function ReportBody({ content }: { content: WeeklyReportContent }) {
  const nothingAtAll = content.chase.length === 0 && content.fix.length === 0;

  return (
    <>
      {nothingAtAll ? (
        <Alert severity="info" data-testid="nothing-at-all">
          {NOTHING_AT_ALL}
        </Alert>
      ) : null}

      <Section
        testId="chase"
        headline={CHASE_HEADLINE}
        count={content.chase.length}
        empty={CHASE_EMPTY}
      >
        {content.chase.map((item, index) => (
          <ChaseRow key={`chase-${index}`} item={item} />
        ))}
      </Section>

      <Section testId="fix" headline={FIX_HEADLINE} count={content.fix.length} empty={FIX_EMPTY}>
        {content.fix.map((item, index) => (
          <FixRow key={`fix-${index}`} item={item} />
        ))}
      </Section>

      <Section
        testId="onboarding"
        headline={ONBOARDING_HEADLINE}
        count={content.onboarding.length}
        empty={ONBOARDING_EMPTY}
      >
        {content.onboarding.map((item, index) => (
          <Row
            key={`onboarding-${index}`}
            primary={item.person}
            secondary={item.outstanding}
            badge={item.membershipStatus === "onboarding" ? "Onboarding" : null}
          />
        ))}
      </Section>

      <WeekInNumbers content={content} />
    </>
  );
}

/**
 * One block: a heading that carries its own count, and either its rows or the
 * sentence that says there are none.
 *
 * The count is in the heading rather than in a tile above it. A row of big
 * numbers was the first thing on the old screen and the last thing anybody
 * needed: "Chase these people · 8" says the same thing in the place the reader
 * is already looking.
 */
function Section({
  testId,
  headline,
  count,
  empty,
  children,
}: {
  testId: string;
  headline: string;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <Box component="section" data-testid={`section-${testId}`} data-count={count}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "baseline", mb: 1.5 }}>
        <Typography variant="h6" component="h2" sx={{ fontWeight: 700 }}>
          {headline}
        </Typography>
        <Typography variant="h6" component="p" color="text.secondary" sx={{ fontWeight: 700 }}>
          {count}
        </Typography>
      </Stack>

      {count === 0 ? (
        <Typography variant="body2" color="text.secondary" data-testid={`empty-${testId}`}>
          {empty}
        </Typography>
      ) : (
        <Paper variant="outlined">
          <Box component="ul" sx={{ listStyle: "none", p: 0, m: 0 }}>
            {children}
          </Box>
        </Paper>
      )}
    </Box>
  );
}

/**
 * A row is a name, what it is about, and where it came from — in that order,
 * because the operator is reading down a column of names deciding who to
 * message.
 */
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

function ChaseRow({ item }: { item: ChaseItem }) {
  const where = `${item.event}${item.isMandatory ? " (mandatory)" : ""} · ${formatShortDay(item.on)}`;
  return (
    <Row
      primary={item.person}
      badge={CHASE_LABELS[item.kind]}
      badgeColor={item.kind === "said_yes_absent" ? "warning" : "default"}
      // The reason sits with the person who gave it. It is the most sensitive
      // line in the slice and the most useful one on the screen: "not attending"
      // is a fact, and "not attending — coursework deadline" is a decision.
      secondary={item.reason ? `${where} · “${item.reason}”` : where}
    />
  );
}

function FixRow({ item }: { item: FixItem }) {
  return (
    <Row
      primary={item.person ?? item.event}
      badge={FIX_LABELS[item.kind]}
      badgeColor={item.kind === "approved_never_invited" ? "warning" : "default"}
      secondary={
        item.person
          ? `${item.what} · ${item.event} · ${formatShortDay(item.on)}`
          : `${item.what} · ${formatShortDay(item.on)}`
      }
    />
  );
}

/**
 * The week's numbers, kept because `slice-ux.md` § 10 requires the snapshot to
 * carry them and a reader may want them — and kept *small*, because they are
 * not what anybody opens this report to do.
 *
 * Availability appears as a count per level and nothing else. There is no note
 * here because there is no note anywhere: the schema has no column capable of
 * holding a diagnosis, the Oxford guidance that would authorise a bounded one is
 * still outstanding, and `tests/schema-security.test.ts` scans the whole schema
 * for one. The sentence under the counts says so, so nobody reads the absence
 * as an omission and helpfully fills it in.
 */
function WeekInNumbers({ content }: { content: WeeklyReportContent }) {
  const attendance = content.attendance;
  const soliciting = content.events.filter((event) => event.solicitsResponse);
  const asked = content.responseBreakdown.reduce(
    (total, row) =>
      total +
      row.respondedYes +
      row.respondedNo +
      row.awaitingResponse +
      row.expiredWithoutResponse +
      row.cancelled +
      row.neverInvited,
    0,
  );
  const yes = content.responseBreakdown.reduce((total, row) => total + row.respondedYes, 0);

  return (
    <Box component="section" data-testid="week-in-numbers">
      <Typography variant="subtitle2" component="h2" color="text.secondary" sx={{ mb: 1 }}>
        {WEEK_IN_NUMBERS}
      </Typography>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary" data-testid="week-events">
          {`${content.events.length} events · ${soliciting.length} asked for a response · ${asked} people asked · ${yes} said yes`}
        </Typography>
        <Typography variant="body2" color="text.secondary" data-testid="week-attendance">
          {`Present ${attendance.present} · Late ${attendance.late} · Excused ${attendance.excused} · Absent ${attendance.absent}`}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          <Box component="span" sx={{ fontWeight: 600 }}>
            {`${AVAILABILITY_HEADLINE}: `}
          </Box>
          <Box component="span" data-testid="availability-levels">
            {`${AVAILABILITY_LABELS.green} ${content.availability.green} · ${AVAILABILITY_LABELS.orange} ${content.availability.orange} · ${AVAILABILITY_LABELS.red} ${content.availability.red}`}
          </Box>
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {AVAILABILITY_NOTE}
        </Typography>
      </Paper>
    </Box>
  );
}
