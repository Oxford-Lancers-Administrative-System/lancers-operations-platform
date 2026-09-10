import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { CalendarEvent } from "@/lib/services/calendar";
import { typeColour } from "./presentation";

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
 * ## One entry per template, coloured by class — LAN-265
 *
 * The entries are the club's own templates, by name, because that is what every
 * tile below now says. The **colour** is still `typeColour(eventType)`, keyed by
 * the behavioural class, and that has a visible consequence worth stating: two
 * templates that share a class — which every operator-created template does,
 * since they all get `practice` — appear as two named entries with the same
 * swatch. That is honest rather than ideal. A per-template palette is a real
 * design question (how many hues, chosen by whom, stable across a rename) and it
 * is not this package's to answer; the per-tile label remains the guarantee that
 * nothing depends on distinguishing two hues.
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
  // reshuffle itself as an operator moves between months.
  const kinds = [
    ...new Map(events.map((event) => [event.templateName, event.eventType] as const)),
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
      {kinds.map(([name, eventType]) => {
        const colour = typeColour(eventType);
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
