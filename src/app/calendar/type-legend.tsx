import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { CalendarEvent } from "@/lib/services/calendar";
import { templateColour } from "./presentation";

/**
 * What the colours on the calendar mean. LAN-114. Only the kinds actually in
 * view — built from the displayed events, not a fixed list of every template.
 * One entry per template, coloured by the template's own colour (LAN-276 r1),
 * not the behavioural class two templates could share. Makes the colour
 * scannable, not just decodable — the per-tile label is still the guarantee.
 */
export default function TypeLegend({ events }: { events: readonly CalendarEvent[] }) {
  // Ordered by name, not first appearance, so the legend doesn't reshuffle between months.
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
