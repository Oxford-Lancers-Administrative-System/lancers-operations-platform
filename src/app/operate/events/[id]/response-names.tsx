import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

import type { ParticipationPerson } from "@/lib/services/participation-view";
import { responseNamesByAnswer } from "@/lib/services/response-names";

/**
 * LAN-458: the fourth box, under the Recruits / Players / Coaches blocks, on
 * the operator event page only — the Event info link page renders the blocks
 * but not this. Same card, type and spacing as the blocks above it. Every
 * name is shown: the three groups stack on a phone and sit side by side as
 * columns from `md` up, names wrapping inside their column.
 */
export function ResponseNames({ people }: { people: readonly ParticipationPerson[] }) {
  const groups = responseNamesByAnswer(people);
  if (groups.every((group) => group.names.length === 0)) return null;

  return (
    <Paper variant="outlined" sx={{ p: 2, minWidth: 0 }} data-testid="response-names">
      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(3, minmax(0, 1fr))" },
        }}
      >
        {groups.map((group) => (
          <Box
            key={group.group}
            sx={{ minWidth: 0 }}
            data-testid={`response-names-${group.group}`}
            data-count={group.names.length}
          >
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {`${group.label} · ${group.names.length}`}
            </Typography>
            <Box component="ul" sx={{ m: 0, mt: 0.5, p: 0, listStyle: "none" }}>
              {group.names.map((name, at) => (
                <Typography
                  key={`${name}:${at}`}
                  component="li"
                  variant="body2"
                  sx={{ overflowWrap: "anywhere" }}
                >
                  {name}
                </Typography>
              ))}
            </Box>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}
