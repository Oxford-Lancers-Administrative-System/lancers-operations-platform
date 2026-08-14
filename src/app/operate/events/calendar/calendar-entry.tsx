import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { CalendarEvent } from "@/lib/services/calendar";
import { labelFor, STATUS_LABELS, TYPE_LABELS } from "../presentation";
import { formatCellDate } from "./presentation";

/**
 * One event, inside a calendar cell. LAN-114.
 *
 * ## Status is shown when it tells you something
 *
 * Every tile used to print its status. Brian's review on 14 August 2026: "if an
 * event is in draft, I think it's important. If it happened in the past, that's
 * fine, we don't need to see that." He was right — a term card of sixty
 * occurred practices repeats the word "Occurred" sixty times and says nothing.
 *
 * So the two statuses that mean *this is proceeding normally* — `approved` for
 * something ahead, `occurred` for something behind — are silent on the tile.
 * Everything else is a state somebody may need to act on, and says so:
 * draft, pending approval, cancelled, not held, rejected, withdrawn.
 *
 * The two quiet statuses also share one neutral accent, deliberately. Colour
 * may never be the only carrier (the issue is explicit), so a status with no
 * word must not have a colour of its own either — otherwise the grid would be
 * distinguishing approved from occurred by hue alone. The statuses that keep a
 * distinct accent are exactly the ones that keep a word.
 *
 * The **accessible name always carries the full status**, including the quiet
 * ones. Hiding a word from the eye to reduce noise is a presentation choice;
 * hiding it from a screen reader would be a loss of information.
 *
 * ## A link, to the one detail record
 *
 * `/operate/events/<id>` — the same destination the list row and the term card
 * use, so the issue's "same identity, actual date/time, status, and detail
 * destination in all three presentations" is true by construction rather than
 * by three routes that happen to agree.
 */
const STATUS_ACCENTS: Readonly<Record<string, string>> = Object.freeze({
  draft: "info.main",
  pending_approval: "warning.main",
  not_held: "text.disabled",
  cancelled: "error.main",
  rejected: "error.dark",
  withdrawn: "text.disabled",
});

/** The accent for a status with no label — one neutral tone, carrying nothing. */
const QUIET_ACCENT = "divider";

/**
 * The statuses a tile stays quiet about: the event is proceeding normally, and
 * the date already says whether that is ahead of us or behind us.
 */
const QUIET_STATUSES: readonly string[] = Object.freeze(["approved", "occurred"]);

export function isQuietStatus(status: string): boolean {
  return QUIET_STATUSES.includes(status);
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
  const quiet = isQuietStatus(event.status);

  // The accessible name states the status whether or not the tile shows it.
  const description = [event.name, when, time, status, type, event.venue ?? ""]
    .filter((piece) => piece !== "")
    .join(", ");

  const secondLine = [
    quiet ? "" : status,
    showDate && event.scheduledOn ? when : "",
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
      sx={{
        display: "block",
        textDecoration: "none",
        color: "text.primary",
        borderLeft: 3,
        borderLeftColor: quiet ? QUIET_ACCENT : (STATUS_ACCENTS[event.status] ?? "text.disabled"),
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
