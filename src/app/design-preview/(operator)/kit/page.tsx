import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { ActionBar } from "@/components/action-bar";
import { BrandMark } from "@/components/brand-mark";
import { CandidateRow } from "@/components/candidate-row";
import { EmptyState } from "@/components/empty-state";
import { Fact, FactGrid, FactList } from "@/components/fact";
import { Metric, MetricRow } from "@/components/metric";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { Refusal } from "@/components/refusal";
import { RowCard, RowCardList } from "@/components/row-card";
import { StepTrail } from "@/components/step-trail";
import { Section } from "@/components/section";
import { SortableHeader, TableFrame } from "@/components/sortable-header";
import { STATUS_VOCABULARY, StatusChip, type StatusDomain } from "@/components/status-chip";
import { gateShellPage } from "@/app/operate/gate";
import KitDemos from "./kit-demos";

/**
 * `/design-preview/kit` — every kit component once, as a story. LAN-225.
 *
 * The components a chosen screen does not happen to exercise (`EmptyState`,
 * `Refusal`, `CandidateRow`, the `OutcomeSlot`) are shown here so the kit is
 * reviewed whole. The names and scenarios are synthetic.
 */
const DOMAINS: readonly StatusDomain[] = [
  "membership",
  "personType",
  "event",
  "delivery",
  "recruitment",
  "attendance",
  "rsvp",
  "operator",
  "onboardingItem",
  "availability",
];

const WORDS: Readonly<Record<string, string>> = {
  not_recorded: "Not recorded",
  no_response: "No response",
  not_attending: "Not attending",
  whatsapp_unresponsive: "WhatsApp unresponsive",
  no_channel: "Not dispatched — no channel",
  invitation_pending: "Invitation pending",
  email_change_pending: "Email change pending",
  delivery_failed: "Delivery failed",
  not_applicable: "Not applicable",
  never_blocks: "Never blocks activation",
  from_template: "From the template",
};

function word(status: string): string {
  return WORDS[status] ?? status.charAt(0).toUpperCase() + status.slice(1).replaceAll("_", " ");
}

