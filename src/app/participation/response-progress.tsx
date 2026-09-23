import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

import {
  responseProgressByCapacity,
  type ResponseBand,
  type ResponseProgressRow,
} from "@/lib/services/event-response-progress";

import {
  HEADLINE_INVITED_LABEL,
  HEADLINE_SAID_NO_LABEL,
  HEADLINE_SAID_YES_LABEL,
} from "./presentation";

/**
 * The top of the event page and of the Event info link page — LAN-420.
 *
 * One block per capacity present in the audience, in Stewart's order. The
 * counting is `event-response-progress.ts`; this is only how it reads. Labels,
 * values and states — no sentence explains the bar, and the two numbers say
 * what they are.
 *
 * Both surfaces render this same component, so the operator and whoever the
 * link was sent to are looking at the same block (docs/ux/standards.md rule 7).
 */

/** Stewart's red / orange / green, as the app's own status colours. */
const BAND_COLOUR: Readonly<Record<ResponseBand, "error" | "warning" | "success">> = Object.freeze({
  low: "error",
  middling: "warning",
  high: "success",
});

export function ResponseProgress({ people }: { people: readonly ResponseProgressRow[] }) {
  const blocks = responseProgressByCapacity(people);
  if (blocks.length === 0) return null;

  return (
    <Box
      data-testid="response-progress"
      sx={{
        display: "grid",
        gap: 2,
        gridTemplateColumns: {
          xs: "minmax(0, 1fr)",
          sm: "repeat(2, minmax(0, 1fr))",
          md: `repeat(${blocks.length}, minmax(0, 1fr))`,
        },
      }}
    >
      {blocks.map((block) => (
        <Paper
          key={block.capacity}
          variant="outlined"
          sx={{ p: 2, minWidth: 0 }}
          data-testid={`response-progress-${block.capacity}`}
        >
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {block.label}
          </Typography>

          <Typography variant="h2" component="p" sx={{ mt: 0.5 }} data-testid="response-yes">
            {`${block.yes} / ${block.invited}`}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {`${HEADLINE_SAID_YES_LABEL} / ${HEADLINE_INVITED_LABEL}`}
          </Typography>

          {/*
            LAN-420 visual review, Brian 2026-09-22: "'No 6' is meaningless as
            a line. Make it a labelled metric like the one above it: value 6,
            label Said no." So it takes the Said yes / Invited pair's exact
            shape — the number first, at the same weight, its label under it —
            and the two numbers now read as two metrics instead of one metric
            and an aside.
          */}
          <Box sx={{ mt: 1 }} data-testid="response-no">
            <Typography variant="h2" component="p">
              {block.no}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {HEADLINE_SAID_NO_LABEL}
            </Typography>
          </Box>

          <LinearProgress
            variant="determinate"
            value={block.percent}
            color={BAND_COLOUR[block.band]}
            aria-label={`${block.label} responded`}
            data-testid="response-bar"
            data-band={block.band}
            data-percent={block.percent}
            sx={{ mt: 1.5, height: 8, borderRadius: 1 }}
          />
        </Paper>
      ))}
    </Box>
  );
}
