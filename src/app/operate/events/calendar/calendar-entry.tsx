import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { CalendarEvent } from "@/lib/services/calendar";
import { labelFor, STATUS_LABELS, TYPE_LABELS } from "../presentation";
import { formatCellDate } from "./presentation";

/**
 * One event, inside a calendar cell. LAN-114.
 *
 * ## Status is words first
 *
 * The issue requires status to be "understandable without relying on color
 * alone", so every entry prints its status label — "Draft", "Pending approval",
 * "Cancelled" — as text on the tile. The tinted left edge is an aid to scanning
 * a dense grid and carries nothing the text does not already say, which is the
 * test: turn the colour off and the tile still reads correctly.
 *
 * ## A link, to the one detail record
 *
 * `/operate/events/<id>` — the same destination the list row and the term card
 * use, so the issue's "same identity, actual date/time, status, and detail
 * destination in all three presentations" is true by construction rather than
 * by three routes that happen to agree.
 *
 * The accessible name repeats the date and the status, because a cell tile is
 * read out of the grid's visual context: "Team Practice, Wed 14 Oct 2026,
 * 20:00, Draft" is navigable, and "Team Practice" alone is not.
 */
const STATUS_ACCENTS: Readonly<Record<string, string>> = Object.freeze({
  draft: "info.main",
  pending_approval: "warning.main",
  approved: "success.main",
  occurred: "success.dark",
  not_held: "text.disabled",
  cancelled: "error.main",
  rejected: "error.dark",
  withdrawn: "text.disabled",
});

export default function CalendarEntry({
  event,
  showDate = false,
}: {
  event: CalendarEvent;
  /** True in the lists beside a card, where the cell no longer supplies the date. */
  showDate?: boolean;
}) {
  const status = labelFor(STATUS_LABELS, event.status);
  const type = labelFor(TYPE_LABELS, event.eventType);
  const when = event.scheduledOn ? formatCellDate(event.scheduledOn) : "No date yet";
  const time = event.startsAt ?? "";

  const description = [event.name, when, time, status, type, event.venue ?? ""]
    .filter((piece) => piece !== "")
    .join(", ");

  return (
    <Box
      component="a"
      href={`/operate/events/${event.id}`}
      aria-label={description}
      data-testid="calendar-entry"
      data-event-id={event.id}
      sx={{
        display: "block",
        textDecoration: "none",
        color: "text.primary",
        borderLeft: 3,
        borderLeftColor: STATUS_ACCENTS[event.status] ?? "text.disabled",
        borderRadius: 0.5,
        bgcolor: "action.hover",
        px: 0.75,
        py: 0.5,
        "&:hover": { bgcolor: "action.selected" },
        "&:focus-visible": { outline: 2, outlineColor: "primary.main", outlineOffset: 2 },
      }}
    >
      <Typography variant="caption" component="span" sx={{ display: "block", fontWeight: 700 }}>
        {time ? `${time} ` : ""}
        {event.name}
      </Typography>
      <Typography
        variant="caption"
        component="span"
        color="text.secondary"
        sx={{ display: "block" }}
      >
        {showDate && event.scheduledOn ? `${when} · ` : ""}
        {status}
        {event.venue ? ` · ${event.venue}` : ""}
      </Typography>
    </Box>
  );
}
