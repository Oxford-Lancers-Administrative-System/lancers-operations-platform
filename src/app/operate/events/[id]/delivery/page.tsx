import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Fact, FactGrid } from "@/components/fact";
import { Metric, MetricRow } from "@/components/metric";
import { EmptyState } from "@/components/empty-state";
import { StatusChip } from "@/components/status-chip";
import { OutcomeSlotProvider } from "@/components/outcome-slot";
import { RowCard, RowCardList, DesktopOnly } from "@/components/row-card";
import { TableFrame } from "@/components/sortable-header";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { isServiceError } from "@/lib/db";
import { UnavailableScreen } from "@/app/operate/unavailable";
import {
  MAX_ATTEMPTS,
  readEventDelivery,
  readEventDeliveryDiagnostics,
  type DeliveryRow,
  type DiagnosticsAttempt,
  type EventDelivery,
} from "@/lib/services/delivery";
import { gateShellPage } from "../../../gate";
import DeliveryFilters from "./delivery-filters";
import { RetryDeliveryForm, RevokeAndReissueForm } from "./repair-forms";
import {
  deliveryRowLabel,
  describeRetryability,
  DIAGNOSTICS_HEADING,
  FALLBACK_NOTE,
  FALLBACK_VALUE,
  formatAttemptTime,
  matchesAttemptStatusFilter,
  matchesStatusFilter,
  NEEDS_ATTENTION_HEADING,
  NEEDS_ATTENTION_NOTE,
  NO_ACTION_NEEDED,
  OPEN_THEIR_RECORD,
  OVERVIEW_FACTS,
  REPAIR_HEADING,
  SAFE_REASON_PREFIX,
  TOKEN_LABELS,
  VIEW_DIAGNOSTICS,
} from "./presentation";

/**
 * Delivery — UX-50, UX-51 and UX-52. LAN-78.
 *
 * ## Why three screens are one route
 *
 * `docs/ux/slice-ux.md`'s registry gives all three
 * `/operate/events/[id]/delivery`, which is not an oversight: they are one
 * record at three depths. `?view=diagnostics` opens the per-invitee table and
 * `?invitation=` opens one invitee's repair panel. The same device LAN-76 used
 * for UX-33 and LAN-77 for UX-40 to UX-43.
 *
 * ## Everything renders from stored rows
 *
 * The page reads `readEventDelivery`, which derives all five operator states
 * from `notification_jobs`, `delivery_attempts` and `delivery_results` in one
 * transaction. Nothing is passed from the browser and nothing is cached in a
 * component, so a retry that succeeded on another operator's screen is visible
 * on the next render here.
 *
 * ## What is deliberately not in the payload
 *
 * No phone number, no RSVP link, no token, no provider credential and no raw
 * provider body. The failure text an operator reads has already been mapped to
 * a safe sentence and digit-redacted by the adapter. A screen that showed the
 * link would be the manual-send path readmitted through the back door.
 *
 * ## Authorization
 *
 * Gated on `delivery_administration`, so an operator without it gets UX-05 and
 * **no delivery data reaches the response at all** — the read happens after the
 * gate returns, not before it. The two repair actions guard themselves again
 * server-side regardless.
 */
export default async function DeliveryPage({
  params,
  searchParams,
}: PageProps<"/operate/events/[id]/delivery">) {
  const gate = await gateShellPage("/operate/events", "delivery_administration");
  if ("screen" in gate) return gate.screen;

  const { id } = await params;
  const query = await searchParams;
  const view = typeof query.view === "string" ? query.view : "";
  const selected = typeof query.invitation === "string" ? query.invitation : "";
  const search = typeof query.q === "string" ? query.q : "";
  const status = typeof query.status === "string" ? query.status : "";

  let delivery: EventDelivery;
  try {
    delivery = await readEventDelivery(id);
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return (
      <UnavailableScreen title="Delivery" message={error.message} testId="delivery-unavailable">
        <Box>
          <Button variant="outlined" href="/operate/events">
            Back to events
          </Button>
        </Box>
      </UnavailableScreen>
    );
  }

  const basePath = `/operate/events/${id}/delivery`;

  const chosen = selected
    ? (delivery.rows.find((row) => row.invitationId === selected) ?? null)
    : null;

  if (chosen) {
    return (
      <DeliveryLayout delivery={delivery} basePath={basePath}>
        <RepairPanel eventId={id} delivery={delivery} row={chosen} />
      </DeliveryLayout>
    );
  }

  if (view === "diagnostics") {
    // A second read rather than folding attempts into `readEventDelivery`:
    // that reader is scoped to `job_type = 'invitation'` on purpose (the
    // overview counts an *invitation*, once, per invitee) and this one is
    // scoped to nothing — every job type, every attempt, R15's evidence.
    // Widening the first to carry both would mean one row sometimes meaning
    // an invitee and sometimes meaning an attempt.
    const attempts = await readEventDeliveryDiagnostics(id);
    return (
      <DeliveryLayout delivery={delivery} basePath={basePath}>
        <Diagnostics
          delivery={delivery}
          attempts={attempts}
          basePath={basePath}
          search={search}
          status={status}
        />
      </DeliveryLayout>
    );
  }

  return (
    <DeliveryLayout delivery={delivery} basePath={basePath}>
      <Overview delivery={delivery} basePath={basePath} />
    </DeliveryLayout>
  );
}

