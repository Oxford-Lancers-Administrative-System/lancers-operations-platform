import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { isServiceError } from "@/lib/db";
import {
  listReportVersions,
  parseReportContent,
  previewWeeklyReport,
  readCurrentReport,
  type ExceptionSection,
  type ReportPreview,
  type StoredReport,
  type WeeklyReportContent,
} from "@/lib/services/weekly-report";
import { gateShellPage } from "../gate";
import { ExceptionCard } from "./exception-card";
import { GenerateForm } from "./generate-form";
import { ReportDateForm } from "./report-date-form";
import {
  AVAILABILITY_HEADLINE,
  AVAILABILITY_LABELS,
  AVAILABILITY_NOTE,
  CHANGE_REPORTING_DATE,
  CHOOSE_ANOTHER_DATE,
  EMPTY_DETAIL,
  EMPTY_HEADLINE,
  EMPTY_IS_NOT_AN_ALL_CLEAR,
  formatPlainDate,
  formatReportDate,
  formatSnapshotStamp,
  formatTableInstant,
  formatWindow,
  METRIC_DEFINITIONS_LABEL,
  OPEN_CURRENT_REPORT,
  OPEN_FIRST_ACTION,
  OTHER_METRIC_VERSION_NOTE,
  PREVIEW_HEADLINE,
  PREVIEW_MEANING,
  PREVIEW_REPORT,
  PREVIEW_SECTION_TITLES,
  PREVIEW_TILES,
  REPORT_HEADLINE,
  SNAPSHOT_VERSION_LABEL,
  STORED_ONLY_NOTE,
  todayInClubZone,
  VERSION_CURRENT,
  VERSION_SUPERSEDED,
  VERSIONS_HEADLINE,
  VERSIONS_NOTE,
  VIEW_REPORT_VERSIONS,
} from "./presentation";

/**
 * `/operate/report` — UX-80, UX-81, UX-82 and UX-83. LAN-81.
 *
 * ## One route, four screens
 *
 * The screen registry gives all four the same route, and they are states of one
 * thing rather than four pages:
 *
 *   * **UX-81** by default, when a snapshot exists for the date — the stored
 *     report, read from `content` and never recomputed;
 *   * **UX-83** by default, when none does — an absence of a snapshot, which
 *     the copy is careful to say is not an all-clear;
 *   * **UX-80** at `?preview=1` — the computed exceptions and the one control
 *     that writes;
 *   * **UX-82** at `?versions=1` — every version for the date, current marked.
 *
 * ## The rule this page exists to keep
 *
 * **A stored report is rendered from stored content.** UX-81 reads
 * `report.content` and nothing else — it does not call the preview, and there
 * is no path on it that touches a view. That is what makes "what did leadership
 * see on the 12th?" answerable, and it is asserted by a test that changes the
 * underlying data after generation and re-renders the same snapshot.
 *
 * The preview is the opposite by design, and says so on the screen: computed
 * from current source data, and stored only when somebody presses Generate.
 *
 * ## Authorization
 *
 * `leadership_report` — the four calendar roles. It is the one destination in
 * the shell that is capability-gated, and § 3 names the report among the
 * surfaces a coaching seat never receives. The write re-checks it in its own
 * server action; this gate decides what is drawn.
 */
export default async function ReportPage({ searchParams }: PageProps<"/operate/report">) {
  const gate = await gateShellPage("/operate/report", "leadership_report");
  if ("screen" in gate) return gate.screen;

  const query = await searchParams;
  const requested = typeof query.date === "string" && query.date !== "" ? query.date : null;
  const date = requested ?? todayInClubZone();
  const wantsPreview = query.preview === "1";
  const wantsVersions = query.versions === "1";

  // Every branch reads here and renders a synchronous component, rather than
  // returning an async component for React to resolve. Both work in the
  // application; only this one is renderable by a test, and a screen nobody can
  // render is a screen nobody checks.
  if (wantsVersions) {
    return withRefusal(date, async () => {
      const versions = await listReportVersions(date);
      return <VersionsScreen date={date} versions={versions} />;
    });
  }

  if (wantsPreview) {
    return withRefusal(date, async () => {
      const previewed = await previewWeeklyReport(date);
      return <PreviewScreen preview={previewed} />;
    });
  }

  return withRefusal(date, async () => {
    const stored = await readCurrentReport(date);
    return stored ? <StoredScreen report={stored} /> : <EmptyScreen date={date} />;
  });
}

