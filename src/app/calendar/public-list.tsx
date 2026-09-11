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
import {
  DELIVERY_MODE_LABELS,
  formatShortDate,
  labelFor,
  STATUS_LABELS,
} from "@/lib/services/event-vocabulary";
import type { PublicEventListEntry } from "@/lib/services/events";
import type { PeriodBucket } from "@/lib/services/event-periods";
import { publicEventHref } from "./routes";
import SortableHeader, { type SortLink } from "./sortable-header";

/**
 * The public list — four columns, nothing about people. LAN-153. `W1`'s tier
 * table: no status, invited count, said-yes count or attendance, and never
 * the joining URL — `PublicEventListEntry` has no field for any of it. A
 * cancelled event stays on the list, marked cancelled (C1 to `W1`, D57), as a
 * chip beside the name, not a Status column. One condensed card per event on
 * a phone (Brian, 21 August 2026: events should start within a screen).
 *
 * Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE
 */
export default function PublicList({
  buckets,
  sortLinkFor,
  sort,
  direction,
  coordinateOf,
}: {
  buckets: readonly PeriodBucket<PublicEventListEntry>[];
  sortLinkFor: (column: string) => SortLink;
  sort: string;
  direction: string;
  /** "MT 2nd", "Christmas Vacation 2" — from the one year projection. */
  coordinateOf: (event: PublicEventListEntry) => string;
}) {
  return (
    <Stack spacing={3}>
      {buckets.map((bucket) => (
        <Stack key={bucket.key} spacing={1} data-testid="public-bucket" data-bucket={bucket.key}>
          <Typography variant="overline" component="h2" color="text.secondary">
            {`${bucket.label} · ${bucket.events.length} ${bucket.events.length === 1 ? "event" : "events"}`}
          </Typography>

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
                    <SortableHeader link={sortLinkFor("venue")} sort={sort} direction={direction}>
                      Where
                    </SortableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {bucket.events.map((event) => (
                    <TableRow key={event.id} hover data-testid="public-event-row">
                      <TableCell>
                        <Stack direction="row" spacing={1} sx={{ alignItems: "baseline" }}>
                          <Typography
                            component="a"
                            href={publicEventHref(event.id)}
                            variant="body2"
                            sx={{
                              fontWeight: 700,
                              textDecoration: event.isCancelled ? "line-through" : "underline",
                              color: "text.primary",
                            }}
                          >
                            {event.name}
                          </Typography>
                          {event.isCancelled ? (
                            <StatusChip
                              domain="event"
                              status="cancelled"
                              label={labelFor(STATUS_LABELS, "cancelled")}
                            />
                          ) : null}
                        </Stack>
                        {event.startsAt ? (
                          <Typography variant="caption" component="p" color="text.secondary">
                            {event.startsAt}
                          </Typography>
                        ) : null}
                      </TableCell>
                      <TableCell>{event.templateName}</TableCell>
                      <TableCell>{formatShortDate(event.scheduledOn)}</TableCell>
                      <TableCell>{coordinateOf(event)}</TableCell>
                      <TableCell>{whereItIs(event)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableFrame>
          </DesktopOnly>

          <RowCardList>
            {bucket.events.map((event) => (
              <RowCard
                key={event.id}
                testId="public-event-card"
                title={event.name}
                href={publicEventHref(event.id)}
                struckThrough={event.isCancelled}
                trailing={event.startsAt ?? undefined}
                chips={
                  event.isCancelled ? (
                    <StatusChip
                      domain="event"
                      status="cancelled"
                      label={labelFor(STATUS_LABELS, "cancelled")}
                    />
                  ) : undefined
                }
                sublines={[
                  formatShortDate(event.scheduledOn),
                  event.templateName,
                  coordinateOf(event),
                  whereItIs(event),
                ]}
              />
            ))}
          </RowCardList>
        </Stack>
      ))}
    </Stack>
  );
}

/** Where the event is, at the public tier (D21). The joining link is on the event's own page (LAN-284) — `PublicEventListEntry` has no field for one here. */
function whereItIs(event: PublicEventListEntry): string {
  if (event.deliveryMode === "online") {
    return event.venue ?? labelFor(DELIVERY_MODE_LABELS, "online");
  }
  return event.venue ?? labelFor(DELIVERY_MODE_LABELS, "in_person");
}