/** The heading and the standing policy note, on every one of the three. */
function DeliveryLayout({
  delivery,
  basePath,
  children,
}: {
  delivery: EventDelivery;
  basePath: string;
  children: React.ReactNode;
}) {
  return (
    <OutcomeSlotProvider>
      <Stack spacing={3} sx={{ maxWidth: 1100 }} data-testid="delivery-screen">
        <PageHeader
          title={`Delivery · ${delivery.eventName}`}
          back={{ href: `/operate/events/${delivery.eventId}`, label: "Back to event" }}
          actions={
            <Button href={basePath} variant="outlined">
              Delivery overview
            </Button>
          }
        />
        {children}
      </Stack>
    </OutcomeSlotProvider>
  );
}

/** UX-50 — the four counts and what the club's delivery actually is. */
function Overview({ delivery, basePath }: { delivery: EventDelivery; basePath: string }) {
  const { counts } = delivery;

  return (
    <Stack spacing={3}>
      <MetricRow columns={4} testId="delivery-counts">
        <Metric value={counts.audience} label="Audience" testId="count-audience" />
        <Metric value={counts.delivered} label="Delivered" testId="count-delivered" />
        <Metric value={counts.queued + counts.attempted} label="Queued" testId="count-queued" />
        <Metric value={counts.failed + counts.retryable} label="Failed" testId="count-failed" />
      </MetricRow>

      {/*
        LAN-156, at the visual gate. A held message is the one state this screen
        exists to make visible, and it had none: the amend screen said messages
        were held and this screen showed them as Queued. The tile appears only
        when there are held messages, so an event nobody has amended is
        unchanged.

        R156-B3. This used to add "Re-notify to send the change", which told
        the operator that Re-notify sends the held message itself. Re-notify
        writes a separate notice job and nothing in the repository ever
        clears `held_at`, so that was a release condition this build does not
        implement. Says only what happened, and stops.
      */}
      {counts.held > 0 ? (
        <Notice severity="warning" testId="delivery-held">
          {counts.held === 1
            ? "1 message is held after a change to this event."
            : `${counts.held} messages are held after a change to this event.`}
        </Notice>
      ) : null}

      {delivery.rows.length === 0 ? (
        // § 9's Empty: distinguish "nothing yet" from "nothing matched". This is
        // system-empty — no invitation job exists for this event.
        //
        // The sentence used to assert the cause ("Invitations and their delivery
        // are created when the event is approved"), which is false on an event
        // that IS approved and whose invitations were never dispatched — the
        // state Brian found. It now says what is true and stops.
        <EmptyState
          title="No invitations have been sent for this event."
          testId="delivery-empty"
          action={{ href: `/operate/events/${delivery.eventId}`, label: "Back to event" }}
        />
      ) : null}

      <FactGrid columns={2}>
        {OVERVIEW_FACTS.map((fact) => (
          <Fact key={fact.label} label={fact.label} value={fact.value} note={fact.note} />
        ))}
      </FactGrid>

      <NeedsAttention delivery={delivery} />

      <Box>
        <Button
          variant="contained"
          href={`${basePath}?view=diagnostics`}
          disabled={delivery.rows.length === 0}
          sx={{ minHeight: 44 }}
        >
          {VIEW_DIAGNOSTICS}
        </Button>
      </Box>
    </Stack>
  );
}

/**
 * W6's own screen: everybody `matchesStatusFilter(row.state, "attention")`
 * selects, and what — if anything — an operator does about each. Brian,
 * 2026-08-25: retries and the email fallback are automatic and offer no
 * action; only a missing route is a person's job, and what it needs is a
 * roster fix rather than a message.
 *
 * Renders nothing when nobody needs attention — an event with every message
 * delivered has nothing here to say, and a heading over an empty list would
 * be a fact about nothing.
 */
