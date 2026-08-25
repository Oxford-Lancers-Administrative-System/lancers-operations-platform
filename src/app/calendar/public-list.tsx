import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import {
  DELIVERY_MODE_LABELS,
  formatShortDate,
  labelFor,
  STATUS_LABELS,
  TYPE_LABELS,
} from "@/lib/services/event-vocabulary";
import type { PublicEventListEntry } from "@/lib/services/events";
import type { PeriodBucket } from "@/lib/services/event-periods";
import { publicEventHref } from "./routes";
import SortableHeader, { type SortLink } from "./sortable-header";

/**
 * The public list — four columns, and nothing about people. LAN-153.
 *
 * ## The columns, and the ones that are missing on purpose
 *
 * Name, type, when (with its Oxford coordinate), and where. `W1`'s tier table:
 * no status column, no invited count, no said-yes count, no attendance, and
 * **never** the joining URL of an online event. None of that is hidden here —
 * `PublicEventListEntry` has no field for any of it, and the query never read
 * one — so this component could not render it if it tried.
 *
 * An online event says **Online** and stops there. Brian, 21 August 2026: "When
 * it says online, you do not need to show no link shown. That's not important."
 *
 * ## Except a cancellation
 *
 * A cancelled event stays on the list, marked cancelled — correction C1 to `W1`,
 * from D57 and from `W2` keeping it in the subscription feed. Hiding it here
 * would make two public surfaces disagree about what is on, and an event that
 * silently vanishes from a calendar somebody subscribed to reads as a sync
 * failure. It is a chip beside the name, not a Status column: the reader learns
 * the event is off, and nothing about drafts.
 *
 * ## Phone
 *
 * One condensed card per event, carrying the same four facts. Brian, 21 August
 * 2026, wanted the events to start within a screen of the top on a phone.
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

          <TableContainer
            component={Paper}
            variant="outlined"
            sx={{ display: { xs: "none", md: "block" } }}
          >
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
                          <Chip
                            size="small"
                            color="warning"
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
                    <TableCell>{labelFor(TYPE_LABELS, event.eventType)}</TableCell>
                    <TableCell>{formatShortDate(event.scheduledOn)}</TableCell>
                    <TableCell>{coordinateOf(event)}</TableCell>
                    <TableCell>{whereItIs(event)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Stack spacing={1.5} sx={{ display: { xs: "flex", md: "none" } }}>
            {bucket.events.map((event) => (
              <Card key={event.id} variant="outlined" data-testid="public-event-card">
                <CardActionArea href={publicEventHref(event.id)} sx={{ p: 2 }}>
                  <Stack spacing={1}>
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{ justifyContent: "space-between", alignItems: "baseline" }}
                    >
                      <Typography
                        variant="subtitle2"
                        sx={{
                          fontWeight: 700,
                          textDecoration: event.isCancelled ? "line-through" : "none",
                        }}
                      >
                        {event.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {event.startsAt ?? ""}
                      </Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      {formatShortDate(event.scheduledOn)}
                    </Typography>
                    <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
                      <Chip size="small" label={labelFor(TYPE_LABELS, event.eventType)} />
                      {event.isCancelled ? (
                        <Chip
                          size="small"
                          color="warning"
                          label={labelFor(STATUS_LABELS, "cancelled")}
                        />
                      ) : null}
                      <Chip size="small" variant="outlined" label={coordinateOf(event)} />
                      <Chip size="small" variant="outlined" label={whereItIs(event)} />
                    </Stack>
                  </Stack>
                </CardActionArea>
              </Card>
            ))}
          </Stack>
        </Stack>
      ))}
    </Stack>
  );
}

/**
 * Where the event is, at the public tier.
 *
 * An in-person event states its address. An online one states that it is online
 * and stops — the destination it is *called* is `venue` (D21) and it is safe to
 * show, but the link to join it is never public (`REQ-no-joining-url`), and this
 * component has no access to one either way.
 */
function whereItIs(event: PublicEventListEntry): string {
  if (event.deliveryMode === "online") {
    return event.venue ?? labelFor(DELIVERY_MODE_LABELS, "online");
  }
  return event.venue ?? labelFor(DELIVERY_MODE_LABELS, "in_person");
}
