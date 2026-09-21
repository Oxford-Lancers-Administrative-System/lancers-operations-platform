import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { Section } from "@/components/section";
import { BAND_HEADINGS } from "./content";
import type { GuideRun, PlaybookPage } from "./types";

/**
 * One workflow page — LAN-399.
 *
 * Four bands, in one order, on all eight pages: the drawing, the steps, the
 * rules, where to look. A reader who has found the answer once on Recruitment
 * knows where it is on Events.
 *
 * The drawing is an `<img>` pointing at a committed file. That is Brian's
 * decision of 21 September 2026 and it has two consequences worth stating:
 * nothing in the drawing executes, so the Content Security Policy is untouched;
 * and the drawing has a fixed intrinsic width, so at 375px the reader scrolls
 * it sideways inside its own box rather than reading it at a sixth of its size.
 * The words beneath it are not a caption — they are the whole diagram, for a
 * reader using a screen reader and for one who would simply rather read.
 */
export function PlaybookView({
  page,
  capabilities,
}: {
  page: PlaybookPage;
  /** The generated seat table, on the one page that carries it. */
  capabilities?: React.ReactNode;
}) {
  return (
    <Stack spacing={3}>
      {page.notYetMerged ? (
        <Section title={BAND_HEADINGS.notYetMerged} testId="playbook-not-yet-merged">
          <Typography variant="body2">
            <Runs runs={page.notYetMerged} />
          </Typography>
        </Section>
      ) : null}

      <Section title={BAND_HEADINGS.flowchart} testId="playbook-flowchart">
        <Box
          sx={{
            overflowX: "auto",
            // The drawing's own ground, so the strip left by a narrow viewport
            // is part of the picture rather than a seam beside it.
            bgcolor: "background.default",
            borderRadius: 1,
            p: 1,
          }}
        >
          <Box
            component="img"
            src={page.flowchart.src}
            alt={page.flowchart.alt}
            data-testid="playbook-flowchart-image"
            sx={{ display: "block", maxWidth: "none", height: "auto" }}
          />
        </Box>

        <Typography variant="subtitle2" component="h4" sx={{ mt: 2, mb: 1 }}>
          {BAND_HEADINGS.description}
        </Typography>
        <Typography
          component="ol"
          variant="body2"
          sx={{ pl: 3, listStyleType: "decimal", "& li": { mb: 0.75, listStyleType: "inherit" } }}
        >
          {page.flowchart.description.map((line, index) => (
            <li key={index}>
              <Runs runs={line} />
            </li>
          ))}
        </Typography>
      </Section>

      <Section title={BAND_HEADINGS.steps} testId="playbook-steps">
        <Typography
          component="ol"
          variant="body2"
          sx={{ pl: 3, listStyleType: "decimal", "& li": { mb: 1.5, listStyleType: "inherit" } }}
        >
          {page.steps.map((step, index) => (
            <li key={index}>
              <Runs runs={step.operator} />
              {step.then ? (
                <Typography
                  variant="body2"
                  component="p"
                  color="text.secondary"
                  sx={{ mt: 0.5 }}
                  data-testid="playbook-then"
                >
                  <Runs runs={step.then} />
                </Typography>
              ) : null}
            </li>
          ))}
        </Typography>
      </Section>

      <Section title={BAND_HEADINGS.rules} testId="playbook-rules">
        <Stack component="dl" spacing={1.25} sx={{ m: 0 }}>
          {page.rules.map((rule) => (
            <Box key={rule.label}>
              <Typography component="dt" variant="subtitle2">
                {rule.label}
              </Typography>
              <Typography component="dd" variant="body2" color="text.secondary" sx={{ m: 0 }}>
                <Runs runs={rule.fact} />
              </Typography>
            </Box>
          ))}
        </Stack>
      </Section>

      {capabilities ? (
        <Section title={BAND_HEADINGS.capabilities} testId="playbook-capabilities">
          {capabilities}
        </Section>
      ) : null}

      <Section title={BAND_HEADINGS.whereToLook} testId="playbook-where-to-look">
        <Stack component="dl" spacing={1.25} sx={{ m: 0 }}>
          {page.whereToLook.map((lookup) => (
            <Box key={lookup.href}>
              <Typography component="dt" variant="subtitle2">
                <Link href={lookup.href}>{lookup.label}</Link>
              </Typography>
              <Typography component="dd" variant="body2" color="text.secondary" sx={{ m: 0 }}>
                <Runs runs={lookup.shows} />
              </Typography>
            </Box>
          ))}
        </Stack>
      </Section>
    </Stack>
  );
}

/**
 * Plain text, with every quoted claim in bold.
 *
 * All three kinds render identically and deliberately so: the reader needs to
 * know "this is a thing you will see on the screen", not which of three
 * categories the writer filed it under. The distinction is for the test.
 */
function Runs({ runs }: { runs: readonly GuideRun[] }) {
  return (
    <>
      {runs.map((run, index) =>
        typeof run === "string" ? (
          <span key={index}>{run}</span>
        ) : (
          <Box component="strong" key={index} sx={{ fontWeight: 700 }}>
            {"screen" in run ? run.screen : "control" in run ? run.control : run.state}
          </Box>
        ),
      )}
    </>
  );
}