function NeedsAttention({ delivery }: { delivery: EventDelivery }) {
  const rows = delivery.rows.filter((row) => matchesStatusFilter(row.state, "attention"));
  if (rows.length === 0) return null;

  return (
    <Section
      title={NEEDS_ATTENTION_HEADING}
      description={NEEDS_ATTENTION_NOTE}
      testId="needs-attention"
    >
      <Stack spacing={2}>
        {/*
          No `divider` prop — MUI v9's `Stack` divider throws during server
          rendering ("Element type is invalid… got: undefined"), a defect
          `participation-table.tsx` already hit and documented. Borders do
          the same job.
        */}
        <Stack spacing={0}>
          {rows.map((row) => (
            <Stack
              key={row.jobId}
              direction={{ xs: "column", sm: "row" }}
              spacing={1}
              sx={{
                py: 1.5,
                justifyContent: "space-between",
                alignItems: { sm: "center" },
                borderBottom: 1,
                borderColor: "divider",
                "&:last-of-type": { borderBottom: 0 },
              }}
              data-testid="needs-attention-row"
            >
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {row.inviteeName}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {row.noUsableRoute
                    ? "No usable contact detail on their record — nothing to retry, nothing to fall back to"
                    : row.whatsappUnresponsive
                      ? "WhatsApp did not deliver · reached by email instead"
                      : row.nextAttemptAt
                        ? `Attempt ${row.attemptCount} of ${MAX_ATTEMPTS} · next attempt ${formatAttemptTime(
                            row.nextAttemptAt,
                          )}`
                        : `Attempt ${row.attemptCount} of ${MAX_ATTEMPTS} used`}
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <StatusChip
                  domain="delivery"
                  status={
                    row.noUsableRoute
                      ? "no_channel"
                      : row.whatsappUnresponsive
                        ? "whatsapp_unresponsive"
                        : row.state
                  }
                  label={deliveryRowLabel(row)}
                  testId="needs-attention-state"
                />
                {row.noUsableRoute && row.seasonMembershipId ? (
                  <Button
                    size="small"
                    variant="outlined"
                    href={`/operate/roster/${row.seasonMembershipId}`}
                  >
                    {OPEN_THEIR_RECORD}
                  </Button>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    {NO_ACTION_NEEDED}
                  </Typography>
                )}
              </Stack>
            </Stack>
          ))}
        </Stack>
      </Stack>
    </Section>
  );
}

/**
 * UX-51 — W6-02's own table, one row per attempt per channel, replacing the
 * per-invitee table this screen drew before OWNER-LAN173-02: Person, Channel,
 * Attempt, When, Outcome, Provider reference, exactly as the mockup draws it,
 * and nothing this screen shows an RSVP column for any more — RSVP stays on
 * the per-invitee overview's own vocabulary instead of being repeated here
 * against data this table was never the RSVP's source of truth for.
 *
 * Includes the automatic email fallback's own attempts, which a per-invitee
 * table could not show at all: that shape is one row per invitee, and a
 * fallback is a second job for the same person, not a second invitee.
 *
 * No message content, ever. Status narrows by the attempt's own recorded
 * outcome ({@link matchesAttemptStatusFilter}) and Search narrows by name, the
 * same two controls W6-02 draws and no others — the mockup's second dropdown,
 * "Entry", is dropped rather than guessed at (OWNER-LAN173-01's reasoning
 * applies here too: no spec text defines what it would filter).
 */
