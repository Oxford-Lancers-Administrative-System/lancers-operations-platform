"use client";

/**
 * **Messaging safety** — the last section of the Messaging schedule page.
 * LAN-394, Brian 17 September 2026, rearranged after his visual pass of
 * 18 September.
 *
 * "This is an emergency page. When I get here I need to work immediately."
 * Two jobs, in this order: stop a runaway, then find and clear a blockage.
 * The section is the answers to them, top to bottom — one coloured status line
 * with the control beside it, "Is it running away?", "Is it stuck?", the people
 * held back, and only then the limits and the history. There is no "send all
 * now", no "clear counters" and no override, because none of those is a thing
 * anybody decided the club should be able to do.
 *
 * At 375px every row stacks and every control is full width, and the status and
 * its control are the whole of the first screen. The holds are a list of cards
 * rather than a table for the reason every other phone surface here uses cards:
 * a table with four columns at 375px is either scrolled sideways or unreadable,
 * and this is the screen somebody opens in a hurry.
 */

import { useActionState, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MuiLink from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { ActionBar } from "@/components/action-bar";
import { ChoiceField, Field } from "@/components/field";
import { Section } from "@/components/section";
import { Outcome as AdminOutcome, useOutcomeSlot } from "@/components/outcome-slot";
import type { MessagingSafetyStatus, SafetyHoldRow } from "@/lib/services/messaging-safety";
import { EMPTY_ADMIN_ACTION_STATE } from "../action-state";
import { pauseMessagingAction, resumeMessagingAction } from "./safety-actions";
import {
  AUDIT_HEADING,
  CONTROL_ANCHOR,
  DUE_NOW_LABEL,
  formatMoment,
  heldBackRows,
  HOLDS_ANCHOR,
  HOLDS_HEADING,
  holdLabel,
  holdPersonHref,
  holdWhy,
  NO_AUDIT,
  NO_HOLDS,
  NOTHING_BLOCKING,
  PAUSE_LABEL,
  PAUSE_REASON_LABEL,
  queueLabel,
  rateLimitLabel,
  REASON_NOTES_LABEL,
  REASON_PRESETS,
  RESUME_LABEL,
  RESUME_REASON_LABEL,
  RESUME_SCOPE_LABEL,
  RUNAWAY_HEADING,
  runawayRows,
  SAFETY_NORMAL_SENTENCE,
  SAFETY_SECTION_HEADING,
  SAFETY_STATE_LABELS,
  SAFETY_STATE_SEVERITY,
  safetyBlockers,
  SHARED_DESTINATION_LABEL,
  STUCK_HEADING,
  THRESHOLDS_SUMMARY,
  type RateSeverity,
} from "./safety-presentation";

/** One label and one value, stacked at 375px and side by side above it. */
function Line({
  label,
  value,
  testId,
  colour,
  tight = false,
}: {
  label: string;
  value: string;
  testId?: string;
  /** A palette path, for the one value a threshold has turned amber. */
  colour?: string;
  /**
   * Label and value beside each other at every width, rather than pushed to
   * opposite edges of the row. For the status block, where the row is half the
   * page wide and "Reason" a hand's breadth from its own value reads as two
   * unrelated facts.
   */
  tight?: boolean;
}) {
  return (
    <Stack
      direction={tight ? "row" : { xs: "column", sm: "row" }}
      spacing={tight ? 2 : { xs: 0, sm: 2 }}
      sx={{
        justifyContent: tight ? "flex-start" : "space-between",
        alignItems: tight ? "baseline" : { sm: "baseline" },
      }}
      data-testid={testId}
    >
      <Typography
        variant="body2"
        color="text.secondary"
        sx={tight ? { minWidth: 96, flexShrink: 0 } : undefined}
      >
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 500, color: colour }}>
        {value}
      </Typography>
    </Stack>
  );
}

/** The tint a severity sits on, and the colour its number is written in. */
const RATE_COLOURS: Readonly<Record<RateSeverity, { bg: string; border: string; text: string }>> =
  Object.freeze({
    neutral: { bg: "background.paper", border: "divider", text: "text.primary" },
    warning: { bg: "warning.light", border: "warning.main", text: "warning.main" },
    error: { bg: "error.light", border: "error.main", text: "error.main" },
  });

