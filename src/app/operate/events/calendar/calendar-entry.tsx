import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { CalendarEvent } from "@/lib/services/calendar";
import { labelFor, STATUS_LABELS, TYPE_LABELS } from "../presentation";
import { formatCellDate, typeColour } from "./presentation";

/**
 * One event, inside a calendar cell. LAN-114.
 *
 * ## Colour is type; words are status
 *
 * Brian's reviews on 14 August 2026 settled both halves, and they fit together
 * because they answer different questions.
 *
 * **Type has the colour.** The club's term cards colour by what the event is,
 * and ours rendered everything grey — "every event is grey versus by type". So
 * the tile is tinted and edged by `event_type`, and nothing else on it is
 * distinguished by hue. The type is also printed in words, so a reader who
 * cannot separate two hues loses nothing.
 *
 * **Status has the words, when it has anything.** "If an event is in draft, I
 * think it's important. If it happened in the past, that's fine, we don't need
 * to see that." A card of sixty occurred practices repeating "Occurred" says
 * nothing. So `approved` and `occurred` — the two states that mean *this is
 * proceeding normally* — are silent, and the rest say so.
 *
 * The states that mean the event **did not or will not happen** get the one
 * non-colour treatment on the tile: the name is struck through. That reads at a
 * glance without competing with the type palette, and it survives being printed
 * in black and white.
 *
 * The **accessible name always carries everything** — date, time, status, type,
 * venue — including the status the tile stays quiet about. Quieting a tile is a
 * presentation choice; hiding it from a screen reader would be a loss.
 *
 * ## A link, to the one detail record
 *
 * `/operate/events/<id>` — the same destination the list row and the term card
 * use, so the issue's "same identity, actual date/time, status, and detail
 * destination in all three presentations" is true by construction rather than
 * by three routes that happen to agree.
 */

/**
 * The statuses a tile stays quiet about: the event is proceeding normally, and
 * the date already says whether that is ahead of us or behind us.
 */
const QUIET_STATUSES: readonly string[] = Object.freeze(["approved", "occurred"]);

export function isQuietStatus(status: string): boolean {
  return QUIET_STATUSES.includes(status);
}

/** The statuses that mean the event did not, or will not, take place. */
const STRUCK_STATUSES: readonly string[] = Object.freeze([
  "cancelled",
  "not_held",
  "withdrawn",
  "rejected",
]);

export function isStruckStatus(status: string): boolean {
  return STRUCK_STATUSES.includes(status);
}

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
  const colour = typeColour(event.eventType);
  const quiet = isQuietStatus(event.status);
  const struck = isStruckStatus(event.status);

  // The accessible name states the status whether or not the tile shows it.
  const description = [event.name, when, time, status, type, event.venue ?? ""]
    .filter((piece) => piece !== "")
    .join(", ");

  // Type is always here, so the colour is never the only thing carrying it.
  const secondLine = [
    quiet ? "" : status,
    showDate && event.scheduledOn ? when : "",
    type,
    event.venue ?? "",
  ]
    .filter((piece) => piece !== "")
    .join(" · ");

  return (
    <Box
      component="a"
      href={`/operate/events/${event.id}`}
      aria-label={description}
      data-testid="calendar-entry"
      data-event-id={event.id}
      data-event-type={event.eventType}
      sx={{
        display: "block",
        textDecoration: "none",
        color: "text.primary",
        borderLeft: 3,
        borderLeftColor: colour.accent,
        borderRadius: 0.5,
        bgcolor: colour.tint,
        px: 0.75,
        py: 0.5,
        "&:hover": { filter: "brightness(0.96)" },
        "&:focus-visible": { outline: 2, outlineColor: "primary.main", outlineOffset: 2 },
      }}
    >
      <Typography
        variant="caption"
        component="span"
        sx={{
          display: "block",
          fontWeight: 700,
          textDecoration: struck ? "line-through" : "none",
        }}
      >
        {time ? `${time} ` : ""}
        {event.name}
      </Typography>
      {secondLine === "" ? null : (
        <Typography
          variant="caption"
          component="span"
          color="text.secondary"
          sx={{ display: "block" }}
        >
          {secondLine}
        </Typography>
      )}
    </Box>
  );
}
