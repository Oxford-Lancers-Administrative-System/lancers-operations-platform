import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { CalendarEvent } from "@/lib/services/calendar";
import { templateColour } from "./presentation";

/**
 * What the colours on the calendar mean. LAN-114.
 *
 * ## Only the kinds actually in view
 *
 * A given month or term rarely shows more than four, and a fixed legend of every
 * template the club has would be mostly noise and would teach an operator to
 * stop reading it. This one is built from the events being displayed, so it is
 * short, and everything in it is on the screen below it.
 *
 * ## One entry per template, coloured by the template's own colour — LAN-276
 *
 * The entries are the club's own templates, by name, because that is what every
 * tile below now says. The **colour** used to be `typeColour(eventType)`, keyed
 * by the behavioural class — which meant two templates that share a class
 * (every operator-created template, since they all get `practice`) showed as
 * two named entries with the same swatch. Correction round 1 moved the colour
 * onto the template itself, chosen on its editor, so that stops being true:
 * an operator's template is free to look different from Practice, and from
 * every other template, because somebody chose that rather than the class
 * choosing it for them.
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
  // Ordered by name rather than by first appearance, so the legend does not
  // reshuffle itself as an operator moves between months. Keyed by name: two
  // events of the same template always carry the same class and colour, so
  // the first occurrence speaks for all of them.
  const kinds = [
    ...new Map(
      events.map(
        (event) =>
          [
            event.templateName,
            { eventType: event.eventType, colourKey: event.templateColour },
          ] as const,
      ),
    ),
  ].sort(([a], [b]) => a.localeCompare(b, "en-GB"));

  if (kinds.length === 0) return null;

  return (
    <Stack
      component="ul"
      direction="row"
      aria-label="What the calendar colours mean"
      data-testid="type-legend"
      sx={{ flexWrap: "wrap", gap: 1.5, listStyle: "none", p: 0, m: 0 }}
    >
      {kinds.map(([name, { eventType, colourKey }]) => {
        const colour = templateColour(colourKey);
        return (
          <Stack
            key={name}
            component="li"
            direction="row"
            spacing={0.75}
            data-testid="type-legend-item"
            data-event-type={eventType}
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
              {name}
            </Typography>
          </Stack>
        );
      })}
    </Stack>
  );
}
