"use client";

/**
 * **Messaging safety** — the last section of the Messaging schedule page.
 * LAN-394, Brian 17 September 2026, rearranged after his first visual pass of
 * 18 September and re-dressed after his second the same day.
 *
 * "This is an emergency page. When I get here I need to work immediately."
 * Two jobs, in this order: stop a runaway, then find and clear a blockage. The
 * order and the content are his — status and control, how many were sent, what
 * is waiting, who is held back, then the limits and the history. There is no
 * "send all now", no "clear counters" and no override, because none of those
 * is a thing anybody decided the club should be able to do.
 *
 * The dress is not this section's own. "The UX at the top is completely
 * invented. We should find UX we already use in the app and do that." So every
 * element here is a component the application already uses somewhere else: the
 * page's own `Section`, `Fact`/`FactList` label–value rows as on every record,
 * `StatusChip` from the one status vocabulary, `ChoiceField`/`Field`/
 * `ActionBar` exactly as the Messaging schedule form above it, and `RowCard`
 * for a person line as on the roster and Administration boards. Nothing is
 * coloured by a panel of its own; the one coloured thing is the chip, in the
 * semantic colours it already owns.
 *
 * At 375px every row stacks and every control is full width, which is what
 * those components already do.
 */

import { useActionState, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MuiLink from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { ActionBar } from "@/components/action-bar";
import { Fact, FactGrid, FactList } from "@/components/fact";
import { ChoiceField, Field } from "@/components/field";
import { RowCard, RowCardList } from "@/components/row-card";
import { Section } from "@/components/section";
import { StatusChip } from "@/components/status-chip";
import { Outcome as AdminOutcome, useOutcomeSlot } from "@/components/outcome-slot";
import type { MessagingSafetyStatus, SafetyHoldRow } from "@/lib/services/messaging-safety";
import { EMPTY_ADMIN_ACTION_STATE } from "../action-state";
import { pauseMessagingAction, resumeMessagingAction } from "./safety-actions";
import {
  AUDIT_HEADING,
  BY_LABEL,
  CONTROL_ANCHOR,
  DUE_NOW_LABEL,
  formatMoment,
  heldBackRows,
  HOLD_NOTE_LABEL,
  HOLD_SINCE_LABEL,
  HOLDING_LABEL,
  HOLDS_ANCHOR,
  HOLDS_HEADING,
  holdLabel,
  holdPersonHref,
  holdWhy,
  LAST_CHANGE_LABEL,
  NO_AUDIT,
  NO_HOLDS,
  NOTHING_HOLDING,
  PAUSE_LABEL,
  PAUSE_REASON_LABEL,
  queueLabel,
  RATE_CHIP_LABELS,
  RATE_CHIP_STATUS,
  rateValue,
  REASON_LABEL,
  REASON_NOTES_LABEL,
  REASON_PRESETS,
  RESUME_LABEL,
  RESUME_REASON_LABEL,
  RESUME_SCOPE_LABEL,
  SAFETY_NORMAL_SENTENCE,
  SAFETY_SECTION_HEADING,
  SAFETY_STATE_LABELS,
  safetyBlockers,
  SENT_HEADING,
  sentRows,
  SHARED_DESTINATION_LABEL,
  STATUS_HEADING,
  STATUS_LABEL,
  THRESHOLDS_SUMMARY,
  WAITING_HEADING,
} from "./safety-presentation";

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

/**
 * The global PAUSE / RESUME pair, in the page's own form idiom — the same
 * `ChoiceField`, `Field` and `ActionBar` the Messaging schedule rows above it
 * use. Exactly one of the two is offered.
 */
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
      <Stack spacing={2}>
        <ReasonFields label={paused ? RESUME_REASON_LABEL : PAUSE_REASON_LABEL} />
        <ActionBar
          sticky={false}
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
        {/* The one sentence, under the button the person is about to press. */}
        <Typography variant="body2" color="text.secondary">
          {SAFETY_NORMAL_SENTENCE}
        </Typography>
        {slot.showing ? <AdminOutcome state={state} /> : null}
      </Stack>
    </Box>
  );
}

/** What is happening, why, who, when — and the one control, in the same block. */
function StatusSection({
  status,
  mayControl,
}: {
  status: MessagingSafetyStatus;
  mayControl: boolean;
}) {
  return (
    <Section title={STATUS_HEADING} headingLevel={3}>
      <Stack
        spacing={2}
        id={CONTROL_ANCHOR}
        sx={{ scrollMarginTop: 96 }}
        data-testid="safety-status-block"
      >
        <FactList>
          <Fact
            layout="inline"
            dense
            label={STATUS_LABEL}
            value={
              <StatusChip
                domain="messagingSafety"
                status={status.state}
                label={SAFETY_STATE_LABELS[status.state]}
                testId="safety-state"
              />
            }
          />
          {/* An absent reason or operator reads "not recorded" in the one style
              the application uses for it, never blank and never a dash. */}
          <Fact layout="inline" dense label={REASON_LABEL} value={status.pausedReason} />
          <Fact layout="inline" dense label={BY_LABEL} value={status.pausedByName} />
          <Fact
            layout="inline"
            dense
            label={LAST_CHANGE_LABEL}
            value={formatMoment(status.pausedAt ?? status.lastChangeAt)}
          />
        </FactList>
        {mayControl ? <GlobalControl status={status} /> : null}
      </Stack>
    </Section>
  );
}

