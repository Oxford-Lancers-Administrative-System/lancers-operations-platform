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

/**
 * Who is not fully available, and since when.
 *
 * A level and two dates, and nothing else — `availability_statuses` has no
 * column that could hold a note and none is to be added until the Oxford
 * guidance arrives. The screen no longer says so: Brian's instruction on
 * 15 August was to take the caption out, and a sentence explaining an absence
 * belongs in the code that maintains it rather than on his Monday morning.
 */
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
