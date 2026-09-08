import { Section } from "@/components/section";
import Stack from "@mui/material/Stack";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { ADMINISTRATION_GUIDE, type GuideBlock, type GuideEntry, type GuideRun } from "./content";

/**
 * LAN-134’s expandable guide. The kit’s native disclosures keep all answers
 * in server-rendered markup, with the first question open and the rest closed.
 * Questions remain real headings. Approved help content is unchanged: this
 * guide is its designated home, and carries no notices or callouts.
 */
export default function GuideFaq({
  entries = ADMINISTRATION_GUIDE,
}: {
  entries?: readonly GuideEntry[];
}) {
  return (
    <Stack spacing={1.5}>
      {entries.map((entry, index) => (
        <Section
          key={entry.id}
          title={entry.question}
          collapsible
          defaultOpen={index === 0}
          testId={entry.id}
        >
          <Box id={`${entry.id}-answer`}>
            {entry.answer.map((block, blockIndex) => (
              <AnswerBlock key={blockIndex} block={block} />
            ))}
          </Box>
        </Section>
      ))}
    </Stack>
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
