import { notFound } from "next/navigation";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { operatorHasCapability } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import {
  readMembership,
  RESOLVED_ITEM_STATUSES,
  type MembershipRecord,
  type MembershipStatusEvent,
  type OnboardingItem,
} from "@/lib/services/membership";
import { gateShellPage } from "../../gate";
import { MembershipStatusControl, OnboardingItemForm } from "../membership-actions";
import {
  ENTRY_LABELS,
  formatDay,
  formatWhen,
  labelFor,
  MEMBERSHIP_STATUS_LABELS,
  membershipStatusColour,
  ONBOARDING_ITEM_LABELS,
} from "../presentation";

/**
 * `/operate/roster/[membershipId]` — UX-21, the membership record, with UX-13's
 * confirmation still on it. UX-22's override dialog is gone — LAN-186's owner
 * walkthrough replaced it, and every other transition control this record used
 * to carry, with the single free-form status control `MembershipStatusControl`
 * defines once.
 *
 * ## Two screens, one route, and why that is right
 *
 * The approved registry puts UX-13 ("Returning player added") and UX-21 (the
 * record) at this same route. They are not two pages: UX-13 is this record
 * with a confirmation banner. LAN-74 built the first; LAN-75 built the record
 * underneath it, and LAN-186 simplified the transition out of it to a plain
 * select — `Q-12`, verbatim: "We can flip to whatever status we want to go
 * in."
 *
 * `?created=1` keeps the success state a real, linkable, refreshable page
 * rather than a message that vanishes on reload — which matters because the
 * operator's next action is often to show somebody the screen.
 *
 * Every value shown is read back from the database, not carried over from the
 * submission. A confirmation that echoes what was typed can tell you a write
 * succeeded when it did not.
 *
 * ## Who sees the status control
 *
 * Reading a membership is ordinary operator work, so the page gates on nothing
 * beyond a linked, active operator. Changing status is Exec/GM, so the control
 * renders only for an operator holding `membership_activation` — and that is
 * presentation only. The action behind it, `setMembershipStatusAction`, calls
 * `requireCapability` itself, so a request that never rendered this page is
 * refused identically. A hidden control is a courtesy; the boundary is in the
 * action.
 *
 * Resolving an onboarding item is deliberately not privileged. UX-21's audience
 * is "Authorized roster operator": marking the kit sorted is roster work, and
 * only changing status is the Exec's to make.
 */