/**
 * The reason, for either control. A preset is a complete reason on its own —
 * the free-text field adds to it and never gates it.
 */
function ReasonFields({ label, autoFocus = false }: { label: string; autoFocus?: boolean }) {
  const [preset, setPreset] = useState("");

  return (
    <Stack spacing={1}>
      <ChoiceField
        label={label}
        name="reasonPreset"
        value={preset}
        onChange={setPreset}
        options={REASON_PRESETS.map((option) => ({ value: option, label: option }))}
        row
      />
      <Field label={REASON_NOTES_LABEL} name="reason" multiline minRows={2} autoFocus={autoFocus} />
    </Stack>
  );
}

/** One scope's own RESUME, with its own reason and its own version. */
function ResumeScopeForm({ hold }: { hold: SafetyHoldRow }) {
  const slot = useOutcomeSlot(`resume-${hold.scopeId}`);
  const [state, action, pending] = useActionState(resumeMessagingAction, EMPTY_ADMIN_ACTION_STATE);
  const [open, setOpen] = useState(false);

  return (
    <Box component="form" action={action} onSubmit={() => slot.claim()} sx={{ minWidth: 0 }}>
      <input type="hidden" name="scopeId" value={hold.scopeId} />
      <input type="hidden" name="version" value={hold.version} />
      <Stack spacing={1}>
        {open ? (
          <>
            <ReasonFields label={RESUME_REASON_LABEL} autoFocus />
            <ActionBar
              sticky={false}
              primary={
                <Button type="submit" variant="contained" size="small" disabled={pending}>
                  {RESUME_SCOPE_LABEL}
                </Button>
              }
              cancel={
                <Button variant="text" size="small" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
              }
            />
          </>
        ) : (
          <Button
            variant="outlined"
            size="small"
            onClick={() => {
              slot.claim();
              setOpen(true);
            }}
            sx={{ minHeight: 44, alignSelf: { xs: "stretch", sm: "flex-start" } }}
            data-testid={`safety-resume-${hold.kind}`}
          >
            {RESUME_SCOPE_LABEL}
          </Button>
        )}
        {slot.showing ? <AdminOutcome state={state} /> : null}
      </Stack>
    </Box>
  );
}

/** The global PAUSE / RESUME pair. Exactly one of them is offered. */
function GlobalControl({ status }: { status: MessagingSafetyStatus }) {
  const paused = status.pausedAt !== null || status.emergencyStopped;
  const slot = useOutcomeSlot("safety-global");
  const [state, action, pending] = useActionState(
    paused ? resumeMessagingAction : pauseMessagingAction,
    EMPTY_ADMIN_ACTION_STATE,
  );

  if (!status.globalScopeId) return null;

  return (
    <Box component="form" action={action} onSubmit={() => slot.claim()}>
      <input type="hidden" name="scopeId" value={status.globalScopeId} />
      <input type="hidden" name="version" value={status.globalVersion} />
      <Stack spacing={1.5}>
        <ReasonFields label={paused ? RESUME_REASON_LABEL : PAUSE_REASON_LABEL} />
        {/*
         * The button in flow rather than in an `ActionBar`: the bar carries a
         * phone-width ground and rule of its own, which inside this coloured
         * block reads as a white seam across it, and a single control on an
         * emergency panel has no foot to sit in.
         */}
        <Button
          type="submit"
          variant="contained"
          disabled={pending}
          sx={{ minHeight: 44, alignSelf: { xs: "stretch", md: "flex-start" } }}
          data-testid={paused ? "safety-resume" : "safety-pause"}
        >
          {paused ? RESUME_LABEL : PAUSE_LABEL}
        </Button>
        {slot.showing ? <AdminOutcome state={state} /> : null}
      </Stack>
    </Box>
  );
}

