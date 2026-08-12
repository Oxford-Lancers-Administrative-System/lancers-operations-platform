import { notFound } from "next/navigation";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { findMembershipSummary, type MembershipSummary } from "@/lib/services/roster";
import { gateShellPage } from "../../gate";

/**
 * `/operate/roster/[membershipId]` — UX-13, "Returning player added". LAN-74.
 *
 * ## What this page is, and what it is not yet
 *
 * The approved screen registry puts UX-13 at this route, and LAN-75 puts the
 * full membership detail (UX-21) and its authorized transitions at the same
 * one. This issue builds the confirmation and a truthful summary of what was
 * written; it deliberately does not build activation, onboarding resolution,
 * position or jersey, or any transition control. Those are LAN-75's, and
 * inventing a thinner version of them here would be a screen a later issue has
 * to unpick.
 *
 * ## Why the confirmation is a query parameter rather than a flash message
 *
 * `?created=1` makes the success state a real, linkable, refreshable page
 * rather than a message that vanishes on reload — which matters because the
 * operator's next action is often to show somebody the screen. "View
 * membership" simply drops the parameter, which is what the wireframe's
 * primary action means at a route that is already the membership.
 *
 * Every value shown is read back from the database, not carried over from the
 * submission. A confirmation that echoes what was typed can tell you a write
 * succeeded when it did not.
 */
export default async function MembershipPage({
  params,
  searchParams,
}: PageProps<"/operate/roster/[membershipId]">) {
  const { membershipId } = await params;
  const query = await searchParams;

  const gate = await gateShellPage(`/operate/roster/${membershipId}`);
  if ("screen" in gate) return gate.screen;

  const summary = await findMembershipSummary(membershipId).catch(() => null);
  if (!summary) notFound();

  const justCreated = query.created === "1";
  const name = summary.familyName
    ? `${summary.givenName} ${summary.familyName}`
    : summary.givenName;

  return (
    <Stack spacing={3} sx={{ maxWidth: 880 }}>
      <Box>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          {justCreated ? "Returning player added" : name}
        </Typography>
        {justCreated ? (
          <Typography color="text.secondary" sx={{ mt: 1 }} data-testid="created-summary">
            Person and {summary.seasonLabel} membership were created together.
          </Typography>
        ) : null}
      </Box>

      {justCreated ? (
        <Alert severity="success">
          The confirmation identifies the resulting person and membership. Raw contact values are
          retained as entered.
        </Alert>
      ) : null}

      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
        <Box
          sx={{
            display: "grid",
            gap: 3,
            gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
          }}
        >
          <Section title="Person">
            <Typography sx={{ fontWeight: 600 }}>{name}</Typography>
            {summary.knownAs ? (
              <Typography variant="body2" color="text.secondary">
                Known as {summary.knownAs}
              </Typography>
            ) : null}
          </Section>

          <Section title="Contact">
            {summary.contacts.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No contact detail recorded.
              </Typography>
            ) : (
              summary.contacts.map((contact) => (
                <Typography
                  key={`${contact.kind}-${contact.rawValue}`}
                  variant="body2"
                  sx={{ overflowWrap: "anywhere" }}
                >
                  {contact.rawValue}
                  {contact.isPreferred ? null : (
                    <Typography component="span" variant="caption" color="text.secondary">
                      {" "}
                      (recorded; the existing preferred {contact.kind} was left unchanged)
                    </Typography>
                  )}
                </Typography>
              ))
            )}
          </Section>

          <Section title="Membership">
            <Typography sx={{ fontWeight: 600 }}>
              {summary.seasonLabel} · {titleCase(summary.status)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Entry: {titleCase(summary.entry)}
            </Typography>
          </Section>

          <Section title="Audit">
            <CreatedBy summary={summary} />
          </Section>
        </Box>
      </Paper>

      <Alert severity="info">
        Activation, onboarding and the rest of the membership record are added by LAN-75.
      </Alert>

      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ alignItems: { sm: "center" } }}
      >
        {justCreated ? (
          <Button
            href={`/operate/roster/${summary.membershipId}`}
            variant="contained"
            sx={{ minHeight: 44 }}
          >
            View membership
          </Button>
        ) : null}
        <Button
          href="/operate/roster"
          variant={justCreated ? "outlined" : "contained"}
          sx={{ minHeight: 44 }}
        >
          Back to roster
        </Button>
      </Stack>
    </Stack>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box>
      <Typography variant="overline" color="text.secondary" component="h2">
        {title}
      </Typography>
      <Stack spacing={0.5} sx={{ mt: 0.5 }}>
        {children}
      </Stack>
    </Box>
  );
}

function CreatedBy({ summary }: { summary: MembershipSummary }) {
  if (!summary.createdBy) {
    return (
      <Typography variant="body2" color="text.secondary">
        No recorded transition for this membership.
      </Typography>
    );
  }

  return (
    <>
      <Typography variant="body2">
        Created by {summary.createdBy.name ?? "a named process"}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        <time dateTime={summary.createdBy.occurredAt.toISOString()}>
          {formatWhen(summary.createdBy.occurredAt)}
        </time>
      </Typography>
      {summary.confirmedOn ? (
        <Chip size="small" variant="outlined" label={`Confirmed ${summary.confirmedOn}`} />
      ) : null}
    </>
  );
}

/**
 * A fixed, explicit locale and time zone.
 *
 * Server and browser render this string, and `toLocaleString()` with neither
 * argument uses whatever each of them happens to be configured with — which is
 * a hydration mismatch on any machine that is not set to en-GB/London, and a
 * date that reads as American to a club in Oxford.
 */
function formatWhen(value: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(value);
}

function titleCase(value: string): string {
  const spaced = value.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
