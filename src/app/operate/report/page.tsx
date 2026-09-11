import { PageHeader } from "@/components/page-header";
import { Notice } from "@/components/notice";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { redirect } from "next/navigation";
import { isServiceError } from "@/lib/db";
import {
  parseReportContent,
  readReportForDate,
  type StoredReport,
} from "@/lib/services/weekly-report";
import { gateShellPage } from "../gate";
import { ReportDateForm } from "./report-date-form";
import { ReportBody } from "./report-body";
import {
  formatInstant,
  formatReportDate,
  isGridSort,
  OTHER_METRIC_VERSION_NOTE,
  REPORT_HEADLINE,
  todayInClubZone,
} from "./presentation";

/** `/operate/report` — the Monday report. LAN-81. Reads a stored snapshot (invariant M5), never a live recompute. Decision history: docs/ux/tickets/LAN-81-monday-report.md */
export default async function ReportPage({ searchParams }: PageProps<"/operate/report">) {
  const gate = await gateShellPage("/operate/report", "leadership_report");
  if ("screen" in gate) return gate.screen;

  const query = await searchParams;
  const requested = typeof query.date === "string" && query.date !== "" ? query.date : null;
  const date = requested ?? todayInClubZone();

  // Sort lives in the URL, not component state — survives a refresh, shareable, needs no JS.
  const sortBy = typeof query.sort === "string" && isGridSort(query.sort) ? query.sort : "issues";
  const ascending = query.dir === "asc";

  // Its own pair, so ordering one grid never reorders the other.
  const onboardingBy =
    typeof query.osort === "string" && isGridSort(query.osort) ? query.osort : "issues";
  const onboardingAscending = query.odir === "asc";

  // Pressing Show Report files a snapshot; arriving/sorting/refreshing do not (see `readReportForDate`).
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

  // Filed — take the marker out of the address bar, or a refresh would file a second snapshot.
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