export default async function MembershipPage({
  params,
  searchParams,
}: PageProps<"/operate/roster/[membershipId]">) {
  const { membershipId } = await params;
  const query = await searchParams;

  const gate = await gateShellPage(`/operate/roster/${membershipId}`);
  if ("screen" in gate) return gate.screen;

  let membership: MembershipRecord;
  try {
    membership = await readMembership(membershipId);
  } catch (error) {
    // A membership that is not there is a 404, whatever the service called it.
    // Anything that is not a service error is a fault, and belongs in the error
    // boundary as itself rather than dressed up as a missing record.
    if (!isServiceError(error)) throw error;
    notFound();
  }

  const justCreated = query.created === "1";
  const mayActivate = operatorHasCapability(gate.operator, "membership_activation");
  const { status } = membership;

  return (
    <Stack spacing={3} sx={{ maxWidth: 1080 }}>
      <Box>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          {justCreated ? "Returning player added" : membership.displayName}
        </Typography>
        {justCreated ? (
          <Typography color="text.secondary" sx={{ mt: 1 }} data-testid="created-summary">
            Person and {membership.seasonLabel} membership were created together.
          </Typography>
        ) : (
          <Typography color="text.secondary" sx={{ mt: 1 }} data-testid="membership-subtitle">
            {`${membership.seasonLabel} membership · ${labelFor(ENTRY_LABELS, membership.entry)} · ${labelFor(
              MEMBERSHIP_STATUS_LABELS,
              status,
            )}`}
          </Typography>
        )}
      </Box>

      {justCreated ? (
        <Alert severity="success">
          The confirmation identifies the resulting person and membership. Raw contact values are
          retained as entered.
        </Alert>
      ) : null}

      {/* The three facts UX-21 leads with, before any detail. */}
      {/*
        No `divider` prop on this Stack, and none on the onboarding list below.
        MUI v9's Stack renders that prop through something this project's server
        build resolves to `undefined`, so every full server render of this page
        threw "Element type is invalid ... got: undefined" and returned 500 —
        while clicking through from the roster worked, because client-side
        navigation renders in the browser instead. That is why it looked
        intermittent and why nothing else broke: this is the only page in the
        repository that used `divider`. Separators are drawn explicitly now.
      */}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <Headline
          value={labelFor(MEMBERSHIP_STATUS_LABELS, status)}
          label="Membership"
          colour={membershipStatusColour(status)}
        />
        <Headline
          // `RESOLVED_ITEM_STATUSES` rather than naming the two unresolved ones:
          // a fifth unresolved status added to the enum later would otherwise
          // start counting as resolved here and nowhere else.
          value={`${membership.onboardingItems.filter((item) => RESOLVED_ITEM_STATUSES.includes(item.status)).length} of ${membership.onboardingItems.length}`}
          label="Onboarding items resolved"
        />
        <Headline value={labelFor(ENTRY_LABELS, membership.entry)} label="Entry" />
      </Stack>

      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
        <Box
          sx={{
            display: "grid",
            gap: 3,
            gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
          }}
        >
          <Section title="Person">
            <Typography sx={{ fontWeight: 600 }}>{membership.displayName}</Typography>
            {membership.displayAlias ? (
              <Typography variant="body2" color="text.secondary">
                Known as {membership.displayAlias}
              </Typography>
            ) : null}
          </Section>

          <Section title="Contact">
            {membership.contacts.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No contact detail recorded.
              </Typography>
            ) : (
              membership.contacts.map((contact) => (
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
              {membership.seasonLabel} · {labelFor(MEMBERSHIP_STATUS_LABELS, status)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Entry: {labelFor(ENTRY_LABELS, membership.entry)}
            </Typography>
            {membership.confirmedOn ? (
              <Typography variant="body2" color="text.secondary">
                Confirmed {formatDay(membership.confirmedOn)}
              </Typography>
            ) : null}
            {membership.activatedOn ? (
              <Typography variant="body2" color="text.secondary">
                Activated {formatDay(membership.activatedOn)}
              </Typography>
            ) : null}
            {membership.inactivityLabel ? (
              <Typography variant="body2" color="text.secondary">
                Inactive: {membership.inactivityLabel}
              </Typography>
            ) : null}
          </Section>

          {/*
            No "Audit" section here.

            It said the same thing the Status history panel says at the foot of
            the page — who created the membership and when — and Brian's verdict
            on the real screen was that audit appeared twice and belonged at the
            bottom only. The history panel is the record; this grid is the
            person and the membership.
          */}
        </Box>
      </Paper>

      {/* Onboarding — the state activation asks about. */}
      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }} data-testid="onboarding-panel">
        <Typography variant="overline" color="text.secondary" component="h2">
          Onboarding items
        </Typography>

        {membership.onboardingItems.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            This season has no onboarding items configured, so this membership has none.
          </Typography>
        ) : (
          <Stack spacing={2} sx={{ mt: 2 }}>
            {membership.onboardingItems.map((item, index) => (
              <Box key={item.id}>
                {index > 0 ? <Divider sx={{ mb: 2 }} /> : null}
                <OnboardingRow item={item} membershipId={membership.membershipId} />
              </Box>
            ))}
          </Stack>
        )}

        {membership.outstandingRequired.length > 0 ? (
          <Alert severity="info" sx={{ mt: 2 }} data-testid="outstanding-note">
            {`${membership.outstandingRequired.length === 1 ? "One required item is" : `${membership.outstandingRequired.length} required items are`} still outstanding. This does not stop the membership's status from being changed.`}
          </Alert>
        ) : null}
      </Paper>

      {/* The one status control this record offers — LAN-186's owner walkthrough. */}
      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }} data-testid="transitions-panel">
        <Typography variant="overline" color="text.secondary" component="h2">
          Membership status
        </Typography>

        {mayActivate ? (
          <Box sx={{ mt: 2, maxWidth: 280 }}>
            <MembershipStatusControl membershipId={membership.membershipId} status={status} />
          </Box>
        ) : (
          <Alert severity="info" sx={{ mt: 2 }} data-testid="activation-not-permitted">
            Changing a membership&rsquo;s status is available only to the Exec and the General
            Manager.
          </Alert>
        )}
      </Paper>

      {/* Status history — the typed record, read rather than summarised. */}
      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }} data-testid="status-history">
        <Typography variant="overline" color="text.secondary" component="h2">
          Status history
        </Typography>
        {membership.statusHistory.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            No recorded transition for this membership.
          </Typography>
        ) : (
          <Stack spacing={1.5} sx={{ mt: 2 }}>
            {membership.statusHistory.map((event) => (
              <HistoryRow
                key={`${event.toStatus}-${event.occurredAt.toISOString()}`}
                event={event}
              />
            ))}
          </Stack>
        )}
      </Paper>

      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ alignItems: { sm: "center" } }}
      >
        <Button href="/operate/roster" variant="contained" sx={{ minHeight: 44 }}>
          Back to roster
        </Button>
      </Stack>
    </Stack>
  );
}

