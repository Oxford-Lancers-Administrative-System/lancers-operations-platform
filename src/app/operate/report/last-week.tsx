import { TableFrame } from "@/components/sortable-header";
import Button from "@mui/material/Button";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import type { EventOutcome, WeeklyReportContent } from "@/lib/services/weekly-report";
import { ReportSection } from "./report-section";
import {
  EVENT_STATUS_LABELS,
  formatShortDay,
  formatSpan,
  labelFor,
  LAST_WEEK_EMPTY,
  LAST_WEEK_HEADLINE,
} from "./presentation";

/**
 * The event table Brian opens the report to read: what happened, who was asked,
 * who said yes, who came, and what percentage that is.
 *
 * The two event-level exceptions ride on the row rather than in a list of their
 * own. A register nobody took shows as "not taken" where the percentage would
 * be — never as 0%, which would read as nobody turning up.
 */
export function LastWeek({ content }: { content: WeeklyReportContent }) {
  return (
    <ReportSection
      testId="last-week"
      headline={LAST_WEEK_HEADLINE}
      count={content.lastWeek.length}
      span={formatSpan(content.lookBack)}
      empty={LAST_WEEK_EMPTY}
      showCount={false}
    >
      <TableFrame>
        <Table size="small" aria-label={LAST_WEEK_HEADLINE}>
          <TableHead>
            <TableRow>
              <TableCell>Event</TableCell>
              <TableCell align="right">Asked</TableCell>
              <TableCell align="right">Yes</TableCell>
              <TableCell align="right">No</TableCell>
              <TableCell align="right">Silent</TableCell>
              <TableCell align="right">Turned up</TableCell>
              <TableCell align="right">Turnout</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {content.lastWeek.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </TableBody>
        </Table>
      </TableFrame>
    </ReportSection>
  );
}

function EventRow({ event }: { event: EventOutcome }) {
  const flags: string[] = [];
  if (event.walkUps > 0) flags.push(`${event.walkUps} walk-up${event.walkUps === 1 ? "" : "s"}`);
  if (event.neverInvited > 0) flags.push(`${event.neverInvited} approved, never invited`);

  return (
    <TableRow
      data-testid={`event-${event.id}`}
      data-register={event.registerTaken ? "taken" : "missing"}
    >
      <TableCell>
        <Button
          href={`/operate/events/${event.id}`}
          size="small"
          sx={{ p: 0, minWidth: 0, textAlign: "left", fontWeight: 600, textTransform: "none" }}
        >
          {event.name}
        </Button>
        <Typography variant="body2" color="text.secondary">
          {`${formatShortDay(event.on)} · ${labelFor(EVENT_STATUS_LABELS, event.status)}${
            event.isMandatory ? " · mandatory" : ""
          }`}
        </Typography>
        {flags.length > 0 ? (
          <Typography variant="body2" color="warning.main" data-testid={`flags-${event.id}`}>
            {flags.join(" · ")}
          </Typography>
        ) : null}
      </TableCell>
      <TableCell align="right">{event.invited}</TableCell>
      {/*
        Unconditional since D23 removed "Response requested": every event asks
        its audience to answer, so there is no event whose answer columns are
        not a real number.
      */}
      <TableCell align="right">{event.respondedYes}</TableCell>
      <TableCell align="right">{event.respondedNo}</TableCell>
      <TableCell align="right">{event.noAnswer}</TableCell>
      <TableCell align="right">{event.registerTaken ? event.present + event.late : "—"}</TableCell>
      <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>
        {event.turnoutPercent === null ? (
          <Typography variant="body2" color="warning.main" component="span">
            {event.occurred ? "no register" : "—"}
          </Typography>
        ) : (
          `${event.turnoutPercent}%`
        )}
      </TableCell>
    </TableRow>
  );
}
