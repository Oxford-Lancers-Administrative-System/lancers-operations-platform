import { isServiceError } from "@/lib/db";
import {
  parseReportContent,
  readReportForDate,
  type StoredReport,
} from "@/lib/services/weekly-report";
import { Refusal } from "@/components/refusal";
import { gateShellPage } from "@/app/operate/gate";
import { isGridSort, todayInClubZone } from "@/app/operate/report/presentation";
import ReportPreview from "./report-preview";

/**
 * S6 — the Monday report, on the kit. LAN-225.
 *
 * `/operate/report` for today, read through the same gate and the same
 * service (`fileNew` is never passed, so the preview files nothing the real
 * page would not file on arrival). Content and order unchanged.
 */
export default async function ReportPreviewPage({
  searchParams,
}: PageProps<"/design-preview/report">) {
  const gate = await gateShellPage("/design-preview/report", "leadership_report");
  if ("screen" in gate) return gate.screen;

  const query = await searchParams;
  const requested = typeof query.date === "string" && query.date !== "" ? query.date : null;
  const date = requested ?? todayInClubZone();
  const sortBy = typeof query.sort === "string" && isGridSort(query.sort) ? query.sort : "issues";
  const onboardingBy =
    typeof query.osort === "string" && isGridSort(query.osort) ? query.osort : "issues";

  let report: StoredReport;
  try {
    report = await readReportForDate(gate.operator.personId, date);
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return (
      <Refusal
        title="Monday report"
        message={error.message}
        action={{ href: "/design-preview", label: "Back to the preview" }}
      />
    );
  }

  return (
    <ReportPreview
      report={report}
      content={parseReportContent(report.content)}
      sort={{ by: sortBy, ascending: query.dir === "asc" }}
      onboardingSort={{ by: onboardingBy, ascending: query.odir === "asc" }}
    />
  );
}