function Headline({
  value,
  label,
  colour,
}: {
  value: string;
  label: string;
  colour?: "default" | "info" | "success" | "warning";
}) {
  return (
    <Box>
      {colour ? (
        <Chip label={value} color={colour} />
      ) : (
        <Typography variant="h6" component="p" sx={{ fontWeight: 700 }}>
          {value}
        </Typography>
      )}
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5 }}>
        {label}
      </Typography>
    </Box>
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

/**
 * One onboarding item: what it is, where it stands, and how to move it.
 *
 * The subscription item says in words that it never gates activation, because
 * register D10 is a rule an operator has to be able to *see* — "subs paid,
 * outstanding" beside a blocked Activate button would teach exactly the wrong
 * lesson about how this club works.
 */
function OnboardingRow({ item, membershipId }: { item: OnboardingItem; membershipId: string }) {
  return (
    <Box data-testid="onboarding-item">
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        sx={{ justifyContent: "space-between", alignItems: { sm: "baseline" } }}
      >
        <Box>
          <Typography sx={{ fontWeight: 600 }}>{item.label}</Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 0.5, flexWrap: "wrap", gap: 0.5 }}>
            <Chip size="small" label={labelFor(ONBOARDING_ITEM_LABELS, item.status)} />
            {item.isRequired ? <Chip size="small" variant="outlined" label="Required" /> : null}
            {item.isSubscription ? (
              <Chip size="small" variant="outlined" label="Never blocks activation" />
            ) : null}
          </Stack>
        </Box>
        <Box sx={{ minWidth: { sm: 320 } }}>
          <OnboardingItemForm membershipId={membershipId} item={item} />
        </Box>
      </Stack>

      {item.completedOn ? (
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5 }}>
          Completed {formatDay(item.completedOn)}
        </Typography>
      ) : null}
      {item.waivedReason ? (
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5 }}>
          Waived by {item.waivedByName ?? "an operator"} — {item.waivedReason}
        </Typography>
      ) : null}
    </Box>
  );
}

/** One transition, in the club's words, naming who caused it. */
function HistoryRow({ event }: { event: MembershipStatusEvent }) {
  const from = event.fromStatus
    ? labelFor(MEMBERSHIP_STATUS_LABELS, event.fromStatus)
    : "Created as";
  const to = labelFor(MEMBERSHIP_STATUS_LABELS, event.toStatus);

  return (
    <Box>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {event.fromStatus ? `${from} → ${to}` : `${from} ${to.toLowerCase()}`}
      </Typography>
      <Typography variant="caption" color="text.secondary" component="p">
        <time dateTime={event.occurredAt.toISOString()}>{formatWhen(event.occurredAt)}</time>
        {" · "}
        {event.actorName ?? event.actorLabel ?? "a named process"}
      </Typography>
      {event.reason ? (
        <Typography variant="caption" color="text.secondary" component="p">
          {event.reason}
        </Typography>
      ) : null}
    </Box>
  );
}
