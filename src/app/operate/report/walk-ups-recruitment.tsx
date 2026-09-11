import { RowCardList } from "@/components/row-card";
import type { WeeklyReportContent } from "@/lib/services/weekly-report";
import { ReportSection, Row } from "./report-section";
import {
  formatShortDay,
  RECRUITMENT_EMPTY,
  RECRUITMENT_HEADLINE,
  WALK_UPS_EMPTY,
  WALK_UPS_HEADLINE,
} from "./presentation";

// Named for what they are, not for a category invented to hold them — Brian's
// objection to a generic "Fix these things" bucket applied to the grid, not to
// these two: each is a thing the club already has a word for.

export function WalkUps({ content }: { content: WeeklyReportContent }) {
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

export function Recruitment({ content }: { content: WeeklyReportContent }) {
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
