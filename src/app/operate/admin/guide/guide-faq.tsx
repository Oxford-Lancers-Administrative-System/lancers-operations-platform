import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { ADMINISTRATION_GUIDE, type GuideBlock, type GuideEntry, type GuideRun } from "./content";

/**
 * The FAQ itself — LAN-134.
 *
 * `REQ-club-operating-guide` asks for "FAQ-style expandable questions", and the
 * prototype draws exactly that: a stack of collapsed questions, the first one
 * open. MUI's Accordion is that component, so it is the one used — `AGENTS.md`
 * makes Material UI the baseline for anything it provides, and an expandable
 * disclosure is something it provides.
 *
 * ## Three things this component is careful about
 *
 * **It is uncontrolled.** Each Accordion keeps its own open state, so there is
 * no client state here to synchronise and no `"use client"` directive on this
 * file: MUI ships the directive on the Accordion itself, and the content below
 * is rendered on the server and handed through as children. A reader with
 * JavaScript disabled still receives every question and every answer in the
 * markup — collapsed, but present, findable by the browser's own page search
 * and readable by a screen reader.
 *
 * **The heading level is real.** Each question is an `h2` inside the summary
 * rather than styled text, so the guide is navigable by heading. That is the
 * difference between a page a screen-reader user can skim and one they must
 * read from the top.
 *
 * **The expand glyph is drawn here.** `@mui/icons-material` is not a dependency
 * of this repository and adding one for a chevron would be a dependency change
 * — the same reasoning `WP-surfaces` records for the question-mark glyph on the
 * page heading. It is `aria-hidden`: the Accordion's own button semantics carry
 * the expanded state, and the drawing adds nothing a reader needs.
 *
 * There are deliberately **no callouts** on this page, in the FAQ or around it.
 * `REQ-club-operating-guide` and the prototype's README both say so in as many
 * words, and the guide existing at all is what replaces the banner somebody
 * would otherwise have put on the Operators screen.
 */
export default function GuideFaq({
  entries = ADMINISTRATION_GUIDE,
}: {
  entries?: readonly GuideEntry[];
}) {
  return (
    <Box>
      {entries.map((entry, index) => (
        <Accordion
          key={entry.id}
          defaultExpanded={index === 0}
          disableGutters
          // The theme's own surface, with a single divider between questions —
          // the prototype's treatment, and quieter than MUI's default shadow
          // stack for a page that is twelve of these in a column.
          elevation={0}
          sx={{
            border: 1,
            borderColor: "divider",
            borderRadius: 1,
            mb: 1,
            "&::before": { display: "none" },
          }}
        >
          <AccordionSummary
            expandIcon={<ExpandGlyph />}
            aria-controls={`${entry.id}-answer`}
            id={`${entry.id}-question`}
            sx={{ minHeight: 56 }}
          >
            <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600 }}>
              {entry.question}
            </Typography>
          </AccordionSummary>
          <AccordionDetails id={`${entry.id}-answer`}>
            {entry.answer.map((block, blockIndex) => (
              <AnswerBlock key={blockIndex} block={block} />
            ))}
          </AccordionDetails>
        </Accordion>
      ))}
    </Box>
  );
}

/**
 * The chevron in the summary. Inline SVG for the reason the module note gives:
 * `@mui/icons-material` is not a dependency here, and `aria-hidden` because the
 * summary is already a button whose `aria-expanded` says what it does.
 */
function ExpandGlyph() {
  return (
    <Box
      component="svg"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      sx={{ width: 20, height: 20, fill: "none", stroke: "currentColor", strokeWidth: 2 }}
    >
      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </Box>
  );
}

function AnswerBlock({ block }: { block: GuideBlock }) {
  if (block.kind === "paragraph") {
    return (
      <Typography variant="body2" sx={{ mb: 1.5, "&:last-child": { mb: 0 } }}>
        <Runs runs={block.runs} />
      </Typography>
    );
  }

  return (
    <Typography
      component={block.kind === "steps" ? "ol" : "ul"}
      variant="body2"
      sx={{
        pl: 3,
        mb: 1.5,
        // Asked for explicitly, because Tailwind's preflight resets every list
        // to `list-style: none`. Found in browser preflight: without this the
        // invite answer's five ordered steps render as five unnumbered
        // sentences, which loses the one thing an ordered list is for.
        listStyleType: block.kind === "steps" ? "decimal" : "disc",
        "&:last-child": { mb: 0 },
        "& li": { mb: 0.75, listStyleType: "inherit" },
      }}
    >
      {block.items.map((item, index) => (
        <li key={index}>
          <Runs runs={item} />
        </li>
      ))}
    </Typography>
  );
}

/** Plain text, with the labels a reader must recognise on screen in bold. */
function Runs({ runs }: { runs: readonly GuideRun[] }) {
  return (
    <>
      {runs.map((run, index) =>
        typeof run === "string" ? (
          <span key={index}>{run}</span>
        ) : (
          <Box component="strong" key={index} sx={{ fontWeight: 700 }}>
            {run.strong}
          </Box>
        ),
      )}
    </>
  );
}