function Diagnostics({
  delivery,
  attempts,
  basePath,
  search,
  status,
}: {
  delivery: EventDelivery;
  attempts: readonly DiagnosticsAttempt[];
  basePath: string;
  search: string;
  status: string;
}) {
  const needle = search.trim().toLowerCase();
  const rows = attempts.filter(
    (attempt) =>
      matchesAttemptStatusFilter(attempt.outcome, status) &&
      (needle === "" || attempt.inviteeName.toLowerCase().includes(needle)),
  );

  return (
    <Section
      title={DIAGNOSTICS_HEADING}
      description={`${delivery.eventName} · ${delivery.counts.audience} intended recipients`}
    >
      <Stack spacing={2}>
        <DeliveryFilters basePath={basePath} search={search} status={status} />

        {rows.length === 0 ? (
          <EmptyState
            testId="attempt-log-empty"
            title={
              attempts.length === 0
                ? "Nothing has been attempted for this event yet."
                : "No attempt matches this search."
            }
            searched={search || undefined}
            action={{ href: `${basePath}?view=diagnostics`, label: "Clear filters" }}
          />
        ) : (
          <DesktopOnly>
            <TableFrame>
              <Table size="small" data-testid="attempt-log-table">
                <TableHead>
                  <TableRow>
                    <TableCell>Person</TableCell>
                    <TableCell>Channel</TableCell>
                    <TableCell>Attempt</TableCell>
                    <TableCell>When</TableCell>
                    <TableCell>Outcome</TableCell>
                    <TableCell>Provider reference</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((attempt) => (
                    <TableRow key={attempt.attemptId} data-testid="attempt-log-row">
                      <TableCell sx={{ fontWeight: 600 }}>{attempt.inviteeName}</TableCell>
                      <TableCell>{describeChannel(attempt.channel)}</TableCell>
                      <TableCell>{attempt.attemptNumber}</TableCell>
                      <TableCell>{formatAttemptTime(attempt.requestedAt)}</TableCell>
                      <TableCell>
                        <StatusChip
                          domain="delivery"
                          status={attempt.outcome}
                          label={describeAttemptOutcome(attempt.outcome)}
                        />
                      </TableCell>
                      <TableCell sx={{ fontFamily: "monospace", fontSize: "0.8em" }}>
                        {attempt.providerReference ?? "not recorded"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableFrame>
          </DesktopOnly>
        )}

        {/* Phone: cards, per § 7. */}
        {rows.length > 0 ? (
          <RowCardList>
            {rows.map((attempt) => (
              <RowCard
                key={attempt.attemptId}
                title={attempt.inviteeName}
                testId="attempt-log-card"
                chips={
                  <StatusChip
                    domain="delivery"
                    status={attempt.outcome}
                    label={describeAttemptOutcome(attempt.outcome)}
                  />
                }
                sublines={[
                  `${describeChannel(attempt.channel)} · attempt ${attempt.attemptNumber} · ${formatAttemptTime(attempt.requestedAt)}`,
                  attempt.providerReference ?? "not recorded",
                ]}
              />
            ))}
          </RowCardList>
        ) : null}
      </Stack>
    </Section>
  );
}

/** The attempt-level outcome, in the same words as the five-state vocabulary. */
function describeAttemptOutcome(outcome: string): string {
  switch (outcome) {
    case "delivered":
      return "Delivered";
    case "failed":
      return "Failed";
    case "rejected":
      return "Failed";
    case "attempted":
      return "Attempted";
    default:
      return "Sent";
  }
}

/** UX-52 — one invitee, what happened, and the two repairs. */
function RepairPanel({
  eventId,
  delivery,
  row,
}: {
  eventId: string;
  delivery: EventDelivery;
  row: DeliveryRow;
}) {
  // The row's own answer, not a re-derivation from the state: Result and Retry
  // are separate axes, so a **Failed** delivery whose cause has been fixed can
  // still be attempted again while attempts remain.
  const retryable = row.retryable;

  return (
    <Section
      title={REPAIR_HEADING}
      description={`${row.inviteeName} · ${delivery.eventName}`}
      testId="repair-panel"
    >
      <Stack spacing={3}>
        <FactGrid columns={2}>
          <Fact
            label="Latest result"
            value={deliveryRowLabel(row)}
            note={
              row.failureReason
                ? `${SAFE_REASON_PREFIX}: ${row.failureReason}`
                : formatAttemptTime(row.lastAttemptAt)
            }
            testId="latest-result"
          />
          <Fact
            label="Retry"
            value={retryable ? "Retryable" : "Not retryable"}
            note={describeRetryability(row.state, row.attemptCount, MAX_ATTEMPTS, retryable)}
            testId="retry-fact"
          />
          <Fact
            label="Token"
            value={TOKEN_LABELS[row.tokenState] ?? row.tokenState}
            note={
              row.tokenState === "live"
                ? "Revoke and reissue available"
                : "A new link is issued with the next attempt"
            }
            testId="token-fact"
          />
          <Fact
            label="Fallback"
            value={FALLBACK_VALUE}
            note={FALLBACK_NOTE}
            testId="fallback-fact"
          />
        </FactGrid>

        <Stack spacing={2} sx={{ maxWidth: 420 }}>
          <RetryDeliveryForm
            eventId={eventId}
            jobId={row.jobId}
            disabled={!retryable}
            disabledReason={describeRetryability(
              row.state,
              row.attemptCount,
              MAX_ATTEMPTS,
              retryable,
            )}
          />
          <RevokeAndReissueForm
            eventId={eventId}
            invitationId={row.invitationId}
            disabled={row.attemptCount >= MAX_ATTEMPTS}
          />
        </Stack>
      </Stack>
    </Section>
  );
}

/** The wireframe's "WhatsApp" and "Email fallback", from the neutral channel. */
function describeChannel(channel: string): string {
  if (channel === "whatsapp") return "WhatsApp";
  if (channel === "email") return "Email fallback";
  if (channel === "sms") return "SMS fallback";
  return channel;
}
