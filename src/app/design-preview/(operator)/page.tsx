import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { Fact, FactList } from "@/components/fact";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { TableFrame } from "@/components/sortable-header";
import { gateShellPage } from "@/app/operate/gate";

/**
 * `/design-preview` — the index of LAN-225's mockup screens.
 *
 * Scaffolding, never product: this route lists the screens the audit brief
 * chose, the six decisions taken on the brief's recommendations, and what the
 * preview does not do. Explanatory material lives here and on the review page,
 * never inside a preview screen's own frame (`docs/ux/mockup-standards.md`).
 */
const SCREENS = [
  {
    id: "S1",
    href: "/design-preview/roster",
    title: "Roster board",
    note: "Tokens only — the real board, recoloured.",
  },
  {
    id: "S2",
    href: "/design-preview/player",
    title: "Player record",
    note: "Banded sections, facts, metrics, status chips.",
  },
  {
    id: "S3",
    href: "/design-preview/event",
    title: "Event record (approved)",
    note: "Metrics, notices, participation table, action bar.",
  },
  {
    id: "S4",
    href: "/design-preview/event-new",
    title: "Create event",
    note: "Fields, pickers, choices, action bar.",
  },
  {
    id: "S5",
    href: "/design-preview/rsvp",
    title: "RSVP invitation",
    note: "Public shell; the unusable-link sibling is at /design-preview/rsvp-unusable.",
  },
  {
    id: "S6",
    href: "/design-preview/report",
    title: "Monday report",
    note: "Print-like density, metrics, tables at 1200.",
  },
  {
    id: "S7",
    href: "/design-preview/login",
    title: "Login",
    note: "Public shell, crest, sentence-case buttons.",
  },
  {
    id: "S8",
    href: "/design-preview/operators",
    title: "Operators",
    note: "Page header with help, grouped tables; detail at /design-preview/operator.",
  },
  {
    id: "K",
    href: "/design-preview/kit",
    title: "The kit",
    note: "Every component once, as a story.",
  },
] as const;

const DECISIONS = [
  ["Typeface", "Keep Geist (brief §4.1)."],
  ["Light or dark", "Light only; CSS variables stay on so dark can follow (§4.2)."],
  ["Density", "Compact tables, comfortable forms, 44px touch targets (§4.3)."],
  [
    "Crest in the shell",
    "Yes — a labelled placeholder until the Figma export lands in public/brand/ (§4.4).",
  ],
  ["Buttons", "Sentence case (§4.5)."],
  [
    "The root page",
    "B8 taken (Brian, 4 Sep 2026): / redirects to /login; the bootstrap scaffold is gone.",
  ],
  [
    "Product findings taken",
    "H1 login alert cut; A6 one short-month form; E9 pickers over native dates; B2 and B3 in the shell (§4.6, register).",
  ],
] as const;

export default async function DesignPreviewIndex() {
  const gate = await gateShellPage("/design-preview");
  if ("screen" in gate) return gate.screen;

  return (
    <Stack spacing={3}>
      <PageHeader
        title="Design preview"
        subtitle="LAN-225 · the real application on the club's tokens · seed data only"
        actions={
          <Button variant="contained" href="/design-preview/roster">
            Start at the roster
          </Button>
        }
      />

      <Notice severity="info" testId="preview-scope">
        Scaffolding. Nothing here ships: the implementation mission takes the theme and the kit from
        this branch. Reads are real and go through the same gates as the pages they mirror; writes
        are drawn, not wired, except on the roster board, which is the real component.
      </Notice>

      <Section title="Screens" description="The eight the brief chose, plus the shell around them.">
        <TableFrame>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Id</TableCell>
                <TableCell>Screen</TableCell>
                <TableCell>What it proves</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {SCREENS.map((screen) => (
                <TableRow key={screen.id} hover>
                  <TableCell>{screen.id}</TableCell>
                  <TableCell>
                    <Button href={screen.href} size="small" sx={{ px: 0.5, mx: -0.5 }}>
                      {screen.title}
                    </Button>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {screen.note}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      </Section>

      <Section title="Decisions taken" description="Each is Brian's to overturn at visual review.">
        <FactList>
          {DECISIONS.map(([label, value]) => (
            <Fact key={label} label={label} value={value} layout="inline" />
          ))}
        </FactList>
      </Section>
    </Stack>
  );
}