export default async function KitPage() {
  const gate = await gateShellPage("/design-preview/kit");
  if ("screen" in gate) return gate.screen;

  return (
    <Stack spacing={4}>
      <PageHeader
        title="The kit"
        subtitle="Sixteen components, one usage each"
        back={{ href: "/design-preview", label: "Back to the preview" }}
        actions={<Button variant="contained">Primary action</Button>}
      />

      <Section
        title="BrandMark"
        description="The crest and the club's name; `onLight` on paper, `onDark` in the shell."
      >
        <Stack direction="row" spacing={4} sx={{ alignItems: "center", flexWrap: "wrap", gap: 2 }}>
          <BrandMark tone="onLight" size={24} />
          <BrandMark tone="onLight" size={32} caption="Operations" />
          <BrandMark tone="onLight" size={40} caption="Club calendar · Season 2026-27" />
        </Stack>
      </Section>

      <Section
        title="StatusChip"
        description="One status → colour vocabulary. Filled for stored statuses, outlined for derived or secondary facts, always with the word."
      >
        <FactList>
          {DOMAINS.map((domain) => (
            <Fact
              key={domain}
              label={domain}
              layout="inline"
              value={
                <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", gap: 0.75 }}>
                  {Object.keys(STATUS_VOCABULARY[domain]).map((status) => (
                    <StatusChip key={status} domain={domain} status={status} label={word(status)} />
                  ))}
                </Stack>
              }
            />
          ))}
        </FactList>
      </Section>

      <Section
        title="Notice"
        description="Outcomes, refusals and conditions. Never standing guidance."
      >
        <Stack spacing={1.5}>
          <Notice severity="success">The invitation has been sent.</Notice>
          <Notice severity="warning" title="Delivery failed">
            The address bounced. Check it, correct it, and send again.
          </Notice>
          <Notice severity="error">The reason is required to save Not attending.</Notice>
          <Notice severity="info">
            One required item is still outstanding: Subscription paid.
          </Notice>
          <Notice variant="refusal">
            This action affects the President. Only the General Manager may change this seat.
          </Notice>
        </Stack>
      </Section>

      <KitDemos />

      <Section
        title="Fact"
        description="Stacked in cards and summaries; inline in record sections. An absent value says so."
      >
        <Stack spacing={3}>
          <FactGrid columns={3}>
            <Fact label="Type" value="Practice" emphasis />
            <Fact label="Where" value="In person" emphasis />
            <Fact label="Venue" value={null} emphasis />
          </FactGrid>
          <FactList>
            <Fact
              label="College"
              value="St Hilda's"
              layout="inline"
              provenance="Player, 3 Sep 2026"
            />
            <Fact label="Degree field" value={null} layout="inline" />
            <Fact
              label="Status"
              value={<StatusChip domain="membership" status="active" label="Active" />}
              layout="inline"
              note="This season"
            />
          </FactList>
        </Stack>
      </Section>

      <Section
        title="Metric"
        description="A headline number; a status where the headline is a state."
      >
        <MetricRow columns={4}>
          <Metric value="37" label="Invited" />
          <Metric value="24" label="Said yes" />
          <Metric value="— / 37" label="Showed" caption="No register yet" />
          <Metric
            value={<StatusChip domain="membership" status="onboarding" label="Onboarding" />}
            label="Membership"
          />
        </MetricRow>
      </Section>

      <Section
        title="Section"
        description="This card is the plain variant. The banded variant is below."
      >
        <Section
          variant="banded"
          band="season"
          title="Season · 2026-27"
          action={
            <Chip
              size="small"
              label="4 facts"
              sx={{ color: "inherit", borderColor: "currentColor" }}
              variant="outlined"
            />
          }
        >
          <FactList>
            <Fact label="Offence" value="QB" layout="inline" />
            <Fact label="Jersey — Blue" value="7" layout="inline" />
          </FactList>
        </Section>
      </Section>

      <Section
        title="EmptyState"
        description="A failed search names what was searched and links to what resolves it (rule 5)."
      >
        <EmptyState
          title="Nobody matches"
          searched="Hallowfield"
          description="Search matches whole names and whole addresses."
          action={{ href: "/operate/people/new", label: "Add a person" }}
        />
      </Section>

      <Section
        title="Refusal"
        description="A title, one sentence, the requirement, one action — never a second alert (rule 6)."
      >
        <Refusal
          title="You do not have access to this action"
          message="Your operator profile is active, but your current role assignments do not permit this action."
          requirement="This action requires the President, Vice-President, Secretary or General Manager role."
          action={{ href: "/design-preview", label: "Return to an authorized area" }}
        />
      </Section>

      <Section title="CandidateRow" description="A duplicate-person match, in the club's words.">
        <Stack spacing={1.5}>
          <CandidateRow
            name="Caspian Hallowfield"
            facts={["St Hilda's", "Matriculated 2024", "c.hallowfield@example"]}
            matched={["Matched first name", "Matched last name"]}
            chips={<StatusChip domain="membership" status="active" label="Active" />}
            action={{ label: "This is them", href: "/design-preview/kit" }}
          />
          <CandidateRow
            name="Casper Hallow"
            facts={["No college recorded"]}
            matched={["Matched first name"]}
            chips={<StatusChip domain="personType" status="recruit" label="Recruit" />}
            action={{ label: "This is them", href: "/design-preview/kit" }}
          />
        </Stack>
      </Section>

      <Section
        title="RowCard and SortableHeader"
        description="The phone half of every table, and the heading that sorts it."
      >
        <Stack spacing={2}>
          <RowCardList>
            <RowCard
              title="Caspian Hallowfield"
              href="/design-preview/player"
              trailing="Wk 3"
              chips={<StatusChip domain="membership" status="active" label="Active" />}
              sublines={["Blue 7 · Offence QB", "No mobile recorded"]}
            />
          </RowCardList>
          <RowCardList at="all" testId="kit-row-card-actions">
            <RowCard
              title="Practice — michaelmas week 1"
              trailing="24 Sep 2026 · 8:00 PM"
              chips={<StatusChip domain="rsvp" status="none" label="Next" />}
              sublines={["Practice", "Nine people have said yes · Answer by 22 Sep 2026"]}
              actions={
                <>
                  <Button variant="contained" color="success" sx={{ flex: 1, minHeight: 44 }}>
                    Yes
                  </Button>
                  <Button variant="outlined" sx={{ flex: 1, minHeight: 44 }}>
                    No
                  </Button>
                </>
              }
            />
          </RowCardList>
          <TableFrame>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <SortableHeader
                    column="name"
                    label="Name"
                    href="/design-preview/kit"
                    active
                    direction="asc"
                  />
                  <SortableHeader
                    column="status"
                    label="Status"
                    href="/design-preview/kit"
                    active={false}
                    direction="asc"
                  />
                  <TableCell align="right">Invited</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow hover>
                  <TableCell sx={{ fontWeight: 600 }}>Caspian Hallowfield</TableCell>
                  <TableCell>
                    <StatusChip domain="membership" status="active" label="Active" />
                  </TableCell>
                  <TableCell align="right">12</TableCell>
                </TableRow>
                <TableRow hover selected>
                  <TableCell sx={{ fontWeight: 600 }}>Dorian Ashcombe</TableCell>
                  <TableCell>
                    <StatusChip domain="membership" status="onboarding" label="Onboarding" />
                  </TableCell>
                  <TableCell align="right">3</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableFrame>
          <Typography variant="body2" color="text.secondary">
            The card shows below the `md` breakpoint; the table from it. Narrow the window to see
            both.
          </Typography>
        </Stack>
      </Section>

      <Section
        title="ActionBar"
        description="Primary, secondary, cancel. Sticky at the foot of a phone."
      >
        <ActionBar
          primary={
            <Button variant="contained" disabled>
              Save draft
            </Button>
          }
          secondary={<Button variant="outlined">Save and choose audience</Button>}
          cancel={<Button variant="text">Cancel</Button>}
          note="Choose a date to enable saving."
        />
      </Section>

      <Section
        title="StepTrail"
        description="Where the reader is in a sequence — a map, never a set of controls."
      >
        <StepTrail
          steps={[
            { label: "Your details", status: "complete", statusLabel: "Saved" },
            { label: "Code of conduct", status: "outstanding", statusLabel: "Outstanding" },
            { label: "Photo release", status: "complete", statusLabel: "Agreed" },
            { label: "BUCS Play", status: "outstanding", statusLabel: "Outstanding" },
            { label: "Hudl", status: "outstanding", statusLabel: "Outstanding" },
          ]}
          currentIndex={1}
        />
      </Section>

      <Section title="PublicShell" description="The frame every page without a session shares.">
        <Stack direction="row" spacing={1.5} sx={{ flexWrap: "wrap", gap: 1 }}>
          <Button variant="outlined" href="/design-preview/login">
            Login
          </Button>
          <Button variant="outlined" href="/design-preview/rsvp">
            RSVP invitation
          </Button>
          <Button variant="outlined" href="/design-preview/rsvp-unusable">
            Unusable link
          </Button>
        </Stack>
      </Section>
    </Stack>
  );
}
