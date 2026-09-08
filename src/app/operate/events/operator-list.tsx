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
import {
  DELIVERY_MODE_LABELS,
  formatShortDate,
  labelFor,
  TYPE_LABELS,
} from "@/lib/services/event-vocabulary";

/**
 * The operator's event list — the one they live in. LAN-153, `REQ-list-shape`.
 *
 * ## The columns, after Brian's clarification
 *
 * Name (a link to the event — Brian, 21 August 2026: "the event itself should be
 * a hyperlink that leads to the event page itself"), type with its shared
 * colour, date, term and week, status, and the three counts an operator actually
 * asks about: **Invited**, **Said yes**, and **Showed / Invited**.
 *
 * Brian, 20 August 2026: "If you're an operator, you get a slightly different
 * view of these because you should be able to see attendance numbers in the
 * list." The counts are raw pairs and never percentages (D62) — a club of
 * forty-seven reading "43%" has to do arithmetic to recover the fact it wanted.
 *
 * ## `Showed / Invited` reads "—" until a register has been saved
 *
 * D73 and D74, established by LAN-152 and formatted by the same function the
 * event page and the register use, so the three cannot disagree. An event nobody
 * has got round to must not read as a disaster: `— / 47` is a session to ask
 * about and `0 / 47` is a register that was taken and found empty, and those are
 * very different facts.
 *
 * ## What went
 *
 * **Audience**, which said "Chosen at approval" for everything a calendar
 * operator can create and a count for the rest, is replaced by the two counts
 * that answer the question it was standing in for. **Venue** merged into Where.
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
                      <TableCell>{labelFor(TYPE_LABELS, event.eventType)}</TableCell>
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
                  labelFor(TYPE_LABELS, event.eventType),
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
 * The one formatter, fed from the list's own counts.
 *
 * `formatShowedAgainstInvited` is the register's and the event page's too, so
 * the em dash appears in the same circumstances on all three — `docs/ux/standards.md`
 * rule 7 applied to the fact the club is most likely to misread.
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
