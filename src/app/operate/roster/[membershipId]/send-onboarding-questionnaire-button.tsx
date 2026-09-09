"use client";

import { useState, useTransition } from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import { Notice } from "@/components/notice";
import { useOutcomeSlot } from "@/components/outcome-slot";
import { formatWhen } from "../presentation";
import { recordSendOnboardingQuestionnaireAction } from "./record-actions";

const LABEL = "SEND ONBOARDING QUESTIONNAIRE";
const RESEND_LABEL = "RESEND ONBOARDING QUESTIONNAIRE";

/**
 * `sendOnboardingNudges`'s four outcomes, in the club's words. Requirement 3:
 * "Sent only on provider acceptance, a named refusal otherwise (no consent,
 * no reachable number, delivery not configured), and never a silent failure.
 * Refusals name the reason on the record, not 'could not be completed'."
 *
 * These are the fallbacks. A refused or skipped send carries the dispatcher's
 * own stored sentence back with it (`reason`, read off the job the send just
 * wrote), and that is what the dialog shows whenever there is one — the same
 * provider-neutral text `delivery.ts`'s own delivery page and the queue's
 * `Delivery failed · …` column already show. The walk found why this matters:
 * with delivery unconfigured, the reason on the job named the five missing
 * settings and the fact that it needs the club's administrator, and none of
 * that reached the operator who pressed the button.
 */
const OUTCOME_MESSAGE: Readonly<Record<string, string>> = Object.freeze({
  accepted: "Sent.",
  refused: "Not sent — the delivery attempt was refused.",
  skipped: "Not sent — this player may not be messaged, or delivery is not configured.",
  membership_not_found: "Not sent — this membership is no longer on file.",
});

/**
 * The onboarding record's manual ask — LAN-266, modelled on the recruit
 * record's own SEND buttons (`../../recruitment/[prospectId]/send-questionnaire-button.tsx`)
 * because Brian named that control as the thing onboarding should have.
 *
 * `W2-04`'s reasoning is carried across intact: the button is never natively
 * `disabled` for a gate the operator could act on, because a disabled HTML
 * button fires no `onClick` and so cannot open the dialog that would explain
 * itself. The dialog is what refuses, in words, at the moment of action. The
 * one exception is the recruit record's own exception — a state that already
 * carries its explanation above the button, which here is a membership that
 * is no longer onboarding: there is nothing to chase and the record says so
 * in its own status line, so discovering it one click in would be the gap
 * rather than the fix.
 */
export default function SendOnboardingQuestionnaireButton({
  membershipId,
  displayName,
  everSent,
  canSend,
  withheldReason,
  blocked,
}: {
  membershipId: string;
  displayName: string;
  /** Whether an ask has ever been queued for this player — SEND versus RESEND. */
  everSent: boolean;
  canSend: boolean;
  withheldReason: string | null;
  /** Natively disabled: not onboarding at all, so there is nothing to ask for. */
  blocked: boolean;
}) {
  const slot = useOutcomeSlot("send-onboarding-questionnaire");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    error: string | null;
    outcome: string | null;
    reason: string | null;
  } | null>(null);

  function confirm() {
    slot.claim();
    startTransition(async () => {
      const outcome = await recordSendOnboardingQuestionnaireAction({ membershipId });
      setResult(outcome);
    });
  }

  return (
    <>
      <Button
        variant="contained"
        size="small"
        fullWidth
        disabled={blocked}
        title={blocked && withheldReason ? withheldReason : undefined}
        onClick={() => {
          slot.claim();
          setResult(null);
          setOpen(true);
        }}
        sx={{ minHeight: 44 }}
        data-testid="onboarding-send-questionnaire"
      >
        {everSent ? RESEND_LABEL : LABEL}
      </Button>

      <Dialog open={open} onClose={() => (pending ? undefined : setOpen(false))}>
        <DialogTitle>{LABEL}</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <DialogContentText>
              {everSent
                ? `${displayName} has already been sent their onboarding link. Sending again asks for whatever is still outstanding.`
                : `${displayName} has not been sent their onboarding link yet.`}
            </DialogContentText>
            {!canSend && withheldReason ? (
              <Notice variant="refusal" testId="onboarding-send-questionnaire-refused">
                {withheldReason}
              </Notice>
            ) : null}
            {slot.showing && result?.error ? (
              <Notice severity="error" testId="onboarding-send-questionnaire-error">
                {result.error}
              </Notice>
            ) : null}
            {slot.showing && result && !result.error && result.outcome ? (
              <Notice
                severity={result.outcome === "accepted" ? "success" : "warning"}
                testId="onboarding-send-questionnaire-outcome"
              >
                {result.outcome === "accepted"
                  ? OUTCOME_MESSAGE.accepted
                  : (result.reason ?? OUTCOME_MESSAGE[result.outcome] ?? OUTCOME_MESSAGE.refused)}
              </Notice>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={pending} sx={{ minHeight: 44 }}>
            Close
          </Button>
          <Button
            variant="contained"
            disabled={pending || !canSend}
            onClick={confirm}
            sx={{ minHeight: 44 }}
            data-testid="onboarding-send-questionnaire-confirm"
          >
            {everSent ? "Resend" : "Send"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

/**
 * The status line beneath the button — LAN-266 requirement 2, in two parts
 * because it carries two facts: what was last sent, and where the automatic
 * chase has got to.
 *
 * Every word of the second part comes from the missing-data queue's own
 * `formatChaseNext`, imported rather than reproduced: "the same words the
 * queue already uses" is the requirement, and a second copy of five phrases
 * is exactly the thing that drifts.
 */
export function sendStatusLines(status: {
  lastAsk: { requestedAt: string; delivery: string; reason: string | null } | null;
  /** `formatChaseNext`'s own output for this player, whatever it says. */
  chaseLine: string;
  /** `true` only when that output is a date — the one case a count reads naturally in front of it. */
  chaseIsScheduled: boolean;
  deliveredCount: number;
  chaseCount: number;
}): readonly string[] {
  const lines: string[] = [];
  if (status.lastAsk === null) {
    lines.push("Not sent");
  } else {
    const when = formatWhen(new Date(status.lastAsk.requestedAt));
    // A failure names itself here, on the record, rather than sending the
    // operator to the delivery page to find out why — requirement 3's "the
    // delivery state: queued, delivered, failed **with the reason the delivery
    // page shows**". The reason is the stored, provider-neutral sentence, not
    // one written here.
    lines.push(
      status.lastAsk.delivery === "failed" && status.lastAsk.reason
        ? `Sent ${when} · failed — ${status.lastAsk.reason}`
        : `Sent ${when} · ${status.lastAsk.delivery}`,
    );
  }
  // "Chase 2 of 4 sent · next 12 Sept" — the count and the queue's own Next
  // wording, joined only when there is a date to join it to. Every other
  // state ("Chase exhausted", "No phone number on file", "Delivery failed · …")
  // is the whole of the second line on its own: a count in front of those
  // would only repeat what they already say.
  lines.push(
    status.chaseIsScheduled && status.chaseCount > 0
      ? `Chase ${status.deliveredCount} of ${status.chaseCount} sent · next ${status.chaseLine}`
      : status.chaseLine,
  );
  return lines;
}
