"use client";

/**
 * **Messaging safety** — the last section of the Messaging schedule page.
 * LAN-394, Brian 17 September 2026.
 *
 * Its contents and their order are the approved UX contract's, exactly: the
 * current state, the one sentence, what is waiting, the limits and current use
 * behind a disclosure, the two controls, the active holds, and the recent
 * changes. There is no "send all now", no "clear counters" and no override,
 * because none of those is a thing anybody decided the club should be able to
 * do.
 *
 * At 375px every row stacks and every control is full width. The holds are a
 * list of cards rather than a table for the reason every other phone surface
 * here uses cards: a table with four columns at 375px is either scrolled
 * sideways or unreadable, and this is the screen somebody opens in a hurry.
 */

import { useActionState, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { ActionBar } from "@/components/action-bar";
import { Field } from "@/components/field";
import { Notice } from "@/components/notice";
import { Section } from "@/components/section";
import { Outcome as AdminOutcome, useOutcomeSlot } from "@/components/outcome-slot";
import type { MessagingSafetyStatus, SafetyHoldRow } from "@/lib/services/messaging-safety";
import { EMPTY_ADMIN_ACTION_STATE } from "../action-state";
import { pauseMessagingAction, resumeMessagingAction } from "./safety-actions";
import {
  AUDIT_HEADING,
  HOLDS_HEADING,
  holdLabel,
  NO_AUDIT,
  NO_HOLDS,
  PAUSE_LABEL,
  PAUSE_REASON_LABEL,
  queueLabel,
  RESUME_LABEL,
  RESUME_REASON_LABEL,
  RESUME_SCOPE_LABEL,
  SAFETY_NORMAL_SENTENCE,
  SAFETY_REASON_LABELS,
  SAFETY_SECTION_HEADING,
  SAFETY_STATE_LABELS,
  SHARED_DESTINATION_LABEL,
  THRESHOLDS_SUMMARY,
} from "./safety-presentation";

/** One label and one value, stacked at 375px and side by side above it. */
function Line({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={{ xs: 0, sm: 2 }}
      sx={{ justifyContent: "space-between", alignItems: { sm: "baseline" } }}
      data-testid={testId}
    >
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 500 }}>
        {value}
      </Typography>
    </Stack>
  );
}

function when(value: Date | string | null): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** One scope's own RESUME, with its own reason and its own version. */
function ResumeScopeForm({ hold }: { hold: SafetyHoldRow }) {
  const slot = useOutcomeSlot(`resume-${hold.scopeId}`);
  const [state, action, pending] = useActionState(resumeMessagingAction, EMPTY_ADMIN_ACTION_STATE);
  const [open, setOpen] = useState(false);

  return (
    <Box component="form" action={action} onSubmit={() => slot.claim()}>
      <input type="hidden" name="scopeId" value={hold.scopeId} />
      <input type="hidden" name="version" value={hold.version} />
      <Stack spacing={1}>
        {open ? (
          <>
            <Field label={RESUME_REASON_LABEL} name="reason" multiline minRows={2} autoFocus />
            <ActionBar
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
        <Field
          label={paused ? RESUME_REASON_LABEL : PAUSE_REASON_LABEL}
          name="reason"
          multiline
          minRows={2}
        />
        <ActionBar
          primary={
            <Button
              type="submit"
              variant="contained"
              disabled={pending}
              sx={{ minHeight: 44 }}
              data-testid={paused ? "safety-resume" : "safety-pause"}
            >
              {paused ? RESUME_LABEL : PAUSE_LABEL}
            </Button>
          }
        />
        {slot.showing ? <AdminOutcome state={state} /> : null}
      </Stack>
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

      <Section title="State" headingLevel={3}>
        <Stack spacing={1}>
          <Line label="Now" value={SAFETY_STATE_LABELS[status.state]} testId="safety-state" />
          {status.pausedByName ? <Line label="Paused by" value={status.pausedByName} /> : null}
          {status.pausedReason ? <Line label="Reason" value={status.pausedReason} /> : null}
          <Line label="Last change" value={when(status.lastChangeAt)} />

          {/* The one sentence. */}
          <Typography variant="body2" color="text.secondary">
            {SAFETY_NORMAL_SENTENCE}
          </Typography>

          {status.capacityWarning ? (
            <Notice severity="warning" testId="safety-capacity-warning">
              {`Capacity warning — ${status.admittedInDay} messages in the last 24 hours.`}
            </Notice>
          ) : null}
          {status.queueWarning ? (
            <Notice severity="warning" testId="safety-queue-warning">
              {`Queue warning — oldest message waiting ${status.oldestDueMinutes} min.`}
            </Notice>
          ) : null}
        </Stack>
      </Section>

      <Section title="Waiting" headingLevel={3}>
        <Stack spacing={1}>
          <Line
            label="Due now"
            value={queueLabel(status.dueWaiting, status.oldestDueMinutes)}
            testId="safety-due"
          />
          <Line
            label="Held by safety"
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
      </Section>

      <Section title={THRESHOLDS_SUMMARY} collapsible headingLevel={3}>
        <Stack spacing={1}>
          {status.thresholds.map((row) => (
            <Line key={row.control} label={row.control} value={`${row.value} — ${row.effect}`} />
          ))}
          <Line label="Used, last 5 minutes" value={String(status.admittedInPacingWindow)} />
          <Line label="Used, last 24 hours" value={String(status.admittedInDay)} />
          <Line label="Used, last 7 days" value={String(status.admittedInWeek)} />
          <Line label="Set by" value={status.policyDecision} />
        </Stack>
      </Section>

      {mayControl ? (
        <Section title="Controls" headingLevel={3}>
          <GlobalControl status={status} />
        </Section>
      ) : null}

      <Section title={HOLDS_HEADING} headingLevel={3}>
        {status.holds.length === 0 ? (
          <Typography variant="body2" color="text.secondary" data-testid="safety-no-holds">
            {NO_HOLDS}
          </Typography>
        ) : (
          <Stack spacing={2} divider={<Box sx={{ borderTop: 1, borderColor: "divider" }} />}>
            {status.holds.map((hold) => (
              <Stack key={hold.scopeId} spacing={0.5} data-testid={`safety-hold-${hold.kind}`}>
                <Line
                  label={hold.kind === "provider" ? "Provider" : "Held"}
                  value={holdLabel(hold)}
                />
                <Line label="Since" value={when(hold.since)} />
                {hold.reasonCode ? (
                  <Line label="Why" value={SAFETY_REASON_LABELS[hold.reasonCode]} />
                ) : null}
                {hold.cooldownUntil ? (
                  <Line label="Until" value={when(hold.cooldownUntil)} />
                ) : null}
                {hold.shared ? <Line label="Note" value={SHARED_DESTINATION_LABEL} /> : null}
                {mayControl && hold.kind !== "provider" ? <ResumeScopeForm hold={hold} /> : null}
              </Stack>
            ))}
          </Stack>
        )}
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
                label={when(entry.occurredAt)}
                value={`${entry.action === "messaging_safety.paused" ? "Paused" : "Resumed"} — ${entry.actorName}`}
              />
            ))}
          </Stack>
        )}
      </Section>
    </Stack>
  );
}