/** Item 1 and item 2: what is happening, why, who, when — and the one control. */
function StatusAndControl({
  status,
  mayControl,
}: {
  status: MessagingSafetyStatus;
  mayControl: boolean;
}) {
  const severity = SAFETY_STATE_SEVERITY[status.state];

  return (
    <Paper
      variant="outlined"
      sx={{
        p: { xs: 2, md: 3 },
        bgcolor: `${severity}.light`,
        borderColor: `${severity}.main`,
        borderLeftWidth: 8,
        borderLeftStyle: "solid",
        borderLeftColor: `${severity}.main`,
      }}
      data-testid="safety-status-block"
      data-severity={severity}
    >
      <Box
        sx={{
          display: "grid",
          gap: { xs: 2, md: 4 },
          gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) minmax(0, 22rem)" },
          alignItems: "start",
        }}
      >
        <Stack spacing={1} sx={{ minWidth: 0 }}>
          <Typography
            variant="h1"
            component="p"
            sx={{ color: `${severity}.main` }}
            data-testid="safety-state"
          >
            {SAFETY_STATE_LABELS[status.state]}
          </Typography>
          <Stack spacing={0.25}>
            {status.pausedReason ? <Line label="Reason" value={status.pausedReason} tight /> : null}
            {status.pausedByName ? <Line label="By" value={status.pausedByName} tight /> : null}
            <Line
              label="Last change"
              value={formatMoment(status.pausedAt ?? status.lastChangeAt)}
              tight
            />
          </Stack>
        </Stack>

        <Stack spacing={1} id={CONTROL_ANCHOR} sx={{ minWidth: 0, scrollMarginTop: 96 }}>
          {mayControl ? (
            <>
              <GlobalControl status={status} />
              {/* The one sentence, where the person about to press it will read it. */}
              <Typography variant="body2" color="text.secondary">
                {SAFETY_NORMAL_SENTENCE}
              </Typography>
            </>
          ) : null}
        </Stack>
      </Box>
    </Paper>
  );
}

/** Item 3. The runaway tell, and it has to be readable in one glance. */
function RunawaySection({ status }: { status: MessagingSafetyStatus }) {
  return (
    <Section title={RUNAWAY_HEADING} headingLevel={3}>
      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", sm: "repeat(3, minmax(0, 1fr))" },
        }}
      >
        {runawayRows(status).map((row) => {
          const colours = RATE_COLOURS[row.severity];
          return (
            <Paper
              key={row.key}
              variant="outlined"
              sx={{ p: 2, minWidth: 0, bgcolor: colours.bg, borderColor: colours.border }}
              data-testid={`safety-rate-${row.key}`}
              data-severity={row.severity}
            >
              <Typography variant="h2" component="p" sx={{ color: colours.text }}>
                {row.used.toLocaleString("en-GB")}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {row.label}
              </Typography>
              <Typography variant="caption" component="p" color="text.secondary">
                {rateLimitLabel(row.limit)}
              </Typography>
            </Paper>
          );
        })}
      </Box>
    </Section>
  );
}

/** Item 4. What is due, what is blocking it, and the act that clears each one. */
function StuckSection({
  status,
  mayControl,
}: {
  status: MessagingSafetyStatus;
  mayControl: boolean;
}) {
  const blockers = safetyBlockers(status, mayControl);

  return (
    <Section title={STUCK_HEADING} headingLevel={3}>
      <Stack spacing={1.5}>
        <Line
          label={DUE_NOW_LABEL}
          value={queueLabel(status.dueWaiting, status.oldestDueMinutes)}
          testId="safety-due"
          colour={status.queueWarning ? "warning.main" : undefined}
        />

        {blockers.length === 0 ? (
          <Typography variant="body2" data-testid="safety-nothing-blocking">
            {NOTHING_BLOCKING}
          </Typography>
        ) : (
          <Stack spacing={0.75}>
            {blockers.map((blocker) => (
              <Typography key={blocker.id} variant="body1" data-testid="safety-blocker">
                {blocker.text}
                {blocker.action === "" ? null : (
                  <>
                    {" — "}
                    {blocker.href ? (
                      <MuiLink component={Link} href={blocker.href}>
                        {blocker.action}
                      </MuiLink>
                    ) : (
                      blocker.action
                    )}
                  </>
                )}
              </Typography>
            ))}
          </Stack>
        )}

        {/* Secondary, and deliberately quiet: three counts that say what the
            queue is made of once the two questions above have been answered. */}
        <Stack spacing={0.25}>
          <Line
            label="Messages held back"
            value={status.heldBySafety === 0 ? "None" : String(status.heldBySafety)}
            testId="safety-held-count"
          />
          <Line
            label="Scheduled later"
            value={status.scheduledAhead === 0 ? "None" : String(status.scheduledAhead)}
          />
          <Line
            label="Outcome unknown"
            value={
              status.unresolvedAttempts === 0
                ? "None"
                : `${status.unresolvedAttempts} — oldest ${status.oldestUnresolvedMinutes} min`
            }
            testId="safety-unresolved"
          />
        </Stack>
      </Stack>
    </Section>
  );
}

