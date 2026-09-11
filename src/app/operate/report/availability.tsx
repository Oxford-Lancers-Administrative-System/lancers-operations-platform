import { RowCardList } from "@/components/row-card";
import type { WeeklyReportContent } from "@/lib/services/weekly-report";
import { ReportSection, Row } from "./report-section";
import {
  AVAILABILITY_EMPTY,
  AVAILABILITY_HEADLINE,
  AVAILABILITY_LABELS,
  formatShortDay,
  labelFor,
} from "./presentation";

// Who is not fully available, and since when — a level and two dates, and
// nothing else. Decision history: docs/ux/tickets/LAN-81-monday-report.md.
export function Availability({ content }: { content: WeeklyReportContent }) {
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
