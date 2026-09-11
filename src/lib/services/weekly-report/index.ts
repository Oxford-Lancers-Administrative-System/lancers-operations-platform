/** The Monday report's public surface — LAN-81, invariant M5. */

export {
  METRIC_DEFINITION_VERSION,
  REPORT_CONTENT_SCHEMA,
  normaliseReportDate,
  reportWindow,
  lookaheadWindow,
} from "./shared";
export type {
  EventOutcome,
  GridCell,
  GridRow,
  UpcomingEvent,
  OnboardingRow,
  WeeklyReportContent,
  StoredReport,
} from "./shared";
export { computeReportContent } from "./compute";

export { generateWeeklyReport } from "./write";
export {
  readReportForDate,
  readCurrentReport,
  listReportVersions,
  readStoredReport,
  parseReportContent,
} from "./read";
