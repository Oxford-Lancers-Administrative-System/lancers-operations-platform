import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import type { DisplayCapacity } from "@/lib/services/event-response-progress";
import type { ParticipationPerson } from "@/lib/services/participation-view";
import { responseNamesByCapacity, type ResponseNameSection } from "@/lib/services/response-names";

/**
 * LAN-458: every invitee's name under their answer, on the operator event page
 * only — the Event info link page renders the response blocks but not this.
 * Every name is shown.
 *
 * LAN-481 (Brian, 6 and 7 October 2026): split by the capacity the blocks
 * show — Recruits, Players, Coaches — and, after his walk of d3ecfb64, held by
 * the block itself rather than a separate "Attendance" card: each block is a
 * dropdown, closed on arrival, that opens in place onto these names. This
 * builds one panel per capacity; `ResponseProgress` hangs each on its block.
 * Yes and No sit side by side at every width, a phone included; No response
 * runs full width below them, its names in the same two columns.
 */
export function responseNamePanels(
  people: readonly ParticipationPerson[],
): Partial<Record<DisplayCapacity, ReactNode>> {
  return Object.fromEntries(
    responseNamesByCapacity(people).map((section) => [
      section.capacity,
      <CapacityNames key={section.capacity} section={section} />,
    ]),
  );
}

function CapacityNames({ section }: { section: ResponseNameSection }) {
  return (
    <Box
      data-testid={`response-names-${section.capacity}-grid`}
      sx={{
        display: "grid",
        columnGap: { xs: 2, sm: 3 },
        rowGap: 1.5,
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      }}
    >
      {section.groups.map((group) => {
        const fullWidth = group.group === "none";
        return (
          <Box
            key={group.group}
            sx={{ minWidth: 0, gridColumn: fullWidth ? "1 / -1" : undefined }}
            data-testid={`response-names-${section.capacity}-${group.group}`}
            data-count={group.names.length}
          >
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {`${group.label} · ${group.names.length}`}
            </Typography>
            <Box
              component="ul"
              sx={{
                m: 0,
                mt: 0.5,
                p: 0,
                listStyle: "none",
                ...(fullWidth ? { columnCount: 2, columnGap: { xs: 2, sm: 3 } } : {}),
              }}
            >
              {group.names.map((name, at) => (
                <Typography
                  key={`${name}:${at}`}
                  component="li"
                  variant="body2"
                  sx={{ overflowWrap: "anywhere", breakInside: "avoid" }}
                >
                  {name}
                </Typography>
              ))}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