/** How many were sent, in three windows, each against the ceiling that governs it. */
function SentSection({ status }: { status: MessagingSafetyStatus }) {
  return (
    <Section title={SENT_HEADING} headingLevel={3}>
      <FactList>
        {sentRows(status).map((row) => (
          <Fact
            key={row.key}
            layout="inline"
            dense
            label={row.label}
            testId={`safety-rate-${row.key}`}
            value={
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                <Typography variant="body2">{rateValue(row)}</Typography>
                {row.severity === "neutral" ? null : (
                  <StatusChip
                    domain="messagingSafety"
                    status={RATE_CHIP_STATUS[row.severity]}
                    label={RATE_CHIP_LABELS[row.severity]}
                  />
                )}
              </Stack>
            }
          />
        ))}
      </FactList>
    </Section>
  );
}

/** What is due, what is blocking it, and the act that clears each one. */
function WaitingSection({
  status,
  mayControl,
}: {
  status: MessagingSafetyStatus;
  mayControl: boolean;
}) {
  const blockers = safetyBlockers(status, mayControl);

  return (
    <Section title={WAITING_HEADING} headingLevel={3}>
      <FactList>
        <Fact
          layout="inline"
          dense
          label={DUE_NOW_LABEL}
          value={queueLabel(status.dueWaiting, status.oldestDueMinutes)}
          emphasis={status.queueWarning}
          testId="safety-due"
        />

        {blockers.length === 0 ? (
          <Fact
            layout="inline"
            dense
            label={HOLDING_LABEL}
            value={NOTHING_HOLDING}
            testId="safety-nothing-blocking"
          />
        ) : (
          blockers.map((blocker) => (
            <Fact
              key={blocker.id}
              layout="inline"
              dense
              label={blocker.label}
              testId="safety-blocker"
              value={
                blocker.href ? (
                  <MuiLink component={Link} href={blocker.href} variant="body2">
                    {blocker.value}
                  </MuiLink>
                ) : (
                  blocker.value
                )
              }
            />
          ))
        )}

        {/* Secondary, and deliberately quiet: three counts that say what the
            queue is made of once the two rows above have been read. */}
        <Fact
          layout="inline"
          dense
          label="Messages held back"
          value={status.heldBySafety === 0 ? "None" : String(status.heldBySafety)}
          testId="safety-held-count"
        />
        <Fact
          layout="inline"
          dense
          label="Scheduled later"
          value={status.scheduledAhead === 0 ? "None" : String(status.scheduledAhead)}
        />
        <Fact
          layout="inline"
          dense
          label="Outcome unknown"
          value={
            status.unresolvedAttempts === 0
              ? "None"
              : `${status.unresolvedAttempts} — oldest ${status.oldestUnresolvedMinutes} min`
          }
          testId="safety-unresolved"
        />
      </FactList>
    </Section>
  );
}

/** One person line per held person or number, each with its own resume. */
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
          <RowCardList at="all">
            {held.map((hold) => {
              const href = holdPersonHref(hold);
              const name = holdLabel(hold);
              return (
                <RowCard
                  key={hold.scopeId}
                  testId={`safety-hold-${hold.kind}`}
                  title={
                    href ? (
                      <MuiLink component={Link} href={href}>
                        {name}
                      </MuiLink>
                    ) : (
                      name
                    )
                  }
                  sublines={[
                    <FactGrid key="facts" columns={2}>
                      <Fact label={REASON_LABEL} value={holdWhy(hold)} />
                      <Fact label={HOLD_SINCE_LABEL} value={formatMoment(hold.since)} />
                      {hold.shared ? (
                        <Fact label={HOLD_NOTE_LABEL} value={SHARED_DESTINATION_LABEL} />
                      ) : null}
                    </FactGrid>,
                  ]}
                  actions={mayControl ? <ResumeScopeForm hold={hold} /> : undefined}
                  actionWidth={320}
                />
              );
            })}
          </RowCardList>
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

      <StatusSection status={status} mayControl={mayControl} />
      <SentSection status={status} />
      <WaitingSection status={status} mayControl={mayControl} />
      <HeldBackSection status={status} mayControl={mayControl} />

      <Section title={THRESHOLDS_SUMMARY} collapsible headingLevel={3}>
        <FactList>
          {status.thresholds.map((row) => (
            <Fact
              key={row.control}
              layout="inline"
              dense
              label={row.control}
              value={`${row.value} — ${row.effect}`}
            />
          ))}
          <Fact
            layout="inline"
            dense
            label="Used, last 5 minutes"
            value={String(status.admittedInPacingWindow)}
          />
          <Fact
            layout="inline"
            dense
            label="Used, last hour"
            value={String(status.admittedInHour)}
          />
          <Fact
            layout="inline"
            dense
            label="Used, last 24 hours"
            value={String(status.admittedInDay)}
          />
          <Fact
            layout="inline"
            dense
            label="Used, last 7 days"
            value={String(status.admittedInWeek)}
          />
          <Fact layout="inline" dense label="Set by" value={status.policyDecision} />
        </FactList>
      </Section>

      <Section title={AUDIT_HEADING} headingLevel={3}>
        {status.audit.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {NO_AUDIT}
          </Typography>
        ) : (
          <FactList>
            {status.audit.map((entry) => (
              <Fact
                key={entry.id}
                layout="inline"
                dense
                label={formatMoment(entry.occurredAt)}
                value={`${entry.action === "messaging_safety.paused" ? "Paused" : "Resumed"} — ${entry.actorName}`}
              />
            ))}
          </FactList>
        )}
      </Section>
    </Stack>
  );
}
