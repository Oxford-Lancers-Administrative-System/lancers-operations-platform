import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { CalendarEvent } from "@/lib/services/calendar";
import { labelFor } from "@/lib/services/event-vocabulary";
import { formatCellDate, templateColour } from "./presentation";

/**
 * One event, inside a calendar cell. LAN-114. Colour is the template (its own
 * colour, not behavioural class, since LAN-276 r1); words are status, and
 * which words is the caller's decision since LAN-153, via `./tile-status.ts`.
 * A did-not/will-not-happen event gets struck through. The accessible name
 * always carries everything, including what the tile stays quiet about. The
 * destination arrives as `href` — each tier passes the same one its list rows
 * use, making `REQ-three-arrangements` true by construction.
 */

/** The statuses a tile stays quiet about. One, since LAN-151 — `occurred` is derived from the date rather than stored (D30). */
const QUIET_STATUSES: readonly string[] = Object.freeze(["approved"]);

export function isQuietStatus(status: string): boolean {
  return QUIET_STATUSES.includes(status);
}

/** The statuses that mean the event did not, or will not, take place. D57: stays on the calendar marked cancelled, never removed. */
const STRUCK_STATUSES: readonly string[] = Object.freeze(["cancelled"]);

export function isStruckStatus(status: string): boolean {
  return STRUCK_STATUSES.includes(status);
}

export default function CalendarEntry({
  event,
  href,
  statusWord = null,
  announcedStatus,
  struck = false,
  showDate = false,
}: {
  event: CalendarEvent;
  /** Where the tile goes. Caller-supplied: the two tiers have two event pages, and a tile that chose for itself could send a public reader to a route they cannot open. */
  href: string;
  /** The word to print, or `null`. A prop, not a lookup — status is a tiered fact (`REQ-three-tiers`); `./tile-status.ts` decides per tier. */
  statusWord?: string | null;
  /** The word the accessible name carries, including the quiet one. Defaults to `statusWord`. */
  announcedStatus?: string | null;
  /** True for an event that did not, or will not, take place. */
  struck?: boolean;
  /** True in the lists beside a grid, where the cell no longer supplies the date. */
  showDate?: boolean;
}) {
  const printed = statusWord ?? "";
  const announced = (announcedStatus === undefined ? statusWord : announcedStatus) ?? "";
  const type = event.templateName;
  const when = event.scheduledOn ? formatCellDate(event.scheduledOn) : "No date yet";
  const time = event.startsAt ?? "";
  const colour = templateColour(event.templateColour);

  // The accessible name states the status whether or not the tile shows it.
  const description = [event.name, when, time, announced, type, event.venue ?? ""]
    .filter((piece) => piece !== "")
    .join(", ");

  // Type is always here, so the colour is never the only thing carrying it.
  const secondLine = [printed, showDate && event.scheduledOn ? when : "", type, event.venue ?? ""]
    .filter((piece) => piece !== "")
    .join(" · ");

  return (
    <Box
      component="a"
      href={href}
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