/**
 * A refusal the service raised — an unparseable date, no open season — becomes
 * a sentence and the date control, rather than a stack trace.
 *
 * The date control is the point: every refusal on this route is recoverable by
 * choosing a different date, and § 9 asks an error state to offer the smallest
 * authorized recovery rather than a dead end.
 */
async function withRefusal(date: string, render: () => Promise<React.ReactElement>) {
  try {
    return await render();
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return (
      <Stack spacing={3} sx={{ maxWidth: 720 }}>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          {PREVIEW_HEADLINE}
        </Typography>
        <Alert severity="warning" data-testid="report-unavailable">
          {error.message}
        </Alert>
        <ReportDateForm date={isDate(date) ? date : todayInClubZone()} />
      </Stack>
    );
  }
}

function isDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

// ---------------------------------------------------------------------------
// UX-80 — Prepare Monday report
// ---------------------------------------------------------------------------

function PreviewScreen({ preview }: { preview: ReportPreview }) {
  const { content } = preview;

  return (
    <Stack spacing={3} sx={{ maxWidth: 1100 }} data-testid="report-preview">
      <Box>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          {PREVIEW_HEADLINE}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {`Reporting date · ${formatReportDate(preview.reportOn)}`}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {formatWindow(content.window)}
        </Typography>
      </Box>

      {/*
        Not a footnote. The difference between these numbers and a snapshot's is
        the whole subject of the screen, and an operator who reads a preview as
        a filed report has read the opposite of what it is.
      */}
      <Alert severity="info" data-testid="preview-meaning">
        {PREVIEW_MEANING}
      </Alert>

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" },
        }}
      >
        {PREVIEW_TILES.map((tile) => {
          const section = content.exceptions.find((entry) => entry.key === tile.key);
          return (
            <Paper key={tile.key} variant="outlined" sx={{ p: 2 }} data-testid={`tile-${tile.key}`}>
              <Typography variant="h4" component="p" sx={{ fontWeight: 700 }}>
                {section?.count ?? 0}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {tile.label}
              </Typography>
            </Paper>
          );
        })}
      </Box>

      <Stack spacing={2}>
        {content.exceptions.map((section) => (
          <ExceptionCard
            key={section.key}
            section={section}
            title={PREVIEW_SECTION_TITLES[section.key]}
            showList={false}
          />
        ))}
      </Stack>

      <AvailabilityPanel content={content} />

      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ alignItems: { sm: "center" } }}
      >
        <GenerateForm reportOn={preview.reportOn} />
        <Button
          variant="text"
          href={`/operate/report?date=${encodeURIComponent(preview.reportOn)}`}
          sx={{ minHeight: 44 }}
          data-testid="change-reporting-date"
        >
          {CHANGE_REPORTING_DATE}
        </Button>
      </Stack>

      <ReportDateForm date={preview.reportOn} />
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// UX-81 — the stored snapshot
// ---------------------------------------------------------------------------