/** Item 5. One card per held person or number, each with its own resume. */
function HeldBackSection({
  status,
  mayControl,
}: {
  status: MessagingSafetyStatus;
  mayControl: boolean;
}) {
  const held = heldBackRows(status);

  return (
    <Box id={HOLDS_ANCHOR} sx={{ scrollMarginTop: 96 }}>
      <Section title={HOLDS_HEADING} headingLevel={3}>
        {held.length === 0 ? (
          <Typography variant="body2" color="text.secondary" data-testid="safety-no-holds">
            {NO_HOLDS}
          </Typography>
        ) : (
          <Stack spacing={1.5}>
            {held.map((hold) => {
              const href = holdPersonHref(hold);
              const name = holdLabel(hold);
              return (
                <Paper
                  key={hold.scopeId}
                  variant="outlined"
                  sx={{ p: 2 }}
                  data-testid={`safety-hold-${hold.kind}`}
                >
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={2}
                    sx={{ justifyContent: "space-between", alignItems: { sm: "flex-start" } }}
                  >
                    <Stack spacing={0.25} sx={{ minWidth: 0, flexGrow: 1 }}>
                      <Typography variant="body1" sx={{ fontWeight: 600 }}>
                        {href ? (
                          <MuiLink component={Link} href={href}>
                            {name}
                          </MuiLink>
                        ) : (
                          name
                        )}
                      </Typography>
                      <Line label="Why" value={holdWhy(hold)} tight />
                      <Line label="Since" value={formatMoment(hold.since)} tight />
                      {hold.shared ? (
                        <Line label="Note" value={SHARED_DESTINATION_LABEL} tight />
                      ) : null}
                    </Stack>
                    {mayControl ? <ResumeScopeForm hold={hold} /> : null}
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
        )}
      </Section>
    </Box>
  );
}

export default function MessagingSafetySection({
  status,
  mayControl,
}: {
  status: MessagingSafetyStatus;
  /** Whether this operator holds `messaging_safety_authority`. The action guards regardless. */
  mayControl: boolean;
}) {
  return (
    <Stack spacing={1.5} id="messaging-safety" data-testid="messaging-safety">
      <Typography variant="h2" component="h2">
        {SAFETY_SECTION_HEADING}
      </Typography>

      <StatusAndControl status={status} mayControl={mayControl} />
      <RunawaySection status={status} />
      <StuckSection status={status} mayControl={mayControl} />
      <HeldBackSection status={status} mayControl={mayControl} />

      <Section title={THRESHOLDS_SUMMARY} collapsible headingLevel={3}>
        <Stack spacing={1}>
          {status.thresholds.map((row) => (
            <Line key={row.control} label={row.control} value={`${row.value} — ${row.effect}`} />
          ))}
          <Line label="Used, last 5 minutes" value={String(status.admittedInPacingWindow)} />
          <Line label="Used, last hour" value={String(status.admittedInHour)} />
          <Line label="Used, last 24 hours" value={String(status.admittedInDay)} />
          <Line label="Used, last 7 days" value={String(status.admittedInWeek)} />
          <Line label="Set by" value={status.policyDecision} />
        </Stack>
      </Section>

      <Section title={AUDIT_HEADING} headingLevel={3}>
        {status.audit.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {NO_AUDIT}
          </Typography>
        ) : (
          <Stack spacing={1}>
            {status.audit.map((entry) => (
              <Line
                key={entry.id}
                label={formatMoment(entry.occurredAt)}
                value={`${entry.action === "messaging_safety.paused" ? "Paused" : "Resumed"} — ${entry.actorName}`}
              />
            ))}
          </Stack>
        )}
      </Section>
    </Stack>
  );
}
