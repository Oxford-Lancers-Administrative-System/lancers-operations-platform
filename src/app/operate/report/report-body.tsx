import { EmptyState } from "@/components/empty-state";
import type { WeeklyReportContent } from "@/lib/services/weekly-report";
import type { GridSortState } from "./report-section";
import { LastWeek } from "./last-week";
import { ChaseGrid } from "./chase-grid";
import { Availability } from "./availability";
import { NextWeek } from "./next-week";
import { WalkUps, Recruitment } from "./walk-ups-recruitment";
import { Onboarding } from "./onboarding";
import { WeekInNumbers } from "./week-in-numbers";
import { NOTHING_AT_ALL } from "./presentation";

/** The eight sections, in Brian's order — see `page.tsx` for the order itself. */
export function ReportBody({
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
      {quiet ? <EmptyState title={NOTHING_AT_ALL} testId="nothing-at-all" /> : null}

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
