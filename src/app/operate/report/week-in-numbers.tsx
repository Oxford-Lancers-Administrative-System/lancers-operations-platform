import { Section as KitSection } from "@/components/section";
import { Metric, MetricRow } from "@/components/metric";
import Stack from "@mui/material/Stack";
import type { WeeklyReportContent } from "@/lib/services/weekly-report";
import { ATTENDANCE_LABELS, AVAILABILITY_LABELS, WEEK_IN_NUMBERS } from "./presentation";

export function WeekInNumbers({ content }: { content: WeeklyReportContent }) {
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
