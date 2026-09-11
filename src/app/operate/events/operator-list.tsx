import { StatusChip } from "@/components/status-chip";
import { RowCard, RowCardList, DesktopOnly } from "@/components/row-card";
import { TableFrame } from "@/components/sortable-header";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import SortableHeader, { type SortLink } from "@/app/calendar/sortable-header";
import { operatorEventHref } from "@/app/calendar/routes";
import { formatShowedAgainstInvited } from "@/app/operate/events/[id]/attendance/presentation";
import type { PeriodBucket } from "@/lib/services/event-periods";
import type { EventListEntry } from "@/lib/services/events";
import { DELIVERY_MODE_LABELS, formatShortDate, labelFor } from "@/lib/services/event-vocabulary";

/**
 * The operator's event list — the one they live in. LAN-153, `REQ-list-shape`.
 * Name links to the event (Brian). Columns: type, date, term/week, status,
 * Invited/Said yes/Showed-Invited — raw pairs, never percentages (D62).
 * `Showed / Invited` reads "—" until a register is saved (D73, D74, LAN-152).
 * Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE
 */
export default function OperatorList({
  buckets,
  sortLinkFor,
  sort,
  direction,
  statusLabelOf,
  statusCodeOf,
  coordinateOf,
}: {
  buckets: readonly PeriodBucket<EventListEntry>[];
  sortLinkFor: (column: string) => SortLink;
  sort: string;
  direction: string;
  statusLabelOf: (event: EventListEntry) => string;
  statusCodeOf: (event: EventListEntry) => string;
  coordinateOf: (event: EventListEntry) => string;
}) {
  return (
    <Stack spacing={3}>
      {buckets.map((bucket) => (
        <Stack key={bucket.key} spacing={1} data-testid="event-bucket" data-bucket={bucket.key}>
          <Typography variant="overline" component="h2" color="text.secondary">
            {`${bucket.label} · ${bucket.events.length} ${bucket.events.length === 1 ? "event" : "events"}`}
          </Typography>

          {/* Desktop: the scannable command view. */}
          <DesktopOnly>
            <TableFrame>
              <Table size="small" aria-label={bucket.label}>
                <TableHead>
                  <TableRow>
                    <SortableHeader link={sortLinkFor("name")} sort={sort} direction={direction}>
                      Event
                    </SortableHeader>
                    <SortableHeader link={sortLinkFor("type")} sort={sort} direction={direction}>
                      Type
                    </SortableHeader>
                    <SortableHeader link={sortLinkFor("date")} sort={sort} direction={direction}>
                      Date
                    </SortableHeader>
                    <SortableHeader link={sortLinkFor("term")} sort={sort} direction={direction}>
                      Term and week
                    </SortableHeader>
                    <SortableHeader link={sortLinkFor("status")} sort={sort} direction={direction}>
                      Status
                    </SortableHeader>
                    <SortableHeader
                      link={sortLinkFor("invited")}
                      sort={sort}
                      direction={direction}
                      align="right"
                    >
                      Invited
                    </SortableHeader>
                    <SortableHeader
                      link={sortLinkFor("said_yes")}
                      sort={sort}
                      direction={direction}
                      align="right"
                    >
                      Said yes
                    </SortableHeader>
                    <SortableHeader
                      link={sortLinkFor("showed")}
                      sort={sort}
                      direction={direction}
                      align="right"
                    >
                      Showed / Invited
                    </SortableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {bucket.events.map((event) => (
                    <TableRow key={event.id} hover data-testid="event-row">
                      <TableCell>
                        <Typography
                          component="a"
                          href={operatorEventHref(event.id)}
                          variant="body2"
                          sx={{ fontWeight: 700, color: "text.primary" }}
                        >
                          {event.name}
                        </Typography>
                        <Typography variant="caption" component="p" color="text.secondary">
                          {`${event.startsAt ?? "No time"} · ${whereItIs(event)}`}
                        </Typography>
                      </TableCell>
                      <TableCell>{event.templateName}</TableCell>
                      <TableCell>{formatShortDate(event.scheduledOn)}</TableCell>
                      <TableCell>{coordinateOf(event)}</TableCell>
                      <TableCell>
                        <StatusChip
                          domain="event"
                          status={statusCodeOf(event)}
                          label={statusLabelOf(event)}
                        />
                      </TableCell>
                      <TableCell align="right">{event.invitationCount}</TableCell>
                      <TableCell align="right">{event.saidYesCount}</TableCell>
                      <TableCell align="right" data-testid="showed-against-invited">
                        {showedAgainstInvited(event)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableFrame>
          </DesktopOnly>

          {/* Phone: one condensed card per event, with nothing left out. */}
          <RowCardList>
            {bucket.events.map((event) => (
              <RowCard
                key={event.id}
                testId="event-card"
                title={event.name}
                href={operatorEventHref(event.id)}
                trailing={event.startsAt ?? undefined}
                chips={
                  <StatusChip
                    domain="event"
                    status={statusCodeOf(event)}
                    label={statusLabelOf(event)}
                  />
                }
                sublines={[
                  formatShortDate(event.scheduledOn),
                  event.templateName,
                  coordinateOf(event),
                  whereItIs(event),
                  <span
                    key="counts"
                    data-testid="showed-against-invited"
                  >{`Invited ${event.invitationCount} · Said yes ${event.saidYesCount} · Showed ${showedAgainstInvited(event)}`}</span>,
                ]}
              />
            ))}
          </RowCardList>
        </Stack>
      ))}
    </Stack>
  );
}

/**
 * The one formatter, fed from the list's own counts — same as the register
 * and the event page (`docs/ux/standards.md` rule 7).
 */
function showedAgainstInvited(event: EventListEntry): string {
  return formatShowedAgainstInvited({
    showed: event.showedCount,
    invited: event.invitationCount,
    registerSaved: event.registerSaved,
  });
}

/** Where the event is — the address, or that it is online. */
function whereItIs(event: EventListEntry): string {
  return event.venue ?? labelFor(DELIVERY_MODE_LABELS, event.deliveryMode);
}
