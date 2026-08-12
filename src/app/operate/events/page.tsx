import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
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
import { isServiceError } from "@/lib/db";
import {
  DRAFTABLE_EVENT_TYPES,
  listCurrentSeasonEvents,
  type EventList,
  type EventListEntry,
} from "@/lib/services/events";
import { gateShellPage } from "../gate";
import EventFilters from "./event-filters";
import {
  describeAttendance,
  describeAudience,
  describeOccurrence,
  describeResponses,
  describeSolicitation,
  formatListWhen,
  labelFor,
  STATUS_LABELS,
  TYPE_LABELS,
} from "./presentation";

/**
 * UX-30 — the current season's events.
 *
 * ## Season-scoped, and what that changes
 *
 * LAN-76 scopes this list to "the current season's events". The wireframe's
 * subtitle names a term (`Michaelmas 2026`); the live issue names the season,
 * and live Linear outranks the SVG (`slice-ux.md` § 1), so the line under the
 * heading names the season the club is operating. Which season that is comes
 * from `readCurrentSeason()`, and a club with none gets a refusal rather than
 * last year's events.
 *
 * ## Two empty states, not one
 *
 * The shared state contract requires filter-empty and system-empty to be
 * distinguished, because the recovery differs: clear the filter, or create the
 * first event. `totalInSeason` is what tells them apart, and it is counted in
 * the same transaction as the list so the two cannot disagree.
 */

/** The statuses an operator can filter by — the whole vocabulary, in order. */
const FILTERABLE_STATUSES: readonly string[] = Object.freeze([
  "draft",
  "pending_approval",
  "approved",
  "occurred",
  "not_held",
  "cancelled",
  "rejected",
  "withdrawn",
]);

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/** Colour is never the only carrier — every chip states its status in words. */
function statusColour(status: string): "default" | "info" | "success" | "warning" {
  switch (status) {
    case "approved":
    case "occurred":
      return "success";
    case "pending_approval":
      return "warning";
    case "draft":
      return "info";
    default:
      return "default";
  }
}

export default async function EventsPage({ searchParams }: PageProps<"/operate/events">) {
  const gate = await gateShellPage("/operate/events");
  if ("screen" in gate) return gate.screen;

  const params = await searchParams;
  const search = first(params.q);
  const status = first(params.status);
  const eventType = first(params.type);
  const filtered = search !== "" || status !== "" || eventType !== "";

  let list: EventList;
  try {
    list = await listCurrentSeasonEvents({ search, status, eventType });
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return (
      <Stack spacing={2} sx={{ maxWidth: 720 }}>
        <Typography variant="h6" component="h1">
          Events
        </Typography>
        <Alert severity="warning" data-testid="events-unavailable">
          {error.message}
        </Alert>
      </Stack>
    );
  }

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ alignItems: { sm: "flex-start" }, justifyContent: "space-between" }}
      >
        <Box>
          <Typography variant="h6" component="h1">
            Events
          </Typography>
          <Typography variant="body2" color="text.secondary" data-testid="season-label">
            {`Season ${list.season.label}`}
          </Typography>
        </Box>
        <Button variant="contained" href="/operate/events/new">
          Create event
        </Button>
      </Stack>

      <EventFilters
        statuses={FILTERABLE_STATUSES}
        types={DRAFTABLE_EVENT_TYPES}
        search={search}
        status={status}
        eventType={eventType}
      />

      {list.events.length === 0 ? (
        <Alert severity="info" data-testid={filtered ? "events-filter-empty" : "events-empty"}>
          {filtered
            ? "No event in this season matches those filters. Clear them to see the season’s events."
            : "This season has no events yet. Create the first one."}
        </Alert>
      ) : (
        <>
          {/* Desktop: the scannable command view. */}
          <TableContainer
            component={Paper}
            variant="outlined"
            sx={{ display: { xs: "none", md: "block" } }}
          >
            <Table size="small" aria-label="Events">
              <TableHead>
                <TableRow>
                  <TableCell>Event</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell>Venue</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Response</TableCell>
                  <TableCell>Audience</TableCell>
                  <TableCell>Responses</TableCell>
                  <TableCell>Occurrence</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {list.events.map((event) => (
                  <TableRow key={event.id} hover data-testid="event-row">
                    <TableCell>
                      <Button
                        href={`/operate/events/${event.id}`}
                        sx={{ textAlign: "left", justifyContent: "flex-start", p: 0 }}
                      >
                        {event.name}
                      </Button>
                      <Typography variant="caption" component="p" color="text.secondary">
                        {labelFor(TYPE_LABELS, event.eventType)}
                      </Typography>
                    </TableCell>
                    <TableCell>{formatListWhen(event)}</TableCell>
                    <TableCell>{event.venue ?? "—"}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={labelFor(STATUS_LABELS, event.status)}
                        color={statusColour(event.status)}
                      />
                    </TableCell>
                    <TableCell>{describeSolicitation(event.solicitsResponse)}</TableCell>
                    <TableCell>{describeAudience(event)}</TableCell>
                    <TableCell>{describeResponses(event)}</TableCell>
                    <TableCell>{describeOccurrence(event)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Phone: the same events as cards, with nothing left out. */}
          <Stack spacing={2} sx={{ display: { xs: "flex", md: "none" } }}>
            {list.events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </Stack>
        </>
      )}
    </Stack>
  );
}

/**
 * The phone presentation of one event.
 *
 * The wireframe's card carries name, date and venue. Status, response
 * solicitation and attendance are carried too, because LAN-76 scopes the list
 * to "date, type, status and whether a response is solicited" — dropping a
 * status on a narrow screen would leave an operator unable to tell a draft from
 * an approved event, and § 7 forbids reflow that removes data needed for the
 * task.
 */
function EventCard({ event }: { event: EventListEntry }) {
  return (
    <Card variant="outlined" data-testid="event-card">
      <CardActionArea href={`/operate/events/${event.id}`} sx={{ p: 2 }}>
        <Stack spacing={1}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {event.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {formatListWhen(event)}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
            <Chip
              size="small"
              label={labelFor(STATUS_LABELS, event.status)}
              color={statusColour(event.status)}
            />
            <Chip size="small" label={labelFor(TYPE_LABELS, event.eventType)} />
            {event.venue ? <Chip size="small" label={event.venue} /> : null}
            <Chip size="small" label={describeSolicitation(event.solicitsResponse)} />
            <Chip size="small" label={describeAttendance(event.isMandatory)} />
          </Stack>
        </Stack>
      </CardActionArea>
    </Card>
  );
}