function StoredScreen({ report }: { report: StoredReport }) {
  const content = parseReportContent(report.content);
  const sections: ExceptionSection[] = content?.exceptions ?? [];
  const firstAction = sections.find((section) => section.count > 0);

  return (
    <Stack spacing={3} sx={{ maxWidth: 1100 }} data-testid="stored-report" data-report={report.id}>
      <Box>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          {REPORT_HEADLINE}
        </Typography>
        <Typography variant="body2" color="text.secondary" data-testid="snapshot-stamp">
          {formatSnapshotStamp(report.generatedAt, report.dataAsOf)}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {`Reporting date · ${formatPlainDate(report.reportOn)}${
            content ? ` · ${formatWindow(content.window)}` : ""
          }`}
        </Typography>
      </Box>

      <Alert severity="info" data-testid="stored-only-note">
        {STORED_ONLY_NOTE}
      </Alert>

      <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", gap: 1 }}>
        <Metadata label={SNAPSHOT_VERSION_LABEL} value={`v${report.version}`} testId="version" />
        <Metadata
          label={METRIC_DEFINITIONS_LABEL}
          value={report.metricDefinitionVersion}
          testId="metric-version"
        />
        <Metadata
          label="Generated by"
          value={report.generatedByName ?? "Not recorded"}
          testId="generated-by"
        />
        {report.isSuperseded ? (
          <Metadata label="Status" value={VERSION_SUPERSEDED} testId="superseded" />
        ) : null}
      </Stack>

      {content === null ? (
        <Alert severity="info" data-testid="other-metric-version">
          {OTHER_METRIC_VERSION_NOTE}
        </Alert>
      ) : (
        <>
          <Stack spacing={2}>
            {sections.map((section) => (
              <ExceptionCard
                key={section.key}
                section={section}
                title={section.title}
                showList
                anchorId={`section-${section.key}`}
              />
            ))}
          </Stack>
          <AvailabilityPanel content={content} />
        </>
      )}

      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ alignItems: { sm: "center" } }}
      >
        {firstAction ? (
          <Button
            variant="contained"
            href={`#section-${firstAction.key}`}
            sx={{ minHeight: 44 }}
            data-testid="open-first-action"
          >
            {OPEN_FIRST_ACTION}
          </Button>
        ) : null}
        <Button
          variant="outlined"
          href={`/operate/report?date=${encodeURIComponent(report.reportOn)}&versions=1`}
          sx={{ minHeight: 44 }}
          data-testid="view-report-versions"
        >
          {VIEW_REPORT_VERSIONS}
        </Button>
        <Button
          variant="text"
          href={`/operate/report?date=${encodeURIComponent(report.reportOn)}&preview=1`}
          sx={{ minHeight: 44 }}
          data-testid="preview-again"
        >
          {PREVIEW_REPORT}
        </Button>
      </Stack>
    </Stack>
  );
}

function Metadata({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <Paper variant="outlined" sx={{ px: 2, py: 1.5, minWidth: 160 }} data-testid={`meta-${testId}`}>
      <Typography variant="h6" component="p" sx={{ fontWeight: 700 }}>
        {value}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
    </Paper>
  );
}

/**
 * Availability, as a count per level and nothing else.
 *
 * There is no note here because there is no note anywhere: the schema has no
 * column capable of holding a diagnosis, the Oxford guidance that would
 * authorise a bounded one is still outstanding, and
 * `tests/schema-security.test.ts` scans the whole schema for one. The sentence
 * under the counts says so on the screen, so that nobody reads the absence as
 * an omission and helpfully fills it in.
 */
function AvailabilityPanel({ content }: { content: WeeklyReportContent }) {
  const entries = [
    { key: "green", value: content.availability.green },
    { key: "orange", value: content.availability.orange },
    { key: "red", value: content.availability.red },
  ];

  return (
    <Paper variant="outlined" sx={{ p: 2 }} data-testid="availability-panel">
      <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 700 }}>
        {AVAILABILITY_HEADLINE}
      </Typography>
      <Typography variant="body2" color="text.secondary" data-testid="availability-levels">
        {entries.map((entry) => `${AVAILABILITY_LABELS[entry.key]} ${entry.value}`).join(" · ")}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {AVAILABILITY_NOTE}
      </Typography>
    </Paper>
  );
}

// ---------------------------------------------------------------------------
// UX-82 — Report versions
// ---------------------------------------------------------------------------

