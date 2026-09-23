import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

import {
  responseProgressByCapacity,
  type ResponseProgressBlock,
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
 * values and states — no sentence explains the bar.
 *
 * Both surfaces render this same component, so the operator and whoever the
 * link was sent to are looking at the same block (docs/ux/standards.md rule 7).
 */

/** The bar's height and corner, shared by the strip and the segments inside it. */
const BAR_HEIGHT = 8;

/**
 * The bar — three segments, LAN-420, Brian's walk of 573bb9d4 (2026-09-23).
 *
 * "The bar is yes in green from the left, no in red from the right, the
 * unanswered remainder as the pale track between them, so one no in ten is a
 * red tenth on the right and the gap is the chase."
 *
 * Every segment is a `LinearProgress`, the idiom this block already used, laid
 * out in one flex strip: the two answered segments are drawn full (`value=100`)
 * in `success` and `error`, and the unanswered remainder is the same component
 * drawn empty, so the gap is literally the pale track MUI already renders under
 * a bar rather than a tone picked by hand here. No colour is invented; the two
 * that are named are the theme's own palette tokens.
 *
 * The widths are the counts themselves, handed to `flexGrow`. Because yes, no
 * and unanswered sum to `invited` by construction, each segment lands
 * proportional to invited without this file dividing anything — and a count of
 * zero grows to nothing and disappears, which is what a block where nobody has
 * said no should look like.
 *
 * The strip clips its children, so only its own outer ends are rounded and the
 * two colours meet square in the middle.
 */
function ResponseBar({ block }: { block: ResponseProgressBlock }) {
  const unanswered = block.invited - block.responded;
  const segment = { height: BAR_HEIGHT, borderRadius: 0, minWidth: 0 } as const;

  return (
    <Box
      sx={{
        mt: 1.5,
        display: "flex",
        height: BAR_HEIGHT,
        borderRadius: 1,
        overflow: "hidden",
      }}
      role="img"
      aria-label={`${block.label}: ${block.yes} ${HEADLINE_SAID_YES_LABEL.toLowerCase()}, ${block.no} ${HEADLINE_SAID_NO_LABEL.toLowerCase()}, of ${block.invited} ${HEADLINE_INVITED_LABEL.toLowerCase()}`}
      data-testid="response-bar"
      data-yes={block.yes}
      data-no={block.no}
      data-unanswered={unanswered}
      data-percent={block.percent}
    >
      {/*
        `data-width` is the same number `flexGrow` is given. `sx` compiles to a
        class rather than an inline style, so the width a segment actually took
        is not readable from the element in a test; this attribute is, and it
        is set from the identical expression rather than from a second count.
      */}
      <LinearProgress
        variant="determinate"
        value={100}
        color="success"
        sx={{ ...segment, flexGrow: block.yes }}
        data-testid="response-bar-yes"
        data-width={block.yes}
      />
      <LinearProgress
        variant="determinate"
        value={0}
        sx={{ ...segment, flexGrow: unanswered }}
        data-testid="response-bar-unanswered"
        data-width={unanswered}
      />
      <LinearProgress
        variant="determinate"
        value={100}
        color="error"
        sx={{ ...segment, flexGrow: block.no }}
        data-testid="response-bar-no"
        data-width={block.no}
      />
    </Box>
  );
}

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

          {/*
            One value line, not two metrics — LAN-420, Brian's walk of
            573bb9d4: value `16 yes · 6 no / 39`, label `Said yes · Said no /
            Invited`. Round 2 stacked Said yes / Invited above Said no as two
            metrics of equal weight, which read as two separate facts about two
            separate populations; they are one sentence about one population,
            and the denominator belongs to both. The word after each number is
            what lets the line be read without its label, and the label under
            it is what names the parts in the club's own words.
          */}
          <Typography variant="h2" component="p" sx={{ mt: 0.5 }} data-testid="response-counts">
            {`${block.yes} yes · ${block.no} no / ${block.invited}`}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {`${HEADLINE_SAID_YES_LABEL} · ${HEADLINE_SAID_NO_LABEL} / ${HEADLINE_INVITED_LABEL}`}
          </Typography>

          <ResponseBar block={block} />
        </Paper>
      ))}
    </Box>
  );
}
