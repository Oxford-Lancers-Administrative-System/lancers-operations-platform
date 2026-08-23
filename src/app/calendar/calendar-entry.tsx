import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { CalendarEvent } from "@/lib/services/calendar";
import { labelFor, TYPE_LABELS } from "@/lib/services/event-vocabulary";
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
 * **Status has the words, when it has anything** — and *which* words is the
 * caller's decision since LAN-153, because a status is a tiered fact. The two
 * predicates below are still here, and `./tile-status.ts` is where each tier
 * turns them into the word this component prints.
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
 * The destination arrives as `href`, and each tier passes the same one its list
 * rows use — `/operate/events/<id>` or `/calendar/<id>`. That is what makes
 * `REQ-three-arrangements`'s "every tile and row leads to the same event page"
 * true by construction rather than by three routes that happen to agree.
 */

/**
 * The statuses a tile stays quiet about: the event is proceeding normally, and
 * the date already says whether that is ahead of us or behind us.
 *
 * One, since LAN-151 — and the date saying it is now the whole mechanism,
 * because `occurred` is derived from exactly that rather than stored (D30).
 */
const QUIET_STATUSES: readonly string[] = Object.freeze(["approved"]);

export function isQuietStatus(status: string): boolean {
  return QUIET_STATUSES.includes(status);
}

/**
 * The statuses that mean the event did not, or will not, take place.
 *
 * One, and terminal. D57: a cancelled event stays on the calendar marked
 * cancelled and is never removed — an event that silently disappears reads as a
 * sync failure.
 */
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
  /**
   * Where the tile goes. Supplied by the caller because the two tiers have two
   * event pages — `/operate/events/<id>` and `/calendar/<id>` — and a tile that
   * chose for itself would send a public reader to a route they cannot open.
   */
  href: string;
  /**
   * The word to print, or `null` to say nothing.
   *
   * A prop rather than a lookup on the event, because a status is a tiered fact
   * (`REQ-three-tiers`) and this component serves both tiers. `./tile-status.ts`
   * is where each tier decides: the operator tier prints everything but
   * "Approved", and the public tier prints "Cancelled" and nothing else, because
   * a public reader learns that an event is off (D57) and not that it is a draft.
   */
  statusWord?: string | null;
  /**
   * The word the accessible name carries, including the quiet one. Defaults to
   * `statusWord`, so a caller that has only one word does not have to say it
   * twice.
   */
  announcedStatus?: string | null;
  /** True for an event that did not, or will not, take place. */
  struck?: boolean;
  /** True in the lists beside a grid, where the cell no longer supplies the date. */
  showDate?: boolean;
}) {
  const printed = statusWord ?? "";
  const announced = (announcedStatus === undefined ? statusWord : announcedStatus) ?? "";
  const type = labelFor(TYPE_LABELS, event.eventType);
  const when = event.scheduledOn ? formatCellDate(event.scheduledOn) : "No date yet";
  const time = event.startsAt ?? "";
  const colour = typeColour(event.eventType);

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