function VersionsScreen({ date, versions }: { date: string; versions: StoredReport[] }) {
  const current = versions[0] ?? null;
  const byId = new Map(versions.map((version) => [version.id, version.version]));

  return (
    <Stack spacing={3} sx={{ maxWidth: 1100 }} data-testid="report-versions">
      <Box>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          {VERSIONS_HEADLINE}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {`Reporting date · ${formatPlainDate(date)}`}
        </Typography>
      </Box>

      <Alert severity="info" data-testid="versions-note">
        {VERSIONS_NOTE}
      </Alert>

      {versions.length === 0 ? (
        <Alert severity="info" data-testid="no-versions">
          {EMPTY_IS_NOT_AN_ALL_CLEAR}
        </Alert>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ overflowX: "auto" }}>
          <Table size="small" aria-label={VERSIONS_HEADLINE}>
            <TableHead>
              <TableRow>
                <TableCell>Version</TableCell>
                <TableCell>Current</TableCell>
                <TableCell>Generated</TableCell>
                <TableCell>Data as of</TableCell>
                <TableCell>Generated by</TableCell>
                <TableCell>Supersedes</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {versions.map((version) => (
                <TableRow
                  key={version.id}
                  data-testid={`version-${version.version}`}
                  data-current={version.isSuperseded ? "false" : "true"}
                >
                  <TableCell sx={{ fontWeight: 700 }}>{`v${version.version}`}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={version.isSuperseded ? VERSION_SUPERSEDED : VERSION_CURRENT}
                      color={version.isSuperseded ? "default" : "primary"}
                      variant={version.isSuperseded ? "outlined" : "filled"}
                    />
                  </TableCell>
                  <TableCell>{formatTableInstant(version.generatedAt)}</TableCell>
                  <TableCell>{formatTableInstant(version.dataAsOf)}</TableCell>
                  <TableCell>{version.generatedByName ?? "Not recorded"}</TableCell>
                  <TableCell>
                    {version.supersedesId
                      ? `v${byId.get(version.supersedesId) ?? "?"}`
                      : /* An em dash, exactly as UX-82 shows it: version 1
                           supersedes nothing, and the database refuses a
                           version 1 that claims to. */
                        "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        {current ? (
          <Button
            variant="contained"
            href={`/operate/report?date=${encodeURIComponent(date)}`}
            sx={{ minHeight: 44 }}
            data-testid="open-current-report"
          >
            {OPEN_CURRENT_REPORT}
          </Button>
        ) : null}
        <Button
          variant="outlined"
          href={`/operate/report?date=${encodeURIComponent(date)}&preview=1`}
          sx={{ minHeight: 44 }}
        >
          {PREVIEW_REPORT}
        </Button>
      </Stack>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// UX-83 — no stored report for this date
// ---------------------------------------------------------------------------

function EmptyScreen({ date }: { date: string }) {
  return (
    <Stack spacing={3} sx={{ maxWidth: 720 }} data-testid="report-empty">
      <Box>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          {EMPTY_HEADLINE}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {EMPTY_DETAIL}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {`Reporting date · ${formatPlainDate(date)}`}
        </Typography>
      </Box>

      {/*
        The distinction § 9 asks an empty state to draw, and the one that
        actually costs the club something if it is blurred: nothing generated
        and nothing wrong look the same on a screen and mean opposite things.
      */}
      <Alert severity="info" data-testid="not-an-all-clear">
        {EMPTY_IS_NOT_AN_ALL_CLEAR}
      </Alert>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <Button
          variant="contained"
          href={`/operate/report?date=${encodeURIComponent(date)}&preview=1`}
          sx={{ minHeight: 44 }}
          data-testid="preview-report"
        >
          {PREVIEW_REPORT}
        </Button>
      </Stack>

      <Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {CHOOSE_ANOTHER_DATE}
        </Typography>
        <ReportDateForm date={date} preview={false} submitLabel={CHOOSE_ANOTHER_DATE} />
      </Box>
    </Stack>
  );
}
