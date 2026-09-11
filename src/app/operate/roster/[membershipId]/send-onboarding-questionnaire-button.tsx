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

/** `sendOnboardingNudges`'s four outcomes (requirement 3); refused/skipped uses the dispatcher's own stored reason. Decision history: missions/intake/M-ONBOARDING-AND-INFORMATION-COMPLETION */
const OUTCOME_MESSAGE: Readonly<Record<string, string>> = Object.freeze({
  accepted: "Sent.",
  refused: "Not sent — the delivery attempt was refused.",
  skipped: "Not sent — this player may not be messaged, or delivery is not configured.",
  membership_not_found: "Not sent — this membership is no longer on file.",
});

/**
 * LAN-266 manual ask, modelled on the recruit SEND buttons — never natively `disabled` (W2-04). Decision history: missions/intake/M-ONBOARDING-AND-INFORMATION-COMPLETION
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

/** LAN-266 requirement 2: last sent, and where the automatic chase has got to (via the queue's `formatChaseNext`). */
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
    // A failure names itself here (requirement 3) instead of sending the operator to the delivery page.
    lines.push(
      status.lastAsk.delivery === "failed" && status.lastAsk.reason
        ? `Sent ${when} · failed — ${status.lastAsk.reason}`
        : `Sent ${when} · ${status.lastAsk.delivery}`,
    );
  }
  // Count joined to the queue's "next" wording only when there's a date; other states stand alone.
  lines.push(
    status.chaseIsScheduled && status.chaseCount > 0
      ? `Chase ${status.deliveredCount} of ${status.chaseCount} sent · next ${status.chaseLine}`
      : status.chaseLine,
  );
  return lines;
}
