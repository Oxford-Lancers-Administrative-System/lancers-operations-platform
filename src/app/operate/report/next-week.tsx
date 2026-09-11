import { RowCard } from "@/components/row-card";
import { StatusChip } from "@/components/status-chip";
import Box from "@mui/material/Box";
import type { UpcomingEvent, WeeklyReportContent } from "@/lib/services/weekly-report";
import { ReportSection } from "./report-section";
import {
  EVENT_STATUS_LABELS,
  formatShortDay,
  formatSpan,
  labelFor,
  NEXT_WEEK_EMPTY,
  NEXT_WEEK_HEADLINE,
} from "./presentation";

// The week ahead, read-only — Brian's bounded amendment of 15 August (one
// week forward; the three-week horizon remains LAN-109's).
export function NextWeek({ content }: { content: WeeklyReportContent }) {
  return (
    <ReportSection
      testId="next-week"
      headline={NEXT_WEEK_HEADLINE}
      count={content.nextWeek.length}
      span={formatSpan(content.lookAhead)}
      empty={NEXT_WEEK_EMPTY}
    >
      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: {
            xs: "1fr",
            sm: "repeat(2, minmax(0, 1fr))",
            lg: "repeat(3, minmax(0, 1fr))",
          },
        }}
      >
        {content.nextWeek.map((event) => (
          <UpcomingCard key={event.id} event={event} />
        ))}
      </Box>
    </ReportSection>
  );
}

function UpcomingCard({ event }: { event: UpcomingEvent }) {
  const invitations =
    event.invited === 0 ? "No invitations sent" : `${event.answered} of ${event.invited} answered`;

  return (
    <RowCard
      testId={`upcoming-${event.id}`}
      title={event.name}
      href={`/operate/events/${event.id}`}
      chips={
        <StatusChip
          domain="event"
          status={event.status}
          label={labelFor(EVENT_STATUS_LABELS, event.status)}
        />
      }
      sublines={[
        formatShortDay(event.on),
        `${invitations}${event.isMandatory ? " · mandatory" : ""}`,
      ]}
    />
  );
}
