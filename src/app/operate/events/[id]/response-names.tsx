import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import { Section } from "@/components/section";
import type { ParticipationPerson } from "@/lib/services/participation-view";
import { responseNamesByAnswer } from "@/lib/services/response-names";

/**
 * LAN-458: every invitee's name under their answer, on the operator event page
 * only — the Event info link page renders the response blocks but not this.
 * Every name is shown.
 *
 * Brian's visual review (5 October 2026): the lists sit in one collapsible
 * section headed "Attendance", open on arrival — the same plain disclosure
 * the event page and the player record already use. Yes and No sit side by
 * side from `sm` up (stacked, Yes first, on a phone); No response runs full
 * width below them, its names in the same two columns. The response blocks
 * with the counts stay above and outside the section, so they still show
 * when it is closed.
 */
export function ResponseNames({ people }: { people: readonly ParticipationPerson[] }) {
  const groups = responseNamesByAnswer(people);
  if (groups.every((group) => group.names.length === 0)) return null;

  return (
    <Section title="Attendance" testId="response-names" collapsible defaultOpen>
      <Box
        data-testid="response-names"
        sx={{
          display: "grid",
          columnGap: 3,
          rowGap: 2,
          gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))" },
        }}
      >
        {groups.map((group) => {
          const fullWidth = group.group === "none";
          return (
            <Box
              key={group.group}
              sx={{ minWidth: 0, gridColumn: fullWidth ? "1 / -1" : undefined }}
              data-testid={`response-names-${group.group}`}
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
                  ...(fullWidth ? { columnCount: { xs: 1, sm: 2 }, columnGap: 3 } : {}),
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
    </Section>
  );
}
