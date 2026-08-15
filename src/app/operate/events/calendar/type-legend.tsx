import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { CalendarEvent } from "@/lib/services/calendar";
import { labelFor, TYPE_LABELS } from "../presentation";
import { typeColour } from "./presentation";

/**
 * What the colours on the calendar mean. LAN-114.
 *
 * ## Only the types actually in view
 *
 * The club has ten event types and a given month or term rarely shows more than
 * four. A fixed legend of all ten would be mostly noise and would teach an
 * operator to stop reading it. This one is built from the events being
 * displayed, so it is short, and everything in it is on the screen below it.
 *
 * ## Why a legend at all, when every tile names its type
 *
 * Because the legend is what makes the colour *scannable* rather than merely
 * decodable. Reading each tile tells you what that one event is; the legend
 * tells you what the colours mean before you start, which is the whole point of
 * colouring a term card. The per-tile label remains the guarantee that nothing
 * depends on distinguishing two hues.
 */
export default function TypeLegend({ events }: { events: readonly CalendarEvent[] }) {
  // Ordered by the club's own vocabulary rather than by first appearance, so
  // the legend does not reshuffle itself as an operator moves between months.
  const present = Object.keys(TYPE_LABELS).filter((type) =>
    events.some((event) => event.eventType === type),
  );

  const unknown = [...new Set(events.map((event) => event.eventType))]
    .filter((type) => !(type in TYPE_LABELS))
    .sort();

  const types = [...present, ...unknown];
  if (types.length === 0) return null;

  return (
    <Stack
      component="ul"
      direction="row"
      aria-label="What the calendar colours mean"
      data-testid="type-legend"
      sx={{ flexWrap: "wrap", gap: 1.5, listStyle: "none", p: 0, m: 0 }}
    >
      {types.map((type) => {
        const colour = typeColour(type);
        return (
          <Stack
            key={type}
            component="li"
            direction="row"
            spacing={0.75}
            data-testid="type-legend-item"
            data-event-type={type}
            sx={{ alignItems: "center" }}
          >
            <Box
              aria-hidden="true"
              sx={{
                width: 14,
                height: 14,
                borderRadius: 0.5,
                bgcolor: colour.tint,
                borderLeft: 3,
                borderLeftColor: colour.accent,
              }}
            />
            <Typography variant="caption" color="text.secondary">
              {labelFor(TYPE_LABELS, type)}
            </Typography>
          </Stack>
        );
      })}
    </Stack>
  );
}
